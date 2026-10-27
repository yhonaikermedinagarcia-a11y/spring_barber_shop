const db = require('../config/db');
const { errorInterno } = require('../utils/respuestaError');
const { idValido, esHoraValida, horaAMinutos, fechaYmd } = require('../utils/validacion');
const { huecosLibresDelDia } = require('../utils/agenda');

/*
 * Lista de espera.
 *
 * Cuando un día está lleno, el cliente se apunta para un barbero, un servicio
 * y una fecha (y, si quiere, una franja: "de 15:00 a 18:00"). Cada vez que se
 * consulta la lista, la API calcula si hay alguna hora libre que le sirva
 * (`huecos`): así no hace falta "enganchar" el aviso a cada forma en que una
 * cita deja libre su hora (cancelación, reembolso, pago rechazado, cita
 * borrada, reprogramación...).
 *
 * El aviso lo da el administrador desde el panel (WhatsApp) y el cliente con
 * cuenta lo ve también en "Mis citas". Cuando la persona reserva con ese
 * barbero ese día, su entrada pasa sola a "atendido" (ver citaController).
 */

const ESTADOS = ['esperando', 'avisado', 'atendido', 'cancelado'];
const ACTIVOS = ['esperando', 'avisado'];
const MAX_ACTIVAS_POR_TELEFONO = 3;
const DIAS_MAXIMOS = 60;

const soloDigitos = (v) => String(v || '').replace(/\D/g, '');
const esFecha = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
const texto = (v) => (typeof v === 'string' ? v.trim() : '');

const SELECT_ESPERA = `
  SELECT e."esperaID", e."barberoID", e."servicioID",
         to_char(e.fecha, 'YYYY-MM-DD') AS fecha,
         e."clienteID", e.nombre, e.telefono,
         to_char(e.hora_desde, 'HH24:MI') AS hora_desde,
         to_char(e.hora_hasta, 'HH24:MI') AS hora_hasta,
         e.nota, e.estado, e.creado_en, e.avisado_en,
         s.nombre AS servicio_nombre, s.duracion_minutos,
         u.nombre AS barbero_nombre, u.apellido AS barbero_apellido
  FROM lista_espera e
  JOIN servicios s ON s."serviciosID" = e."servicioID"
  JOIN barbero b   ON b."barberoID"   = e."barberoID"
  JOIN usuario u   ON u."usuarioID"   = b."usuarioID"
`;

// Añade a cada entrada activa las horas libres que le sirven ahora mismo.
const conHuecos = async (filas) =>
  Promise.all(
    filas.map(async (f) => ({
      ...f,
      huecos: ACTIVOS.includes(f.estado)
        ? await huecosLibresDelDia(db, {
            barberoId: f.barberoID,
            fecha: f.fecha,
            duracion: Number(f.duracion_minutos) || 30,
            desde: f.hora_desde,
            hasta: f.hora_hasta,
          })
        : [],
    }))
  );

