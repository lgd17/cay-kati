
require('dotenv').config(); 
const { Pool } = require('pg');

// ✅ Création du pool PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ Gestion des erreurs côté base
pool.on('error', (err) => {
  console.error('❌ Erreur inattendue côté PostgreSQL :', err);
  process.exit(-1);
});

module.exports = pool;
