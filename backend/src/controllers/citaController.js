const db = require('../config/db');

// Estados permitidos (deben coincidir con el CHECK de la migración 001)
const ESTADOS_VALIDOS = ['pendiente', 'confirmada', 'completada', 'cancelada'];

// Error de negocio con código HTTP, para diferenciarlo de un fallo de PostgreSQL
const errorHttp = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

// 1. Obtener todas las citas
const obtenerCitas = async (req, res) => {
  try {
    const query = `
      SELECT
        c."citaID",
        c."clienteID",
        c."barberoID",
        c."servicioID",
        c.fecha_inicio,
        c.fecha_fin,
        c.estado,
        u.nombre   AS cliente_nombre,
        u.apellido AS cliente_apellido,
        ub.nombre  AS barbero_nombre,
        ub.apellido AS barbero_apellido,
        s.nombre   AS servicio_nombre,
        s.precio,
        s.duracion_minutos
      FROM cita c
      JOIN usuario u   ON c."clienteID"  = u."usuarioID"
      JOIN barbero b   ON c."barberoID"  = b."barberoID"
      JOIN usuario ub  ON b."usuarioID"  = ub."usuarioID"
      JOIN servicios s ON c."servicioID" = s."serviciosID"
      ORDER BY c.fecha_inicio DESC;
    `;
    const resultado = await db.query(query);
    res.json({
      ok: true,
      total: resultado.rows.length,
      citas: resultado.rows
    });
  } catch (error) {
    console.error('Error al obtener citas:', error.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 2. Crear una nueva cita con validación de solapamiento de horarios
const crearCita = async (req, res) => {
  const { clienteID, barberoID, servicioID, fecha_hora } = req.body || {};

  const clienteId = Number(clienteID);
  const barberoId = Number(barberoID);
  const servicioId = Number(servicioID);
  const fechaInicio = fecha_hora ? new Date(fecha_hora) : null;

  if (
    !Number.isInteger(clienteId) || clienteId <= 0 ||
    !Number.isInteger(barberoId) || barberoId <= 0 ||
    !Number.isInteger(servicioId) || servicioId <= 0 ||
    !fechaInicio || Number.isNaN(fechaInicio.getTime())
  ) {
    return res.status(400).json({
      ok: false,
      message: 'clienteID, barberoID, servicioID y una fecha_hora válida son obligatorios'
    });
  }

  try {
    const cita = await db.withTransaction(async (client) => {
      // A. Bloquear la fila del barbero para que dos reservas simultáneas
      //    del mismo barbero no puedan saltarse la validación de solapamiento.
      const barberoRes = await client.query(
        'SELECT "barberoID", estado FROM barbero WHERE "barberoID" = $1 FOR UPDATE',
        [barberoId]
      );
      if (barberoRes.rows.length === 0) {
        throw errorHttp(404, 'Barbero no encontrado');
      }
      if (!barberoRes.rows[0].estado) {
        throw errorHttp(400, 'El barbero no está activo');
      }

      // B. La duración del servicio define la hora de fin de la cita
      const servicioRes = await client.query(
        'SELECT "serviciosID", duracion_minutos FROM servicios WHERE "serviciosID" = $1',
        [servicioId]
      );
      if (servicioRes.rows.length === 0) {
        throw errorHttp(404, 'Servicio no encontrado');
      }
      const { duracion_minutos: duracionMinutos } = servicioRes.rows[0];
      const fechaFin = new Date(fechaInicio.getTime() + duracionMinutos * 60 * 1000);

      // C. Solapamiento: el intervalo [fecha_inicio, fecha_fin) de la nueva cita
      //    contra las citas existentes del mismo barbero. Las canceladas no bloquean.
      const cruce = await client.query(
        `SELECT "citaID", fecha_inicio, fecha_fin
         FROM cita
         WHERE "barberoID" = $1
           AND estado <> 'cancelada'
           AND fecha_inicio < $3
           AND fecha_fin   > $2`,
        [barberoId, fechaInicio, fechaFin]
      );
      if (cruce.rows.length > 0) {
        throw errorHttp(400, 'El barbero ya tiene una cita que se cruza con ese horario');
      }

      // D. Insertar la nueva cita
      const insercion = await client.query(
        `INSERT INTO cita ("clienteID", "barberoID", "servicioID", fecha_inicio, fecha_fin, estado)
         VALUES ($1, $2, $3, $4, $5, 'pendiente')
         RETURNING "citaID", "clienteID", "barberoID", "servicioID", fecha_inicio, fecha_fin, estado;`,
        [clienteId, barberoId, servicioId, fechaInicio, fechaFin]
      );
      return insercion.rows[0];
    });

    res.status(201).json({
      ok: true,
      message: 'Cita agendada exitosamente',
      cita
    });
  } catch (error) {
    console.error('Error al crear cita:', error.message);

    if (error.status) {
      return res.status(error.status).json({ ok: false, message: error.message });
    }
    if (error.code === '23503') {
      return res.status(400).json({ ok: false, message: 'El cliente indicado no existe' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ ok: false, message: 'Estado de cita no válido' });
    }
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 3. Actualizar estado de la cita (ej. completada, cancelada)
const actualizarEstadoCita = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body || {};

  const citaId = Number(id);
  if (!Number.isInteger(citaId) || citaId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'El ID de la cita debe ser un número entero válido'
    });
  }
  if (!estado || !ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({
      ok: false,
      message: `Estado no válido. Debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`
    });
  }

  try {
    const resultado = await db.query(
      'UPDATE cita SET estado = $1 WHERE "citaID" = $2 RETURNING "citaID", "clienteID", "barberoID", "servicioID", fecha_inicio, fecha_fin, estado;',
      [estado, citaId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Cita no encontrada' });
    }

    res.json({
      ok: true,
      message: 'Estado de cita actualizado',
      cita: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar cita:', error.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  obtenerCitas,
  crearCita,
  actualizarEstadoCita
};
