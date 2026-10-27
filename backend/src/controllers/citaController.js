const crypto = require('crypto');
const db = require('../config/db');
const { errorInterno } = require('../utils/respuestaError');
const { nombreDia, horaAMinutos, fechaYmd, parsearFechaHora, idValido } = require('../utils/validacion');
const { esDiaDeDescanso, mensajeDiaDeDescanso } = require('../config/calendario');
const { rutaPublica } = require('../config/subidas');
const { hayCruce, horaSigueLibre } = require('../utils/agenda');
const {
  leerMetodoPago,
  registrarPagoCita,
} = require('../utils/pagos');

// Estados permitidos (deben coincidir con el CHECK `cita_estado_check`).
//
// "denegada" la pone el administrador cuando rechaza el comprobante de un
// pago móvil: no es lo mismo que "cancelada", que es el cliente quien
// cancela su cita.
const ESTADOS_VALIDOS = ['pendiente', 'confirmada', 'completada', 'cancelada', 'denegada', 'cancelacion_solicitada'];

// Error de negocio con código HTTP, para diferenciarlo de un fallo de PostgreSQL
const errorHttp = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

/*
 * Datos de una cita tal y como los devuelve la API.
 *
 * La usan el listado y las respuestas de las acciones que la modifican, para
 * que todas devuelvan los mismos campos.
 *
 * `selectCita({ privado: false })` devuelve la versión para el **barbero**: sin
 * el teléfono del cliente ni los datos del pago. El barbero solo necesita la
 * hora, el servicio y el nombre de quien viene; el teléfono y si está pagado
 * o no no son asunto suyo, así que ni siquiera le viajan en la respuesta.
 */
const selectCita = ({ privado = true } = {}) => `
  SELECT
    c."citaID",
    c."clienteID",
    c."barberoID",
    c."servicioID",
    c.fecha_inicio,
    c.fecha_fin,
    c.estado,
    c.es_invitado,
    c.contacto_nombre,
    ${privado ? 'c.contacto_telefono' : 'NULL::text AS contacto_telefono'},
    c.codigo,
    u.nombre   AS cliente_nombre,
    u.apellido AS cliente_apellido,
    ${
      privado
        ? 'COALESCE(c.contacto_telefono, u.telefono) AS cliente_telefono'
        : 'NULL::text AS cliente_telefono'
    },
    ub.nombre  AS barbero_nombre,
    ub.apellido AS barbero_apellido,
    s.nombre   AS servicio_nombre,
    s.precio,
    s.duracion_minutos,
    ${privado ? 'c.pago_metodo' : 'NULL::text AS pago_metodo'},
    ${privado ? 'c.motivo_pago' : 'NULL::text AS motivo_pago'},
    -- La solicitud de cancelación (con reembolso). El motivo es lo que el
    -- administrador necesita para decidir.
    ${privado ? 'c.cancelacion_motivo' : 'NULL::text AS cancelacion_motivo'},
    ${privado ? 'c.cancelacion_solicitada_en' : 'NULL::timestamp AS cancelacion_solicitada_en'},
    ${privado ? 'c.cancelacion_reembolsada' : 'NULL::boolean AS cancelacion_reembolsada'},
    ${privado ? 'c.cancelacion_reembolsada_en' : 'NULL::timestamp AS cancelacion_reembolsada_en'},
    ${privado ? 'c.cancelacion_rechazada_motivo' : 'NULL::text AS cancelacion_rechazada_motivo'},
    -- El estado del pago vive en la cita (columna "pago_estado"). El
    -- COALESCE con la última transacción es la red de seguridad para las
    -- citas que ya existían antes de esa columna: así no pierden la etiqueta
    -- de "pagado" que tenían.
    ${
      privado
        ? `COALESCE(
      c.pago_estado,
      (
        SELECT t.estado
        FROM transacciones t
        WHERE t."citaID" = c."citaID"
        ORDER BY t."transaccionID" DESC
        LIMIT 1
      )
    ) AS pago_estado`
        : 'NULL::text AS pago_estado'
    }
  FROM cita c
  LEFT JOIN usuario u   ON c."clienteID"  = u."usuarioID"
  JOIN barbero b   ON c."barberoID"  = b."barberoID"
  JOIN usuario ub  ON b."usuarioID"  = ub."usuarioID"
  JOIN servicios s ON c."servicioID" = s."serviciosID"
`;

// La versión completa, la que usan casi todas las consultas.
const SELECT_CITA = selectCita();


/*
 * Código de gestión de una cita de invitado.
 *
 * Es lo único que el cliente puede presentar para ver o cancelar su cita sin
 * tener cuenta, así que no puede ser corto ni predecible: son 12 bytes
 * aleatorios en hexadecimal (24 caracteres).
 */
const generarCodigo = () => crypto.randomBytes(12).toString('hex');

/*
 * Valida el teléfono de un invitado: al menos 7 dígitos, contando solo los
 * que son números (un teléfono puede venir con espacios, guiones o el prefijo
 * del país).
 */
const telefonoValido = (telefono) => String(telefono || '').replace(/\D/g, '').length >= 7;

// 1. Obtener las citas
//
// La lista se acota según el rol de quien pregunta, porque cada rol ve una
// agenda distinta:
//
//   - **administrador**: todas las citas de la peluquería.
//   - **barbero**: solo las citas de su propia agenda.
//   - **cliente**: solo sus propias citas.
//
// Sin este filtro, un cliente autenticado recibía la agenda completa con el
// nombre y el teléfono de todos los demás clientes. La web ("Mis citas")
// asume que el backend ya hace este recorte: si no, se ve la cita ajena.
const obtenerCitas = async (req, res) => {
  try {
    const rol = req.usuario?.rol;
    const usuarioId = req.usuario?.usuarioID;

    // Los filtros van al final de la consulta y los marcadores de posición se
    // numeran a partir de $1, así que se numeran en el mismo orden en que se
    // añaden.
    let filtro = '';
    const params = [];

    if (rol === 'cliente') {
      params.push(usuarioId);
      filtro = `WHERE c."clienteID" = $1`;
    } else if (rol === 'barbero') {
      params.push(usuarioId);
      filtro = `WHERE b."usuarioID" = $1`;
    }

    // El barbero recibe la agenda sin los datos personales del cliente (su
    // teléfono) ni los del pago: le bastan la hora, el servicio y el nombre.
    const consulta = rol === 'barbero' ? selectCita({ privado: false }) : SELECT_CITA;

    const resultado = await db.query(
      `${consulta} ${filtro} ORDER BY c.fecha_inicio DESC;`,
      params
    );

    res.json({
      ok: true,
      total: resultado.rows.length,
      citas: resultado.rows
    });
  } catch (error) {
    errorInterno(res, error, 'Obtener Citas');
  }
};

