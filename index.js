
const TelegramBot = require("node-telegram-bot-api");
const { pool } = require("./db");
require("dotenv").config();
require('./server');

const bot = new TelegramBot(process.env.BOT_TOKEN, { webHook: { port: 443 } });
const ADMIN_IDS = process.env.ADMIN_IDS.split(",").map(Number);

// ====== CONFIGURATION ENV ======
const port = process.env.PORT || 3000;
const token = process.env.TELEGRAM_TOKEN;
if (!token) throw new Error("❌ TELEGRAM_TOKEN non défini !");
const baseUrl = process.env.BASE_URL; // ✅ ✅ ✅ à utiliser sur Render !
if (!baseUrl) throw new Error("❌ BASE_URL manquant dans .env !");

// ====== GESTION DES ÉTATS ======
const userStates = {};
const fixedDeletionConfirmations = new Map();
const editFixedStates = {};
const userLang = {};
const fixedAddStates = {};
const fixedEditStates = {};
const editStates = {};

const adminId = process.env.TELEGRAM_ADMIN_ID;
const channelId = process.env.TELEGRAM_CHANNEL_ID;

// Active le webhook (à appeler une seule fois manuellement)
bot.setWebHook(`${process.env.BASE_URL}/webhook/${process.env.BOT_TOKEN}`);

const pendingCustomRejects = {};
const userStates = {}; 

//////////////////////////////////////////////////==== Menu ====\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
// === MENU ADMIN AVEC BOUTON INLINE ===
 
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const adminId = msg.from.id;

  if (!ADMIN_IDS.includes(adminId)) return;

  await bot.sendMessage(chatId, "📋 Menu d'administration :", {
    reply_markup: {
      inline_keyboard: [
        // Bloc principal
        [{ text: "🛠 Panel Admin", callback_data: "open_admin_panel" }],
        [{ text: "➕ Ajouter un prono", callback_data: "open_ajouter_prono" }],
        [{ text: "📋 Voir les pronos", callback_data: "open_voir_pronos" }],
        [{ text: "📊 Top Parrainage", callback_data: "open_topparrains" }],

        // Séparateur
        [{ text: "──────────", callback_data: "separator_1" }],

        // Messages automatiques
        [{ text: "🕒 Ajouter msg auto", callback_data: "open_addmsg" }],
        [{ text: "📄 Voir messages auto", callback_data: "open_listmsg" }],
        [{ text: "❌ Supprimer messages auto", callback_data: "open_delmsg" }],
        [{ text: "🧷 Ajouter message fixe", callback_data: "open_addfixedmsg" }],
        [{ text: "📌 Voir messages fixes", callback_data: "open_fixemsg" }],

        // Séparateur
        [{ text: "──────────", callback_data: "separator_2" }],

        // Publication canal
        [{ text: "📢 Publier dans le canal", callback_data: "open_resetpoints" }],
        [{ text: "✉️ Envoyer message canal", callback_data: "open_sendtocanal" }]
      ]
    }
  });
});

// === RÉACTIONS AUX BOUTONS DU MENU ===
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (!ADMIN_IDS.includes(userId)) return bot.answerCallbackQuery(query.id);

  switch (data) {
    case "open_admin_panel":
      bot.emit('text', { text: "/admin", chat: { id: chatId }, from: { id: userId } });
      break;
    case "open_ajouter_prono":
      bot.emit('text', { text: "/ajouter_prono", chat: { id: chatId }, from: { id: userId } });
      break;
    case "open_voir_pronos":
      bot.emit('text', { text: "/voir_pronos", chat: { id: chatId }, from: { id: userId } });
      break;
    case "open_addmsg":
      bot.emit('text', { text: "/addmsg", chat: { id: chatId }, from: { id: userId } });
      break;
    case "open_listmsg":
      bot.emit('text', { text: "/listmsg", chat: { id: chatId }, from: { id: userId } });
      break;
      case "open_delmsg":
      bot.emit('text', { text: "/delmsg", chat: { id: chatId }, from: { id: userId } });
      break;
    case "open_addfixedmsg":
      bot.emit('text', { text: "/addfixedmsg", chat: { id: chatId }, from: { id: userId } });
      break;
    case "open_fixemsg":
      bot.emit('text', { text: "/fixemsg", chat: { id: chatId }, from: { id: userId } });
      break;
    case "open_topparrains":
      bot.emit('text', { text: "/topparrains", chat: { id: chatId }, from: { id: userId } });
      break;
    case "open_resetpoints":
      bot.emit('text', { text: "/resetpoints", chat: { id: chatId }, from: { id: userId } });
      break;
    case "open_sendtocanal":
      bot.emit('text', { text: "/sendtocanal", chat: { id: chatId }, from: { id: userId } });
      break;
  }

  await bot.answerCallbackQuery(query.id);
});


/////////////////////////////////////////////////////////////////////////////////////////


//=== COMMANDE /ajouter_prono ===

bot.onText(/\/ajouter_prono/, (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(msg.from.id))
    return bot.sendMessage(chatId, "🚫 Commande réservée à l’admin.");

  pendingCoupon[chatId] = { step: "awaiting_date" };
  bot.sendMessage(chatId, "📅 Pour quelle date est ce prono ?\nEx: 2025-06-06 ou tape /today");
});

// Commande /today
bot.onText(/\/today/, (msg) => {
  const chatId = msg.chat.id;
  if (!pendingCoupon[chatId] || pendingCoupon[chatId].step !== "awaiting_date") return;

  const today = new Date().toISOString().slice(0, 10);
  pendingCoupon[chatId].date = today;
  pendingCoupon[chatId].step = "awaiting_content";
  bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
});

// Commande /skip pour ignorer l'ajout de média
bot.onText(/\/skip/, async (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || state.step !== "awaiting_media") return;

  await insertManualCoupon(state.content, null, null, state.date);
  delete pendingCoupon[chatId];
  bot.sendMessage(chatId, "✅ Prono sans média enregistré.");
});

