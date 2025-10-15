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
    }
  }
}

// =================== FONCTION D’ENVOI ===================
async function sendTelegramMessage(canal, msg, canalKey) {
  const options = { parse_mode: "HTML" };
  try {
    switch (msg.media_type) {
      case "photo": await bot.sendPhoto(canal, msg.media_url, { caption: msg.contenu, ...options }); break;
      case "video": await bot.sendVideo(canal, msg.media_url, { caption: msg.contenu, ...options }); break;
      case "voice": await bot.sendVoice(canal, msg.media_url, { caption: msg.contenu, ...options }); break;
      case "audio": await bot.sendAudio(canal, msg.media_url, { caption: msg.contenu, ...options }); break;
      case "video_note":
        await bot.sendVideoNote(canal, msg.media_url);
        if (msg.contenu) await bot.sendMessage(canal, msg.contenu, options);
        break;
      default: await bot.sendMessage(canal, msg.contenu, options);
    }

    await pool.query(
      "INSERT INTO messages_envoyes (message_id, canal, sent_date) VALUES ($1, $2, CURRENT_DATE) ON CONFLICT DO NOTHING",
      [msg.id, canalKey]
    );
    console.log(`✅ ${canalKey} → message ${msg.id} envoyé (${msg.media_type})`);
  } catch (err) {
    console.error(`❌ Erreur envoi ${canalKey}:`, err.message || err);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur envoi ${canalKey} message ${msg.id}: ${err.message}`);
  }
}

// =================== RÉCUPÉRATION MESSAGES ===================
async function getTwoMessagesOfDay(tableName, dayOfWeek, canalKey) {
  const { rows } = await pool.query(
    `SELECT * FROM ${tableName} WHERE day_of_week = $1
      AND id NOT IN (SELECT message_id FROM messages_envoyes WHERE canal = $2 AND sent_date >= CURRENT_DATE - INTERVAL '7 days')
      ORDER BY RANDOM() LIMIT 2`,
    [dayOfWeek, canalKey]
  );
  return rows;
}

// =================== PLANIFICATION ===================
async function scheduleDailyMessages(tableName, canalId, canalKey) {
  const today = dayjs().day();
  const messages = await getTwoMessagesOfDay(tableName, today, canalKey);

  if (messages.length === 0) {
    console.log(`⚠️ Aucun message disponible pour ${canalKey} aujourd’hui`);
    return;
  }

  const hours = [8, 20];

  messages.forEach((msg, index) => {
    const sendHour = hours[index] || 20;
    const sendTime = dayjs().hour(sendHour).minute(0).second(0);

    schedule.scheduleJob(sendTime.toDate(), async () => {
      await retryWithTimeout(() => sendTelegramMessage(canalId, msg, canalKey));
      console.log(`📤 ${canalKey} → message ${index + 1} prévu à ${sendTime.format("HH:mm")}`);
    });
  });
}

// =================== REPLANIFICATION QUOTIDIENNE ===================
schedule.scheduleJob("0 0 * * *", () => {
  console.log("🔄 Nouvelle journée : reprogrammation des messages");
  scheduleDailyMessages("messages_canal1", CANAL1_ID, "Canal 1");
  scheduleDailyMessages("messages_canal2", CANAL2_ID, "Canal 2");
});

// =================== REDÉMARRAGE AUTOMATIQUE ===================
schedule.scheduleJob("0 2 * * *", async () => {
  console.log("♻️ Redémarrage automatique dailyScheduler...");
  if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, "♻️ Redémarrage automatique dailyScheduler...");
  process.exit(0);
});

// =================== LANCEMENT IMMÉDIAT ===================
scheduleDailyMessages("messages_canal1", CANAL1_ID, "Canal 1");
scheduleDailyMessages("messages_canal2", CANAL2_ID, "Canal 2");

// =================== HANDLER GLOBAL ===================
process.on('unhandledRejection', async (reason) => {
  console.error('Unhandled Rejection:', reason);
  if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⚠️ unhandledRejection: ${reason.message || reason}`);
});
process.on('uncaughtException', async (err) => {
  console.error('Uncaught Exception:', err);
  if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⚠️ uncaughtException: ${err.message || err}`);
});

console.log("✅ dailyScheduler.js lancé avec retry + redémarrage quotidien + notifications admin.");
