
const schedule = require('node-schedule');
const bot = require("./bot");
require("./server");
require("./pingCron");
require("./autoSend");
require("./autoSender");
require('./cleanLogs');
const { ping } = require("./pingServer")

// Forcer l’environnement à utiliser l’heure de Lomé
process.env.TZ = 'Africa/Lome';
const moment = require('moment-timezone');
const { pool, insertManualCoupon } = require("./db");

const ADMIN_ID = process.env.ADMIN_ID;

const CANAL_ID = process.env.CANAL_ID;
const adminId = process.env.TELEGRAM_ADMIN_ID;
const channelId = process.env.TELEGRAM_CHANNEL_ID;
const ADMIN_IDS = process.env.ADMIN_IDS.split(",").map(Number);

// ====== CONFIGURATION ENV ======
const port = process.env.PORT || 3000;
const token = process.env.TELEGRAM_TOKEN;
if (!token) throw new Error("❌ TELEGRAM_TOKEN non défini !");
const baseUrl = process.env.BASE_URL; // ✅ ✅ ✅ à utiliser sur Render !
if (!baseUrl) throw new Error("❌ BASE_URL manquant dans .env !");

// ====== GESTION DES ÉTATS ======
const pendingCoupon = {};
const pendingCustomRejects = {};
const userStates = {}; 
const fixedDeletionConfirmations = new Map();
const editFixedStates = {};
const userLang = {};
const fixedAddStates = {};
const fixedEditStates = {};
const editStates = {};


const ultimateSend = require("./ultimateTelegramSend");;
const supabase = require('./db');

async function sendFromDB() {
   const chatId = '@Roux_Canal_linktree_intermidiare';

  const { data, error } = await supabase
    .from('messages')
    .select('content')
    .eq('lang', 'FR')
    .limit(1)
    .single();

  if (error || !data) return console.error("Erreur DB:", error);

  const messageFromDB = data.content;

  await ultimateSend(chatId, messageFromDB, { citation: true });
}

sendFromDB();


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

bot.onText(/\/admin_menu/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_IDS.includes(userId)) {
    return bot.sendMessage(chatId, "⛔ Accès refusé, réservé à l'admin.");
  }

  bot.sendMessage(chatId, "📌 Menu Admin :", {
    reply_markup: {
      keyboard: [
        [{ text: "/admin" }],          
        [{ text: "/ajouter_prono" }, { text: "/voir_pronos" }],   
        [{ text: "/addfixedmsg" }, { text:  "/fixedmenu" }],     
        [{ text: "/addmsg" }, { text: "/listmsgs"}],     
        [{ text: "/addfixedmsg" }],     
        [{ text: "/settings" }],        
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
});


// Commande pour obtenir l'ID du chat courant
bot.onText(/\/getid/, async (msg) => {
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;
  const chatName = msg.chat.title || msg.chat.first_name || "Inconnu";

  await bot.sendMessage(
    msg.chat.id,
    `📌 Informations sur ce chat :\n\n` +
    `🆔 Chat ID : <code>${chatId}</code>\n` +
    `📛 Nom : ${chatName}\n` +
    `📂 Type : ${chatType}`,
    { parse_mode: "HTML" }
  );
});


/////////////////////////////////////////////////////////////////////////////////////////


                   //=== COMMANDE /ajouter_prono ===\\
// ====================== AJOUT MANUEL DE PRONO ======================

// --- Commande /ajouter_prono ---
bot.onText(/\/ajouter_prono/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!ADMIN_IDS.includes(userId))
    return bot.sendMessage(chatId, "🚫 Commande réservée à l’admin.");

  pendingCoupon[chatId] = {
    step: "awaiting_date",
    content: "",
    date: null,
    mediaType: null,
    type: "gratuit",
    mediaUrl: null
  };

  bot.sendMessage(chatId, "📅 Pour quelle date est ce prono ? Ex: 2025-09-10 ou tape /today");
});

// --- /today ---
bot.onText(/\/today/, (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || state.step !== "awaiting_date") return;

  const today = new Date();
  today.setUTCHours(0,0,0,0);
  state.date = today;
  state.step = "awaiting_content";

  bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
});

