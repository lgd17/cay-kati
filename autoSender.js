// =================== autoSender.js ===================
const cron = require("node-cron");
const { pool } = require("./db");
const bot = require("./bot");
const dayjs = require("dayjs");

const CANAL_ID = process.env.CANAL_ID;
const ADMIN_ID = process.env.ADMIN_ID;

// =================== VARIABLES ===================
let isRunning = false; // verrou anti chevauchement
const START_TIME = Date.now();

// =================== RETRY + TIMEOUT ===================
async function retryWithTimeout(fn, retries = 3, timeout = 10000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout envoi message")), timeout))
      ]);
    } catch (err) {
      console.warn(`⚠️ Tentative ${i + 1} échouée: ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000)); // délai entre retries
    }
  }
}

// =================== FONCTION D’ENVOI ===================
async function sendTelegramMessage(msg) {
  const options = { parse_mode: "HTML" };

  switch (msg.media_type) {
    case "photo":
      await bot.sendPhoto(CANAL_ID, msg.media_url, { caption: msg.contenu, ...options });
      break;
    case "video":
      await bot.sendVideo(CANAL_ID, msg.media_url, { caption: msg.contenu, ...options });
      break;
    case "voice":
      await bot.sendVoice(CANAL_ID, msg.media_url, { caption: msg.contenu, ...options });
      break;
    case "audio":
      await bot.sendAudio(CANAL_ID, msg.media_url, { caption: msg.contenu, ...options });
      break;
    case "video_note":
      await bot.sendVideoNote(CANAL_ID, msg.media_url);
      if (msg.contenu) await bot.sendMessage(CANAL_ID, msg.contenu, options);
      break;
    default:
      await bot.sendMessage(CANAL_ID, msg.contenu, options);
      break;
  }
}

// =================== CRON PRINCIPAL : ENVOI AUTO ===================
cron.schedule("* * * * *", async () => {
  if (isRunning) {
    console.log("⚠️ autoSender déjà en cours, skip...");
    return;
  }
  isRunning = true;

  try {
    const { rows } = await pool.query(`
      UPDATE messages_auto
      SET sent = true
      WHERE id IN (
        SELECT id
        FROM messages_auto
        WHERE sent = false AND send_date <= NOW()
        ORDER BY send_date ASC
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    `);

    const now = dayjs();
    for (const msg of rows) {
      try {
        await retryWithTimeout(() => sendTelegramMessage(msg));
        console.log(`✅ Message ID ${msg.id} envoyé à ${now.format("HH:mm DD/MM")}`);
      } catch (err) {
        console.error(`❌ Erreur envoi message ID ${msg.id}:`, err.message || err);
        await pool.query(`UPDATE messages_auto SET sent = false WHERE id = $1`, [msg.id]);
        if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Échec message ID ${msg.id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error("❌ Erreur autoSender:", err.message || err);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur autoSender: ${err.message}`);
  } finally {
    isRunning = false;
  }
}, { timezone: "Africa/Lome" });

// =================== CRON : SUPPRESSION ANCIENS MESSAGES ===================
cron.schedule("15 2 * * *", async () => { // 02:15 UTC
  try {
    const { rowCount } = await pool.query(`
      DELETE FROM messages_auto 
      WHERE send_date < NOW() - INTERVAL '3 days'
    `);
    console.log(`🗑️ Suppression auto : ${rowCount} anciens messages supprimés.`);
  } catch (err) {
    console.error("❌ Erreur suppression anciens messages :", err.message || err);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur suppression anciens messages : ${err.message}`);
  }
}, { timezone: "UTC" });

// =================== CRON : REDÉMARRAGE AUTOMATIQUE ===================
cron.schedule("0 2 * * *", async () => { // 02:00 UTC
  console.log("♻️ Redémarrage automatique du bot autoSender...");
  if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, "♻️ Redémarrage automatique du bot autoSender...");
  process.exit(0);
}, { timezone: "UTC" });

// =================== RESTART SÉCURITÉ (toutes les 24h) ===================
setTimeout(() => {
  console.log("♻️ Restart sécurité après 24h de fonctionnement.");
  if (ADMIN_ID) bot.sendMessage(ADMIN_ID, "♻️ Restart sécurité (24h écoulées, prévention freeze).");
  process.exit(0);
}, 24 * 60 * 60 * 1000);

// =================== HEARTBEAT (preuve de vie) ===================
setInterval(() => {
  const uptime = Math.round((Date.now() - START_TIME) / 1000 / 60);
  console.log(`💓 autoSender actif depuis ${uptime} min (${dayjs().format("HH:mm:ss")})`);
}, 60000);

// =================== HANDLER GLOBAL ===================
process.on("unhandledRejection", async (reason) => {
  console.error("Unhandled Rejection:", reason);
  if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⚠️ unhandledRejection: ${reason.message || reason}`);
});
process.on("uncaughtException", async (err) => {
  console.error("Uncaught Exception:", err);
  if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⚠️ uncaughtException: ${err.message || err}`);
});
process.on("exit", async () => {
  try {
    await pool.end();
    console.log("✅ Pool PostgreSQL fermé proprement.");
  } catch (err) {
    console.error("⚠️ Erreur fermeture pool:", err.message);
  }
});

console.log("✅ autoSender.js lancé avec protections anti-freeze, redémarrages auto, et heartbeat.");
