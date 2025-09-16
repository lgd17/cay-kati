const { ping } = require("./pingServer");
const bot = require("./bot");
const ADMIN_ID = process.env.ADMIN_ID;
const schedule = require("node-schedule");

let cycleActive = false;
let sleepMode = false;
let lastPingTime = 0; // timestamp du dernier ping

// Définition de la fenêtre de sommeil (03:30 → 05:30)
const SLEEP_START = { hour: 3, minute: 30 }; 
const SLEEP_END   = { hour: 5, minute: 30 };

// Vérifie si l'heure actuelle est dans la fenêtre donnée
function nowIsBetween(start, end) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setHours(start.hour, start.minute, 0, 0);
  const endDate = new Date(now);
  endDate.setHours(end.hour, end.minute, 0, 0);

  if (startDate <= endDate) return now >= startDate && now < endDate;
  return now >= startDate || now < endDate; // si fenêtre traverse minuit
}

// Vérifie si on est dans la plage PingCron (05:30 → 04:30)
function isWithinPingHours() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  if (hours > 5 || (hours === 5 && minutes >= 30)) return true;
  if (hours < 4) return true;
  if (hours === 4 && minutes <= 30) return true;
  return false;
}

// Fonction ping sécurisée (anti-doublon)
async function safePing() {
  const now = Date.now();
  if (now - lastPingTime < 60 * 1000) { // ignore si dernier ping < 1 min
    console.log("⚠️ Ping ignoré (trop rapproché)");
    return;
  }
  lastPingTime = now;
  return ping();
}

// Cron toutes les 14 minutes
schedule.scheduleJob("*/14 * * * *", async () => {
  sleepMode = nowIsBetween(SLEEP_START, SLEEP_END);

  if (sleepMode) {
    if (cycleActive) {
      cycleActive = false;
      console.log(`😴 Mode sommeil activé à ${new Date().toLocaleString()}`);
      if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `😴 Mode sommeil activé (03h30 → 05h30)`);
    }
    return; // Pas de ping pendant sommeil
  }

  const inCycle = isWithinPingHours();

  if (inCycle && !cycleActive) {
    cycleActive = true;
    console.log(`⏱️ Début du cycle de ping à ${new Date().toLocaleString()}`);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⏱️ Début du cycle de ping`);
  }

  if (!inCycle && cycleActive) {
    cycleActive = false;
    console.log(`⏱️ Fin du cycle de ping à ${new Date().toLocaleString()}`);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⏱️ Fin du cycle de ping`);
  }

  if (!inCycle) return;

  try {
    await safePing();
    const now = new Date();
    console.log(`⏰ Ping exécuté à ${now.getHours()}:${now.getMinutes()}`);
  } catch (err) {
    console.error("❌ Erreur ping cron :", err.message);
  }
});

// Ping immédiat au démarrage si autorisé et pas en sleepMode
if (isWithinPingHours() && !nowIsBetween(SLEEP_START, SLEEP_END)) {
  cycleActive = true;
  console.log(`⏱️ Début du cycle de ping immédiat à ${new Date().toLocaleString()}`);
  bot.sendMessage(ADMIN_ID, `⏱️ Début du cycle de ping immédiat`).catch(() => {});
  safePing().catch(err => console.error("❌ Erreur ping immédiat :", err.message));
}

console.log("✅ PingCron lancé&activé.");