/*
 * 2. Horas ocupadas de un barbero (público)
 *
 * La web las necesita antes de que el cliente haya iniciado sesión, para no
 * ofrecer unas horas que el servidor va a rechazar. Por eso es público: solo
 * devuelve el intervalo ocupado, sin datos del cliente.
 *
 * Parámetros: `barberoID` (obligatorio), `desde`, `hasta` (fechas YYYY-MM-DD)
 * y `excluir` (el id de una cita que se está reprogramando, que no debe
 * bloquearse a sí misma).
 */
const obtenerOcupados = async (req, res) => {
  const barberoId = idValido(req.query.barberoID);

  if (!barberoId) {
    return res.status(400).json({
      ok: false,
      message: 'El ID del barbero debe ser un número entero válido'
    });
  }

  // Las fechas tienen que venir como YYYY-MM-DD: con cualquier otro texto,
  // PostgreSQL fallaba al convertirlas y la respuesta era un 500.
  const esFecha = (valor) => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
  for (const campo of ['desde', 'hasta']) {
    if (req.query[campo] !== undefined && !esFecha(req.query[campo])) {
      return res.status(400).json({
        ok: false,
        message: `${campo} debe ser una fecha con el formato AAAA-MM-DD`
      });
    }
  }

  const params = [barberoId];
  const filtros = ['c."barberoID" = $1'];

  // El rango se filtra por fecha_inicio: una cita que empieza antes del "desde"
  // pero que se solapa con él también ocupa ese día.
  if (req.query.desde) {
    params.push(`${req.query.desde} 00:00:00`);
    filtros.push(`c.fecha_inicio >= $${params.length}`);
  }
  if (req.query.hasta) {
    params.push(`${req.query.hasta} 23:59:59`);
    filtros.push(`c.fecha_inicio <= $${params.length}`);
  }

  const excluirId = idValido(req.query.excluir);
  if (excluirId) {
    params.push(excluirId);
    filtros.push(`c."citaID" <> $${params.length}`);
  }

  try {
    const resultado = await db.query(
      `SELECT c."citaID", c.fecha_inicio, c.fecha_fin, c.estado
       FROM cita c
       WHERE ${filtros.join(' AND ')}
       ORDER BY c.fecha_inicio ASC;`,
      params
    );

    res.json({
      ok: true,
      total: resultado.rows.length,
      ocupados: resultado.rows
    });
  } catch (error) {
    errorInterno(res, error, 'Obtener Citas Ocupadas');
  }
};

/*
 * 3. Comprobaciones de una reserva.
 *
 * Es el corazón del módulo: lo usan la cita con cuenta, la cita de invitado y
 * la reprogramación. Todas tienen que pasar exactamente las mismas
 * comprobaciones (día de descanso, feriado, horario laboral y solapamiento),
 * así que viven aquí y no duplicadas en tres sitios.
 *
 * Se ejecuta dentro de una transacción: la comprobación y el INSERT tienen que
 * ser atómicos, o dos reservas simultáneas para la misma hora podrían
 * colarse.
 *
 * Esta función NO escribe nada: solo comprueba. La escritura va en
 * `agendarCita` (reservar) o en el UPDATE de `reprogramarCita` (mover una
 * cita que ya existe). Si esta función insertara, al reprogramar se crearía
 * una cita nueva sin quitar la vieja.
 *
 * @param {import('pg').PoolClient} client  Conexión de la transacción.
 * @param {object} datos
 * @returns {Promise<{fechaFin: Date, duracionMinutos: number}>}
 */
