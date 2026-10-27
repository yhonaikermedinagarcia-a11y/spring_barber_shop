import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getServicios } from '../api/servicios'
import { getBarberos } from '../api/barberos'
import { getServiciosDeBarbero } from '../api/barberoServicios'
import { getFeriados } from '../api/feriados'
import { getHorariosDeBarbero } from '../api/horarios'
import { getOcupados, crearCita, crearCitaPublica, reprogramarCita } from '../api/citas'
import { getAusenciasBarbero, ausenciaDe } from '../api/ausencias'
import ListaEsperaForm from '../components/ListaEsperaForm'
import { mensajeDeError } from '../api/client'
import { precio, duracion, urlImagen, DIAS_SEMANA, formatearFechaLarga, enHoraLocal } from '../utils/formato'
import { fotoBarbero } from '../utils/fotosBarbero'
import { revisarFecha } from '../utils/calendario'
import { enlaceWhatsApp } from '../config'
import AppHeader from '../components/AppHeader'

const PASO_SERVICIO = 'Servicio'
const PASO_BARBERO = 'Barbero'
const PASO_FECHA = 'Fecha y hora'
const PASO_DATOS = 'Tus datos'
const PASO_PAGO = 'Forma de pago'

// Texto del botón "volver" según el paso al que se regresa. Se deriva del
// paso anterior real en lugar de suponerlo: con ?servicio=<id> el primer paso
// no es el de servicios, y adivinarlo dejaba el botón apuntando a un paso
// inexistente.
const ETIQUETA_PASO = {
  [PASO_SERVICIO]: 'servicios',
  [PASO_BARBERO]: 'barberos',
  [PASO_FECHA]: 'fecha y hora',
  [PASO_DATOS]: 'tus datos',
  [PASO_PAGO]: 'la forma de pago',
}

