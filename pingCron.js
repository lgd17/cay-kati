const path = require("path");
const schedule = require("node-schedule");
const moment = require("moment-timezone");

// =================== ENV ===================
const ADMIN_ID = process.env.ADMIN_ID;

// =================== 1️⃣ Vérification plage horaire ===================
function isWithinPingHours() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  // ✅ Plage 05:07 → 03:30 du lendemain
  const inMorning = (hours > 5 || (hours === 5 && minutes >= 7));
  const inNight = (hours < 3 || (hours === 3 && minutes <= 30));

  return inMorning || inNight;
}

// =================== 2️⃣ Ping avec retry ===================
async function safePing(retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await ping();
      console.log(`⏰ Ping interne Bot2 réussi à ${new Date().toLocaleTimeString()}`);
      return;
    } catch (err) {
      console.warn(`⚠️ Tentative ping ${i + 1} échouée: ${err.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
      else console.error("❌ Ping interne Bot2 échoué définitivement :", err.message);
    }
  }
}

// =================== 2️⃣ Rechargement modules ===================
function reloadModule(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
  } catch (err) {
    console.error(`❌ Erreur lors du rechargement de ${modulePath}:`, err.message);
    return null;
  }
}

// Modules critiques
let { ping } = require("./pingServer");
let autoSend = reloadModule(path.join(__dirname, "autoSend.js"));
let autoSender = reloadModule(path.join(__dirname, "autoSender.js"));
let dailyScheduler = reloadModule(path.join(__dirname, "dailyScheduler.js"));
let couponScheduler = reloadModule(path.join(__dirname, "couponScheduler.js"));

// Timestamp du dernier ping réussi
let lastPing = Date.now();


// =================== 3️⃣ Cron ping ===================
schedule.scheduleJob("*/14 * * * *", async () => {
  if (!isWithinPingHours()) {
    console.log(`🕒 Pause ping (${new Date().toLocaleTimeString()})`);
    return;
  }
  await safePing();
});

// =================== 5️⃣ Redémarrage interne quotidien ===================
// =================== RELOAD DYNAMIQUE ===================
async function reloadAllModules() {
  console.log("🔄 Redémarrage interne des modules...");

  try {
    ({ ping } = reloadModule(path.join(__dirname, "pingServer.js")) || { ping });
    autoSend = reloadModule(path.join(__dirname, "autoSend.js")) || autoSend;
    autoSender = reloadModule(path.join(__dirname, "autoSender.js")) || autoSender;
    dailyScheduler = reloadModule(path.join(__dirname, "dailyScheduler.js")) || dailyScheduler;
    couponScheduler = reloadModule(path.join(__dirname, "couponScheduler.js")) || couponScheduler;

    // Relance des modules si fonctions exportées disponibles
    if (ping) await ping();
    if (autoSend?.loadMessagesSafe) await autoSend.loadMessagesSafe();
    if (autoSend?.sendScheduledMessages) await autoSend.sendScheduledMessages();
    if (autoSend?.sendScheduledMessagesCanal2) await autoSend.sendScheduledMessagesCanal2();
    if (autoSender?.startAutoSender) await autoSender.startAutoSender?.();
    if (dailyScheduler?.startDailyCoupons) await dailyScheduler.startDailyCoupons?.();
    if (couponScheduler?.startCouponScheduler) await couponScheduler.startCouponScheduler?.();

    console.log("✅ Tous les modules rechargés et relancés avec succès !");
  } catch (err) {
    console.error("❌ Erreur reload global :", err.message);
    if (ADMIN_ID) await safeSendAdmin(`❌ Erreur reload global : ${err.message}`);
  }
}

// Redémarrage interne quotidien à 02:00 UTC
schedule.scheduleJob("00 2 * * *", async () => {
  await reloadAllModules();
});

// =================== ENVOI ADMIN ===================
async function safeSendAdmin(msg) {
  try {
    if (ADMIN_ID && bot) await bot.sendMessage(ADMIN_ID, msg);
  } catch (err) {
    console.error("❌ Impossible d'envoyer message Admin:", err.message);
  }
}


// =================== 6️⃣ Watchdog (auto-détection freeze) ===================
setInterval(() => {
  const minutesSinceLastPing = (Date.now() - lastPing) / 60000;
  if (minutesSinceLastPing > 60) { // plus d'1h sans ping
    console.warn("🚨 Watchdog détecte freeze ! Redémarrage interne en cours...");
    reloadAllModules();
  }
}, 15 * 60 * 1000); // Vérifie toutes les 10 minutes


// =================== 4️⃣ Ping immédiat au démarrage ===================
if (isWithinPingHours()) {
  safePing().catch(err => console.error("❌ Erreur ping immédiat Bot2 :", err.message));
}


console.log("✅ pingCron.js lancé : ping interne + restart quotidien actif");

module.exports = { reloadAllModules, safePing };
