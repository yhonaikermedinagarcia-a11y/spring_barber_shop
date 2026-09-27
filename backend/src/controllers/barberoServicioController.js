const db = require('../config/db');

// Valida que un id de ruta o del body sea un entero positivo.
const idValido = (valor) => {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// 1. Obtener los servicios que ofrece un barbero específico
const obtenerServiciosPorBarbero = async (req, res) => {
  const barberoId = idValido(req.params.barberoID);

  if (!barberoId) {
    return res.status(400).json({
      ok: false,
      message: 'El ID del barbero debe ser un número entero válido'
    });
  }

  try {
    const query = `
      SELECT
        s."serviciosID",
        s.nombre,
        s.descripcion,
        s.precio,
        s.duracion_minutos
      FROM barbero_servicio bs
      JOIN servicios s ON bs."servicioID" = s."serviciosID"
      WHERE bs."barberoID" = $1
      ORDER BY s.nombre ASC;
    `;
    const resultado = await db.query(query, [barberoId]);

    res.json({
      ok: true,
      total: resultado.rows.length,
      servicios: resultado.rows
    });
  } catch (error) {
    console.error('Error al obtener servicios del barbero:', error.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 2. Asignar un servicio a un barbero
const asignarServicioABarbero = async (req, res) => {
  const { barberoID, servicioID } = req.body || {};

  const barberoId = idValido(barberoID);
  const servicioId = idValido(servicioID);

  if (!barberoId || !servicioId) {
    return res.status(400).json({
      ok: false,
      message: 'barberoID y servicioID deben ser números enteros válidos'
    });
  }

  try {
    // Se comprueba la existencia de ambos para poder distinguir un 404 claro de un
    // conflicto: el DO NOTHING devuelve 0 filas en ambos casos y por sí solo no dice
    // cuál de los dos ocurrió.
    const barberoRes = await db.query(
      'SELECT "barberoID" FROM barbero WHERE "barberoID" = $1',
      [barberoId]
    );
    if (barberoRes.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Barbero no encontrado' });
    }

    const servicioRes = await db.query(
      'SELECT "serviciosID" FROM servicios WHERE "serviciosID" = $1',
      [servicioId]
    );
    if (servicioRes.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Servicio no encontrado' });
    }

    const query = `
      INSERT INTO barbero_servicio ("barberoID", "servicioID")
      VALUES ($1, $2)
      ON CONFLICT ("barberoID", "servicioID") DO NOTHING
      RETURNING "barbero_servicioID", "barberoID", "servicioID";
    `;
    const resultado = await db.query(query, [barberoId, servicioId]);

    if (resultado.rows.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'El barbero ya tiene asignado este servicio'
      });
    }

    res.status(201).json({
      ok: true,
      message: 'Servicio asignado al barbero exitosamente',
      asignacion: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al asignar servicio:', error.message);

    if (error.code === '23503') {
      return res.status(400).json({ ok: false, message: 'El barbero o el servicio no existe' });
    }
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 3. Desvincular un servicio de un barbero
const eliminarServicioDeBarbero = async (req, res) => {
  const barberoId = idValido(req.params.barberoID);
  const servicioId = idValido(req.params.servicioID);

  if (!barberoId || !servicioId) {
    return res.status(400).json({
      ok: false,
      message: 'Los IDs de barbero y servicio deben ser números enteros válidos'
    });
  }

  try {
    const query = `
      DELETE FROM barbero_servicio
      WHERE "barberoID" = $1 AND "servicioID" = $2
      RETURNING "barbero_servicioID";
    `;
    const resultado = await db.query(query, [barberoId, servicioId]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'La relación entre el barbero y el servicio no existe' });
    }

    res.json({
      ok: true,
      message: 'Servicio desvinculado del barbero exitosamente',
      barbero_servicioID: resultado.rows[0].barbero_servicioID
    });
  } catch (error) {
    console.error('Error al desvincular servicio:', error.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  obtenerServiciosPorBarbero,
  asignarServicioABarbero,
  eliminarServicioDeBarbero
};
