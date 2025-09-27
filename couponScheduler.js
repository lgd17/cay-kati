// couponScheduler.js
const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");
const cron = require("node-cron");

const CANAL1_ID = process.env.CANAL_ID;      
const CANAL2_ID = process.env.CANAL2_ID;    

// --- Fonction générique pour envoyer coupons depuis n'importe quelle table ---
async function sendCoupons(channelId, tableName) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${tableName} WHERE is_active = true ORDER BY schedule_time, priority`
    );

    const now = moment().tz("Africa/Lome").format("HH:mm");

    for (const coupon of rows) {
      if (coupon.schedule_time === now) {
        let htmlContent = coupon.content || "<i>(Pas de texte)</i>";

        try {
          if (coupon.media_type === "photo") {
            await bot.sendPhoto(channelId, coupon.media_url, {
              caption: htmlContent,
              parse_mode: "HTML",
            });
          } else if (coupon.media_type === "video") {
            await bot.sendVideo(channelId, coupon.media_url, {
              caption: htmlContent,
              parse_mode: "HTML",
            });
          } else {
            await bot.sendMessage(channelId, htmlContent, { parse_mode: "HTML" });
          }

          console.log(`✅ Coupon envoyé à ${now} dans ${channelId} (ID: ${coupon.id})`);

          // Marquer le coupon comme envoyé
          await pool.query(
            `UPDATE ${tableName} SET is_active = false WHERE id = $1`,
            [coupon.id]
          );

        } catch (err) {
          console.error(`❌ Erreur envoi coupon ID ${coupon.id} dans ${channelId}:`, err);
        }
      }
    }
  } catch (err) {
    console.error(`❌ Erreur récupération coupons dans ${tableName}:`, err);
  }
}

// --- Cron pour CANAL1 ---
cron.schedule("* * * * *", () => {
  sendCoupons(CANAL1_ID, "scheduled_coupons");
  console.log("⏱ Vérification des coupons CANAL1...");
});

// --- Cron pour CANAL2 ---
if (CANAL2_ID) {
  cron.schedule("* * * * *", () => {
    sendCoupons(CANAL2_ID, "scheduled_coupons_2");
    console.log("⏱ Vérification des coupons CANAL2...");
  });
}

module.exports = { sendCoupons };