// --- Gestion messages ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || msg.text?.startsWith("/")) return;

  // --- Date ---
  if (state.step === "awaiting_date" && /^\d{4}-\d{2}-\d{2}$/.test(msg.text)) {
    const inputDate = new Date(msg.text + "T00:00:00Z");
    const today = new Date();
    today.setUTCHours(0,0,0,0);
    if (inputDate < today) return bot.sendMessage(chatId, "❌ La date ne peut pas être dans le passé.");

    state.date = inputDate;
    state.step = "awaiting_content";
    return bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
  }

  // --- Contenu ---
  if (state.step === "awaiting_content") {
    state.content = msg.text;
    state.step = "awaiting_confirmation";

    const recap = `📝 *Récapitulatif du prono:*\n📅 Date: *${state.date.toISOString().slice(0,10)}*\n✍️ Contenu: *${state.content}*\n\nSouhaites-tu continuer ?`;
    return bot.sendMessage(chatId, recap, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Confirmer", callback_data: "confirm_prono" }],
          [{ text: "❌ Annuler", callback_data: "cancel_prono" }]
        ]
      }
    });
  }

  // --- Média ---
  if (state.step === "awaiting_media") {
    let mediaUrl = null;
    let mediaType = null;

    if (msg.photo) { mediaUrl = msg.photo.at(-1).file_id; mediaType = "photo"; }
    else if (msg.video) { mediaUrl = msg.video.file_id; mediaType = "video"; }
    else if (msg.voice) { mediaUrl = msg.voice.file_id; mediaType = "voice"; }
    else if (msg.audio) { mediaUrl = msg.audio.file_id; mediaType = "audio"; }

    if (mediaUrl) {
      state.mediaUrl = mediaUrl;
      state.mediaType = mediaType;

      const result = await insertManualCoupon(state.content, state.mediaUrl, state.mediaType, state.date, state.type);
      if (result.success) await bot.sendMessage(chatId, `✅ Coupon *${state.type.toUpperCase()}* ajouté pour le ${state.date.toISOString().slice(0,10)}`, { parse_mode: "Markdown" });
      else await bot.sendMessage(chatId, "❌ Erreur : " + result.error.message);

      delete pendingCoupon[chatId];
      return;
    }

    return bot.sendMessage(chatId, "❌ Envoie une *photo*, *vidéo*, *note vocale* ou *audio*, ou tape /skip.", { parse_mode: "Markdown" });
  }
});

// --- Boutons inline ---
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const state = pendingCoupon[chatId];
  if (!state) return bot.answerCallbackQuery(query.id);

  if (query.data === "confirm_prono") {
    state.step = "awaiting_type";
    await bot.sendMessage(chatId, "🎯 Choisis le type de prono :", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Gratuit", callback_data: "type_gratuit" }],
          [{ text: "Premium", callback_data: "type_premium" }]
        ]
      }
    });
  }

  if (query.data === "cancel_prono") {
    delete pendingCoupon[chatId];
    await bot.sendMessage(chatId, "❌ Ajout du prono annulé.");
  }

  if (state.step === "awaiting_type" && (query.data === "type_gratuit" || query.data === "type_premium")) {
    state.type = query.data === "type_gratuit" ? "gratuit" : "premium";
    state.step = "awaiting_media";
    await bot.sendMessage(chatId, "📎 Envoie maintenant une *photo*, *vidéo*, *note vocale* ou *audio* pour ce prono, ou tape /skip.", { parse_mode: "Markdown" });
  }

  await bot.answerCallbackQuery(query.id);
});

// --- /skip ---
bot.onText(/\/skip/, async (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || state.step !== "awaiting_media") return;

  const result = await insertManualCoupon(state.content, null, null, state.date, state.type);
  if (result.success) await bot.sendMessage(chatId, `✅ Coupon *${state.type.toUpperCase()}* ajouté pour le ${state.date.toISOString().slice(0,10)}`, { parse_mode: "Markdown" });
  else await bot.sendMessage(chatId, "❌ Erreur : " + result.error.message);

  delete pendingCoupon[chatId];
});

                    //=== COMMANDE /voir_pronos ===\\
// ====================== AJOUT MANUEL DE PRONO ======================
// --- Commande /voir_pronos ---
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
            { text: "🚀 Publier maintenant", callback_data: `postnow_${row.id}` },
            { text: "🧪 Tester", callback_data: `test_${row.id}` },
          ],
        ],
      };

      if (row.media_url && row.media_type === "photo") {
        await bot.sendPhoto(chatId, row.media_url, { caption, reply_markup: keyboard });
      } else if (row.media_url && row.media_type === "video") {
        await bot.sendVideo(chatId, row.media_url, { caption, reply_markup: keyboard });
      } else {
        await bot.sendMessage(chatId, caption, { reply_markup: keyboard });
      }
    }
  } catch (err) {
    console.error("Erreur voir_pronos:", err);
    bot.sendMessage(chatId, "❌ Erreur lors de la récupération des pronos.");
  }
});

