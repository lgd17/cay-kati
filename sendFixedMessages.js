// sendFixedMessages.js
const { pool } = require("./db");
const bot = require("./bot");

const CHANNEL_ID = process.env.CHANNEL_ID;

/**
 * Envoi des messages fixes pour une heure précise
 * @param {string} hourStr - Heure au format "HH:mm" (ex: "06:00")
 */
async function sendFixedMessages(hourStr) {
  try {
    // Récupère uniquement les messages fixes à l'heure demandée
    const { rows } = await pool.query(`
      SELECT * FROM message_fixes
      WHERE $1 = ANY(string_to_array(heures, ','))
    `, [hourStr]);

    for (const msg of rows) {
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
    }

    console.log(`✅ Messages fixes envoyés pour ${hourStr}`);
  } catch (err) {
    console.error(`❌ Erreur envoi messages fixes (${hourStr}) :`, err);
  }
}

module.exports = sendFixedMessages;
