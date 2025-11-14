// =================== IMPORTS ===================
const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");
const cron = require("node-cron");

// =================== ENV VARS ===================
const CANAL_ID = process.env.CANAL_ID;
const CANAL2_ID = process.env.CANAL2_ID;
const ADMIN_ID = process.env.ADMIN_ID;

// =================== CACHE ===================
let cache = {
  messagesFR: [],
  messagesEN: [],
  messagesCanal2: [],
  lastRefresh: null
};

// =================== UTILITAIRES ===================

// requête SQL sécurisée (utilisée quand on a besoin d'une connexion simple)
async function querySafe(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } catch (err) {
    console.error("❌ Erreur SQL:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

// retry automatique
async function retry(fn, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err) {
      console.warn(`⚠️ Tentative ${i + 1} échouée: ${err.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
      else throw err;
    }
  }
}

// timeout pour les requêtes Telegram
async function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("⏰ Timeout dépassé")), ms))
  ]);
}

// =================== CHARGEMENT DES MESSAGES ===================
async function loadMessages() {
  const res = await querySafe("SELECT * FROM message_fixes ORDER BY id");
  cache.messagesFR = res.rows.filter(m => m.lang?.toLowerCase() === "fr");
  cache.messagesEN = res.rows.filter(m => m.lang?.toLowerCase() === "en");
  cache.lastRefresh = Date.now();
  console.log(`📥 ${cache.messagesFR.length} FR / ${cache.messagesEN.length} EN rechargés.`);
  if (bot && ADMIN_ID) await bot.sendMessage(ADMIN_ID, `♻️ Canal1 rechargé à ${moment().tz("Africa/Lome").format("HH:mm")}`);
}

async function loadMessagesCanal2() {
  const res = await querySafe("SELECT * FROM message_fixes2 ORDER BY id");
  cache.messagesCanal2 = res.rows;
  cache.lastRefresh = Date.now();
  console.log(`📥 ${cache.messagesCanal2.length} messages Canal2 rechargés.`);
  if (bot && ADMIN_ID) await bot.sendMessage(ADMIN_ID, `♻️ Canal2 rechargé à ${moment().tz("Africa/Lome").format("HH:mm")}`);
}

async function loadMessagesSafe() {
  try { await retry(loadMessages, 3, 3000); } 
  catch (err) { 
    console.error("❌ Échec Canal1 :", err.message); 
    if (bot && ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Échec Canal1 : ${err.message}`); 
  }
  try { await retry(loadMessagesCanal2, 3, 3000); } 
  catch (err) { 
    console.error("❌ Échec Canal2 :", err.message); 
    if (bot && ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Échec Canal2 : ${err.message}`); 
  }
}

// =================== ROTATION ===================
async function getDailyMessages(langMessages, type) {
  if (!langMessages.length) return [];
  const res = await querySafe("SELECT last_index FROM daily_rotation WHERE lang = $1", [type]);
  let lastIndex = res.rowCount > 0 ? parseInt(res.rows[0].last_index, 10) : 0;
  const daily = [];
  for (let i = 0; i < 5; i++) {
    const index = (lastIndex + i + 1) % langMessages.length;
    daily.push(langMessages[index]);
  }
  const newIndex = (lastIndex + 5) % langMessages.length;
  if (res.rowCount > 0)
    await querySafe("UPDATE daily_rotation SET last_index = $1 WHERE lang = $2", [newIndex, type]);
  else
    await querySafe("INSERT INTO daily_rotation (lang, last_index) VALUES ($1, $2)", [type, newIndex]);
  return daily;
}

// =================== ENVOI MESSAGE ===================
async function sendMessage(msg, canalId, canalType = "canal1") {
  try {
    const tableName = canalType === "canal1" ? "message_fixes" : "message_fixes2";
    const exists = await querySafe(`SELECT 1 FROM ${tableName} WHERE id=$1`, [msg.id]);
    if (exists.rowCount === 0) return console.warn(`⚠️ Message ${msg.id} inexistant, skip.`);

    // --- Protection anti-duplication (check + insert) ---
    // Pour canal1 on vérifie et on marque le message comme envoyé AVANT l'envoi réel.
    // Ce comportement évite les doublons en cas de latence ou de multi-processus
    if (canalType === "canal1") {
      // Vérifie si déjà envoyé récemment (10 minutes)
      const sentCheck = await querySafe(
        "SELECT 1 FROM message_logs WHERE message_id=$1 AND sent_at > NOW() - INTERVAL '10 minutes'",
        [msg.id]
      );
      if (sentCheck.rowCount > 0) {
        console.log(`⏭️ Message ${msg.id} déjà envoyé récemment. Skip.`);
        return;
      }
      // Insère immédiatement une ligne pour réserver l'envoi (on fixe sent_at = NOW())
      // ON CONFLICT évite erreur si une autre instance a déjà inséré entretemps
      await querySafe(
        "INSERT INTO message_logs(message_id, sent_at) VALUES($1, NOW()) ON CONFLICT (message_id) DO NOTHING",
        [msg.id]
      );
    }

    const text = msg.media_text || "";
    const file = msg.file_id || msg.media_url;

    switch (msg.media_type) {
      case "photo":
        await withTimeout(bot.sendPhoto(canalId, file, { caption: text, parse_mode: "HTML" }));
        break;
      case "video":
        await withTimeout(bot.sendVideo(canalId, file, { caption: text, parse_mode: "HTML" }));
        break;
      case "audio":
        await withTimeout(bot.sendAudio(canalId, file, { caption: text, parse_mode: "HTML" }));
        break;
      case "voice":
        await withTimeout(bot.sendVoice(canalId, file));
        if (text) await withTimeout(bot.sendMessage(canalId, text, { parse_mode: "HTML" }));
        break;
      case "video_note":
        await withTimeout(bot.sendVideoNote(canalId, file));
        if (text) await withTimeout(bot.sendMessage(canalId, text, { parse_mode: "HTML" }));
        break;
      default:
        if (msg.media_url?.startsWith("http"))
          await withTimeout(bot.sendMessage(canalId, `${text}\n🔗 ${msg.media_url}`, { parse_mode: "HTML" }));
        else
          await withTimeout(bot.sendMessage(canalId, text, { parse_mode: "HTML" }));
        break;
    }

    console.log(`✅ Message ${msg.id} envoyé à ${moment().tz("Africa/Lome").format("HH:mm")} sur ${canalType}`);

    // pause pour éviter les 429
    await new Promise(r => setTimeout(r, 1200));
  } catch (err) {
    console.error(`❌ Erreur envoi message ${msg.id}:`, err.message);
    if (bot && ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Message ${msg.id} échoué: ${err.message}`);
  }
}

// =================== VERROU GLOBAL (transactionnel, fiable) ===================
// Utilise une transaction SELECT ... FOR UPDATE pour éviter les races entre instances
async function acquireLock(jobName, lockSeconds = 50) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS job_locks (job_name TEXT PRIMARY KEY, locked_at TIMESTAMP)`);

    const res = await client.query(
      "SELECT locked_at FROM job_locks WHERE job_name = $1 FOR UPDATE",
      [jobName]
    );

    const now = new Date();

    if (res.rowCount === 0) {
      // pas de lock existant -> on crée et on prend le lock
      await client.query(
        "INSERT INTO job_locks(job_name, locked_at) VALUES ($1, NOW())",
        [jobName]
      );
      await client.query('COMMIT');
      return true;
    }

    const lockedAt = res.rows[0].locked_at ? new Date(res.rows[0].locked_at) : new Date(0);
    const diff = (now - lockedAt) / 1000; // secondes depuis last lock

    if (diff >= lockSeconds) {
      // lock expiré -> on met à jour et on prend le lock
      await client.query(
        "UPDATE job_locks SET locked_at = NOW() WHERE job_name = $1",
        [jobName]
      );
      await client.query('COMMIT');
      return true;
    }

    // lock encore valide -> on refuse
    await client.query('ROLLBACK');
    return false;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    console.error("❌ acquireLock error:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

// =================== ENVOI AUTO ===================
async function sendScheduledMessages() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");
  const dailyFR = await getDailyMessages(cache.messagesFR, "fr");
  const dailyEN = await getDailyMessages(cache.messagesEN, "en");
  const dailyMessages = [...dailyFR, ...dailyEN];

  for (const msg of dailyMessages.filter(m => m?.heures?.split(",").map(h => h.trim()).includes(currentTime))) {
    // NOTE: sendMessage gère maintenant l'anti-duplication (insert préventif dans message_logs)
    await retry(() => sendMessage(msg, CANAL_ID, "canal1"), 3, 2000);
  }
}

async function sendScheduledMessagesCanal2() {
  const currentTime = moment().tz("Africa/Lome").format("HH:mm");
  for (const msg of cache.messagesCanal2.filter(m => m?.heures?.split(",").map(h => h.trim()).includes(currentTime))) {
    // pour canal2 on garde le même comportement (si besoin on peut ajouter la même protection)
    await retry(() => sendMessage(msg, CANAL2_ID, "canal2"), 3, 2000);
  }
}

// =================== HANDLERS GLOBAUX ===================
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason);
  if (bot && ADMIN_ID) bot.sendMessage(ADMIN_ID, `⚠️ unhandledRejection: ${reason.message || reason}`);
});
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  if (bot && ADMIN_ID) bot.sendMessage(ADMIN_ID, `💥 uncaughtException: ${err.message || err}`);
});

// =================== CRON ===================

// Chargement initial
(async () => { console.log("⏱️ Chargement initial messages..."); await loadMessagesSafe(); })();

// Rechargement quotidien à 05:45
cron.schedule("45 5 * * *", async () => { console.log("⏱️ Rechargement messages à 05:45..."); await loadMessagesSafe(); }, { timezone: "Africa/Lome" });

// Envoi automatique chaque minute avec verrou global
cron.schedule("* * * * *", async () => {
  try {
    const canRun = await acquireLock("autoSend");
    if (!canRun) return;
    await Promise.allSettled([sendScheduledMessages(), sendScheduledMessagesCanal2()]);
  } catch (err) {
    console.error("Erreur envoi auto:", err.message);
  }
}, { timezone: "Africa/Lome" });

// Heartbeat toutes les 5 minutes
setInterval(() => {
  console.log("💓 autoSend actif:", moment().tz("Africa/Lome").format("HH:mm:ss"));
}, 300000);

console.log("✅ autoSend.js corrigé lancé.");

module.exports = {
  loadMessagesSafe,
  sendScheduledMessages,
  sendScheduledMessagesCanal2,
  sendMessage
};