const validarCita = async (client, {
  barberoId,
  servicioId,
  fechaInicio,
  excluirCitaId = null,
  permitirPasado = false,
}) => {
  // 0. No se reserva en el pasado. Antes se aceptaba cualquier fecha (incluso
  //    2020), y esas citas inflaban la agenda y las estadísticas. El
  //    administrador sí puede apuntar una cita ya pasada (un cliente que llegó
  //    sin reserva y ya fue atendido).
  if (!permitirPasado && fechaInicio.getTime() < Date.now()) {
    throw errorHttp(400, 'No se puede reservar una hora que ya pasó');
  }

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
    'SELECT "serviciosID", duracion_minutos, precio FROM servicios WHERE "serviciosID" = $1',
    [servicioId]
  );
  if (servicioRes.rows.length === 0) {
    throw errorHttp(404, 'Servicio no encontrado');
  }
  const { duracion_minutos: duracionMinutos, precio } = servicioRes.rows[0];

  // B2. El barbero tiene que ofrecer ese servicio. La web solo muestra los
  //     barberos que lo ofrecen, pero el servidor no lo comprobaba. Si un
  //     barbero aún no tiene ningún servicio asignado se le deja reservar
  //     cualquiera, para no bloquear las agendas que todavía no lo configuran.
  const ofertaRes = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE "servicioID" = $2)::int AS ofrece
     FROM barbero_servicio
     WHERE "barberoID" = $1`,
    [barberoId, servicioId]
  );
  if (ofertaRes.rows[0].total > 0 && ofertaRes.rows[0].ofrece === 0) {
    throw errorHttp(400, 'Este barbero no ofrece ese servicio');
  }
  const fechaFin = new Date(fechaInicio.getTime() + duracionMinutos * 60 * 1000);

  // C. Días en los que la peluquería no abre.
  //
  // El día de descanso se deduce del día de la semana; los feriados
  // vienen de la tabla `feriado`.
  //
  // Va antes que la comprobación del horario laboral a propósito: si el
  // barbero no tiene horario un domingo, el mensaje que sale debe decir
  // que es día de descanso, no que a ese barbero le falta el horario.
  //
  // Se comprueba aquí y no solo en la web: es el servidor el que dice que
  // no, porque el navegador se puede saltarse.
  if (esDiaDeDescanso(fechaInicio)) {
    throw errorHttp(400, mensajeDiaDeDescanso(fechaInicio));
  }

  const feriadoRes = await client.query(
    'SELECT nombre FROM feriado WHERE fecha = $1',
    [fechaYmd(fechaInicio)]
  );
  if (feriadoRes.rows.length > 0) {
    throw errorHttp(400, `No se puede reservar: ${feriadoRes.rows[0].nombre}.`);
  }

  // C2. Permisos del barbero (vacaciones, permiso médico...): ese barbero no
  //     atiende ningún día del permiso, aunque la peluquería esté abierta.
  const ausenciaRes = await client.query(
    `SELECT to_char(fecha_inicio, 'DD/MM') AS desde, to_char(fecha_fin, 'DD/MM') AS hasta
     FROM ausencia_barbero
     WHERE "barberoID" = $1 AND $2::date BETWEEN fecha_inicio AND fecha_fin
     LIMIT 1`,
    [barberoId, fechaYmd(fechaInicio)]
  );
  if (ausenciaRes.rows.length > 0) {
    const { desde, hasta } = ausenciaRes.rows[0];
    throw errorHttp(
      400,
      desde === hasta
        ? `El barbero no atiende ese día (permiso el ${desde}).`
        : `El barbero no atiende esos días (permiso del ${desde} al ${hasta}).`
    );
  }

  // D. La cita debe caer dentro del horario laboral configurado para ese día.
  const dia = nombreDia(fechaInicio);
  const horarioRes = await client.query(
    `SELECT hora_inicio, hora_fin, almuerzo_inicio, almuerzo_fin
     FROM horario_laboral
     WHERE "barberoID" = $1 AND dia_semana = $2`,
    [barberoId, dia]
  );
  if (horarioRes.rows.length === 0) {
    throw errorHttp(400, `El barbero no tiene horario configurado para el ${dia}`);
  }

  const { hora_inicio: horaInicio, hora_fin: horaFin } = horarioRes.rows[0];

  // Un servicio que termina de madrugada no se puede validar contra una franja
  // horaria del mismo día, así que se rechaza explícitamente.
  if (fechaFin.toDateString() !== fechaInicio.toDateString()) {
    throw errorHttp(400, 'La cita no puede cruzar la medianoche');
  }

  const citaInicioMin = fechaInicio.getHours() * 60 + fechaInicio.getMinutes();
  const citaFinMin = fechaFin.getHours() * 60 + fechaFin.getMinutes();

  if (citaInicioMin < horaAMinutos(horaInicio) || citaFinMin > horaAMinutos(horaFin)) {
    throw errorHttp(400, `La cita está fuera del horario laboral del barbero (${horaInicio} - ${horaFin})`);
  }

  // D2. Hora de almuerzo: la cita no puede pisarla, ni empezando dentro ni
  //     terminando dentro ni abarcándola entera.
  const { almuerzo_inicio: almuerzoInicio, almuerzo_fin: almuerzoFin } = horarioRes.rows[0];
  if (
    almuerzoInicio && almuerzoFin &&
    citaInicioMin < horaAMinutos(almuerzoFin) &&
    citaFinMin > horaAMinutos(almuerzoInicio)
  ) {
    throw errorHttp(
      400,
      `La cita se cruza con la hora de almuerzo del barbero (${String(almuerzoInicio).slice(0, 5)} - ${String(almuerzoFin).slice(0, 5)})`
    );
  }

  // E. Solapamiento: el intervalo [fecha_inicio, fecha_fin) de la nueva cita
  //    contra las citas existentes del mismo barbero. Al reprogramar, la cita
  //    que se mueve no se bloquea a sí misma. Los estados que liberan la hora
  //    están en utils/agenda.js (la web usa la misma lista).
  if (await hayCruce(client, { barberoId, inicio: fechaInicio, fin: fechaFin, excluirCitaId })) {
    throw errorHttp(400, 'El barbero ya tiene una cita que se cruza con ese horario');
  }

  return { fechaFin, duracionMinutos, precio };
};

/*
 * 4. Comprobaciones + INSERT de una reserva nueva.
 *
 * Es la versión que escribe: primero pasa todas las comprobaciones de
 * `validarCita` y, si todas pasan, guarda la cita.
 *
 * @param {import('pg').PoolClient} client  Conexión de la transacción.
 * @param {object} datos
 * @returns {Promise<object>} La cita guardada.
 */
const agendarCita = async (client, {
  clienteId = null,
  barberoId,
  servicioId,
  fechaInicio,
  esInvitado = false,
  nombreInvitado = null,
  telefonoInvitado = null,
  codigo = null,
  excluirCitaId = null,
  pagoMetodo = null,
  pagoEstado = null,
  permitirPasado = false,
}) => {
  const { fechaFin } = await validarCita(client, {
    barberoId,
    servicioId,
    fechaInicio,
    excluirCitaId,
    permitirPasado,
  });

  // F. Insertar la nueva cita
  const insercion = await client.query(
    `INSERT INTO cita ("clienteID", "barberoID", "servicioID", fecha_inicio, fecha_fin, estado, es_invitado, contacto_nombre, contacto_telefono, codigo, pago_metodo, pago_estado)
     VALUES ($1, $2, $3, $4, $5, 'pendiente', $6, $7, $8, $9, $10, $11)
     RETURNING "citaID", "clienteID", "barberoID", "servicioID", fecha_inicio, fecha_fin, estado, es_invitado, contacto_nombre, contacto_telefono, codigo, pago_metodo, pago_estado;`,
    [
      esInvitado ? null : clienteId,
      barberoId,
      servicioId,
      fechaInicio,
      fechaFin,
      esInvitado,
      esInvitado ? nombreInvitado : null,
      esInvitado ? telefonoInvitado : null,
      codigo,
      pagoMetodo,
      pagoEstado,
    ]
  );

  // Si esa persona estaba en la lista de espera de este barbero para ese día,
  // ya consiguió su cita: su entrada sale de la lista.
  await client.query(
    `UPDATE lista_espera
     SET estado = 'atendido'
     WHERE "barberoID" = $1
       AND fecha = $2::date
       AND estado IN ('esperando', 'avisado')
       AND (
         ($3::int IS NOT NULL AND "clienteID" = $3)
         OR ($4::text <> '' AND regexp_replace(telefono, '\\D', '', 'g') = $4)
       )`,
    [
      barberoId,
      fechaYmd(fechaInicio),
      esInvitado ? null : clienteId,
      String(telefonoInvitado || '').replace(/\D/g, ''),
    ]
  );

  return insercion.rows[0];
};

/*
 * Datos del pago que llegan al reservar.
 *
 * El cliente elige la forma de pago antes de confirmar:
 *
 *   - **pago móvil**: sube un comprobante (una imagen) y una referencia. La
 *     cita queda esperando que el administrador lo apruebe.
 *   - **efectivo o tarjeta**: la cita se reserva normal y el pago queda
 *     pendiente de hacerse en el local.
 *
 * Devuelve un error de negocio (con su mensaje) si lo que llega no sirve, y
 * `null` si la petición no trae pago (el panel del administrador agenda citas
 * sin método de pago).
 */
const leerPagoDeReserva = (req) => {
  const { metodo, error } = leerMetodoPago(req.body?.pago_metodo);

  if (error) return { error };

  if (!metodo) return { pago: null };

  const referencia =
    typeof req.body?.referencia_pago === 'string' ? req.body.referencia_pago.trim() : '';

  const comprobante = req.file ? rutaPublica(req.file.filename) : null;

  if (metodo === 'pago_movil') {
    if (!comprobante) {
      return {
        error: 'El pago móvil necesita el comprobante: sube una imagen del pago',
      };
    }
    if (!referencia) {
      return { error: 'El pago móvil necesita una referencia de pago' };
    }
  }

  return {
    pago: {
      metodo,
      referencia,
      comprobante,
      // Con pago móvil el comprobante queda pendiente de revisión; con
      // efectivo o tarjeta, el pago queda pendiente de hacerse en el local.
      estado: 'pendiente',
    },
  };
};

/*
 * 4. Crear una nueva cita con validación de solapamiento de horarios
 *
 * La cita puede ser de un cliente registrado (`clienteID`) o de un invitado
 * (`contacto_nombre` + `contacto_telefono`): gente que llega al local sin
 * cuenta. El panel de administración agenda las dos.
 */
const crearCita = async (req, res) => {
  const {
    clienteID,
    barberoID,
    servicioID,
    fecha_hora,
    contacto_nombre,
    contacto_telefono,
  } = req.body || {};

  const barberoId = idValido(barberoID);
  const servicioId = idValido(servicioID);
  const clienteId = clienteID === undefined || clienteID === null || clienteID === ''
    ? null
    : idValido(clienteID);
  const fechaInicio = fecha_hora ? parsearFechaHora(fecha_hora) : null;

  const nombreInvitado = typeof contacto_nombre === 'string' ? contacto_nombre.trim() : '';
  const telefonoInvitado = typeof contacto_telefono === 'string' ? contacto_telefono.trim() : '';
  const esInvitado = !clienteId;

  if (
    !Number.isInteger(barberoId) ||
    !Number.isInteger(servicioId) ||
    !fechaInicio || Number.isNaN(fechaInicio.getTime())
  ) {
    return res.status(400).json({
      ok: false,
      message: 'barberoID, servicioID y una fecha_hora válida son obligatorios'
    });
  }

  if (esInvitado) {
    if (!nombreInvitado || !telefonoValido(telefonoInvitado)) {
      return res.status(400).json({
        ok: false,
        message: 'Un invitado necesita nombre y un teléfono de al menos 7 dígitos'
      });
    }
  } else if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'clienteID debe ser un número entero válido'
    });
  }

  // Una cita solo se agenda en nombre propio salvo que quien llama sea el
  // administrador (el panel agenda citas para clientes que llegan por
  // teléfono). Sin esta comprobación, un cliente podía agendar citas en la
  // cuenta de otro.
  const rol = req.usuario?.rol;
  const usuarioId = req.usuario?.usuarioID;
  if (rol !== 'administrador' && !esInvitado && clienteId !== usuarioId) {
    return res.status(403).json({
      ok: false,
      message: 'Solo puedes agendar citas en tu nombre'
    });
  }

  // La cuenta del administrador es de trabajo, no de cliente: no agenda citas
  // para sí mismo. Para eso está la reserva manual del panel, que es donde el
  // administrador agenda citas para los demás.
  if (rol === 'administrador' && !esInvitado && clienteId === usuarioId) {
    return res.status(403).json({
      ok: false,
      message: 'El administrador no puede agendar citas en su propia cuenta. Usa la reserva manual del panel para agendar a un cliente.'
    });
  }

  // El pago elegido al reservar (pago móvil con comprobante o efectivo/tarjeta
  // pendiente de cobrar en el local).
  const { pago, error: errorPago } = leerPagoDeReserva(req);
  if (errorPago) {
    return res.status(400).json({ ok: false, message: errorPago });
  }

  try {
    const cita = await db.withTransaction(async (client) => {
      const guardada = await agendarCita(client, {
        clienteId: esInvitado ? null : clienteId,
        barberoId,
        servicioId,
        fechaInicio,
        esInvitado,
        nombreInvitado: nombreInvitado || null,
        telefonoInvitado: telefonoInvitado || null,
        pagoMetodo: pago ? pago.metodo : null,
        pagoEstado: pago ? pago.estado : null,
        permitirPasado: rol === 'administrador',
      });

      // Con pago móvil, el comprobante se guarda como pago de la cita: queda
      // pendiente hasta que el administrador lo apruebe o lo rechace.
      if (pago && pago.metodo === 'pago_movil') {
        const { rows: servicios } = await client.query(
          'SELECT precio FROM servicios WHERE "serviciosID" = $1',
          [servicioId]
        );

        await registrarPagoCita(client, {
          citaId: guardada.citaID,
          clienteId: esInvitado ? null : clienteId,
          metodo: pago.metodo,
          estado: 'pendiente',
          monto: Number(servicios[0].precio),
          referencia: pago.referencia,
          comprobante: pago.comprobante,
        });
      }

      // Se devuelve la cita con los nombres unidos, igual que el listado.
      const completa = await client.query(`${SELECT_CITA} WHERE c."citaID" = $1`, [guardada.citaID]);
      return completa.rows[0];
    });

    res.status(201).json({
      ok: true,
      message: 'Cita agendada exitosamente',
      cita
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ ok: false, message: error.message });
    }
    if (error.code === '23503') {
      return res.status(400).json({ ok: false, message: 'El cliente indicado no existe' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ ok: false, message: 'Estado de cita no válido' });
    }
    errorInterno(res, error, 'Crear Cita');
  }
};

/*
 * 5. Reserva sin cuenta (público)
 *
 * Es el camino de quien reserva por la web sin registrarse: se guarda la cita
 * como invitada y se devuelve un código con el que puede verla y cancelarla
 * (la página /cita/<codigo>). Sin ese código no habría forma de gestionarla:
 * no hay sesión con la que entrar.
 */
const crearCitaPublica = async (req, res) => {
  const {
    barberoID,
    servicioID,
    fecha_hora,
    nombre,
    apellido,
    telefono,
  } = req.body || {};

  const barberoId = idValido(barberoID);
  const servicioId = idValido(servicioID);
  const fechaInicio = fecha_hora ? parsearFechaHora(fecha_hora) : null;

  const nombreInvitado = [nombre, apellido]
    .filter((parte) => typeof parte === 'string' && parte.trim())
    .join(' ')
    .trim();
  const telefonoInvitado = typeof telefono === 'string' ? telefono.trim() : '';

  if (
    !Number.isInteger(barberoId) ||
    !Number.isInteger(servicioId) ||
    !fechaInicio || Number.isNaN(fechaInicio.getTime())
  ) {
    return res.status(400).json({
      ok: false,
      message: 'barberoID, servicioID y una fecha_hora válida son obligatorios'
    });
  }

  if (!nombreInvitado) {
    return res.status(400).json({
      ok: false,
      message: 'El nombre es obligatorio'
    });
  }

  if (!telefonoValido(telefonoInvitado)) {
    return res.status(400).json({
      ok: false,
      message: 'El teléfono debe tener al menos 7 dígitos'
    });
  }

  // El pago elegido al reservar. Un invitado también puede pagar por pago
  // móvil: sube el comprobante y el administrador lo revisa.
  const { pago, error: errorPago } = leerPagoDeReserva(req);
  if (errorPago) {
    return res.status(400).json({ ok: false, message: errorPago });
  }

  try {
    const codigo = generarCodigo();

    const cita = await db.withTransaction(async (client) => {
      const guardada = await agendarCita(client, {
        barberoId,
        servicioId,
        fechaInicio,
        esInvitado: true,
        nombreInvitado,
        telefonoInvitado,
        codigo,
        pagoMetodo: pago ? pago.metodo : null,
        pagoEstado: pago ? pago.estado : null,
      });

      if (pago && pago.metodo === 'pago_movil') {
        const { rows: servicios } = await client.query(
          'SELECT precio FROM servicios WHERE "serviciosID" = $1',
          [servicioId]
        );

        await registrarPagoCita(client, {
          citaId: guardada.citaID,
          clienteId: null,
          metodo: pago.metodo,
          estado: 'pendiente',
          monto: Number(servicios[0].precio),
          referencia: pago.referencia,
          comprobante: pago.comprobante,
        });
      }

      const completa = await client.query(`${SELECT_CITA} WHERE c."citaID" = $1`, [guardada.citaID]);
      return completa.rows[0];
    });

    res.status(201).json({
      ok: true,
      message: 'Cita agendada exitosamente',
      cita,
      // El código es la única forma de volver a esta cita sin cuenta.
      codigo: cita.codigo
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ ok: false, message: error.message });
    }
    if (error.code === '23505') {
      // Choca con el índice único de códigos (prácticamente imposible).
      return res.status(400).json({ ok: false, message: 'No se pudo generar el código de la cita' });
    }
    errorInterno(res, error, 'Crear Cita Publica');
  }
};

/*
 * 6. Ver una cita por su código (público)
 *
 * Es la página /cita/<codigo>: el cliente que reservó sin cuenta entra con el
 * enlace que recibió y ve los datos de su cita.
 */
const obtenerCitaPublica = async (req, res) => {
  const { codigo } = req.params;
  const codigoLimpio = typeof codigo === 'string' ? codigo.trim() : '';

  if (!codigoLimpio) {
    return res.status(400).json({
      ok: false,
      message: 'Falta el código de la cita'
    });
  }

  try {
    const resultado = await db.query(`${SELECT_CITA} WHERE c.codigo = $1`, [codigoLimpio]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'No hay ninguna cita con ese código' });
    }

    res.json({
      ok: true,
      cita: resultado.rows[0]
    });
  } catch (error) {
    errorInterno(res, error, 'Obtener Cita Publica');
  }
};

/*
 * 7. Cancelar una cita por su código (público)
 *
 * Solo se puede cancelar una cita que siga en pie (pendiente o confirmada):
 * una cita completada ya no se toca.
 */
const cancelarCitaPublica = async (req, res) => {
  const { codigo } = req.params;
  const codigoLimpio = typeof codigo === 'string' ? codigo.trim() : '';

  if (!codigoLimpio) {
    return res.status(400).json({
      ok: false,
      message: 'Falta el código de la cita'
    });
  }

  try {
    const resultado = await db.withTransaction(async (client) => {
      const actual = await client.query(
        'SELECT "citaID", estado, pago_estado FROM cita WHERE codigo = $1 FOR UPDATE',
        [codigoLimpio]
      );

      if (actual.rows.length === 0) {
        throw errorHttp(404, 'No hay ninguna cita con ese código');
      }

      const { citaID, estado, pago_estado: pagoEstado } = actual.rows[0];

      if (!['pendiente', 'confirmada'].includes(estado)) {
        throw errorHttp(400, 'Esta cita ya no se puede cancelar');
      }

      // Una cita ya pagada no se cancela en seco: igual que con cuenta, pasa
      // a "cancelación solicitada" y el administrador confirma el reembolso.
      // Antes quedaba cancelada con el pago "completado" y nadie se enteraba
      // de que había que devolver el dinero.
      const pagada = pagoEstado === 'completado';
      if (pagada) {
        await client.query(
          `UPDATE cita
           SET estado = 'cancelacion_solicitada',
               cancelacion_motivo = COALESCE($2, 'Cancelada por el cliente desde el enlace de su cita'),
               cancelacion_solicitada_en = NOW(),
               cancelacion_reembolsada = false,
               cancelacion_rechazada_motivo = NULL
           WHERE "citaID" = $1`,
          [citaID, typeof req.body?.motivo === 'string' && req.body.motivo.trim() ? req.body.motivo.trim() : null]
        );
      } else {
        await client.query(`UPDATE cita SET estado = 'cancelada' WHERE "citaID" = $1`, [citaID]);
      }

      const completa = await client.query(`${SELECT_CITA} WHERE c."citaID" = $1`, [citaID]);
      return { cita: completa.rows[0], pagada };
    });

    res.json({
      ok: true,
      message: resultado.pagada
        ? 'Solicitud de cancelación enviada. El administrador confirmará el reembolso.'
        : 'Cita cancelada exitosamente',
      cita: resultado.cita
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ ok: false, message: error.message });
    }
    errorInterno(res, error, 'Cancelar Cita Publica');
  }
};

/*
 * 8. Reprogramar una cita (cambiarle la fecha y la hora)
 *
 * La web ofrece "Reprogramar" al cliente (desde "Mis citas") y al
 * administrador. El barbero solo consulta su agenda. Pasa por las mismas
 * comprobaciones que una reserva nueva: la nueva hora tiene que estar dentro
 * del horario laboral, no puede ser un día de descanso ni un feriado, y no
 * puede cruzarse con otra cita.
 */
const reprogramarCita = async (req, res) => {
  const citaId = idValido(req.params.id);
  const { fecha_hora } = req.body || {};

  if (!citaId) {
    return res.status(400).json({
      ok: false,
      message: 'El ID de la cita debe ser un número entero válido'
    });
  }

  const fechaInicio = fecha_hora ? parsearFechaHora(fecha_hora) : null;

  if (!fechaInicio || Number.isNaN(fechaInicio.getTime())) {
    return res.status(400).json({
      ok: false,
      message: 'Una fecha_hora válida es obligatoria'
    });
  }

  const rol = req.usuario?.rol;
  const usuarioId = req.usuario?.usuarioID;

  try {
    const actual = await db.query(
      `SELECT c."citaID", c."clienteID", c."barberoID", c."servicioID", c.estado
       FROM cita c
       WHERE c."citaID" = $1`,
      [citaId]
    );

    if (actual.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Cita no encontrada' });
    }

    const cita = actual.rows[0];

    if (['cancelada', 'denegada', 'completada', 'cancelacion_solicitada'].includes(cita.estado)) {
      return res.status(400).json({
        ok: false,
        message: 'Esta cita ya no se puede reprogramar'
      });
    }

    // Solo se reprograma la cita de uno mismo (o cualquiera, si es el
    // administrador). El barbero solo consulta su agenda, no la modifica.
    const esDueña = cita.clienteID !== null && cita.clienteID === usuarioId;

    if (rol !== 'administrador' && !esDueña) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permisos para reprogramar esta cita'
      });
    }

    await db.withTransaction(async (client) => {
      // Se comprueba la nueva hora con las mismas reglas que una reserva
      // (descanso, feriado, horario laboral y solapamiento), excluyendo la
      // propia cita para que no se bloquee a sí misma.
      //
      // OJO: aquí solo se valida. La escritura es el UPDATE de abajo: si se
      // usara `agendarCita`, se crearía una cita nueva y la vieja se quedaría
      // en su sitio.
      const { fechaFin } = await validarCita(client, {
        barberoId: cita.barberoID,
        servicioId: cita.servicioID,
        fechaInicio,
        excluirCitaId: citaId,
        permitirPasado: rol === 'administrador',
      });

      await client.query(
        'UPDATE cita SET fecha_inicio = $1, fecha_fin = $2 WHERE "citaID" = $3',
        [fechaInicio, fechaFin, citaId]
      );
    });

    const completa = await db.query(`${SELECT_CITA} WHERE c."citaID" = $1`, [citaId]);

    res.json({
      ok: true,
      message: 'Cita reprogramada exitosamente',
      cita: completa.rows[0]
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ ok: false, message: error.message });
    }
    errorInterno(res, error, 'Reprogramar Cita');
  }
};

// 9. Actualizar estado de la cita (ej. completada, cancelada)
//
// Los permisos se comprueban aquí y no solo en la ruta, porque no todos los
// roles tienen los mismos derechos:
//
//   - **administrador**: cualquier estado, en cualquier cita.
//   - **barbero**: solo consulta su agenda; no puede cambiar estados.
//   - **cliente**: solo puede **cancelar** una cita suya. La web le muestra el
//     botón "Cancelar" en "Mis citas" (components/ListaCitas.jsx), así que sin
//     esta excepción ese botón siempre fallaría con un 403.
//
//   Cualquier otro cambio de estado hecho por un cliente es un 403.
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

  const rol = req.usuario?.rol;
  const usuarioId = req.usuario?.usuarioID;

  try {
    const actual = await db.query(
      `SELECT c."citaID", c."clienteID", c.estado, c.pago_estado
       FROM cita c
       WHERE c."citaID" = $1`,
      [citaId]
    );

    if (actual.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Cita no encontrada' });
    }

    const { clienteID, estado: estadoActual, pago_estado: pagoEstado } = actual.rows[0];

    if (rol === 'cliente') {
      if (estado !== 'cancelada') {
        return res.status(403).json({
          ok: false,
          message: 'No tienes permisos para realizar esta acción.'
        });
      }
      if (clienteID !== usuarioId) {
        return res.status(403).json({
          ok: false,
          message: 'Solo puedes cancelar tus propias citas'
        });
      }
      // Solo se cancela una cita que sigue en pie: antes un cliente podía
      // pasar a "cancelada" una cita ya completada.
      if (!['pendiente', 'confirmada'].includes(estadoActual)) {
        return res.status(400).json({
          ok: false,
          message: 'Esta cita ya no se puede cancelar'
        });
      }
      // Con el pago hecho, la cancelación pasa por el reembolso.
      if (pagoEstado === 'completado') {
        return res.status(400).json({
          ok: false,
          message: 'Esta cita ya está pagada: solicita la cancelación para que el administrador gestione el reembolso'
        });
      }
    } else if (rol === 'barbero') {
      return res.status(403).json({
        ok: false,
        message: 'El barbero solo puede consultar su agenda'
      });
    }

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
    errorInterno(res, error, 'Actualizar Estado Cita');
  }
};

// 9b. Solicitar cancelación de cita (cliente o admin)
// El espacio queda libre inmediatamente; se envía solicitud de reembolso al admin.
const solicitarCancelacionCita = async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body || {};

  const citaId = Number(id);
  if (!Number.isInteger(citaId) || citaId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'El ID de la cita debe ser un número entero válido',
    });
  }

  const rol = req.usuario?.rol;
  const usuarioId = req.usuario?.usuarioID;

  try {
    const actual = await db.query(
      `SELECT c."citaID", c."clienteID", c.estado
       FROM cita c
       WHERE c."citaID" = $1`,
      [citaId],
    );

    if (actual.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Cita no encontrada' });
    }

    const cita = actual.rows[0];

    if (cita.estado === 'cancelacion_solicitada') {
      return res.status(400).json({ ok: false, message: 'Ya hay una solicitud de cancelación pendiente' });
    }

    if (['cancelada', 'completada', 'denegada'].includes(cita.estado)) {
      return res.status(400).json({ ok: false, message: 'Esta cita no se puede cancelar' });
    }

    if (rol === 'cliente') {
      if (cita.clienteID !== usuarioId) {
        return res.status(403).json({ ok: false, message: 'Solo puedes cancelar tus propias citas' });
      }
    } else if (rol === 'barbero') {
      return res.status(403).json({ ok: false, message: 'El barbero solo puede consultar su agenda' });
    }

    const motivoTexto = typeof motivo === 'string' ? motivo.trim() : null;
    await db.query(
      `UPDATE cita
       SET estado = 'cancelacion_solicitada',
           cancelacion_motivo = $2,
           cancelacion_solicitada_en = NOW(),
           cancelacion_reembolsada = false,
           cancelacion_rechazada_motivo = NULL
       WHERE "citaID" = $1`,
      [citaId, motivoTexto],
    );

    const completa = await db.query(`${SELECT_CITA} WHERE c."citaID" = $1`, [citaId]);
    res.json({
      ok: true,
      message: 'Solicitud de cancelación enviada. El administrador debe confirmar el reembolso para cancelar la cita.',
      cita: completa.rows[0],
    });
  } catch (error) {
    errorInterno(res, error, 'Solicitar Cancelacion Cita');
  }
};

// 9c. Confirmar reembolso (solo administrador) -> cancela la cita
const confirmarReembolsoCita = async (req, res) => {
  const { id } = req.params;
  const citaId = Number(id);

  if (!Number.isInteger(citaId) || citaId <= 0) {
    return res.status(400).json({ ok: false, message: 'El ID de la cita debe ser un número entero válido' });
  }

  try {
    const actual = await db.query('SELECT "citaID", estado FROM cita WHERE "citaID" = $1', [citaId]);
    if (actual.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Cita no encontrada' });
    }
    if (actual.rows[0].estado !== 'cancelacion_solicitada') {
      return res.status(400).json({ ok: false, message: 'Esta cita no tiene una solicitud de cancelación pendiente' });
    }

    await db.query(
      `UPDATE cita
       SET estado = 'cancelada',
           cancelacion_reembolsada = true,
           cancelacion_reembolsada_en = NOW()
       WHERE "citaID" = $1`,
      [citaId],
    );

    const completa = await db.query(`${SELECT_CITA} WHERE c."citaID" = $1`, [citaId]);
    res.json({
      ok: true,
      message: 'Reembolso confirmado. La cita ha sido cancelada.',
      cita: completa.rows[0],
    });
  } catch (error) {
    errorInterno(res, error, 'Confirmar Reembolso Cita');
  }
};

// 9d. Rechazar solicitud de cancelación (solo administrador) -> vuelve al estado anterior
const rechazarCancelacionCita = async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body || {};
  const citaId = Number(id);

  if (!Number.isInteger(citaId) || citaId <= 0) {
    return res.status(400).json({ ok: false, message: 'El ID de la cita debe ser un número entero válido' });
  }

  try {
    const actual = await db.query('SELECT "citaID", estado FROM cita WHERE "citaID" = $1', [citaId]);
    if (actual.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Cita no encontrada' });
    }
    if (actual.rows[0].estado !== 'cancelacion_solicitada') {
      return res.status(400).json({ ok: false, message: 'Esta cita no tiene una solicitud de cancelación pendiente' });
    }

    const motivoTexto = typeof motivo === 'string' ? motivo.trim() : null;

    // Mientras la cancelación estaba pedida, la hora quedó libre y otra persona
    // pudo reservarla. Devolver la cita a la agenda sin mirarlo dejaba dos
    // citas a la misma hora con el mismo barbero.
    const libre = await db.withTransaction(async (client) => {
      if (!(await horaSigueLibre(client, citaId))) return false;
      await client.query(
        `UPDATE cita
         SET estado = 'pendiente',
             cancelacion_rechazada_motivo = $2
         WHERE "citaID" = $1`,
        [citaId, motivoTexto],
      );
      return true;
    });

    if (!libre) {
      return res.status(409).json({
        ok: false,
        message: 'La hora de esta cita ya la tomó otra reserva: no se puede devolver a la agenda. Confirma el reembolso para cancelarla y acuerda otra hora con el cliente.',
      });
    }

    const completa = await db.query(`${SELECT_CITA} WHERE c."citaID" = $1`, [citaId]);
    res.json({
      ok: true,
      message: 'Solicitud de cancelación rechazada.',
      cita: completa.rows[0],
    });
  } catch (error) {
    errorInterno(res, error, 'Rechazar Cancelacion Cita');
  }
};

/*
 * 10. Eliminar una cita
 *
 * Es una acción de administración: borra la cita de la agenda (y su pago, que
 * se va en cascada). Se usa para limpiar citas de prueba o citas que se
 * agendaron dos veces.
 */
const eliminarCita = async (req, res) => {
  const citaId = idValido(req.params.id);

  if (!citaId) {
    return res.status(400).json({
      ok: false,
      message: 'El ID de la cita debe ser un número entero válido',
    });
  }

  try {
    const resultado = await db.query(
      'DELETE FROM cita WHERE "citaID" = $1 RETURNING "citaID"',
      [citaId],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Cita no encontrada' });
    }

    res.json({
      ok: true,
      message: 'Cita eliminada exitosamente',
      citaID: resultado.rows[0].citaID,
    });
  } catch (error) {
    errorInterno(res, error, 'Eliminar Cita');
  }
};

/*
 * 11. Marcar el pago de una cita como realizado
 *
 * Es el cobro en el local (efectivo o tarjeta): el cliente ya recibió el
 * servicio —por eso el bloque de esa hora ya quedó libre— y ahora paga. El
 * administrador lo apunta y la cita pasa de "pago pendiente" a "pagada".
 *
 * A diferencia de aprobar un comprobante de pago móvil, esto **no cambia el
 * estado de la cita**: el servicio ya se hizo, la cita sigue como estaba.
 */
const completarPagoCita = async (req, res) => {
  const citaId = idValido(req.params.id);

  if (!citaId) {
    return res.status(400).json({
      ok: false,
      message: 'El ID de la cita debe ser un número entero válido',
    });
  }

  try {
    const resultado = await db.withTransaction(async (client) => {
      const actual = await client.query(
        `SELECT c."citaID", c."clienteID", c.estado, c.pago_metodo, c.pago_estado,
                s.precio
         FROM cita c
         JOIN servicios s ON s."serviciosID" = c."servicioID"
         WHERE c."citaID" = $1`,
        [citaId],
      );

      if (actual.rows.length === 0) {
        return { error: { status: 404, message: 'Cita no encontrada' } };
      }

      const cita = actual.rows[0];

      if (!cita.pago_metodo) {
        return {
          error: {
            status: 400,
            message: 'Esta cita no tiene método de pago: agrégalo al agendar la cita.',
          },
        };
      }

      if (cita.pago_metodo === 'pago_movil') {
        return {
          error: {
            status: 400,
            message: 'El pago móvil se aprueba o se rechaza desde su comprobante.',
          },
        };
      }

      if (cita.pago_estado === 'completado') {
        return { error: { status: 400, message: 'El pago de esta cita ya estaba realizado' } };
      }

      if (cita.estado === 'cancelada' || cita.estado === 'denegada') {
        return {
          error: {
            status: 400,
            message: 'Esta cita está cancelada: no tiene un pago que registrar.',
          },
        };
      }

      // Se anota el cobro en el libro de pagos y la cita pasa a "pagada".
      const pago = await registrarPagoCita(client, {
        citaId,
        clienteId: cita.clienteID,
        metodo: cita.pago_metodo,
        estado: 'completado',
        monto: Number(cita.precio),
        referencia: 'Cobro en el local',
      });

      const completa = await client.query(`${SELECT_CITA} WHERE c."citaID" = $1`, [citaId]);

      return { cita: completa.rows[0], pago };
    });

    if (resultado.error) {
      return res.status(resultado.error.status).json({ ok: false, message: resultado.error.message });
    }

    res.json({
      ok: true,
      message: 'Pago marcado como realizado',
      cita: resultado.cita,
      transaccion: { ...resultado.pago, monto: Number(resultado.pago.monto) },
    });
  } catch (error) {
    errorInterno(res, error, 'Completar Pago Cita');
  }
};

module.exports = {
  obtenerCitas,
  obtenerOcupados,
  crearCita,
  crearCitaPublica,
  obtenerCitaPublica,
  cancelarCitaPublica,
  reprogramarCita,
  actualizarEstadoCita,
  solicitarCancelacionCita,
  confirmarReembolsoCita,
  rechazarCancelacionCita,
  eliminarCita,
  completarPagoCita,
};
