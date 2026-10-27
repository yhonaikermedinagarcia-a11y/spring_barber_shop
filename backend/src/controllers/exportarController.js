const ExcelJS = require('exceljs');
const db = require('../config/db');
const { errorInterno } = require('../utils/respuestaError');
const { fechaYmd } = require('../utils/validacion');

/*
 * Exportación a Excel para la contabilidad (solo administrador).
 *
 * GET /api/estadisticas/exportar?desde=AAAA-MM-DD&hasta=AAAA-MM-DD
 *
 * Por defecto, del día 1 del mes actual a hoy. El libro trae cinco hojas:
 *
 *   - Resumen:          totales del período.
 *   - Citas:            todas las citas del período (por fecha de la cita).
 *   - Pagos:            los cobros registrados (por fecha del pago).
 *   - Ingresos por mes: lo cobrado cada mes, por método de pago.
 *   - Comisiones:       lo que le toca a cada barbero por sus citas
 *                       completadas, con su porcentaje de comisión.
 */

const esFecha = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const MONEDA = '#,##0.00';
const ESTADOS_CITA = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  denegada: 'Denegada (pago rechazado)',
  cancelacion_solicitada: 'Cancelación solicitada',
};
const METODOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', pago_movil: 'Pago móvil' };

// Hoja con cabecera en negrita, fija al hacer scroll y con filtros.
const nuevaHoja = (libro, nombre, columnas) => {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = columnas;
  const cabecera = hoja.getRow(1);
  cabecera.font = { bold: true, color: { argb: 'FF0B0B0D' } };
  cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4AF37' } };
  cabecera.alignment = { vertical: 'middle' };
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  return hoja;
};