// Gestion des messages (date, contenu, média)
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || msg.text?.startsWith("/")) return;

  // Étape : date manuelle
  if (state.step === "awaiting_date" && /^\d{4}-\d{2}-\d{2}$/.test(msg.text)) {
    const inputDate = new Date(msg.text);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (inputDate < today) {
      return bot.sendMessage(chatId, "❌ La date ne peut pas être dans le passé. Réessaie.");
    }

    state.date = msg.text;
    state.step = "awaiting_content";
    return bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
  }

  // Étape : contenu
  if (state.step === "awaiting_content" && msg.text) {
    state.content = msg.text;
    state.step = "awaiting_confirmation";

    const recap = `📝 *Récapitulatif du prono:*\n📅 Date: *${state.date}*\n✍️ Contenu: *${state.content}*\n\nSouhaites-tu continuer ?`;
    return bot.sendMessage(chatId, recap, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Confirmer", callback_data: "confirm_prono" }],
          [{ text: "❌ Annuler", callback_data: "cancel_prono" }],
        ],
      },
    });
  }

  // Étape : ajout du média
  if (state.step === "awaiting_media") {
    if (msg.photo) {
      const fileId = msg.photo.at(-1).file_id;
      const fileUrl = await bot.getFileLink(fileId);
      await insertManualCoupon(state.content, fileUrl, "photo", state.date);
      delete pendingCoupon[chatId];
      return bot.sendMessage(chatId, "✅ Prono avec photo enregistré.");
    }

    if (msg.video) {
      const fileId = msg.video.file_id;
      const fileUrl = await bot.getFileLink(fileId);
      await insertManualCoupon(state.content, fileUrl, "video", state.date);
      delete pendingCoupon[chatId];
      return bot.sendMessage(chatId, "✅ Prono avec vidéo enregistré.");
    }

    return bot.sendMessage(chatId, "❌ Envoie une *photo*, une *vidéo* ou tape /skip.", { parse_mode: "Markdown" });
  }
});

// Callback pour confirmer ou annuler
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const state = pendingCoupon[chatId];
  if (!state) return bot.answerCallbackQuery(query.id);

  if (query.data === "confirm_prono") {
    state.step = "awaiting_media";
    await bot.sendMessage(chatId, "📎 Tu peux maintenant envoyer une *photo* ou une *vidéo* pour ce prono.\nSinon tape /skip.", {
      parse_mode: "Markdown",
    });
  }

  if (query.data === "cancel_prono") {
    delete pendingCoupon[chatId];
    await bot.sendMessage(chatId, "❌ Ajout du prono annulé.");
  }

  await bot.answerCallbackQuery(query.id);
});

// ===================Fonction d'insertion dans la BDD (à adapter)
async function insertManualCoupon(content, mediaUrl, mediaType, date) {
  try {
    await pool.query(
      "INSERT INTO daily_pronos (content, media_url, media_type, date) VALUES ($1, $2, $3, $4)",
      [content, mediaUrl, mediaType, date]
    );
  } catch (err) {
    console.error("Erreur insertion prono manuel :", err);
  }
}


//=== COMMANDE /voir_pronos ===

bot.onText(/\/voir_pronos/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_IDS.includes(userId))
    return bot.sendMessage(chatId, "⛔ Accès réservé aux admins.");

  try {
    const { rows } = await pool.query(
      "SELECT * FROM daily_pronos ORDER BY id DESC LIMIT 5"
    );
    if (rows.length === 0)
      return bot.sendMessage(chatId, "Aucun prono trouvé.");

    for (const row of rows) {
      const caption = `🆔 ${row.id}\n📅 ${row.date}\n📝 ${row.content}`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "✏️ Modifier", callback_data: `edit_${row.id}` },
            { text: "🗑️ Supprimer", callback_data: `delete_${row.id}` },
          ],
          [
            {
              text: "🚀 Publier maintenant",
              callback_data: `postnow_${row.id}`,
            },
            { text: "🧪 Tester", callback_data: `test_${row.id}` },
          ],
        ],
      };

      if (row.media_url && row.media_type === "photo") {
        await bot.sendPhoto(chatId, row.media_url, {
          caption,
          reply_markup: keyboard,
        });
      } else if (row.media_url && row.media_type === "video") {
        await bot.sendVideo(chatId, row.media_url, {
          caption,
          reply_markup: keyboard,
        });
      } else {
        await bot.sendMessage(chatId, caption, { reply_markup: keyboard });
      }
    }
  } catch (err) {
    console.error("Erreur voir_pronos:", err);
    bot.sendMessage(chatId, "❌ Erreur lors de la récupération des pronos.");
  }
});

// ✅ Callback général centralisé
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  const msgId = query.message.message_id;

  if (!ADMIN_IDS.includes(userId)) {
    return bot.answerCallbackQuery(query.id, { text: "⛔ Accès refusé." });
  }

  try {
    if (data.startsWith("delete_")) {
      const id = data.split("_")[1];
      await bot.editMessageReplyMarkup(
        {
          inline_keyboard: [
            [
              { text: "✅ Confirmer", callback_data: `confirmdelete_${id}` },
              { text: "❌ Annuler", callback_data: `cancel` },
            ],
          ],
        },
        { chat_id: chatId, message_id: msgId }
      );
      return;
    }

    if (data.startsWith("confirmdelete_")) {
      const id = data.split("_")[1];
      await pool.query("DELETE FROM daily_pronos WHERE id = $1", [id]);
      await bot.editMessageText(`✅ Prono ${id} supprimé.`, {
        chat_id: chatId,
        message_id: msgId,
      });
      return;
    }

    if (data === "cancel") {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: msgId }
      );
      return;
    }

    if (data.startsWith("edit_")) {
      const id = data.split("_")[1];
      editStates[chatId] = { step: "editing", pronoId: id };
      await bot.sendMessage(
        chatId,
        `✍️ Envoie le nouveau texte pour le prono ID ${id}, ou tape /cancel pour annuler.`
      );
      return;
    }

    if (data.startsWith("test_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query(
        "SELECT * FROM daily_pronos WHERE id = $1",
        [id]
      );
      const prono = rows[0];
      if (!prono) return;

      const caption = `🆔 ${prono.id}\n📅 ${prono.date}\n📝 ${prono.content}`;
      if (prono.media_url && prono.media_type === "photo") {
        await bot.sendPhoto(chatId, prono.media_url, { caption });
      } else if (prono.media_url && prono.media_type === "video") {
        await bot.sendVideo(chatId, prono.media_url, { caption });
      } else {
        await bot.sendMessage(chatId, caption);
      }
      return;
    }

    if (data.startsWith("postnow_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query(
        "SELECT * FROM daily_pronos WHERE id = $1",
        [id]
      );
      const prono = rows[0];
      if (!prono) return;

      const caption = `📢 PRONOSTIC DU JOUR\n\n🆔 ${prono.id}\n📅 ${prono.date}\n📝 ${prono.content}`;
      if (prono.media_url && prono.media_type === "photo") {
        await bot.sendPhoto(CANAL_ID, prono.media_url, { caption });
      } else if (prono.media_url && prono.media_type === "video") {
        await bot.sendVideo(CANAL_ID, prono.media_url, { caption });
      } else {
        await bot.sendMessage(CANAL_ID, caption);
      }
      await bot.sendMessage(chatId, `✅ Prono ${id} publié dans le canal.`);
      return;
    }

    if (data === "confirm_prono") {
      if (pendingCoupon[chatId]) {
        pendingCoupon[chatId].step = "awaiting_media";
        await bot.sendMessage(
          chatId,
          "📎 Envoie une *photo* ou *vidéo* ou tape /skip.",
          { parse_mode: "Markdown" }
        );
      }
      return;
    }

    if (data === "cancel_prono") {
      delete pendingCoupon[chatId];
      await bot.sendMessage(chatId, "❌ Ajout du prono annulé.");
      return;
    }

    // ✅ Pour toute autre donnée inconnue => ne rien faire, ignorer
    return;
  } catch (err) {
    console.error("Erreur callback:", err);
    bot.sendMessage(chatId, "❌ Une erreur est survenue.");
  }
});



