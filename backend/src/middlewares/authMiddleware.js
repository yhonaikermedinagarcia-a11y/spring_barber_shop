const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
const db = require('../config/db');

/*
 * El rol se lee de la base de datos en cada petición, no del token.
 *
 * El token dura 8 horas y llevaba el rol dentro: si el administrador
 * degradaba a otro administrador (o borraba su cuenta), esa persona seguía
 * teniendo permisos de administrador hasta que el token caducaba. Ahora el
 * token solo identifica a la persona; lo que puede hacer lo dice la base.
 *
 * Devuelve los claims con el rol actual, o null si la cuenta ya no existe.
 */
const usuarioActual = async (claims) => {
  const { rows } = await db.query(
    'SELECT "usuarioID", rol FROM usuario WHERE "usuarioID" = $1',
    [claims.usuarioID]
  );
  if (rows.length === 0) return null;
  return { ...claims, rol: rows[0].rol || 'cliente' };
};

// Exige un header `Authorization: Bearer <token>` y adjunta los claims en req.usuario
const verificarToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ ok: false, message: 'Acceso denegado. Token no proporcionado.' });
  }

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    const expirado = error.name === 'TokenExpiredError';
    return res.status(401).json({
      ok: false,
      message: expirado ? 'Token expirado.' : 'Token inválido.'
    });
  }

  try {
    const usuario = await usuarioActual(claims);
    if (!usuario) {
      return res.status(401).json({ ok: false, message: 'La cuenta de esta sesión ya no existe.' });
    }
    req.usuario = usuario;
  } catch (error) {
    return next(error);
  }
  next();
};

// Autenticación opcional: si hay token, se valida y se adjunta a req.usuario;
// si no hay token (o no es válido), la petición sigue su curso como anónima.
//
// Se usa en las rutas donde el mismo endpoint tiene dos comportamientos según
// quién llama: por ejemplo, el alta de usuarios es pública, pero solo un
// administrador puede dar de alta a otro administrador. Con `verificarToken` la
// ruta pública quedaría cerrada; con este middleware, el Visitante sigue
// pudiendo registrarse y el administrador conserva sus permisos.
const verificarTokenOpcional = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return next();

  try {
    // Igual que en verificarToken, el rol sale de la base de datos.
    req.usuario = (await usuarioActual(jwt.verify(token, JWT_SECRET))) || undefined;
  } catch {
    // Un token inválido no rompe la petición: se trata como anónima.
    req.usuario = undefined;
  }
  next();
};

// Uso: verificarRol(['administrador', 'barbero'])
const verificarRol = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ ok: false, message: 'No tienes permisos para realizar esta acción.' });
    }
    next();
  };
};

module.exports = {
  verificarToken,
  verificarTokenOpcional,
  verificarRol
};
