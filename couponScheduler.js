// ================== IMPORTS ==================
const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");
const cron = require("node-cron");

// ================== CONFIG ==================
const CANAL1_ID = process.env.CANAL_ID;
const CANAL2_ID = process.env.CANAL2_ID;
const TIMEZONE = "Africa/Lome";

// ================== FLAGS ==================
let isRunning1 = false;
let isRunning2 = false;

// ================== FONCTION D'ENVOI ==================
async function sendCoupons(channelId, tableName, isRunningFlagRef) {
  if (isRunningFlagRef.value) {
    console.log(`⚠️ ${tableName} déjà en cours, skip.`);
    return;
  }

  if (!channelId) return;

  isRunningFlagRef.value = true;
  const now = moment().tz(TIMEZONE).format("HH:mm");

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${tableName}
       WHERE is_active = true
       ORDER BY schedule_time ASC, priority ASC`
    );

    if (!rows.length) {
      console.log(`🕐 Aucun coupon actif dans ${tableName} à ${now}`);
      return;
    }

    for (const coupon of rows) {
      if (coupon.schedule_time === now) {
        try {
          const caption = coupon.content?.trim() || "<i>(Pas de texte)</i>";
          const mediaOpts = { caption, parse_mode: "HTML" };

          if (coupon.media_type === "photo" && coupon.media_url)
            await bot.sendPhoto(channelId, coupon.media_url, mediaOpts);
          else if (coupon.media_type === "video" && coupon.media_url)
            await bot.sendVideo(channelId, coupon.media_url, mediaOpts);
          else
            await bot.sendMessage(channelId, caption, { parse_mode: "HTML" });

          console.log(`✅ Coupon envoyé (${tableName}) ID ${coupon.id} à ${now}`);

          await pool.query(`UPDATE ${tableName} SET is_active = false WHERE id = $1`, [coupon.id]);
        } catch (err) {
          console.error(`❌ Erreur coupon ID ${coupon.id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error(`💥 Erreur SQL (${tableName}):`, err.message);
  } finally {
    isRunningFlagRef.value = false;
  }
}

// ================== FONCTION PRINCIPALE EXPORTABLE ==================
function startCouponScheduler() {
  console.log("🚀 Démarrage couponScheduler...");

  const flag1 = { value: isRunning1 };
  const flag2 = { value: isRunning2 };

  cron.schedule("* * * * *", async () => {
    try {
      await Promise.all([
        sendCoupons(CANAL1_ID, "scheduled_coupons", flag1),
        sendCoupons(CANAL2_ID, "scheduled_coupons_2", flag2)
      ]);
    } catch (err) {
      console.error("❌ Erreur tâche principale:", err.message);
    }
  }, { timezone: TIMEZONE });
}

// ================== HANDLERS GLOBAUX ==================
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Promesse non gérée:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("💥 Erreur fatale non interceptée:", err);
});

console.log("✅ couponScheduler.js prêt (optimisé Render).");

// ================== EXPORT ==================
module.exports = { sendCoupons, startCouponScheduler };
