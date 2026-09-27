const db = require('../config/db');

// Días aceptados por el CHECK horario_laboral_dia_check (migración 004).
// Se usan en minúsculas y sin tilde; citaController convierte la fecha al mismo nombre.
const DIAS_VALIDOS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

// Convierte una hora "HH:MM" o "HH:MM:SS" a minutos desde medianoche.
const horaAMinutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

// Valida el formato de hora que espera PostgreSQL para un tipo `time`.
const esHoraValida = (valor) =>
  typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(valor.trim());

// 1. Obtener los horarios de un barbero específico
const obtenerHorariosPorBarbero = async (req, res) => {
  const barberoId = Number(req.params.barberoID);

  if (!Number.isInteger(barberoId) || barberoId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'El ID del barbero debe ser un número entero válido'
    });
  }

  try {
    const query = `
      SELECT h."horarioID",
             h."barberoID",
             h.dia_semana,
             h.hora_inicio,
             h.hora_fin
      FROM horario_laboral h
      WHERE h."barberoID" = $1
      ORDER BY array_position(
        ARRAY['lunes','martes','miercoles','jueves','viernes','sabado','domingo'],
        h.dia_semana
      ) ASC;
    `;
    const resultado = await db.query(query, [barberoId]);

    res.json({
      ok: true,
      total: resultado.rows.length,
      horarios: resultado.rows
    });
  } catch (error) {
    console.error('Error al obtener horarios:', error.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 2. Registrar o actualizar el horario laboral de un barbero
const guardarHorario = async (req, res) => {
  const { barberoID, dia_semana, hora_inicio, hora_fin } = req.body || {};

  const barberoId = Number(barberoID);
  const dia = typeof dia_semana === 'string' ? dia_semana.trim().toLowerCase() : '';

  if (!Number.isInteger(barberoId) || barberoId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'El ID del barbero debe ser un número entero válido'
    });
  }
  if (!DIAS_VALIDOS.includes(dia)) {
    return res.status(400).json({
      ok: false,
      message: `dia_semana debe ser uno de: ${DIAS_VALIDOS.join(', ')}`
    });
  }
  if (!esHoraValida(hora_inicio) || !esHoraValida(hora_fin)) {
    return res.status(400).json({
      ok: false,
      message: 'hora_inicio y hora_fin deben tener formato HH:MM'
    });
  }
  if (horaAMinutos(hora_fin.trim()) <= horaAMinutos(hora_inicio.trim())) {
    return res.status(400).json({
      ok: false,
      message: 'hora_fin debe ser posterior a hora_inicio'
    });
  }

  try {
    // Validar que el barbero exista
    const barberoRes = await db.query(
      'SELECT "barberoID", estado FROM barbero WHERE "barberoID" = $1',
      [barberoId]
    );
    if (barberoRes.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Barbero no encontrado' });
    }

    // Insertar o actualizar si ya existe configuración para ese día y barbero
    const query = `
      INSERT INTO horario_laboral ("barberoID", dia_semana, hora_inicio, hora_fin)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT ("barberoID", dia_semana)
      DO UPDATE SET hora_inicio = EXCLUDED.hora_inicio,
                    hora_fin   = EXCLUDED.hora_fin
      RETURNING "horarioID", "barberoID", dia_semana, hora_inicio, hora_fin;
    `;
    const resultado = await db.query(query, [barberoId, dia, hora_inicio.trim(), hora_fin.trim()]);

    res.status(201).json({
      ok: true,
      message: 'Horario guardado exitosamente',
      horario: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al guardar horario:', error.message);

    if (error.code === '23503') {
      return res.status(400).json({ ok: false, message: 'El barbero indicado no existe' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ ok: false, message: 'Día u horario fuera de los valores permitidos' });
    }
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 3. Eliminar el horario de un barbero para un día
const eliminarHorario = async (req, res) => {
  const barberoId = Number(req.params.barberoID);
  const dia = typeof req.params.dia === 'string' ? req.params.dia.toLowerCase() : '';

  if (!Number.isInteger(barberoId) || barberoId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'El ID del barbero debe ser un número entero válido'
    });
  }
  if (!DIAS_VALIDOS.includes(dia)) {
    return res.status(400).json({
      ok: false,
      message: `El día debe ser uno de: ${DIAS_VALIDOS.join(', ')}`
    });
  }

  try {
    const resultado = await db.query(
      'DELETE FROM horario_laboral WHERE "barberoID" = $1 AND dia_semana = $2 RETURNING "horarioID"',
      [barberoId, dia]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Horario no encontrado' });
    }

    res.json({
      ok: true,
      message: 'Horario eliminado exitosamente',
      horarioID: resultado.rows[0].horarioID
    });
  } catch (error) {
    console.error('Error al eliminar horario:', error.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  obtenerHorariosPorBarbero,
  guardarHorario,
  eliminarHorario
};
