const db = require('../config/db');
const { errorInterno } = require('../utils/respuestaError');

/*
 * Resumen de negocio del administrador.
 *
 * Todas las cifras salen de la base de datos: no hay nada cacheado ni
 * guardado en el frontend, así que el panel refleja lo que hay en este
 * momento.
 */

// Número de meses que se mira hacia atrás para el gráfico de ingresos.
const MESES_INGRESOS = 6;

/*
 * Servicios más pedidos y ranking de barberos: antes solo se quitaban las
 * citas "cancelada", así que las denegadas (pago rechazado) y las que tienen
 * la cancelación pedida contaban como ingresos y como comisión del barbero.
 */

const calcularResumen = async () => {
  const resumenFilas = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE fecha_inicio::date = CURRENT_DATE)                    AS citas_hoy,
      COUNT(*) FILTER (WHERE estado IN ('pendiente', 'confirmada') AND fecha_inicio >= NOW()) AS citas_proximas,
      COUNT(*)                                                                      AS citas_totales,
      COUNT(*) FILTER (WHERE estado = 'cancelada')                                  AS citas_canceladas,
      COUNT(DISTINCT "clienteID") FILTER (WHERE "clienteID" IS NOT NULL)            AS clientes_totales
    FROM cita;
  `);

  const barberos = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE b.estado)      AS barberos_activos,
      (SELECT COUNT(*) FROM servicios)      AS servicios_totales
    FROM barbero b;
  `);
  // Ingresos: los pagos completados. Se usa el pago registrado y no el precio
  // del servicio para que cuadre con lo que aparece en la pestaña de pagos.
  const ingresos = await db.query(`
    SELECT
      COALESCE(SUM(monto) FILTER (WHERE estado = 'completado'), 0) AS ingresos_mes,
      COALESCE(AVG(monto) FILTER (WHERE estado = 'completado'), 0) AS ticket_promedio
    FROM transacciones
    WHERE estado = 'completado'
      AND fecha_creacion >= date_trunc('month', NOW());
  `);

  const ingresosCompletadas = await db.query(`
    SELECT COALESCE(SUM(t.monto), 0) AS total
    FROM transacciones t
    WHERE t.estado = 'completado';
  `);

  const porEstado = await db.query(`
    SELECT estado, COUNT(*)::int AS total
    FROM cita
    GROUP BY estado
    ORDER BY estado;
  `);

  const ultimos14Dias = await db.query(`
    SELECT
      dia::date::text AS fecha,
      COALESCE(citas, 0)::int AS total
    FROM generate_series(
      CURRENT_DATE - INTERVAL '13 days',
      CURRENT_DATE,
      INTERVAL '1 day'
    ) AS dia
    LEFT JOIN (
      SELECT fecha_inicio::date AS fecha, COUNT(*) AS citas
      FROM cita
      WHERE fecha_inicio::date BETWEEN CURRENT_DATE - INTERVAL '13 days' AND CURRENT_DATE
      GROUP BY fecha_inicio::date
    ) c ON c.fecha = dia::date
    ORDER BY dia;
  `);

  const topServicios = await db.query(`
    SELECT
      s.nombre,
      COUNT(c."citaID")::int AS total,
      COALESCE(SUM(s.precio), 0) AS ingresos
    FROM cita c
    JOIN servicios s ON s."serviciosID" = c."servicioID"
    WHERE c.estado NOT IN ('cancelada', 'denegada', 'cancelacion_solicitada')
    GROUP BY s.nombre, s."serviciosID"
    ORDER BY total DESC, s.nombre ASC
    LIMIT 5;
  `);

  const rankingBarberos = await db.query(`
    SELECT
      b."barberoID",
      u.nombre,
      u.apellido,
      b.estado,
      b.comision,
      COUNT(c."citaID")::int AS citas,
      COALESCE(SUM(s.precio), 0) AS ingresos,
      COALESCE(SUM(s.precio) * b.comision / 100, 0) AS "comisionEstimada"
    FROM barbero b
    JOIN usuario u ON u."usuarioID" = b."usuarioID"
    LEFT JOIN cita c ON c."barberoID" = b."barberoID" AND c.estado NOT IN ('cancelada', 'denegada', 'cancelacion_solicitada')
    LEFT JOIN servicios s ON s."serviciosID" = c."servicioID"
    GROUP BY b."barberoID", u.nombre, u.apellido, b.estado, b.comision
    ORDER BY citas DESC, u.nombre ASC;
  `);

  const ingresosPorMes = await db.query(`
    SELECT
      to_char(date_trunc('month', fecha_creacion), 'YYYY-MM') AS mes,
      COALESCE(SUM(monto), 0) AS ingresos,
      COUNT(*)::int AS citas
    FROM transacciones
    WHERE estado = 'completado'
      AND fecha_creacion >= date_trunc('month', NOW()) - INTERVAL '${MESES_INGRESOS - 1} months'
    GROUP BY 1
    ORDER BY 1;
  `);

  const r = resumenFilas.rows[0];
  const b = barberos.rows[0];

  return {
    ok: true,
    generadoEn: new Date().toISOString(),
    resumen: {
      citasHoy: Number(r.citas_hoy),
      citasProximas: Number(r.citas_proximas),
      citasTotales: Number(r.citas_totales),
      citasCanceladas: Number(r.citas_canceladas),
      ingresosMes: Number(ingresos.rows[0].ingresos_mes),
      ingresosCompletadas: Number(ingresosCompletadas.rows[0].total),
      ticketPromedio: Number(ingresos.rows[0].ticket_promedio),
      clientesTotales: Number(r.clientes_totales),
      barberosActivos: Number(b.barberos_activos),
      serviciosTotales: Number(b.servicios_totales),
    },
    citasPorEstado: porEstado.rows,
    citasUltimos14Dias: ultimos14Dias.rows,
    topServicios: topServicios.rows,
    rankingBarberos: rankingBarberos.rows,
    ingresosPorMes: ingresosPorMes.rows,
  };
};

// 1. Métricas del panel (solo administrador)
const obtenerResumen = async (req, res) => {
  try {
    res.json(await calcularResumen());
  } catch (error) {
    errorInterno(res, error, 'Obtener Resumen');
  }
};

module.exports = { obtenerResumen };