const paraMinutos = (hhmm) => {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

const aHHMM = (min) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Día y hora con el reloj de la peluquería (ver `enHoraLocal`), no con el del
// navegador.
const ymd = (d) => enHoraLocal(d)?.ymd ?? ''
const hm = (d) => enHoraLocal(d)?.hm ?? ''

// Estados de cita que ya no ocupan la hora. Tienen que coincidir con los que
// el servidor ignora al comprobar el solapamiento (citaController.validarCita):
// si la web marca como ocupada una hora que el servidor da por libre, el
// cliente ve bloques tachados que en realidad se pueden reservar.
const ESTADOS_QUE_LIBERAN = new Set(['cancelada', 'denegada', 'cancelacion_solicitada'])

// Separación de la rejilla de horas que se ofrecen.
const PASO_REJILLA = 30

/**
 * Genera las horas de inicio posibles dentro de un tramo.
 *
 * Antes el paso era la duración del servicio (un servicio de 45 minutos
 * ofrecía 09:00, 09:45, 10:30...). Eso desalineaba los bloques del resto de
 * citas: si había una cita de 30 minutos de 09:00 a 09:30, el hueco de las
 * 09:30 no se ofrecía nunca y se perdía tiempo de la agenda.
 *
 * Ahora se ofrece una rejilla fija cada 30 minutos **y**, además, la hora en
 * la que termina cada cita del día, para aprovechar el hueco que deja. Cada
 * bloque tiene que caber entero antes del cierre; los que se cruzan con otra
 * cita se marcan como ocupados al pintarlos (no se quitan, para que el
 * cliente vea que esa hora existe pero está tomada).
 *
 * @param {string} inicio "HH:MM" de apertura
 * @param {string} fin "HH:MM" de cierre
 * @param {number} duracionMinutos duración del servicio
 * Las horas que pisan la hora de almuerzo del barbero (`descansos`) no se
 * ofrecen: no están "ocupadas", simplemente el barbero no atiende. Tras el
 * almuerzo se ofrece su hora de fin, para aprovechar el hueco.
 *
 * @param {{inicio: number, fin: number}[]} ocupados intervalos del día, en minutos
 * @param {{inicio: number, fin: number}[]} descansos almuerzo del día, en minutos
 */
function generarSlots(inicio, fin, duracionMinutos, ocupados = [], descansos = []) {
  const desde = paraMinutos(inicio)
  const hasta = paraMinutos(fin)
  const duracionServicio = Math.max(Number(duracionMinutos) || 30, 5)
  const candidatos = new Set()
  for (let t = desde; t < hasta; t += PASO_REJILLA) candidatos.add(t)
  for (const o of [...ocupados, ...descansos]) if (o.fin > desde && o.fin < hasta) candidatos.add(o.fin)
  return [...candidatos]
    .filter((t) => t + duracionServicio <= hasta)
    .filter((t) => !descansos.some((d) => t < d.fin && t + duracionServicio > d.inicio))
    .sort((a, b) => a - b)
    .map(aHHMM)
}

export default function Reservar() {
  const { usuario, cargando: cargandoSesion } = useAuth()
  const [searchParams] = useSearchParams()

  // Sin sesión se reserva como invitado: se pide nombre y teléfono al final.
  //
  // La sesión puede tardar en resolverse (al abrir la web se rehidrata con
  // GET /api/auth/me). Mientras tanto `usuario` es null, así que un usuario
  // con la sesión abierta sería tomado por invitado y su cita se guardaría
  // sin cuenta. Por eso el formulario espera a que la sesión esté resuelta.
  const esInvitado = !cargandoSesion && !usuario

  // Parámetros de entrada:
  //  - ?barbero=ID  -> barbero fijo: se omite el paso de elegir barbero.
  //  - ?servicio=ID -> servicio fijo: se omite el paso de elegir servicio (se usa
  //                    para "repetir" o "reprogramar" una cita concreta).
  //  - ?reprogramar=citaID -> no crea una cita nueva, actualiza la fecha/hora.
  const barberoFijoID = Number(searchParams.get('barbero')) || null
  const servicioFijoID = Number(searchParams.get('servicio')) || null
  const reprogramarID = Number(searchParams.get('reprogramar')) || null
  const esBarberoFijo = Boolean(barberoFijoID)
  const esServicioFijo = Boolean(servicioFijoID)
  const esReprogramar = Boolean(reprogramarID)

  const pasos = []
  if (!esServicioFijo) pasos.push(PASO_SERVICIO)
  if (!esBarberoFijo) pasos.push(PASO_BARBERO)
  pasos.push(PASO_FECHA)
  if (esInvitado) pasos.push(PASO_DATOS)
  // La forma de pago se pide al reservar. Al reprogramar no se vuelve a
  // elegir: la cita ya existe y su pago no cambia.
  if (!esReprogramar) pasos.push(PASO_PAGO)

  const [servicios, setServicios] = useState([])
  const [barberos, setBarberos] = useState([])
  const [cargandoBase, setCargandoBase] = useState(true)
  const [errorBase, setErrorBase] = useState(null)
  const [idsDelBarberoFijo, setIdsDelBarberoFijo] = useState(null)
  // Días de descanso y feriados: días en los que no se puede reservar.
  const [calendario, setCalendario] = useState({ diasDescanso: [], feriados: [] })
  // Fecha que el usuario eligió y no se puede reservar. Se guarda aparte
  // porque la fecha se borra del formulario al rechazarla, y el aviso tiene
  // que seguir viéndose.
  const [bloqueo, setBloqueo] = useState(null)

  const [paso, setPaso] = useState(0)
  const [servicio, setServicio] = useState(null)
  const [barbero, setBarbero] = useState(null)
  const [fecha, setFecha] = useState('')
  const [horaMarcada, setHora] = useState('')

  // barberos -> ids de servicios que ofrecen
  const [ofertas, setOfertas] = useState(null)
  const [horarios, setHorarios] = useState(null)
  const [citasBarbero, setCitasBarbero] = useState([])
  // Permisos (vacaciones...) del barbero elegido: esos días no se ofrecen.
  const [ausencias, setAusencias] = useState([])

  const [ahora, setAhora] = useState(null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmada, setConfirmada] = useState(null)
  const [codigoGestion, setCodigoGestion] = useState(null)
  const [datosInvitado, setDatosInvitado] = useState({
    nombre: '',
    apellido: '',
    telefono: '',
  })

  // Forma de pago elegida al reservar:
  //   - 'pago_movil': el cliente sube el comprobante y el administrador lo
  //     aprueba (verde) o lo rechaza (rojo) desde el panel.
  //   - 'efectivo' | 'tarjeta': la cita se reserva normal y el pago queda
  //     pendiente de hacerse en el local.
  const [pago, setPago] = useState({ metodo: 'pago_movil', referencia: '', archivo: null })

  const pasoActual = pasos[paso]
  // El paso al que vuelve el botón "atrás". Puede no existir: si se entra
  // con ?servicio=<id>, el primer paso es el de barberos y no hay paso
  // anterior al que volver.
  const pasoAnterior = paso > 0 ? pasos[paso - 1] : undefined
  const puedeVolver = Boolean(pasoAnterior)

  // Días de descanso y feriados. Se piden aparte para que un fallo aquí no
  // impida reservar: el servidor es quien rechaza esas fechas de todas
  // maneras, esto solo es para no ofrecerlas.
  useEffect(() => {
    let activo = true
    getFeriados()
      .then((c) => activo && setCalendario(c))
      .catch(() => {})
    return () => {
      activo = false
    }
  }, [])

  useEffect(() => {
    let activo = true
    Promise.all([getServicios(), getBarberos()])
      .then(([s, b]) => {
        if (!activo) return
        setServicios(s)
        setBarberos(b)
        setAhora(new Date())
        if (barberoFijoID) {
          const elegido = b.find((x) => x.barberoID === barberoFijoID)
          if (elegido) setBarbero(elegido)
          else setErrorBase('El barbero seleccionado no está disponible.')
        }
        if (servicioFijoID) {
          const elegido = s.find((x) => x.serviciosID === servicioFijoID)
          if (elegido) setServicio(elegido)
          else setErrorBase('El servicio seleccionado ya no está disponible.')
        }
      })
      .catch((err) => activo && setErrorBase(mensajeDeError(err)))
      .finally(() => activo && setCargandoBase(false))
    return () => {
      activo = false
    }
  }, [barberoFijoID, servicioFijoID])

  // Con barbero fijo, se limita el catálogo a los servicios que ofrece.
  useEffect(() => {
    if (!barberoFijoID) return
    let activo = true
    getServiciosDeBarbero(barberoFijoID)
      .then((suyos) => {
        if (activo) setIdsDelBarberoFijo(new Set(suyos.map((s) => s.serviciosID)))
      })
      .catch(() => activo && setIdsDelBarberoFijo(new Set()))
    return () => {
      activo = false
    }
  }, [barberoFijoID])

  // Al elegir servicio, se averigua qué barberos lo ofrecen. Solo en el flujo
  // normal: con barbero fijo el paso de barberos no existe.
  useEffect(() => {
    if (!servicio || esBarberoFijo) return
    let activo = true
    Promise.all(
      barberos.map(async (b) => {
        const suyos = await getServiciosDeBarbero(b.barberoID).catch(() => [])
        return [b.barberoID, suyos.map((s) => s.serviciosID)]
      }),
    ).then((pares) => {
      if (activo) setOfertas(new Map(pares))
    })
    return () => {
      activo = false
    }
  }, [servicio, barberos, esBarberoFijo])

  // Al elegir barbero, se cargan su horario y sus horas ocupadas para calcular cupos.
  useEffect(() => {
    if (!barbero) return
    let activo = true
    Promise.all([
      getHorariosDeBarbero(barbero.barberoID),
      // Solo desde hoy: las citas pasadas no bloquean nada y la lista crecía
      // sin límite con el historial del barbero.
      getOcupados(barbero.barberoID, { desde: ymd(new Date()), excluir: reprogramarID }).catch(() => []),
      getAusenciasBarbero(barbero.barberoID).catch(() => []),
    ]).then(([h, ocupados, permisos]) => {
      if (!activo) return
      setHorarios(h)
      setCitasBarbero(ocupados)
      setAusencias(permisos)
    })
    return () => {
      activo = false
    }
  }, [barbero, reprogramarID])

  /*
   * Al elegir (o cambiar) la fecha se vuelven a pedir las horas ocupadas de
   * ese día. Las del paso anterior pueden tener varios minutos: si otra
   * persona reservó mientras tanto, el bloque seguía apareciendo libre y el
   * servidor lo rechazaba al confirmar. También se refresca cada minuto
   * mientras se está en este paso, junto con la hora actual (para tachar los
   * bloques que ya pasaron).
   */
  useEffect(() => {
    if (!barbero || !fecha || pasoActual !== PASO_FECHA) return
    let activo = true
    const refrescar = () => {
      setAhora(new Date())
      getOcupados(barbero.barberoID, { desde: fecha, hasta: fecha, excluir: reprogramarID })
        .then((delDia) => {
          if (!activo) return
          setCitasBarbero((previas) => [
            ...previas.filter((c) => ymd(c.fecha_inicio) !== fecha),
            ...delDia,
          ])
        })
        .catch(() => {})
    }
    refrescar()
    const intervalo = setInterval(refrescar, 60 * 1000)
    return () => {
      activo = false
      clearInterval(intervalo)
    }
  }, [barbero, fecha, reprogramarID, pasoActual])

  const barberosDisponibles = useMemo(() => {
    if (!servicio || !ofertas) return []
    return barberos.filter(
      (b) => b.estado && ofertas.get(b.barberoID)?.includes(servicio.serviciosID),
    )
  }, [servicio, ofertas, barberos])

  // Servicios a mostrar en el primer paso: todos, o solo los del barbero fijo.
  const serviciosDisponibles = useMemo(() => {
    if (!esBarberoFijo) return servicios
    if (idsDelBarberoFijo === null) return []
    return servicios.filter((s) => idsDelBarberoFijo.has(s.serviciosID))
  }, [servicios, esBarberoFijo, idsDelBarberoFijo])

  const horarioDelDia = useMemo(() => {
    if (!fecha || !horarios) return null
    // `getDay()` devuelve 0 para el domingo, así que se desplaza para que
    // coincida con DIAS_SEMANA (lunes → domingo).
    const dia = DIAS_SEMANA[(new Date(`${fecha}T00:00:00`).getDay() + 6) % 7]
    return horarios.find((h) => h.dia_semana === dia) || null
  }, [fecha, horarios])

  /*
   * Intervalos ocupados del día seleccionado, en minutos desde medianoche.
   *
   * Se guarda el intervalo completo y no solo la hora de inicio: una cita de
   * 10:15 a 10:45 bloquea también las 10:00 de un servicio de 60 minutos,
   * aunque su hora de inicio no coincida con ningún hueco. Comparando solo la
   * hora exacta, la web ofrecía huecos que el servidor iba a rechazar con un
   * "se cruza con otra cita".
   */
  const ocupadosDelDia = useMemo(() => {
    if (!fecha) return []
    const lista = []
    for (const c of citasBarbero) {
      if (ESTADOS_QUE_LIBERAN.has(c.estado)) continue
      const inicio = enHoraLocal(c.fecha_inicio)
      if (!inicio || inicio.ymd !== fecha) continue
      const fin = c.fecha_fin
        ? enHoraLocal(c.fecha_fin)
        : enHoraLocal(new Date(new Date(c.fecha_inicio).getTime() + 30 * 60000))
      lista.push({
        inicio: inicio.minutos,
        // Una cita que acaba al día siguiente ocupa hasta el final del día.
        fin: fin && fin.ymd === fecha ? fin.minutos : 24 * 60,
      })
    }
    return lista
  }, [fecha, citasBarbero])

  // Hora de almuerzo del día (si el barbero la tiene configurada).
  const almuerzoDelDia = useMemo(() => {
    if (!horarioDelDia?.almuerzo_inicio || !horarioDelDia?.almuerzo_fin) return []
    return [{
      inicio: paraMinutos(horarioDelDia.almuerzo_inicio),
      fin: paraMinutos(horarioDelDia.almuerzo_fin),
    }]
  }, [horarioDelDia])

  // ¿El hueco [inicio, fin) se cruza con alguna cita ya agendada?
  const seCruza = (inicioMin, finMin) =>
    ocupadosDelDia.some((o) => inicioMin < o.fin && finMin > o.inicio)

  const slots = useMemo(() => {
    if (!horarioDelDia || !servicio) return []
    return generarSlots(
      horarioDelDia.hora_inicio,
      horarioDelDia.hora_fin,
      servicio.duracion_minutos,
      ocupadosDelDia,
      almuerzoDelDia,
    )
  }, [horarioDelDia, servicio, ocupadosDelDia, almuerzoDelDia])

  // Los próximos feriados, para avisar de antemano. Solo los que aún no han
  // pasado y no son más de tres: si no, la lista sería larguísima.
  //
  // Se compara con `ahora` (un estado) y no con `new Date()`: llamar a Date
  // durante el render es impuro y el compilador de React lo rechaza.
  const proximosFeriados = useMemo(() => {
    if (!ahora) return []
    const hoy = ymd(ahora)
    return (calendario.feriados ?? [])
      .filter((f) => f.fecha >= hoy)
      .slice(0, 3)
  }, [calendario, ahora])

  const esHoy = fecha && ahora && ymd(ahora) === fecha

  // Si la hora marcada deja de estar disponible mientras se elige (otra
  // persona la tomó, o ya pasó) deja de contar como elegida, para no llegar
  // al final con un error del servidor.
  const horaSigueLibre = (() => {
    if (!horaMarcada || !servicio) return false
    const inicioMin = paraMinutos(horaMarcada)
    const finMin = inicioMin + (Number(servicio.duracion_minutos) || 30)
    const tomada = ocupadosDelDia.some((o) => inicioMin < o.fin && finMin > o.inicio)
    const pasada = esHoy && horaMarcada <= hm(ahora)
    return !tomada && !pasada && slots.includes(horaMarcada)
  })()
  const hora = pasoActual !== PASO_FECHA || horaSigueLibre ? horaMarcada : ''

  // ¿Queda alguna hora que se pueda elegir ese día? Si no, la lista de espera
  // se muestra destacada.
  const hayHorasLibres = slots.some((s) => {
    const inicioMin = paraMinutos(s)
    const finMin = inicioMin + (Number(servicio?.duracion_minutos) || 30)
    return !(esHoy && s <= hm(ahora)) && !ocupadosDelDia.some((o) => inicioMin < o.fin && finMin > o.inicio)
  })

  function elegirServicio(s) {
    setServicio(s)
    setOfertas(null)
    setFecha('')
    setHora('')
    if (!esBarberoFijo) setBarbero(null)
    setPaso(paso + 1)
  }

  function elegirBarbero(b) {
    setBarbero(b)
    setHorarios(null)
    setFecha('')
    setHora('')
    setPaso(paso + 1)
  }

  async function confirmar() {
    setError(null)

    if (esInvitado) {
      const telDigitos = datosInvitado.telefono.replace(/\D/g, '')
      if (
        !datosInvitado.nombre.trim() ||
        !datosInvitado.apellido.trim() ||
        telDigitos.length < 7
      ) {
        setError('Escribe tu nombre, apellido y un teléfono válido (mínimo 7 dígitos).')
        return
      }
    }

    // El pago móvil necesita el comprobante y la referencia: sin ellos el
    // administrador no tiene nada que revisar.
    if (!esReprogramar && pago.metodo === 'pago_movil') {
      if (!pago.archivo) {
        setError('Sube el comprobante del pago móvil (una imagen del pago).')
        return
      }
      if (!pago.referencia.trim()) {
        setError('Escribe la referencia del pago móvil.')
        return
      }
    }

    setEnviando(true)
    try {
      const fecha_hora = `${fecha}T${hora}:00`

      // Lo que se manda junto a la reserva. Al reprogramar no hay pago.
      const formaPago = esReprogramar
        ? {}
        : pago.metodo === 'pago_movil'
          ? {
              pago_metodo: 'pago_movil',
              referencia_pago: pago.referencia.trim(),
              comprobante: pago.archivo,
            }
          : { pago_metodo: pago.metodo }

      if (esReprogramar) {
        const cita = await reprogramarCita(reprogramarID, { fecha_hora })
        setConfirmada(cita)
      } else if (esInvitado) {
        const { cita, codigo } = await crearCitaPublica({
          barberoID: barbero.barberoID,
          servicioID: servicio.serviciosID,
          fecha_hora,
          nombre: datosInvitado.nombre.trim(),
          apellido: datosInvitado.apellido.trim(),
          telefono: datosInvitado.telefono.trim(),
          ...formaPago,
        })
        setCodigoGestion(codigo)
        setConfirmada(cita)
      } else {
        const cita = await crearCita({
          clienteID: usuario.usuarioID,
          barberoID: barbero.barberoID,
          servicioID: servicio.serviciosID,
          fecha_hora,
          ...formaPago,
        })
        setConfirmada(cita)
      }
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  function reiniciar() {
    setConfirmada(null)
    setCodigoGestion(null)
    if (!esServicioFijo) setServicio(null)
    if (!esBarberoFijo) setBarbero(null)
    setFecha('')
    setHora('')
    setPaso(0)
    setError(null)
    setDatosInvitado({ nombre: '', apellido: '', telefono: '' })
    setPago({ metodo: 'pago_movil', referencia: '', archivo: null })
  }

  if (confirmada) {
    const fechaLegible = new Date(`${fecha}T${hora}:00`).toLocaleString('es-CO', {
      dateStyle: 'full',
      timeStyle: 'short',
    })
    const mensajeWhatsApp = [
      'Hola, quiero confirmar esta cita:',
      `• Servicio: ${servicio.nombre}`,
      `• Barbero: ${barbero.nombre} ${barbero.apellido}`,
      `• Fecha: ${fechaLegible}`,
      esInvitado
        ? `• A nombre de: ${datosInvitado.nombre} ${datosInvitado.apellido} (${datosInvitado.telefono})`
        : '',
      codigoGestion ? `• Enlace de mi cita: ${window.location.origin}/cita/${codigoGestion}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    return (
      <div className="min-h-screen bg-ink-950">
        <AppHeader />
        <div className="mx-auto max-w-lg px-4 py-12 text-center sm:px-5 sm:py-16">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 sm:p-8">
            <h1 className="font-display text-xl font-bold uppercase tracking-wide text-emerald-300 sm:text-2xl">
              {esReprogramar ? '¡Cita reprogramada!' : '¡Cita agendada!'}
            </h1>
            <p className="mt-3 text-cream-200/80">
              {servicio.nombre} con {barbero.nombre} {barbero.apellido}
            </p>
            <p className="mt-1 text-sm text-cream-200/70">{fechaLegible}</p>
            <p className="mt-4 text-xs uppercase tracking-wider text-cream-200/50">
              Estado: {confirmada.estado}
            </p>

            {!esReprogramar && pago.metodo === 'pago_movil' && (
              <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Enviamos tu comprobante de pago móvil. El administrador lo revisa y
                tu cita queda confirmada en cuanto lo apruebe.
              </p>
            )}

            {!esReprogramar && (pago.metodo === 'efectivo' || pago.metodo === 'tarjeta') && (
              <p className="mt-3 rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-sm text-gold-200">
                Tu cita está reservada. El pago ({pago.metodo}) se realiza en el
                local y queda pendiente hasta que lo completes.
              </p>
            )}

            {codigoGestion && (
              <div className="mt-5 rounded-xl border border-white/10 bg-ink-950/60 px-4 py-3 text-left">
                <p className="text-xs uppercase tracking-wider text-cream-200/60">
                  Guarda este enlace
                </p>
                <Link
                  to={`/cita/${codigoGestion}`}
                  className="mt-1 block break-all text-sm font-semibold text-gold-300 hover:underline"
                >
                  Ver o cancelar mi cita
                </Link>
                <p className="mt-1 text-xs text-cream-200/50">
                  Te permite gestionar la cita sin crear una cuenta.
                </p>
              </div>
            )}
          </div>

          {codigoGestion && (
            <a
              href={enlaceWhatsApp(mensajeWhatsApp)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/40 px-6 py-3 text-sm font-semibold uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-500/15"
            >
              Enviar la cita por WhatsApp
            </a>
          )}

          {esInvitado && (
            <div className="mt-6 rounded-2xl border border-gold-500/25 bg-gold-500/5 p-5">
              <p className="text-sm text-cream-200/80">
                ¿Quieres ver y gestionar tus citas cuando quieras? Crea una cuenta con
                este mismo teléfono y tus reservas aparecerán en “Mis citas”.
              </p>
              <Link
                to="/registro"
                state={{
                  nombre: datosInvitado.nombre.trim(),
                  apellido: datosInvitado.apellido.trim(),
                  telefono: datosInvitado.telefono.trim(),
                }}
                className="mt-3 inline-block rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400"
              >
                Crear mi cuenta
              </Link>
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {!esInvitado && (
              <Link
                to="/mis-citas"
                className="rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400"
              >
                Ver mis citas
              </Link>
            )}
            {!esReprogramar && (
              <button
                type="button"
                onClick={reiniciar}
                className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold uppercase tracking-wider transition hover:border-gold-400"
              >
                Agendar otra
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  /*
   * El administrador no agenda citas en su propia cuenta.
   *
   * Su cuenta es de trabajo, no de cliente: las citas de la peluquería se
   * agendan desde el panel (pestaña "Nueva cita"), eligiendo el cliente al que
   * se le agenda. Aquí solo se le ofrece el camino correcto.
   */
  if (usuario?.rol === 'administrador') {
    return (
      <div className="min-h-screen bg-ink-950">
        <AppHeader />
        <div className="mx-auto max-w-lg px-4 py-12 sm:px-5 sm:py-16">
          <div className="rounded-2xl border border-gold-500/30 bg-gold-500/5 p-5 sm:p-8">
            <h1 className="font-display text-xl font-bold uppercase tracking-wide text-gold-300 sm:text-2xl">
              Reserva manual
            </h1>
            <p className="mt-3 text-cream-200/80">
              Tu cuenta es de administración, no de cliente: no puedes agendar citas
              para ti mismo. Las citas se agendan desde el panel de administración,
              eligiendo el cliente al que se le agenda.
            </p>
            <Link
              to="/admin"
              className="mt-5 inline-block rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400"
            >
              Ir al panel de administración
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Foto de referencia del barbero elegido, para los que no tienen foto
  // subida. Se calcula una vez y se reutiliza en el resumen.
  const fotoBarberoActual = barbero ? fotoBarbero(barbero.barberoID) : null

  return (
    <div className="min-h-screen bg-ink-950">
      <AppHeader />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-5 sm:py-10">
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide sm:text-3xl">
          {esReprogramar ? 'Reprogramar cita' : 'Reservar cita'}
        </h1>

        {/* Indicador de pasos: barra de progreso en móvil, chips desde sm. */}
        <div className="mt-6 sm:hidden">
          <div className="flex items-center gap-3">
            <p className="shrink-0 text-xs uppercase tracking-wider text-gold-300">
              {paso + 1}/{pasos.length} · {pasoActual}
            </p>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gold-500 transition-all duration-300"
                style={{ width: `${((paso + 1) / pasos.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <ol className="mt-6 hidden flex-wrap gap-3 text-xs uppercase tracking-wider sm:flex">
          {pasos.map((nombre, i) => (
            <li
              key={nombre}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 ${
                i === paso
                  ? 'border-gold-500 text-gold-300'
                  : i < paso
                    ? 'border-white/15 text-cream-200/70'
                    : 'border-white/10 text-cream-200/40'
              }`}
            >
              <span className="font-display">{i + 1}</span>
              {nombre}
            </li>
          ))}
        </ol>

        {(esBarberoFijo || esServicioFijo) && (barbero || servicio) && (
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-gold-500/30 bg-gold-500/5 p-4">
            {barbero && (
              <img
                src={barbero.foto_url ? urlImagen(barbero.foto_url) : fotoBarberoActual.src}
                srcSet={barbero.foto_url ? undefined : fotoBarberoActual.srcSet}
                sizes="48px"
                alt={`${barbero.nombre} ${barbero.apellido}`}
                decoding="async"
                width="48"
                height="48"
                className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-gold-500/50"
              />
            )}
            <div className="min-w-0">
              {barbero && (
                <>
                  <p className="text-xs uppercase tracking-wider text-gold-400">
                    {esReprogramar ? 'Reprogramando tu cita con' : 'Estás reservando con'}
                  </p>
                  <p className="font-display text-base uppercase tracking-wide sm:text-lg">
                    {barbero.nombre} {barbero.apellido}
                  </p>
                </>
              )}
              {servicio && (
                <p className="text-xs uppercase tracking-wider text-cream-200/60">
                  {servicio.nombre} · {precio(servicio.precio)} · {duracion(servicio.duracion_minutos)}
                </p>
              )}
            </div>
          </div>
        )}

        {errorBase && <p className="mt-6 text-red-400">{errorBase}</p>}
        {cargandoSesion && <p className="mt-6 text-cream-200/70">Cargando…</p>}
        {cargandoBase && !cargandoSesion && <p className="mt-6 text-cream-200/70">Cargando catálogo…</p>}

        {!cargandoSesion && !cargandoBase && !errorBase && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-ink-900 p-4 sm:p-6">
            {pasoActual === PASO_SERVICIO && (
              <>
                <h2 className="mb-4 font-display text-lg uppercase tracking-wide">
                  Elige un servicio
                </h2>
                {esBarberoFijo && (
                  <p className="mb-4 text-sm text-cream-200/60">
                    Servicios que ofrece {barbero ? `${barbero.nombre} ${barbero.apellido}` : 'el barbero'}.
                  </p>
                )}
                {serviciosDisponibles.length === 0 ? (
                  <p className="text-cream-200/70">
                    {esBarberoFijo
                      ? 'Este barbero todavía no tiene servicios asignados.'
                      : 'No hay servicios disponibles.'}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {serviciosDisponibles.map((s) => (
                      <button
                        key={s.serviciosID}
                        type="button"
                        onClick={() => elegirServicio(s)}
                        className="rounded-xl border border-white/10 bg-ink-800 p-4 text-left transition hover:border-gold-500/60"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-cream-50">{s.nombre}</span>
                          <span className="text-sm font-semibold text-gold-300">
                            {precio(s.precio)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-cream-200/60">
                          {duracion(s.duracion_minutos)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {pasoActual === PASO_BARBERO && (
              <>
                <h2 className="mb-4 font-display text-lg uppercase tracking-wide">
                  Elige un barbero
                </h2>
                {ofertas === null ? (
                  <p className="text-cream-200/70">Buscando barberos disponibles…</p>
                ) : barberosDisponibles.length === 0 ? (
                  <p className="text-cream-200/70">
                    Ningún barbero tiene asignado ese servicio todavía.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {barberosDisponibles.map((b) => (
                      <button
                        key={b.barberoID}
                        type="button"
                        onClick={() => elegirBarbero(b)}
                        className="flex items-center gap-4 rounded-xl border border-white/10 bg-ink-800 p-4 text-left transition hover:border-gold-500/60"
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-gold-500 to-gold-700 font-display font-bold text-ink-950">
                          {b.nombre.charAt(0)}
                          {b.apellido.charAt(0)}
                        </span>
                        <span className="font-semibold text-cream-50">
                          {b.nombre} {b.apellido}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {puedeVolver && (
                  <button
                    type="button"
                    onClick={() => setPaso(paso - 1)}
                    className="mt-5 text-sm text-cream-200/60 hover:text-gold-400"
                  >
                    ← Volver a {ETIQUETA_PASO[pasoAnterior]}
                  </button>
                )}
              </>
            )}

            {pasoActual === PASO_FECHA && (
              <>
                <h2 className="mb-4 font-display text-lg uppercase tracking-wide">
                  Elige fecha y hora
                </h2>
                <p className="mb-4 text-sm text-cream-200/60">
                  {servicio.nombre} · {barbero.nombre} {barbero.apellido}
                </p>

                <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                  Fecha
                  <input
                    type="date"
                    value={fecha}
                    min={ahora ? ymd(ahora) : undefined}
                    onChange={(e) => {
                      const elegida = e.target.value
                      // Los domingos y los feriados no admiten reservas. Se
                      // avisa y no se guarda la fecha, para que el usuario no
                      // llegue al final del formulario con un error.
                      const revision = revisarFecha(elegida, calendario)
                      if (revision.bloqueado) {
                        setBloqueo({ fecha: elegida, motivo: revision.motivo })
                        setFecha('')
                        setHora('')
                        return
                      }
                      // Días de permiso del barbero (vacaciones, etc.).
                      if (ausenciaDe(elegida, ausencias)) {
                        setBloqueo({
                          fecha: elegida,
                          motivo: `${barbero.nombre} no atiende ese día. Prueba con otra fecha u otro barbero.`,
                        })
                        setFecha('')
                        setHora('')
                        return
                      }
                      setBloqueo(null)
                      setError(null)
                      setFecha(elegida)
                      setHora('')
                    }}
                    className="mt-2 block w-full rounded-xl border border-white/10 bg-ink-800 px-4 py-3 text-cream-50 outline-none focus:border-gold-500 sm:max-w-xs"
                  />
                </label>

                {bloqueo && (
                  <p className="mt-5 text-amber-300">{bloqueo.motivo}</p>
                )}

                {ausencias.length > 0 && (
                  <p className="mt-4 text-xs text-cream-200/60">
                    {barbero.nombre} no atiende:{' '}
                    {ausencias
                      .map((a) =>
                        a.fecha_inicio === a.fecha_fin
                          ? formatearFechaLarga(a.fecha_inicio)
                          : `del ${formatearFechaLarga(a.fecha_inicio)} al ${formatearFechaLarga(a.fecha_fin)}`,
                      )
                      .join(', ')}
                    .
                  </p>
                )}

                {proximosFeriados.length > 0 && (
                  <p className="mt-4 text-xs text-cream-200/60">
                    Días sin reservas: {proximosFeriados.map((f) => `${formatearFechaLarga(f.fecha)} (${f.nombre})`).join(', ')}.
                  </p>
                )}

                {fecha && horarios && !horarioDelDia && (
                  <p className="mt-5 text-amber-300">
                    El barbero no atiende ese día. Prueba con otra fecha.
                  </p>
                )}

                {horarioDelDia && (
                  <div className="mt-5">
                    <p className="text-xs uppercase tracking-wider text-cream-200/60">
                      Horario del día: {horarioDelDia.hora_inicio.slice(0, 5)} –{' '}
                      {horarioDelDia.hora_fin.slice(0, 5)}
                      {horarioDelDia.almuerzo_inicio && horarioDelDia.almuerzo_fin && (
                        <>
                          {' '}· Almuerzo: {horarioDelDia.almuerzo_inicio.slice(0, 5)} –{' '}
                          {horarioDelDia.almuerzo_fin.slice(0, 5)}
                        </>
                      )}
                    </p>
                    {slots.length === 0 ? (
                      <p className="mt-3 text-cream-200/60">
                        No hay cupos que quepan en el horario.
                      </p>
                    ) : (
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                        {slots.map((s) => {
                          const pasado = esHoy && s <= hm(ahora)
                          const duracionMin = Number(servicio.duracion_minutos) || 30
                          const inicioMin = paraMinutos(s)
                          const ocupado = seCruza(inicioMin, inicioMin + duracionMin)
                          const deshabilitado = pasado || ocupado
                          return (
                            <button
                              key={s}
                              type="button"
                              disabled={deshabilitado}
                              onClick={() => setHora(s)}
                              className={`rounded-lg border px-3 py-2.5 text-sm transition sm:px-4 sm:py-2 ${
                                hora === s
                                  ? 'border-gold-500 bg-gold-500 text-ink-950'
                                  : deshabilitado
                                    ? 'cursor-not-allowed border-white/5 text-cream-200/25 line-through'
                                    : 'border-white/15 text-cream-100 hover:border-gold-400'
                              }`}
                            >
                              {s}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Lista de espera: siempre disponible, destacada si el día está lleno. */}
                {horarioDelDia && !esReprogramar && servicio && barbero && fecha && !cargandoSesion && (
                  <ListaEsperaForm
                    barbero={barbero}
                    servicio={servicio}
                    fecha={fecha}
                    conSesion={usuario?.rol === 'cliente'}
                    lleno={!hayHorasLibres}
                  />
                )}

                {error && (
                  <p className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  {puedeVolver && (
                    <button
                      type="button"
                      onClick={() => setPaso(paso - 1)}
                      className="text-sm text-cream-200/60 hover:text-gold-400 sm:text-right"
                    >
                      ← Volver a {ETIQUETA_PASO[pasoAnterior]}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!fecha || !hora || enviando}
                    onClick={() => (esReprogramar ? confirmar() : setPaso(paso + 1))}
                    className="w-full rounded-full bg-gold-500 px-7 py-3 text-sm font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto"
                  >
                    {esReprogramar
                      ? enviando
                        ? 'Agendando…'
                        : 'Confirmar cita'
                      : 'Continuar'}
                  </button>
                </div>
              </>
            )}

            {pasoActual === PASO_DATOS && (
              <>
                <h2 className="mb-1 font-display text-lg uppercase tracking-wide">
                  Tus datos
                </h2>
                <p className="mb-4 text-sm text-cream-200/60">
                  No necesitas crear una cuenta. Tus datos se envían al barbero por
                  WhatsApp y no se guardan como usuario.
                </p>
                <p className="mb-5 rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm text-cream-200/70">
                  {servicio.nombre} · {barbero.nombre} {barbero.apellido} · {fecha} {hora}
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                    Nombre
                    <input
                      type="text"
                      value={datosInvitado.nombre}
                      onChange={(e) =>
                        setDatosInvitado((d) => ({ ...d, nombre: e.target.value }))
                      }
                      className="mt-2 block w-full rounded-xl border border-white/10 bg-ink-800 px-4 py-3 text-cream-50 outline-none focus:border-gold-500"
                    />
                  </label>
                  <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                    Apellido
                    <input
                      type="text"
                      value={datosInvitado.apellido}
                      onChange={(e) =>
                        setDatosInvitado((d) => ({ ...d, apellido: e.target.value }))
                      }
                      className="mt-2 block w-full rounded-xl border border-white/10 bg-ink-800 px-4 py-3 text-cream-50 outline-none focus:border-gold-500"
                    />
                  </label>
                  <label className="block text-xs uppercase tracking-wider text-cream-200/70 sm:col-span-2">
                    Teléfono
                    <input
                      type="tel"
                      value={datosInvitado.telefono}
                      onChange={(e) =>
                        setDatosInvitado((d) => ({ ...d, telefono: e.target.value }))
                      }
                      placeholder="0414-1234567"
                      className="mt-2 block w-full rounded-xl border border-white/10 bg-ink-800 px-4 py-3 text-cream-50 outline-none focus:border-gold-500"
                    />
                  </label>
                </div>

                {error && (
                  <p className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  {puedeVolver && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setPaso(paso - 1)
                      }}
                      className="text-sm text-cream-200/60 hover:text-gold-400"
                    >
                      ← Volver a {ETIQUETA_PASO[pasoAnterior]}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => {
                      setError(null)
                      setPaso(paso + 1)
                    }}
                    className="w-full rounded-full bg-gold-500 px-7 py-3 text-sm font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto"
                  >
                    Continuar
                  </button>
                </div>
              </>
            )}

            {pasoActual === PASO_PAGO && (
              <>
                <h2 className="mb-1 font-display text-lg uppercase tracking-wide">
                  ¿Cómo vas a pagar?
                </h2>
                <p className="mb-4 text-sm text-cream-200/60">
                  {servicio.nombre} · {barbero.nombre} {barbero.apellido} ·{' '}
                  {fecha} {hora} · {precio(servicio.precio)}
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPago((p) => ({ ...p, metodo: 'pago_movil', archivo: p.archivo }))
                    }
                    className={`rounded-xl border p-4 text-left transition ${
                      pago.metodo === 'pago_movil'
                        ? 'border-gold-500 bg-gold-500/10'
                        : 'border-white/10 bg-ink-800 hover:border-gold-500/60'
                    }`}
                  >
                    <span className="block font-semibold text-cream-50">Pago móvil</span>
                    <span className="mt-1 block text-xs text-cream-200/60">
                      Subes el comprobante del pago y el administrador lo aprueba. Tu
                      cita se confirma cuando lo da por bueno.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPago((p) => ({ ...p, metodo: 'efectivo', archivo: null }))
                    }
                    className={`rounded-xl border p-4 text-left transition ${
                      pago.metodo === 'efectivo'
                        ? 'border-gold-500 bg-gold-500/10'
                        : 'border-white/10 bg-ink-800 hover:border-gold-500/60'
                    }`}
                  >
                    <span className="block font-semibold text-cream-50">
                      Efectivo o tarjeta
                    </span>
                    <span className="mt-1 block text-xs text-cream-200/60">
                      Reservas normal y pagas aquí en el local. La cita queda con la
                      etiqueta de pago pendiente.
                    </span>
                  </button>
                </div>

                {pago.metodo === 'efectivo' && (
                  <div className="mt-4">
                    <span className="block text-xs uppercase tracking-wider text-cream-200/70">
                      ¿Cómo vas a pagar en el local?
                    </span>
                    <div className="mt-2 flex gap-2">
                      {[
                        { valor: 'efectivo', texto: 'Efectivo' },
                        { valor: 'tarjeta', texto: 'Tarjeta' },
                      ].map((opcion) => (
                        <button
                          key={opcion.valor}
                          type="button"
                          onClick={() => setPago((p) => ({ ...p, metodo: opcion.valor }))}
                          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                            pago.metodo === opcion.valor
                              ? 'bg-gold-500 text-ink-950'
                              : 'border border-white/15 text-cream-200 hover:border-gold-400'
                          }`}
                        >
                          {opcion.texto}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {pago.metodo === 'pago_movil' && (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                      Comprobante del pago
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setPago((p) => ({ ...p, archivo: e.target.files?.[0] ?? null }))
                        }
                        className="mt-2 block w-full text-xs text-cream-200/70 file:mr-3 file:rounded-full file:border-0 file:bg-gold-500 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wider file:text-ink-950"
                      />
                      <span className="mt-2 block text-[0.65rem] text-cream-200/40">
                        Una imagen del pago (JPG, PNG o WEBP). Máximo 5 MB.
                      </span>
                    </label>

                    <label className="block text-xs uppercase tracking-wider text-cream-200/70">
                      Referencia del pago
                      <input
                        type="text"
                        value={pago.referencia}
                        onChange={(e) =>
                          setPago((p) => ({ ...p, referencia: e.target.value }))
                        }
                        placeholder="1234-5678"
                        className="mt-2 block w-full rounded-xl border border-white/10 bg-ink-800 px-4 py-3 text-cream-50 outline-none focus:border-gold-500"
                      />
                      <span className="mt-2 block text-[0.65rem] text-cream-200/40">
                        El número de la operación, para que el administrador pueda
                        comprobarla.
                      </span>
                    </label>
                  </div>
                )}

                {error && (
                  <p className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  {puedeVolver && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setPaso(paso - 1)
                      }}
                      className="text-sm text-cream-200/60 hover:text-gold-400"
                    >
                      ← Volver a {ETIQUETA_PASO[pasoAnterior]}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={confirmar}
                    className="w-full rounded-full bg-gold-500 px-7 py-3 text-sm font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto"
                  >
                    {enviando
                      ? 'Agendando…'
                      : pago.metodo === 'pago_movil'
                        ? 'Reservar y enviar comprobante'
                        : 'Reservar cita'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
