const { ping } = require("./pingServer");
const { bot } = require("./bot");
const ADMIN_ID = process.env.ADMIN_ID;
const schedule = require("node-schedule");

let cycleActive = false;

// Vérifie si on est dans la plage 05:30 → 04:30
function isWithinPingHours() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  // 05:30 → 23:59
  if (hours > 5 || (hours === 5 && minutes >= 30)) return true;

  // 00:00 → 04:30
  if (hours < 4) return true;
  if (hours === 4 && minutes <= 30) return true;

  return false;
}

// Cron toutes les 14 minutes
schedule.scheduleJob('*/14 * * * *', async () => {
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
    await ping();
    const now = new Date();
    console.log(`⏰ Ping exécuté à ${now.getHours()}:${now.getMinutes()}`);
  } catch (err) {
    console.error("❌ Erreur ping cron :", err.message);
  }
});

// Ping immédiat au démarrage si dans la plage
if (isWithinPingHours()) {
  cycleActive = true;
  console.log(`⏱️ Début du cycle de ping immédiat à ${new Date().toLocaleString()}`);
  bot.sendMessage(ADMIN_ID, `⏱️ Début du cycle de ping immédiat`).catch(() => {});
  ping().catch(err => console.error("❌ Erreur ping immédiat :", err.message));
}

console.log("✅ PingCron lancé avec cycle 05:30 → 04:30, toutes les 14 minutes.");

