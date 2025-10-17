const { ping } = require("./pingServer"); // ping interne du Bot2
const schedule = require("node-schedule");

// =================== 1️⃣ Vérification plage horaire ===================
function isWithinPingHours() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  // Plage 05:07 → 03:30 du lendemain
  return (hours > 5 || (hours === 5 && minutes >= 7)) || (hours < 3 || (hours === 3 && minutes <= 30));
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

// =================== 3️⃣ Cron ping ===================
schedule.scheduleJob("*/14 * * * *", async () => {
  if (!isWithinPingHours()) return;
  await safePing();
});

// =================== 4️⃣ Ping immédiat au démarrage ===================
if (isWithinPingHours()) {
  safePing().catch(err => console.error("❌ Erreur ping immédiat Bot2 :", err.message));
}

// =================== 5️⃣ Redémarrage automatique quotidien ===================
schedule.scheduleJob("0 2 * * *", () => {
  console.log("♻️ Redémarrage automatique du bot à 02:00 UTC...");
  process.exit(0);
});

console.log("✅ pingCron.js lancé : ping interne + restart quotidien actif");
