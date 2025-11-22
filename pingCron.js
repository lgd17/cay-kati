
const schedule = require("node-schedule");
const moment = require("moment-timezone");
const { ping } = require("./pingServer");

// =================== ENV ===================
const ADMIN_ID = process.env.ADMIN_ID;

// =================== FLAGS ===================
let lastPing = Date.now();
let reloadInProgress = false;
let isPause = false; // 🔒 Flag pause volontaire
let cronInitialized = false; // ✅ Evite plusieurs cron si importé plusieurs fois



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

// ✅ Lancement cron ping interne + watchdog
function startPingCron() {
  if (cronInitialized) return; // Evite doublons
  cronInitialized = true;

// =================== 2️⃣ Ping avec retry ===================
async function safePing(retries = 3, delay = 2000) {
  if (isPause) return; // 🔒 Ne ping pas pendant la pause
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

// =================== 3️⃣ Pause volontaire ===================
// Début pause 03:30
schedule.scheduleJob('30 3 * * *', () => {
  isPause = true;
  console.log("🕒 Pause volontaire activée : ping et watchdog désactivés");
});

// Fin pause 05:07
schedule.scheduleJob('07 5 * * *', () => {
  isPause = false;
  console.log("🕒 Fin de pause : ping et watchdog réactivés");
  safePing(); // ping immédiat après réveil
});

// =================== 4️⃣ Cron ping ===================
schedule.scheduleJob("*/13 * * * *", async () => { // 🔹 Ping toutes les 13 min
  if (!isWithinPingHours() || isPause) {
    console.log(`🕒 Pause ping (${new Date().toLocaleTimeString()})`);
    return;
  }
  await safePing();
});

// =================== 5️⃣ Watchdog ===================
setInterval(() => {
  if (isPause) return; // 🔒 Ignore watchdog pendant pause
  const minutesSinceLastPing = (Date.now() - lastPing) / 60000;
  if (minutesSinceLastPing > 14) { // watchdog 14 min
    console.warn("🚨 Watchdog détecte freeze !");
    reloadAllModules();
  }
}, 14 * 60 * 1000);
  
  // =================== 6️⃣ Reload modules critique ===================
  
async function reloadAllModules() {
  if (reloadInProgress) {
    console.log("🔒 Reload déjà en cours, passage...");
    return;
  }

  reloadInProgress = true;
  console.log("🔄 Redémarrage interne des modules...");

  try {
    ({ ping } = reloadModule(require.resolve("./pingServer.js")) || { ping });
    autoSend = reloadModule(require.resolve("./autoSend.js")) || autoSend;
    autoSender = reloadModule(require.resolve("./autoSender.js")) || autoSender;
    dailyScheduler = reloadModule(require.resolve("./dailyScheduler.js")) || dailyScheduler;
    couponScheduler = reloadModule(require.resolve("./couponScheduler.js")) || couponScheduler;

    console.log("✅ Modules rechargés (fonctions non relancées) !");
  } catch (err) {
    console.error("❌ Erreur reload global :", err.message);
    if (ADMIN_ID) await safeSendAdmin(`❌ Erreur reload global : ${err.message}`);
  } finally {
    reloadInProgress = false;
  }
}


// =================== 7️⃣ Ping immédiat au démarrage ===================
if (isWithinPingHours() && !isPause) {
  safePing().catch(err => console.error("❌ Erreur ping immédiat Bot2 :", err.message));
}

console.log("✅ pingCron.js lancé : ping interne + watchdog + pause volontaire actif");

module.exports = { safePing, reloadAllModules, startPingCron };
