const fetch = require("node-fetch");
const bot = require("./bot");
const ADMIN_ID = process.env.ADMIN_ID;
const URL = process.env.PING_URL || "https://onexadmin-bot.onrender.com/ping";

// Timeout helper
function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("⏳ Timeout du ping")), ms));
}

// Ping avec retry
async function ping(retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await Promise.race([fetch(URL), timeout(10000)]);
      if (res.ok) {
        console.log(`✅ Ping réussi - Status: ${res.status}`);
        return;
      } else {
        console.warn(`⚠️ Ping échoué - Status: ${res.status}`);
        if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⚠️ Ping échoué - Status: ${res.status}`);
      }
    } catch (err) {
      console.warn(`⚠️ Tentative ${i + 1} échouée: ${err.message}`);
      if (i === retries - 1) {
        console.error(`❌ Ping définitivement échoué après ${retries} tentatives`);
        if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Ping définitivement échoué: ${err.message}`);
      } else {
        await new Promise(r => setTimeout(r, delay)); // pause avant retry
      }
    }
  }
}

module.exports = { ping };
