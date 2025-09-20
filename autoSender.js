const schedule = require("node-schedule");
const { pool } = require("./db"); 
const bot = require("./bot"); 
const dayjs = require("dayjs");

const CANAL_ID = process.env.CANAL_ID; 

// Fonction dédiée pour envoyer un message selon son type
async function sendTelegramMessage(msg) {
  const options = { parse_mode: "HTML" };

  switch (msg.media_type) {
    case "photo":
      await bot.sendPhoto(CANAL_ID, msg.media_url, {
        caption: msg.contenu,
        ...options,
      });
      break;
    case "video":
      await bot.sendVideo(CANAL_ID, msg.media_url, {
        caption: msg.contenu,
        ...options,
      });
      break;
    case "voice":
      await bot.sendVoice(CANAL_ID, msg.media_url, {
        caption: msg.contenu,
        ...options,
      });
      break;
    case "audio":
      await bot.sendAudio(CANAL_ID, msg.media_url, {
        caption: msg.contenu,
        ...options,
      });
      break;
    case "video_note":
      await bot.sendVideoNote(CANAL_ID, msg.media_url);
      if (msg.contenu) {
        await bot.sendMessage(CANAL_ID, msg.contenu, options);
      }
      break;
    default:
      // Message texte seul
      await bot.sendMessage(CANAL_ID, msg.contenu, options);
      break;
  }
}

// Cron : vérification chaque minute
schedule.scheduleJob("* * * * *", async () => {
  try {
    // Récupération et verrouillage des messages à envoyer
    const { rows } = await pool.query(`
      UPDATE messages_auto
      SET sent = true
      WHERE id IN (
        SELECT id 
        FROM messages_auto
        WHERE sent = false AND send_date <= NOW()
        ORDER BY send_date ASC
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    `);

    const now = dayjs();

    for (const msg of rows) {
      try {
        await sendTelegramMessage(msg);
        console.log(`✅ Message ID ${msg.id} envoyé à ${now.format("HH:mm DD/MM")}`);
      } catch (err) {
        console.error(`❌ Erreur envoi message ID ${msg.id}:`, err.message || err);
        // En cas d'erreur, on peut remettre sent = false pour réessayer plus tard
        await pool.query(`UPDATE messages_auto SET sent = false WHERE id = $1`, [msg.id]);
      }
    }
  } catch (err) {
    console.error("❌ Erreur autoSender:", err.message || err);
  }
});

// Cron : suppression automatique des messages anciens (>3 jours) tous les jours à 02:15
schedule.scheduleJob("0 22 * * *", async () => {
  try {
    const { rowCount } = await pool.query(`
      DELETE FROM messages_auto 
      WHERE send_date < NOW() - INTERVAL '3 days'
    `);
    console.log(`🗑️ Suppression auto : ${rowCount} anciens messages supprimés.`);
  } catch (err) {
    console.error("❌ Erreur suppression anciens messages :", err.message || err);
  }
});
