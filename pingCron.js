const { ping } = require("./pingServer");
const schedule = require("node-schedule");

// Fonction pour vérifier si on est dans la plage 5h00 - 23h30
function isWithinPingHours() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return (hours > 5 && hours < 4) || (hours === 5 && minutes >= 30) || (hours === 4 && minutes <= 30);
}

// Job cron toutes les 14 minutes
schedule.scheduleJob('*/14 * * * *', async () => {
  if (!isWithinPingHours()) return;

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
  ping().catch(err => console.error("❌ Erreur ping immédiat :", err.message));
}