/////////////////////////////////////////////////////////////////////////////////////////

// Envoyer un message dans un canal

bot.onText(/\/sendtocanal/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Vérifie que seul toi (l'admin) peux l'utiliser
  if (userId !== 6248838967)
    return bot.sendMessage(chatId, "❌ Commande réservée à l’admin.");

  bot.sendMessage(
    channelId,
    "🔥 Ceci est un message du bot envoyé dans le canal !"
  );
  bot.sendMessage(chatId, "✅ Message envoyé au canal.");
});

// Testemessage
bot.onText(/\/testmessage/, async (msg) => {
  const chatId = msg.chat.id;
  const ADMIN_ID = 6248838967; // Remplace par ton vrai ID Telegram

  if (msg.from.id !== ADMIN_ID) {
    return bot.sendMessage(chatId, "⛔️ Accès refusé.");
  }

  try {
    const { rows } = await pool.query(`
      SELECT * FROM messages_auto
      WHERE DATE(send_date) = CURRENT_DATE AND sent_today = false
    `);

    if (rows.length === 0) {
      await bot.sendMessage(
        chatId,
        "❌ Aucun message disponible pour aujourd’hui."
      );
      return;
    }

    for (const message of rows) {
      await envoyerMessageComplet(bot, chatId, message);

      await pool.query(
        `UPDATE messages_auto SET sent_today = true WHERE id = $1`,
        [message.id]
      );
    }
  } catch (error) {
    console.error("❌ Erreur test message :", error.message);
    await bot.sendMessage(chatId, "❌ Une erreur est survenue.");
  }
});

// Fonctin table
async function envoyerMessageComplet(bot, chatId, message) {
  const caption = message.media_text
    ? `${message.media_text}\n\n${message.contenu}`
    : message.contenu;

  if (message.media_url) {
    // Envoi avec média (image ou vidéo)
    if (message.media_url.match(/\.(jpg|jpeg|png|gif)$/i)) {
      await bot.sendPhoto(chatId, message.media_url, { caption });
    } else if (message.media_url.match(/\.(mp4|mov|webm)$/i)) {
      await bot.sendVideo(chatId, message.media_url, { caption });
    } else {
      // URL non reconnue comme image ou vidéo → fallback
      await bot.sendMessage(chatId, `${caption}\n\n🔗 ${message.media_url}`);
    }
  } else {
    // Pas de média → simple message texte
    await bot.sendMessage(chatId, caption);
  }
}


/////////////////////////////////////////////////////////////////////////////////////////

//=== COMMANDE /topparrains ====

