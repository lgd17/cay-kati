// autoSend.js
const { pool } = require("./db"); 
const bot = require("./bot"); 
const moment = require("moment-timezone");
const cron = require("node-cron");

const CANAL_ID = process.env.CANAL_ID;      // Canal principal (rotation FR/EN)
const CANAL2_ID = process.env.CANAL2_ID;    // Deuxième canal (2 messages fixes)
const ADMIN_ID = process.env.ADMIN_ID;

let messagesFR = [];
let messagesEN = [];
let messagesCanal2 = [];

// =================== CHARGEMENT MESSAGES ===================

// Canal principal
async function loadMessages() {
  try {
    const res = await pool.query("SELECT * FROM message_fixes ORDER BY id");
    messagesFR = res.rows.filter(m => m.lang?.toLowerCase() === "fr");
    messagesEN = res.rows.filter(m => m.lang?.toLowerCase() === "en");
    console.log(`📥 ${messagesFR.length} messages FR et ${messagesEN.length} messages EN chargés.`);
    await bot.sendMessage(ADMIN_ID, `📥 Messages Canal1 chargés à ${moment().tz("Africa/Lome").format("HH:mm")}`);
  } catch (err) {
    console.error("❌ Erreur en chargeant les messages Canal1 :", err.message);
    if(bot) await bot.sendMessage(ADMIN_ID, `❌ Erreur Canal1 : ${err.message}`);
  }
}

// Canal 2
async function loadMessagesCanal2() {
  try {
    const res = await pool.query("SELECT * FROM message_fixes2 ORDER BY id");
    messagesCanal2 = res.rows;
    console.log(`📥 ${messagesCanal2.length} messages Canal2 chargés.`);
    if(bot) await bot.sendMessage(ADMIN_ID, `📥 Messages Canal2 chargés à ${moment().tz("Africa/Lome").format("HH:mm")}`);
  } catch (err) {
    console.error("❌ Erreur en chargeant les messages Canal2 :", err.message);
    if(bot) await bot.sendMessage(ADMIN_ID, `❌ Erreur Canal2 : ${err.message}`);
  }
}

// =================== ROTATION JOURNALIERES ===================

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

// =================== FONCTION ENVOI ===================

async function sendMessage(msg, canalId) {
  try {
    switch (msg.media_type) {
      case "photo":
        await bot.sendPhoto(canalId, msg.media_url, { caption: msg.media_text, parse_mode: 'HTML' });
        break;
      case "video":
        await bot.sendVideo(canalId, msg.media_url, { caption: msg.media_text, parse_mode: 'HTML' });
        break;
      case "audio":
        await bot.sendAudio(canalId, msg.media_url, { caption: msg.media_text, parse_mode: 'HTML' });
        break;
      case "voice":
        await bot.sendVoice(canalId, msg.media_url);
        if (msg.media_text) await bot.sendMessage(canalId, msg.media_text, { parse_mode: 'HTML' });
        break;
      case "video_note":
        await bot.sendVideoNote(canalId, msg.media_url);
        if (msg.media_text) await bot.sendMessage(canalId, msg.media_text, { parse_mode: 'HTML' });
        break;
      default:
        if (msg.media_url?.startsWith("http")) {
          await bot.sendMessage(canalId, `${msg.media_text}\n🔗 ${msg.media_url}`, { parse_mode: 'HTML' });
        } else {
          await bot.sendMessage(canalId, msg.media_text, { parse_mode: 'HTML' });
        }
        break;
    }

    await pool.query("INSERT INTO message_logs(message_id) VALUES($1)", [msg.id]);
    console.log(`✅ Message ${msg.id} envoyé à ${moment().tz("Africa/Lome").format("HH:mm")} sur canal ${canalId}`);
  } catch (err) {
    console.error(`❌ Erreur envoi message ${msg.id} canal ${canalId}:`, err.message);
    if(bot) await bot.sendMessage(ADMIN_ID, `❌ Erreur message ${msg.id} canal ${canalId}: ${err.message}`);
  }
}

// =================== ENVOI AUTOMATIQUE ===================

// Canal principal (rotation)
async function sendScheduledMessages() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");

  try {
    const dailyFR = await getDailyMessages(messagesFR, "fr");
    const dailyEN = await getDailyMessages(messagesEN, "en");
    const dailyMessages = [...dailyFR, ...dailyEN];

    const toSend = dailyMessages.filter(m => m && m.heures?.split(",").includes(currentTime));
    for (const msg of toSend) {
      const sentCheck = await pool.query(
        "SELECT 1 FROM message_logs WHERE message_id=$1 AND sent_at > NOW() - INTERVAL '10 minutes'",
        [msg.id]
      );
      if (sentCheck.rowCount > 0) continue;

      await sendMessage(msg, CANAL_ID);
    }
  } catch (err) {
    console.error("❌ Erreur générale Canal1 :", err.message);
    if(bot) await bot.sendMessage(ADMIN_ID, `❌ Erreur générale Canal1 : ${err.message}`);
  }
}

// Canal2 (2 messages fixes, pas de rotation)
async function sendScheduledMessagesCanal2() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");
  for (const msg of messagesCanal2) {
    if (!msg.heures?.split(",").includes(currentTime)) continue;

    const sentCheck = await pool.query(
      "SELECT 1 FROM message_logs WHERE message_id=$1 AND sent_at > NOW() - INTERVAL '10 minutes'",
      [msg.id]
    );
    if (sentCheck.rowCount > 0) continue;

    await sendMessage(msg, CANAL2_ID);
  }
}

// =================== CRON ===================

// Charger messages au démarrage
loadMessages();
loadMessagesCanal2();

// Recharger messages chaque jour à 05:45 Lomé
cron.schedule("45 5 * * *", async () => {
  console.log("⏱️ Rechargement messages Canal1 et Canal2 à 05:45 Lomé...");
  await loadMessages();
  await loadMessagesCanal2();
}, { timezone: "Africa/Lome" });

// Vérifier chaque minute pour envoyer les messages
cron.schedule("* * * * *", async () => {
  await sendScheduledMessages();
  await sendScheduledMessagesCanal2();
}, { timezone: "Africa/Lome" });

console.log("✅ autoSend.js lancé : rotation FR/EN + Canal2 2 messages fixes.");

module.exports = { loadMessages, sendScheduledMessages };