// --- Callback général ---
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  const msgId = query.message.message_id;

  if (!ADMIN_IDS.includes(userId)) {
    return bot.answerCallbackQuery(query.id, { text: "⛔ Accès refusé." });
  }

  try {
    // --- Supprimer ---
    if (data.startsWith("delete_")) {
      const id = data.split("_")[1];

      const keyboard = {
        inline_keyboard: [
          [
            { text: "✅ Confirmer", callback_data: `confirmdelete_${id}` },
            { text: "❌ Annuler", callback_data: `cancel` },
          ],
        ],
      };

      if (query.message.text) {
        await bot.editMessageReplyMarkup(keyboard, { chat_id: chatId, message_id: msgId });
      } else {
        await bot.sendMessage(chatId, `❌ Confirmer la suppression du prono ${id}:`, { reply_markup: keyboard });
      }
      return;
    }

    // --- Confirmation suppression ---
    if (data.startsWith("confirmdelete_")) {
      const id = data.split("_")[1];
      await pool.query("DELETE FROM daily_pronos WHERE id = $1", [id]);

      await bot.sendMessage(chatId, `✅ Prono ${id} supprimé.`);
      try { await bot.deleteMessage(chatId, msgId); } catch (e) {}
      return;
    }

    // --- Annulation ---
    if (data === "cancel") {
      try { await bot.deleteMessage(chatId, msgId); } catch (e) {}
      return;
    }

    // --- Editer ---
    if (data.startsWith("edit_")) {
      const id = data.split("_")[1];
      editStates[chatId] = {
        step: "edit_text",
        pronoId: id,
        newContent: null,
        newMediaUrl: null,
        newMediaType: null,
      };
      return bot.sendMessage(chatId, `✍️ Envoie le nouveau texte pour le prono ID ${id}, ou tape /cancel pour annuler.`);
    }

    // --- Tester ---
    if (data.startsWith("test_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query("SELECT * FROM daily_pronos WHERE id = $1", [id]);
      const prono = rows[0];
      if (!prono) return;

      const caption = `🆔 ${prono.id}\n📅 ${prono.date}\n📝 ${prono.content}`;
      if (prono.media_url && prono.media_type === "photo")
        await bot.sendPhoto(chatId, prono.media_url, { caption });
      else if (prono.media_url && prono.media_type === "video")
        await bot.sendVideo(chatId, prono.media_url, { caption });
      else await bot.sendMessage(chatId, caption);

      return;
    }

    // --- Publier maintenant ---
    if (data.startsWith("postnow_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query("SELECT * FROM daily_pronos WHERE id = $1", [id]);
      const prono = rows[0];
      if (!prono) return;

      if (!CANAL_ID) return bot.sendMessage(chatId, "❌ CANAL_ID non défini.");

      const caption = `📢 PRONOSTIC DU JOUR\n\n🆔 ${prono.id}\n📅 ${prono.date}\n📝 ${prono.content}`;
      if (prono.media_url && prono.media_type === "photo")
        await bot.sendPhoto(CANAL_ID, prono.media_url, { caption });
      else if (prono.media_url && prono.media_type === "video")
        await bot.sendVideo(CANAL_ID, prono.media_url, { caption });
      else await bot.sendMessage(CANAL_ID, caption);

      await bot.sendMessage(chatId, `✅ Prono ${id} publié dans le canal.`);
      return;
    }

    await bot.answerCallbackQuery(query.id);

  } catch (err) {
    console.error("Erreur callback:", err);
    bot.sendMessage(chatId, "❌ Une erreur est survenue.");
  }
});

// --- Gestion messages pour édition ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = editStates[chatId];
  if (!state) return;

  // --- Étape texte ---
  if (state.step === "edit_text" && msg.text && !msg.text.startsWith("/")) {
    state.newContent = msg.text;
    state.step = "edit_media";

    return bot.sendMessage(chatId, "📎 Envoie un nouveau média (*photo*, *vidéo*, *note vocale*, *audio*) ou tape /skip pour garder l'ancien.", { parse_mode: "Markdown" });
  }

  // --- Étape média ---
  if (state.step === "edit_media") {
    let mediaUrl = null;
    let mediaType = null;

    if (msg.photo) { mediaUrl = msg.photo.at(-1).file_id; mediaType = "photo"; }
    else if (msg.video) { mediaUrl = msg.video.file_id; mediaType = "video"; }
    else if (msg.voice) { mediaUrl = msg.voice.file_id; mediaType = "voice"; }
    else if (msg.audio) { mediaUrl = msg.audio.file_id; mediaType = "audio"; }

    if (mediaUrl) {
      state.newMediaUrl = mediaUrl;
      state.newMediaType = mediaType;
    }

    const queryText = `
      UPDATE daily_pronos
      SET content = $1,
          media_url = COALESCE($2, media_url),
          media_type = COALESCE($3, media_type)
      WHERE id = $4
    `;
    await pool.query(queryText, [state.newContent, state.newMediaUrl, state.newMediaType, state.pronoId]);

    await bot.sendMessage(chatId, `✅ Prono ID ${state.pronoId} mis à jour avec succès.`);
    delete editStates[chatId];
  }
});

