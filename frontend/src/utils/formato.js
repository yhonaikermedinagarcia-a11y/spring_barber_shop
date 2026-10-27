import { API_URL } from '../api/client'

// El backend devuelve precio/comision/monto como string numerico de PostgreSQL
// (ej. "15.00"). Se normaliza a numero antes de formatear.
export function aNumero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

export function precio(valor) {
  return `$${aNumero(valor).toFixed(2)}`
}

export function duracion(minutos) {
  const m = aNumero(minutos)
  if (m < 60) return `${m} min`
  const horas = Math.floor(m / 60)
  const resto = m % 60
  return resto ? `${horas} h ${resto} min` : `${horas} h`
}

/*
 * Días de la semana, en el mismo formato que el CHECK de la base de datos
 * (`horario_laboral_dia_check`): minúsculas y sin tilde.
 *
 * El orden es lunes → domingo. Antes cada fichero tenía su propia lista y
 * dos órdenes distintos (domingo primero en unos, lunes primero en otros),
 * lo que hacía que un mismo día se mostrara en sitios diferentes.
 */
export const DIAS_SEMANA = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
]

/*
 * Iniciales para el avatar de una persona ("Carlos Navas" → "CN").
 *
 * Estaba copiado en cuatro componentes; ahora se importa de aquí.
 */
export function iniciales(nombre = '', apellido = '') {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase()
}

export function capitalizar(texto = '') {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Fecha "YYYY-MM-DD" en texto legible: "1 de enero".
 *
 * Se construye con las partes de la fecha en local, no con `toISOString()`,
 * que convertiría a UTC y en husos horarios positivos se perdería un día.
 */
export function formatearFechaLarga(fechaYmd) {
  if (!fechaYmd) return ''
  const [anio, mes, dia] = fechaYmd.split('-').map(Number)
  if (!anio || !mes || !dia) return fechaYmd
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  return `${dia} de ${meses[mes - 1]}`
}

export function fechaHora(valor) {
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return ''
  // Con el reloj de la peluquería: la cita de las 15:00 se ve a las 15:00
  // aunque el navegador esté en otra zona horaria.
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA_HORARIA })
}

/*
 * Fecha y hora en el formato que quiere <input type="datetime-local">:
 * "2026-11-02T15:00".
 *
 * La API manda la hora en UTC ("2026-11-02T19:00:00.000Z") pero la base de
 * datos guarda la hora de pared, la del local (15:00). Para el input hay que
 * volver a la hora local, que es la que ve el usuario; si se usara el texto
 * tal cual, el input mostraría cuatro horas más.
 */
export function aInputFechaHora(valor) {
  const local = enHoraLocal(valor)
  return local ? `${local.ymd}T${local.hm}` : ''
}

/*
 * Nombre de quien tiene la cita.
 *
 * Una cita puede ser de un cliente registrado (con cuenta) o de un invitado
 * (alguien que reservó sin cuenta). En el caso del invitado no hay
 * `cliente_nombre`: el nombre está en `contacto_nombre`. Sin esta ayuda, los
 * sitios que muestran el nombre del cliente se veían en blanco justo en las
 * citas de invitado, que son las que se ven desde el panel.
 */
export function nombreCliente(cita) {
  if (!cita) return ''
  if (cita.es_invitado) return cita.contacto_nombre || ''
  return `${cita.cliente_nombre ?? ''} ${cita.cliente_apellido ?? ''}`.trim()
}

// El backend guarda la foto como ruta relativa ("/uploads/foto.jpg"). Se
// convierte a URL absoluta; una URL ya completa o un data: se dejan igual.
export function urlImagen(ruta) {
  if (!ruta) return null
  if (/^(https?:)?\/\//i.test(ruta) || ruta.startsWith('data:')) return ruta
  return `${API_URL}${ruta.startsWith('/') ? '' : '/'}${ruta}`
}

// Acepta "@usuario", "usuario" o una URL completa de Instagram.
export function usuarioInstagram(valor) {
  if (!valor) return null
  const v = String(valor).trim()
  if (/^https?:\/\//i.test(v)) {
    const ultimo = v.replace(/\/+$/, '').split('/').pop()
    return ultimo || null
  }
  return v.replace(/^@/, '') || null
}

export function enlaceInstagram(valor) {
  if (!valor) return null
  const v = String(valor).trim()
  if (/^https?:\/\//i.test(v)) return v
  const usuario = usuarioInstagram(v)
  return usuario ? `https://instagram.com/${usuario}` : null
}

// Enlace de WhatsApp a partir de un teléfono cualquiera (acepta espacios, +, guiones).
export function enlaceWhatsAppNumero(telefono, mensaje) {
  const digitos = String(telefono || '').replace(/\D/g, '')
  if (!digitos) return null
  const texto = encodeURIComponent(mensaje || 'Hola, quiero reservar una cita.')
  return `https://wa.me/${digitos}?text=${texto}`
}

/*
 * Zona horaria de la peluquería.
 *
 * La base de datos guarda la hora de pared del local (una cita de las 15:00 se
 * guarda a las 15:00) y la API la manda como un instante. Para saber en qué
 * día y a qué hora cae una cita hay que mirarla con el reloj del local, no
 * con el del navegador: si el cliente tiene el teléfono en otra zona horaria
 * (de viaje, o con la hora del sistema mal puesta), los bloques del horario
 * se desplazaban y se marcaban como ocupadas horas que estaban libres.
 */
export const ZONA_HORARIA = 'America/Caracas'

const formatoLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * Día y hora de un instante según el reloj de la peluquería.
 * @param {Date|string} valor
 * @returns {{ ymd: string, hm: string, minutos: number } | null}
 */
export function enHoraLocal(valor) {
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(formatoLocal.formatToParts(d).map((x) => [x.type, x.value]))
  const hora = Number(p.hour) % 24
  const minuto = Number(p.minute)
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    hm: `${String(hora).padStart(2, '0')}:${p.minute}`,
    minutos: hora * 60 + minuto,
  }
}
