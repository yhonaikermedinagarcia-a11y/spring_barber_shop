const bcrypt = require('bcryptjs');
const { errorInterno } = require('../utils/respuestaError');
const db = require('../config/db');

// Roles que admite la columna `usuario.rol` (CHECK en el esquema).
const ROLES = ['cliente', 'barbero', 'administrador'];

/*
 * El correo se guarda en minúsculas y sin espacios. Antes se guardaba tal
 * cual: "Cliente@x.com" y "cliente@x.com" eran dos cuentas distintas y el
 * login fallaba si se escribía con otra mayúscula.
 */
const normalizarCorreo = (valor) => (typeof valor === 'string' ? valor.trim().toLowerCase() : valor);
const correoValido = (valor) => typeof valor === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
const CLAVE_MINIMA = 6;

// ¿Ya hay otra cuenta con ese correo (sin distinguir mayúsculas)?
const correoOcupado = async (correo, excluirId = null) => {
  const { rows } = await db.query(
    'SELECT 1 FROM usuario WHERE lower(trim(correo)) = $1 AND ($2::int IS NULL OR "usuarioID" <> $2) LIMIT 1',
    [correo, excluirId]
  );
  return rows.length > 0;
};

const MENSAJE_CORREO_USADO = 'El correo electrónico ya está registrado';

// 1. Obtener todos los usuarios
const obtenerUsuarios = async (req, res) => {
  try {
    const resultado = await db.query(
      'SELECT "usuarioID", nombre, apellido, correo, telefono, rol FROM usuario ORDER BY "usuarioID" DESC'
    );
    res.json({
      ok: true,
      total: resultado.rows.length,
      usuarios: resultado.rows
    });
  } catch (error) {
    errorInterno(res, error, 'Obtener Usuarios');
  }
};

