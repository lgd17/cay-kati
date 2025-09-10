
const pool = require('./db'); 

async function insertManualCoupon(chatId, content, mediaUrl, mediaType, date, type = "gratuit") {
  try {
    const timestamp = new Date(date);

    await pool.query(`
      INSERT INTO daily_pronos (content, media_url, media_type, date, date_only, type)
      VALUES ($1, $2, $3, $4, $4::date, $5)
      ON CONFLICT (date) DO UPDATE
      SET content = EXCLUDED.content,
          media_url = EXCLUDED.media_url,
          media_type = EXCLUDED.media_type,
          type = EXCLUDED.type
    `, [content, mediaUrl, mediaType, timestamp, type]);

    // Envoi sur Telegram
    if (mediaType === 'photo') await bot.sendPhoto(chatId, mediaUrl, { caption: content });
    else if (mediaType === 'video') await bot.sendVideo(chatId, mediaUrl, { caption: content });
    else if (mediaType === 'voice') { await bot.sendVoice(chatId, mediaUrl); await bot.sendMessage(chatId, content); }
    else if (mediaType === 'audio') { await bot.sendAudio(chatId, mediaUrl); await bot.sendMessage(chatId, content); }
    else await bot.sendMessage(chatId, content);

    await bot.sendMessage(chatId, `✅ Coupon *${type.toUpperCase()}* ajouté pour le ${timestamp.toISOString().slice(0,10)}`, { parse_mode: "Markdown" });

  } catch (err) {
    console.error("❌ Erreur lors de l'ajout manuel :", err);
    await bot.sendMessage(chatId, "❌ Erreur lors de l’ajout du coupon.");
  }
}

module.exports = insertManualCoupon;
