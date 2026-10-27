import { useState } from 'react'
import { apuntarseListaEspera } from '../api/listaEspera'
import { mensajeDeError } from '../api/client'
import { inputClase, botonPrimario, etiqueta } from '../ui/estilos'
import { formatearFechaLarga } from '../utils/formato'

/*
 * "Apúntame a la lista de espera" del paso de fecha y hora.
 *
 * Se abre plegado; si el día está lleno (`lleno`) se muestra destacado. Con
 * sesión de cliente no pide datos: la API usa los de la cuenta.
 */
export default function ListaEsperaForm({ barbero, servicio, fecha, conSesion, lleno }) {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState({ nombre: '', telefono: '', hora_desde: '', hora_hasta: '', nota: '' })
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null) // { ok, texto }

  const clave = `${barbero.barberoID}-${servicio.serviciosID}-${fecha}`
  const [claveEnviada, setClaveEnviada] = useState(null)
  const yaApuntado = claveEnviada === clave

  function cambio(e) {
    setDatos((d) => ({ ...d, [e.target.name]: e.target.value }))
  }

  async function enviar(e) {
    e.preventDefault()
    setEnviando(true)
    setResultado(null)
    try {
      const r = await apuntarseListaEspera({
        barberoID: barbero.barberoID,
        servicioID: servicio.serviciosID,
        fecha,
        ...(conSesion ? {} : { nombre: datos.nombre, telefono: datos.telefono }),
        hora_desde: datos.hora_desde || undefined,
        hora_hasta: datos.hora_hasta || undefined,
        nota: datos.nota || undefined,
      })
      setResultado({ ok: true, texto: r.message })
      setClaveEnviada(clave)
    } catch (err) {
      setResultado({ ok: false, texto: mensajeDeError(err) })
    } finally {
      setEnviando(false)
    }
  }

  if (yaApuntado) {
    return (
      <p className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
        {resultado?.texto}
      </p>
    )
  }

  return (
    <div className={`mt-5 rounded-xl border p-4 ${lleno ? 'border-gold-500/50 bg-gold-500/5' : 'border-white/10'}`}>
      {!abierto ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-cream-200/80">
            {lleno
              ? `No quedan horas el ${formatearFechaLarga(fecha)}.`
              : '¿No te sirve ninguna de estas horas?'}{' '}
            Apúntate a la lista de espera y te avisamos por WhatsApp si se libera una.
          </p>
          <button type="button" onClick={() => setAbierto(true)} className={botonPrimario}>
            Lista de espera
          </button>
        </div>
      ) : (
        <form onSubmit={enviar}>
          <p className="font-display text-sm uppercase tracking-widest text-gold-400">Lista de espera</p>
          <p className="mt-1 text-xs text-cream-200/60">
            {servicio.nombre} con {barbero.nombre} · {formatearFechaLarga(fecha)}
          </p>
          {!conSesion && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={etiqueta}>
                Nombre
                <input name="nombre" value={datos.nombre} onChange={cambio} required className={`mt-1 ${inputClase}`} />
              </label>
              <label className={etiqueta}>
                Teléfono (WhatsApp)
                <input name="telefono" value={datos.telefono} onChange={cambio} required inputMode="tel" placeholder="0414-1234567" className={`mt-1 ${inputClase}`} />
              </label>
            </div>
          )}
          <p className={`mt-3 ${etiqueta}`}>¿A qué hora te viene bien? (opcional)</p>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <input type="time" name="hora_desde" value={datos.hora_desde} onChange={cambio} aria-label="Desde" className={inputClase} />
            <input type="time" name="hora_hasta" value={datos.hora_hasta} onChange={cambio} aria-label="Hasta" className={inputClase} />
          </div>
          <label className={`mt-3 ${etiqueta}`}>
            Nota (opcional)
            <input name="nota" value={datos.nota} onChange={cambio} maxLength={200} className={`mt-1 ${inputClase}`} />
          </label>
          {resultado && !resultado.ok && <p className="mt-3 text-sm text-red-300">{resultado.texto}</p>}
          <div className="mt-4 flex items-center gap-4">
            <button type="button" onClick={() => setAbierto(false)} className="text-sm text-cream-200/60 hover:text-gold-400">
              Cancelar
            </button>
            <button type="submit" disabled={enviando} className={`ml-auto ${botonPrimario}`}>
              {enviando ? 'Apuntando…' : 'Apuntarme'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
