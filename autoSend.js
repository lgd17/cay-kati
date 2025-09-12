// autoSend.js
// autoSend.js
const { pool } = require("./db");
const { bot } = require("./bot");
const moment = require("moment-timezone");
const cron = require("node-cron");

const CANAL_ID = process.env.CANAL_ID;
const ADMIN_ID = process.env.ADMIN_ID;

let messagesFR = [];
let messagesEN = [];

// ====== Charger tous les messages fixes ======
async function loadMessages() {
  try {
    const res = await pool.query("SELECT * FROM message_fixes ORDER BY id");
    messagesFR = res.rows.filter(m => m.lang?.toLowerCase() === "fr");
    messagesEN = res.rows.filter(m => m.lang?.toLowerCase() === "en");
    console.log(`📥 ${messagesFR.length} messages FR et ${messagesEN.length} messages EN chargés.`);
    await bot.sendMessage(ADMIN_ID, `📥 Messages quotidiens chargés à ${moment().tz("Africa/Lome").format("HH:mm")}`);
  } catch (err) {
    console.error("❌ Erreur en chargeant les messages :", err.message);
    await bot.sendMessage(ADMIN_ID, `❌ Erreur en chargeant les messages : ${err.message}`);
  }
}

// ====== Sélection des 5 messages par langue ======
async function getDailyMessages(langMessages, type) {
  if (!langMessages.length) return [];

  const res = await pool.query("SELECT last_index FROM daily_rotation WHERE lang = $1", [type]);
  let lastIndex = res.rowCount > 0 ? parseInt(res.rows[0].last_index, 10) : 0;

  const daily = [];
  for (let i = 0; i < 5; i++) {
    const index = (lastIndex + i + 1) % langMessages.length;
    daily.push(langMessages[index]);
  }

  const newIndex = (lastIndex + 5) % langMessages.length;
  if (res.rowCount > 0) {
    await pool.query("UPDATE daily_rotation SET last_index = $1 WHERE lang = $2", [newIndex, type]);
  } else {
    await pool.query("INSERT INTO daily_rotation (lang, last_index) VALUES ($1, $2)", [type, newIndex]);
  }

  return daily;
}

// ====== Envoyer les messages à l'heure prévue ======
async function sendScheduledMessages() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");

  try {
    const dailyFR = await getDailyMessages(messagesFR, "fr");
    const dailyEN = await getDailyMessages(messagesEN, "en");
    const dailyMessages = [...dailyFR, ...dailyEN];

    const toSend = dailyMessages.filter(m => m && m.heures?.split(",").includes(currentTime));

    for (const msg of toSend) {
      try {
        const sentCheck = await pool.query(
          "SELECT 1 FROM message_logs WHERE message_id=$1 AND sent_at > NOW() - INTERVAL '10 minutes'",
          [msg.id]
        );
        if (sentCheck.rowCount > 0) continue; // déjà envoyé récemment

        // ====== Envoi selon type de média ======
        switch (msg.media_type) {
          case "photo":
            await bot.sendPhoto(CANAL_ID, msg.media_url, { caption: msg.media_text });
            break;
          case "video":
            await bot.sendVideo(CANAL_ID, msg.media_url, { caption: msg.media_text });
            break;
          case "audio":
            await bot.sendAudio(CANAL_ID, msg.media_url, { caption: msg.media_text });
            break;
          case "voice":
            await bot.sendVoice(CANAL_ID, msg.media_url);
            await bot.sendMessage(CANAL_ID, msg.media_text);
            break;
          case "video_note":
            await bot.sendVideoNote(CANAL_ID, msg.media_url);
            await bot.sendMessage(CANAL_ID, msg.media_text);
            break;
          default:
            if (msg.media_url?.startsWith("http")) {
              await bot.sendMessage(CANAL_ID, `${msg.media_text}\n🔗 ${msg.media_url}`);
            } else {
              await bot.sendMessage(CANAL_ID, msg.media_text);
            }
            break;
        }

        await pool.query("INSERT INTO message_logs(message_id) VALUES($1)", [msg.id]);
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

// ====== Cron ======

// 1️⃣ Charger messages au démarrage
loadMessages();

// 2️⃣ Recharger chaque jour à 05:45 Lomé
cron.schedule("45 5 * * *", async () => {
  console.log("⏱️ Chargement quotidien des messages à 05:45 Lomé...");
  await loadMessages();
}, { timezone: "Africa/Lome" });

// 3️⃣ Vérifier chaque minute pour envoyer les messages
cron.schedule("* * * * *", async () => {
  await sendScheduledMessages();
}, { timezone: "Africa/Lome" });

console.log("✅ autoSend.js lancé : rotation FR/EN, support texte/photo/vidéo/audio/voice/video_note/URL et heures fixes.");


module.exports = { loadMessages, sendScheduledMessages };
