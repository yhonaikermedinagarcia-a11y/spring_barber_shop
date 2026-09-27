/*
 * Runner de migraciones.
 *
 * Uso:  node scripts/migrate.js          aplica las pendientes
 *       node scripts/migrate.js --status  solo muestra el estado
 *
 * Las migraciones son archivos .sql en baseDeDatos_scrip/migraciones, numerados por
 * prefijo y aplicadas en orden ascendente. Cada una debe ser idempotente, porque el
 * runner registra cuál se aplicó y solo salta las ya registradas.
 *
 * El registro vive en la tabla `schema_migrations`, creada aquí si no existe. Así el
 * esquema de la base se puede reconstruir desde cero clonando el repositorio, sin
 * depender de que alguien recuerde qué se ejecutó a mano.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DIRECTORIO_MIGRACIONES = path.resolve(__dirname, '../../baseDeDatos_scrip/migraciones');
const SOLO_ESTADO = process.argv.includes('--status');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432
});

const registrar = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre     text PRIMARY KEY,
      aplicada_en timestamp NOT NULL DEFAULT now()
    )
  `);
};

// Devuelve [{ nombre, ruta }] en orden ascendente por nombre de archivo.
const listarMigraciones = () =>
  fs.readdirSync(DIRECTORIO_MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ nombre: f, ruta: path.join(DIRECTORIO_MIGRACIONES, f) }));

(async () => {
  const client = await pool.connect();
  try {
    await registrar(client);
    const aplicadas = new Set(
      (await client.query('SELECT nombre FROM schema_migrations')).rows.map((r) => r.nombre)
    );
    const migraciones = listarMigraciones();

    if (SOLO_ESTADO) {
      console.log(`\n  Migraciones (${aplicadas.size} aplicadas de ${migraciones.length}):\n`);
      for (const m of migraciones) {
        console.log(`    ${aplicadas.has(m.nombre) ? '✓ aplicada' : '· PENDIENTE'}  ${m.nombre}`);
      }
      console.log('');
      return;
    }

    const pendientes = migraciones.filter((m) => !aplicadas.has(m.nombre));
    if (pendientes.length === 0) {
      console.log(`\n  Nada que aplicar. Las ${migraciones.length} migraciones ya están en la base.\n`);
      return;
    }

    console.log(`\n  Aplicando ${pendientes.length} de ${migraciones.length} migraciones:\n`);
    for (const m of pendientes) {
      const sql = fs.readFileSync(m.ruta, 'utf8');
      process.stdout.write(`    ${m.nombre} ... `);
      try {
        // Cada archivo trae su propio BEGIN/COMMIT.
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [m.nombre]);
        console.log('ok');
      } catch (error) {
        console.log('FALLÓ');
        console.error(`\n  ${error.message}\n`);
        process.exitCode = 1;
        return;
      }
    }
    console.log(`\n  ${pendientes.length} migración(es) aplicada(s).\n`);
  } finally {
    client.release();
    await pool.end();
  }
})();
