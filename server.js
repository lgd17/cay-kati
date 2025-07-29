require('dotenv').config();
const express = require('express');
const bot = require("./bot"); 

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


app.get('/ping', async (req, res) => {
  try {
    const adminId = process.env.ADMIN_ID || 'TON_TELEGRAM_ID';

    await bot.sendMessage(adminId, `🟢 Ping reçu à ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Lome' })}`);

    res.send("✅ Ping reçu et message envoyé.");
  } catch (error) {
    console.error("Erreur lors du ping :", error);
    res.status(500).send("❌ Erreur lors de l'envoi du message.");
  }
});




