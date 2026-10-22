import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cambiarEstadoCita, reprogramarCita, solicitarCancelacionCita, confirmarReembolsoCita, rechazarCancelacionCita, eliminarCita } from '../api/citas'
import { mensajeDeError } from '../api/client'
import { fechaHora, aInputFechaHora, precio, nombreCliente } from '../utils/formato'
import { ESTADOS_CITA, mensajeDenegacion } from '../utils/pago'
import { botonEliminar } from '../ui/estilos'
import EstadoPagoBadge from './EstadoPagoBadge'

const ESTADOS = ESTADOS_CITA

const SIGUIENTES = {
  pendiente: ['confirmada', 'cancelada'],
  confirmada: ['completada', 'cancelada'],
  completada: [],
  cancelada: [],
  denegada: [],
  cancelacion_solicitada: [],
}

const ETIQUETA = {
  confirmada: 'Confirmar',
  completada: 'Completar',
  cancelada: 'Cancelar',
}

// Enlaces del cliente para reprogramar/repetir una cita. Se exporta para poder
// reusarlo en otros listados de citas del cliente.
export function AccionesClienteCita({ cita, onCambio, setError }) {
  const puedeReprogramar = (cita.estado === 'pendiente' || cita.estado === 'confirmada') && cita.estado !== 'cancelacion_solicitada'
  // Ya no se muestra "Pagar" desde "Mis citas": si el pago queda pendiente
  // (comprobante en revisión o pago en el local) no tiene sentido volver a pagar
  // desde ahí, y si ya está completado tampoco.
  const pagoPendienteOCompletado =
    cita.pago_estado === 'pendiente' || cita.pago_estado === 'completado'
  const puedePagar =
    !pagoPendienteOCompletado &&
    !['cancelada', 'denegada', 'cancelacion_solicitada'].includes(cita.estado) &&
    (cita.pago_estado === 'rechazado' ||
      (!cita.pago_estado && cita.pago_metodo !== 'pago_movil'))
  const puedeRepetir = !pagoPendienteOCompletado && !['cancelada', 'denegada', 'cancelacion_solicitada'].includes(cita.estado)
  // Cancelar con reembolso: el espacio se libera al solicitarlo, pero la cita
  // solo queda cancelada cuando el administrador confirma el reembolso.
  const puedeSolicitarCancelacion = !['cancelada', 'denegada', 'completada', 'cancelacion_solicitada'].includes(cita.estado)

  async function solicitarCancelacion() {
    // Es una acción que el cliente no puede deshacer él solo (el reembolso lo
    // aprueba la peluquería), así que se pregunta antes de enviarla.
    if (
      !window.confirm(
        '¿Pedir la cancelación y el reembolso de esta cita?\n\n' +
          'La hora se libera de inmediato, pero la cita solo queda cancelada cuando ' +
          'la peluquería confirme la devolución.'
      )
    ) {
      return
    }
    try {
      const actualizada = await solicitarCancelacionCita(cita.citaID)
      onCambio?.(actualizada)
    } catch (e) {
      setError?.(mensajeDeError(e))
    }
  }

  return (
    <>
      {puedePagar && (
        <Link
          to={`/pagar/${cita.citaID}`}
          className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400 sm:py-1.5"
        >
          Pagar
        </Link>
      )}
      {puedeReprogramar && (
        <Link
          to={`/reservar?reprogramar=${cita.citaID}&barbero=${cita.barberoID}&servicio=${cita.servicioID}`}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cream-200/80 transition hover:border-gold-400 hover:text-gold-300 sm:py-1.5"
        >
          Reprogramar
        </Link>
      )}
      {puedeRepetir && (
        <Link
          to={`/reservar?barbero=${cita.barberoID}&servicio=${cita.servicioID}`}
          className="rounded-full border border-gold-500/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gold-300 transition hover:bg-gold-500 hover:text-ink-950 sm:py-1.5"
        >
          Repetir
        </Link>
      )}
      {puedeSolicitarCancelacion && (
        <button
          type="button"
          onClick={solicitarCancelacion}
          className="rounded-full border border-red-400/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-red-300 transition hover:bg-red-500/15 sm:py-1.5"
        >
          Cancelar y pedir reembolso
        </button>
      )}
    </>
  )
}

