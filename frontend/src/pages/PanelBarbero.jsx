import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getBarberos, actualizarBarbero, subirFotoBarbero } from '../api/barberos'
import { getCitas } from '../api/citas'
import { getServicios } from '../api/servicios'
import {
  getServiciosDeBarbero,
  asignarServicio,
  desasignarServicio,
} from '../api/barberoServicios'
import { getHorariosDeBarbero, guardarHorario, eliminarHorario } from '../api/horarios'
import { mensajeDeError } from '../api/client'
import GestionPermisos from '../components/GestionPermisos'
import { urlImagen, iniciales, DIAS_SEMANA } from '../utils/formato'
import { inputClase } from '../ui/estilos'
import AppHeader from '../components/AppHeader'
import ListaCitas from '../components/ListaCitas'

const DIAS = DIAS_SEMANA

const pestanas = ['Agenda', 'Horario', 'Permisos', 'Servicios', 'Perfil']

export default function PanelBarbero() {
  const { usuario } = useAuth()

  const [miID, setMiID] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [sinPerfil, setSinPerfil] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  // La pestaña va en la URL para que una recarga vuelva a la misma pestaña.
  const [params, setParams] = useSearchParams()
  const pestana = pestanas.includes(params.get('pestana')) ? params.get('pestana') : 'Agenda'
  const setPestana = (p) => setParams(p === 'Agenda' ? {} : { pestana: p }, { replace: true })

  const [citas, setCitas] = useState([])
  const [horarios, setHorarios] = useState([])
  const [servicios, setServicios] = useState([])
  const [misServicios, setMisServicios] = useState(new Set())

  const [formHorario, setFormHorario] = useState({
    dia_semana: DIAS[0],
    hora_inicio: '09:00',
    hora_fin: '17:00',
    // Vacíos = sin almuerzo ese día.
    almuerzo_inicio: '12:00',
    almuerzo_fin: '13:00',
  })
  const [aviso, setAviso] = useState(null)

  const [formPerfil, setFormPerfil] = useState({
    descripcion: '',
    especialidad: '',
    instagram: '',
    telefono: '',
  })
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const inputFoto = useRef(null)

  useEffect(() => {
    let activo = true

    async function cargar() {
      try {
        const barberos = await getBarberos()
        const mio = barberos.find((b) => b.usuarioID === usuario.usuarioID)
        if (!mio) {
          if (activo) setSinPerfil(true)
          return
        }
        if (activo) setMiID(mio.barberoID)
        if (activo) {
          setPerfil(mio)
          setFormPerfil({
            descripcion: mio.descripcion ?? '',
            especialidad: mio.especialidad ?? '',
            instagram: mio.instagram ?? '',
            telefono: mio.telefono_contacto ?? '',
          })
        }

        const [todasCitas, h, todosServicios, asignados] = await Promise.all([
          getCitas(),
          getHorariosDeBarbero(mio.barberoID),
          getServicios(),
          getServiciosDeBarbero(mio.barberoID),
        ])
        if (!activo) return
        setCitas(todasCitas.filter((c) => c.barberoID === mio.barberoID))
        setHorarios(h)
        setServicios(todosServicios)
        setMisServicios(new Set(asignados.map((s) => s.serviciosID)))
      } catch (err) {
        if (activo) setError(mensajeDeError(err))
      } finally {
        if (activo) setCargando(false)
      }
    }

    cargar()
    return () => {
      activo = false
    }
  }, [usuario])

  async function guardar(e) {
    e.preventDefault()
    setAviso(null)
    try {
      const guardado = await guardarHorario({
        barberoID: miID,
        dia_semana: formHorario.dia_semana,
        hora_inicio: formHorario.hora_inicio,
        hora_fin: formHorario.hora_fin,
        almuerzo_inicio: formHorario.almuerzo_inicio || null,
        almuerzo_fin: formHorario.almuerzo_fin || null,
      })
      setHorarios((prev) => {
        const sinDia = prev.filter((h) => h.dia_semana !== guardado.dia_semana)
        return [...sinDia, guardado].sort(
          (a, b) => DIAS.indexOf(a.dia_semana) - DIAS.indexOf(b.dia_semana),
        )
      })
      setAviso('Horario guardado.')
    } catch (err) {
      setAviso(mensajeDeError(err))
    }
  }

  async function borrarHorario(dia) {
    setAviso(null)
    try {
      await eliminarHorario(miID, dia)
      setHorarios((prev) => prev.filter((h) => h.dia_semana !== dia))
    } catch (err) {
      setAviso(mensajeDeError(err))
    }
  }

  async function alternarServicio(servicio) {
    setAviso(null)
    const asignado = misServicios.has(servicio.serviciosID)
    try {
      if (asignado) {
        await desasignarServicio(miID, servicio.serviciosID)
        setMisServicios((prev) => {
          const n = new Set(prev)
          n.delete(servicio.serviciosID)
          return n
        })
      } else {
        await asignarServicio(miID, servicio.serviciosID)
        setMisServicios((prev) => new Set(prev).add(servicio.serviciosID))
      }
    } catch (err) {
      setAviso(mensajeDeError(err))
    }
  }

  async function guardarPerfil(e) {
    e.preventDefault()
    setAviso(null)
    setGuardandoPerfil(true)
    try {
      const actualizado = await actualizarBarbero(miID, formPerfil)
      setPerfil(actualizado)
      setAviso('Perfil actualizado.')
    } catch (err) {
      setAviso(mensajeDeError(err))
    } finally {
      setGuardandoPerfil(false)
    }
  }

  async function cambiarFoto(e) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setAviso(null)
    setSubiendoFoto(true)
    try {
      const actualizado = await subirFotoBarbero(miID, archivo)
      setPerfil(actualizado)
      setAviso('Foto actualizada.')
    } catch (err) {
      setAviso(mensajeDeError(err))
    } finally {
      setSubiendoFoto(false)
      if (inputFoto.current) inputFoto.current.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <AppHeader />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-5 sm:py-10">
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide sm:text-3xl">
          Mi agenda
        </h1>

        {cargando && <p className="mt-6 text-cream-200/70">Cargando…</p>}
        {error && <p className="mt-6 text-red-400">{error}</p>}
        {sinPerfil && (
          <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200">
            Tu usuario no tiene perfil de barbero. Pide a un administrador que te
            registre como barbero.
          </p>
        )}

        {!cargando && !error && !sinPerfil && (
          <>
            <div className="scroll-x-fino -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              {pestanas.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPestana(p)
                    setAviso(null)
                  }}
                  className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold uppercase tracking-wider transition ${
                    pestana === p
                      ? 'bg-gold-500 text-ink-950'
                      : 'border border-white/15 text-cream-200 hover:border-gold-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {aviso && (
              <p className="mt-4 rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm text-cream-200">
                {aviso}
              </p>
            )}

            <div className="mt-6">
              {pestana === 'Agenda' && (
                <ListaCitas citas={citas} modo="barbero" />
              )}

              {pestana === 'Horario' && (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    {horarios.length === 0 && (
                      <p className="text-cream-200/60">
                        Aún no has configurado tu horario.
                      </p>
                    )}
                    {horarios.map((h) => (
                      <div
                        key={h.horarioID}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-ink-800 px-4 py-3"
                      >
                        <span className="capitalize text-cream-50">
                          {h.dia_semana}
                        </span>
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
                            setFormHorario({
                              dia_semana: h.dia_semana,
                              hora_inicio: h.hora_inicio.slice(0, 5),
                              hora_fin: h.hora_fin.slice(0, 5),
                              almuerzo_inicio: h.almuerzo_inicio ? h.almuerzo_inicio.slice(0, 5) : '',
                              almuerzo_fin: h.almuerzo_fin ? h.almuerzo_fin.slice(0, 5) : '',
                            })
                          }
                          className="text-xs uppercase tracking-wider text-gold-300 hover:text-gold-200"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => borrarHorario(h.dia_semana)}
                          className="text-xs uppercase tracking-wider text-red-300 hover:text-red-200"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>

                  <form
                    onSubmit={guardar}
                    className="h-fit rounded-xl border border-white/10 bg-ink-900 p-4 sm:p-5"
                  >
                    <h2 className="font-display text-sm uppercase tracking-widest text-gold-400">
                      Agregar o editar día
                    </h2>
                    <label className="mt-4 block text-xs uppercase tracking-wider text-cream-200/70">
                      Día
                      <select
                        value={formHorario.dia_semana}
                        onChange={(e) =>
                          setFormHorario((f) => ({ ...f, dia_semana: e.target.value }))
                        }
                        className={`mt-2 ${inputClase} capitalize`}
                      >
                        {DIAS.map((d) => (
                          <option key={d} value={d} className="capitalize">
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                        Inicio
                        <input
                          type="time"
                          value={formHorario.hora_inicio}
                          onChange={(e) =>
                            setFormHorario((f) => ({ ...f, hora_inicio: e.target.value }))
                          }
                          className={`mt-2 ${inputClase}`}
                        />
                      </label>
                      <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                        Fin
                        <input
                          type="time"
                          value={formHorario.hora_fin}
                          onChange={(e) =>
                            setFormHorario((f) => ({ ...f, hora_fin: e.target.value }))
                          }
                          className={`mt-2 ${inputClase}`}
                        />
                      </label>
                    </div>
                    <p className="mt-4 text-xs uppercase tracking-wider text-cream-200/70">
                      Hora de almuerzo
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                        Desde
                        <input
                          type="time"
                          value={formHorario.almuerzo_inicio}
                          onChange={(e) =>
                            setFormHorario((f) => ({ ...f, almuerzo_inicio: e.target.value }))
                          }
                          className={`mt-2 ${inputClase}`}
                        />
                      </label>
                      <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                        Hasta
                        <input
                          type="time"
                          value={formHorario.almuerzo_fin}
                          onChange={(e) =>
                            setFormHorario((f) => ({ ...f, almuerzo_fin: e.target.value }))
                          }
                          className={`mt-2 ${inputClase}`}
                        />
                      </label>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-cream-200/50">En ese tramo no se aceptan reservas.</p>
                      <button
                        type="button"
                        onClick={() =>
                          setFormHorario((f) => ({ ...f, almuerzo_inicio: '', almuerzo_fin: '' }))
                        }
                        className="text-xs uppercase tracking-wider text-cream-200/60 hover:text-cream-50"
                      >
                        Sin almuerzo
                      </button>
                    </div>
                    <button
                      type="submit"
                      className="mt-5 w-full rounded-full bg-gold-500 py-2.5 text-sm font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400"
                    >
                      Guardar
                    </button>
                  </form>
                </div>
              )}

              {pestana === 'Permisos' && miID && (
                <GestionPermisos barberoFijo={{ barberoID: miID }} />
              )}

              {pestana === 'Servicios' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {servicios.map((s) => {
                    const asignado = misServicios.has(s.serviciosID)
                    return (
                      <button
                        key={s.serviciosID}
                        type="button"
                        onClick={() => alternarServicio(s)}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                          asignado
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-white/10 bg-ink-800 hover:border-gold-500/50'
                        }`}
                      >
                        <span className="text-sm text-cream-50">{s.nombre}</span>
                        <span
                          className={`text-xs uppercase tracking-wider ${
                            asignado ? 'text-emerald-300' : 'text-cream-200/50'
                          }`}
                        >
                          {asignado ? 'Asignado' : 'Asignar'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {pestana === 'Perfil' && perfil && (
                <form
                  onSubmit={guardarPerfil}
                  className="rounded-2xl border border-white/10 bg-ink-900 p-4 sm:p-6"
                >
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                    {perfil.foto_url ? (
                      <img
                        src={urlImagen(perfil.foto_url)}
                        alt="Foto de perfil"
                        className="h-24 w-24 rounded-full object-cover ring-2 ring-gold-500/60"
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-gold-500 to-gold-700 font-display text-3xl font-bold text-ink-950">
                        {iniciales(perfil.nombre, perfil.apellido)}
                      </div>
                    )}
                    <div className="text-center sm:text-left">
                      <h2 className="font-display text-xl font-semibold uppercase tracking-wide">
                        {perfil.nombre} {perfil.apellido}
                      </h2>
                      <p className="text-sm text-cream-200/60">{perfil.correo}</p>
                      <input
                        ref={inputFoto}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={cambiarFoto}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => inputFoto.current?.click()}
                        disabled={subiendoFoto}
                        className="mt-3 rounded-full border border-gold-500/50 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-gold-300 transition hover:bg-gold-500 hover:text-ink-950 disabled:opacity-50"
                      >
                        {subiendoFoto ? 'Subiendo…' : 'Cambiar foto'}
                      </button>
                      <p className="mt-2 text-xs text-cream-200/40">
                        JPG, PNG, WEBP o GIF · máx. 5 MB
                      </p>
                    </div>
                  </div>

                  <label className="mt-6 block text-xs uppercase tracking-wider text-cream-200/70">
                    Descripción
                    <textarea
                      value={formPerfil.descripcion}
                      onChange={(e) =>
                        setFormPerfil((f) => ({ ...f, descripcion: e.target.value }))
                      }
                      rows={3}
                      maxLength={280}
                      placeholder="Cuéntales a tus clientes sobre tu estilo y experiencia."
                      className={`mt-2 resize-none ${inputClase}`}
                    />
                  </label>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                      Especialidad
                      <input
                        type="text"
                        value={formPerfil.especialidad}
                        onChange={(e) =>
                          setFormPerfil((f) => ({ ...f, especialidad: e.target.value }))
                        }
                        placeholder="Fade, barba…"
                        className={`mt-2 ${inputClase}`}
                      />
                    </label>
                    <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                      Instagram
                      <input
                        type="text"
                        value={formPerfil.instagram}
                        onChange={(e) =>
                          setFormPerfil((f) => ({ ...f, instagram: e.target.value }))
                        }
                        placeholder="@usuario"
                        className={`mt-2 ${inputClase}`}
                      />
                    </label>
                    <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                      Teléfono
                      <input
                        type="tel"
                        value={formPerfil.telefono}
                        onChange={(e) =>
                          setFormPerfil((f) => ({ ...f, telefono: e.target.value }))
                        }
                        placeholder="300 000 0000"
                        className={`mt-2 ${inputClase}`}
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={guardandoPerfil}
                    className="mt-6 w-full rounded-full bg-gold-500 py-2.5 text-sm font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400 disabled:opacity-50 sm:w-auto sm:px-8"
                  >
                    {guardandoPerfil ? 'Guardando…' : 'Guardar perfil'}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
