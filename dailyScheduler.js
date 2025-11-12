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

const ADMIN_ID = process.env.ADMIN_ID;

async function startDailyCoupons() {
  const CANAL1_ID = process.env.CANAL_ID;
  const CANAL2_ID = process.env.CANAL2_ID;

  console.log("🚀 Démarrage dailyScheduler via startDailyCoupons...");

  // Relance de la planification des messages pour les deux canaux
  await scheduleDailyMessages("messages_canal1", CANAL1_ID, "Canal 1");
  await scheduleDailyMessages("messages_canal2", CANAL2_ID, "Canal 2");
}

// =================== 1️⃣ RETRY + TIMEOUT ===================
async function retryWithTimeout(fn, retries = 3, timeout = 10000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("⏳ Timeout envoi message")), timeout)
        ),
      ]);
    } catch (err) {
      console.warn(`⚠️ Tentative ${i + 1}/${retries} échouée: ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500)); // pause avant retry
    }
  }
}

// =================== 2️⃣ ENVOI MESSAGE ===================
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

    console.log(`✅ ${canalKey} → message ${msg.id} envoyé (${msg.media_type || "texte"})`);
  } catch (err) {
    console.error(`❌ Erreur envoi ${canalKey}:`, err.message);
    if (ADMIN_ID)
      await bot.sendMessage(
        ADMIN_ID,
        `❌ Erreur envoi ${canalKey} message ${msg.id}: ${err.message}`
      );
  }
}

// =================== 3️⃣ RÉCUPÉRATION ===================
async function getTwoMessagesOfDay(tableName, dayOfWeek, canalKey) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${tableName}
        WHERE day_of_week = $1
        AND id NOT IN (
          SELECT message_id FROM messages_envoyes
          WHERE canal = $2 AND sent_date >= CURRENT_DATE - INTERVAL '7 days'
        )
        ORDER BY RANDOM() LIMIT 2`,
      [dayOfWeek, canalKey]
    );
    return rows;
  } catch (err) {
    console.error(`💥 Erreur récupération messages ${tableName}:`, err.message);
    return [];
  }
}

// =================== 4️⃣ PLANIFICATION JOURNALIÈRE ===================
async function scheduleDailyMessages(tableName, canalId, canalKey) {
  try {
    const today = dayjs().day();
    const messages = await getTwoMessagesOfDay(tableName, today, canalKey);

    if (!messages.length) {
      console.log(`⚠️ Aucun message disponible pour ${canalKey} aujourd’hui`);
      return;
    }

    const hours = [8, 20]; // Envoi matin & soir

    messages.forEach((msg, index) => {
      const sendHour = hours[index] || 20;
      const sendTime = dayjs().hour(sendHour).minute(0).second(0);

      schedule.scheduleJob(sendTime.toDate(), async () => {
        await retryWithTimeout(() => sendTelegramMessage(canalId, msg, canalKey));
        console.log(`📤 ${canalKey} → message ${index + 1} prévu à ${sendTime.format("HH:mm")}`);
      });
    });
  } catch (err) {
    console.error(`💥 Erreur planification ${canalKey}:`, err.message);
  }
}

// =================== 5️⃣ TÂCHE DE REPLANIFICATION ===================
schedule.scheduleJob("0 0 * * *", async () => {
  console.log("🔄 Nouvelle journée : reprogrammation des messages");
  await scheduleDailyMessages("messages_canal1", CANAL1_ID, "Canal 1");
  await scheduleDailyMessages("messages_canal2", CANAL2_ID, "Canal 2");
});

// =================== 6️⃣ AUTO-RESTART SÉCURISÉ ===================



// =================== 7️⃣ LANCEMENT INITIAL ===================
(async () => {
  console.log("🚀 Lancement initial des tâches journalières...");
  await scheduleDailyMessages("messages_canal1", CANAL1_ID, "Canal 1");
  await scheduleDailyMessages("messages_canal2", CANAL2_ID, "Canal 2");
})();

// =================== 8️⃣ HANDLERS GLOBAUX ===================
process.on("unhandledRejection", async (reason) => {
  console.error("⚠️ Unhandled Rejection:", reason);
  if (ADMIN_ID)
    await bot.sendMessage(
      ADMIN_ID,
      `⚠️ unhandledRejection: ${reason.message || reason}`
    );
});

process.on("uncaughtException", async (err) => {
  console.error("💥 Uncaught Exception:", err);
  if (ADMIN_ID)
    await bot.sendMessage(ADMIN_ID, `💥 uncaughtException: ${err.message}`);
});

console.log("✅ dailyScheduler.js prêt (retry + restart + sécurité totale)");

module.exports = {
  startDailyCoupons
};

