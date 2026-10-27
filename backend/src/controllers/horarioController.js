const db = require('../config/db');
const { errorInterno } = require('../utils/respuestaError');
const { DIAS_SEMANA, horaAMinutos, esHoraValida } = require('../utils/validacion');
const { esAdministradorDeBarbero, forbiddenNoEsSuBarbero } = require('../utils/permisos');

// Días aceptados por el CHECK horario_laboral_dia_check (migración 004).
// Se usan en minúsculas y sin tilde; citaController convierte la fecha al mismo nombre.
const DIAS_VALIDOS = DIAS_SEMANA;

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
             h.hora_fin,
             h.almuerzo_inicio,
             h.almuerzo_fin
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
    errorInterno(res, error, 'Obtener Horarios Por Barbero');
  }
};

// 2. Registrar o actualizar el horario laboral de un barbero
const guardarHorario = async (req, res) => {
  const { barberoID, dia_semana, hora_inicio, hora_fin } = req.body || {};
  const cuerpo = req.body || {};

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

  /*
   * Hora de almuerzo (opcional).
   *
   * - `almuerzo_inicio` y `almuerzo_fin` con hora: ese es el descanso del día.
   * - Los dos en null o vacíos: el día no tiene almuerzo.
   * - Sin enviarlos: se conserva el que ya tenía el día. Si el día es nuevo y
   *   es de jornada completa (abre antes de las 12:00 y cierra a las 15:00 o
   *   más tarde) se le pone de 12:00 a 13:00, igual que la migración 014.
   */
  const inicioMin = horaAMinutos(hora_inicio.trim());
  const finMin = horaAMinutos(hora_fin.trim());
  const vieneAlmuerzo = 'almuerzo_inicio' in cuerpo || 'almuerzo_fin' in cuerpo;
  const vacio = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim());
  let almuerzo = null; // { inicio, fin } | null

  if (vieneAlmuerzo && !(vacio(cuerpo.almuerzo_inicio) && vacio(cuerpo.almuerzo_fin))) {
    if (!esHoraValida(cuerpo.almuerzo_inicio) || !esHoraValida(cuerpo.almuerzo_fin)) {
      return res.status(400).json({
        ok: false,
        message: 'La hora de almuerzo necesita inicio y fin con formato HH:MM (o los dos vacíos para quitarla)'
      });
    }
    const aIni = horaAMinutos(cuerpo.almuerzo_inicio.trim());
    const aFin = horaAMinutos(cuerpo.almuerzo_fin.trim());
    if (aFin <= aIni) {
      return res.status(400).json({ ok: false, message: 'El fin del almuerzo debe ser posterior a su inicio' });
    }
    if (aIni < inicioMin || aFin > finMin) {
      return res.status(400).json({ ok: false, message: 'La hora de almuerzo tiene que estar dentro de la jornada' });
    }
    almuerzo = { inicio: cuerpo.almuerzo_inicio.trim(), fin: cuerpo.almuerzo_fin.trim() };
  }

  // La ruta deja pasar al administrador y al barbero, pero un barbero solo
  // puede cambiar **su** horario: si no, cualquiera con cuenta de barbero
  // cerraba la agenda de sus compañeros.
  if (!(await esAdministradorDeBarbero(barberoId, req.usuario))) {
    return forbiddenNoEsSuBarbero(res, 'Solo puedes modificar tu propio horario');
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

    if (!vieneAlmuerzo) {
      const previo = await db.query(
        `SELECT to_char(almuerzo_inicio, 'HH24:MI') AS inicio, to_char(almuerzo_fin, 'HH24:MI') AS fin
         FROM horario_laboral WHERE "barberoID" = $1 AND dia_semana = $2`,
        [barberoId, dia]
      );
      if (previo.rows.length > 0) {
        const { inicio, fin } = previo.rows[0];
        // Se conserva si sigue cabiendo en la jornada nueva.
        if (inicio && horaAMinutos(inicio) >= inicioMin && horaAMinutos(fin) <= finMin) {
          almuerzo = { inicio, fin };
        }
      } else if (inicioMin <= 12 * 60 && finMin >= 15 * 60) {
        almuerzo = { inicio: '12:00', fin: '13:00' };
      }
    }

    // Insertar o actualizar si ya existe configuración para ese día y barbero
    const query = `
      INSERT INTO horario_laboral ("barberoID", dia_semana, hora_inicio, hora_fin, almuerzo_inicio, almuerzo_fin)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT ("barberoID", dia_semana)
      DO UPDATE SET hora_inicio     = EXCLUDED.hora_inicio,
                    hora_fin        = EXCLUDED.hora_fin,
                    almuerzo_inicio = EXCLUDED.almuerzo_inicio,
                    almuerzo_fin    = EXCLUDED.almuerzo_fin
      RETURNING "horarioID", "barberoID", dia_semana, hora_inicio, hora_fin, almuerzo_inicio, almuerzo_fin;
    `;
    const resultado = await db.query(query, [
      barberoId,
      dia,
      hora_inicio.trim(),
      hora_fin.trim(),
      almuerzo ? almuerzo.inicio : null,
      almuerzo ? almuerzo.fin : null,
    ]);

    res.status(201).json({
      ok: true,
      message: 'Horario guardado exitosamente',
      horario: resultado.rows[0]
    });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ ok: false, message: 'El barbero indicado no existe' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ ok: false, message: 'Día u horario fuera de los valores permitidos' });
    }
    errorInterno(res, error, 'Guardar Horario');
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

  // Igual que al guardar: un barbero solo toca el horario de su agenda.
  if (!(await esAdministradorDeBarbero(barberoId, req.usuario))) {
    return forbiddenNoEsSuBarbero(res, 'Solo puedes modificar tu propio horario');
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
    errorInterno(res, error, 'Eliminar Horario');
  }
};

module.exports = {
  obtenerHorariosPorBarbero,
  guardarHorario,
  eliminarHorario
};
