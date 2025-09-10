require("dotenv").config();
const pool = require('./db'); 
const moment = require("moment-timezone");

async function sendFixedMessagesDaily() {
  try {
    const today = moment().tz("Africa/Lome").format("YYYY-MM-DD");

    // Vérifie si les messages du jour existent déjà
    const check = await pool.query(
      "SELECT COUNT(*) FROM daily_messages WHERE date = $1",
      [today]
    );

    if (parseInt(check.rows[0].count) > 0) {
      console.log("✅ Messages fixes déjà planifiés pour aujourd'hui.");
      return;
    }

    // Récupère tous les messages FR et EN
    const frMessages = await pool.query(
      "SELECT * FROM message_fixes WHERE lang = 'FR' ORDER BY RANDOM() LIMIT 5"
    );
    const enMessages = await pool.query(
      "SELECT * FROM message_fixes WHERE lang = 'EN' ORDER BY RANDOM() LIMIT 5"
    );

    const selected = [...frMessages.rows, ...enMessages.rows];

    // Sauvegarde dans daily_messages
    for (let msg of selected) {
      await pool.query(
        `INSERT INTO daily_messages (message_id, date, heures)
         VALUES ($1, $2, $3)`,
        [msg.id, today, msg.heures]
      );
    }

    console.log("✅ Messages fixes du jour sélectionnés avec succès.");

  } catch (err) {
    console.error("❌ Erreur lors de la sélection des messages fixes :", err.message);
  }
}

module.exports = sendFixedMessagesDaily;
