const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

// La zona horaria se fija lo primero: de ella depende que una cita de las
// 15:00 se guarde y se vea a las 15:00, también en la nube (ver el archivo).
require('./config/zonaHoraria');

// Módulos de rutas
const usuarioRoutes = require('./routes/usuarioRoutes');
const servicioRoutes = require('./routes/servicioRoutes');
const barberoRoutes = require('./routes/barberoRoutes');
const citaRoutes = require('./routes/citaRoutes');
const authRoutes = require('./routes/authRoutes');
const horarioRoutes = require('./routes/horarioRoutes');
const barberoServicioRoutes = require('./routes/barberoServicioRoutes');
const transaccionRoutes = require('./routes/transaccionRoutes');
const feriadoRoutes = require('./routes/feriadoRoutes');
const estadisticasRoutes = require('./routes/estadisticasRoutes');
const ausenciaRoutes = require('./routes/ausenciaRoutes');
const listaEsperaRoutes = require('./routes/listaEsperaRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

/*
 * `trust proxy`.
 *
 * En producción la app no se habla con el cliente directamente: hay un proxy o
 * un balanceador delante (Render, Vercel, nginx, Cloudflare). Sin esto, todas
 * las peticiones parecen venir de la IP del proxy y `req.ip` es siempre la
 * misma, lo que hace que el limitador de intentos de login (10 por 15 min)
 * se agote de golpe para todos los usuarios a la vez.
 *
 * El valor 1 indica "hay exactamente un proxy delante": se toma la última
 * dirección de X-Forwarded-For, que es la que añadió el proxy de confianza.
 * En local no se activa: no hay ningún proxy y activarlo permitiría falsear
 * la IP con una cabecera.
 */
const TRUST_PROXY = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? '1' : 'false');
if (TRUST_PROXY !== 'false' && TRUST_PROXY !== false) {
  app.set('trust proxy', TRUST_PROXY === 'true' ? 1 : TRUST_PROXY);
}

/*
 * CORS.
 *
 * Por defecto se permite cualquier origen, que es lo que hace falta en
 * desarrollo (la web corre en 5173 y la API en 3000) y también cuando la web
 * y la API comparten dominio.
 *
 * En producción conviene restringirlos: `CORS_ORIGIN` con los dominios
 * permitidos separados por comas, por ejemplo
 * `CORS_ORIGIN=https://springbarbershop.com,https://www.springbarbershop.com`.
 * Si no se define, se mantiene el comportamiento abierto.
 */
const origenesPermitidos = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const opcionesCors = origenesPermitidos.length
  ? { origin: origenesPermitidos }
  : {};
app.use(cors(opcionesCors));
app.use(express.json());

