require("dotenv").config();
const express = require("express");
const bot = require("./index");

const app = express();
app.use(express.json());

// Route test
app.get("/", (req, res) => {
  res.send("✅ Bot de validation en ligne !");
});

// Route du webhook
app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Lancement serveur
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
