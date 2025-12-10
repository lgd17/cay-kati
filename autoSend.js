// autoSend.js - version A (group_id) - Permutation FR/EN
// =================== IMPORTS ===================
const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");
const cron = require("node-cron");

moment.tz.setDefault("Africa/Lome");

// =================== ENV VARS ===================
const CANAL_ID = process.env.CANAL_ID;
const CANAL2_ID = process.env.CANAL2_ID;
const ADMIN_ID = process.env.ADMIN_ID;

// =================== CACHE ===================
let cache = {
  allMessages: [],      // toutes les lignes de message_fixes
  messagesCanal2: [],
  lastRefresh: null
};

// =================== UTILITAIRES ===================
async function querySafe(sql, params = []) {
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  catch (err) { console.error("❌ Erreur SQL:", err.message || err); throw err; }
  finally { client.release(); }
}

async function retry(fn, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err) { if (i < retries - 1) await new Promise(r => setTimeout(r, delay)); else throw err; }
  }
}

async function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("⏰ Timeout dépassé")), ms))
  ]);
}

// =================== CHARGEMENT DB ===================
async function loadMessages() {
  const res = await querySafe("SELECT * FROM message_fixes ORDER BY id");
  cache.allMessages = res.rows;
  cache.lastRefresh = Date.now();
  console.log(`📥 ${cache.allMessages.length} messages (FR + EN) rechargés.`);
  if (bot && ADMIN_ID) await bot.sendMessage(ADMIN_ID, "♻️ Messages rechargés");
}

async function loadMessagesCanal2() {
  const res = await querySafe("SELECT * FROM message_fixes2 ORDER BY id");
  cache.messagesCanal2 = res.rows;
  cache.lastRefresh = Date.now();
  console.log(`📥 ${cache.messagesCanal2.length} messages Canal2 rechargés.`);
}

async function loadMessagesSafe() {
  try { await retry(loadMessages); } catch (err) { console.error("❌ Canal1 load error:", err.message); }
  try { await retry(loadMessagesCanal2); } catch (err) { console.error("❌ Canal2 load error:", err.message); }
}

