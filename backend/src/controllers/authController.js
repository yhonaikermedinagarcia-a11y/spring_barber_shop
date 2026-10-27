const bcrypt = require('bcryptjs');
const { errorInterno } = require('../utils/respuestaError');
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

  // bcrypt exige cadenas: con un número, `compare` lanza "Illegal arguments" y
  // la petición acaba en un 500 en vez de un 400.
  if (typeof correo !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      ok: false,
      message: 'El correo y la contraseña son obligatorios'
    });
  }

  try {
    // Buscar el usuario por su correo. Se trae también `apellido` porque la
    // respuesta lo usa: sin él, `apellido` quedaba como undefined y al
    // serializar el JSON se omitía el campo entero.
    const resultado = await db.query(
      // El correo se compara sin distinguir mayúsculas ni espacios: el alta lo
      // guarda en minúsculas, pero hay cuentas antiguas con mayúsculas.
      'SELECT "usuarioID", nombre, apellido, correo, clave, rol FROM usuario WHERE lower(trim(correo)) = lower(trim($1)) ORDER BY "usuarioID" LIMIT 1',
      [correo]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales inválidas'
      });
    }

    const usuario = resultado.rows[0];

    // Verificar la contraseña. usuarioController guarda un hash bcrypt, así que lo
    // normal es comparar contra el hash. Las cuentas creadas antes de que existiera
    // el hasheo siguen con la clave en texto plano: se aceptan para no bloquear esos
    // accesos y quedan migradas cuando su dueño cambia la clave por PUT.
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
      // El frontend necesita saber cuándo renovar la sesión en lugar de
      // hardcodear la duración.
      expiresIn: JWT_EXPIRES_IN,
      usuario: {
        usuarioID: usuario.usuarioID,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correo,
        rol: usuario.rol || 'cliente'
      }
    });

  } catch (error) {
    errorInterno(res, error, 'Login');
  }
};

// Perfil del usuario del token. Sin esto, una SPA que recarga la página se
// encuentra sin saber quién está autenticado ni qué rol tiene.
const obtenerPerfil = async (req, res) => {
  // verificarToken deja los claims del token en req.usuario
  const usuarioId = req.usuario.usuarioID;

  try {
    const resultado = await db.query(
      `SELECT "usuarioID", nombre, apellido, correo, telefono, rol
       FROM usuario
       WHERE "usuarioID" = $1`,
      [usuarioId]
    );

    if (resultado.rows.length === 0) {
      // El token sigue siendo válido pero la cuenta ya no existe.
      return res.status(401).json({
        ok: false,
        message: 'El usuario de este token ya no existe'
      });
    }

    res.json({ ok: true, usuario: resultado.rows[0] });
  } catch (error) {
    errorInterno(res, error, 'Obtener Perfil');
  }
};

/*
 * Recuperación de contraseña sin correo saliente.
 *
 * La peluquería no manda correos, así que la identidad se confirma con el par
 * correo + teléfono de la cuenta: los dos datos que el usuario ya conoce y que
 * están guardados en su ficha.
 *
 * Dos cuidados:
 *
 *   - La respuesta **no dice** si el correo existe. "Correo inexistente" y
 *     "teléfono incorrecto" devuelven el mismo 404 con el mismo texto, para no
 *     convertir esta ruta en un wayback de qué correos están registrados.
 *   - La clave nueva siempre se guarda como hash bcrypt. Las cuentas viejas que
 *     aún tienen la clave en texto plano quedan migradas al recuperarla.
 */
const recuperarClave = async (req, res) => {
  const { correo, telefono, claveNueva } = req.body || {};

  if (
    typeof correo !== 'string' || !correo.trim() ||
    typeof telefono !== 'string' || !telefono.trim() ||
    typeof claveNueva !== 'string' || !claveNueva
  ) {
    return res.status(400).json({
      ok: false,
      message: 'El correo, el teléfono y la nueva contraseña son obligatorios'
    });
  }

  if (claveNueva.length < 6) {
    return res.status(400).json({
      ok: false,
      message: 'La nueva contraseña debe tener al menos 6 caracteres'
    });
  }

  // El teléfono se compara solo con sus dígitos: la ficha puede guardarlo como
  // "0412-435.08.53" y el usuario lo teclea como "04124350853".
  const soloDigitos = (valor) => String(valor).replace(/\D/g, '');

  try {
    const resultado = await db.query(
      'SELECT "usuarioID", telefono, rol FROM usuario WHERE lower(trim(correo)) = lower(trim($1)) ORDER BY "usuarioID" LIMIT 1',
      [correo]
    );

    const usuario = resultado.rows[0];
    const digitosCuenta = usuario ? soloDigitos(usuario.telefono) : '';

    /*
     * Solo las cuentas de cliente se recuperan desde la web.
     *
     * Correo + teléfono no es un secreto: el teléfono del administrador era el
     * mismo WhatsApp que muestra la web y el de los barberos salía en el
     * listado público. Con eso cualquiera podía cambiar la clave de una cuenta
     * con permisos. Las cuentas de administrador y de barbero se recuperan con
     * `npm run admin:crear` o desde el panel de administración.
     *
     * Además, un teléfono con menos de 7 dígitos no cuenta: un teléfono sin
     * números ("no tengo") "coincidía" con cualquier texto sin números.
     */
    if (
      !usuario ||
      usuario.rol !== 'cliente' ||
      digitosCuenta.length < 7 ||
      digitosCuenta !== soloDigitos(telefono)
    ) {
      // Mismo mensaje para los dos casos: no se revela qué correos existen.
      return res.status(404).json({
        ok: false,
        message: 'El correo o el teléfono no coinciden con ninguna cuenta'
      });
    }

    const hash = await bcrypt.hash(claveNueva, 10);
    await db.query(
      'UPDATE usuario SET clave = $1 WHERE "usuarioID" = $2',
      [hash, usuario.usuarioID]
    );

    res.json({
      ok: true,
      message: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    errorInterno(res, error, 'Recuperar Clave');
  }
};

module.exports = {
  login,
  obtenerPerfil,
  recuperarClave
};