// --- Commande /skip pour édition média ---
bot.onText(/\/skip/, async (msg) => {
  const chatId = msg.chat.id;
  const state = editStates[chatId];
  if (!state || state.step !== "edit_media") return;

  await pool.query("UPDATE daily_pronos SET content = $1 WHERE id = $2", [state.newContent, state.pronoId]);

  await bot.sendMessage(chatId, `✅ Prono ID ${state.pronoId} mis à jour (média inchangé).`);
  delete editStates[chatId];
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


/////////////////////////////////////// ✅ VOIRE LE CLASSEMENT DE PARRAIN ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
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
      message += `🥇 *${index + 1}. ${nom}* — ${row.filleuls} filleul(s), ${row.points} pts\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Erreur /topparrains :", error);
    bot.sendMessage(chatId, "❌ Impossible d'afficher le classement.");
  }
});

const CHANNEL_ID = "@Roux_Canal_linktree_intermidiare";

// ✅ Classement automatique tous les dimanches à 18h (heure Lomé)
schedule.scheduleJob({ hour: 18, minute: 0, dayOfWeek: 0 }, async () => {
  const now = moment().tz('Africa/Lome').format("YYYY-MM-DD HH:mm:ss");
  console.log("🕒 Envoi automatique Top 5 (hebdo) à :", now);

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
      message += `🏅 *${index + 1}. ${nom}* — ${row.filleuls} filleul(s), ${row.points} pts\n`;
    });

    message += `\n🕒 Envoyé à ${moment().tz("Africa/Lome").format("HH:mm")} (heure Lomé)`;

    bot.sendMessage(CHANNEL_ID, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Erreur classement auto :", error);
  }
});

const TELEGRAM_CHANNEL_ID = "@Roux_Canal_linktree_intermidiare";

// 🔁 Fonction pour publier le Top 5 mensuel et reset les points
async function publierClassementEtReset() {
  try {
    const { rows: topUsers } = await pool.query(`
      SELECT id, username, firstname, points
      FROM users
      ORDER BY points DESC
      LIMIT 5
    `);

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

    // 🔹 Envoi dans le canal
    await bot.sendMessage(TELEGRAM_CHANNEL_ID, message, {
      parse_mode: "Markdown",
    });

    // 🔹 Reset des points
    await pool.query("UPDATE users SET points = 0");
    console.log("✅ Points remis à zéro le", moment().tz("Africa/Lome").format("YYYY-MM-DD HH:mm:ss"));
  } catch (err) {
    console.error("❌ Erreur dans publierClassementEtReset :", err);
  }
}

// ✅ Reset des points chaque 1er du mois à 00h00 (heure Lomé)
schedule.scheduleJob({ hour: 0, minute: 0, date: 1 }, () => {
  const now = moment().tz('Africa/Lome').format("YYYY-MM-DD HH:mm:ss");
  console.log("📆 Début de la tâche mensuelle (reset points) à :", now);
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





/////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////

const { Client } = require("pg");
const dayjs = require("dayjs");



                        //=== COMMANDE /addmsg ===\\
// ====================== AJOUT MANUEL DE MESSAGE ======================

// --- Commande /addmsg ---

bot.onText(/\/addmsg/, (msg) => {
  const userId = msg.from.id.toString();
  if (userId !== adminId) {
    return bot.sendMessage(msg.chat.id, "❌ *Désolé, tu n’as pas l’autorisation d’utiliser cette commande.*", { parse_mode: "Markdown" });
  }

  userStates[userId] = { step: 1 };
  bot.sendMessage(msg.chat.id, "✏️ *Veuillez envoyer le texte du message à programmer.*", { parse_mode: "Markdown" });
});

bot.on("message", async (msg) => {
  const userId = msg.from.id.toString();
  const state = userStates[userId];
  if (!state || msg.text?.startsWith("/")) return;

  const chatId = msg.chat.id;

  // --- Étape 1 : contenu texte ---
  if (state.step === 1) {
    state.contenu = msg.text;
    state.step = 2;
    return bot.sendMessage(
      chatId,
      "📎 *Vous pouvez maintenant envoyer un média (photo, vidéo, audio, voice, video_note) ou tapez `non` pour aucun média.*",
      { parse_mode: "Markdown" }
    );
  }

  // --- Étape 2 : média ou 'non' ---
  if (state.step === 2) {
    if (msg.text && msg.text.toLowerCase() === "non") {
      state.media_url = null;
      state.media_type = null;
    } else if (msg.photo) {
      state.media_url = msg.photo[msg.photo.length - 1].file_id;
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
    } else if (msg.video_note) {
      state.media_url = msg.video_note.file_id;
      state.media_type = "video_note";
    } else if (msg.text && msg.text.startsWith("http")) {
      state.media_url = msg.text;
      state.media_type = "url";
    } else {
      return bot.sendMessage(
        chatId,
        "⛔ *Format non reconnu. Merci d’envoyer un média valide ou tapez `non`.*",
        { parse_mode: "Markdown" }
      );
    }

    state.step = 3;
    return bot.sendMessage(
      chatId,
      "🕒 *Indiquez la date et l’heure d’envoi du message au format `DD/MM/YYYY HH:MM` (ex : 13/09/2025 20:30).*",
      { parse_mode: "Markdown" }
    );
  }

  // --- Étape 3 : date et heure ---
  if (state.step === 3) {
    const dateTimeInput = msg.text.trim();
    const dateTimeRegex = /^([0-2]?[0-9]|3[0-1])\/(0?[1-9]|1[0-2])\/(\d{4}) ([01]?[0-9]|2[0-3]):([0-5][0-9])$/;

    if (!dateTimeRegex.test(dateTimeInput)) {
      return bot.sendMessage(
        chatId,
        "⛔ *Format invalide. Merci d’utiliser `DD/MM/YYYY HH:MM` (ex : 13/09/2025 20:30).*",
        { parse_mode: "Markdown" }
      );
    }

    const [, day, month, year, hour, minute] = dateTimeInput.match(dateTimeRegex).map(Number);
    let sendDate = dayjs().year(year).month(month - 1).date(day).hour(hour).minute(minute).second(0).millisecond(0);

    if (sendDate.isBefore(dayjs())) {
      return bot.sendMessage(chatId, "⛔ *Cette date est déjà passée. Choisissez une date future.*", { parse_mode: "Markdown" });
    }

    try {
      await pool.query(
        `INSERT INTO messages_auto (contenu, media_url, media_type, send_date) VALUES ($1, $2, $3, $4)`,
        [state.contenu, state.media_url, state.media_type, sendDate.toDate()]
      );

      const mediaText = state.media_type ? state.media_type : "Aucun média";

      await bot.sendMessage(
        chatId,
        `✅ *Votre message a été programmé avec succès :*\n\n📝 *Texte* : ${state.contenu}\n🎞 *Média* : ${mediaText}\n🕒 *Envoi prévu* : ${sendDate.format("DD/MM/YYYY HH:mm")}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("Erreur ajout message auto:", err);
      await bot.sendMessage(chatId, "❌ *Une erreur est survenue lors de l’enregistrement du message.*", { parse_mode: "Markdown" });
    }

    delete userStates[userId];
  }
});

