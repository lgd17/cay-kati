
const TelegramBot = require("node-telegram-bot-api");
const { pool } = require("./db");
require("dotenv").config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { webHook: { port: 443 } });
const ADMIN_IDS = process.env.ADMIN_IDS.split(",").map(Number);

// Active le webhook (à appeler une seule fois manuellement)
bot.setWebHook(`${process.env.BASE_URL}/webhook/${process.env.BOT_TOKEN}`);

const pendingCustomRejects = {};
