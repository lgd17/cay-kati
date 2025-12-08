// =================== IMPORTS ===================
const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");
const cron = require("node-cron");

// =================== ENV VARS ===================
const CANAL_ID = process.env.CANAL_ID;
const CANAL2_ID = process.env.CANAL2_ID;
const ADMIN_ID = process.env.ADMIN_ID;

// =================== CACHE ===================
let cache = {
  allMessages: [],  // FR + EN mélangés
  messagesCanal2: [],
  lastRefresh: null
};

// =================== UTILITAIRES ===================
async function querySafe(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } catch (err) {
    console.error("❌ Erreur SQL:", err);
    throw err;
  } finally {
    client.release();
  }
}

async function retry(fn, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
      else throw err;
    }
  }
}

async function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("⏰ Timeout dépassé")), ms))
  ]);
}

// =================== CHARGEMENT DB ===================
async function loadMessages() {
  const res = await querySafe("SELECT * FROM message_fixes ORDER BY id");
  cache.allMessages = res.rows;
  cache.lastRefresh = Date.now();

  console.log(`📥 ${cache.allMessages.length} messages (FR + EN) rechargés.`);

  if (bot && ADMIN_ID) {
    await bot.sendMessage(ADMIN_ID, "♻️ Messages rechargés");
  }
}

async function loadMessagesCanal2() {
  const res = await querySafe("SELECT * FROM message_fixes2 ORDER BY id");
  cache.messagesCanal2 = res.rows;
  cache.lastRefresh = Date.now();

  console.log(`📥 ${cache.messagesCanal2.length} messages Canal2 rechargés.`);
}

// Load safe
async function loadMessagesSafe() {
  try { await retry(loadMessages); }
  catch (err) { console.error("❌ Canal1 load error:", err.message); }

  try { await retry(loadMessagesCanal2); }
  catch (err) { console.error("❌ Canal2 load error:", err.message); }
}

// =================== ENVOI ===================
async function sendMessage(msg, canalId) {
  try {
    const text = msg.media_text || "";
    const file = msg.file_id || msg.media_url;

    switch (msg.media_type) {
      case "photo":
        await withTimeout(bot.sendPhoto(canalId, file, { caption: text, parse_mode: "HTML" }));
        break;
      case "video":
        await withTimeout(bot.sendVideo(canalId, file, { caption: text, parse_mode: "HTML" }));
        break;
      case "audio":
        await withTimeout(bot.sendAudio(canalId, file, { caption: text, parse_mode: "HTML" }));
        break;
      case "voice":
        await withTimeout(bot.sendVoice(canalId, file));
        if (text) await withTimeout(bot.sendMessage(canalId, text, { parse_mode: "HTML" }));
        break;
      case "video_note":
        await withTimeout(bot.sendVideoNote(canalId, file));
        if (text) await withTimeout(bot.sendMessage(canalId, text, { parse_mode: "HTML" }));
        break;
      default:
        await withTimeout(bot.sendMessage(canalId, text, { parse_mode: "HTML" }));
        break;
    }

  } catch (err) {
    console.error(`❌ Envoi message ${msg.id} erreur:`, err.message);
  }
}

// =================== ENVOI AUTO (FR/EN PERMUTATION) ===================
async function sendScheduledMessages() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");

  // prendre tous les messages de l'heure actuelle
  const group = cache.allMessages.filter(m => m.heures === currentTime);

  if (group.length === 0) return;

  // FR + EN → on prend un seul aléatoire
  const chosen = group[Math.floor(Math.random() * group.length)];

  console.log(`🎲 ${currentTime} → sélectionné msg ${chosen.id} (${chosen.lang})`);

  await sendMessage(chosen, CANAL_ID);
}

// =================== CANAL 2 ===================
async function sendScheduledMessagesCanal2() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");

  const candidates = cache.messagesCanal2.filter(m => m.heures === currentTime);
  for (const msg of candidates) {
    await sendMessage(msg, CANAL2_ID);
  }
}

// =================== CRON ===================
// Chargement initial
(async () => {
  console.log("⏱️ Chargement initial...");
  await loadMessagesSafe();
})();

// Rechargement à 05:45
cron.schedule("45 5 * * *", async () => {
  console.log("♻️ Reload 05:45");
  await loadMessagesSafe();
}, { timezone: "Africa/Lome" });

// Check chaque minute
cron.schedule("* * * * *", async () => {
  await Promise.allSettled([
    sendScheduledMessages(),
    sendScheduledMessagesCanal2()
  ]);
}, { timezone: "Africa/Lome" });

console.log("✅ autoSend.js FINAL lancé.");

module.exports = {
  loadMessagesSafe,
  sendScheduledMessages
};
