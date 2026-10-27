import { useEffect, useState } from 'react'
import { getBarberos } from '../../api/barberos'
import { getHorariosDeBarbero, guardarHorario, eliminarHorario } from '../../api/horarios'
import { mensajeDeError } from '../../api/client'
import { inputClase, botonPrimario, etiqueta, tarjeta } from '../../ui/estilos'
import { DIAS_SEMANA } from '../../utils/formato'

const DIAS = DIAS_SEMANA

export default function AdminHorarios() {
  const [barberos, setBarberos] = useState([])
  const [barberoID, setBarberoID] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [guardando, setGuardando] = useState(false)
  // El almuerzo viene relleno de 12:00 a 13:00; se deja vacío para un día sin almuerzo.
  const [form, setForm] = useState({
    dia_semana: DIAS[0],
    hora_inicio: '09:00',
    hora_fin: '18:00',
    almuerzo_inicio: '12:00',
    almuerzo_fin: '13:00',
  })

  // Horarios cargados y a qué barbero pertenecen: así el estado de "cargando" se
  // deriva comparando el barbero seleccionado con el último cargado, en lugar de
  // llamar a setState dentro del efecto.
  const [datos, setDatos] = useState({ barberoID: null, horarios: [], error: null })

  useEffect(() => {
    let activo = true
    getBarberos()
      .then((b) => {
        if (!activo) return
        setBarberos(b)
        if (b.length > 0) setBarberoID(String(b[0].barberoID))
      })
      .catch((err) => activo && setError(mensajeDeError(err)))
      .finally(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [])

  useEffect(() => {
    if (!barberoID) return
    let activo = true
    getHorariosDeBarbero(barberoID)
      .then((h) => activo && setDatos({ barberoID, horarios: h, error: null }))
      .catch((err) => activo && setDatos({ barberoID, horarios: [], error: mensajeDeError(err) }))
    return () => {
      activo = false
    }
  }, [barberoID])

  const coincide = String(datos.barberoID) === String(barberoID)
  const horarios = coincide ? datos.horarios : []
  const cargandoHorarios = !!barberoID && !coincide
  const errorHorarios = coincide ? datos.error : null
  const barbero = barberos.find((b) => b.barberoID === Number(barberoID))

  function cambio(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function guardar(e) {
    e.preventDefault()
    setAviso(null)
    if (!barberoID) {
      setAviso('Selecciona un barbero.')
      return
    }
    setGuardando(true)
    try {
      const guardado = await guardarHorario({
        barberoID: Number(barberoID),
        dia_semana: form.dia_semana,
        hora_inicio: form.hora_inicio,
        hora_fin: form.hora_fin,
        almuerzo_inicio: form.almuerzo_inicio || null,
        almuerzo_fin: form.almuerzo_fin || null,
      })
      setDatos((prev) => {
        const sinDia = prev.horarios.filter((h) => h.dia_semana !== guardado.dia_semana)
        return {
          ...prev,
          horarios: [...sinDia, guardado].sort(
            (a, b) => DIAS.indexOf(a.dia_semana) - DIAS.indexOf(b.dia_semana),
          ),
        }
      })
      setAviso('Horario guardado.')
    } catch (err) {
      setAviso(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function quitar(dia) {
    setAviso(null)
    try {
      await eliminarHorario(barberoID, dia)
      setDatos((prev) => ({
        ...prev,
        horarios: prev.horarios.filter((h) => h.dia_semana !== dia),
      }))
    } catch (err) {
      setAviso(mensajeDeError(err))
    }
  }

  if (cargando) return <p className="text-cream-200/70">Cargando barberos…</p>
  if (error) return <p className="text-red-400">{error}</p>
  if (barberos.length === 0) {
    return <p className="text-cream-200/70">Todavía no hay barberos registrados.</p>
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <label className={`${etiqueta} max-w-xs`}>
          Barbero
          <select
            value={barberoID}
            onChange={(e) => {
              setBarberoID(e.target.value)
              setAviso(null)
            }}
            className={`mt-2 ${inputClase}`}
          >
            {barberos.map((b) => (
              <option key={b.barberoID} value={b.barberoID}>
                {b.nombre} {b.apellido}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 space-y-2">
          {cargandoHorarios && <p className="text-cream-200/70">Cargando horario…</p>}
          {errorHorarios && <p className="text-red-400">{errorHorarios}</p>}
          {!cargandoHorarios && !errorHorarios && horarios.length === 0 && (
            <p className="text-cream-200/60">
              {barbero ? `${barbero.nombre} ${barbero.apellido}` : 'Este barbero'} no tiene
              horario configurado.
            </p>
          )}
          {horarios.map((h) => (
            <div key={h.horarioID} className={`${tarjeta} flex items-center gap-3 px-4 py-3`}>
              <span className="w-28 capitalize text-cream-50">{h.dia_semana}</span>
              <span className="text-sm text-cream-200/70">
                {h.hora_inicio.slice(0, 5)} – {h.hora_fin.slice(0, 5)}
                <span className="block text-xs text-cream-200/50">
                  {h.almuerzo_inicio && h.almuerzo_fin
                    ? `Almuerzo ${h.almuerzo_inicio.slice(0, 5)} – ${h.almuerzo_fin.slice(0, 5)}`
                    : 'Sin almuerzo'}
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    dia_semana: h.dia_semana,
                    hora_inicio: h.hora_inicio.slice(0, 5),
                    hora_fin: h.hora_fin.slice(0, 5),
                    almuerzo_inicio: h.almuerzo_inicio ? h.almuerzo_inicio.slice(0, 5) : '',
                    almuerzo_fin: h.almuerzo_fin ? h.almuerzo_fin.slice(0, 5) : '',
                  })
                }
                className="ml-auto text-xs uppercase tracking-wider text-gold-300 transition hover:text-gold-200"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => quitar(h.dia_semana)}
                className="text-xs uppercase tracking-wider text-red-300 transition hover:text-red-200"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={guardar} className="h-fit rounded-xl border border-white/10 bg-ink-900 p-5">
        <h2 className="font-display text-sm uppercase tracking-widest text-gold-400">
          Agregar o editar día
        </h2>

        <label className={`mt-4 ${etiqueta}`}>
          Día
          <select name="dia_semana" value={form.dia_semana} onChange={cambio} className={`mt-2 ${inputClase} capitalize`}>
            {DIAS.map((d) => (
              <option key={d} value={d} className="capitalize">
                {d}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={etiqueta}>
            Inicio
            <input type="time" name="hora_inicio" value={form.hora_inicio} onChange={cambio} className={`mt-2 ${inputClase}`} />
          </label>
          <label className={etiqueta}>
            Fin
            <input type="time" name="hora_fin" value={form.hora_fin} onChange={cambio} className={`mt-2 ${inputClase}`} />
          </label>
        </div>

        <p className={`mt-4 ${etiqueta}`}>Hora de almuerzo</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className={etiqueta}>
            Desde
            <input type="time" name="almuerzo_inicio" value={form.almuerzo_inicio} onChange={cambio} className={`mt-2 ${inputClase}`} />
          </label>
          <label className={etiqueta}>
            Hasta
            <input type="time" name="almuerzo_fin" value={form.almuerzo_fin} onChange={cambio} className={`mt-2 ${inputClase}`} />
          </label>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-cream-200/50">En ese tramo no se aceptan reservas.</p>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, almuerzo_inicio: '', almuerzo_fin: '' }))}
            className="text-xs uppercase tracking-wider text-cream-200/60 hover:text-cream-50"
          >
            Sin almuerzo
          </button>
        </div>

        {aviso && <p className="mt-4 text-sm text-amber-200">{aviso}</p>}

        <button type="submit" disabled={guardando} className={`mt-5 w-full ${botonPrimario}`}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}
