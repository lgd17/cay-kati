const bot = require("./bot");
const MAX_LENGTH = 4096; // limite Telegram

// Échapper MarkdownV2
function escapeMarkdownV2(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Échapper HTML
function escapeHTML(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Détecter si MarkdownV2 est nécessaire
function needsMarkdownV2(text) {
  return /[_*[\]()~`>#+\-=|{}.!]/.test(text);
}

// Découper le texte en morceaux ≤ MAX_LENGTH
function chunkText(text, maxLength = MAX_LENGTH) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxLength;
    // éviter de couper en plein milieu d’un mot si possible
    if (end < text.length) {
      const lastSpace = text.lastIndexOf('\n', end);
      if (lastSpace > start) end = lastSpace;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

/**
 * Envoie ultra-safe et complet
 * @param {number|string} chatId
 * @param {string} text - texte Supabase
 * @param {Object} options - { citation, parseMode: "auto"|"HTML"|"MarkdownV2" }
 */
async function ultimateSend(chatId, text, options = {}) {
  const { citation = false, parseMode = "auto" } = options;

  // Déterminer parse_mode
  let mode = parseMode;
  if (parseMode === "auto") mode = needsMarkdownV2(text) ? "MarkdownV2" : "HTML";

  // Préparer texte final
  let finalText;
  if (mode === "MarkdownV2") {
    finalText = escapeMarkdownV2(text);
    if (citation) finalText = `> ${finalText}`;
  } else {
    finalText = escapeHTML(text);
    if (citation) finalText = `📌 ${finalText}`;
  }

  // Découpage si trop long
  const chunks = chunkText(finalText);

  // Envoi sécurisé
  for (const chunk of chunks) {
    try {
      await bot.sendMessage(chatId, chunk, { parse_mode: mode });
    } catch (err) {
      console.error("Erreur Telegram:", err.message);
      // fallback texte brut
      try {
        await bot.sendMessage(chatId, chunk);
      } catch (err2) {
        console.error("Erreur fallback Telegram:", err2.message);
      }
    }
  }

  return true;
}

module.exports = ultimateSend;
