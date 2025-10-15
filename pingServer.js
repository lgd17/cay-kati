const fetch = require("node-fetch");
const bot = require("./bot");
const ADMIN_ID = process.env.ADMIN_ID;
const URL = process.env.PING_URL || "https://onexadmin-bot.onrender.com/ping";

// Helper pour timeout
function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout du ping")), ms));
}

async function ping() {
  try {
    // Timeout de 10 secondes maximum
    const res = await Promise.race([
      fetch(URL),
      timeout(10000)
    ]);

    if (res.ok) {
      console.log(`✅ Ping réussi - Status: ${res.status}`);
    } else {
      console.warn(`⚠️ Ping échoué - Status: ${res.status}`);
      if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⚠️ Ping échoué - Status: ${res.status}`);
    }
  } catch (err) {
    console.error("❌ Erreur ping :", err.message);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur ping : ${err.message}`);
  }
}

module.exports = { ping };
