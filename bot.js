const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: true });
bot.setWebHook(`${process.env.BASE_URL}/webhook/${process.env.TELEGRAM_TOKEN}`);

module.exports = bot;
