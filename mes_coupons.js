// ======================
// LISTE + MODIFICATION DES COUPONS
// ======================

const editSessions = {};

module.exports = (bot, pool) => {
  // --- COMMANDE /mes_coupons ---
  bot.onText(/\/mes_coupons/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId != process.env.ADMIN_ID) return;

    try {
      const res1 = await pool.query("SELECT * FROM scheduled_coupons ORDER BY id DESC LIMIT 5");
      const res2 = await pool.query("SELECT * FROM scheduled_coupons_2 ORDER BY id DESC LIMIT 5");

      const sendCoupons = async (coupons, canal) => {
        if (coupons.length === 0) {
          return bot.sendMessage(chatId, `❌ Aucun coupon trouvé dans ${canal}.`);
        }

        for (let c of coupons) {
          const text = `<b>📌 Coupon #${c.id} (${canal})</b>\n` +
                       `<b>Date :</b> ${c.schedule_date}\n` +
                       `<b>Heure :</b> ${c.schedule_time}\n` +
                       `<b>Texte :</b> ${c.content}\n` +
                       `<b>Média :</b> ${c.media_type || "Aucun"}`;

          await bot.sendMessage(chatId, text, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✏️ Modifier", callback_data: `edit_${canal}_${c.id}` },
                  { text: "🚀 Publier", callback_data: `publish_${canal}_${c.id}` },
                ],
                [
                  { text: "🗑 Supprimer", callback_data: `delete_${canal}_${c.id}` },
                  { text: "🧪 Tester", callback_data: `test_${canal}_${c.id}` },
                ],
              ],
            },
          });
        }
      };

      await sendCoupons(res1.rows, "CANAL1");
      await sendCoupons(res2.rows, "CANAL2");

    } catch (err) {
      console.error("❌ Erreur récupération coupons :", err);
      bot.sendMessage(chatId, "❌ Erreur lors de la récupération des coupons.");
    }
  });

  // --- CALLBACK QUERY GESTION ---
  bot.on("callback_query", async (query) => {
    const data = query.data;

    // ⚠️ Limiter aux callbacks gérés ici
    if (
      !data.startsWith("edit_") &&
      !data.startsWith("delete_") &&
      !data.startsWith("publish_") &&
      !data.startsWith("test_") &&
      !data.startsWith("saveEdit_") &&
      !data.startsWith("cancelEdit_")
    ) {
      return;
    }

    const chatId = query.message.chat.id;
    const userId = query.from.id;
    if (userId != process.env.ADMIN_ID) return;

    const [action, canal, id] = data.split("_");

    let table, targetChatId;
    if (canal === "CANAL1") {
      table = "scheduled_coupons";
      targetChatId = process.env.CANAL_ID;
    } else if (canal === "CANAL2") {
      table = "scheduled_coupons_2";
      targetChatId = process.env.CANAL2_ID;
    }

    try {
      // Récupération du coupon
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
        if (coupon.media_type === "photo") {
          await bot.sendPhoto(chatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else if (coupon.media_type === "video") {
          await bot.sendVideo(chatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else {
          await bot.sendMessage(chatId, coupon.content, { parse_mode: "HTML" });
        }
        return bot.answerCallbackQuery(query.id, { text: "✅ Test envoyé." });
      }

      // --- PUBLIER ---
      if (action === "publish") {
        if (!targetChatId) return bot.answerCallbackQuery(query.id, { text: "❌ Canal non configuré." });

        if (coupon.media_type === "photo") {
          await bot.sendPhoto(targetChatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else if (coupon.media_type === "video") {
          await bot.sendVideo(targetChatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else {
          await bot.sendMessage(targetChatId, coupon.content, { parse_mode: "HTML" });
        }
        return bot.answerCallbackQuery(query.id, { text: "🚀 Coupon publié !" });
      }

      // --- MODIFIER ---
      if (action === "edit") {
        editSessions[chatId] = {
          step: "await_date",
          table,
          id,
          content: coupon.content,
          media_type: coupon.media_type,
          media_url: coupon.media_url,
          schedule_date: coupon.schedule_date,
          schedule_time: coupon.schedule_time,
        };

        return bot.sendMessage(chatId, "✏️ Nouvelle date (YYYY-MM-DD) ou tape skip :", { parse_mode: "HTML" });
      }

      // --- SAUVEGARDE MODIFICATION ---
      if (action === "saveEdit") {
        const session = editSessions[chatId];
        if (!session) return;

        await pool.query(
          `UPDATE ${session.table}
           SET content=$1, media_type=$2, media_url=$3, schedule_date=$4, schedule_time=$5
           WHERE id=$6`,
          [
            session.content,
            session.media_type,
            session.media_url,
            session.schedule_date,
            session.schedule_time,
            session.id,
          ]
        );

        delete editSessions[chatId];
        return bot.editMessageText(`✅ Coupon #${session.id} modifié avec succès !`, {
          chat_id: chatId,
          message_id: query.message.message_id,
        });
      }

      // --- ANNULER MODIFICATION ---
      if (action === "cancelEdit") {
        delete editSessions[chatId];
        return bot.editMessageText("❌ Modification annulée.", {
          chat_id: chatId,
          message_id: query.message.message_id,
        });
      }
    } catch (err) {
      console.error("❌ Erreur gestion bouton :", err);
      return bot.sendMessage(chatId, "❌ Une erreur est survenue.");
    }
  });

  // --- Workflow édition (messages) ---
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    if (!editSessions[chatId]) return;

    const session = editSessions[chatId];
    const text = msg.text?.trim();

    // --- Étape DATE ---
    if (session.step === "await_date") {
      if (text.toLowerCase() !== "skip") session.schedule_date = text;
      session.step = "await_time";
      return bot.sendMessage(chatId, "⏰ Nouvelle heure (HH:mm) ou tape skip :");
    }

    // --- Étape HEURE ---
    if (session.step === "await_time") {
      if (text.toLowerCase() !== "skip") session.schedule_time = text;
      session.step = "await_text";
      return bot.sendMessage(chatId, "📝 Nouveau texte ou tape skip :");
    }

    // --- Étape TEXTE ---
    if (session.step === "await_text") {
      if (text.toLowerCase() !== "skip") session.content = text;
      session.step = "await_media";
      return bot.sendMessage(chatId, "📎 Nouveau média (file_id ou URL) ou tape skip :");
    }

    // --- Étape MEDIA ---
    if (session.step === "await_media") {
      if (text.toLowerCase() !== "skip") {
        session.media_url = text;
        session.media_type = text.endsWith(".mp4") ? "video" : "photo";
      }
      session.step = "confirm";

      const recap = `<b>✅ Récapitulatif :</b>\n` +
        `<b>Date :</b> ${session.schedule_date}\n` +
        `<b>Heure :</b> ${session.schedule_time}\n` +
        `<b>Texte :</b> ${session.content}\n` +
        `<b>Média :</b> ${session.media_url || "Aucun"}`;

      return bot.sendMessage(chatId, recap, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💾 Enregistrer", callback_data: `saveEdit_${session.table}_${session.id}` }],
            [{ text: "❌ Annuler", callback_data: `cancelEdit_${session.table}_${session.id}` }]
          ]
        }
      });
    }
  });
};
