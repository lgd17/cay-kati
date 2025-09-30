// ======================
// AJOUTER COUPON
// ======================

const pendingCoupons = {};

module.exports = (bot, pool) => {
  // --- COMMANDE /ajouter_coupon ---
  bot.onText(/\/ajouter_coupon/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId != process.env.ADMIN_ID) return;

    pendingCoupons[chatId] = { step: "await_date" };
    return bot.sendMessage(chatId, "📅 Indique la date du coupon (YYYY-MM-DD) :");
  });

  // --- Workflow ajout coupon ---
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const pending = pendingCoupons[chatId];
    if (!pending) return;

    const text = msg.text?.trim();

    // --- Étape 1 : date ---
    if (pending.step === "await_date") {
      if (!text || !text.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return bot.sendMessage(chatId, "⚠️ Format invalide. Réessaie (YYYY-MM-DD).");
      }
      pending.schedule_date = text;
      pending.step = "await_time";
      return bot.sendMessage(chatId, "🕒 Indique l'heure du coupon (HH:MM) :");
    }

    // --- Étape 2 : heure ---
    if (pending.step === "await_time") {
      if (!text || !text.match(/^([01]\d|2[0-3]):([0-5]\d)$/)) {
        return bot.sendMessage(chatId, "⚠️ Format invalide. Réessaie (HH:MM).");
      }
      pending.schedule_time = text;
      pending.step = "await_text";
      return bot.sendMessage(chatId, "✏️ Envoie maintenant le texte du coupon :", { parse_mode: "HTML" });
    }

    // --- Étape 3 : texte ---
    if (pending.step === "await_text") {
      if (!text) {
        return bot.sendMessage(chatId, "⚠️ Envoie du texte obligatoire.");
      }
      pending.content = text;
      pending.step = "await_media";
      return bot.sendMessage(chatId, "📸 Envoie maintenant la photo ou la vidéo du coupon (ou tape 'aucun') :");
    }

    // --- Étape 4 : média ---
    if (pending.step === "await_media") {
      if (msg.photo) {
        pending.media_type = "photo";
        pending.media_url = msg.photo[msg.photo.length - 1].file_id;
      } else if (msg.video) {
        pending.media_type = "video";
        pending.media_url = msg.video.file_id;
      } else if (text && text.toLowerCase() === "aucun") {
        pending.media_type = null;
        pending.media_url = null;
      } else {
        return bot.sendMessage(chatId, "⚠️ Envoie une photo, une vidéo ou tape 'aucun'.");
      }

      pending.step = "await_channel";
      return bot.sendMessage(chatId, "🌐 Choisis le canal pour ce coupon :", {
        reply_markup: {
          keyboard: [["CANAL1", "CANAL2"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }

    // --- Étape 5 : canal ---
    if (pending.step === "await_channel") {
      if (!text) {
        return bot.sendMessage(chatId, "⚠️ Choix invalide. Tape CANAL1 ou CANAL2.");
      }

      let tableName;
      if (text === "CANAL1") tableName = "scheduled_coupons";
      else if (text === "CANAL2") tableName = "scheduled_coupons_2";
      else return bot.sendMessage(chatId, "⚠️ Choix invalide. Tape CANAL1 ou CANAL2.");

      pending.table = tableName;

      // --- Récapitulatif HTML ---
      let recap = `<b>📌 Récapitulatif du coupon :</b>\n`;
      recap += `<b>Date :</b> ${pending.schedule_date}\n`;
      recap += `<b>Heure :</b> ${pending.schedule_time}\n`;
      recap += `<b>Texte :</b> ${pending.content}\n`;
      recap += `<b>Média :</b> ${pending.media_type || "Aucun"}\n`;
      recap += `<b>Canal :</b> ${text}\n\n`;
      recap += "✅ Confirme pour enregistrer ou ❌ Annule.";

      pending.step = "await_confirm";

      return bot.sendMessage(chatId, recap, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Confirmer", callback_data: "confirm_coupon" },
              { text: "❌ Annuler", callback_data: "cancel_coupon" },
            ],
          ],
        },
      });
    }
  });

  // --- Étape 6 : confirmation ---
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // ⚠️ Limiter uniquement aux callbacks de ce module
    if (data !== "confirm_coupon" && data !== "cancel_coupon") return;

    const pending = pendingCoupons[chatId];
    if (!pending) return;

    if (data === "confirm_coupon") {
      try {
        await pool.query(
          `INSERT INTO ${pending.table} (content, media_type, media_url, schedule_date, schedule_time)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            pending.content,
            pending.media_type,
            pending.media_url,
            pending.schedule_date,
            pending.schedule_time,
          ]
        );
        await bot.sendMessage(chatId, "✅ Nouveau coupon enregistré avec succès !");
      } catch (err) {
        console.error("❌ Erreur enregistrement coupon :", err);
        await bot.sendMessage(chatId, "❌ Une erreur est survenue lors de l'enregistrement.");
      }
      delete pendingCoupons[chatId];
    }

    if (data === "cancel_coupon") {
      await bot.sendMessage(chatId, "❌ Coupon annulé.");
      delete pendingCoupons[chatId];
    }
  });
};