bot.onText(/\/topparrains/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const { rows } = await pool.query(`
      SELECT u1.id, u1.username, u1.firstname, COUNT(u2.id) AS filleuls, u1.points
      FROM users u1
      LEFT JOIN users u2 ON u1.id = u2.referral_id
      GROUP BY u1.id
      ORDER BY filleuls DESC, u1.points DESC
      LIMIT 5
    `);

    if (rows.length === 0) {
      return bot.sendMessage(chatId, "Aucun parrain actif pour le moment.");
    }

    let message = "🏆 *Top 5 Parrains de la semaine :*\n\n";
    rows.forEach((row, index) => {
      const nom = row.username
        ? `@${row.username}`
        : row.firstname || "Anonyme";
      message += `🥇 *${index + 1}. ${nom}* — ${row.filleuls} filleul(s), ${
        row.points
      } pts\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Erreur /topparrains :", error);
    bot.sendMessage(chatId, "❌ Impossible d'afficher le classement.");
  }
});

const CHANNEL_ID = "@linktree_free_prediction";

schedule.scheduleJob("0 18 * * 0", async () => {
  try {
    const { rows } = await pool.query(`
      SELECT u1.id, u1.username, u1.firstname, COUNT(u2.id) AS filleuls, u1.points
      FROM users u1
      LEFT JOIN users u2 ON u1.id = u2.referral_id
      GROUP BY u1.id
      ORDER BY filleuls DESC, u1.points DESC
      LIMIT 5
    `);

    if (rows.length === 0) return;

    let message = "📢 *Classement des meilleurs parrains de la semaine !*\n\n";
    rows.forEach((row, index) => {
      const nom = row.username
        ? `@${row.username}`
        : row.firstname || "Anonyme";
      message += `🏅 *${index + 1}. ${nom}* — ${row.filleuls} filleul(s), ${
        row.points
      } pts\n`;
    });

    bot.sendMessage(CHANNEL_ID, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Erreur classement auto :", error);
  }
});

// 🔁 Réinitialiser les points tous les 1er du mois à 00h05

const TELEGRAM_CHANNEL_ID = "@linktree_free_prediction"; // remplace par ton canal

// 🔁 Fonction pour publier le Top 5 et reset les points
async function publierClassementEtReset() {
  try {
    const { rows: topUsers } = await pool.query(
      `SELECT id, username, firstname, points
       FROM users
       ORDER BY points DESC
       LIMIT 5`
    );

    if (topUsers.length === 0) {
      await bot.sendMessage(
        TELEGRAM_CHANNEL_ID,
        "Aucun parrain n’a encore de points ce mois-ci."
      );
      return;
    }

    let message = "🏆 *Classement des 5 meilleurs parrains du mois :*\n\n";
    const emojis = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

    topUsers.forEach((user, index) => {
      const nom = user.username
        ? `@${user.username}`
        : user.firstname
        ? user.firstname
        : `Utilisateur ${user.id}`;
      message += `${emojis[index]} ${nom} — *${user.points} points*\n`;
    });

    message += `\n🎁 Les récompenses seront distribuées automatiquement !


        🚨 NOUVEAU MOIS = NOUVEAU DÉFI !

🥇 Tous les *points de parrainage* ont été remis à zéro !


🔄 C’est le moment de te lancer à fond :
- Invite tes amis 💬
- Grimpe dans le classement 📈
- Récupère un max de *récompenses* 🎁

🏆 Les 5 meilleurs parrains du mois gagneront :
- 10 000 FC chacun 💸
- 2 *coupons exclusifs VIP* 🎫

🔥 *Le compteur est reparti de zéro. Ne perds pas une seconde !*`;

    // 🔹 Envoi du message dans le canal
    await bot.sendMessage(TELEGRAM_CHANNEL_ID, message, {
      parse_mode: "Markdown",
    });

    // 🔹 Remise à zéro
    await pool.query("UPDATE users SET points = 0");
    console.log("✅ Points remis à zéro");
  } catch (err) {
    console.error("❌ Erreur dans publierClassementEtReset :", err);
  }
}

// ✅ Tâche planifiée le 1er de chaque mois à 00h00
schedule.scheduleJob("0 0 1 * *", () => {
  publierClassementEtReset();
});


/////////////////////////////////////////////////////////////////////////////////////////

// ✅ Commande admin pour tester à la main
bot.onText(/\/resetpoints/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  await publierClassementEtReset();
  bot.sendMessage(msg.chat.id, "✅ Classement publié et points remis à zéro !");
});


/////////////////////////////////////////////////////////////////////////////////////////

// === COMMANDES ===
bot.onText(/\/admin/, async (msg) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  try {
    const { rows } = await pool.query("SELECT * FROM pending_verifications");
    if (rows.length === 0)
      return bot.sendMessage(msg.chat.id, "✅ Aucune vérification en attente.");

    for (const row of rows) {
      const text = `🧾 <b>Nouvelle demande</b>\n👤 @${row.username} (ID: ${row.telegram_id})\n📱 Bookmaker: ${row.bookmaker}\n💰 Montant: ${row.amount} FCFA\n🆔 Dépôt: <code>${row.deposit_id}</code>`;

      const opts = {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Valider", callback_data: `validate_${row.telegram_id}` },
              { text: "❌ Rejeter", callback_data: `reject_${row.telegram_id}` }
            ]
          ]
        }
      };

      await bot.sendMessage(msg.chat.id, text, opts);
    }
  } catch (err) {
    console.error("Erreur /admin:", err);
  }
});

const pendingCustomRejects = {}; // Pour stocker les ID en attente de motif personnalisé

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const adminId = query.from.id;

  if (!ADMIN_IDS.includes(adminId)) return;

  const data = query.data;

  if (data.startsWith("validate_")) {
    const telegramId = data.split("_")[1];

    try {
      const { rows } = await pool.query("SELECT * FROM pending_verifications WHERE telegram_id = $1", [telegramId]);
      if (rows.length === 0) return;

      const user = rows[0];

      await pool.query("INSERT INTO verified_users (telegram_id, username, bookmaker, deposit_id, amount) VALUES ($1,$2,$3,$4,$5)", [
        user.telegram_id,
        user.username,
        user.bookmaker,
        user.deposit_id,
        user.amount
      ]);

     await pool.query("DELETE FROM pending_verifications WHERE telegram_id = $1", [telegramId]);

await bot.sendMessage(user.telegram_id, `✅ Ton compte a été validé avec succès !`, {
  reply_markup: {
    keyboard: [["🎯 Pronostics du jour"]],
    resize_keyboard: true,
    one_time_keyboard: true
  }
});

await bot.sendMessage(chatId, `✅ Validation de @${user.username} confirmée.`);
} catch (err) {
      console.error("Erreur de validation:", err);
    }
  }


  if (data.startsWith("reject_")) {
    const telegramId = data.split("_")[1];

    const motifs = [
      [{ text: "🔻 Dépôt insuffisant", callback_data: `motif1_${telegramId}` }],
      [{ text: "⛔️ ID non lié au code P999X", callback_data: `motif2_${telegramId}` }],
      [{ text: "📝 Autres raisons", callback_data: `motif3_${telegramId}` }]
    ];

    return bot.editMessageReplyMarkup(
      { inline_keyboard: motifs },
      { chat_id: chatId, message_id: query.message.message_id }
    );
  }

  if (data.startsWith("motif1_") || data.startsWith("motif2_")) {
    const [motif, telegramId] = data.split("_");
    const reason =
      motif === "motif1"
        ? "❌ Rejeté : dépôt insuffisant."
        : "❌ Rejeté : cet ID de dépôt n’est pas lié au code promo P999X.";

    await pool.query("DELETE FROM pending_verifications WHERE telegram_id = $1", [telegramId]);

    await bot.sendMessage(telegramId, reason);
    await bot.sendMessage(telegramId, `🔁 Tu peux recommencer la procédure.`, {
      reply_markup: {
        keyboard: [["🔁 recommencer"]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });

    return bot.sendMessage(chatId, `🚫 Rejet envoyé à l'utilisateur.`);
  }

  if (data.startsWith("motif3_")) {
    const telegramId = data.split("_")[1];

    pendingCustomRejects[adminId] = telegramId;

    return bot.sendMessage(chatId, "✍️ Envoie manuellement le motif de rejet pour l’utilisateur.");
  }
});

