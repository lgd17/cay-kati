require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const { sendManualCoupon, generateAndSendCoupon, cleanOldData } = require("./autoSend");

// ====== CONFIGURATION ENV ======
const PORT = process.env.PORT || 3000; // Render fournit le PORT automatiquement
const token = process.env.TELEGRAM_TOKEN;
if (!token) throw new Error("❌ TELEGRAM_TOKEN non défini !");
const baseUrl = process.env.BASE_URL;
if (!baseUrl) throw new Error("❌ BASE_URL manquant dans .env !");

const encodedToken = encodeURIComponent(token);

// ====== EXPRESS ======
const app = express();
app.use(bodyParser.json());

// ====== INITIALISATION DU BOT TELEGRAM ======
const bot = new TelegramBot(token, { webHook: true });
bot.setWebHook(`${baseUrl}/bot${encodedToken}`)
  .then(() => console.log(`✅ Webhook configuré : ${baseUrl}/bot${encodedToken}`))
  .catch(err => console.error("❌ Erreur lors du setWebhook :", err));

// ====== ROUTES BOT ======
app.post(`/bot${encodedToken}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ====== ENDPOINT DE PING ======
app.get("/ping", (req, res) => {
  console.log("💡 /ping reçu – bot réveillé !");
  res.status(200).send("✅ Bot is awake and running!");
});


// ====== LANCEMENT SERVEUR ======
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});

// ====== EXPORTS ======
module.exports = { app, bot };