// --- Fonction d’envoi automatique ---
async function envoyerMessage(programme) {
  try {
    if (programme.media_type === "photo") {
      await bot.sendPhoto(CANAL_ID, programme.media_url, { caption: programme.contenu });
    } else if (programme.media_type === "video") {
      await bot.sendVideo(CANAL_ID, programme.media_url, { caption: programme.contenu });
    } else if (programme.media_type === "voice") {
      await bot.sendVoice(CANAL_ID, programme.media_url, { caption: programme.contenu });
    } else if (programme.media_type === "audio") {
      await bot.sendAudio(CANAL_ID, programme.media_url, { caption: programme.contenu });
    } else if (programme.media_type === "video_note") {
      await bot.sendVideoNote(CANAL_ID, programme.media_url); // ⚡ vidéo ronde
    } else if (programme.media_type === "url") {
      await bot.sendMessage(CANAL_ID, `${programme.contenu}\n🔗 ${programme.media_url}`);
    } else {
      await bot.sendMessage(CANAL_ID, programme.contenu);
    }
  } catch (err) {
    console.error("❌ Erreur envoi automatique:", err);
  }
}


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


                        //=== COMMANDE /listmsg ===\\
// ====================== LISTES DES MESSAGES-AUTO ======================


// --- Commande /listmsgs ---
bot.onText(/\/listmsgs/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId.toString() !== adminId) {
    return bot.sendMessage(chatId, "⛔ Accès réservé à l'admin.");
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM messages_auto ORDER BY id DESC LIMIT 10"
    );

    if (rows.length === 0) {
      return bot.sendMessage(chatId, "📭 Aucun message programmé trouvé.");
    }

    for (const row of rows) {
      const caption = `🆔 ${row.id}\n🕒 ${dayjs(row.send_date).format("HH:mm DD/MM/YYYY")}\n📝 ${row.contenu || row.media_text || ""}\n🎞 Média : ${row.media_type || "Aucun"}${row.media_url && !row.media_type ? `\n🔗 URL : ${row.media_url}` : ""}`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "✏️ Modifier", callback_data: `editmsg_${row.id}` },
            { text: "🗑️ Supprimer", callback_data: `deletemsg_${row.id}` },
          ],
          [{ text: "🧪 Tester", callback_data: `testmsg_${row.id}` }],
        ],
      };

      if (row.media_url && row.media_type === "photo") await bot.sendPhoto(chatId, row.media_url, { caption, reply_markup: keyboard });
      else if (row.media_url && row.media_type === "video") await bot.sendVideo(chatId, row.media_url, { caption, reply_markup: keyboard });
      else if (row.media_url && row.media_type === "voice") await bot.sendVoice(chatId, row.media_url, { caption, reply_markup: keyboard });
      else if (row.media_url && row.media_type === "audio") await bot.sendAudio(chatId, row.media_url, { caption, reply_markup: keyboard });
      else if (row.media_url && row.media_type === "video_note") await bot.sendVideoNote(chatId, row.media_url, { reply_markup: keyboard });
      else await bot.sendMessage(chatId, caption, { reply_markup: keyboard });
    }
  } catch (err) {
    console.error("Erreur /listmsgs:", err);
    bot.sendMessage(chatId, "❌ Une erreur est survenue lors de la récupération des messages.");
  }
});