// Réception d’un motif personnalisé
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // 🔁 recommencer
  if (text === "🔁 recommencer") {
    userStates[chatId] = { step: "await_bookmaker" };

    return bot.sendMessage(chatId, "🔐 Pour accéder aux pronostics, indique ton bookmaker :", {
      reply_markup: {
        keyboard: [["1xbet", "888starz"], ["melbet", "winwin"]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }

  if (text === "🆘 contacter l'assistance") {
    return bot.sendMessage(chatId, "📩 Contacte notre équipe ici : [@Support_1XBOOM](https://t.me/Catkatii)", {
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });
  }



bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  if (query.data === "get_prono") {
    try {
      // Supprime le bouton inline après clic
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });

      // Récupère la date du jour au format YYYY-MM-DD
      const today = new Date().toISOString().slice(0, 10);

      // Recherche le coupon du jour
      const res = await pool.query(
        "SELECT content FROM daily_pronos WHERE date = $1 LIMIT 1",
        [today]
      );

      if (res.rows.length === 0) {
        await bot.sendMessage(chatId, "⚠️ Le pronostic du jour n'est pas encore disponible.");
      } else {
        const coupon = res.rows[0].content;

        // Envoie le coupon du jour
        await bot.sendMessage(chatId, `🎯 Pronostic du jour :\n\n${coupon}`, {
          parse_mode: "Markdown"
        });

        // Affiche le menu principal avec 3 boutons
        await bot.sendMessage(chatId, "📋 Menu principal :", {
          reply_markup: {
            keyboard: [["🏆 Mes Points", "🤝 Parrainage"], ["🆘 Assistance"]
            ],
            resize_keyboard: true
          }
        });
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi du pronostic :", error);
      await bot.sendMessage(chatId, "❌ Une erreur est survenue, réessaie plus tard.");
    }
  }
});

  // Gestion du motif personnalisé
  const pendingId = pendingCustomRejects[chatId];
  if (pendingId) {
    try {
      await pool.query("DELETE FROM pending_verifications WHERE telegram_id = $1", [pendingId]);

      await bot.sendMessage(pendingId, `❌ Rejeté : ${text}`);
      await bot.sendMessage(
        pendingId,
        `🔁 Tu peux recommencer la procédure ou contacter l’assistance.`,
        {
          reply_markup: {
            keyboard: [["🔁 recommencer", "🆘 contacter l'assistance"]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );

      await bot.sendMessage(chatId, `🔔 Motif personnalisé envoyé à l’utilisateur.`);
    } catch (err) {
      console.error("Erreur motif personnalisé :", err);
      await bot.sendMessage(chatId, "❌ Une erreur est survenue lors du rejet.");
    }

    delete pendingCustomRejects[chatId];
  }
});


/////////////////////////////////////xxxxxxxxxxxxxxxxx////////////////////////////////////////////////////


bot.onText(/\/sendtestcoupon/, async (msg) => {
  const chatId = msg.chat.id;
  const isAdmin = chatId.toString() === process.env.ADMIN_CHAT_ID;

  if (!isAdmin) {
    return bot.sendMessage(chatId, "⛔️ Commande réservée à l'administrateur.");
  }

  const mockBets = [
    {
      name: 'Match Winner',
      values: [
        { value: 'Home', odd: '1.45' },
        { value: 'Draw', odd: '3.60' },
        { value: 'Away', odd: '6.00' }
      ]
    },
    {
      name: 'Double Chance',
      values: [
        { value: '1X', odd: '1.20' },
        { value: '12', odd: '1.30' },
        { value: 'X2', odd: '2.10' }
      ]
    },
    {
      name: 'Over/Under',
      values: [
        { value: 'Over 2.5', odd: '1.85' },
        { value: 'Under 2.5', odd: '1.90' }
      ]
    },
    {
      name: 'Both Teams Score',
      values: [
        { value: 'Yes', odd: '1.75' },
        { value: 'No', odd: '2.00' }
      ]
    }
  ];

  const tips = [];
  const winTip = getSafestBet(mockBets, 'Match Winner');
  if (winTip) tips.push(`🏆 1X2 : ${winTip.value} (${winTip.odd}) ${winTip.confidence}`);

  const dcTip = getSafestBet(mockBets, 'Double Chance');
  if (dcTip) tips.push(`🔀 Double Chance : ${dcTip.value} (${dcTip.odd}) ${dcTip.confidence}`);

  const overTip = getTargetedBet(mockBets, 'Over/Under', 'Over 2.5');
  if (overTip) tips.push(`🎯 Over 2.5 : ${overTip.odd} ${overTip.confidence}`);

  const bttsTip = getTargetedBet(mockBets, 'Both Teams Score', 'Yes');
  if (bttsTip) tips.push(`🤝 BTTS Oui : ${bttsTip.odd} ${bttsTip.confidence}`);

  const message = formatMatchTips({
    leagueName: 'Ligue 1 🇫🇷',
    home: 'PSG',
    away: 'OM',
    hour: '20:00',
    tips
  });

  try {
    const { rows } = await pool.query('SELECT telegram_id FROM verified_users');
    for (const row of rows) {
      await bot.sendMessage(row.telegram_id, message, { parse_mode: 'Markdown' });
    }
    await bot.sendMessage(chatId, `✅ Coupon test envoyé à ${rows.length} utilisateurs vérifiés.`);
  } catch (err) {
    console.error('❌ Erreur envoi test coupon :', err.message);
    await bot.sendMessage(chatId, "❌ Une erreur est survenue.");
  }
});



/////////////////////////////////////////////////////////////////////////////////////////


// LIRE_MESSAGE-AUTO
bot.onText(/\/listmsg/, async (msg) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(
      msg.chat.id,
      "⛔ Tu n'es pas autorisé à voir cette liste."
    );
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, contenu, send_date, media_url FROM messages_auto
       WHERE send_date::date = CURRENT_DATE
       ORDER BY send_date ASC`
    );

    if (rows.length === 0) {
      return bot.sendMessage(
        msg.chat.id,
        "📭 Aucun message prévu pour aujourd’hui."
      );
    }

    let response = `📋 *Messages programmés aujourd’hui*:\n\n`;

    for (const row of rows) {
      const shortText =
        row.contenu.length > 25 ? row.contenu.slice(0, 25) + "…" : row.contenu;
      const heure = dayjs(row.send_date).format("HH:mm");
      response += `🆔 ${row.id} | 🕒 ${heure} | ${
        row.media_url ? "📎 Media" : "📝 Texte"
      }\n➡️ ${shortText}\n\n`;
    }

    bot.sendMessage(msg.chat.id, response, { parse_mode: "Markdown" });
  } catch (err) {
    console.error(err);
    bot.sendMessage(
      msg.chat.id,
      "❌ Erreur lors de la récupération des messages."
    );
  }
});

/////////////////////////////////////////////////////////////////////////////////////////

// SUPPRIMÉ MESSAGE PROGRAMME
const pendingDeletions = new Map(); // Pour suivre les demandes de suppression en attente

bot.onText(/\/delmsg (\d+)/, async (msg, match) => {
  const userId = msg.from.id.toString();
  const messageId = match[1];

  if (userId !== adminId) {
    return bot.sendMessage(msg.chat.id, "⛔ Tu n'es pas autorisé à faire ça.");
  }

  // Vérifie si l'ID existe
  const { rows } = await pool.query(
    "SELECT * FROM messages_auto WHERE id = $1",
    [messageId]
  );
  if (rows.length === 0) {
    return bot.sendMessage(
      msg.chat.id,
      `❌ Aucun message trouvé avec l’ID ${messageId}.`
    );
  }

  // Stocke la demande en attente
  pendingDeletions.set(userId, messageId);

  bot.sendMessage(
    msg.chat.id,
    `🗑️ Es-tu sûr de vouloir supprimer le message ID ${messageId} ?`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirmer", callback_data: "confirm_delete" },
            { text: "❌ Annuler", callback_data: "cancel_delete" },
          ],
        ],
      },
    }
  );
});

// RÉPONSE OUI/NON
bot.on("callback_query", async (query) => {
  const userId = query.from.id.toString();
  const action = query.data;
  const chatId = query.message.chat.id;

  if (!pendingDeletions.has(userId)) {
    return bot.answerCallbackQuery(query.id, {
      text: "Aucune suppression en attente.",
    });
  }

  const messageId = pendingDeletions.get(userId);

  if (action === "confirm_delete") {
    try {
      await pool.query("DELETE FROM messages_auto WHERE id = $1", [messageId]);
      pendingDeletions.delete(userId);

      await bot.editMessageText(
        `✅ Message ID ${messageId} supprimé avec succès.`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
        }
      );
    } catch (err) {
      console.error(err);
      await bot.sendMessage(
        chatId,
        "❌ Une erreur est survenue pendant la suppression."
      );
    }
  } else if (action === "cancel_delete") {
    pendingDeletions.delete(userId);
    await bot.editMessageText("❌ Suppression annulée.", {
      chat_id: chatId,
      message_id: query.message.message_id,
    });
  }

  bot.answerCallbackQuery(query.id); // Pour faire disparaître le loading
});


/////////////////////////////////////////////////////////////////////////////////////////


const { Client } = require("pg");
const dayjs = require("dayjs");

bot.onText(/\/addmsg/, (msg) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, "❌ Tu n'as pas l'autorisation.");
  }

  userStates[msg.from.id] = { step: 1 };
  bot.sendMessage(
    msg.chat.id,
    "✏️ Envoie le **contenu du message** à programmer."
  );
});

bot.on("message", async (msg) => {
  const userId = msg.from.id;
  const state = userStates[userId];

  if (!state || msg.text?.startsWith("/")) return;

  const chatId = msg.chat.id;

  // Étape 1 : contenu texte
  if (state.step === 1) {
    state.contenu = msg.text;
    state.step = 2;
    return bot.sendMessage(
      chatId,
      "📎 Envoie un **média** (image, vidéo, audio, voice) OU tape `non` si tu n'en veux pas."
    );
  }

  // Étape 2 : média ou 'non'
  if (state.step === 2) {
    if (msg.text && msg.text.toLowerCase() === "non") {
      state.media_url = null;
      state.media_type = null;
    } else if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      state.media_url = fileId;
      state.media_type = "photo";
    } else if (msg.video) {
      state.media_url = msg.video.file_id;
      state.media_type = "video";
    } else if (msg.voice) {
      state.media_url = msg.voice.file_id;
      state.media_type = "voice";
    } else if (msg.audio) {
      state.media_url = msg.audio.file_id;
      state.media_type = "audio";
    } else if (msg.text && msg.text.startsWith("http")) {
      state.media_url = msg.text;
      state.media_type = null; // Lien direct, type inconnu
    } else {
      return bot.sendMessage(
        chatId,
        "⛔ Format non reconnu. Envoie une image, une vidéo, un audio, un vocal ou tape `non`."
      );
    }

    state.step = 3;
    return bot.sendMessage(
      chatId,
      "🕒 À quelle heure envoyer ? Format `HH:MM` (ex : `08:30`, `20:15`)."
    );
  }

  // Étape 3 : heure d’envoi
  if (state.step === 3) {
    const timeInput = msg.text.trim();
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;

    if (!timeRegex.test(timeInput)) {
      return bot.sendMessage(
        chatId,
        "⛔ Format invalide. Utilise HH:MM (ex : `09:30`, `22:00`)."
      );
    }

    const [hour, minute] = timeInput.split(":");
    const now = dayjs();
    let sendDate = now
      .hour(Number(hour))
      .minute(Number(minute))
      .second(0)
      .millisecond(0);

    if (sendDate.isBefore(now)) {
      sendDate = sendDate.add(1, "day");
    }

    try {
      await pool.query(
        `INSERT INTO messages_auto (contenu, media_url, media_type, send_date) VALUES ($1, $2, $3, $4)`,
        [state.contenu, state.media_url, state.media_type, sendDate.toDate()]
      );

      const resume = `✅ Message enregistré avec succès :\n📝 Texte : ${state.contenu}\n🎞 Média : ${state.media_type || "Aucun"}\n🕒 Envoi prévu : ${sendDate.format("HH:mm")} (${sendDate.format("DD/MM/YYYY")})`;

      await bot.sendMessage(chatId, resume);
    } catch (err) {
      console.error(err);
      await bot.sendMessage(
        chatId,
        "❌ Erreur lors de l'enregistrement du message."
      );
    }

    delete userStates[userId];
  }
});


/////////////////////////////////////////////////////////////////////////////////////////



bot.onText(/\/addfixedmsg/, (msg) => {
  if (msg.from.id.toString() !== adminId) return;
  fixedAddStates[msg.from.id] = { step: 1 };
  bot.sendMessage(msg.chat.id, "📝 Envoie le *texte du message fixe*.", {
    parse_mode: "Markdown",
  });
});

//=== COMMANDE /editfixedmsg ===

bot.onText(/\/editfixedmsg (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const id = parseInt(match[1]);

  if (userId.toString() !== adminId)
    return bot.sendMessage(chatId, "⛔ Tu n'as pas l'autorisation.");

  try {
    const { rows } = await pool.query(
      "SELECT * FROM message_fixes WHERE id = $1",
      [id]
    );
    if (rows.length === 0)
      return bot.sendMessage(chatId, "❌ Message introuvable.");

    fixedEditStates[userId] = { id, step: 1 };
    bot.sendMessage(chatId, "📝 Envoie le nouveau *texte du message*.", {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Erreur lors de la récupération du message.");
  }
});

// ====== GESTION DES MESSAGES POUR AJOUT / ÉDITION =======
bot.on("message", async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  const editState = fixedEditStates[userId];
  const addState = fixedAddStates[userId];
  if ((!editState && !addState) || msg.text?.startsWith("/")) return;

  const handleMedia = (state, msg) => {
    if (msg.text && msg.text.toLowerCase() === "non") {
      state.media_url = null;
      state.media_type = null;
    } else if (msg.photo) {
      state.media_url = msg.photo.at(-1).file_id;
      state.media_type = "photo";
    } else if (msg.video) {
      state.media_url = msg.video.file_id;
      state.media_type = "video";
    } else if (msg.voice) {
      state.media_url = msg.voice.file_id;
      state.media_type = "voice";
    } else if (msg.audio) {
      state.media_url = msg.audio.file_id;
      state.media_type = "audio";
    } else if (msg.text && msg.text.startsWith("http")) {
      state.media_url = msg.text;
      state.media_type = null;
    } else {
      return false;
    }
    return true;
  };

  if (editState) {
    if (editState.step === 1) {
      editState.media_text = msg.text;
      editState.step = 2;
      return bot.sendMessage(
        chatId,
        "📎 Envoie le *nouveau média* (photo, vidéo, voix ou lien) ou tape `non`.",
        { parse_mode: "Markdown" }
      );
    }
    if (editState.step === 2) {
      if (!handleMedia(editState, msg))
        return bot.sendMessage(chatId, "⛔ Format non reconnu. Réessaie.");
      editState.step = 3;
      return bot.sendMessage(
        chatId,
        "🕒 Envoie les *heures* (ex : `06:00,08:00`)",
        { parse_mode: "Markdown" }
      );
    }
    if (editState.step === 3) {
      const heures = msg.text.split(",").map((h) => h.trim());
      const isValid = heures.every((h) =>
        /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(h)
      );
      if (!isValid)
        return bot.sendMessage(chatId, "❌ Format d'heure invalide.");
      editState.heures = heures.join(",");

      const resume = `📝 *Récapitulatif :*\n🆔 ID : ${editState.id}\n📄 Texte : ${editState.media_text}\n🎞 Média : ${editState.media_url ? "Oui" : "Aucun"}\n⏰ Heures : ${editState.heures}`;
      bot.sendMessage(chatId, resume, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Confirmer", callback_data: "confirm_edit" },
              { text: "❌ Annuler", callback_data: "cancel_edit" },
            ],
          ],
        },
      });
      editState.step = 4;
    }
    return;
  }

  if (addState) {
    if (addState.step === 1) {
      addState.media_text = msg.text;
      addState.step = 2;
      return bot.sendMessage(
        chatId,
        "📎 Envoie le *média* (photo, vidéo, voix ou lien) ou tape `non`.",
        { parse_mode: "Markdown" }
      );
    }
    if (addState.step === 2) {
      if (!handleMedia(addState, msg))
        return bot.sendMessage(chatId, "⛔ Format non reconnu. Réessaie.");
      addState.step = 3;
      return bot.sendMessage(
        chatId,
        "🕒 Envoie les *heures* (ex : `06:00,08:00`)",
        { parse_mode: "Markdown" }
      );
    }
    if (addState.step === 3) {
      const heures = msg.text.split(",").map((h) => h.trim());
      const isValid = heures.every((h) =>
        /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(h)
      );
      if (!isValid)
        return bot.sendMessage(chatId, "❌ Format d'heure invalide.");
      addState.heures = heures.join(",");

      const resume = `🆕 *Nouveau message fixe :*\n📄 Texte : ${addState.media_text}\n🎞 Média : ${addState.media_url ? "Oui" : "Aucun"}\n⏰ Heures : ${addState.heures}`;
      bot.sendMessage(chatId, resume, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Enregistrer", callback_data: "confirm_add" },
              { text: "❌ Annuler", callback_data: "cancel_add" },
            ],
          ],
        },
      });
      addState.step = 4;
    }
  }
});

// ✅ MISE À JOUR CALLBACK QUERIES POUR AJOUTER media_type DANS LA BDD
bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;
  const editState = fixedEditStates[userId];
  const addState = fixedAddStates[userId];

  if (data === "confirm_edit" && editState) {
    try {
      await pool.query(
        "UPDATE message_fixes SET media_text=$1, media_url=$2, media_type=$3, heures=$4 WHERE id=$5",
        [
          editState.media_text,
          editState.media_url,
          editState.media_type,
          editState.heures,
          editState.id,
        ]
      );
      await bot.sendMessage(chatId, "✅ Message modifié !");
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Erreur lors de la modification.");
    }
    delete fixedEditStates[userId];
  }

  if (data === "cancel_edit" && editState) {
    await bot.sendMessage(chatId, "❌ Modification annulée.");
    delete fixedEditStates[userId];
  }

  if (data === "confirm_add" && addState) {
    try {
      await pool.query(
        "INSERT INTO message_fixes (media_text, media_url, media_type, heures) VALUES ($1, $2, $3, $4)",
        [
          addState.media_text,
          addState.media_url,
          addState.media_type,
          addState.heures,
        ]
      );
      await bot.sendMessage(chatId, "✅ Message ajouté !");
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Erreur lors de l'ajout.");
    }
    delete fixedAddStates[userId];
  }

  if (data === "cancel_add" && addState) {
    await bot.sendMessage(chatId, "❌ Ajout annulé.");
    delete fixedAddStates[userId];
  }
});

bot.on("callback_query", async (query) => {
  try {
    const data = query.data;
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    // ✅ Test du message fixe
    if (data.startsWith("testfixed_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query("SELECT * FROM message_fixes WHERE id = $1", [id]);
      const row = rows[0];
      if (!row) {
        await bot.sendMessage(chatId, "❌ Message introuvable.");
        return;
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: "📢 Publier maintenant", callback_data: `publishfixed_${id}` },
            { text: "❌ Annuler", callback_data: "cancel_publishfixed" },
          ],
        ],
      };

      switch (row.media_type) {
        case "photo":
          await bot.sendPhoto(chatId, row.media_url, {
            caption: row.media_text,
            reply_markup: keyboard,
          });
          break;
        case "video":
          await bot.sendVideo(chatId, row.media_url, {
            caption: row.media_text,
            reply_markup: keyboard,
          });
          break;
        case "voice":
          await bot.sendVoice(chatId, row.media_url);
          await bot.sendMessage(chatId, row.media_text, { reply_markup: keyboard });
          break;
        case "audio":
          await bot.sendAudio(chatId, row.media_url);
          await bot.sendMessage(chatId, row.media_text, { reply_markup: keyboard });
          break;
        default:
          await bot.sendMessage(chatId, row.media_text, { reply_markup: keyboard });
          break;
      }
    }

    // ✅ Publication dans le canal
    else if (data.startsWith("publishfixed_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query("SELECT * FROM message_fixes WHERE id = $1", [id]);
      const row = rows[0];
      if (!row) {
        await bot.sendMessage(chatId, "❌ Message introuvable.");
        return;
      }

      switch (row.media_type) {
        case "photo":
          await bot.sendPhoto(channelId, row.media_url, { caption: row.media_text });
          break;
        case "video":
          await bot.sendVideo(channelId, row.media_url, { caption: row.media_text });
          break;
        case "voice":
          await bot.sendVoice(channelId, row.media_url);
          await bot.sendMessage(channelId, row.media_text);
          break;
        case "audio":
          await bot.sendAudio(channelId, row.media_url);
          await bot.sendMessage(channelId, row.media_text);
          break;
        default:
          if (row.media_url?.startsWith("http")) {
            await bot.sendMessage(channelId, `${row.media_text}\n🔗 ${row.media_url}`);
          } else {
            await bot.sendMessage(channelId, row.media_text);
          }
          break;
      }

      await bot.sendMessage(chatId, "✅ Message publié dans le canal.");
    }

    // ✅ Annulation de la publication
    else if (data === "cancel_publishfixed") {
      await bot.sendMessage(chatId, "❌ Publication annulée.");
    }

    // ✅ Suppression du message fixe
    else if (data.startsWith("deletefixed_")) {
      if (userId.toString() !== adminId) {
        await bot.answerCallbackQuery(query.id, { text: "🚫 Action non autorisée." });
        return;
      }

      const id = data.split("_")[1];
      await pool.query("DELETE FROM message_fixes WHERE id = $1", [id]);
      await bot.sendMessage(chatId, `✅ Message #${id} supprimé.`);
    }

    // ✅ Toujours répondre au callback
    await bot.answerCallbackQuery(query.id);

  } catch (err) {
    console.error("❌ Erreur dans callback_query:", err);
    await bot.sendMessage(query.message.chat.id, "⚠️ Une erreur est survenue.");
  }
});


