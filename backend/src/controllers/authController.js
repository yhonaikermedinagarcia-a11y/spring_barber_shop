const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');

const login = async (req, res) => {
  const { correo, password } = req.body || {};

  if (!correo || !password) {
    return res.status(400).json({
      ok: false,
      message: 'El correo y la contraseña son obligatorios'
    });
  }

  try {
    // Buscar el usuario por su correo
    const resultado = await db.query(
      'SELECT "usuarioID", nombre, correo, clave, rol FROM usuario WHERE correo = $1',
      [correo]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales inválidas'
      });
    }

    const usuario = resultado.rows[0];

    // Verificar la contraseña. El registro guarda la clave tal cual se envía, así que
    // se compara en texto plano. Las cuentas que quedaron con un hash bcrypt de una
    // versión anterior con hasheo se siguen aceptando para no bloquear esos accesos.
    const esHashBcrypt = /^\$2[aby]\$\d{2}\$/.test(usuario.clave);
    const passwordValida = esHashBcrypt
      ? await bcrypt.compare(password, usuario.clave)
      : password === usuario.clave;

    if (!passwordValida) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales inválidas'
      });
    }

    // Crear el payload para el token JWT
    const payload = {
      usuarioID: usuario.usuarioID,
      rol: usuario.rol || 'cliente'
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      ok: true,
      message: 'Inicio de sesión exitoso',
      token,
      usuario: {
        usuarioID: usuario.usuarioID,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol || 'cliente'
      }
    });

  } catch (error) {
    console.error('Error en el login:', error.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  login
};