// --- Callback général pour /listmsgs ---
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  const msgId = query.message.message_id;

  if (userId.toString() !== adminId) {
    return bot.answerCallbackQuery(query.id, { text: "⛔ Accès refusé." });
  }

  try {
    // --- Supprimer ---
    if (data.startsWith("deletemsg_")) {
      const id = data.split("_")[1];
      const keyboard = {
        inline_keyboard: [
          [
            { text: "✅ Confirmer", callback_data: `confirmdeletemsg_${id}` },
            { text: "❌ Annuler", callback_data: "cancelmsg" },
          ],
        ],
      };
      await bot.editMessageReplyMarkup(keyboard, { chat_id: chatId, message_id: msgId });
      return;
    }

    if (data.startsWith("confirmdeletemsg_")) {
      const id = data.split("_")[1];
      await pool.query("DELETE FROM messages_auto WHERE id = $1", [id]);
      await bot.sendMessage(chatId, `✅ Message ID ${id} supprimé.`);
      try { await bot.deleteMessage(chatId, msgId); } catch (e) {}
      return;
    }

    if (data === "cancelmsg") {
      try { await bot.deleteMessage(chatId, msgId); } catch (e) {}
      return;
    }

    // --- Tester ---
    if (data.startsWith("testmsg_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query("SELECT * FROM messages_auto WHERE id = $1", [id]);
      const msgData = rows[0];
      if (!msgData) return;

      const caption = msgData.contenu || msgData.media_text || "";

      if (msgData.media_url && msgData.media_type === "photo") await bot.sendPhoto(chatId, msgData.media_url, { caption });
      else if (msgData.media_url && msgData.media_type === "video") await bot.sendVideo(chatId, msgData.media_url, { caption });
      else if (msgData.media_url && msgData.media_type === "voice") await bot.sendVoice(chatId, msgData.media_url, { caption });
      else if (msgData.media_url && msgData.media_type === "audio") await bot.sendAudio(chatId, msgData.media_url, { caption });
      else if (msgData.media_url && msgData.media_type === "video_note") await bot.sendVideoNote(chatId, msgData.media_url);
      else if (msgData.media_url && !msgData.media_type) await bot.sendMessage(chatId, `🔗 Lien : ${msgData.media_url}\n${caption}`);
      else await bot.sendMessage(chatId, caption);
      return;
    }

    // --- Modifier (texte / média / URL) ---
    if (data.startsWith("editmsg_")) {
      const id = data.split("_")[1];
      editStates[chatId] = { step: "edit_text", msgId: id, newContent: null, newMediaUrl: null, newMediaType: null };
      return bot.sendMessage(chatId, `✍️ Envoie le nouveau texte pour le message ID ${id}, ou tape /cancel pour annuler.`);
    }

    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error("Erreur callback /listmsgs:", err);
    bot.sendMessage(chatId, "❌ Une erreur est survenue.");
  }
});

// --- Gestion de l'édition ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = editStates[chatId];
  if (!state) return;

  // --- Étape texte ---
  if (state.step === "edit_text" && msg.text && !msg.text.startsWith("/")) {
    state.newContent = msg.text;
    state.step = "edit_media";
    return bot.sendMessage(chatId, "📎 Envoie un nouveau média (*photo*, *vidéo*, *audio*, *voice*, *video_note*) ou une URL OU tape /skip pour garder l'ancien.", { parse_mode: "Markdown" });
  }

  // --- Étape média / URL ---
  if (state.step === "edit_media") {
    let mediaUrl = null;
    let mediaType = null;

    if (msg.photo) { mediaUrl = msg.photo.at(-1).file_id; mediaType = "photo"; }
    else if (msg.video) { mediaUrl = msg.video.file_id; mediaType = "video"; }
    else if (msg.audio) { mediaUrl = msg.audio.file_id; mediaType = "audio"; }
    else if (msg.voice) { mediaUrl = msg.voice.file_id; mediaType = "voice"; }
    else if (msg.video_note) { mediaUrl = msg.video_note.file_id; mediaType = "video_note"; }
    else if (msg.text && msg.text.startsWith("http")) { mediaUrl = msg.text; mediaType = null; }

    if (mediaUrl) {
      state.newMediaUrl = mediaUrl;
      state.newMediaType = mediaType;
    }

    const queryText = `
      UPDATE messages_auto
      SET contenu = $1,
          media_url = COALESCE($2, media_url),
          media_type = COALESCE($3, media_type),
          updated_at = now()
      WHERE id = $4
    `;
    await pool.query(queryText, [state.newContent, state.newMediaUrl, state.newMediaType, state.msgId]);

    await bot.sendMessage(chatId, `✅ Message ID ${state.msgId} mis à jour avec succès.`);
    delete editStates[chatId];
  }
});

// --- Commande /skip pour garder ancien média / URL ---
bot.onText(/\/skip/, async (msg) => {
  const chatId = msg.chat.id;
  const state = editStates[chatId];
  if (!state || state.step !== "edit_media") return;

  await pool.query("UPDATE messages_auto SET contenu = $1, updated_at = now() WHERE id = $2", [state.newContent, state.msgId]);
  await bot.sendMessage(chatId, `✅ Message ID ${state.msgId} mis à jour (média / URL inchangé).`);
  delete editStates[chatId];
});



//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


                       //=== COMMANDE /addfixedmsg ===\\
// ====================== AJOUTE DES MESSAGES-FIXE ======================


// --- /addfixedmsg ----

