// autoSender.js (ou couponScheduler.js)
const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");
const cron = require("node-cron");

// ================== CONFIG ==================
const CANAL1_ID = process.env.CANAL_ID;
const CANAL2_ID = process.env.CANAL2_ID;
const TIMEZONE = "Africa/Lome";

// ================== ETAT ==================
let isRunning1 = false;
let isRunning2 = false;

// ================== FONCTION PRINCIPALE ==================
async function sendCoupons(channelId, tableName, runningFlag) {
  if (runningFlag.flag) {
    console.log(`⚠️ Tâche déjà en cours pour ${tableName}, on saute ce cycle.`);
    return;
  }

  runningFlag.flag = true;
  const now = moment().tz(TIMEZONE).format("HH:mm");

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${tableName}
       WHERE is_active = true
       ORDER BY schedule_time ASC, priority ASC`
    );

    if (!rows.length) {
      console.log(`🕐 Aucun coupon actif dans ${tableName} à ${now}`);
      runningFlag.flag = false;
      return;
    }

    for (const coupon of rows) {
      // Envoi uniquement si l'heure correspond EXACTEMENT à l'heure planifiée
      if (coupon.schedule_time === now) {
        let htmlContent = coupon.content?.trim() || "<i>(Pas de texte)</i>";

        try {
          if (coupon.media_type === "photo" && coupon.media_url) {
            await bot.sendPhoto(channelId, coupon.media_url, {
              caption: htmlContent,
              parse_mode: "HTML",
            });
          } else if (coupon.media_type === "video" && coupon.media_url) {
            await bot.sendVideo(channelId, coupon.media_url, {
              caption: htmlContent,
              parse_mode: "HTML",
            });
          } else {
            await bot.sendMessage(channelId, htmlContent, { parse_mode: "HTML" });
          }

          console.log(`✅ Coupon envoyé à ${now} sur ${channelId} (ID: ${coupon.id})`);

          // Marquer comme envoyé
          await pool.query(
            `UPDATE ${tableName} SET is_active = false WHERE id = $1`,
            [coupon.id]
          );
        } catch (err) {
          console.error(`❌ Erreur d'envoi du coupon ID ${coupon.id} (${tableName}):`, err.message);
        }
      }
    }
  } catch (err) {
    console.error(`💥 Erreur SQL pour ${tableName}:`, err.message);
  } finally {
    runningFlag.flag = false;
  }
}

// ================== CRONS ==================

// --- CANAL 1 ---
cron.schedule("* * * * *", async () => {
  try {
    await sendCoupons(CANAL1_ID, "scheduled_coupons", { flag: isRunning1 });
  } catch (err) {
    console.error("❌ Erreur tâche CANAL1:", err.message);
  }
  console.log("⏱ Vérification coupons CANAL1...");
});

// --- CANAL 2 ---
if (CANAL2_ID) {
  cron.schedule("* * * * *", async () => {
    try {
      await sendCoupons(CANAL2_ID, "scheduled_coupons_2", { flag: isRunning2 });
    } catch (err) {
      console.error("❌ Erreur tâche CANAL2:", err.message);
    }
    console.log("⏱ Vérification coupons CANAL2...");
  });
}

// ================== SÉCURITÉ GLOBALE ==================
process.on("unhandledRejection", (reason, p) => {
  console.error("⚠️ Promesse non gérée:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("💥 Erreur fatale non interceptée:", err);
});

module.exports = { sendCoupons };