// 2. Obtener un usuario por ID
const obtenerUsuarioPorId = async (req, res) => {
  const { id } = req.params;
  const usuarioId = Number(id);

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'El ID del usuario debe ser un número entero válido'
    });
  }

  try {
    const resultado = await db.query(
      'SELECT "usuarioID", nombre, apellido, correo, telefono, rol FROM usuario WHERE "usuarioID" = $1',
      [usuarioId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    res.json({ ok: true, usuario: resultado.rows[0] });
  } catch (error) {
    errorInterno(res, error, 'Obtener Usuario Por Id');
  }
};

// 3. Crear un nuevo usuario
//
// El alta es pública (es el registro desde la web), pero **el rol no lo elige
// quien se registra**. Si el cuerpo pudiera traer `rol: "administrador"`,
// cualquiera podría abrirse una cuenta de administrador por el simple hecho de
// rellenar el formulario de registro y tomar el control de la peluquería.
//
// Por eso el rol solo se respeta si quien llama es un administrador
// (verificarTokenOpcional deja req.usuario vacío cuando no hay token). Para
// todo el mundo, el alta es de cliente.
const crearUsuario = async (req, res) => {
  const { nombre, apellido, telefono, rol } = req.body || {};
  const correo = normalizarCorreo(req.body?.correo);
  // `clave` es el nombre histórico de esta columna, pero /api/auth/login recibe la
  // misma cosa como `password`. Aceptar ambos evita que un cliente que use
  // `password` (como es lo natural en un login) reciba un 400 confuso.
  const clave = req.body?.clave || req.body?.password;

  if (!nombre || !apellido || !correo || !telefono || !clave) {
    return res.status(400).json({
      ok: false,
      message: 'Nombre, apellido, correo, teléfono y clave son obligatorios'
    });
  }

  // bcrypt solo acepta cadenas: con un número, `hash` lanza "Illegal
  // arguments" y la petición acaba en un 500 en vez de un 400.
  if (typeof clave !== 'string') {
    return res.status(400).json({
      ok: false,
      message: 'La clave debe ser un texto'
    });
  }

  if (!correoValido(correo)) {
    return res.status(400).json({ ok: false, message: 'El correo electrónico no es válido' });
  }

  const rolSolicitado = typeof rol === 'string' ? rol.trim() : '';

  if (rolSolicitado && !ROLES.includes(rolSolicitado)) {
    return res.status(400).json({
      ok: false,
      message: `El rol debe ser uno de: ${ROLES.join(', ')}`
    });
  }

  const esAdmin = req.usuario?.rol === 'administrador';

  // El rol por defecto es "cliente". Solo un administrador puede dar de alta a
  // un barbero o a otro administrador.
  let rolFinal = 'cliente';

  if (rolSolicitado && rolSolicitado !== 'cliente') {
    if (!esAdmin) {
      return res.status(403).json({
        ok: false,
        message: 'Solo un administrador puede crear usuarios con ese rol'
      });
    }
    rolFinal = rolSolicitado;
  }

  try {
    if (await correoOcupado(correo)) {
      return res.status(400).json({ ok: false, message: MENSAJE_CORREO_USADO });
    }

    // La misma regla que la recuperación y el cambio de clave del perfil: antes
    // el alta aceptaba claves de un carácter.
    if (clave.length < CLAVE_MINIMA) {
      return res.status(400).json({
        ok: false,
        message: `La clave debe tener al menos ${CLAVE_MINIMA} caracteres`
      });
    }

    // La clave se almacena como hash bcrypt, nunca en texto plano. El RETURNING no
    // incluye `clave`, así que la respuesta nunca la expone.
    const claveHasheada = await bcrypt.hash(clave, 10);
    const query = `
      INSERT INTO usuario (nombre, apellido, correo, telefono, rol, clave)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING "usuarioID", nombre, apellido, correo, telefono, rol;
    `;
    const valores = [nombre, apellido, correo, telefono, rolFinal, claveHasheada];

    // Alta y vinculación van en la misma transacción: o la cuenta existe y sus
    // citas de invitado quedan colgando de ella, o no existe ninguna de las dos.
    const resultado = await db.withTransaction(async (client) => {
      const insertado = await client.query(query, valores);
      const nuevoUsuarioId = insertado.rows[0].usuarioID;

      // Un usuario que nace como barbero necesita su ficha profesional desde el
      // primer momento. Sin ella, al entrar en su sesión el panel de barbero no
      // encontraba agenda ni perfil y parecía una cuenta de cliente.
      if (rolFinal === 'barbero') {
        await client.query(
          'INSERT INTO barbero ("usuarioID", comision, estado) VALUES ($1, 20, true)',
          [nuevoUsuarioId]
        );
      }

      // Las citas que el visitante hizo **sin cuenta** con este mismo teléfono
      // pasan a ser de esta cuenta.
      //
      // Sin esto, quien reservaba como invitado y luego se registraba se
      // quedaba sin sus reservas: "Mis citas" salía vacío y la web tenía que
      // inventarse un `citasVinculadas` que la API nunca devolvía.
      //
      // El teléfono se compara solo con sus dígitos, porque puede estar
      // guardado con espacios o guiones y tecleado sin ellos.
      const vinculadas = await client.query(
        `UPDATE cita
         SET "clienteID" = $1, es_invitado = false
         WHERE "clienteID" IS NULL
           AND es_invitado
           AND contacto_telefono IS NOT NULL
           AND regexp_replace($2, '\\D', '', 'g') <> ''
           AND regexp_replace(contacto_telefono, '\\D', '', 'g')
               = regexp_replace($2, '\\D', '', 'g')
         RETURNING "citaID";`,
        [nuevoUsuarioId, String(telefono)]
      );

      return { usuario: insertado.rows[0], citasVinculadas: vinculadas.rowCount };
    });

    res.status(201).json({
      ok: true,
      message: 'Usuario creado exitosamente',
      usuario: resultado.usuario,
      // Cuántas citas de invitado se han pasado a esta cuenta. La web lo usa
      // para llevar al recién registrado a "Mis citas" si tenía reservas.
      citasVinculadas: resultado.citasVinculadas
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ ok: false, message: 'El correo electrónico ya está registrado' });
    }
    errorInterno(res, error, 'Crear Usuario');
  }
};



