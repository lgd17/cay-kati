require('dotenv').config();
const { Pool } = require('pg');

// ✅ Création du pool PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('❌ Erreur inattendue côté PostgreSQL :', err);
  process.exit(-1);
});

async function insertManualCoupon(content, mediaUrl, mediaType, date, type = "gratuit") {
  try {
    // Si l’admin envoie juste "2025-09-11", on le transforme en minuit UTC
    const timestamp = new Date(date);

    await pool.query(`
      INSERT INTO daily_pronos (content, media_url, media_type, date, type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (date) DO UPDATE
      SET content = EXCLUDED.content,
          media_url = EXCLUDED.media_url,
          media_type = EXCLUDED.media_type,
          type = EXCLUDED.type
    `, [content, mediaUrl, mediaType, timestamp, type]);

    return { success: true };
  } catch (err) {
    console.error("❌ Erreur lors de l'ajout manuel :", err);
    return { success: false, error: err };
  }
}


module.exports = { pool, insertManualCoupon };
