import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMisEsperas, salirListaEspera } from '../api/listaEspera'
import { mensajeDeError } from '../api/client'
import { tarjeta, botonEliminar } from '../ui/estilos'
import { formatearFechaLarga } from '../utils/formato'

/*
 * Entradas de la lista de espera del cliente, en "Mis citas". Si ya se liberó
 * una hora que le sirve, se le ofrece reservarla directamente.
 */
export default function MisEsperas() {
  const [esperas, setEsperas] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    getMisEsperas()
      .then((e) => activo && setEsperas(e))
      .catch((err) => activo && setError(mensajeDeError(err)))
    return () => {
      activo = false
    }
  }, [])

  async function salir(e) {
    try {
      await salirListaEspera(e.esperaID)
      setEsperas((prev) => prev.filter((x) => x.esperaID !== e.esperaID))
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  if (!error && esperas.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-lg uppercase tracking-wide text-gold-400">Lista de espera</h2>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="space-y-2">
        {esperas.map((e) => (
          <div key={e.esperaID} className={`${tarjeta} flex flex-wrap items-center gap-3 px-4 py-3`}>
            <div className="mr-auto">
              <p className="text-cream-50">
                {formatearFechaLarga(e.fecha)} · {e.servicio_nombre} con {e.barbero_nombre}
              </p>
              {e.huecos.length > 0 ? (
                <p className="text-sm text-emerald-300">
                  ¡Se liberó una hora! Disponible: {e.huecos.slice(0, 4).join(', ')}
                </p>
              ) : (
                <p className="text-xs text-cream-200/60">
                  Esperando a que se libere una hora
                  {e.hora_desde && ` entre ${e.hora_desde} y ${e.hora_hasta}`}.
                </p>
              )}
            </div>
            {e.huecos.length > 0 && (
              <Link
                to={`/reservar?barbero=${e.barberoID}&servicio=${e.servicioID}`}
                className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-950 hover:bg-gold-400"
              >
                Reservar
              </Link>
            )}
            <button type="button" onClick={() => salir(e)} className={botonEliminar}>
              Salir
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
