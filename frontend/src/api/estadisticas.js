import client from './client'

// Resumen de negocio del administrador (solo ese rol puede consultarlo).
export async function getResumen() {
  const { data } = await client.get('/api/estadisticas/resumen')
  return data
}

/*
 * Descarga el Excel de contabilidad (citas, pagos, ingresos por mes y
 * comisiones) del período indicado. Se pide como blob porque la ruta exige
 * el token: un simple enlace <a href> no lo mandaría.
 */
export async function descargarExcel({ desde, hasta } = {}) {
  let respuesta
  try {
    respuesta = await client.get('/api/estadisticas/exportar', {
      params: { desde, hasta },
      responseType: 'blob',
    })
  } catch (error) {
    // Con responseType 'blob' el error también llega como blob: se convierte
    // a JSON para que mensajeDeError pueda leer el mensaje de la API.
    if (error.response?.data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await error.response.data.text())
      } catch {
        /* se deja el error tal cual */
      }
    }
    throw error
  }
  const disposicion = respuesta.headers['content-disposition'] || ''
  const nombre = /filename="([^"]+)"/.exec(disposicion)?.[1] || 'spring-barber.xlsx'
  const url = URL.createObjectURL(respuesta.data)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return nombre
}