// 4. Actualizar un usuario por ID
const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const usuarioId = Number(id);
  const { nombre, apellido, telefono, rol } = req.body || {};
  const correo = req.body?.correo ? normalizarCorreo(req.body.correo) : undefined;
  // Mismo alias que en crearUsuario: `clave` o `password` funcionan igual
  const clave = req.body?.clave || req.body?.password;

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'El ID del usuario debe ser un número entero válido'
    });
  }

  // bcrypt solo acepta cadenas (ver crearUsuario).
  if (clave !== undefined && clave !== null && typeof clave !== 'string') {
    return res.status(400).json({
      ok: false,
      message: 'La clave debe ser un texto'
    });
  }

  if (correo !== undefined && !correoValido(correo)) {
    return res.status(400).json({ ok: false, message: 'El correo electrónico no es válido' });
  }
  if (clave && clave.length < CLAVE_MINIMA) {
    return res.status(400).json({ ok: false, message: `La clave debe tener al menos ${CLAVE_MINIMA} caracteres` });
  }

  // El rol tiene que ser uno de los que admite el CHECK del esquema: si no,
  // PostgreSQL lo rechaza con 23514 y la petición acaba en un 500.
  if (rol !== undefined && rol !== null && rol !== '') {
    if (!ROLES.includes(rol)) {
      return res.status(400).json({
        ok: false,
        message: `El rol debe ser uno de: ${ROLES.join(', ')}`
      });
    }
  }

  try {
    // Solo se hashea si viene una clave nueva. Si el body no trae `clave`, se pasa
    // null y el COALESCE conserva el hash que ya tenía.
    const claveHasheada = clave ? await bcrypt.hash(clave, 10) : null;
    const query = `
      UPDATE usuario
      SET nombre = COALESCE($1, nombre),
          apellido = COALESCE($2, apellido),
          correo = COALESCE($3, correo),
          telefono = COALESCE($4, telefono),
          rol = COALESCE($5, rol),
          clave = COALESCE($6, clave)
      WHERE "usuarioID" = $7
      RETURNING "usuarioID", nombre, apellido, correo, telefono, rol;
    `;
    // Un rol vacío se guarda como null (para que el COALESCE lo conserve) en vez
    // de como "" que sí pisaría el rol del usuario.
    const valores = [nombre, apellido, correo, telefono, rol || null, claveHasheada, usuarioId];

    // El rol y la ficha de barbero tienen que ir juntos: si se cambia el rol sin
    // tocar la ficha, la persona queda como cliente (sin panel de barbero) pero
    // sigue apareciendo en la agenda pública, o al revés.
    const resultado = await db.withTransaction(async (client) => {
      const actual = await client.query(
        'SELECT rol FROM usuario WHERE "usuarioID" = $1 FOR UPDATE',
        [usuarioId]
      );

      if (actual.rows.length === 0) return { estado: 'no_encontrado' };

      const ficha = await client.query(
        'SELECT 1 FROM barbero WHERE "usuarioID" = $1',
        [usuarioId]
      );
      const tieneFicha = ficha.rows.length > 0;
      const rolNuevo = rol || actual.rows[0].rol;

      // Dejar como cliente a quien tiene ficha escondería su panel pero lo
      // dejaría atendiendo: se quita desde Barberos, que además limpia horarios
      // y citas de forma controlada.
      if (rolNuevo === 'cliente' && tieneFicha) {
        return { estado: 'tiene_ficha' };
      }

      const actualizado = await client.query(query, valores);

      // Pasar a barbero crea la ficha con la comisión por defecto; el
      // administrador la ajusta en la pestaña Barberos.
      if (rolNuevo === 'barbero' && !tieneFicha) {
        await client.query(
          'INSERT INTO barbero ("usuarioID", comision, estado) VALUES ($1, 20, true)',
          [usuarioId]
        );
      }

      return { estado: 'ok', usuario: actualizado.rows[0] };
    });

    if (resultado.estado === 'no_encontrado') {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    if (resultado.estado === 'tiene_ficha') {
      return res.status(400).json({
        ok: false,
        message: 'Este usuario tiene ficha de barbero. Para dejarlo como cliente, elimínalo primero en la pestaña Barberos.'
      });
    }

    res.json({
      ok: true,
      message: 'Usuario actualizado exitosamente',
      usuario: resultado.usuario
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ ok: false, message: MENSAJE_CORREO_USADO });
    }
    errorInterno(res, error, 'Actualizar Usuario');
  }
};

