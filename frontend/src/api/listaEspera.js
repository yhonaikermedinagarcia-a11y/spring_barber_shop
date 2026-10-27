import client from './client'

// Apuntarse (con o sin sesión). Devuelve { espera, message }.
export async function apuntarseListaEspera(payload) {
  const { data } = await client.post('/api/lista-espera', payload)
  return data
}

// Lista del administrador. `todas` incluye atendidas, canceladas y pasadas.
export async function getListaEspera({ todas = false } = {}) {
  const { data } = await client.get('/api/lista-espera', { params: todas ? { todas: 'true' } : {} })
  return data.esperas ?? []
}

// Las entradas activas del cliente con sesión.
export async function getMisEsperas() {
  const { data } = await client.get('/api/lista-espera/mias')
  return data.esperas ?? []
}

export async function cambiarEstadoEspera(esperaID, estado) {
  const { data } = await client.put(`/api/lista-espera/${esperaID}/estado`, { estado })
  return data.espera
}

export async function salirListaEspera(esperaID) {
  const { data } = await client.delete(`/api/lista-espera/${esperaID}`)
  return data
}
