import { useEffect, useState } from 'react'
import { getAusencias, crearAusencia, eliminarAusencia } from '../api/ausencias'
import { mensajeDeError } from '../api/client'
import { inputClase, botonPrimario, botonEliminar, etiqueta, tarjeta } from '../ui/estilos'
import { formatearFechaLarga, fechaHora, enlaceWhatsAppNumero, enHoraLocal } from '../utils/formato'

/*
 * Permisos (vacaciones, permiso médico, un curso...) de los barberos.
 *
 * - Administrador: `barberos` con la lista completa; elige a quién se lo da.
 * - Barbero: `barberoFijo` con su propia ficha; solo gestiona los suyos.
 *
 * Las citas que ya había en esas fechas no se cancelan solas: se listan para
 * avisar a esos clientes (el administrador, con un enlace de WhatsApp).
 */
export default function GestionPermisos({ barberos = [], barberoFijo = null }) {
  const [ausencias, setAusencias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [afectadas, setAfectadas] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [form, setForm] = useState({
    barberoID: barberoFijo ? String(barberoFijo.barberoID) : '',
    fecha_inicio: '',
    fecha_fin: '',
    motivo: '',
  })
  const barberoElegido = form.barberoID || (barberos[0] ? String(barberos[0].barberoID) : '')
  const [hoy] = useState(() => enHoraLocal(new Date())?.ymd)

  useEffect(() => {
    let activo = true
    getAusencias()
      .then((a) => activo && setAusencias(a))
      .catch((err) => activo && setError(mensajeDeError(err)))
      .finally(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [])

  function cambio(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function guardar(e) {
    e.preventDefault()
    setAviso(null)
    setAfectadas([])
    setEnviando(true)
    try {
      const r = await crearAusencia({
        barberoID: Number(barberoElegido),
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin || form.fecha_inicio,
        motivo: form.motivo,
      })
      setAusencias((prev) =>
        [...prev, r.ausencia].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)),
      )
      setAfectadas(r.citasAfectadas ?? [])
      setAviso({ ok: true, texto: r.message })
      setForm((f) => ({ ...f, fecha_inicio: '', fecha_fin: '', motivo: '' }))
    } catch (err) {
      setAviso({ ok: false, texto: mensajeDeError(err) })
    } finally {
      setEnviando(false)
    }
  }

  async function quitar(a) {
    setAviso(null)
    try {
      await eliminarAusencia(a.ausenciaID)
      setAusencias((prev) => prev.filter((x) => x.ausenciaID !== a.ausenciaID))
    } catch (err) {
      setAviso({ ok: false, texto: mensajeDeError(err) })
    }
  }

  const rango = (a) =>
    a.fecha_inicio === a.fecha_fin
      ? formatearFechaLarga(a.fecha_inicio)
      : `${formatearFechaLarga(a.fecha_inicio)} – ${formatearFechaLarga(a.fecha_fin)}`

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-2">
        <p className="text-sm text-cream-200/60">
          Durante un permiso el barbero no recibe reservas. Las citas que ya estaban
          agendadas en esas fechas se mantienen: hay que avisar a esos clientes.
        </p>
        {cargando && <p className="text-cream-200/70">Cargando permisos…</p>}
        {error && <p className="text-red-400">{error}</p>}
        {!cargando && !error && ausencias.length === 0 && (
          <p className="text-cream-200/60">No hay permisos próximos.</p>
        )}
        {ausencias.map((a) => (
          <div key={a.ausenciaID} className={`${tarjeta} flex flex-wrap items-center gap-3 px-4 py-3`}>
            <div className="mr-auto">
              <p className="text-cream-50">{rango(a)}</p>
              <p className="text-xs text-cream-200/60">
                {!barberoFijo && `${a.barbero_nombre} ${a.barbero_apellido}`}
                {!barberoFijo && a.motivo && ' · '}
                {a.motivo}
              </p>
            </div>
            <button type="button" onClick={() => quitar(a)} className={botonEliminar}>
              Quitar
            </button>
          </div>
        ))}

        {afectadas.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-amber-200">Citas agendadas en esas fechas</p>
            <ul className="mt-2 space-y-1 text-sm text-cream-100">
              {afectadas.map((c) => {
                const wa = c.telefono
                  ? enlaceWhatsAppNumero(
                      c.telefono,
                      `Hola ${c.cliente}, te escribimos de Spring Barber Shop: tu barbero no podrá atenderte el ${fechaHora(c.fecha_inicio)}. ¿Te reprogramamos la cita?`,
                    )
                  : null
                return (
                  <li key={c.citaID} className="flex flex-wrap items-center gap-2">
                    <span>
                      {fechaHora(c.fecha_inicio)} · {c.cliente}
                    </span>
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-emerald-300 hover:underline">
                        Avisar por WhatsApp
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <form onSubmit={guardar} className="h-fit rounded-xl border border-white/10 bg-ink-900 p-5">
        <h2 className="font-display text-sm uppercase tracking-widest text-gold-400">Nuevo permiso</h2>
        {!barberoFijo && (
          <label className={`mt-4 ${etiqueta}`}>
            Barbero
            <select name="barberoID" value={barberoElegido} onChange={cambio} className={`mt-2 ${inputClase}`}>
              {barberos.map((b) => (
                <option key={b.barberoID} value={b.barberoID}>
                  {b.nombre} {b.apellido}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={etiqueta}>
            Desde
            <input type="date" name="fecha_inicio" min={hoy} value={form.fecha_inicio} onChange={cambio} required className={`mt-2 ${inputClase}`} />
          </label>
          <label className={etiqueta}>
            Hasta
            <input type="date" name="fecha_fin" min={form.fecha_inicio || hoy} value={form.fecha_fin} onChange={cambio} className={`mt-2 ${inputClase}`} />
          </label>
        </div>
        <p className="mt-1 text-xs text-cream-200/50">Deja “Hasta” vacío para un solo día.</p>
        <label className={`mt-3 ${etiqueta}`}>
          Motivo (opcional, no se muestra al público)
          <input name="motivo" value={form.motivo} onChange={cambio} maxLength={120} placeholder="Vacaciones, cita médica…" className={`mt-2 ${inputClase}`} />
        </label>
        {aviso && (
          <p className={`mt-4 text-sm ${aviso.ok ? 'text-emerald-300' : 'text-amber-200'}`}>{aviso.texto}</p>
        )}
        <button type="submit" disabled={enviando || (!barberoFijo && !barberoElegido)} className={`mt-5 w-full ${botonPrimario}`}>
          {enviando ? 'Guardando…' : 'Guardar permiso'}
        </button>
      </form>
    </div>
  )
}
