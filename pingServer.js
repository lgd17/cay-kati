const fetch = require("node-fetch");
const bot = require("./bot");
const ADMIN_ID = process.env.ADMIN_ID;

const URL = process.env.PING_URL || "https://onexadmin-bot.onrender.com";

async function ping() {
  try {
    const res = await fetch(URL);
    if (res.ok) {
      console.log(`✅ Ping réussi - Status: ${res.status}`);
      // Optionnel : notification Telegram
      // await bot.sendMessage(ADMIN_ID, `✅ Ping réussi - Status: ${res.status}`);
    } else {
      console.warn(`⚠️ Ping échoué - Status: ${res.status}`);
      if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⚠️ Ping échoué - Status: ${res.status}`);
    }
  } catch (err) {
    console.error("❌ Erreur ping :", err.message);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur ping : ${err.message}`);
  }
}

// Exporter la fonction pour index.js
module.exports = { ping };