/*
 * Las respuestas de la API no se guardan en caché (ni en el navegador ni en
 * proxies/CDN): al recargar la página, las citas, pagos y horarios tienen que
 * venir siempre al día.
 */
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Rutas de la API
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/servicios', servicioRoutes);
app.use('/api/barberos', barberoRoutes);
app.use('/api/citas', citaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/horarios', horarioRoutes);
app.use('/api/barbero-servicios', barberoServicioRoutes);
app.use('/api/transacciones', transaccionRoutes);
app.use('/api/feriados', feriadoRoutes);
app.use('/api/estadisticas', estadisticasRoutes);
app.use('/api/ausencias', ausenciaRoutes);
app.use('/api/lista-espera', listaEsperaRoutes);

/*
 * Archivos subidos (comprobantes de pago y fotos de los barberos).
 *
 * multer los deja en `backend/uploads` y lo que se guarda en la base de datos
 * es la ruta "/uploads/nombre-del-archivo". Sin esto, la foto de un barbero y
 * el comprobante de un pago darían error al abrirse.
 *
 * Se montan en dos sitios porque la web y la API pueden vivir en dominios
 * distintos: en desarrollo la web llama a "http://<ip>:3000" y en producción
 * llama a "/api" en el mismo dominio. Con los dos montajes, la URL que se
 * guarda en la base funciona en los dos casos.
 */
// `nosniff` impide que el navegador "adivine" que un archivo es HTML y lo
// ejecute; las subidas solo pueden ser imágenes o PDF (ver config/subidas.js).
const opcionesSubidas = {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
};
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads'), opcionesSubidas));
app.use('/api/uploads', express.static(path.resolve(__dirname, '../uploads'), opcionesSubidas));

/*
 * Web compilada (opcional).
 *
 * Permite desplegar la web y la API en un solo servicio: si existe la build de
 * `frontend/dist`, se sirve como estático y cualquier ruta que no sea de la
 * API devuelve el index.html, que es lo que necesita una SPA con react-router.
 *
 * Se activa en producción (o con `SERVE_FRONTEND=true`). En desarrollo puede
 * quedar apagado: entonces la web la sirve Vite en el 5173 y `/` devuelve el
 * JSON de la API, que es lo que espera quien haga curl. Con la web servida
 * desde aquí, `/` devuelve la aplicación y el estado de la API se pide en
 * `/api/salud`.
 *
 * En cualquier caso la API se monta en `/api`, así que la web y la API
 * comparten origen y no hace falta configurar CORS ni `VITE_API_URL`.
 *
 * Con `FRONTEND_DIST` se puede indicar la ruta; si no, se buscan las rutas
 * habituales (repositorio y contenedor Docker).
 */
const SERVE_FRONTEND =
  process.env.SERVE_FRONTEND === 'true' ||
  (process.env.SERVE_FRONTEND === undefined && process.env.NODE_ENV === 'production');

const candidatasFrontend = [
  process.env.FRONTEND_DIST,
  path.resolve(__dirname, '../../frontend/dist'),
  '/app/frontend/dist',
].filter(Boolean);

const carpetaFrontend = SERVE_FRONTEND
  ? candidatasFrontend.find((dir) => fs.existsSync(path.join(dir, 'index.html')))
  : undefined;

/*
 * Ruta base de la API.
 *
 * Solo se registra si NO se está sirviendo la web desde el mismo proceso: en
 * ese caso la raíz debe mostrar la aplicación, no un JSON. La información de
 * la API sigue disponible en /api y en /api/salud.
 */
if (!carpetaFrontend) {
  app.get('/', (req, res) => {
    res.json({
      ok: true,
      message: '💈 API de Barbería ejecutándose correctamente',
      timestamp: new Date().toISOString()
    });
  });
}
/*
 * Sonda de estado.
 *
 * La usan los proveedores de hosting para comprobar que el servicio está vivo
 * y, sobre todo, que puede hablar con la base de datos: un servicio que
 * arranca pero no conecta con PostgreSQL no sirve de nada.
 *
 * También comprueba que el esquema está aplicado. Conectar no es lo mismo que
 * tener las tablas: una base de datos recién creada acepta conexiones sin
 * problema y falla en todas las consultas con "relation does not exist". Con
 * este segundo control, el servicio se marca como unhealthy en vez de
 * parecer sano mientras devuelve errores 500 en cada petición.
 */
app.get('/api/salud', async (req, res) => {
  const { query } = require('./config/db');
  const { faltaElEsquema, MENSAJE_ESQUEMA } = require('./utils/respuestaError');

  try {
    await query('SELECT 1');
  } catch (error) {
    return res.status(503).json({
      ok: false,
      status: 'sin base de datos',
      error: error.message,
    });
  }

  try {
    // Si la tabla no existe, PostgreSQL responde 42P01.
    await query('SELECT 1 FROM servicios LIMIT 1');
  } catch (error) {
    if (faltaElEsquema(error)) {
      return res.status(503).json({
        ok: false,
        status: 'sin esquema',
        error: MENSAJE_ESQUEMA,
      });
    }
    return res.status(503).json({
      ok: false,
      status: 'error de base de datos',
      error: error.message,
    });
  }

  res.json({ ok: true, status: 'sano', timestamp: new Date().toISOString() });
});

// Información de la API. Se registra siempre, incluso cuando la web se
// sirve desde este mismo proceso.
app.get('/api', (req, res) => {
  res.json({
    ok: true,
    message: '💈 API de Barbería ejecutándose correctamente',
    docs: 'documentacion/API.md',
    timestamp: new Date().toISOString()
  });
});

/*
 * API inexistente: siempre JSON, nunca el index.html de la SPA. Un fetch a
 * una ruta de API equivocada debe dejar claro que el error es de la API.
 */
app.use('/api', (req, res) => {
  res.status(404).json({
    ok: false,
    message: 'Recurso no encontrado'
  });
});

/*
 * Servidor de la web compilada (si existe).
 *
 * Los archivos de `assets/` llevan hash en el nombre, así que no cambian nunca
 * y se cachean para siempre. El index.html sí cambia en cada build, de ahí el
 * `no-cache`: si no, el navegador seguiría mostrando la versión anterior.
 */
if (carpetaFrontend) {
  console.log(`🌐 Sirviendo la web compilada desde ${carpetaFrontend}`);
  app.use(
    express.static(carpetaFrontend, {
      setHeaders: (res, rutaArchivo) => {
        if (rutaArchivo.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    })
  );
  // Cualquier otra ruta GET devuelve el index.html: es lo que necesita una
  // SPA con react-router (/reservar, /login, /panel...).
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(carpetaFrontend, 'index.html'));
  });
}

// Rutas no encontradas (debe ir después de montar los routers, antes de app.listen)
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: 'Recurso no encontrado'
  });
});

