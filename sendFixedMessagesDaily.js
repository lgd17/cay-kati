// sendFixedMessagesDaily.js
const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");

const CHANNEL_ID = process.env.CHANNEL_ID;
const hours = ["06:00", "08:30", "12:00", "18:00", "20:30"]; // heures de pointe

async function sendFixedMessagesDaily() {
  try {
    const today = moment().tz("Africa/Lome").format("YYYY-MM-DD");

    // Récupérer les messages non envoyés aujourd'hui
    const { rows: messages } = await pool.query(`
      SELECT * FROM message_fixes
      WHERE last_sent IS NULL OR last_sent < CURRENT_DATE
    `);

    // Séparer FR et EN
    const frMsgs = messages.filter(m => m.langue === 'FR');
    const enMsgs = messages.filter(m => m.langue === 'EN');

    // Tirer 5 messages aléatoires par langue
    const selectedFR = frMsgs.sort(() => 0.5 - Math.random()).slice(0, 5);
    const selectedEN = enMsgs.sort(() => 0.5 - Math.random()).slice(0, 5);

    const selectedMsgs = [...selectedFR, ...selectedEN];

    for (let i = 0; i < selectedMsgs.length; i++) {
      const msg = selectedMsgs[i];
      const hour = hours[i % hours.length]; // attribue une heure de pointe

      // Mettre à jour last_sent
      await pool.query(
        "UPDATE message_fixes SET last_sent = CURRENT_DATE WHERE id = $1",
        [msg.id]
      );

      // Envoi immédiat (ou tu peux créer un cron-job par heure)
      switch (msg.media_type) {
        case "photo":
          await bot.sendPhoto(CHANNEL_ID, msg.media_url, { caption: msg.media_text });
          break;
        case "video":
          await bot.sendVideo(CHANNEL_ID, msg.media_url, { caption: msg.media_text });
          break;
        case "voice":
          await bot.sendVoice(CHANNEL_ID, msg.media_url);
          await bot.sendMessage(CHANNEL_ID, msg.media_text);
          break;
        case "audio":
          await bot.sendAudio(CHANNEL_ID, msg.media_url);
          await bot.sendMessage(CHANNEL_ID, msg.media_text);
          break;
        default:
          await bot.sendMessage(CHANNEL_ID, msg.media_text);
          break;
      }

      console.log(`✅ Message #${msg.id} envoyé pour ${hour} (${msg.langue})`);
    }
  } catch (err) {
    console.error("❌ Erreur envoi messages fixes quotidiens :", err);
  }
}

module.exports = sendFixedMessagesDaily;
