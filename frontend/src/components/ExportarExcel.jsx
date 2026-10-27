import { useState } from 'react'
import { descargarExcel } from '../api/estadisticas'
import { mensajeDeError } from '../api/client'
import { inputClase, botonPrimario, etiqueta, tarjeta } from '../ui/estilos'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Atajos de período para no tener que escribir las fechas cada vez.
function periodo(tipo) {
  const hoy = new Date()
  if (tipo === 'mes') return { desde: ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: ymd(hoy) }
  if (tipo === 'mesPasado') {
    return {
      desde: ymd(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
      hasta: ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
    }
  }
  return { desde: ymd(new Date(hoy.getFullYear(), 0, 1)), hasta: ymd(hoy) } // año
}

/*
 * Descarga del Excel de contabilidad: citas, pagos, ingresos por mes y
 * comisiones de los barberos del período elegido.
 */
export default function ExportarExcel() {
  const [rango, setRango] = useState(() => periodo('mes'))
  const [descargando, setDescargando] = useState(false)
  const [aviso, setAviso] = useState(null)

  async function descargar(e) {
    e.preventDefault()
    setAviso(null)
    setDescargando(true)
    try {
      const nombre = await descargarExcel(rango)
      setAviso({ ok: true, texto: `Descargado: ${nombre}` })
    } catch (err) {
      setAviso({ ok: false, texto: mensajeDeError(err) })
    } finally {
      setDescargando(false)
    }
  }

  return (
    <form onSubmit={descargar} className={`${tarjeta} p-4`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="font-display text-sm uppercase tracking-widest text-gold-400">
            Exportar a Excel
          </p>
          <p className="mt-1 text-xs text-cream-200/60">
            Citas, pagos, ingresos por mes y comisiones de cada barbero.
          </p>
        </div>
        <label className={etiqueta}>
          Desde
          <input
            type="date"
            value={rango.desde}
            onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
            className={`mt-1 ${inputClase}`}
            required
          />
        </label>
        <label className={etiqueta}>
          Hasta
          <input
            type="date"
            value={rango.hasta}
            min={rango.desde}
            onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
            className={`mt-1 ${inputClase}`}
            required
          />
        </label>
        <button type="submit" disabled={descargando} className={botonPrimario}>
          {descargando ? 'Generando…' : 'Descargar .xlsx'}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {[
          ['mes', 'Este mes'],
          ['mesPasado', 'Mes pasado'],
          ['anio', 'Este año'],
        ].map(([tipo, texto]) => (
          <button
            key={tipo}
            type="button"
            onClick={() => setRango(periodo(tipo))}
            className="rounded-full border border-white/15 px-3 py-1 text-cream-200/70 hover:border-gold-400 hover:text-gold-300"
          >
            {texto}
          </button>
        ))}
      </div>
      {aviso && (
        <p className={`mt-3 text-sm ${aviso.ok ? 'text-emerald-300' : 'text-red-300'}`}>{aviso.texto}</p>
      )}
    </form>
  )
}
