require("dotenv").config();
const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");

const CHANNEL_ID = process.env.CHANNEL_ID;

async function sendFixedMessages(hour) {
  try {
    const today = moment().tz("Africa/Lome").format("YYYY-MM-DD");

    // Récupère les messages planifiés pour l'heure donnée
    const { rows } = await pool.query(
      `SELECT mf.* 
       FROM daily_messages dm
       JOIN message_fixes mf ON mf.id = dm.message_id
       WHERE dm.date = $1 AND dm.heures = $2`,
      [today, hour]
    );

    if (rows.length === 0) {
      console.log(`ℹ️ Aucun message fixe trouvé pour ${hour}.`);
      return;
    }

    // Récupère les utilisateurs vérifiés
    const users = await pool.query("SELECT telegram_id FROM verified_users");

    for (let msg of rows) {
      for (let user of users.rows) {
        try {
          if (msg.media_type === "photo" && msg.media_url) {
            await bot.sendPhoto(user.telegram_id, msg.media_url, {
              caption: msg.media_text,
              parse_mode: "Markdown",
            });
          } else {
            await bot.sendMessage(user.telegram_id, msg.media_text, {
              parse_mode: "Markdown",
            });
          }
        } catch (err) {
          console.error(`❌ Erreur envoi à ${user.telegram_id} :`, err.message);
        }
      }

      // (optionnel) aussi dans le channel
      if (CHANNEL_ID) {
        if (msg.media_type === "photo" && msg.media_url) {
          await bot.sendPhoto(CHANNEL_ID, msg.media_url, {
            caption: msg.media_text,
            parse_mode: "Markdown",
          });
        } else {
          await bot.sendMessage(CHANNEL_ID, msg.media_text, {
            parse_mode: "Markdown",
          });
        }
      }
    }

    console.log(`✅ ${rows.length} message(s) fixes envoyés à ${hour}`);

  } catch (err) {
    console.error("❌ Erreur lors de l'envoi des messages fixes :", err.message);
  }
}

module.exports = sendFixedMessages;
