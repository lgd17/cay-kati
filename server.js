require('dotenv').config();
const express = require('express');
const bot = require("./bot"); 
const sendFixedMessagesDaily = require("./sendFixedMessagesDaily");
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




// Route pour choisir les 10 messages du jour (rotation FR/EN)
app.get("/cron-task/fixed-daily", async (req, res) => {
  try {
    await sendFixedMessagesDaily();
    res.send("✅ Messages du jour sélectionnés (rotation FR/EN)");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Erreur daily fixed");
  }
});

// Route pour envoyer les messages fixes à une heure donnée
app.get("/cron-task/fixed", async (req, res) => {
  try {
    const hour = req.query.hour; // ex: ?hour=06:00
    if (!hour) return res.status(400).send("❌ Heure manquante");
    await sendFixedMessages(hour);
    res.send(`✅ Messages fixes envoyés pour ${hour}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Erreur fixed");
  }
});

