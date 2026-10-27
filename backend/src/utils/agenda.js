/*
 * Comprobación de solapamiento en la agenda de un barbero.
 *
 * Una cita ocupa su hora mientras no esté en uno de los estados que la
 * liberan. Lo usan la reserva (citaController.validarCita) y las acciones que
 * devuelven a la agenda una cita que la había dejado libre: rechazar una
 * solicitud de cancelación o aprobar el pago de una cita denegada. Sin esta
 * comprobación, esas acciones creaban dobles reservas: mientras la cita
 * estaba fuera de la agenda, otra persona podía tomar su hora.
 */

// Estados que NO ocupan la hora. La web (Reservar.jsx) usa la misma lista.
const ESTADOS_QUE_LIBERAN = ['cancelada', 'denegada', 'cancelacion_solicitada'];

/**
 * ¿Hay otra cita activa del barbero que se cruce con [inicio, fin)?
 * @param {import('pg').PoolClient} client
 * @returns {Promise<boolean>}
 */
const hayCruce = async (client, { barberoId, inicio, fin, excluirCitaId = null }) => {
  const { rows } = await client.query(
    `SELECT 1
     FROM cita
     WHERE "barberoID" = $1
       AND estado <> ALL($4::text[])
       AND fecha_inicio < $3
       AND fecha_fin   > $2
       AND ($5::int IS NULL OR "citaID" <> $5)
     LIMIT 1`,
    [barberoId, inicio, fin, ESTADOS_QUE_LIBERAN, excluirCitaId]
  );
  return rows.length > 0;
};

/**
 * Devuelve a la agenda una cita que estaba fuera de ella, si su hora sigue
 * libre. Bloquea la fila del barbero, igual que una reserva nueva, para que
 * nadie tome la hora entre la comprobación y el cambio.
 * @returns {Promise<boolean>} false si la hora ya la tiene otra cita.
 */
const horaSigueLibre = async (client, citaId) => {
  const { rows } = await client.query(
    'SELECT "barberoID", fecha_inicio, fecha_fin FROM cita WHERE "citaID" = $1',
    [citaId]
  );
  if (rows.length === 0) return false;
  const { barberoID, fecha_inicio: inicio, fecha_fin: fin } = rows[0];
  await client.query('SELECT 1 FROM barbero WHERE "barberoID" = $1 FOR UPDATE', [barberoID]);
  return !(await hayCruce(client, { barberoId: barberoID, inicio, fin, excluirCitaId: citaId }));
};

const { DIAS_DESCANSO } = require('../config/calendario');
const { DIAS_SEMANA, horaAMinutos } = require('./validacion');

const PASO_REJILLA = 30;
const aHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * Horas libres de un barbero en un día, con las mismas reglas que la reserva:
 * horario laboral, almuerzo, día de descanso, feriado, permiso del barbero,
 * citas que ocupan la hora y horas que ya pasaron. Las horas candidatas son
 * las mismas que ofrece la web (Reservar.jsx): cada 30 minutos más el final
 * de cada cita y del almuerzo.
 *
 * La usa la lista de espera para saber si se ha liberado una hora que le
 * sirva a quien espera.
 *
 * @param {{query: Function}} db  pool o cliente de pg
 * @param {object} datos
 * @param {number} datos.barberoId
 * @param {string} datos.fecha       YYYY-MM-DD
 * @param {number} datos.duracion    minutos del servicio
 * @param {string|null} [datos.desde] franja que le sirve al cliente (HH:MM)
 * @param {string|null} [datos.hasta]
 * @returns {Promise<string[]>} horas de inicio "HH:MM"
 */
const huecosLibresDelDia = async (db, { barberoId, fecha, duracion, desde = null, hasta = null }) => {
  const dia = DIAS_SEMANA[(new Date(`${fecha}T00:00:00`).getDay() + 6) % 7];
  if (DIAS_DESCANSO.includes(dia)) return [];

  const { rows: bloqueos } = await db.query(
    `SELECT
       (SELECT estado FROM barbero WHERE "barberoID" = $1) AS activo,
       EXISTS (SELECT 1 FROM feriado WHERE fecha = $2::date) AS feriado,
       EXISTS (SELECT 1 FROM ausencia_barbero
               WHERE "barberoID" = $1 AND $2::date BETWEEN fecha_inicio AND fecha_fin) AS ausente`,
    [barberoId, fecha]
  );
  if (!bloqueos[0].activo || bloqueos[0].feriado || bloqueos[0].ausente) return [];

  const { rows: horario } = await db.query(
    `SELECT to_char(hora_inicio, 'HH24:MI') AS inicio, to_char(hora_fin, 'HH24:MI') AS fin,
            to_char(almuerzo_inicio, 'HH24:MI') AS a_inicio, to_char(almuerzo_fin, 'HH24:MI') AS a_fin
     FROM horario_laboral WHERE "barberoID" = $1 AND dia_semana = $2`,
    [barberoId, dia]
  );
  if (horario.length === 0) return [];
  const h = horario[0];
  const apertura = horaAMinutos(h.inicio);
  const cierre = horaAMinutos(h.fin);

  const { rows: citas } = await db.query(
    `SELECT (EXTRACT(HOUR FROM fecha_inicio) * 60 + EXTRACT(MINUTE FROM fecha_inicio))::int AS inicio,
            CASE WHEN fecha_fin::date > $2::date THEN 1440
                 ELSE (EXTRACT(HOUR FROM fecha_fin) * 60 + EXTRACT(MINUTE FROM fecha_fin))::int END AS fin
     FROM cita
     WHERE "barberoID" = $1
       AND fecha_inicio::date = $2::date
       AND estado <> ALL($3::text[])`,
    [barberoId, fecha, ESTADOS_QUE_LIBERAN]
  );
  const ocupados = citas.map((c) => ({ inicio: c.inicio, fin: c.fin }));
  if (h.a_inicio && h.a_fin) ocupados.push({ inicio: horaAMinutos(h.a_inicio), fin: horaAMinutos(h.a_fin) });

  // Si es hoy, no cuentan las horas que ya pasaron (con el reloj del local:
  // process.env.TZ lo fija config/zonaHoraria.js).
  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  if (fecha < hoy) return [];
  const minimo = fecha === hoy ? ahora.getHours() * 60 + ahora.getMinutes() + 1 : 0;

  const franjaDesde = desde ? horaAMinutos(desde) : apertura;
  const franjaHasta = hasta ? horaAMinutos(hasta) : cierre;

  const candidatos = new Set();
  for (let t = apertura; t < cierre; t += PASO_REJILLA) candidatos.add(t);
  for (const o of ocupados) if (o.fin > apertura && o.fin < cierre) candidatos.add(o.fin);

  return [...candidatos]
    .filter((t) => t >= minimo && t >= franjaDesde && t < franjaHasta)
    .filter((t) => t + duracion <= cierre)
    .filter((t) => !ocupados.some((o) => t < o.fin && t + duracion > o.inicio))
    .sort((a, b) => a - b)
    .map(aHHMM);
};

module.exports = { ESTADOS_QUE_LIBERAN, hayCruce, horaSigueLibre, huecosLibresDelDia };
