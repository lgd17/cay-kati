const { ping } = require("./pingServer"); // ping interne du Bot2
const schedule = require("node-schedule");

// ---------- 1️⃣ Ping interne à partir de 05:07 ----------
function isWithinPingHours() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  // Plage 05:07 → 03:30 du lendemain
  return (hours > 5 || (hours === 5 && minutes >= 7)) || (hours < 3 || (hours === 3 && minutes <= 30));
}

// Job cron toutes les 14 minutes pour le ping interne
schedule.scheduleJob("*/14 * * * *", async () => {
  if (!isWithinPingHours()) return;

  try {
    await ping();
    console.log(`⏰ Ping interne Bot2 exécuté à ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error("❌ Erreur ping interne Bot2 :", err.message);
  }
});

// Ping immédiat si Bot2 démarre entre 05:07 et 03:30
if (isWithinPingHours()) {
  ping().catch(err => console.error("❌ Erreur ping immédiat Bot2 :", err.message));
}
