require('dotenv').config();
const express = require('express');
const bot = require("./bot"); 
const sendFixedMessages = require("./sendFixedMessages");

const app = express();
const PORT = process.env.PORT || 3000;

// Pour Telegram
app.use(express.json());
app.post(`/webhook/${process.env.TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Test route
app.get('/', (req, res) => {
  res.send('✅ Serveur du bot en ligne via webhook');
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur webhook lancé sur le port ${PORT}`);
});


/////////////////////////////////////////////////////////////////////////////


const sendFixedMessagesDaily = require("./sendFixedMessagesDaily"); // notre script rotation FR/EN

app.get("/cron-task/fixed-messages-daily", async (req, res) => {
  try {
    await sendFixedMessagesDaily();
    res.send("✅ Messages fixes quotidiens envoyés avec rotation FR/EN");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Erreur lors de l'envoi des messages fixes");
  }
});

