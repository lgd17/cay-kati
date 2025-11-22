const schedule = require("node-schedule");
const moment = require("moment-timezone");
let { ping } = require("./pingServer");

// =============== ENV ==================
const ADMIN_ID = process.env.ADMIN_ID;

// =============== FLAGS ==================
let lastPing = Date.now();
let reloadInProgress = false;
let isPause = false;
let cronInitialized = false;

// =============== 1️⃣ Vérification plage horaire ==================
function isWithinPingHours() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();

  const inMorning = (h > 5 || (h === 5 && m >= 7));
  const inNight = (h < 3 || (h === 3 && m <= 30));
  return inMorning || inNight;
}

// =============== 2️⃣ Ping avec retry ==================
async function safePing(retries = 3, delay = 2000) {
  if (isPause) return;

  for (let i = 0; i < retries; i++) {
    try {
      await ping();
      lastPing = Date.now();
      console.log(`⏰ Ping interne Bot2 réussi à ${new Date().toLocaleTimeString()}`);
      return;
    } catch (err) {
      console.warn(`⚠️ Tentative ping ${i + 1} échouée : ${err.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
    }
  }

  console.error("❌ Ping interne échoué définitivement");
}

// =============== 3️⃣ Pause automatique ==================
schedule.scheduleJob("30 3 * * *", () => {
  isPause = true;
  console.log("🕒 Pause activée");
});

schedule.scheduleJob("07 5 * * *", () => {
  isPause = false;
  console.log("🕒 Pause terminée");
  safePing();
});

// =============== 4️⃣ Lancement des CRON ==================
function startPingCron() {
  if (cronInitialized) return;
  cronInitialized = true;

  // Ping toutes les 13 minutes
  schedule.scheduleJob("*/13 * * * *", async () => {
    if (!isWithinPingHours() || isPause) {
      console.log(`🕒 Pause ping (${new Date().toLocaleTimeString()})`);
      return;
    }
    await safePing();
  });

  // Watchdog
  setInterval(() => {
    if (isPause) return;
    const diff = (Date.now() - lastPing) / 60000;
    if (diff > 14) {
      console.warn("🚨 Watchdog détecte freeze !");
      reloadAllModules();
    }
  }, 14 * 60 * 1000);

  console.log("🚀 startPingCron initialisé");
}

// =============== 5️⃣ Reload modules ==================
function reloadModule(path) {
  delete require.cache[path];
  return require(path);
}

function reloadAllModules() {
  if (reloadInProgress) return;

  reloadInProgress = true;
  console.log("🔄 Reload modules...");

  try {
    ({ ping } = reloadModule(require.resolve("./pingServer.js")) || { ping });
    autoSend = reloadModule(require.resolve("./autoSend.js")) || autoSend;
    autoSender = reloadModule(require.resolve("./autoSender.js")) || autoSender;
    dailyScheduler = reloadModule(require.resolve("./dailyScheduler.js")) || dailyScheduler;
    couponScheduler = reloadModule(require.resolve("./couponScheduler.js")) || couponScheduler;

    console.log("✅ Reload terminé");
  } catch (err) {
    console.error("❌ Erreur reload :", err.message);
  }

  reloadInProgress = false;
}

// =============== 6️⃣ Ping immédiat au démarrage ==================
if (isWithinPingHours() && !isPause) safePing();

console.log("✅ pingCron.js chargé");

module.exports = { safePing, reloadAllModules, startPingCron };
