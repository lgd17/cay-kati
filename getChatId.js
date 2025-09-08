// getChatId.js
require("dotenv").config();
const { bot } = require("./bot");

console.log("🤖 En attente d'un message...");

// Dès que ton bot "voit" un message, il affiche l'ID du chat
bot.on("message", (msg) => {
  console.log("======================================");
  console.log("📌 Chat détecté :");
  console.log("Chat ID:", msg.chat.id);
  console.log("Nom :", msg.chat.title || msg.chat.first_name);
  console.log("Type :", msg.chat.type);
  console.log("======================================");
});
