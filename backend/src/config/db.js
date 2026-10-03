const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

// Prueba de conexión al cargar el archivo.
//
// Si falla, el proceso termina con código 1 en lugar de seguir escuchando. Antes
// solo se imprimía el error y el servidor arrancaba igual, con lo que parecía
// funcionar ("🚀 Servidor corriendo") pero respondía 500 a todas las peticiones.
// Para quien instala esto por primera vez, eso es mucho más difícil de
// diagnosticar que un arranque que se niega a empezar.
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('\n❌ No se pudo conectar con PostgreSQL');
    console.error(`   ${err.message}`);
    console.error('\n   Revisa backend/.env:');
    console.error(`     DB_HOST=${process.env.DB_HOST || '(sin definir)'}`);
    console.error(`     DB_PORT=${process.env.DB_PORT || '(sin definir, se usa 5432)'}`);
    console.error(`     DB_NAME=${process.env.DB_NAME || '(sin definir)'}`);
    console.error(`     DB_USER=${process.env.DB_USER || '(sin definir)'}`);
    if (!process.env.DB_PASSWORD) console.error('     DB_PASSWORD=(sin definir)');
    console.error('\n   ¿La base de datos existe? Créala y aplica el esquema con:');
    console.error('     npm run migrate');
    console.error('');
    process.exit(1);
  }
  console.log(`✅ Conexión exitosa a PostgreSQL (Base de datos: ${process.env.DB_NAME})`);
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