// modo: 'cliente' (solo puede cancelar) | 'equipo' (el admin cambia estado y
//       reprograma) | 'barbero' (solo lectura: el barbero únicamente consulta su
//       agenda, sin los datos personales del cliente ni los del pago)
//
//
// Solo el administrador puede borrar citas (con onEliminar).// `onEliminar` es opcional: si se pasa, la lista ofrece borrar la cita. Solo
// el panel de administración lo usa, porque es el único sitio desde donde se
// puede borrar una cita.
export default function ListaCitas({ citas, modo = 'cliente', onCambio, onEliminar }) {
  const [error, setError] = useState(null)
  const [ocupada, setOcupada] = useState(null)

  // Reprogramación: la cita que se está moviendo de fecha y la nueva hora.
  const [reprogramando, setReprogramando] = useState(null)
  const [nuevaFecha, setNuevaFecha] = useState('')

  async function cambiar(cita, estado) {
    setError(null)
    setOcupada(cita.citaID)
    try {
      const actualizada = await cambiarEstadoCita(cita.citaID, estado)
      onCambio?.(actualizada)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupada(null)
    }
  }

  // Mover una cita a otro día u hora. El backend aplica las mismas reglas que
  // una reserva nueva: horario laboral, día de descanso, feriado y que no se
  // solape con otra cita del barbero.
  function abrirReprogramar(cita) {
    setError(null)
    setReprogramando(cita.citaID)
    setNuevaFecha(aInputFechaHora(cita.fecha_inicio))
  }

  async function guardarReprogramacion(cita) {
    if (!nuevaFecha) {
      setError('Elige la nueva fecha y hora.')
      return
    }
    setError(null)
    setOcupada(cita.citaID)
    try {
      const actualizada = await reprogramarCita(cita.citaID, { fecha_hora: `${nuevaFecha}:00` })
      setReprogramando(null)
      setNuevaFecha('')
      onCambio?.(actualizada)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupada(null)
    }
  }

  // El administrador confirma el reembolso: la cita queda cancelada.
  async function confirmarReembolso(cita) {
    setError(null)
    setOcupada(cita.citaID)
    try {
      const actualizada = await confirmarReembolsoCita(cita.citaID)
      onCambio?.(actualizada)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupada(null)
    }
  }

  // El administrador rechaza el reembolso: la cita vuelve a estar en pie.
  async function rechazarCancelacion(cita) {
    setError(null)
    setOcupada(cita.citaID)
    try {
      const actualizada = await rechazarCancelacionCita(cita.citaID, 'Reembolso no aprobado')
      onCambio?.(actualizada)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupada(null)
    }
  }

  /*
   * Borrar una cita de la agenda (solo el administrador).
   *
   * Es definitivo: la cita y su pago se borran de la base de datos, así que se
   * pregunta antes de hacerlo.
   */
  async function borrar(cita) {
    const ok = window.confirm(
      `¿Eliminar la cita del ${fechaHora(cita.fecha_inicio)}?\n\n` +
        'Se borra de la agenda y con ella su pago. No se puede deshacer.',
    )
    if (!ok) return
    setError(null)
    setOcupada(cita.citaID)
    try {
      await eliminarCita(cita.citaID)
      onEliminar?.(cita.citaID)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupada(null)
    }
  }

  const puedeCancelarCliente = (estado) =>
    estado === 'pendiente' || estado === 'confirmada'

  // El barbero no ve el teléfono del cliente ni cómo va el pago.
  const vistaBarbero = modo === 'barbero'
  // El barbero solo debe estar al tanto de la cita: sin acciones.
  const esSoloLecturaBarbero = vistaBarbero

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {citas.length === 0 ? (
        <p className="text-cream-200/60">No hay citas para mostrar.</p>
      ) : (
        <div className="space-y-3">
          {citas.map((cita) => {
            const estado = ESTADOS[cita.estado] ?? {
              label: cita.estado,
              clase: 'bg-white/10 text-cream-200',
            }
            const acciones =
              modo === 'equipo'
                ? SIGUIENTES[cita.estado] ?? []
                : modo === 'cliente' && puedeCancelarCliente(cita.estado)
                  ? ['cancelada']
                  : []

            // El backend solo deja mover una cita que sigue en pie: una
            // completada o cancelada ya no se reprograma. El barbero no puede
            // reprogramar, así que la opción es exclusiva del administrador.
            const puedeReprogramar =
              modo === 'equipo' &&
              (cita.estado === 'pendiente' || cita.estado === 'confirmada')

            // Solo el administrador aprueba o rechaza el reembolso de una
            // cancelación solicitada.
            const esSolicitudAdmin = modo === 'equipo' && !esSoloLecturaBarbero && cita.estado === 'cancelacion_solicitada'

            // Borrar la cita: solo el panel de administración lo ofrece.
            const puedeEliminar = modo === 'equipo' && !esSoloLecturaBarbero && Boolean(onEliminar)

            return (
              <article
                key={cita.citaID}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-ink-800 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
              >
                <div className="min-w-0 sm:min-w-[9rem]">
                  <p className="text-sm font-semibold text-cream-50">
                    {fechaHora(cita.fecha_inicio)}
                  </p>
                  <p className="text-xs text-cream-200/50">
                    {cita.servicio_nombre} · {precio(cita.precio)}
                  </p>
                </div>

                <div className="min-w-0 text-sm text-cream-200/80 sm:min-w-[10rem]">
                  {modo === 'equipo' || vistaBarbero ? (
                    <>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-cream-200/50">Cliente:</span>
                        <span>{nombreCliente(cita)}</span>
                        {!vistaBarbero && cita.es_invitado && (
                          <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-indigo-300">
                            Invitado
                          </span>
                        )}
                      </span>
                      {!vistaBarbero && cita.cliente_telefono && (
                        <span className="block text-xs text-cream-200/50">
                          {cita.cliente_telefono}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-cream-200/50">Barbero:</span>{' '}
                      {cita.barbero_nombre} {cita.barbero_apellido}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs uppercase tracking-wider ${estado.clase}`}
                  >
                    {estado.label}
                  </span>

                  {!vistaBarbero && (
                    <EstadoPagoBadge estado={cita.pago_estado} metodo={cita.pago_metodo} />
                  )}
                </div>

                {!vistaBarbero && cita.pago_estado === 'rechazado' && (
                  <p className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {modo === 'cliente'
                      ? mensajeDenegacion(cita)
                      : `Pago denegado.${cita.motivo_pago ? ` Motivo: ${cita.motivo_pago}` : ''}`}
                  </p>
                )}

                {!vistaBarbero &&
                  modo === 'cliente' &&
                  cita.pago_estado === 'pendiente' &&
                  cita.pago_metodo === 'pago_movil' && (
                    <p className="w-full text-xs text-amber-200/80">
                      Tu comprobante está en revisión: el administrador lo aprueba y
                      tu cita queda confirmada.
                    </p>
                  )}

                {esSolicitudAdmin && (
                  <p className="w-full rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">
                    Solicitud de cancelación con reembolso
                    {cita.cancelacion_motivo ? `: ${cita.cancelacion_motivo}` : '.'} El
                    espacio ya está libre; confirma el reembolso para cancelar la cita.
                  </p>
                )}

                {modo === 'cliente' && cita.estado === 'cancelacion_solicitada' && (
                  <p className="w-full rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">
                    Pediste cancelar esta cita y el espacio ya quedó libre. Estamos
                    revisando la devolución de tu dinero: en cuanto el administrador
                    confirme el reembolso, la cita quedará cancelada.
                  </p>
                )}

                {(acciones.length > 0 || modo === 'cliente' || puedeReprogramar || esSolicitudAdmin || puedeEliminar) && !esSoloLecturaBarbero && (
                  <div className="flex flex-wrap gap-2 sm:ml-auto">
                    {esSolicitudAdmin && (
                      <>
                        <button
                          type="button"
                          disabled={ocupada === cita.citaID}
                          onClick={() => confirmarReembolso(cita)}
                          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-emerald-400 disabled:opacity-50 sm:py-1.5"
                        >
                          Confirmar reembolso
                        </button>
                        <button
                          type="button"
                          disabled={ocupada === cita.citaID}
                          onClick={() => rechazarCancelacion(cita)}
                          className="rounded-full border border-red-400/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-red-300 transition hover:bg-red-500/15 disabled:opacity-50 sm:py-1.5"
                        >
                          Rechazar
                        </button>
                      </>
                    )}
                    {acciones.map((estadoDestino) => (
                      <button
                        key={estadoDestino}
                        type="button"
                        disabled={ocupada === cita.citaID}
                        onClick={() => cambiar(cita, estadoDestino)}
                        className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition disabled:opacity-50 sm:py-1.5 ${
                          estadoDestino === 'cancelada'
                            ? 'border border-red-400/40 text-red-300 hover:bg-red-500/15'
                            : 'bg-gold-500 text-ink-950 hover:bg-gold-400'
                        }`}
                      >
                        {ETIQUETA[estadoDestino]}
                      </button>
                    ))}
                    {puedeReprogramar && reprogramando !== cita.citaID && (
                      <button
                        type="button"
                        onClick={() => abrirReprogramar(cita)}
                        className="rounded-full border border-gold-500/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gold-300 transition hover:bg-gold-500 hover:text-ink-950 sm:py-1.5"
                      >
                        Reprogramar
                      </button>
                    )}
                    {modo === 'cliente' && <AccionesClienteCita cita={cita} onCambio={onCambio} setError={setError} />}
                    {puedeEliminar && (
                      <button
                        type="button"
                        disabled={ocupada === cita.citaID}
                        onClick={() => borrar(cita)}
                        className={`${botonEliminar} sm:py-1.5`}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                )}

                {reprogramando === cita.citaID && (
                  <div className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-gold-500/30 bg-ink-900 p-3">
                    <label className="text-[0.65rem] uppercase tracking-wider text-cream-200/60">
                      Nueva fecha y hora
                      <input
                        type="datetime-local"
                        value={nuevaFecha}
                        onChange={(e) => setNuevaFecha(e.target.value)}
                        className="mt-1 block rounded-lg border border-white/10 bg-ink-800 px-2.5 py-2 text-sm text-cream-50 outline-none focus:border-gold-500"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={ocupada === cita.citaID}
                      onClick={() => guardarReprogramacion(cita)}
                      className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400 disabled:opacity-50"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReprogramando(null)
                        setNuevaFecha('')
                      }}
                      className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cream-200/70 transition hover:border-gold-400 hover:text-gold-300"
                    >
                      Cancelar
                    </button>
                    <p className="w-full text-xs text-cream-200/40">
                      Se comprueba el horario del barbero, los días de descanso y los
                      feriados, igual que al reservar.
                    </p>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