// =================== ENVOI MESSAGE (multimédia) ===================
async function sendMessage(msg, canalId) {
  try {
    const text = msg.media_text || "";
    const file = msg.file_id || msg.media_url;

    switch (msg.media_type) {
      case "photo":
        await withTimeout(bot.sendPhoto(canalId, file, { caption: text, parse_mode: "HTML" })); break;
      case "video":
        await withTimeout(bot.sendVideo(canalId, file, { caption: text, parse_mode: "HTML" })); break;
      case "audio":
        await withTimeout(bot.sendAudio(canalId, file, { caption: text, parse_mode: "HTML" })); break;
      case "voice":
        await withTimeout(bot.sendVoice(canalId, file));
        if (text) await withTimeout(bot.sendMessage(canalId, text, { parse_mode: "HTML" })); break;
      case "video_note":
        await withTimeout(bot.sendVideoNote(canalId, file));
        if (text) await withTimeout(bot.sendMessage(canalId, text, { parse_mode: "HTML" })); break;
      default:
        // texte ou lien
        if (msg.media_url && String(msg.media_url).startsWith("http")) {
          await withTimeout(bot.sendMessage(canalId, `${text}\n🔗 ${msg.media_url}`, { parse_mode: "HTML" }));
        } else {
          await withTimeout(bot.sendMessage(canalId, text, { parse_mode: "HTML" }));
        }
        break;
    }

    console.log(`✅ Message ${msg.id} envoyé à ${moment().tz("Africa/Lome").format("HH:mm")} (${msg.lang})`);
  } catch (err) {
    console.error(`❌ Envoi message ${msg.id} erreur:`, err.message || err);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Envoi message ${msg.id} erreur: ${err.message || err}`);
    throw err; // remonter pour retry si besoin
  }
}

// =================== LOGIQUE D'ALTERNANCE PAR GROUP_ID ===================
/*
  Règles :
  - group_id identifie les versions FR/EN du même message
  - on n'envoie qu'UNE seule version par group_id et par jour
  - si group contient FR+EN : on choisit la langue opposée à last_lang_sent
  - si last_lang_sent absent : on choisit aléatoirement
  - après envoi on met last_sent = today et last_lang_sent = langEnvoyee pour TOUT le group_id
*/

async function sendScheduledMessages() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");
  const today = moment().tz("Africa/Lome").format("YYYY-MM-DD");

  // candidats à cette minute et non envoyés aujourd'hui
  const candidates = cache.allMessages.filter(m =>
    m.heures === currentTime && (!m.last_sent || moment(m.last_sent).format("YYYY-MM-DD") !== today)
  );

  if (!candidates.length) return;

  // grouper par group_id (0 = pas de group_id, on utilise id comme groupe)
  const grouped = new Map();
  for (const m of candidates) {
    const gid = (m.group_id && Number(m.group_id) > 0) ? String(m.group_id) : `single_${m.id}`;
    if (!grouped.has(gid)) grouped.set(gid, []);
    grouped.get(gid).push(m);
  }

  // traiter chaque groupe séquentiellement (pour éviter surcharges)
  for (const [gid, group] of grouped.entries()) {
    try {
      let toSend;

      if (group.length >= 2) {
        // cherche la langue envoyée la dernière fois dans ce groupe (prise sur n'importe quelle row du groupe)
        const lastLang = group.find(x => x.last_lang_sent)?.last_lang_sent || null;

        // choisir la version qui n'est pas lastLang
        toSend = group.find(x => x.lang !== lastLang);

        // si pas trouvé (ex: lastLang null ou toutes mêmes lang), choisir aléatoirement
        if (!toSend) toSend = group[Math.floor(Math.random() * group.length)];
      } else {
        // groupe à un seul message (pas de paire FR/EN) => on envoie celui-là
        toSend = group[0];
      }

      // envoi avec retry
      await retry(() => sendMessage(toSend, CANAL_ID), 3, 2000);

      // MAJ DB : marquer tous les messages du même group_id comme envoyés aujourd'hui
      if (gid.startsWith("single_")) {
        // use id of single
        const singleId = group[0].id;
        await querySafe("UPDATE message_fixes SET last_sent = NOW()::date, last_lang_sent = $1 WHERE id = $2", [toSend.lang, singleId]);
      } else {
        // gid is group_id
        const groupIdNum = Number(gid);
        await querySafe("UPDATE message_fixes SET last_sent = NOW()::date, last_lang_sent = $1 WHERE group_id = $2", [toSend.lang, groupIdNum]);
      }

      // log et petit délai pour éviter ratés/429
      console.log(`→ Groupe ${gid} : envoyé id ${toSend.id} (${toSend.lang})`);
      await new Promise(r => setTimeout(r, 800));

    } catch (err) {
      console.error(`🔥 Erreur traitement groupe ${gid}:`, err.message || err);
      if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `🔥 Erreur groupe ${gid}: ${err.message || err}`);
    }
  }
}

// =================== CANAL 2 (optionnel) ===================
async function sendScheduledMessagesCanal2() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");
  const today = moment().tz("Africa/Lome").format("YYYY-MM-DD");

  const candidates = cache.messagesCanal2.filter(m =>
    m.heures === currentTime && (!m.last_sent || moment(m.last_sent).format("YYYY-MM-DD") !== today)
  );

  for (const msg of candidates) {
    try {
      await retry(() => sendMessage(msg, CANAL2_ID), 3, 2000);
      await querySafe("UPDATE message_fixes2 SET last_sent = NOW()::date WHERE id = $1", [msg.id]);
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error("❌ Canal2 send error:", err.message || err);
    }
  }
}

// =================== CRON & INIT ===================
// Chargement initial
(async () => {
  console.log("⏱️ Chargement initial...");
  await loadMessagesSafe();
})();

// Rechargement quotidien à 05:45
cron.schedule("45 5 * * *", async () => {
  console.log("♻️ Reload 05:45");
  await loadMessagesSafe();
}, { timezone: "Africa/Lome" });

// Check chaque minute
cron.schedule("* * * * *", async () => {
  await Promise.allSettled([sendScheduledMessages(), sendScheduledMessagesCanal2()]);
}, { timezone: "Africa/Lome" });

// Heartbeat
setInterval(() => {
  console.log("💓 autoSend actif:", moment().tz("Africa/Lome").format("HH:mm:ss"));
}, 300000);

console.log("✅ autoSend.js FINAL lancé.");

module.exports = {
  loadMessagesSafe,
  sendScheduledMessages
};
