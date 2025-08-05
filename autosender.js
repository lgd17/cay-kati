const { pool } = require('./db');
const { bot } = require('./bot');
const moment = require('moment-timezone');
require('dotenv').config();

const CANAL_ID = process.env.CANAL_ID;
const ADMIN_ID = process.env.ADMIN_ID;

async function sendScheduledMessages() {
  // 🔁 Heure actuelle à Lomé
  const nowLome = moment().tz('Africa/Lome');
  const currentTime = nowLome.format('HH:mm');
  const currentDate = nowLome.format('YYYY-MM-DD');

  try {
    const { rows } = await pool.query(
      "SELECT * FROM message_fixes WHERE heures = $1",
      [currentTime]
    );

    for (const msg of rows) {
      // 🔁 Évite les doublons
      const { rowCount } = await pool.query(
        "SELECT 1 FROM message_logs WHERE message_id = $1 AND send_date = $2",
        [msg.id, currentDate]
      );

      if (rowCount > 0) {
        console.log(`⏩ Message #${msg.id} déjà envoyé aujourd’hui.`);
        continue;
      }

      try {
        // ✅ Envoie du message
        if (msg.media_type === 'photo' && msg.media_url) {
          await bot.sendPhoto(CANAL_ID, msg.media_url, { caption: msg.media_text });
        } else if (msg.media_type === 'video' && msg.media_url) {
          await bot.sendVideo(CANAL_ID, msg.media_url, { caption: msg.media_text });
        } else {
          await bot.sendMessage(CANAL_ID, msg.media_text);
        }

        // ✅ Log
        await pool.query(
          `INSERT INTO message_logs (message_id, send_date) VALUES ($1, $2)`,
          [msg.id, currentDate]
        );

        await bot.sendMessage(ADMIN_ID, `📤 Message fixe #${msg.id} envoyé à ${currentTime} (heure Lomé).`);

      } catch (err) {
        console.error("❌ Erreur d'envoi :", err);
        await bot.sendMessage(ADMIN_ID, `❌ Erreur lors de l'envoi du message fixe #${msg.id}.`);
      }
    }
  } catch (err) {
    console.error("❌ Erreur DB :", err);
  }
}


        // ✅ Notification à l’admin
        await bot.sendMessage(ADMIN_ID, `📤 Message envoyé dans le canal à ${currentTime}.`);
      } catch (err) {
        console.error("Erreur d'envoi :", err);
        // ❌ Si erreur, informe aussi l’admin
        await bot.sendMessage(ADMIN_ID, `❌ Erreur lors de l'envoi du message fixe à ${currentTime}.`);
      }
    }
  } catch (err) {
    console.error("Erreur DB:", err);
  }
}

// Appel toutes les 60 secondes
setInterval(sendScheduledMessages, 60 * 1000);

