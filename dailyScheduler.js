// dailyScheduler.js
const schedule = require("node-schedule");
const { pool } = require("./db");
const bot = require("./bot");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const tz = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(tz);
dayjs.tz.setDefault("Africa/Lome"); // 🕐 fuseau horaire de Lomé

const CANAL1_ID = process.env.CANAL_ID;
const CANAL2_ID = process.env.CANAL2_ID;

// ======================
// 🔹 Fonction d’envoi
// ======================
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

    // 🔸 On enregistre dans l’historique après envoi réussi
    await pool.query(
      "INSERT INTO messages_envoyes (message_id, canal, sent_date) VALUES ($1, $2, CURRENT_DATE)",
      [msg.id, canalKey]
    );

    console.log(`✅ ${canalKey} → message ${msg.id} envoyé (${msg.media_type})`);
  } catch (err) {
    console.error(`❌ Erreur envoi ${canalKey}:`, err.message || err);
  }
}

// ======================
// 🔹 Récupération de 2 messages aléatoires non utilisés depuis 7 jours
// ======================
async function getTwoMessagesOfDay(tableName, dayOfWeek, canalKey) {
  const { rows } = await pool.query(
    `
    SELECT * FROM ${tableName}
    WHERE day_of_week = $1
      AND id NOT IN (
        SELECT message_id
        FROM messages_envoyes
        WHERE canal = $2
          AND sent_date >= CURRENT_DATE - INTERVAL '7 days'
      )
    ORDER BY RANDOM()
    LIMIT 2
    `,
    [dayOfWeek, canalKey]
  );
  return rows;
}

// ======================
// 🔹 Planification journalière
// ======================
async function scheduleDailyMessages(tableName, canalId, canalKey) {
  const today = dayjs().day(); // 0–6
  const messages = await getTwoMessagesOfDay(tableName, today, canalKey);

  if (messages.length === 0) {
    console.log(`⚠️ Aucun message disponible pour ${canalKey} aujourd’hui`);
    return;
  }

  // Heures fixes : 08h00 et 20h00
  const hours = [8, 20];

  messages.forEach((msg, index) => {
    const sendHour = hours[index] || 20;
    const sendTime = dayjs().hour(sendHour).minute(0).second(0);

    schedule.scheduleJob(sendTime.toDate(), async () => {
      await sendTelegramMessage(canalId, msg, canalKey);
      console.log(`📤 ${canalKey} → message ${index + 1} prévu à ${sendTime.format("HH:mm")}`);
    });
  });
}

// ======================
// 🔹 Replanification chaque jour à minuit
// ======================
schedule.scheduleJob("0 0 * * *", () => {
  console.log("🔄 Nouvelle journée : reprogrammation des messages");
  scheduleDailyMessages("messages_canal1", CANAL1_ID, "Canal 1");
  scheduleDailyMessages("messages_canal2", CANAL2_ID, "Canal 2");
});

// ======================
// 🔹 Lancement immédiat au démarrage
// ======================
scheduleDailyMessages("messages_canal1", CANAL1_ID, "Canal 1");
scheduleDailyMessages("messages_canal2", CANAL2_ID, "Canal 2");
