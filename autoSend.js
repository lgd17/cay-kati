// autoSend.js
const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");
const cron = require("node-cron");

const CANAL_ID = process.env.CANAL_ID;
const CANAL2_ID = process.env.CANAL2_ID;
const ADMIN_ID = process.env.ADMIN_ID;

// =================== CACHE ===================
let cache = {
  messagesFR: [],
  messagesEN: [],
  messagesCanal2: [],
  lastRefresh: null
};

// =================== RETRY ===================
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
async function loadMessages() {
  const res = await pool.query("SELECT * FROM message_fixes ORDER BY id");
  cache.messagesFR = res.rows.filter(m => m.lang?.toLowerCase() === "fr");
  cache.messagesEN = res.rows.filter(m => m.lang?.toLowerCase() === "en");
  cache.lastRefresh = Date.now();

  console.log(`📥 ${cache.messagesFR.length} messages FR et ${cache.messagesEN.length} messages EN rechargés.`);
  if (bot) await bot.sendMessage(ADMIN_ID, `♻️ Messages Canal1 rechargés à ${moment().tz("Africa/Lome").format("HH:mm")}`);
}

async function loadMessagesCanal2() {
  const res = await pool.query("SELECT * FROM message_fixes2 ORDER BY id");
  cache.messagesCanal2 = res.rows;
  cache.lastRefresh = Date.now();

  console.log(`📥 ${cache.messagesCanal2.length} messages Canal2 rechargés.`);
  if (bot) await bot.sendMessage(ADMIN_ID, `♻️ Messages Canal2 rechargés à ${moment().tz("Africa/Lome").format("HH:mm")}`);
}

async function loadMessagesSafe() {
  try { await retry(loadMessages, 3, 3000); } 
  catch (err) { 
    console.error("❌ Échec définitif Canal1 :", err.message); 
    if (bot) await bot.sendMessage(ADMIN_ID, `❌ Échec définitif Canal1 : ${err.message}`); 
  }

  try { await retry(loadMessagesCanal2, 3, 3000); } 
  catch (err) { 
    console.error("❌ Échec définitif Canal2 :", err.message); 
    if (bot) await bot.sendMessage(ADMIN_ID, `❌ Échec définitif Canal2 : ${err.message}`); 
  }
}

// =================== ROTATION ===================
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

// =================== ENVOI MESSAGE ===================
async function sendMessage(msg, canalId, canalType = "canal1") {
  try {
    const tableName = canalType === "canal1" ? "message_fixes" : "message_fixes2";
    const exists = await pool.query(`SELECT 1 FROM ${tableName} WHERE id=$1`, [msg.id]);
    if (exists.rowCount === 0) { console.warn(`⚠️ Message ${msg.id} inexistant, annulation.`); return; }

    const text = msg.media_text || "";

    switch (msg.media_type) {
      case "photo": await bot.sendPhoto(canalId, msg.media_url, { caption: text, parse_mode: "HTML" }); break;
      case "video": await bot.sendVideo(canalId, msg.media_url, { caption: text, parse_mode: "HTML" }); break;
      case "audio": await bot.sendAudio(canalId, msg.media_url, { caption: text, parse_mode: "HTML" }); break;
      case "voice": await bot.sendVoice(canalId, msg.media_url); if (text) await bot.sendMessage(canalId, text, { parse_mode: "HTML" }); break;
      case "video_note": await bot.sendVideoNote(canalId, msg.media_url); if (text) await bot.sendMessage(canalId, text, { parse_mode: "HTML" }); break;
      default: if (msg.media_url?.startsWith("http")) await bot.sendMessage(canalId, `${text}\n🔗 ${msg.media_url}`, { parse_mode: "HTML" }); else await bot.sendMessage(canalId, text, { parse_mode: "HTML" }); break;
    }

    await pool.query("INSERT INTO message_logs(message_id) VALUES($1) ON CONFLICT DO NOTHING", [msg.id]);
    console.log(`✅ Message ${msg.id} envoyé à ${moment().tz("Africa/Lome").format("HH:mm")} sur canal ${canalId}`);
  } catch (err) {
    console.error(`❌ Erreur envoi message ${msg.id} canal ${canalId}:`, err.message);
    if (bot) await bot.sendMessage(ADMIN_ID, `❌ Erreur message ${msg.id} canal ${canalId}: ${err.message}`);
  }
}

// =================== ENVOI AUTO ===================
async function sendScheduledMessages() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");
  const dailyFR = await getDailyMessages(cache.messagesFR, "fr");
  const dailyEN = await getDailyMessages(cache.messagesEN, "en");
  const dailyMessages = [...dailyFR, ...dailyEN];

  for (const msg of dailyMessages.filter(m => m?.heures?.split(",").map(h => h.trim()).includes(currentTime))) {
    const sentCheck = await pool.query("SELECT 1 FROM message_logs WHERE message_id=$1 AND sent_at > NOW() - INTERVAL '10 minutes'", [msg.id]);
    if (sentCheck.rowCount === 0) await retry(() => sendMessage(msg, CANAL_ID, "canal1"), 3, 2000);
  }
}

async function sendScheduledMessagesCanal2() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");
  for (const msg of cache.messagesCanal2.filter(m => m?.heures?.split(",").map(h => h.trim()).includes(currentTime))) {
    const sentCheck = await pool.query("SELECT 1 FROM message_logs WHERE message_id=$1 AND sent_at > NOW() - INTERVAL '10 minutes'", [msg.id]);
    if (sentCheck.rowCount === 0) await retry(() => sendMessage(msg, CANAL2_ID, "canal2"), 3, 2000);
  }
}

// =================== HANDLER GLOBAL ===================
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  if (bot) bot.sendMessage(ADMIN_ID, `⚠️ unhandledRejection: ${reason.message || reason}`);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  if (bot) bot.sendMessage(ADMIN_ID, `⚠️ uncaughtException: ${err.message || err}`);
});

// =================== CRON ===================
(async () => { console.log("⏱️ Chargement initial messages..."); await loadMessagesSafe(); })();
cron.schedule("45 5 * * *", async () => { console.log("⏱️ Rechargement messages à 05:45..."); await loadMessagesSafe(); }, { timezone: "Africa/Lome" });
cron.schedule("*/30 * * * *", async () => { console.log("♻️ Refresh auto des messages..."); await loadMessagesSafe(); }, { timezone: "Africa/Lome" });
cron.schedule("* * * * *", async () => { await sendScheduledMessages(); await sendScheduledMessagesCanal2(); }, { timezone: "Africa/Lome" });

console.log("✅ autoSend.js lancé avec cache + retry + handlers globaux.");

module.exports = { loadMessages, sendScheduledMessages };
