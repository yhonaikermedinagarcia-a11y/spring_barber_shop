const db = require('../config/db');

// 1. Obtener todos los barberos
const obtenerBarberos = async (req, res) => {
  try {
    const resultado = await db.query(`
      SELECT
        b."barberoID",
        b."usuarioID",
        u.nombre,
        u.apellido,
        u.correo,
        u.telefono,
        b.comision,
        b.estado
      FROM barbero b
      JOIN usuario u ON u."usuarioID" = b."usuarioID"
      ORDER BY b."barberoID" ASC
    `);

    res.json({
      ok: true,
      total: resultado.rows.length,
      barberos: resultado.rows
    });
  } catch (error) {
    console.error('Error al obtener barberos:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 2. Obtener un barbero por ID
const obtenerBarberoPorId = async (req, res) => {
  const { id } = req.params;
  const barberoId = Number(id);

  if (!Number.isInteger(barberoId) || barberoId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'El ID del barbero debe ser un número entero válido'
    });
  }

  try {
    const resultado = await db.query(
      `
        SELECT
          b."barberoID",
          b."usuarioID",
          u.nombre,
          u.apellido,
          u.correo,
          u.telefono,
          b.comision,
          b.estado
        FROM barbero b
        JOIN usuario u ON u."usuarioID" = b."usuarioID"
        WHERE b."barberoID" = $1
      `,
      [barberoId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Barbero no encontrado' });
    }

    res.json({ ok: true, barbero: resultado.rows[0] });
  } catch (error) {
    console.error('Error al obtener barbero:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 3. Crear un nuevo barbero
const crearBarbero = async (req, res) => {
  const { usuarioID, comision, estado } = req.body || {};
  const usuarioId = Number(usuarioID);
  const comisionNumerica = Number(comision);
  const estadoValor = estado === undefined ? true : estado;

  if (
    usuarioID === null || usuarioID === '' ||
    !Number.isInteger(usuarioId) || usuarioId <= 0 ||
    comision === null || comision === '' ||
    !Number.isFinite(comisionNumerica) || comisionNumerica < 0 || comisionNumerica > 999.99 ||
    typeof estadoValor !== 'boolean'
  ) {
    return res.status(400).json({
      ok: false,
      message: 'usuarioID, comisión y un estado booleano válido son obligatorios'
    });
  }

  try {
    const resultado = await db.query(
      `
        WITH usuario_valido AS (
          SELECT "usuarioID"
          FROM usuario
          WHERE "usuarioID" = $1
        ),
        barbero_creado AS (
          INSERT INTO barbero ("usuarioID", comision, estado)
          SELECT "usuarioID", $2, $3
          FROM usuario_valido
          RETURNING "barberoID", "usuarioID", comision, estado
        )
        SELECT
          b."barberoID",
          b."usuarioID",
          u.nombre,
          u.apellido,
          u.correo,
          u.telefono,
          b.comision,
          b.estado
        FROM barbero_creado b
        JOIN usuario u ON u."usuarioID" = b."usuarioID"
      `,
      [usuarioId, comisionNumerica, estadoValor]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    res.status(201).json({
      ok: true,
      message: 'Barbero creado exitosamente',
      barbero: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al crear barbero:', error);

    if (error.code === '23503') {
      return res.status(400).json({ ok: false, message: 'El usuario indicado no existe' });
    }

    if (error.code === '23505') {
      return res.status(400).json({ ok: false, message: 'El usuario ya está registrado como barbero' });
    }

    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  obtenerBarberos,
  obtenerBarberoPorId,
  crearBarbero
};
