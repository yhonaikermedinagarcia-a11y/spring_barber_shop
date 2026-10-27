import client from './client'

// Permisos de un barbero (público): [{ ausenciaID, fecha_inicio, fecha_fin }]
export async function getAusenciasBarbero(barberoID) {
  const { data } = await client.get(`/api/ausencias/barbero/${barberoID}`)
  return data.ausencias ?? []
}

// Todos los permisos (admin) o los propios (barbero). `todas` incluye los pasados.
export async function getAusencias({ todas = false } = {}) {
  const { data } = await client.get('/api/ausencias', { params: todas ? { todas: 'true' } : {} })
  return data.ausencias ?? []
}

// Devuelve { ausencia, citasAfectadas, message }
export async function crearAusencia(payload) {
  const { data } = await client.post('/api/ausencias', payload)
  return data
}

export async function eliminarAusencia(ausenciaID) {
  const { data } = await client.delete(`/api/ausencias/${ausenciaID}`)
  return data
}

// ¿La fecha "YYYY-MM-DD" cae dentro de algún permiso?
export function ausenciaDe(fecha, ausencias = []) {
  if (!fecha) return null
  return ausencias.find((a) => fecha >= a.fecha_inicio && fecha <= a.fecha_fin) ?? null
}
