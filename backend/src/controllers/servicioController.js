const db = require('../config/db');

// 1. Obtener todos los servicios
const obtenerServicios = async (req, res) => {
  try {
    const resultado = await db.query(`
      SELECT "serviciosID", nombre, descripcion, precio, duracion_minutos
      FROM servicios
      ORDER BY "serviciosID" ASC
    `);
    res.json({
      ok: true,
      total: resultado.rows.length,
      servicios: resultado.rows
    });
  } catch (error) {
    console.error('Error al obtener servicios:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 2. Obtener un servicio por ID
const obtenerServicioPorId = async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await db.query(
      'SELECT "serviciosID", nombre, descripcion, precio, duracion_minutos FROM servicios WHERE "serviciosID" = $1',
      [id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Servicio no encontrado' });
    }
    res.json({ ok: true, servicio: resultado.rows[0] });
  } catch (error) {
    console.error('Error al obtener servicio:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 3. Crear un nuevo servicio
const crearServicio = async (req, res) => {
  const { nombre, descripcion, precio, duracion_minutos } = req.body;
  const precioNumerico = Number(precio);
  const duracionMinutos = Number(duracion_minutos);

  if (
    typeof nombre !== 'string' || !nombre.trim() ||
    typeof descripcion !== 'string' || !descripcion.trim() ||
    precio === null || precio === '' ||
    !Number.isFinite(precioNumerico) || precioNumerico < 0 ||
    !Number.isInteger(duracionMinutos) || duracionMinutos <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message: 'Nombre, descripción, precio no negativo y duración en minutos son obligatorios'
    });
  }

  try {
    const query = `
      INSERT INTO servicios (nombre, descripcion, precio, duracion_minutos)
      VALUES ($1, $2, $3, $4)
      RETURNING "serviciosID", nombre, descripcion, precio, duracion_minutos;
    `;
    const valores = [nombre.trim(), descripcion.trim(), precioNumerico, duracionMinutos];
    const resultado = await db.query(query, valores);

    res.status(201).json({
      ok: true,
      message: 'Servicio creado exitosamente',
      servicio: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al crear servicio:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  obtenerServicios,
  obtenerServicioPorId,
  crearServicio
};