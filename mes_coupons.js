// ======================
// LISTE + MODIFICATION DES COUPONS
// ======================

const couponEditSessions = {};  // Pour /mes_coupons

module.exports = (bot, pool) => {
  // --- COMMANDE /mes_coupons ---
  bot.onText(/\/mes_coupons/, async (msg) => {
    const chatId = msg.chat.id;
    if (!ADMIN_ID.includes(msg.from.id)) return;

    for (const canal of ["CANAL1", "CANAL2"]) {
      const table = canal === "CANAL1" ? "scheduled_coupons" : "scheduled_coupons2";
      const res = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 3`);
      if (res.rows.length === 0) continue;

      for (const c of res.rows) {
        const text = `<b>[${canal}] Coupon #${c.id}</b>\n${c.content}`;
        const buttons = [
          [
            { text: "✏️ Modifier", callback_data: `couponEdit_${canal}_${c.id}` },
            { text: "🗑 Supprimer", callback_data: `couponDelete_${canal}_${c.id}` },
          ],
          [
            { text: "📢 Publier", callback_data: `couponPost_${canal}_${c.id}` },
            { text: "🧪 Tester", callback_data: `couponTest_${canal}_${c.id}` },
          ],
        ];
        await bot.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      }
    }
  });

  // --- Callback pour COUPONS
  bot.on("callback_query", async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    if (!ADMIN_IDS.includes(userId)) return;

    // --- Editer un COUPON
    if (data.startsWith("couponEdit_")) {
      const [, canal, id] = data.split("_");
      const table = canal === "CANAL1" ? "scheduled_coupons" : "scheduled_coupons2";

      const res = await pool.query(`SELECT * FROM ${table} WHERE id=$1`, [id]);
      if (res.rows.length === 0) return bot.sendMessage(chatId, "❌ Coupon introuvable.");
      const c = res.rows[0];

      couponEditSessions[chatId] = {
        step: "await_date",
        canal,
        table,
        id,
        content: c.content,
        media_type: c.media_type,
        media_url: c.media_url,
        schedule_date: c.schedule_date,
        schedule_time: c.schedule_time,
      };

      return bot.sendMessage(
        chatId,
        `✏️ Edition du coupon ${id} (${canal})\n\nEnvoie la nouvelle date (YYYY-MM-DD) ou /skip pour garder.`
      );
    }
  });

  // --- Commande /skip pour COUPONS
  bot.onText(/\/skip/, async (msg) => {
    const chatId = msg.chat.id;
    const session = couponEditSessions[chatId];
    if (!session) return;

    // Exemple : on saute l'étape date
    if (session.step === "await_date") {
      session.step = "await_time";
      return bot.sendMessage(chatId, "⏰ Envoie la nouvelle heure (HH:MM) ou /skip pour garder.");
    }

    if (session.step === "await_time") {
      session.step = "await_content";
      return bot.sendMessage(chatId, "📝 Envoie le nouveau texte ou /skip pour garder.");
    }

    if (session.step === "await_content") {
      // Ici tu fais l'UPDATE avec les valeurs existantes
      await pool.query(
        `UPDATE ${session.table} 
         SET content=$1, media_type=$2, media_url=$3, schedule_date=$4, schedule_time=$5 
         WHERE id=$6`,
        [session.content, session.media_type, session.media_url, session.schedule_date, session.schedule_time, session.id]
      );
      delete couponEditSessions[chatId];
      return bot.sendMessage(chatId, `✅ Coupon ${session.id} mis à jour (skip utilisé).`);
    }
  });
};  // <= ICI fermeture du module.exports
