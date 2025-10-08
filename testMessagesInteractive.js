// testMessagesInteractive.js
module.exports = (bot, pool) => {
  const dayNames = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  const pendingTest = {}; // stocke l'état par chat

  const sendMessageQuick = async (chatId, msg) => {
    const options = { parse_mode: "HTML" };
    try {
      switch (msg.media_type) {
        case "photo":
          await bot.sendPhoto(chatId, msg.media_url, { caption: msg.contenu, ...options });
          break;
        case "video":
          await bot.sendVideo(chatId, msg.media_url, { caption: msg.contenu, ...options });
          break;
        case "voice":
          await bot.sendVoice(chatId, msg.media_url, { caption: msg.contenu, ...options });
          break;
        case "audio":
          await bot.sendAudio(chatId, msg.media_url, { caption: msg.contenu, ...options });
          break;
        case "video_note":
          await bot.sendVideoNote(chatId, msg.media_url);
          if (msg.contenu) await bot.sendMessage(chatId, msg.contenu, options);
          break;
        default:
          await bot.sendMessage(chatId, msg.contenu, options);
      }
    } catch (err) {
      console.error("Erreur envoi test:", err);
    }
  };

  // Étape 1 : Commande pour démarrer
  bot.onText(/\/test_messages/, async (msg) => {
    const chatId = msg.chat.id;
    pendingTest[chatId] = { step: "choose_canal" };
    await bot.sendMessage(chatId, "Quel canal veux-tu tester ? (1 ou 2)");
  });

  // Étape 2 : Gestion des réponses
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    if (!pendingTest[chatId] || msg.text.startsWith("/")) return; // ignore autres chats ou commandes

    const state = pendingTest[chatId];

    // Choix du canal
    if (state.step === "choose_canal") {
      if (msg.text === "1") {
        state.canal = "messages_canal1";
        state.canalKey = "Canal 1";
      } else if (msg.text === "2") {
        state.canal = "messages_canal2";
        state.canalKey = "Canal 2";
      } else {
        return bot.sendMessage(chatId, "❌ Choix invalide. Réponds 1 ou 2.");
      }
      state.step = "choose_day";
      return bot.sendMessage(chatId, "Choisis le jour (0 = Dimanche … 6 = Samedi) :");
    }

    // Choix du jour
    if (state.step === "choose_day") {
      const day = parseInt(msg.text);
      if (isNaN(day) || day < 0 || day > 6) {
        return bot.sendMessage(chatId, "❌ Jour invalide. Entre un chiffre entre 0 et 6.");
      }

      // Récupérer les messages pour ce canal et ce jour
      try {
        const res = await pool.query(
          `SELECT * FROM ${state.canal} WHERE day_of_week = $1 ORDER BY id`,
          [day]
        );

        if (res.rows.length === 0) {
          await bot.sendMessage(chatId, `⚠️ Aucun message pour ${state.canalKey} le jour ${day} (${dayNames[day]})`);
        } else {
          await bot.sendMessage(chatId, `📌 Messages pour ${state.canalKey} le jour ${day} (${dayNames[day]}):`);
          for (const m of res.rows) {
            await sendMessageQuick(chatId, m);
          }
        }
      } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, `❌ Erreur lors de la récupération des messages : ${err.message}`);
      }

      // Fin de l'interaction
      delete pendingTest[chatId];
    }
  });
};
