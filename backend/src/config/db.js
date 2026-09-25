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

// Ejecuta `fn` dentro de una transacción: si lanza, se hace ROLLBACK y se libera el cliente.
// Útil para lecturas + validaciones + escritura que deben ser atómicas (ej. evitar double-booking).
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  withTransaction,
};