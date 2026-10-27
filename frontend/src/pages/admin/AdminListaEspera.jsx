import { useEffect, useState } from 'react'
import { getListaEspera, cambiarEstadoEspera, salirListaEspera } from '../../api/listaEspera'
import { mensajeDeError } from '../../api/client'
import { botonExito, botonEliminar, botonSecundario, tarjeta } from '../../ui/estilos'
import { formatearFechaLarga, enlaceWhatsAppNumero } from '../../utils/formato'

const ETIQUETA = {
  esperando: { texto: 'Esperando', clase: 'bg-amber-500/15 text-amber-200' },
  avisado: { texto: 'Avisado', clase: 'bg-sky-500/15 text-sky-200' },
  atendido: { texto: 'Consiguió cita', clase: 'bg-emerald-500/15 text-emerald-200' },
  cancelado: { texto: 'Cancelado', clase: 'bg-white/10 text-cream-200/60' },
}

/*
 * Lista de espera del panel.
 *
 * Arriba salen las personas para las que YA hay una hora libre que les sirve
 * (se calcula en cada carga). El botón de WhatsApp abre el chat con el
 * mensaje escrito y marca la entrada como "avisado".
 */
export default function AdminListaEspera() {
  const [esperas, setEsperas] = useState([])
  const [todas, setTodas] = useState(false)
  const [version, setVersion] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    getListaEspera({ todas })
      .then((e) => {
        if (!activo) return
        setEsperas(e)
        setError(null)
      })
      .catch((err) => activo && setError(mensajeDeError(err)))
      .finally(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [todas, version])

  // Vuelve a pedir la lista (y a calcular las horas libres).
  const cargar = () => {
    setCargando(true)
    setVersion((v) => v + 1)
  }

  async function cambiar(e, estado) {
    try {
      const nueva = estado === 'cancelado' ? null : await cambiarEstadoEspera(e.esperaID, estado)
      if (estado === 'cancelado') await salirListaEspera(e.esperaID)
      setEsperas((prev) =>
        prev
          .map((x) => (x.esperaID === e.esperaID ? nueva ?? { ...x, estado } : x))
          .filter((x) => todas || ['esperando', 'avisado'].includes(x.estado)),
      )
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  function avisar(e) {
    const horas = e.huecos.slice(0, 4).join(', ')
    const enlace = enlaceWhatsAppNumero(
      e.telefono,
      `Hola ${e.nombre}, te escribimos de Spring Barber Shop: se liberó una hora con ${e.barbero_nombre} el ${formatearFechaLarga(e.fecha)} para ${e.servicio_nombre} (${horas}). ¿Te la reservamos?`,
    )
    if (enlace) window.open(enlace, '_blank', 'noreferrer')
    if (e.estado === 'esperando') cambiar(e, 'avisado')
  }

  const conHueco = esperas.filter((e) => e.huecos?.length > 0)
  const sinHueco = esperas.filter((e) => !e.huecos?.length)

  const fila = (e) => (
    <div key={e.esperaID} className={`${tarjeta} flex flex-wrap items-center gap-3 px-4 py-3`}>
      <div className="mr-auto min-w-[12rem]">
        <p className="text-cream-50">
          {e.nombre} <span className="text-xs text-cream-200/60">· {e.telefono}</span>
        </p>
        <p className="text-xs text-cream-200/70">
          {formatearFechaLarga(e.fecha)} · {e.barbero_nombre} {e.barbero_apellido} · {e.servicio_nombre}
          {e.hora_desde && ` · entre ${e.hora_desde} y ${e.hora_hasta}`}
        </p>
        {e.nota && <p className="text-xs italic text-cream-200/50">“{e.nota}”</p>}
        {e.huecos?.length > 0 && (
          <p className="mt-1 text-xs text-emerald-300">Horas libres: {e.huecos.join(', ')}</p>
        )}
      </div>
      <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-wider ${ETIQUETA[e.estado].clase}`}>
        {ETIQUETA[e.estado].texto}
      </span>
      {['esperando', 'avisado'].includes(e.estado) && (
        <>
          {e.huecos?.length > 0 && (
            <button type="button" onClick={() => avisar(e)} className={botonExito}>
              Avisar por WhatsApp
            </button>
          )}
          <button type="button" onClick={() => cambiar(e, 'atendido')} className={botonSecundario}>
            Ya tiene cita
          </button>
          <button type="button" onClick={() => cambiar(e, 'cancelado')} className={botonEliminar}>
            Quitar
          </button>
        </>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-cream-200/60">
          Clientes que esperan que se libere una hora. Cuando reservan ese día con ese barbero,
          salen solos de la lista.
        </p>
        <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-cream-200/70">
          <input type="checkbox" checked={todas} onChange={(ev) => {
              setCargando(true)
              setTodas(ev.target.checked)
            }} />
          Ver también atendidas y pasadas
        </label>
        <button type="button" onClick={cargar} className={botonSecundario}>
          Actualizar
        </button>
      </div>
      {cargando && <p className="text-cream-200/70">Cargando lista de espera…</p>}
      {error && <p className="text-red-400">{error}</p>}
      {!cargando && !error && esperas.length === 0 && (
        <p className="text-cream-200/60">Nadie está en la lista de espera.</p>
      )}
      {conHueco.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-display text-sm uppercase tracking-widest text-emerald-300">
            Hay hora libre para ellos ({conHueco.length})
          </h3>
          {conHueco.map(fila)}
        </div>
      )}
      {sinHueco.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-display text-sm uppercase tracking-widest text-gold-400">
            Esperando ({sinHueco.length})
          </h3>
          {sinHueco.map(fila)}
        </div>
      )}
    </div>
  )
}
