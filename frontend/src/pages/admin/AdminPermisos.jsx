import { useEffect, useState } from 'react'
import { getBarberos } from '../../api/barberos'
import { mensajeDeError } from '../../api/client'
import GestionPermisos from '../../components/GestionPermisos'

// Pestaña "Permisos" del panel: vacaciones y permisos de todos los barberos.
export default function AdminPermisos() {
  const [barberos, setBarberos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    getBarberos()
      .then((b) => activo && setBarberos(b))
      .catch((err) => activo && setError(mensajeDeError(err)))
    return () => {
      activo = false
    }
  }, [])

  if (error) return <p className="text-red-400">{error}</p>
  if (!barberos) return <p className="text-cream-200/70">Cargando barberos…</p>
  if (barberos.length === 0) return <p className="text-cream-200/70">Todavía no hay barberos registrados.</p>
  return <GestionPermisos barberos={barberos} />
}
