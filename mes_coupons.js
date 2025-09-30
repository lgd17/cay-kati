// mes_coupons.js
module.exports = (bot, pool) => {
  const editingCoupons = {}; // état temporaire des éditions

  // ======================
  // COMMANDE /mes_coupons
  // ======================
  bot.onText(/\/mes_coupons/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId != process.env.ADMIN_ID)
      return bot.sendMessage(chatId, "🚫 Commande réservée à l’admin.");

    try {
      const res1 = await pool.query("SELECT * FROM scheduled_coupons ORDER BY id DESC LIMIT 5");
      const res2 = await pool.query("SELECT * FROM scheduled_coupons_2 ORDER BY id DESC LIMIT 5");

      if (res1.rows.length === 0 && res2.rows.length === 0) {
        return bot.sendMessage(chatId, "📭 Aucun coupon enregistré.");
      }

      const sendCouponList = async (rows, canalName, canalCode) => {
        for (const row of rows) {
          let caption = `🎟 <b>Coupon #${row.id}</b>\n\n`;
          caption += `🗓 Date: ${row.schedule_date}\n`;
          caption += `⏰ Heure: ${row.schedule_time}\n`;
          caption += `📝 Texte: ${row.content || "(vide)"}\n`;
          caption += `📎 Média: ${row.media_type || "aucun"}\n`;
          caption += `📡 Canal: ${canalName}`;

          const keyboard = {
            inline_keyboard: [
              [
                { text: "✅ Publier", callback_data: `publish_${canalCode}_${row.id}` },
                { text: "❌ Supprimer", callback_data: `delete_${canalCode}_${row.id}` },
              ],
              [
                { text: "👁️ Test", callback_data: `test_${canalCode}_${row.id}` },
                { text: "✏ Modifier", callback_data: `edit_${canalCode}_${row.id}` },
              ],
            ],
          };

          if (row.media_type === "photo") {
            await bot.sendPhoto(chatId, row.media_url, {
              caption,
              parse_mode: "HTML",
              reply_markup: keyboard,
            });
          } else if (row.media_type === "video") {
            await bot.sendVideo(chatId, row.media_url, {
              caption,
              parse_mode: "HTML",
              reply_markup: keyboard,
            });
          } else if (row.media_type === "document") {
            await bot.sendDocument(chatId, row.media_url, {
              caption,
              parse_mode: "HTML",
              reply_markup: keyboard,
            });
          } else {
            await bot.sendMessage(chatId, caption, {
              parse_mode: "HTML",
              reply_markup: keyboard,
            });
          }
        }
      };

      await sendCouponList(res1.rows, "Canal 1", "CANAL1");
      await sendCouponList(res2.rows, "Canal 2", "CANAL2");
    } catch (err) {
      console.error("❌ Erreur /mes_coupons :", err);
      bot.sendMessage(chatId, "❌ Erreur lors de la récupération des coupons.");
    }
  });

  // ======================
  // CALLBACK QUERY
  // ======================
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userId = query.from.id;

    if (userId != process.env.ADMIN_ID) return;

    const [action, canal, id] = data.split("_");

    // table et canal cible
    let table, targetChatId;
    if (canal === "CANAL1") {
      table = "scheduled_coupons";
      targetChatId = process.env.CANAL_ID;
    } else if (canal === "CANAL2") {
      table = "scheduled_coupons_2";
      targetChatId = process.env.CANAL2_ID;
    } else {
      return bot.answerCallbackQuery(query.id, { text: "❌ Canal inconnu." });
    }

    // Récupérer coupon
    const res = await pool.query(`SELECT * FROM ${table} WHERE id=$1`, [id]);
    if (res.rows.length === 0) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Coupon introuvable." });
    }
    const coupon = res.rows[0];

    // --- SUPPRIMER ---
    if (action === "delete") {
      await pool.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
      await bot.editMessageText(`🗑 Coupon #${id} supprimé (${canal})`, {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      return;
    }

    // --- TEST ---
    if (action === "test") {
      try {
        if (coupon.media_type === "photo") {
          await bot.sendPhoto(chatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else if (coupon.media_type === "video") {
          await bot.sendVideo(chatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else {
          await bot.sendMessage(chatId, coupon.content, { parse_mode: "HTML" });
        }
        return bot.answerCallbackQuery(query.id, { text: "✅ Test envoyé." });
      } catch {
        return bot.sendMessage(chatId, coupon.content);
      }
    }

    // --- PUBLIER ---
    if (action === "publish") {
      if (!targetChatId) return bot.answerCallbackQuery(query.id, { text: "❌ Canal non configuré." });

      try {
        if (coupon.media_type === "photo") {
          await bot.sendPhoto(targetChatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else if (coupon.media_type === "video") {
          await bot.sendVideo(targetChatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else {
          await bot.sendMessage(targetChatId, coupon.content, { parse_mode: "HTML" });
        }
        return bot.answerCallbackQuery(query.id, { text: "🚀 Coupon publié !" });
      } catch {
        return bot.sendMessage(targetChatId, coupon.content);
      }
    }

    // --- MODIFIER ---
    if (action === "edit") {
      editingCoupons[chatId] = {
        step: "date",
        table,
        id,
        old: coupon,
        newData: { ...coupon }, // copie des données existantes
      };
      await bot.sendMessage(chatId, "✏️ Nouvelle date (YYYY-MM-DD) ou tape <b>skip</b> :", { parse_mode: "HTML" });
      return bot.answerCallbackQuery(query.id);
    }

    // --- ENREGISTRER ---
    if (action === "save") {
      const state = editingCoupons[chatId];
      if (!state) return bot.answerCallbackQuery(query.id, { text: "❌ Aucun état en cours." });

      await pool.query(
        `UPDATE ${state.table} SET schedule_date=$1, schedule_time=$2, content=$3, media_type=$4, media_url=$5 WHERE id=$6`,
        [
          state.newData.schedule_date,
          state.newData.schedule_time,
          state.newData.content,
          state.newData.media_type,
          state.newData.media_url,
          state.id,
        ]
      );

      await bot.editMessageText(`💾 Coupon #${state.id} mis à jour avec succès !`, {
        chat_id: chatId,
        message_id: query.message.message_id,
      });

      delete editingCoupons[chatId];
      return bot.answerCallbackQuery(query.id, { text: "✅ Enregistré !" });
    }
  });

  // ======================
  // FLUX D’ÉDITION
  // ======================
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId != process.env.ADMIN_ID) return;
    if (!editingCoupons[chatId]) return;

    const state = editingCoupons[chatId];
    const text = msg.text?.trim();

    if (state.step === "date") {
      if (text.toLowerCase() !== "skip") state.newData.schedule_date = text;
      state.step = "time";
      return bot.sendMessage(chatId, "⏰ Nouvelle heure (HH:mm) ou tape <b>skip</b> :", { parse_mode: "HTML" });
    }

    if (state.step === "time") {
      if (text.toLowerCase() !== "skip") state.newData.schedule_time = text;
      state.step = "content";
      return bot.sendMessage(chatId, "📝 Nouveau texte ou tape <b>skip</b> :", { parse_mode: "HTML" });
    }

    if (state.step === "content") {
      if (text.toLowerCase() !== "skip") state.newData.content = text;
      state.step = "media";
      return bot.sendMessage(chatId, "📎 Nouveau lien média (ou skip) :", { parse_mode: "HTML" });
    }

    if (state.step === "media") {
      if (text.toLowerCase() !== "skip") {
        state.newData.media_url = text;
        state.newData.media_type = text.endsWith(".mp4") ? "video" : "photo"; // simple détection
      }
      state.step = "recap";

      const recap = `📋 <b>Récapitulatif modification</b>\n\n` +
        `🗓 Date: ${state.newData.schedule_date}\n` +
        `⏰ Heure: ${state.newData.schedule_time}\n` +
        `📝 Texte: ${state.newData.content}\n` +
        `📎 Média: ${state.newData.media_type || "aucun"}\n`;

      return bot.sendMessage(chatId, recap, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "💾 Enregistrer", callback_data: "save" }]],
        },
      });
    }
  });
};
