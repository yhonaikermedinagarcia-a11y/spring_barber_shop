const db = require('../config/db');

// 1. Obtener todas las transacciones o movimientos de saldo
const obtenerTransacciones = async (req, res) => {
  try {
    // Se ordena por "transaccionID" y no por fecha: es el orden natural de un libro
    // de movimientos y no depende de que fecha_creacion venga rellenada.
    const query = `
      SELECT t."transaccionID",
             t."usuarioID",
             t.tipo_movimiento,
             t.monto,
             t.saldo_restante,
             t.referencia_pago,
             t.fecha_creacion,
             u.nombre   AS usuario_nombre,
             u.apellido AS usuario_apellido
      FROM transacciones t
      JOIN usuario u ON t."usuarioID" = u."usuarioID"
      ORDER BY t."transaccionID" DESC;
    `;
    const resultado = await db.query(query);

    res.json({
      ok: true,
      total: resultado.rows.length,
      transacciones: resultado.rows
    });
  } catch (error) {
    console.error('Error al obtener transacciones:', error.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// 2. Registrar un nuevo movimiento de saldo
const crearTransaccion = async (req, res) => {
  const { usuarioID, tipo_movimiento, monto, saldo_restante, referencia_pago } = req.body || {};

  const usuarioId = Number(usuarioID);
  const montoNum = Number(monto);
  const saldoNum = Number(saldo_restante);
  const tipo = typeof tipo_movimiento === 'string' ? tipo_movimiento.trim() : '';
  const referencia = typeof referencia_pago === 'string' ? referencia_pago.trim() : '';

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'usuarioID debe ser un número entero válido'
    });
  }
  if (!tipo) {
    return res.status(400).json({
      ok: false,
      message: 'tipo_movimiento es obligatorio'
    });
  }
  if (!Number.isFinite(montoNum)) {
    return res.status(400).json({
      ok: false,
      message: 'monto debe ser un número'
    });
  }
  if (!Number.isFinite(saldoNum)) {
    return res.status(400).json({
      ok: false,
      message: 'saldo_restante debe ser un número'
    });
  }
  // referencia_pago es NOT NULL en el esquema. La vacía se guarda como texto
  // vacío en lugar de null, que rechazaría la base con 23502.
  if (!referencia) {
    return res.status(400).json({
      ok: false,
      message: 'referencia_pago es obligatoria'
    });
  }

  try {
    // Verificar que el usuario exista
    const usuarioRes = await db.query(
      'SELECT "usuarioID" FROM usuario WHERE "usuarioID" = $1',
      [usuarioId]
    );
    if (usuarioRes.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    const query = `
      INSERT INTO transacciones ("usuarioID", tipo_movimiento, monto, saldo_restante, referencia_pago)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING "transaccionID", "usuarioID", tipo_movimiento, monto, saldo_restante, referencia_pago, fecha_creacion;
    `;
    const resultado = await db.query(query, [usuarioId, tipo, montoNum, saldoNum, referencia]);

    res.status(201).json({
      ok: true,
      message: 'Transacción registrada exitosamente',
      transaccion: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al registrar transacción:', error.message);

    if (error.code === '23503') {
      return res.status(400).json({ ok: false, message: 'El usuario indicado no existe' });
    }
    if (error.code === '23502') {
      return res.status(400).json({ ok: false, message: 'Faltan campos obligatorios de la transacción' });
    }
    if (error.code === '22003') {
      return res.status(400).json({ ok: false, message: 'monto o saldo_restante fuera de rango' });
    }
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  obtenerTransacciones,
  crearTransaccion
};
