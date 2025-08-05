const { pool } = require('./db');
const { bot } = require('./bot');
const moment = require('moment-timezone');

const CANAL_ID = process.env.CANAL_ID;
const ADMIN_ID = process.env.ADMIN_ID;

async function sendScheduledMessages() {
  // Obtenir l’heure actuelle à Lomé, formatée HH:mm
  const currentTime = moment().tz('Africa/Lome').format('HH:mm');

  try {
    // Récupérer tous les messages prévus pour cette heure exacte
    const res = await pool.query(
      "SELECT * FROM message_fixes WHERE heures = $1",
      [currentTime]
    );

    for (const msg of res.rows) {
      // 🔒 Vérifie si ce message a déjà été envoyé dans les 10 dernières minutes
      const check = await pool.query(
        `SELECT 1 FROM message_logs
         WHERE message_id = $1
         AND sent_at > NOW() - INTERVAL '10 minutes'`,
        [msg.id]
      );

      if (check.rowCount > 0) {
        console.log(`⏭️ Message ${msg.id} déjà envoyé récemment. Ignoré.`);
        continue;
      }

      try {
        // Envoi du message selon le type
        if (msg.media_type === 'photo' && msg.media_url) {
          await bot.sendPhoto(CANAL_ID, msg.media_url, { caption: msg.media_text });
        } else if (msg.media_type === 'video' && msg.media_url) {
          await bot.sendVideo(CANAL_ID, msg.media_url, { caption: msg.media_text });
        } else {
          await bot.sendMessage(CANAL_ID, msg.media_text);
        }

        // ✅ Ajoute un log pour éviter les doublons
        await pool.query(
          `INSERT INTO message_logs (message_id) VALUES ($1)`,
          [msg.id]
        );

        await bot.sendMessage(
          ADMIN_ID,
          `📤 Message (ID ${msg.id}) envoyé à ${currentTime} (Lomé).`
        );
      } catch (err) {
        console.error("Erreur d'envoi :", err);
        await bot.sendMessage(
          ADMIN_ID,
          `❌ Erreur lors de l'envoi du message ID ${msg.id} à ${currentTime} :\n${err.message}`
        );
      }
    }
  } catch (err) {
    console.error("Erreur DB:", err);
    await bot.sendMessage(ADMIN_ID, `❌ Erreur DB : ${err.message}`);
  }
}

// Appel toutes les minutes
setInterval(sendScheduledMessages, 60 * 1000);