bot.onText(/\/addfixedmsg/, (msg) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, "❌ Tu n'es pas autorisé.");
  }

  userStates[msg.from.id] = { step: "awaiting_text" };
  bot.sendMessage(
    msg.chat.id,
    "✏️ *Envoie le texte principal du message fixe*",
    { parse_mode: "Markdown" }
  );
});

bot.on("message", async (msg) => {
  const userId = msg.from.id;
  const state = userStates[userId];
  if (!state || msg.text?.startsWith("/")) return;

  const chatId = msg.chat.id;

  // Étape 1 : Texte
  if (state.step === "awaiting_text") {
    state.media_text = msg.text;
    state.step = "awaiting_media";
    return bot.sendMessage(
      chatId,
      "📎 *Envoie un média* (photo, vidéo, audio, vocal, vidéo ronde) *ou une URL externe*, ou tape `non` si tu n'en veux pas.",
      { parse_mode: "Markdown" }
    );
  }

  // Étape 2 : Média ou 'non'
  if (state.step === "awaiting_media") {
    if (msg.text && msg.text.toLowerCase() === "non") {
      state.media_url = null;
      state.media_type = null;
    } else if (msg.photo) {
      state.media_url = msg.photo[msg.photo.length - 1].file_id;
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
    } else if (msg.video_note) {
      state.media_url = msg.video_note.file_id;
      state.media_type = "video_note";
    } else if (msg.text && msg.text.startsWith("http")) {
      state.media_url = msg.text;
      state.media_type = "url";
    } else {
      return bot.sendMessage(
        chatId,
        "⛔ *Format non reconnu*. Envoie une image, vidéo, audio, vocal, vidéo ronde, URL ou tape `non`.",
        { parse_mode: "Markdown" }
      );
    }

    state.step = "awaiting_time";
    return bot.sendMessage(
      chatId,
      "🕒 *Envoie l'heure d'envoi* (format `HH:MM`, ex : `08:30`).",
      { parse_mode: "Markdown" }
    );
  }

  // Étape 3 : Heure
  if (state.step === "awaiting_time") {
    const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!regex.test(msg.text.trim())) {
      return bot.sendMessage(
        chatId,
        "⛔ *Format invalide*. Utilise `HH:MM` (ex : `09:30`, `22:00`).",
        { parse_mode: "Markdown" }
      );
    }

    state.heures = msg.text.trim();
    state.step = "awaiting_lang";

    return bot.sendMessage(
      chatId,
      "🌐 *Choisis la langue du message fixe* :",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🇫🇷 FR", callback_data: "lang:FR" },
              { text: "🇬🇧 EN", callback_data: "lang:EN" },
            ],
          ],
        },
      }
    );
  }
});

