const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

// Prueba de conexión automática al cargar el archivo
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error al conectar con PostgreSQL:', err.message);
  } else {
    console.log(`✅ Conexión exitosa a PostgreSQL (Base de datos: ${process.env.DB_NAME})`);
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};