const { pool } = require("./db");
const { bot } = require('./bot');
const moment = require('moment-timezone');
const cron = require('node-cron');

const CANAL_ID = process.env.CANAL_ID;
const ADMIN_ID = process.env.ADMIN_ID;

let messagesFR = [];
let messagesEN = [];

// Charger tous les messages fixes
async function loadMessages() {
  try {
    const res = await pool.query("SELECT * FROM message_fixes ORDER BY id");
    messagesFR = res.rows.filter(m => m.lang && m.lang.toLowerCase() === 'fr');
    messagesEN = res.rows.filter(m => m.lang && m.lang.toLowerCase() === 'en');
    console.log(`📥 ${messagesFR.length} messages FR et ${messagesEN.length} messages EN chargés.`);
    await bot.sendMessage(ADMIN_ID, `📥 Messages quotidiens chargés à ${moment().tz('Africa/Lome').format('HH:mm')}`);
  } catch (err) {
    console.error("❌ Erreur en chargeant les messages :", err.message);
    await bot.sendMessage(ADMIN_ID, `❌ Erreur en chargeant les messages : ${err.message}`);
  }
}

// Sélection 5 messages par langue pour la journée
async function getDailyMessages(langMessages, type) {
  const res = await pool.query("SELECT last_index FROM daily_rotation WHERE lang = $1", [type]);
  let lastIndex = 0;
  if (res.rowCount > 0) {
    lastIndex = parseInt(res.rows[0].last_index, 10);
    if (isNaN(lastIndex)) lastIndex = 0;
  }

  const startIndex = (lastIndex + 5) % langMessages.length;
  const daily = [];

  for (let i = 0; i < 5; i++) {
    const index = (startIndex + i) % langMessages.length;
    daily.push(langMessages[index]);
  }

  const newIndex = (startIndex + 4) % langMessages.length;

  if (res.rowCount > 0) {
    await pool.query(
      "UPDATE daily_rotation SET last_index = $1 WHERE lang = $2",
      [isNaN(newIndex) ? 0 : newIndex, type]
    );
  } else {
    await pool.query(
      "INSERT INTO daily_rotation (lang, last_index) VALUES ($1, $2)",
      [type, isNaN(newIndex) ? 0 : newIndex]
    );
  }

  return daily;
}

// Envoyer les messages à l'heure prévue
async function sendScheduledMessages() {
  const currentTime = moment().tz('Africa/Lome').format('HH:mm');

  try {
    const dailyFR = await getDailyMessages(messagesFR, 'fr');
    const dailyEN = await getDailyMessages(messagesEN, 'en');
    const dailyMessages = [...dailyFR, ...dailyEN];

    const toSend = dailyMessages.filter(msg => msg && msg.heures && msg.id);
    const sendNow = toSend.filter(msg => msg.heures === currentTime);

    for (const msg of sendNow) {
      try {
        const check = await pool.query(
          `SELECT 1 FROM message_logs WHERE message_id = $1 AND sent_at > NOW() - INTERVAL '10 minutes'`,
          [msg.id]
        );
        if (check.rowCount > 0) continue;

        if (msg.media_type === 'photo' && msg.media_url) {
          await bot.sendPhoto(CANAL_ID, msg.media_url, { caption: msg.media_text });
        } else if (msg.media_type === 'video' && msg.media_url) {
          await bot.sendVideo(CANAL_ID, msg.media_url, { caption: msg.media_text });
        } else if (msg.media_type === 'audio' && msg.media_url) {
          await bot.sendAudio(CANAL_ID, msg.media_url, { caption: msg.media_text });
        } else {
          await bot.sendMessage(CANAL_ID, msg.media_text);
        }

        await pool.query(`INSERT INTO message_logs (message_id) VALUES ($1)`, [msg.id]);
        console.log(`✅ Message ${msg.id} envoyé à ${currentTime}`);
      } catch (err) {
        console.error(`❌ Erreur envoi message ${msg.id}:`, err.message);
        await bot.sendMessage(ADMIN_ID, `❌ Erreur message ${msg.id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error("❌ Erreur générale :", err.message);
    await bot.sendMessage(ADMIN_ID, `❌ Erreur générale autoSend : ${err.message}`);
  }
}

// Cron pour charger messages tous les jours à 05:45 Lomé
cron.schedule('45 5 * * *', async () => {
  console.log("⏱️ Chargement quotidien des messages à 05:45 Lomé...");
  await loadMessages();
}, { timezone: 'Africa/Lome' });

// Cron toutes les minutes pour envoyer les messages fixes
cron.schedule('* * * * *', async () => {
  await sendScheduledMessages();
}, { timezone: 'Africa/Lome' });

console.log("✅ autoSend.js lancé avec rotation FR/EN, support texte/photo/vidéo/audio et heures fixes.");