// 1. Apuntarse (público; con sesión de cliente se usan sus datos).
const crearEspera = async (req, res) => {
  const body = req.body || {};
  const barberoId = idValido(body.barberoID);
  const servicioId = idValido(body.servicioID);
  const fecha = esFecha(body.fecha) ? body.fecha.trim() : null;
  const esCliente = req.usuario?.rol === 'cliente';

  if (!barberoId || !servicioId || !fecha) {
    return res.status(400).json({ ok: false, message: 'barberoID, servicioID y una fecha AAAA-MM-DD son obligatorios' });
  }

  const hoy = fechaYmd(new Date());
  const limite = fechaYmd(new Date(Date.now() + DIAS_MAXIMOS * 86400000));
  if (fecha < hoy) {
    return res.status(400).json({ ok: false, message: 'No te puedes apuntar a un día que ya pasó' });
  }
  if (fecha > limite) {
    return res.status(400).json({ ok: false, message: `La lista de espera admite fechas de los próximos ${DIAS_MAXIMOS} días` });
  }

  // Franja opcional
  const desde = texto(body.hora_desde);
  const hasta = texto(body.hora_hasta);
  if ((desde || hasta) && (!esHoraValida(desde) || !esHoraValida(hasta) || horaAMinutos(hasta) <= horaAMinutos(desde))) {
    return res.status(400).json({ ok: false, message: 'La franja necesita una hora de inicio y una de fin posterior (HH:MM), o ninguna' });
  }

  try {
    let nombre = texto(body.nombre);
    let telefono = texto(body.telefono);
    if (esCliente) {
      const { rows } = await db.query('SELECT nombre, apellido, telefono FROM usuario WHERE "usuarioID" = $1', [req.usuario.usuarioID]);
      if (!nombre) nombre = `${rows[0].nombre} ${rows[0].apellido}`.trim();
      if (!telefono) telefono = rows[0].telefono;
    }
    if (!nombre) return res.status(400).json({ ok: false, message: 'El nombre es obligatorio' });
    if (soloDigitos(telefono).length < 7) {
      return res.status(400).json({ ok: false, message: 'El teléfono debe tener al menos 7 dígitos: es por donde te avisamos' });
    }

    const { rows: [barbero] } = await db.query('SELECT estado FROM barbero WHERE "barberoID" = $1', [barberoId]);
    if (!barbero) return res.status(404).json({ ok: false, message: 'Barbero no encontrado' });
    if (!barbero.estado) return res.status(400).json({ ok: false, message: 'El barbero no está activo' });

    const { rows: [servicio] } = await db.query('SELECT duracion_minutos FROM servicios WHERE "serviciosID" = $1', [servicioId]);
    if (!servicio) return res.status(404).json({ ok: false, message: 'Servicio no encontrado' });

    // Un día en que el barbero no trabaja nunca va a tener hueco.
    const { rows: [diaCheck] } = await db.query(
      `SELECT
         EXISTS (SELECT 1 FROM horario_laboral
                 WHERE "barberoID" = $1
                   AND dia_semana = (ARRAY['domingo','lunes','martes','miercoles','jueves','viernes','sabado'])[EXTRACT(DOW FROM $2::date)::int + 1]) AS trabaja,
         EXISTS (SELECT 1 FROM feriado WHERE fecha = $2::date) AS feriado,
         EXISTS (SELECT 1 FROM ausencia_barbero WHERE "barberoID" = $1 AND $2::date BETWEEN fecha_inicio AND fecha_fin) AS ausente`,
      [barberoId, fecha]
    );
    if (!diaCheck.trabaja || diaCheck.feriado || diaCheck.ausente) {
      return res.status(400).json({ ok: false, message: 'Ese día el barbero no atiende: elige otra fecha' });
    }

    // Sin duplicados y con un tope por teléfono: la lista es pública y no
    // debe poder llenarse de entradas falsas.
    const tel = soloDigitos(telefono);
    const { rows: activas } = await db.query(
      `SELECT "barberoID", to_char(fecha, 'YYYY-MM-DD') AS fecha
       FROM lista_espera
       WHERE estado = ANY($1::text[]) AND regexp_replace(telefono, '\\D', '', 'g') = $2`,
      [ACTIVOS, tel]
    );
    if (activas.some((a) => a.barberoID === barberoId && a.fecha === fecha)) {
      return res.status(400).json({ ok: false, message: 'Ya estás en la lista de espera de ese barbero para ese día' });
    }
    if (activas.length >= MAX_ACTIVAS_POR_TELEFONO) {
      return res.status(400).json({ ok: false, message: `Puedes estar en la lista de espera de ${MAX_ACTIVAS_POR_TELEFONO} días a la vez como máximo` });
    }

    const { rows: [nueva] } = await db.query(
      `INSERT INTO lista_espera ("barberoID", "servicioID", fecha, "clienteID", nombre, telefono, hora_desde, hora_hasta, nota)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING "esperaID"`,
      [barberoId, servicioId, fecha, esCliente ? req.usuario.usuarioID : null, nombre, telefono,
       desde || null, hasta || null, texto(body.nota) || null]
    );
    const { rows } = await db.query(`${SELECT_ESPERA} WHERE e."esperaID" = $1`, [nueva.esperaID]);
    const [espera] = await conHuecos(rows);

    res.status(201).json({
      ok: true,
      message: espera.huecos.length
        ? `Te apuntamos, pero ahora mismo ya hay horas libres (${espera.huecos.slice(0, 3).join(', ')}): puedes reservar directamente.`
        : 'Te apuntamos en la lista de espera. Te avisaremos por WhatsApp si se libera una hora.',
      espera
    });
  } catch (error) {
    errorInterno(res, error, 'Crear Lista de Espera');
  }
};

