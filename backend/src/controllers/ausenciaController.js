const db = require('../config/db');
const { errorInterno } = require('../utils/respuestaError');
const { idValido } = require('../utils/validacion');
const { esAdministradorDeBarbero, forbiddenNoEsSuBarbero } = require('../utils/permisos');

/*
 * Permisos de los barberos (vacaciones, permiso médico, un curso...).
 *
 * Mientras dura un permiso, ese barbero no acepta reservas (lo comprueba
 * citaController.validarCita) y la web no ofrece esos días. Los da de alta el
 * administrador o el propio barbero para sí mismo.
 *
 * Las citas que ya estaban agendadas en esas fechas NO se cancelan solas: la
 * respuesta las devuelve en `citasAfectadas` para que el administrador hable
 * con esos clientes y las reprograme o cancele.
 */

const esFecha = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

const SELECT_AUSENCIA = `
  SELECT a."ausenciaID", a."barberoID",
         to_char(a.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
         to_char(a.fecha_fin, 'YYYY-MM-DD')    AS fecha_fin,
         a.motivo, a.creado_en,
         u.nombre AS barbero_nombre, u.apellido AS barbero_apellido
  FROM ausencia_barbero a
  JOIN barbero b ON b."barberoID" = a."barberoID"
  JOIN usuario u ON u."usuarioID" = b."usuarioID"
`;

// Citas activas de un barbero dentro de un rango de fechas.
const citasEnRango = (barberoId, desde, hasta) =>
  db.query(
    `SELECT c."citaID", c.fecha_inicio, c.estado,
            COALESCE(c.contacto_nombre, u.nombre || ' ' || u.apellido) AS cliente,
            COALESCE(c.contacto_telefono, u.telefono) AS telefono
     FROM cita c
     LEFT JOIN usuario u ON u."usuarioID" = c."clienteID"
     WHERE c."barberoID" = $1
       AND c.fecha_inicio::date BETWEEN $2::date AND $3::date
       AND c.estado IN ('pendiente', 'confirmada')
     ORDER BY c.fecha_inicio`,
    [barberoId, desde, hasta]
  );

/*
 * Permisos de un barbero (público). La web los necesita para no ofrecer esos
 * días al reservar. Sin el motivo: es un dato interno del barbero.
 */
const obtenerAusenciasBarbero = async (req, res) => {
  const barberoId = idValido(req.params.barberoID);
  if (!barberoId) {
    return res.status(400).json({ ok: false, message: 'El ID del barbero debe ser un número entero válido' });
  }
  try {
    const { rows } = await db.query(
      `SELECT "ausenciaID", to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
              to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin
       FROM ausencia_barbero
       WHERE "barberoID" = $1 AND fecha_fin >= CURRENT_DATE
       ORDER BY fecha_inicio`,
      [barberoId]
    );
    res.json({ ok: true, total: rows.length, ausencias: rows });
  } catch (error) {
    errorInterno(res, error, 'Obtener Ausencias Barbero');
  }
};

/*
 * Lista completa (administrador: todas; barbero: las suyas). Por defecto
 * solo las que aún no terminaron; con ?todas=true también las pasadas.
 */
const obtenerAusencias = async (req, res) => {
  const filtros = [];
  const params = [];
  if (req.query.todas !== 'true') filtros.push('a.fecha_fin >= CURRENT_DATE');
  if (req.usuario.rol === 'barbero') {
    params.push(req.usuario.usuarioID);
    filtros.push(`b."usuarioID" = $${params.length}`);
  }
  try {
    const { rows } = await db.query(
      `${SELECT_AUSENCIA} ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
       ORDER BY a.fecha_inicio`,
      params
    );
    res.json({ ok: true, total: rows.length, ausencias: rows });
  } catch (error) {
    errorInterno(res, error, 'Obtener Ausencias');
  }
};