/*
 * Manejador de errores global.
 *
 * Los controladores capturan sus excepciones, pero no todas las que se escapan
 * llegan aquí: un `req.body` undefined, un JSON mal formado o un error
 * asíncrono sin `await` terminan en el manejador por defecto de Express, que
 * devuelve **HTML** (con el stack trace en desarrollo).
 *
 * Eso rompe el contrato de la API ("siempre JSON con ok") y hace que el
 * frontend muestre "No se pudo conectar con el servidor" en lugar del mensaje
 * real. Aquí se garantiza que cualquier excepción ends en JSON.
 */
app.use((err, req, res, next) => {
  console.error(`❌ Excepción no controlada en ${req.method} ${req.originalUrl}:`, err.message);

  // Si la respuesta ya empezó a enviarse, no se puede cambiar: se corta la
  // conexión para que el cliente lo detecte.
  if (res.headersSent) return next(err);

  /*
   * Errores de multer (la subida del comprobante de pago o de la foto).
   *
   * Dependen de lo que envió el cliente, no del servidor, así que se devuelven
   * como un 400 con un mensaje legible: sin esto, un comprobante de 6 MB
   * devolvía un 500 "Error interno del servidor" y el cliente no entendía
   * qué había pasado.
   */
  if (err instanceof multer.MulterError) {
    const mensaje =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo es demasiado grande (el máximo son 5 MB)'
        : `No se pudo procesar el archivo: ${err.message}`;
    return res.status(400).json({ ok: false, error: mensaje });
  }

  const status = Number(err.status || err.statusCode) || 500;
  res.status(status).json({
    ok: false,
    // Los errores de negocio (un 400 con un mensaje pensado para el usuario)
    // se devuelven tal cual; el resto, un mensaje genérico.
    error:
      status < 500 && err.message
        ? err.message
        : 'Error interno del servidor',
  });
});

/*
 * Migraciones automáticas al arrancar.
 *
 * Una base de datos recién creada (Neon, Render Postgres, un `CREATE DATABASE`
 * en local) acepta conexiones sin problema y falla en todas las consultas con
 * "relation does not exist". En un despliegue, eso significa una web que
 * carga pero con todas las secciones de datos en error, y lo peor es que no
 * es un fallo de arranque: el servicio parece sano.
 *
 * Para que eso no dependa de un paso manual, al arrancar se aplican las
 * migraciones pendientes. Son idempotentes y el runner registra cuáles se
 * aplicaron, así que solo se aplica lo que falta.
 *
 * Se aplican **siempre**, no solo cuando la base está vacía. Antes se
 * comprobaba si existía la tabla `servicios` y, si existía, no se hacía
 * nada: con una base a medio migrar (el caso normal en cuanto se añade una
 * migración nueva) las nuevas se quedaban sin aplicar y la aplicación se
 * quedaba rota sin ningún aviso.
 *
 * Se puede desactivar con `AUTO_MIGRATE=false`, por ejemplo si la base de
 * datos es de solo lectura para la aplicación.
 */
const prepararBaseDeDatos = async () => {
  if (process.env.AUTO_MIGRATE === 'false') return;

  try {
    const { pool } = require('./config/db');
    const { ejecutarMigraciones } = require('./config/migraciones');

    const resultado = await ejecutarMigraciones({ pool });

    if (resultado.errores.length > 0) {
      console.error('\n❌ No se pudieron aplicar todas las migraciones:');
      for (const error of resultado.errores) console.error(`   ${error}`);
      console.error('');
      process.exit(1);
    }
  } catch (error) {
    // Si la base de datos no responde, no es un problema de esquema: se
    // sigue arrancando y el aviso de conexión de config/db.js es el que vale.
    console.error(`   Aviso: no se pudo comprobar el esquema (${error.message})`);
  }
};

// Iniciar servidor
let server;

const iniciar = async () => {
  // Antes de aceptar tráfico: si falta el esquema, se aplica.
  await prepararBaseDeDatos();

  server = app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
};

iniciar();

/*
 * Cierre ordenado.
 *
 * Las plataformas de hosting (Render, Railway, Fly) avisan con SIGTERM antes
 * de apagar el servicio. Sin esto, Node mata el proceso en seco y las
 * peticiones que estaban en vuelo se cortan con un error de red en lugar de
 * terminar bien.
 */
const cerrar = (senal) => {
  console.log(`\n👋 ${senal} recibido, cerrando el servidor...`);
  if (!server) return process.exit(0);
  server.close(async () => {
    try {
      const { pool } = require('./config/db');
      await pool.end();
    } catch (error) {
      console.error('   Error al cerrar el pool de PostgreSQL:', error.message);
    }
    process.exit(0);
  });
  // Si algún cliente se queda colgado, se corta de todas formas.
  setTimeout(() => {
    console.error('   Cierre forzado tras 10s');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => cerrar('SIGTERM'));
process.on('SIGINT', () => cerrar('SIGINT'));

// Se exporta la app (y no solo el servidor) para poder probarla sin abrir
// un puerto: `require('./src/app')` y se trabaja con el objeto de Express.
module.exports = app;
