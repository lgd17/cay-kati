
// cleanOldCoupons.js
const { pool } = require("./db");
const cron = require("node-cron");
const moment = require("moment-timezone");

// --- Fonction pour nettoyer les coupons vieux de 3 jours ---
async function cleanOldCoupons() {
  try {
    // Date limite : 3 jours avant aujourd'hui
    const limitDate = moment().tz("Africa/Lome").subtract(3, "days").format("YYYY-MM-DD");

    // Supprimer les coupons anciens dans les deux tables
    const tables = ["scheduled_coupons", "scheduled_coupons_2"];

    for (const table of tables) {
      const res = await pool.query(
        `DELETE FROM ${table} WHERE created_at < $1`,
        [limitDate]
      );
      console.log(`🗑 ${res.rowCount} coupons supprimés de ${table} avant ${limitDate}`);
    }
  } catch (err) {
    console.error("❌ Erreur lors du nettoyage des anciens coupons :", err);
  }
}

// --- Cron pour exécuter à 00:00 chaque jour ---
cron.schedule("0 0 * * *", () => {
  console.log("⏱ Nettoyage des anciens coupons...");
  cleanOldCoupons();
});
