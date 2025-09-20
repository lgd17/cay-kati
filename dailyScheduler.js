// dailyScheduler.js
const schedule = require("node-schedule");
const { pool } = require("./db");
const bot = require("./bot");
const dayjs = require("dayjs");

const CANAL1_ID = process.env.CANAL_ID;
const CANAL2_ID = process.env.CANAL2_ID;

// Fonction d'envoi (support texte + média)
async function sendTelegramMessage(canal, msg) {
  const options = { parse_mode: "HTML" };

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
      if (msg.contenu) {
        await bot.sendMessage(canal, msg.contenu, options);
      }
      break;
    default:
      await bot.sendMessage(canal, msg.contenu, options);
  }
}

// Fonction pour récupérer 30 messages max
async function getMessagesOfDay(tableName, dayOfWeek) {
  const { rows } = await pool.query(
    `SELECT * FROM ${tableName}
     WHERE day_of_week = $1
     ORDER BY RANDOM()
     LIMIT 30`,
    [dayOfWeek]
  );
  return rows;
}

// Planification
async function scheduleDailyMessages(tableName, canalId, canalKey) {
  const today = dayjs().day();
  const messages = await getMessagesOfDay(tableName, today);

  if (!messages.length) {
    console.log(`⚠️ Aucun message trouvé pour aujourd'hui dans ${canalKey}`);
    return;
  }

  // Diviser en lots de 2 messages → 15 créneaux horaires
  for (let i = 0; i < messages.length; i += 2) {
    const hourOffset = Math.floor(i / 2);
    const sendTime = dayjs().hour(8 + hourOffset).minute(0).second(0); // de 08:00 à 22:00

    schedule.scheduleJob(sendTime.toDate(), async () => {
      try {
        await sendTelegramMessage(canalId, messages[i]);
        if (messages[i + 1]) await sendTelegramMessage(canalId, messages[i + 1]);
        console.log(`✅ ${canalKey} → messages ${i + 1} et ${i + 2} envoyés à ${sendTime.format("HH:mm")}`);
      } catch (err) {
        console.error(`❌ Erreur envoi ${canalKey} :`, err.message || err);
      }
    });
  }
}


// Cron : chaque jour à minuit → préparer Canal 1 et Canal 2
schedule.scheduleJob("0 0 * * *", () => {
  console.log("🔄 Préparation des messages pour les deux canaux");
  scheduleDailyMessages("messages_canal1", CANAL1_ID, "Canal 1");
  scheduleDailyMessages("messages_canal2", CANAL2_ID, "Canal 2");
});

// Démarrage immédiat au lancement
scheduleDailyMessages("messages_canal1", CANAL1_ID, "Canal 1");
scheduleDailyMessages("messages_canal2", CANAL2_ID, "Canal 2");
