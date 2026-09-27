const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');

// Exige un header `Authorization: Bearer <token>` y adjunta los claims en req.usuario
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ ok: false, message: 'Acceso denegado. Token no proporcionado.' });
  }

  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    const expirado = error.name === 'TokenExpiredError';
    return res.status(401).json({
      ok: false,
      message: expirado ? 'Token expirado.' : 'Token inválido.'
    });
  }
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
  verificarRol
};
