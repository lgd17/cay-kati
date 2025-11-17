// dailyScheduler.js
const schedule = require("node-schedule");
const { pool } = require("./db");
const bot = require("./bot");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const tz = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(tz);
dayjs.tz.setDefault("Africa/Lome");

const CANAL1_ID = process.env.CANAL_ID;
const CANAL2_ID = process.env.CANAL2_ID;
const ADMIN_ID = process.env.ADMIN_ID;

// =================== VARIABLES GLOBALES ===================
let scheduledJobs = []; // tableau pour tous les jobs planifiés

// =================== NETTOYAGE JOBS ===================
function clearScheduledJobs() {
  scheduledJobs.forEach(job => job.cancel());
  scheduledJobs = [];
}

// =================== RETRY SÉCURISÉ (remplace retryWithTimeout) ===================
async function safeRetry(fn, retries = 3, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      console.error(`⏳ Retry ${i + 1}/${retries}:`, err.message);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// =================== ENVOI MESSAGE ===================
async function sendTelegramMessage(canal, msg, canalKey) {
  const options = { parse_mode: "HTML" };
  try {
    switch (msg.media_type) {
      case "photo":
        await bot.sendPhoto(canal, msg.media_url, { caption: msg.contenu, ...options });
        break;
      case "video":
        await bot.sendVideo(canal, msg.media_url, { caption: msg.contenu, ...options });
        break;
      case "voice":
        await bot.sendVoice(canal, msg.media_url, { caption: msg.contenu, ...options });
        break;
      case "audio":
        await bot.sendAudio(canal, msg.media_url, { caption: msg.contenu, ...options });
        break;
      case "video_note":
        await bot.sendVideoNote(canal, msg.media_url);
        if (msg.contenu) await bot.sendMessage(canal, msg.contenu, options);
        break;
      default:
        await bot.sendMessage(canal, msg.contenu, options);
    }

    await pool.query(
      `INSERT INTO messages_envoyes (message_id, canal, sent_date)
       VALUES ($1, $2, CURRENT_DATE)
       ON CONFLICT DO NOTHING`,
      [msg.id, canalKey]
    );

    console.log(`✅ ${canalKey} → message ${msg.id} envoyé`);
  } catch (err) {
    console.error(`❌ Erreur envoi ${canalKey}:`, err.message);
    if (ADMIN_ID)
      await bot.sendMessage(
        ADMIN_ID,
        `❌ Erreur envoi ${canalKey} message ${msg.id}: ${err.message}`
      );
  }
}

// =================== RÉCUPÉRATION MESSAGES ===================
async function getTwoMessagesOfDay(tableName, dayOfWeek, canalKey) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${tableName}
       WHERE day_of_week = $1
         AND id NOT IN (
           SELECT message_id
           FROM messages_envoyes
           WHERE canal = $2 AND sent_date = CURRENT_DATE
         )
       ORDER BY RANDOM()
       LIMIT 2;`,
      [dayOfWeek, canalKey]
    );
    return rows;
  } catch (err) {
    console.error(`💥 Erreur récupération messages ${tableName}:`, err.message);
    return [];
  }
}

// =================== PLANIFICATION JOURNALIÈRE ===================
async function scheduleDailyMessages(tableName, canalId, canalKey) {
  clearScheduledJobs(); // 🔥 Anti-duplication (important pour watchdog)

  const today = dayjs().day();
  const messages = await getTwoMessagesOfDay(tableName, today, canalKey);

  if (!messages.length) {
    console.log(`⚠️ Aucun message disponible pour ${canalKey} aujourd’hui`);
    return;
  }

  const hours = [8, 20];

  messages.slice(0, 2).forEach((msg, index) => {
    const sendTime = dayjs().hour(hours[index]).minute(0).second(0);

    const job = schedule.scheduleJob(sendTime.toDate(), async () => {
      try {
        await safeRetry(() =>
          sendTelegramMessage(canalId, msg, canalKey)
        );
        console.log(`📤 ${canalKey} → message ${msg.id} envoyé (${hours[index]}h)`);
      } catch (err) {
        console.error("❌ Erreur envoi final:", err.message);
      }
    });

    scheduledJobs.push(job);
  });
}

// =================== REPLANIFICATION QUOTIDIENNE ===================
schedule.scheduleJob("0 0 * * *", async () => {
  console.log("🔄 Nouvelle journée : reprogrammation des messages");
  await startDailyCoupons();
});

// =================== FONCTION PRINCIPALE ===================
async function startDailyCoupons() {
  await scheduleDailyMessages("messages_canal1", CANAL1_ID, "Canal 1");
  await scheduleDailyMessages("messages_canal2", CANAL2_ID, "Canal 2");
}

// =================== HANDLERS GLOBAL ===================
process.on("unhandledRejection", err => {
  console.error("⚠️ Unhandled Rejection:", err.message || err);
});

process.on("uncaughtException", err => {
  console.error("💥 Uncaught Exception:", err.message);
});

// =================== LANCEMENT ===================
(async () => {
  await startDailyCoupons();
})();

console.log("✅ dailyScheduler.js chargé");

// =================== EXPORT ===================
module.exports = { startDailyCoupons };
