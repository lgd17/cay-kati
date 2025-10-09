// autoSend.js
const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");
const cron = require("node-cron");

const CANAL_ID = process.env.CANAL_ID;      // Canal principal (rotation FR/EN)
const CANAL2_ID = process.env.CANAL2_ID;    // Deuxième canal (2 messages fixes)
const ADMIN_ID = process.env.ADMIN_ID;

// =================== CACHE ===================
let cache = {
  messagesFR: [],
  messagesEN: [],
  messagesCanal2: [],
  lastRefresh: null
};

// =================== RETRY UTILE ===================
async function retry(fn, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      console.warn(`⚠️ Tentative ${i + 1} échouée: ${err.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
      else throw err;
    }
  }
}

// =================== FONCTIONS CHARGEMENT ===================

// Canal principal
async function loadMessages() {
  const res = await pool.query("SELECT * FROM message_fixes ORDER BY id");
  cache.messagesFR = res.rows.filter(m => m.lang?.toLowerCase() === "fr");
  cache.messagesEN = res.rows.filter(m => m.lang?.toLowerCase() === "en");
  cache.lastRefresh = Date.now();

  console.log(`📥 ${cache.messagesFR.length} messages FR et ${cache.messagesEN.length} messages EN rechargés.`);
  if (bot) await bot.sendMessage(ADMIN_ID, `♻️ Messages Canal1 rechargés à ${moment().tz("Africa/Lome").format("HH:mm")}`);
}

// Canal2
async function loadMessagesCanal2() {
  const res = await pool.query("SELECT * FROM message_fixes2 ORDER BY id");
  cache.messagesCanal2 = res.rows;
  cache.lastRefresh = Date.now();

  console.log(`📥 ${cache.messagesCanal2.length} messages Canal2 rechargés.`);
  if (bot) await bot.sendMessage(ADMIN_ID, `♻️ Messages Canal2 rechargés à ${moment().tz("Africa/Lome").format("HH:mm")}`);
}

// Chargement sécurisé avec retry
async function loadMessagesSafe() {
  try {
    await retry(loadMessages, 3, 3000);
  } catch (err) {
    console.error("❌ Échec définitif Canal1 :", err.message);
    if (bot) await bot.sendMessage(ADMIN_ID, `❌ Échec définitif Canal1 : ${err.message}`);
  }

  try {
    await retry(loadMessagesCanal2, 3, 3000);
  } catch (err) {
    console.error("❌ Échec définitif Canal2 :", err.message);
    if (bot) await bot.sendMessage(ADMIN_ID, `❌ Échec définitif Canal2 : ${err.message}`);
  }
}

// =================== ROTATION JOURNALIERE ===================
async function getDailyMessages(langMessages, type) {
  if (!langMessages.length) return [];

  const res = await pool.query("SELECT last_index FROM daily_rotation WHERE lang = $1", [type]);
  let lastIndex = res.rowCount > 0 ? parseInt(res.rows[0].last_index, 10) : 0;

  const daily = [];
  for (let i = 0; i < 5; i++) {
    const index = (lastIndex + i + 1) % langMessages.length;
    daily.push(langMessages[index]);
  }

  const newIndex = (lastIndex + 5) % langMessages.length;
  if (res.rowCount > 0) {
    await pool.query("UPDATE daily_rotation SET last_index = $1 WHERE lang = $2", [newIndex, type]);
  } else {
    await pool.query("INSERT INTO daily_rotation (lang, last_index) VALUES ($1, $2)", [type, newIndex]);
  }

  return daily;
}

// =================== ENVOI DES MESSAGES ===================
async function sendMessage(msg, canalId, canalType = "canal1") {
  try {
    const tableName = canalType === "canal1" ? "message_fixes" : "message_fixes2";
    const exists = await pool.query(`SELECT 1 FROM ${tableName} WHERE id=$1`, [msg.id]);
    if (exists.rowCount === 0) {
      console.warn(`⚠️ Message ${msg.id} inexistant dans ${tableName}, envoi annulé.`);
      return;
    }

    const text = msg.media_text || "";

    switch (msg.media_type) {
      case "photo":
        await bot.sendPhoto(canalId, msg.media_url, { caption: text, parse_mode: "HTML" });
        break;
      case "video":
        await bot.sendVideo(canalId, msg.media_url, { caption: text, parse_mode: "HTML" });
        break;
      case "audio":
        await bot.sendAudio(canalId, msg.media_url, { caption: text, parse_mode: "HTML" });
        break;
      case "voice":
        await bot.sendVoice(canalId, msg.media_url);
        if (msg.media_text) await bot.sendMessage(canalId, text, { parse_mode: "HTML" });
        break;
      case "video_note":
        await bot.sendVideoNote(canalId, msg.media_url);
        if (msg.media_text) await bot.sendMessage(canalId, text, { parse_mode: "HTML" });
        break;
      default:
        if (msg.media_url?.startsWith("http")) {
          await bot.sendMessage(canalId, `${text}\n🔗 ${msg.media_url}`, { parse_mode: "HTML" });
        } else {
          await bot.sendMessage(canalId, text, { parse_mode: "HTML" });
        }
        break;
    }

    await pool.query(
      "INSERT INTO message_logs(message_id) VALUES($1) ON CONFLICT DO NOTHING",
      [msg.id]
    );

    console.log(`✅ Message ${msg.id} envoyé à ${moment().tz("Africa/Lome").format("HH:mm")} sur canal ${canalId}`);
  } catch (err) {
    console.error(`❌ Erreur envoi message ${msg.id} canal ${canalId}:`, err.message);
    if (bot) await bot.sendMessage(ADMIN_ID, `❌ Erreur message ${msg.id} canal ${canalId}: ${err.message}`);
  }
}

// =================== ENVOI AUTO ===================
async function sendScheduledMessages() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");

  try {
    const dailyFR = await getDailyMessages(cache.messagesFR, "fr");
    const dailyEN = await getDailyMessages(cache.messagesEN, "en");
    const dailyMessages = [...dailyFR, ...dailyEN];

    const toSend = dailyMessages.filter(m => m && m.heures?.split(",").map(h => h.trim()).includes(currentTime));
    for (const msg of toSend) {
      const sentCheck = await pool.query(
        "SELECT 1 FROM message_logs WHERE message_id=$1 AND sent_at > NOW() - INTERVAL '10 minutes'",
        [msg.id]
      );
      if (sentCheck.rowCount > 0) continue;
      await sendMessage(msg, CANAL_ID, "canal1");
    }
  } catch (err) {
    console.error("❌ Erreur générale Canal1 :", err.message);
    if (bot) await bot.sendMessage(ADMIN_ID, `❌ Erreur Canal1 : ${err.message}`);
  }
}

async function sendScheduledMessagesCanal2() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");

  for (const msg of cache.messagesCanal2) {
    if (!msg.heures?.split(",").map(h => h.trim()).includes(currentTime)) continue;

    const sentCheck = await pool.query(
      "SELECT 1 FROM message_logs WHERE message_id=$1 AND sent_at > NOW() - INTERVAL '10 minutes'",
      [msg.id]
    );
    if (sentCheck.rowCount > 0) continue;

    await sendMessage(msg, CANAL2_ID, "canal2");
  }
}

// =================== CRON ===================

// Chargement initial avec retry
(async () => {
  console.log("⏱️ Chargement initial des messages Canal1 et Canal2...");
  await loadMessagesSafe();
})();

// Rechargement à 05:45
cron.schedule("45 5 * * *", async () => {
  console.log("⏱️ Rechargement messages Canal1 et Canal2 à 05:45 Lomé...");
  await loadMessagesSafe();
}, { timezone: "Africa/Lome" });

// Refresh toutes les 30 minutes
cron.schedule("*/30 * * * *", async () => {
  console.log("♻️ Refresh auto des messages (cache Supabase)...");
  await loadMessagesSafe();
}, { timezone: "Africa/Lome" });

// Vérification chaque minute
cron.schedule("* * * * *", async () => {
  await sendScheduledMessages();
  await sendScheduledMessagesCanal2();
}, { timezone: "Africa/Lome" });

console.log("✅ autoSend.js lancé avec cache + refresh optimisé.");

module.exports = { loadMessages, sendScheduledMessages };