// 5. Actualizar el propio perfil del usuario autenticado (autenticado).
//
// Es la versión "self-service" de `actualizarUsuario`: el usuario cambia sus
// datos desde la página "Mi perfil" y, en el mismo endpoint, cambia su clave.
// El usuarioID sale del token (`req.usuario`), no de la URL: no se edita el
// perfil de otra cuenta con esta ruta.
const actualizarPerfil = async (req, res) => {
  const usuarioId = req.usuario?.usuarioID;
  const { nombre, apellido, telefono, claveActual, claveNueva } = req.body || {};
  const correo = normalizarCorreo(req.body?.correo);

  if (!usuarioId) {
    return res.status(401).json({ ok: false, message: 'No hay sesión activa' });
  }

  // Cambio de contraseña: exige la actual y define la nueva (mínimo 6 caracteres,
  // igual que el alta de usuario y la misma política de bcrypt).
  if (claveActual !== undefined || claveNueva !== undefined) {
    // Tienen que ser textos: con un número, bcrypt lanza "Illegal arguments"
    // y la petición acababa en un 500.
    if (!claveActual || !claveNueva || typeof claveActual !== 'string' || typeof claveNueva !== 'string') {
      return res.status(400).json({ ok: false, message: 'La clave actual y la nueva son obligatorias' });
    }
    if (String(claveNueva).length < 6) {
      return res.status(400).json({ ok: false, message: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const usuario = await db.query('SELECT clave FROM usuario WHERE "usuarioID" = $1', [usuarioId]);
    if (usuario.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    const esHash = /^\$2[aby]\$\d{2}\$/.test(usuario.rows[0].clave);
    const passwordValida = esHash
      ? await bcrypt.compare(claveActual, usuario.rows[0].clave)
      : claveActual === usuario.rows[0].clave;

    if (!passwordValida) {
      return res.status(400).json({ ok: false, message: 'La clave actual no es correcta' });
    }

    const claveHasheada = await bcrypt.hash(claveNueva, 10);
    await db.query('UPDATE usuario SET clave = $1 WHERE "usuarioID" = $2', [claveHasheada, usuarioId]);

    return res.json({ ok: true, message: 'Contraseña actualizada exitosamente' });
  }

  if (!nombre || !apellido || !correo || !telefono) {
    return res.status(400).json({
      ok: false,
      message: 'Nombre, apellido, correo y teléfono son obligatorios'
    });
  }

  if (!correoValido(correo)) {
    return res.status(400).json({ ok: false, message: 'El correo electrónico no es válido' });
  }

  try {
    if (await correoOcupado(correo, usuarioId)) {
      return res.status(400).json({ ok: false, message: MENSAJE_CORREO_USADO });
    }

    const query = `
      UPDATE usuario
      SET nombre = COALESCE($1, nombre),
          apellido = COALESCE($2, apellido),
          correo = COALESCE($3, correo),
          telefono = COALESCE($4, telefono)
      WHERE "usuarioID" = $5
      RETURNING "usuarioID", nombre, apellido, correo, telefono, rol;
    `;
    const resultado = await db.query(query, [nombre, apellido, correo, telefono, usuarioId]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    res.json({
      ok: true,
      message: 'Usuario actualizado exitosamente',
      usuario: resultado.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ ok: false, message: MENSAJE_CORREO_USADO });
    }
    errorInterno(res, error, 'Actualizar Perfil');
  }
};

// 6. Eliminar un usuario por ID
const eliminarUsuario = async (req, res) => {
  const { id } = req.params;
  const usuarioId = Number(id);

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'El ID del usuario debe ser un número entero válido'
    });
  }

  try {
    const resultado = await db.query(
      'DELETE FROM usuario WHERE "usuarioID" = $1 RETURNING "usuarioID"',
      [usuarioId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    res.json({
      ok: true,
      message: 'Usuario eliminado exitosamente',
      usuarioID: resultado.rows[0].usuarioID
    });
  } catch (error) {
    errorInterno(res, error, 'Eliminar Usuario');
  }
};


module.exports = {
  obtenerUsuarios,
  obtenerUsuarioPorId,
  crearUsuario,
  actualizarUsuario,
  actualizarPerfil,
  eliminarUsuario
};