const exportarExcel = async (req, res) => {
  const hoy = new Date();
  const desde = esFecha(req.query.desde)
    ? req.query.desde
    : fechaYmd(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const hasta = esFecha(req.query.hasta) ? req.query.hasta : fechaYmd(hoy);

  if ((req.query.desde && !esFecha(req.query.desde)) || (req.query.hasta && !esFecha(req.query.hasta))) {
    return res.status(400).json({ ok: false, message: 'Las fechas deben tener el formato AAAA-MM-DD' });
  }
  if (hasta < desde) {
    return res.status(400).json({ ok: false, message: 'La fecha final no puede ser anterior a la inicial' });
  }

  try {
    const citas = await db.query(
      `SELECT c."citaID", c.fecha_inicio, c.estado, c.pago_metodo, c.pago_estado, c.es_invitado,
              COALESCE(c.contacto_nombre, uc.nombre || ' ' || uc.apellido) AS cliente,
              COALESCE(c.contacto_telefono, uc.telefono) AS telefono,
              ub.nombre || ' ' || ub.apellido AS barbero,
              s.nombre AS servicio, s.precio::float AS precio, s.duracion_minutos
       FROM cita c
       LEFT JOIN usuario uc ON uc."usuarioID" = c."clienteID"
       JOIN barbero b  ON b."barberoID"  = c."barberoID"
       JOIN usuario ub ON ub."usuarioID" = b."usuarioID"
       JOIN servicios s ON s."serviciosID" = c."servicioID"
       WHERE c.fecha_inicio::date BETWEEN $1::date AND $2::date
       ORDER BY c.fecha_inicio`,
      [desde, hasta]
    );

    const pagos = await db.query(
      `SELECT t."transaccionID", t."citaID", t.fecha_creacion, t.metodo_pago, t.estado,
              t.monto::float AS monto, t.referencia_pago, t.motivo_rechazo,
              COALESCE(c.contacto_nombre, uc.nombre || ' ' || uc.apellido) AS cliente,
              ub.nombre || ' ' || ub.apellido AS barbero,
              s.nombre AS servicio
       FROM transacciones t
       JOIN cita c ON c."citaID" = t."citaID"
       LEFT JOIN usuario uc ON uc."usuarioID" = c."clienteID"
       JOIN barbero b  ON b."barberoID"  = c."barberoID"
       JOIN usuario ub ON ub."usuarioID" = b."usuarioID"
       JOIN servicios s ON s."serviciosID" = c."servicioID"
       WHERE t.fecha_creacion::date BETWEEN $1::date AND $2::date
       ORDER BY t.fecha_creacion`,
      [desde, hasta]
    );

    const porMes = await db.query(
      `SELECT to_char(date_trunc('month', t.fecha_creacion), 'YYYY-MM') AS mes,
              COUNT(*)::int AS pagos,
              COALESCE(SUM(t.monto) FILTER (WHERE t.metodo_pago = 'efectivo'), 0)::float   AS efectivo,
              COALESCE(SUM(t.monto) FILTER (WHERE t.metodo_pago = 'tarjeta'), 0)::float    AS tarjeta,
              COALESCE(SUM(t.monto) FILTER (WHERE t.metodo_pago = 'pago_movil'), 0)::float AS pago_movil,
              COALESCE(SUM(t.monto), 0)::float AS total
       FROM transacciones t
       WHERE t.estado = 'completado'
         AND t."citaID" IS NOT NULL
         AND t.fecha_creacion::date BETWEEN $1::date AND $2::date
       GROUP BY 1
       ORDER BY 1`,
      [desde, hasta]
    );

    const comisiones = await db.query(
      `SELECT ub.nombre || ' ' || ub.apellido AS barbero,
              b.comision::float AS porcentaje,
              COUNT(c."citaID")::int AS citas,
              COALESCE(SUM(s.precio), 0)::float AS facturado,
              COALESCE(SUM(s.precio) * b.comision / 100, 0)::float AS comision
       FROM barbero b
       JOIN usuario ub ON ub."usuarioID" = b."usuarioID"
       LEFT JOIN cita c ON c."barberoID" = b."barberoID"
                       AND c.estado = 'completada'
                       AND c.fecha_inicio::date BETWEEN $1::date AND $2::date
       LEFT JOIN servicios s ON s."serviciosID" = c."servicioID"
       GROUP BY b."barberoID", ub.nombre, ub.apellido, b.comision
       ORDER BY facturado DESC, barbero`,
      [desde, hasta]
    );

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Spring Barber Shop';
    libro.created = new Date();

    // ---- Resumen
    const cobrado = pagos.rows.filter((p) => p.estado === 'completado').reduce((a, p) => a + p.monto, 0);
    const nPagados = pagos.rows.filter((p) => p.estado === 'completado').length;
    const resumen = nuevaHoja(libro, 'Resumen', [
      { header: 'Concepto', key: 'concepto', width: 38 },
      { header: 'Valor', key: 'valor', width: 22 },
    ]);
    const filasResumen = [
      ['Período', `${desde} a ${hasta}`],
      ['Citas en el período', citas.rows.length],
      ['Citas completadas', citas.rows.filter((c) => c.estado === 'completada').length],
      ['Citas canceladas o denegadas', citas.rows.filter((c) => ['cancelada', 'denegada'].includes(c.estado)).length],
      ['Pagos cobrados', nPagados],
      ['Total cobrado', cobrado],
      ['Ticket promedio', nPagados ? cobrado / nPagados : 0],
      ['Comisiones de barberos (citas completadas)', comisiones.rows.reduce((a, c) => a + c.comision, 0)],
    ];
    for (const [concepto, valor] of filasResumen) resumen.addRow({ concepto, valor });
    for (const n of [7, 8, 9]) resumen.getCell(`B${n}`).numFmt = MONEDA;
    resumen.autoFilter = undefined;

    // ---- Citas
    const hojaCitas = nuevaHoja(libro, 'Citas', [
      { header: 'N.º', key: 'id', width: 7 },
      { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Hora', key: 'hora', width: 8 },
      { header: 'Barbero', key: 'barbero', width: 22 },
      { header: 'Cliente', key: 'cliente', width: 24 },
      { header: 'Teléfono', key: 'telefono', width: 15 },
      { header: 'Servicio', key: 'servicio', width: 22 },
      { header: 'Duración (min)', key: 'duracion', width: 14 },
      { header: 'Precio', key: 'precio', width: 13, style: { numFmt: MONEDA } },
      { header: 'Estado', key: 'estado', width: 24 },
      { header: 'Método de pago', key: 'metodo', width: 15 },
      { header: 'Pago', key: 'pago', width: 12 },
      { header: 'Sin cuenta', key: 'invitado', width: 11 },
    ]);
    for (const c of citas.rows) {
      const f = new Date(c.fecha_inicio);
      hojaCitas.addRow({
        id: c.citaID,
        // Fecha "de pared" (sin desplazar por zona horaria) para que Excel la
        // muestre tal como está en la agenda.
        fecha: new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate())),
        hora: `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`,
        barbero: c.barbero,
        cliente: c.cliente,
        telefono: c.telefono,
        servicio: c.servicio,
        duracion: c.duracion_minutos,
        precio: c.precio,
        estado: ESTADOS_CITA[c.estado] || c.estado,
        metodo: METODOS[c.pago_metodo] || '',
        pago: c.pago_estado || '',
        invitado: c.es_invitado ? 'Sí' : 'No',
      });
    }

    // ---- Pagos
    const hojaPagos = nuevaHoja(libro, 'Pagos', [
      { header: 'N.º pago', key: 'id', width: 9 },
      { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Cita', key: 'cita', width: 7 },
      { header: 'Cliente', key: 'cliente', width: 24 },
      { header: 'Barbero', key: 'barbero', width: 22 },
      { header: 'Servicio', key: 'servicio', width: 22 },
      { header: 'Método', key: 'metodo', width: 13 },
      { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Monto', key: 'monto', width: 13, style: { numFmt: MONEDA } },
      { header: 'Referencia', key: 'referencia', width: 20 },
      { header: 'Motivo del rechazo', key: 'motivo', width: 30 },
    ]);
    for (const p of pagos.rows) {
      const f = new Date(p.fecha_creacion);
      hojaPagos.addRow({
        id: p.transaccionID,
        fecha: new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate())),
        cita: p.citaID,
        cliente: p.cliente,
        barbero: p.barbero,
        servicio: p.servicio,
        metodo: METODOS[p.metodo_pago] || p.metodo_pago,
        estado: p.estado,
        monto: p.monto,
        referencia: p.referencia_pago,
        motivo: p.motivo_rechazo,
      });
    }

    // ---- Ingresos por mes
    const hojaMes = nuevaHoja(libro, 'Ingresos por mes', [
      { header: 'Mes', key: 'mes', width: 10 },
      { header: 'Pagos', key: 'pagos', width: 8 },
      { header: 'Efectivo', key: 'efectivo', width: 14, style: { numFmt: MONEDA } },
      { header: 'Tarjeta', key: 'tarjeta', width: 14, style: { numFmt: MONEDA } },
      { header: 'Pago móvil', key: 'pago_movil', width: 14, style: { numFmt: MONEDA } },
      { header: 'Total', key: 'total', width: 15, style: { numFmt: MONEDA } },
    ]);
    for (const m of porMes.rows) hojaMes.addRow(m);
    if (porMes.rows.length) {
      const ultima = porMes.rows.length + 1;
      const total = hojaMes.addRow({ mes: 'Total' });
      for (const col of ['B', 'C', 'D', 'E', 'F']) {
        total.getCell(col).value = { formula: `SUM(${col}2:${col}${ultima})` };
      }
      total.font = { bold: true };
    }

    // ---- Comisiones
    const hojaCom = nuevaHoja(libro, 'Comisiones', [
      { header: 'Barbero', key: 'barbero', width: 24 },
      { header: 'Comisión %', key: 'porcentaje', width: 12 },
      { header: 'Citas completadas', key: 'citas', width: 17 },
      { header: 'Facturado', key: 'facturado', width: 15, style: { numFmt: MONEDA } },
      { header: 'Comisión a pagar', key: 'comision', width: 17, style: { numFmt: MONEDA } },
    ]);
    for (const c of comisiones.rows) hojaCom.addRow(c);

    const nombre = `spring-barber-${desde}_a_${hasta}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    await libro.xlsx.write(res);
    res.end();
  } catch (error) {
    errorInterno(res, error, 'Exportar Excel');
  }
};

module.exports = { exportarExcel };
