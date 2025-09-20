// dailyScheduler.js
const schedule = require("node-schedule");
const { pool } = require("./db"); 
const bot = require("./bot"); 
const dayjs = require("dayjs");

const CANAL_ID = process.env.CANAL_ID; 

// Fonction d'envoi avec parse HTML
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
      if (msg.contenu) {
        await bot.sendMessage(CANAL_ID, msg.contenu, options);
      }
      break;
    default:
      await bot.sendMessage(CANAL_ID, msg.contenu, options);
  }
}

// Récupérer les 14 messages du jour avec permutation
async function getMessagesOfDay(dayOfWeek) {
  const { rows } = await pool.query(
    `SELECT * FROM messages_journalier
     WHERE day_of_week = $1
     ORDER BY RANDOM()
     LIMIT 14`,
    [dayOfWeek]
  );
  return rows;
}

// Planifier 2 messages par heure
async function scheduleDailyMessages() {
  const today = dayjs().day(); // 0 = Dimanche ... 6 = Samedi
  const messages = await getMessagesOfDay(today);

  if (!messages.length) {
    console.log("⚠️ Aucun message trouvé pour aujourd'hui");
    return;
  }

  // Diviser les 14 messages en lots de 2 → 7 créneaux horaires
  for (let i = 0; i < messages.length; i += 2) {
    const hourOffset = Math.floor(i / 2);
    const sendTime = dayjs().hour(9 + hourOffset).minute(0).second(0); // 09:00 → 15:00

    schedule.scheduleJob(sendTime.toDate(), async () => {
      try {
        await sendTelegramMessage(messages[i]);
        if (messages[i + 1]) await sendTelegramMessage(messages[i + 1]);
        console.log(`✅ Envoi messages ${i + 1} et ${i + 2} à ${sendTime.format("HH:mm")}`);
      } catch (err) {
        console.error("❌ Erreur envoi messages :", err.message || err);
      }
    });
  }
}

// Cron : chaque jour à minuit → planifier les messages du jour
schedule.scheduleJob("0 0 * * *", () => {
  console.log("🔄 Préparation des messages pour la nouvelle journée");
  scheduleDailyMessages();
});

// Exécuter aussi au démarrage
scheduleDailyMessages();
