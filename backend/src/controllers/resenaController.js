const db = require('../config/db');
const { errorInterno } = require('../utils/respuestaError');
const { idValido } = require('../utils/validacion');

/*
 * Reseñas de un barbero.
 *
 * Un cliente puede dejar una reseña por cada barbero, y solo si tiene una
 * cita completada con él: si no, cualquiera podría opinar de un barbero que
 * no ha conocido. Si el cliente vuelve a opinar, la reseña se actualiza en vez
 * de crear otra.
 *
 * El administrador puede crear una reseña en nombre de un cliente (para
 * cargar datos de prueba o para dejar constancia de una reseña hecha por
 * teléfono) y puede borrar cualquiera.
 */

// 1. Reseñas de un barbero (pública)
const obtenerResenasBarbero = async (req, res) => {
  const barberoId = idValido(req.params.barberoID);

  if (!barberoId) {
    return res.status(400).json({
      ok: false,
      message: 'El ID del barbero debe ser un número entero válido'
    });
  }

  try {
    const resultado = await db.query(
      `SELECT
         r."resenaID",
         r."barberoID",
         r."autorID",
         -- La ficha pública del barbero (ModalBarbero) lee "usuarioID",
         -- "nombre" y "apellido": sin estos alias las reseñas salían sin
         -- nombre y el autor no encontraba la suya para editarla.
         r."autorID" AS "usuarioID",
         r.calificacion::float AS calificacion,
         r.comentario,
         r.fecha_creacion,
         u.nombre   AS autor_nombre,
         u.apellido AS autor_apellido,
         u.nombre   AS nombre,
         -- Del apellido solo se publica la inicial ("Ana R."): la reseña es
         -- pública y no hace falta exponer el nombre completo del cliente.
         CASE WHEN u.apellido IS NULL OR u.apellido = '' THEN ''
              ELSE upper(left(u.apellido, 1)) || '.' END AS apellido
       FROM resena r
       JOIN usuario u ON u."usuarioID" = r."autorID"
       WHERE r."barberoID" = $1
       ORDER BY r.fecha_creacion DESC;`,
      [barberoId]
    );

    const total = resultado.rows.length;
    const suma = resultado.rows.reduce((acumulado, r) => acumulado + Number(r.calificacion), 0);

    res.json({
      ok: true,
      total,
      promedio: total > 0 ? Number((suma / total).toFixed(2)) : 0,
      resenas: resultado.rows
    });
  } catch (error) {
    errorInterno(res, error, 'Obtener Resenas de Barbero');
  }
};

// 2. Todas las reseñas (solo administrador)
const obtenerTodasResenas = async (req, res) => {
  try {
    const resultado = await db.query(
      `SELECT
         r."resenaID",
         r."barberoID",
         r."autorID",
         r.calificacion::float AS calificacion,
         r.comentario,
         r.fecha_creacion,
         ua.nombre   AS autor_nombre,
         ua.apellido AS autor_apellido,
         ub.nombre   AS barbero_nombre,
         ub.apellido AS barbero_apellido
       FROM resena r
       JOIN usuario ua ON ua."usuarioID" = r."autorID"
       JOIN barbero b ON b."barberoID" = r."barberoID"
       JOIN usuario ub ON ub."usuarioID" = b."usuarioID"
       ORDER BY r.fecha_creacion DESC;`
    );

    res.json({
      ok: true,
      total: resultado.rows.length,
      resenas: resultado.rows
    });
  } catch (error) {
    errorInterno(res, error, 'Obtener Todas Resenas');
  }
};

// 3. Crear o actualizar la reseña de un barbero
const crearResena = async (req, res) => {
  const barberoId = idValido(req.params.barberoID);
  const { calificacion, comentario, autorID } = req.body || {};

  if (!barberoId) {
    return res.status(400).json({
      ok: false,
      message: 'El ID del barbero debe ser un número entero válido'
    });
  }

  // De 0.5 a 5, de media en media (la web tiene medias estrellas).
  const puntos = Number(calificacion);

  if (!Number.isFinite(puntos) || puntos < 0.5 || puntos > 5 || !Number.isInteger(puntos * 2)) {
    return res.status(400).json({
      ok: false,
      message: 'La calificación debe ser de 0.5 a 5 estrellas, en pasos de media estrella'
    });
  }

  if (comentario !== undefined && comentario !== null && typeof comentario !== 'string') {
    return res.status(400).json({ ok: false, message: 'El comentario debe ser un texto' });
  }

  const esAdmin = req.usuario?.rol === 'administrador';
  const autorId = esAdmin && autorID !== undefined ? idValido(autorID) : req.usuario?.usuarioID;

  if (!autorId) {
    return res.status(400).json({
      ok: false,
      message: 'No se pudo determinar el autor de la reseña'
    });
  }

  try {
    const barbero = await db.query(
      'SELECT "barberoID" FROM barbero WHERE "barberoID" = $1',
      [barberoId]
    );

    if (barbero.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Barbero no encontrado' });
    }

    const autor = await db.query(
      'SELECT "usuarioID" FROM usuario WHERE "usuarioID" = $1',
      [autorId]
    );

    if (autor.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'El autor indicado no existe' });
    }

    // Solo se puede opinar de un barbero al que se le ha hecho una cita
    // completada. El administrador se salta esta comprobación: puede registrar
    // una reseña de un cliente que la dejó por otra vía.
    if (!esAdmin) {
      const cita = await db.query(
        `SELECT 1 FROM cita
         WHERE "barberoID" = $1 AND "clienteID" = $2 AND estado = 'completada'
         LIMIT 1;`,
        [barberoId, autorId]
      );

      if (cita.rows.length === 0) {
        return res.status(400).json({
          ok: false,
          message: 'Solo puedes dejar una reseña de un barbero al que hayas tenido una cita completada'
        });
      }
    }

    const resultado = await db.query(
      `INSERT INTO resena ("barberoID", "autorID", calificacion, comentario)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("barberoID", "autorID")
       DO UPDATE SET calificacion = EXCLUDED.calificacion,
                     comentario   = EXCLUDED.comentario,
                     fecha_creacion = now()
       RETURNING "resenaID", "barberoID", "autorID", calificacion::float AS calificacion, comentario, fecha_creacion;`,
      [barberoId, autorId, puntos, comentario ? comentario.trim() : null]
    );

    res.status(201).json({
      ok: true,
      message: 'Reseña registrada exitosamente',
      resena: resultado.rows[0]
    });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ ok: false, message: 'El barbero o el autor no existen' });
    }
    errorInterno(res, error, 'Crear Resena');
  }
};

// 4. Borrar una reseña (solo administrador)
const eliminarResena = async (req, res) => {
  const resenaId = idValido(req.params.resenaID);

  if (!resenaId) {
    return res.status(400).json({
      ok: false,
      message: 'El ID de la reseña debe ser un número entero válido'
    });
  }

  try {
    const resultado = await db.query(
      'DELETE FROM resena WHERE "resenaID" = $1 RETURNING "resenaID";',
      [resenaId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Reseña no encontrada' });
    }

    res.json({
      ok: true,
      message: 'Reseña eliminada exitosamente',
      resenaID: resultado.rows[0].resenaID
    });
  } catch (error) {
    errorInterno(res, error, 'Eliminar Resena');
  }
};

module.exports = {
  obtenerResenasBarbero,
  obtenerTodasResenas,
  crearResena,
  eliminarResena
};
