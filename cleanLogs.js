const schedule = require('node-schedule');
const moment = require('moment-timezone');
const { pool } = require("./db");
const { bot } = require('./bot');
const ADMIN_ID = process.env.ADMIN_ID;

schedule.scheduleJob('0 1 * * *', async () => {
  try {
    const result = await pool.query(
      `DELETE FROM message_logs WHERE sent_at < NOW() - INTERVAL '7 days'`
    );

    const count = result.rowCount;

    const loméTime = moment().tz('Africa/Lome').format('HH:mm:ss');

    console.log(`🧹 ${count} ancien(s) log(s) supprimé(s) à ${loméTime} (Lomé)`);

    if (count > 0) {
      await bot.sendMessage(
        ADMIN_ID,
        `🧹 ${count} log(s) supprimé(s) à ${loméTime} (heure Lomé)`
      );
    }
  } catch (err) {
    console.error("Erreur nettoyage logs :", err.message);
    await bot.sendMessage(ADMIN_ID, `❌ Erreur nettoyage logs : ${err.message}`);
  }
});