// 2. Lista del administrador. Por defecto: activas y de hoy en adelante.
const obtenerEsperas = async (req, res) => {
  const filtros = [];
  const params = [];
  if (req.query.todas !== 'true') {
    params.push(ACTIVOS);
    filtros.push(`e.estado = ANY($${params.length}::text[])`);
    filtros.push('e.fecha >= CURRENT_DATE');
  }
  try {
    const { rows } = await db.query(
      `${SELECT_ESPERA} ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
       ORDER BY e.fecha, e.creado_en`,
      params
    );
    res.json({ ok: true, total: rows.length, esperas: await conHuecos(rows) });
  } catch (error) {
    errorInterno(res, error, 'Obtener Lista de Espera');
  }
};

// 3. Las del cliente con sesión.
const obtenerMisEsperas = async (req, res) => {
  try {
    const { rows } = await db.query(
      `${SELECT_ESPERA}
       WHERE e."clienteID" = $1 AND e.estado = ANY($2::text[]) AND e.fecha >= CURRENT_DATE
       ORDER BY e.fecha`,
      [req.usuario.usuarioID, ACTIVOS]
    );
    res.json({ ok: true, total: rows.length, esperas: await conHuecos(rows) });
  } catch (error) {
    errorInterno(res, error, 'Obtener Mis Esperas');
  }
};

// 4. Cambiar el estado (administrador): avisado, atendido, cancelado...
const actualizarEstadoEspera = async (req, res) => {
  const esperaId = idValido(req.params.id);
  const estado = texto(req.body?.estado);
  if (!esperaId) return res.status(400).json({ ok: false, message: 'El ID debe ser un número entero válido' });
  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ ok: false, message: `El estado debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  try {
    const { rows } = await db.query(
      `UPDATE lista_espera
       SET estado = $2,
           avisado_en = CASE WHEN $2 = 'avisado' THEN now() ELSE avisado_en END
       WHERE "esperaID" = $1
       RETURNING "esperaID"`,
      [esperaId, estado]
    );
    if (rows.length === 0) return res.status(404).json({ ok: false, message: 'No está en la lista de espera' });
    const completa = await db.query(`${SELECT_ESPERA} WHERE e."esperaID" = $1`, [esperaId]);
    const [espera] = await conHuecos(completa.rows);
    res.json({ ok: true, message: 'Lista de espera actualizada', espera });
  } catch (error) {
    errorInterno(res, error, 'Actualizar Lista de Espera');
  }
};

// 5. Salir de la lista (el propio cliente o el administrador).
const cancelarEspera = async (req, res) => {
  const esperaId = idValido(req.params.id);
  if (!esperaId) return res.status(400).json({ ok: false, message: 'El ID debe ser un número entero válido' });
  try {
    const { rows } = await db.query('SELECT "clienteID" FROM lista_espera WHERE "esperaID" = $1', [esperaId]);
    if (rows.length === 0) return res.status(404).json({ ok: false, message: 'No está en la lista de espera' });
    const esAdmin = req.usuario.rol === 'administrador';
    if (!esAdmin && rows[0].clienteID !== req.usuario.usuarioID) {
      return res.status(403).json({ ok: false, message: 'Solo puedes quitar tus propias entradas de la lista de espera' });
    }
    await db.query(`UPDATE lista_espera SET estado = 'cancelado' WHERE "esperaID" = $1`, [esperaId]);
    res.json({ ok: true, message: 'Saliste de la lista de espera', esperaID: esperaId });
  } catch (error) {
    errorInterno(res, error, 'Cancelar Lista de Espera');
  }
};

module.exports = { crearEspera, obtenerEsperas, obtenerMisEsperas, actualizarEstadoEspera, cancelarEspera };