/////////////////////////////////////////////////////////////////////////////////////////

//=== COMMANDE /fixedmenu ===

bot.onText(/\/fixedmenu/, async (msg) => {
  if (msg.from.id.toString() !== adminId) return;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM message_fixes ORDER BY id"
    );
    if (rows.length === 0) {
      return bot.sendMessage(msg.chat.id, "📭 Aucun message fixe trouvé.");
    }

    for (const row of rows) {
      const mediaInfo = row.media_url ? "🎞 Oui" : "❌ Aucun";
      const text = `🆔 ID: ${row.id}\n📄 Texte: ${row.media_text}\n🎞 Média: ${mediaInfo}\n⏰ Heures: ${row.heures}`;
      const buttons = [
        [{ text: "✏️ Modifier", callback_data: `editfixed_${row.id}` }],
        [{ text: "🗑 Supprimer", callback_data: `deletefixed_${row.id}` }],
        [{ text: "🧪 Tester", callback_data: `testfixed_${row.id}` }],
      ];

      await bot.sendMessage(msg.chat.id, text, {
        reply_markup: { inline_keyboard: buttons },
      });
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "❌ Erreur lors de la récupération.");
  }
});

// === Gestion des boutons ===
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const data = query.data;

  try {
    if (data.startsWith("deletefixed_")) {
      const id = data.split("_")[1];
      await pool.query("DELETE FROM message_fixes WHERE id=$1", [id]);
      await bot.sendMessage(chatId, `🗑 Message ID ${id} supprimé.`);
    } else if (data.startsWith("testfixed_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query(
        "SELECT * FROM message_fixes WHERE id=$1",
        [id]
      );
      const row = rows[0];

      if (!row) {
        await bot.sendMessage(chatId, "❌ Message introuvable.");
      } else {
        if (row.media_type === "photo") {
          await bot.sendPhoto(chatId, row.media_url, {
            caption: row.media_text,
          });
        } else if (row.media_type === "video") {
          await bot.sendVideo(chatId, row.media_url, {
            caption: row.media_text,
          });
        } else if (row.media_type === "voice") {
          await bot.sendVoice(chatId, row.media_url);
          await bot.sendMessage(chatId, row.media_text);
        } else if (row.media_type === "audio") {
          await bot.sendAudio(chatId, row.media_url);
          await bot.sendMessage(chatId, row.media_text);
        } else if (row.media_url?.startsWith("http")) {
          await bot.sendMessage(chatId, row.media_text);
        } else {
          await bot.sendMessage(chatId, row.media_text);
        }
      }
    } else if (data.startsWith("editfixed_")) {
      const id = data.split("_")[1];
      editStates[userId] = { step: "awaiting_text", id };
      await bot.sendMessage(
        chatId,
        "✏️ Envoie le nouveau texte (caption) du message."
      );
    }

    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error("Erreur callback_query:", err);
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Erreur interne",
      show_alert: true,
    });
  }
});

// === Suivi de la modification (étape texte puis heures) ===
bot.on("message", async (msg) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  if (editStates[userId]) {
    const state = editStates[userId];

    if (state.step === "awaiting_text") {
      state.text = msg.text;
      state.step = "awaiting_hours";
      return bot.sendMessage(
        chatId,
        "⏰ Envoie les nouvelles heures au format HH:MM, séparées par virgules.\nExemple : 06:00, 14:30, 22:00"
      );
    }

    if (state.step === "awaiting_hours") {
      state.heures = msg.text;
      await pool.query(
        "UPDATE message_fixes SET media_text=$1, heures=$2 WHERE id=$3",
        [state.text, state.heures, state.id]
      );
      delete editStates[userId];
      return bot.sendMessage(
        chatId,
        `✅ Message ID ${state.id} modifié avec succès.`
      );
    }
  }
});



/////////////////////////////////////////////////////////////////////////////////////////




/////////////////////////////////////////////////////////////////////////////////////////
