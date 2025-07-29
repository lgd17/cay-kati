
/const { pool } = require('./db');
const { bot } = require('./bot');
require('dotenv').config();

const CANAL_ID = process.env.CANAL_ID; 
const ADMIN_ID = process.env.ADMIN_ID; 

// Fonction exécutée chaque minute
async function sendScheduledMessages() {
  const now = new Date();
  const hours = now.getUTCHours().toString().padStart(2, '0');
  const minutes = now.getUTCMinutes().toString().padStart(2, '0');
  const currentTime = `${hours}:${minutes}`;

  try {
    const res = await pool.query(
     "SELECT * FROM message_fixes WHERE heures = $1",
  [heure]
    );

    for (const msg of res.rows) {
      try {
        // Envoie dans le canal
        await bot.sendMessage(CANAL_ID, msg.message);

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

