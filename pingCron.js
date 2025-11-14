const path = require("path");
const schedule = require("node-schedule");
const moment = require("moment-timezone");

// =================== ENV ===================
const ADMIN_ID = process.env.ADMIN_ID;

// =================== FLAGS ===================
let lastPing = Date.now();
let reloadInProgress = false;

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
      lastPing = Date.now(); // ← Mise à jour du ping pour watchdog
      console.log(`⏰ Ping interne Bot2 réussi à ${new Date().toLocaleTimeString()}`);
      return;
    } catch (err) {
      console.warn(`⚠️ Tentative ping ${i + 1} échouée: ${err.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
      else console.error("❌ Ping interne Bot2 échoué définitivement :", err.message);
    }
  }
}

// =================== 3️⃣ Rechargement modules ===================
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

// =================== 4️⃣ Cron ping ===================
schedule.scheduleJob("*/14 * * * *", async () => {
  if (!isWithinPingHours()) {
    console.log(`🕒 Pause ping (${new Date().toLocaleTimeString()})`);
    return;
  }
  await safePing();
});

// =================== 5️⃣ Reload modules critique (sans relance des fonctions) ===================
async function reloadAllModules() {
  if (reloadInProgress) {
    console.log("🔒 Reload déjà en cours, passage...");
    return;
  }

  reloadInProgress = true;
  console.log("🔄 Redémarrage interne des modules...");

  try {
    // Reload seulement les modules critiques
    ({ ping } = reloadModule(path.join(__dirname, "pingServer.js")) || { ping });
    autoSend = reloadModule(path.join(__dirname, "autoSend.js")) || autoSend;
    autoSender = reloadModule(path.join(__dirname, "autoSender.js")) || autoSender;
    dailyScheduler = reloadModule(path.join(__dirname, "dailyScheduler.js")) || dailyScheduler;
    couponScheduler = reloadModule(path.join(__dirname, "couponScheduler.js")) || couponScheduler;

    console.log("✅ Modules rechargés (fonctions non relancées) !");
  } catch (err) {
    console.error("❌ Erreur reload global :", err.message);
    if (ADMIN_ID) await safeSendAdmin(`❌ Erreur reload global : ${err.message}`);
  } finally {
    reloadInProgress = false;
  }
}

// =================== 6️⃣ Redémarrage interne quotidien ===================
schedule.scheduleJob("00 2 * * *", async () => {
  await reloadAllModules();
});

// =================== 7️⃣ Envoi Admin ===================
async function safeSendAdmin(msg) {
  try {
    if (ADMIN_ID && bot) await bot.sendMessage(ADMIN_ID, msg);
  } catch (err) {
    console.error("❌ Impossible d'envoyer message Admin:", err.message);
  }
}

// =================== 8️⃣ Watchdog (auto-détection freeze) ===================
setInterval(() => {
  const minutesSinceLastPing = (Date.now() - lastPing) / 60000;
  if (minutesSinceLastPing > 60) { // plus d'1h sans ping
    console.warn("🚨 Watchdog détecte freeze !");
    reloadAllModules(); // reload sécurisé grâce au flag
  }
}, 15 * 60 * 1000); // toutes les 15 minutes

// =================== 9️⃣ Ping immédiat au démarrage ===================
if (isWithinPingHours()) {
  safePing().catch(err => console.error("❌ Erreur ping immédiat Bot2 :", err.message));
}

console.log("✅ pingCron.js lancé : ping interne + restart quotidien actif");

module.exports = { reloadAllModules, safePing };
