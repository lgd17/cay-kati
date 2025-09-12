const schedule = require("node-schedule");
const { pool } = require("./db"); 
const bot = require("./bot"); 
const dayjs = require("dayjs");

const CANAL_ID = process.env.CANAL_ID; 

// Fonction principale : vérifie chaque minute
schedule.scheduleJob("* * * * *", async () => {
  try {
    const now = dayjs();

    // Récupérer les messages à envoyer
    const { rows } = await pool.query(
      `SELECT * 
       FROM messages_auto
       WHERE sent = false 
         AND send_date <= NOW()
       ORDER BY send_date ASC`
    );

    for (const msg of rows) {
      try {
        // Envoi selon le type de média
        if (msg.media_type === "photo") {
          await bot.sendPhoto(CANAL_ID, msg.media_url, {
            caption: msg.contenu,
          });
        } else if (msg.media_type === "video") {
          await bot.sendVideo(CANAL_ID, msg.media_url, {
            caption: msg.contenu,
          });
        } else if (msg.media_type === "voice") {
          await bot.sendVoice(CANAL_ID, msg.media_url, {
            caption: msg.contenu,
          });
        } else if (msg.media_type === "audio") {
          await bot.sendAudio(CANAL_ID, msg.media_url, {
            caption: msg.contenu,
          });
        } else if (msg.media_type === "video_note") {
          await bot.sendVideoNote(CANAL_ID, msg.media_url);
          if (msg.contenu) {
            await bot.sendMessage(CANAL_ID, msg.contenu);
          }
        } else {
          // Message texte seul
          await bot.sendMessage(CANAL_ID, msg.contenu);
        }

        // Mise à jour : envoyé ✅
        await pool.query(
          `UPDATE messages_auto SET sent = true WHERE id = $1`,
          [msg.id]
        );

        console.log(
          `✅ Message ID ${msg.id} envoyé à ${now.format("HH:mm DD/MM")}`
        );
      } catch (err) {
        console.error(
          `❌ Erreur envoi message ID ${msg.id}:`,
          err.message || err
        );
      }
    }
  } catch (err) {
    console.error("❌ Erreur autoSender:", err.message || err);
  }
});








// Suppression automatique des messages anciens (>3 jours) tous les jours à 02:15
schedule.scheduleJob("15 2 * * *", async () => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM messages_auto WHERE send_date < NOW() - INTERVAL '3 days'`
    );
    console.log(`🗑️ Suppression auto : ${rowCount} anciens messages supprimés.`);
  } catch (err) {
    console.error("❌ Erreur suppression anciens messages :", err.message || err);
  }
});
