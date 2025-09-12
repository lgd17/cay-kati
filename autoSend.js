// autoSend.js
const { pool } = require("./db");
const { bot } = require("./bot");
const moment = require("moment-timezone");
const cron = require("node-cron");

const CANAL_ID = process.env.CANAL_ID;
const ADMIN_ID = process.env.ADMIN_ID;

let messagesFR = [];
let messagesEN = [];

/**
 * Charger les messages depuis la DB
 */
async function loadMessages() {
  try {
    const res = await pool.query("SELECT * FROM message_fixes ORDER BY id");
    messagesFR = res.rows.filter((m) => m.lang?.toLowerCase() === "fr");
    messagesEN = res.rows.filter((m) => m.lang?.toLowerCase() === "en");

    console.log(
      `📥 Messages chargés : ${messagesFR.length} FR | ${messagesEN.length} EN`
    );

    if (ADMIN_ID) {
      await bot.sendMessage(
        ADMIN_ID,
        `📥 *Messages fixes rechargés* à ${moment()
          .tz("Africa/Lome")
          .format("HH:mm")} \n- ${messagesFR.length} FR \n- ${messagesEN.length} EN`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (err) {
    console.error("❌ Erreur en chargeant les messages :", err);
    if (ADMIN_ID) {
      await bot.sendMessage(
        ADMIN_ID,
        `❌ *Erreur chargement messages fixes* : ${err.message}`,
        { parse_mode: "Markdown" }
      );
    }
  }
}

/**
 * Sélectionne 5 messages du jour par langue
 */
async function getDailyMessages(langMessages, type) {
  if (!langMessages || langMessages.length === 0) return [];

  try {
    const res = await pool.query(
      "SELECT last_index FROM daily_rotation WHERE lang = $1",
      [type]
    );

    let lastIndex = res.rowCount > 0 ? parseInt(res.rows[0].last_index, 10) : 0;
    if (isNaN(lastIndex)) lastIndex = 0;

    const daily = [];
    for (let i = 0; i < 5; i++) {
      const index = (lastIndex + i) % langMessages.length;
      daily.push(langMessages[index]);
    }

    const newIndex = (lastIndex + 5) % langMessages.length;

    if (res.rowCount > 0) {
      await pool.query(
        "UPDATE daily_rotation SET last_index = $1 WHERE lang = $2",
        [newIndex, type]
      );
    } else {
      await pool.query(
        "INSERT INTO daily_rotation (lang, last_index) VALUES ($1, $2)",
        [type, newIndex]
      );
    }

    return daily;
  } catch (err) {
    console.error(`❌ Erreur rotation ${type}:`, err);
    return [];
  }
}

/**
 * Envoi d’un message avec support multi-media
 */
async function sendMessageByType(msg) {
  try {
    const opts = msg.media_text
      ? { caption: msg.media_text, parse_mode: "Markdown" }
      : { parse_mode: "Markdown" };

    switch (msg.media_type) {
      case "photo":
        return bot.sendPhoto(CANAL_ID, msg.media_url, opts);
      case "video":
        return bot.sendVideo(CANAL_ID, msg.media_url, opts);
      case "audio":
        return bot.sendAudio(CANAL_ID, msg.media_url, opts);
      case "voice":
        return bot.sendVoice(CANAL_ID, msg.media_url, opts);
      case "video_note":
        return bot.sendVideoNote(CANAL_ID, msg.media_url);
      case "url":
        return bot.sendMessage(
          CANAL_ID,
          `[${msg.media_text || "Lien"}](${msg.media_url})`,
          { parse_mode: "Markdown" }
        );
      default:
        return bot.sendMessage(CANAL_ID, msg.media_text || "📌 Message vide", {
          parse_mode: "Markdown",
        });
    }
  } catch (err) {
    console.error(`❌ Erreur envoi message ${msg.id}:`, err.message);
    if (ADMIN_ID) {
      await bot.sendMessage(
        ADMIN_ID,
        `❌ *Erreur envoi message ${msg.id}* : ${err.message}`,
        { parse_mode: "Markdown" }
      );
    }
  }
}

/**
 * Vérifie l’heure et envoie les messages prévus
 */
async function sendScheduledMessages() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");

  try {
    const dailyFR = await getDailyMessages(messagesFR, "fr");
    const dailyEN = await getDailyMessages(messagesEN, "en");
    const dailyMessages = [...dailyFR, ...dailyEN];

    const toSend = dailyMessages.filter((m) => m.heures === currentTime);

    for (const msg of toSend) {
      const check = await pool.query(
        `SELECT 1 FROM message_logs WHERE message_id = $1 AND sent_at > NOW() - INTERVAL '10 minutes'`,
        [msg.id]
      );
      if (check.rowCount > 0) continue;

      await sendMessageByType(msg);

      await pool.query(`INSERT INTO message_logs (message_id) VALUES ($1)`, [
        msg.id,
      ]);
      console.log(`✅ Message ${msg.id} envoyé à ${currentTime}`);
    }
  } catch (err) {
    console.error("❌ Erreur générale autoSend:", err.message);
    if (ADMIN_ID) {
      await bot.sendMessage(
        ADMIN_ID,
        `❌ *Erreur générale autoSend* : ${err.message}`,
        { parse_mode: "Markdown" }
      );
    }
  }
}

/**
 * CRON jobs
 */
cron.schedule(
  "45 5 * * *",
  async () => {
    console.log("⏱️ Rechargement quotidien des messages (05:45)...");
    await loadMessages();
  },
  { timezone: "Africa/Lome" }
);

cron.schedule(
  "* * * * *",
  async () => {
    await sendScheduledMessages();
  },
  { timezone: "Africa/Lome" }
);

console.log(
  "✅ autoSend.js lancé avec rotation FR/EN, support texte/photo/vidéo/audio/voice/video_note/url et horaires fixes."
);

module.exports = { loadMessages, sendScheduledMessages };
