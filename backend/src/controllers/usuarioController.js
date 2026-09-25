const db = require('../config/db');

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
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 2. Obtener un usuario por ID
const obtenerUsuarioPorId = async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await db.query(
      'SELECT "usuarioID", nombre, apellido, correo, telefono, rol FROM usuario WHERE "usuarioID" = $1',
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    res.json({ ok: true, usuario: resultado.rows[0] });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 3. Crear un nuevo usuario
const crearUsuario = async (req, res) => {
  const { nombre, apellido, correo, telefono, rol, clave } = req.body;

  if (!nombre || !apellido || !correo || !telefono || !clave) {
    return res.status(400).json({
      ok: false,
      message: 'Nombre, apellido, correo, teléfono y clave son obligatorios'
    });
  }

  try {
    const query = `
      INSERT INTO usuario (nombre, apellido, correo, telefono, rol, clave)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING "usuarioID", nombre, apellido, correo, telefono, rol;
    `;
    const valores = [nombre, apellido, correo, telefono, rol || 'cliente', clave];

    const resultado = await db.query(query, valores);

    res.status(201).json({
      ok: true,
      message: 'Usuario creado exitosamente',
      usuario: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    if (error.code === '23505') {
      return res.status(400).json({ ok: false, message: 'El correo electrónico ya está registrado' });
    }
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};



// 4. Actualizar un usuario por ID
const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const { nombre, apellido, correo, telefono, rol, clave } = req.body;

  try {
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
    const valores = [nombre, apellido, correo, telefono, rol, clave, id];
    const resultado = await db.query(query, valores);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    res.json({
      ok: true,
      message: 'Usuario actualizado exitosamente',
      usuario: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 5. Eliminar un usuario por ID
const eliminarUsuario = async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await db.query(
      'DELETE FROM usuario WHERE "usuarioID" = $1 RETURNING "usuarioID"',
      [id]
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
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};


module.exports = {
  obtenerUsuarios,
  obtenerUsuarioPorId,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario
};