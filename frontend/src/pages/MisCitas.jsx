import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getCitas } from '../api/citas'
import { mensajeDeError } from '../api/client'
import AppHeader from '../components/AppHeader'
import ListaCitas from '../components/ListaCitas'
import MisEsperas from '../components/MisEsperas'

export default function MisCitas() {
  const { usuario } = useAuth()
  const [citas, setCitas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const modo =
    usuario.rol === 'cliente' ? 'cliente' : usuario.rol === 'barbero' ? 'barbero' : 'equipo'

  useEffect(() => {
    let activo = true

    // El backend acota la lista según el rol del token (cliente: solo las suyas;
    // barbero: solo las de su agenda), así que aquí no hace falta filtrar.
    getCitas()
      .then((data) => {
        if (!activo) return
        setCitas(data)
      })
      .catch((err) => activo && setError(mensajeDeError(err)))
      .finally(() => activo && setCargando(false))

    return () => {
      activo = false
    }
  }, [])

  function actualizar(actualizada) {
    setCitas((prev) =>
      prev.map((c) => (c.citaID === actualizada.citaID ? { ...c, ...actualizada } : c)),
    )
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <AppHeader />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-5 sm:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide sm:text-3xl">
            Mis citas
          </h1>
          <Link
            to="/reservar"
            className="rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400"
          >
            Nueva cita
          </Link>
        </div>

        {usuario.rol === 'cliente' && <MisEsperas />}

        {cargando && <p className="text-cream-200/70">Cargando citas…</p>}
        {error && <p className="text-red-400">{error}</p>}

        {!cargando && !error && (
          <ListaCitas citas={citas} modo={modo} onCambio={actualizar} />
        )}
      </div>
    </div>
  )
}