const crearAusencia = async (req, res) => {
  const { barberoID, fecha_inicio, fecha_fin, motivo } = req.body || {};
  const barberoId = idValido(barberoID);
  const desde = esFecha(fecha_inicio) ? fecha_inicio.trim() : null;
  const hasta = esFecha(fecha_fin) ? fecha_fin.trim() : desde; // un solo día si no viene el fin

  if (!barberoId) {
    return res.status(400).json({ ok: false, message: 'El ID del barbero debe ser un número entero válido' });
  }
  if (!desde || !hasta) {
    return res.status(400).json({ ok: false, message: 'Las fechas deben tener el formato AAAA-MM-DD' });
  }
  if (hasta < desde) {
    return res.status(400).json({ ok: false, message: 'La fecha final no puede ser anterior a la inicial' });
  }
  if (motivo !== undefined && motivo !== null && typeof motivo !== 'string') {
    return res.status(400).json({ ok: false, message: 'El motivo debe ser un texto' });
  }
  if (!(await esAdministradorDeBarbero(barberoId, req.usuario))) {
    return forbiddenNoEsSuBarbero(res, 'Solo puedes registrar tus propios permisos');
  }

  try {
    const barbero = await db.query('SELECT 1 FROM barbero WHERE "barberoID" = $1', [barberoId]);
    if (barbero.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Barbero no encontrado' });
    }

    // Dos permisos que se pisan se tratarían como uno, pero luego no se
    // entiende cuál borrar: se pide editar el que ya existe.
    const cruce = await db.query(
      `SELECT to_char(fecha_inicio, 'DD/MM/YYYY') AS desde, to_char(fecha_fin, 'DD/MM/YYYY') AS hasta
       FROM ausencia_barbero
       WHERE "barberoID" = $1 AND fecha_inicio <= $3::date AND fecha_fin >= $2::date
       LIMIT 1`,
      [barberoId, desde, hasta]
    );
    if (cruce.rows.length > 0) {
      return res.status(400).json({
        ok: false,
        message: `Ya hay un permiso que se cruza con esas fechas (del ${cruce.rows[0].desde} al ${cruce.rows[0].hasta})`
      });
    }

    const { rows } = await db.query(
      `INSERT INTO ausencia_barbero ("barberoID", fecha_inicio, fecha_fin, motivo)
       VALUES ($1, $2, $3, $4)
       RETURNING "ausenciaID"`,
      [barberoId, desde, hasta, typeof motivo === 'string' && motivo.trim() ? motivo.trim() : null]
    );
    const creada = await db.query(`${SELECT_AUSENCIA} WHERE a."ausenciaID" = $1`, [rows[0].ausenciaID]);
    const afectadas = await citasEnRango(barberoId, desde, hasta);

    res.status(201).json({
      ok: true,
      message: afectadas.rows.length
        ? `Permiso registrado. Hay ${afectadas.rows.length} cita(s) agendada(s) en esas fechas: avisa a esos clientes para reprogramarlas.`
        : 'Permiso registrado',
      ausencia: creada.rows[0],
      // El barbero no ve el teléfono de los clientes (igual que en su agenda).
      citasAfectadas: req.usuario.rol === 'administrador'
        ? afectadas.rows
        : afectadas.rows.map(({ telefono, ...resto }) => resto)
    });
  } catch (error) {
    if (error.code === '22008' || error.code === '22007') {
      return res.status(400).json({ ok: false, message: 'Alguna de las fechas no existe' });
    }
    errorInterno(res, error, 'Crear Ausencia');
  }
};

const eliminarAusencia = async (req, res) => {
  const ausenciaId = idValido(req.params.id);
  if (!ausenciaId) {
    return res.status(400).json({ ok: false, message: 'El ID del permiso debe ser un número entero válido' });
  }
  try {
    const actual = await db.query('SELECT "barberoID" FROM ausencia_barbero WHERE "ausenciaID" = $1', [ausenciaId]);
    if (actual.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Permiso no encontrado' });
    }
    if (!(await esAdministradorDeBarbero(actual.rows[0].barberoID, req.usuario))) {
      return forbiddenNoEsSuBarbero(res, 'Solo puedes quitar tus propios permisos');
    }
    await db.query('DELETE FROM ausencia_barbero WHERE "ausenciaID" = $1', [ausenciaId]);
    res.json({ ok: true, message: 'Permiso eliminado', ausenciaID: ausenciaId });
  } catch (error) {
    errorInterno(res, error, 'Eliminar Ausencia');
  }
};

module.exports = { obtenerAusenciasBarbero, obtenerAusencias, crearAusencia, eliminarAusencia };
