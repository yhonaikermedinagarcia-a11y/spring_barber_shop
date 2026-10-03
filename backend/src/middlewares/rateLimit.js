const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

/*
 * Limitador de intentos de autenticación.
 *
 * Solo cuenta los intentos fallidos (`skipSuccessfulRequests`), porque castigar a
 * quien contraseña bien sería una molestia sin ganancia: el ataque que importa es
 * el de fuerza bruta, y ese se caracteriza justamente por fallar.
 *
 * ALCANCE: solo POST /api/auth/login. Aplicarlo a toda la API rompería el flujo
 * normal, donde un mismo cliente hace varias peticiones seguidas.
 */

// Clave del contador.
//
// Hay que pasar por `ipKeyGenerator` en vez de usar `req.ip` a secas, por dos
// motivos:
//
// 1. Corrección. La clave por defecto de la librería es `ipKeyGenerator(req.ip)`,
//    que convierte el IPv4 mapeado (`::ffff:127.0.0.1`) a `127.0.0.1` y las IPv6 a
//    su subred /56. Si el contador se indexa por `req.ip` a secas, el
//    `resetKey(req.ip)` de abajo nunca coincide con la clave realmente guardada y
//    el contador no se reinicia jamás. Verificado: remaining seguía bajando tras
//    un login correcto.
//
// 2. La librería es estricta: `keyGeneratorIpFallback` examina el código fuente de
//    la función y, si menciona `req.ip` sin mencionar `ipKeyGenerator`, lanza
//    ValidationError al arrancar (ERR_ERL_KEY_GEN_IPV6). Con `(req) => req.ip`
//    el proceso moría antes de escuchar en el puerto.
const clavePorIp = (req) => ipKeyGenerator(req.ip);

const MAX_INTENTOS = 10;
const VENTANA_MS = 15 * 60 * 1000; // 15 minutos

const limitadorLogin = rateLimit({
  windowMs: VENTANA_MS,
  max: MAX_INTENTOS,
  skipSuccessfulRequests: true,
  keyGenerator: clavePorIp,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    ok: false,
    message: 'Demasiados intentos de acceso. Intenta de nuevo en unos minutos.'
  }
});

/*
 * Pone el contador de esta IP a cero cuando la respuesta no fue un error.
 *
 * Hace falta porque `skipSuccessfulRequests` NO reinicia nada: solo evita que un
 * login correcto aumente el contador. Medido: tras 6 fallos, un login correcto
 * deja el contador en 6, no en 0. Sin este middleware, quien se equivoca varias
 * veces y luego entra bien arrastra el presupuesto de intentos hacia adelante.
 *
 * Se apoya en 'finish' porque es cuando ya se conoce el status final.
 */
const reiniciarSiExito = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 400) {
      limitadorLogin.resetKey(clavePorIp(req));
    }
  });
  next();
};

/*
 * Limitaciones conocidas:
 * - El almacén por defecto es memoria del proceso. Con una sola instancia sirve;
 *   con varias réplicas el límite se cuenta por instancia y se multiplica por el
 *   número de servidores. La solución es un almacén compartido (Redis).
 * - La IP se toma de req.ip. Si la app se despliega detrás de un proxy o
 *   balanceador hay que configurar `trust proxy` en app.js; sin eso todas las
 *   peticiones parecen venir de la misma IP y el límite se agota de golpe.
 */

module.exports = { limitadorLogin, reiniciarSiExito, clavePorIp, MAX_INTENTOS, VENTANA_MS };