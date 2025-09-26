const { ping } = require("./pingServer");
const schedule = require("node-schedule");

// Vérifie si on est entre 5h30 et 3h30 du lendemain
function isWithinPingHours() {
  const now = new Date();
  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
  // 5:30 = 330 min, 3:30 = 210 min (du lendemain)
  return minutesSinceMidnight >= 330 || minutesSinceMidnight <= 210;
}

// Job cron toutes les 14 minutes
schedule.scheduleJob('*/14 * * * *', async () => {
  if (!isWithinPingHours()) return;

  try {
    await ping();
    console.log(`⏰ Ping exécuté à ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error("❌ Erreur ping cron :", err.message);
  }
});

// Ping immédiat au démarrage si dans la plage
if (isWithinPingHours()) {
  ping().catch(err => console.error("❌ Erreur ping immédiat :", err.message));
}
