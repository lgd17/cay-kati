// ajouter_coupon.js
module.exports = (bot, pool) => {
  const addingCoupons = {}; // stockage temporaire

  // ======================
  // COMMANDE /ajouter_coupon
  // ======================
  bot.onText(/\/ajouter_coupon/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId != process.env.ADMIN_ID)
      return bot.sendMessage(chatId, "🚫 Commande réservée à l’admin.");

    addingCoupons[chatId] = { step: "date", data: {} };

    return bot.sendMessage(chatId, "📅 Indique la date du coupon (YYYY-MM-DD) :");
  });

  // ======================
  // FLUX D’AJOUT
  // ======================
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const state = addingCoupons[chatId];
    if (!state) return; // rien en cours
    if (msg.from.id != process.env.ADMIN_ID) return;

    const text = msg.text?.trim();

    // --- ÉTAPE 1 : DATE ---
    if (state.step === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return bot.sendMessage(chatId, "⚠️ Format invalide. Réessaie (YYYY-MM-DD).");
      }
      state.data.schedule_date = text;
      state.step = "time";
      return bot.sendMessage(chatId, "🕒 Indique l'heure du coupon (HH:MM) :");
    }

    // --- ÉTAPE 2 : HEURE ---
    if (state.step === "time") {
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
        return bot.sendMessage(chatId, "⚠️ Format invalide. Réessaie (HH:MM).");
      }
      state.data.schedule_time = text;
      state.step = "content";
      return bot.sendMessage(chatId, "✏️ Envoie maintenant le texte du coupon :", { parse_mode: "HTML" });
    }

    // --- ÉTAPE 3 : TEXTE ---
    if (state.step === "content") {
      if (!text) {
        return bot.sendMessage(chatId, "⚠️ Texte obligatoire.");
      }
      state.data.content = text;
      state.step = "media";
      return bot.sendMessage(chatId, "📸 Envoie la photo/vidéo du coupon (ou tape 'aucun') :");
    }

    // --- ÉTAPE 4 : MEDIA ---
    if (state.step === "media") {
      if (msg.photo) {
        state.data.media_type = "photo";
        state.data.media_url = msg.photo[msg.photo.length - 1].file_id;
      } else if (msg.video) {
        state.data.media_type = "video";
        state.data.media_url = msg.video.file_id;
      } else if (text.toLowerCase() === "aucun") {
        state.data.media_type = null;
        state.data.media_url = null;
      } else {
        return bot.sendMessage(chatId, "⚠️ Envoie une photo, une vidéo ou tape 'aucun'.");
      }

      state.step = "canal";
      return bot.sendMessage(chatId, "🌐 Choisis le canal :", {
        reply_markup: {
          keyboard: [["CANAL1", "CANAL2"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }

    // --- ÉTAPE 5 : CANAL ---
    if (state.step === "canal") {
      let table;
      if (text === "CANAL1") table = "scheduled_coupons";
      else if (text === "CANAL2") table = "scheduled_coupons_2";
      else return bot.sendMessage(chatId, "⚠️ Choix invalide. Tape CANAL1 ou CANAL2.");

      state.data.table = table;
      state.step = "recap";

      const recap = `<b>📋 Récapitulatif :</b>\n\n` +
        `🗓 Date: ${state.data.schedule_date}\n` +
        `⏰ Heure: ${state.data.schedule_time}\n` +
        `📝 Texte: ${state.data.content}\n` +
        `📎 Média: ${state.data.media_type || "aucun"}\n` +
        `📡 Canal: ${text}`;

      return bot.sendMessage(chatId, recap, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Enregistrer", callback_data: `saveAdd_${chatId}` },
              { text: "❌ Annuler", callback_data: `cancelAdd_${chatId}` },
            ],
          ],
        },
      });
    }
  });

  // ======================
  // CALLBACK QUERY AJOUT
  // ======================
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (!data.startsWith("saveAdd") && !data.startsWith("cancelAdd")) return;
    if (query.from.id != process.env.ADMIN_ID) return;

    const state = addingCoupons[chatId];
    if (!state) return bot.answerCallbackQuery(query.id, { text: "❌ Rien à enregistrer." });

    if (data.startsWith("cancelAdd")) {
      delete addingCoupons[chatId];
      await bot.sendMessage(chatId, "❌ Ajout annulé.");
      return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith("saveAdd")) {
      try {
        await pool.query(
          `INSERT INTO ${state.data.table} (content, media_type, media_url, schedule_date, schedule_time)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            state.data.content,
            state.data.media_type,
            state.data.media_url,
            state.data.schedule_date,
            state.data.schedule_time,
          ]
        );
        await bot.sendMessage(chatId, "✅ Coupon enregistré avec succès !");
      } catch (err) {
        console.error("❌ Erreur INSERT coupon :", err);
        await bot.sendMessage(chatId, "❌ Erreur lors de l'enregistrement.");
      }
      delete addingCoupons[chatId];
      return bot.answerCallbackQuery(query.id);
    }
  });
};