// === Callback Queries ===
bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  const state = userStates[userId];
  const chatId = query.message.chat.id;

  if (!state) return;

  const data = query.data;

  // Choix langue
  if (data.startsWith("lang:")) {
    state.lang = data.split(":")[1];

    // Prévisualisation
    let preview = `📝 *Texte* : ${state.media_text}\n🕒 *Heure* : ${state.heures}\n🌐 *Langue* : ${state.lang}`;
    preview += `\n🎞 *Média* : ${state.media_type || "Aucun"}`;

    if (state.media_url) {
      if (state.media_type === "photo") {
        await bot.sendPhoto(chatId, state.media_url, {
          caption: preview,
          parse_mode: "Markdown",
        });
      } else if (state.media_type === "video") {
        await bot.sendVideo(chatId, state.media_url, {
          caption: preview,
          parse_mode: "Markdown",
        });
      } else if (state.media_type === "voice") {
        await bot.sendVoice(chatId, state.media_url, {
          caption: preview,
          parse_mode: "Markdown",
        });
      } else if (state.media_type === "audio") {
        await bot.sendAudio(chatId, state.media_url, {
          caption: preview,
          parse_mode: "Markdown",
        });
      } else if (state.media_type === "video_note") {
        await bot.sendVideoNote(chatId, state.media_url);
        await bot.sendMessage(chatId, preview, { parse_mode: "Markdown" });
      } else if (state.media_type === "url") {
        await bot.sendMessage(chatId, `${preview}\n🔗 ${state.media_url}`, {
          parse_mode: "Markdown",
        });
      }
    } else {
      await bot.sendMessage(chatId, preview, { parse_mode: "Markdown" });
    }

    // Confirmation
    return bot.sendMessage(chatId, "✅ *Confirmer l'enregistrement ?*", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirmer", callback_data: "confirm_add_fixed" },
            { text: "❌ Annuler", callback_data: "cancel_add_fixed" },
          ],
        ],
      },
    });
  }

  // Confirmation ajout
  if (data === "confirm_add_fixed") {
    try {
      await pool.query(
        `INSERT INTO message_fixes (media_text, media_url, heures, media_type, lang)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          state.media_text,
          state.media_url,
          state.heures,
          state.media_type,
          state.lang,
        ]
      );
      await bot.sendMessage(
        chatId,
        "✅ *Message fixe enregistré avec succès !*",
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error(err);
      await bot.sendMessage(
        chatId,
        "❌ *Erreur lors de l'enregistrement en base.*",
        { parse_mode: "Markdown" }
      );
    }
    delete userStates[userId];
  }

  // Annulation
  if (data === "cancel_add_fixed") {
    delete userStates[userId];
    await bot.sendMessage(chatId, "❌ *Ajout annulé.*", {
      parse_mode: "Markdown",
    });
  }
});


/////////////////////////////////////////////////////////////////////////////////////////


                        //=== COMMANDE /fixedmenu ===\\
// ====================== LISTES DES MESSAGES-FIXE ======================


//--- COMMANDE /fixedmenu ---

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
      const mediaInfo = row.media_url
        ? `🎞 ${row.media_type || "Inconnu"}`
        : "❌ Aucun";

      const text = `🆔 *ID*: ${row.id}\n📄 *Texte*: ${row.media_text}\n🎞 *Média*: ${mediaInfo}\n⏰ *Heures*: ${row.heures}\n🌐 *Langue*: ${row.lang}`;

      const buttons = [
        [{ text: "✏️ Modifier", callback_data: `editfixed_${row.id}` }],
        [{ text: "🗑 Supprimer", callback_data: `deletefixed_${row.id}` }],
        [{ text: "🧪 Tester", callback_data: `testfixed_${row.id}` }],
      ];

      await bot.sendMessage(msg.chat.id, text, {
        parse_mode: "Markdown",
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
    // 🔹 Suppression
    if (data.startsWith("deletefixed_")) {
      const id = data.split("_")[1];
      await pool.query("DELETE FROM message_fixes WHERE id=$1", [id]);
      await bot.sendMessage(chatId, `🗑 Message fixe ID *${id}* supprimé.`, {
        parse_mode: "Markdown",
      });
    }

    // 🔹 Test d’envoi
    else if (data.startsWith("testfixed_")) {
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
          await bot.sendVoice(chatId, row.media_url, {
            caption: row.media_text,
          });
        } else if (row.media_type === "audio") {
          await bot.sendAudio(chatId, row.media_url, {
            caption: row.media_text,
          });
        } else if (row.media_type === "video_note") {
          await bot.sendVideoNote(chatId, row.media_url);
          await bot.sendMessage(chatId, row.media_text);
        } else if (row.media_type === "url") {
          await bot.sendMessage(chatId, `${row.media_text}\n🔗 ${row.media_url}`);
        } else {
          await bot.sendMessage(chatId, row.media_text);
        }
      }
    }

    // 🔹 Modification
    else if (data.startsWith("editfixed_")) {
      const id = data.split("_")[1];
      editStates[userId] = { step: "awaiting_text", id };
      await bot.sendMessage(
        chatId,
        "✏️ Envoie le *nouveau texte* du message.",
        { parse_mode: "Markdown" }
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

// === Suivi des étapes de modification ===
bot.on("message", async (msg) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  if (editStates[userId]) {
    const state = editStates[userId];

    // Étape 1 → Texte
    if (state.step === "awaiting_text") {
      state.media_text = msg.text;
      state.step = "awaiting_media";
      return bot.sendMessage(
        chatId,
        "📎 Envoie le *nouveau média* (photo, vidéo, voix, audio, video_note, ou lien URL), ou tape `non`.",
        { parse_mode: "Markdown" }
      );
    }

    // Étape 2 → Média
    if (state.step === "awaiting_media") {
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
      } else if (msg.video_note) {
        state.media_url = msg.video_note.file_id;
        state.media_type = "video_note";
      } else if (msg.text && msg.text.startsWith("http")) {
        state.media_url = msg.text;
        state.media_type = "url";
      } else {
        return bot.sendMessage(chatId, "⛔ Format non reconnu. Réessaie.");
      }

      state.step = "awaiting_hours";
      return bot.sendMessage(
        chatId,
        "⏰ Envoie les *heures* (ex : `06:00,14:30`)",
        { parse_mode: "Markdown" }
      );
    }

    // Étape 3 → Heures
    if (state.step === "awaiting_hours") {
      state.heures = msg.text;
      state.step = "awaiting_lang";
      return bot.sendMessage(
        chatId,
        "🌐 Envoie le code *langue* (`FR` ou `EN`).",
        { parse_mode: "Markdown" }
      );
    }

    // Étape 4 → Langue + Enregistrement en BDD
    if (state.step === "awaiting_lang") {
      state.lang = msg.text.toUpperCase() === "EN" ? "EN" : "FR";

      await pool.query(
        "UPDATE message_fixes SET media_text=$1, media_url=$2, media_type=$3, heures=$4, lang=$5 WHERE id=$6",
        [
          state.media_text,
          state.media_url,
          state.media_type,
          state.heures,
          state.lang,
          state.id,
        ]
      );

      await bot.sendMessage(
        chatId,
        `✅ Message fixe ID *${state.id}* modifié avec succès.`,
        { parse_mode: "Markdown" }
      );
      delete editStates[userId];
    }
  }
});
