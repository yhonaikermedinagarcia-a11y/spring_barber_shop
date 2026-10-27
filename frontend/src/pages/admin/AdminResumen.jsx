import { useEffect, useState } from 'react'
import { getResumen } from '../../api/estadisticas'
import { mensajeDeError } from '../../api/client'
import { precio, aNumero } from '../../utils/formato'
import { tarjeta } from '../../ui/estilos'
import { Histograma, HistogramaHorizontal } from '../../components/Graficos'
import ExportarExcel from '../../components/ExportarExcel'

function Kpi({ etiqueta, valor, detalle, acento = 'text-cream-50' }) {
  return (
    <div className={`${tarjeta} p-4`}>
      <p className="text-[0.65rem] uppercase tracking-wider text-cream-200/50">
        {etiqueta}
      </p>
      <p className={`mt-1 font-display text-2xl font-bold ${acento}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-cream-200/50">{detalle}</p>}
    </div>
  )
}

const ETIQUETA_ESTADO = {
  pendiente: 'Pendientes',
  confirmada: 'Confirmadas',
  completada: 'Completadas',
  cancelada: 'Canceladas',
}

export default function AdminResumen() {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    getResumen()
      .then((data) => activo && setDatos(data))
      .catch((err) => activo && setError(mensajeDeError(err)))
      .finally(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [])

  if (cargando) return <p className="text-cream-200/70">Calculando métricas…</p>
  if (error) return <p className="text-red-400">{error}</p>
  if (!datos) return null

  const { resumen, citasPorEstado, citasUltimos14Dias, topServicios, rankingBarberos, ingresosPorMes } =
    datos

  const estadoMap = Object.fromEntries(citasPorEstado.map((e) => [e.estado, e.total]))

  const ESTADOS_ORDEN = ['pendiente', 'confirmada', 'completada', 'cancelada']
  const COLORES_ESTADO = [
    'from-amber-700 to-amber-400',
    'from-sky-700 to-sky-400',
    'from-emerald-800 to-emerald-500',
    'from-red-800 to-red-500',
  ]

  const ejeMoneda = (v) => {
    const n = aNumero(v)
    if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
    return `$${n.toFixed(0)}`
  }

  const mesCorto = (mes) =>
    new Date(`${mes}-01T00:00:00`)
      .toLocaleDateString('es-CO', { month: 'short' })
      .replace('.', '')

  return (
    <div className="space-y-6">
      <ExportarExcel />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi etiqueta="Citas hoy" valor={resumen.citasHoy} acento="text-gold-300" />
        <Kpi etiqueta="Próximas" valor={resumen.citasProximas} detalle="pendientes + confirmadas" />
        <Kpi etiqueta="Total citas" valor={resumen.citasTotales} />
        <Kpi
          etiqueta="Canceladas"
          valor={resumen.citasCanceladas}
          acento="text-red-300"
        />
        <Kpi
          etiqueta="Ingresos del mes"
          valor={precio(resumen.ingresosMes)}
          acento="text-emerald-300"
        />
        <Kpi
          etiqueta="Ingresos (completadas)"
          valor={precio(resumen.ingresosCompletadas)}
          acento="text-emerald-300"
        />
        <Kpi etiqueta="Ticket promedio" valor={precio(resumen.ticketPromedio)} />
        <Kpi
          etiqueta="Clientes"
          valor={resumen.clientesTotales}
          detalle={`${resumen.barberosActivos} barberos · ${resumen.serviciosTotales} servicios`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${tarjeta} p-5`}>
          <h2 className="font-display text-sm uppercase tracking-widest text-gold-400">
            Citas en los últimos 14 días
          </h2>
          <Histograma
            datos={citasUltimos14Dias.map((d) => ({
              etiqueta: d.fecha.slice(8, 10),
              valor: d.total,
              titulo: `${d.fecha}: ${d.total} ${d.total === 1 ? 'cita' : 'citas'}`,
            }))}
            formatearEje={(v) => Math.round(v)}
            formatearValor={(v) => v}
          />
        </div>

        <div className={`${tarjeta} p-5`}>
          <h2 className="font-display text-sm uppercase tracking-widest text-gold-400">
            Ingresos por mes
          </h2>
          <Histograma
            datos={ingresosPorMes.map((m) => ({
              etiqueta: mesCorto(m.mes),
              valor: aNumero(m.ingresos),
              titulo: `${m.mes}: ${precio(m.ingresos)} (${m.citas} citas)`,
            }))}
            color="from-emerald-800 to-emerald-500"
            formatearEje={ejeMoneda}
            formatearValor={(v) => precio(v)}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${tarjeta} p-5`}>
          <h2 className="font-display text-sm uppercase tracking-widest text-gold-400">
            Servicios más pedidos
          </h2>
          {topServicios.length === 0 ? (
            <p className="mt-4 text-cream-200/60">Sin datos todavía.</p>
          ) : (
            <div className="mt-4">
              <HistogramaHorizontal
                datos={topServicios.map((s) => ({
                  etiqueta: s.nombre,
                  valor: s.total,
                  extra: precio(s.ingresos),
                }))}
              />
            </div>
          )}
        </div>

        <div className={`${tarjeta} p-5`}>
          <h2 className="font-display text-sm uppercase tracking-widest text-gold-400">
            Distribución por estado
          </h2>
          <Histograma
            datos={ESTADOS_ORDEN.map((estado) => ({
              etiqueta: ETIQUETA_ESTADO[estado],
              valor: estadoMap[estado] ?? 0,
              titulo: `${ETIQUETA_ESTADO[estado]}: ${estadoMap[estado] ?? 0}`,
            }))}
            colores={COLORES_ESTADO}
            formatearEje={(v) => Math.round(v)}
            formatearValor={(v) => v}
          />
        </div>
      </div>

      <div className={`${tarjeta} overflow-hidden`}>
        <div className="border-b border-white/10 p-5 pb-3">
          <h2 className="font-display text-sm uppercase tracking-widest text-gold-400">
            Rendimiento por barbero
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-[0.65rem] uppercase tracking-wider text-cream-200/50">
                <th className="px-5 py-2 font-medium">Barbero</th>
                <th className="px-5 py-2 font-medium">Estado</th>
                <th className="px-5 py-2 text-right font-medium">Citas</th>
                <th className="px-5 py-2 text-right font-medium">Ingresos</th>
                <th className="px-5 py-2 text-right font-medium">Comisión</th>
                <th className="px-5 py-2 text-right font-medium">A pagar</th>
              </tr>
            </thead>
            <tbody>
              {rankingBarberos.map((b) => (
                <tr key={b.barberoID} className="border-t border-white/5">
                  <td className="px-5 py-2.5 text-cream-50">
                    {b.nombre} {b.apellido}
                  </td>
                  <td className="px-5 py-2.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[0.6rem] uppercase tracking-wider ${
                        b.estado
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-white/10 text-cream-200/60'
                      }`}
                    >
                      {b.estado ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right text-cream-100">{b.citas}</td>
                  <td className="px-5 py-2.5 text-right text-cream-100">
                    {precio(b.ingresos)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-cream-200/70">
                    {aNumero(b.comision).toFixed(0)}%
                  </td>
                  <td className="px-5 py-2.5 text-right font-semibold text-gold-300">
                    {precio(b.comisionEstimada)}
                  </td>
                </tr>
              ))}
              {rankingBarberos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-4 text-cream-200/60">
                    Sin barberos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-right text-xs text-cream-200/40">
        Actualizado: {new Date(datos.generadoEn).toLocaleString('es-CO')}
      </p>
    </div>
  )
}
