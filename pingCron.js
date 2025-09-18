const { ping } = require("./pingServer");
const bot = require("./bot");
const ADMIN_ID = process.env.ADMIN_ID;
const schedule = require("node-schedule");

let cycleActive = false;
let lastPingTime = 0;

// Vérifie si on est dans la plage 05:30 → 04:30
function isWithinPingHours() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  if (hours > 5 || (hours === 5 && minutes >= 30)) return true; // après 05h30
  if (hours < 4) return true; // avant 04h00
  if (hours === 4 && minutes <= 30) return true; // jusqu'à 04h30 inclus
  return false;
}

// Fonction ping sécurisée (anti-doublon)
async function safePing() {
  const now = Date.now();
  if (now - lastPingTime < 60 * 1000) {
    console.log("⚠️ Ping ignoré (trop rapproché)");
    return;
  }
  lastPingTime = now;
  return ping();
}

// Cron toutes les 14 minutes
schedule.scheduleJob("*/14 * * * *", async () => {
  const inCycle = isWithinPingHours();

  if (inCycle && !cycleActive) {
    cycleActive = true;
    console.log(`⏱️ [BOT2] Début du cycle de ping à ${new Date().toLocaleString()}`);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⏱️ [BOT2] Début du cycle de ping`);
  }

  if (!inCycle && cycleActive) {
    cycleActive = false;
    console.log(`⏱️ [BOT2] Fin du cycle de ping à ${new Date().toLocaleString()}`);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⏱️ [BOT2] Fin du cycle de ping`);
  }

  if (!inCycle) return;

  try {
    await safePing();
    const now = new Date();
    console.log(`⏰ [BOT2] Ping exécuté à ${now.getHours()}:${now.getMinutes()}`);
  } catch (err) {
    console.error("❌ [BOT2] Erreur ping cron :", err.message);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ [BOT2] Erreur ping cron : ${err.message}`);
  }
});

// Ping immédiat au démarrage si dans la plage
if (isWithinPingHours()) {
  cycleActive = true;
  console.log(`⏱️ [BOT2] Début du cycle de ping immédiat à ${new Date().toLocaleString()}`);
  if (ADMIN_ID) bot.sendMessage(ADMIN_ID, `⏱️ [BOT2] Début du cycle de ping immédiat`).catch(() => {});
  safePing().catch(err => console.error("❌ [BOT2] Erreur ping immédiat :", err.message));
}

console.log("✅ [BOT2] PingCron lancé & activé.");

