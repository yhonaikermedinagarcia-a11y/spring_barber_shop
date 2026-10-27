import { useSearchParams } from 'react-router-dom'
import AppHeader from '../../components/AppHeader'
import AdminResumen from './AdminResumen'
import AdminCitas from './AdminCitas'
import AdminNuevaCita from './AdminNuevaCita'
import AdminUsuarios from './AdminUsuarios'
import AdminServicios from './AdminServicios'
import AdminBarberos from './AdminBarberos'
import AdminHorarios from './AdminHorarios'
import AdminTransacciones from './AdminTransacciones'
import AdminResenas from './AdminResenas'
import AdminFeriados from './AdminFeriados'
import AdminPermisos from './AdminPermisos'
import AdminListaEspera from './AdminListaEspera'

const pestanas = [
  'Resumen',
  'Citas',
  'Nueva cita',
  'Usuarios',
  'Servicios',
  'Barberos',
  'Horarios',
  'Permisos',
  'Lista de espera',
  'Reseñas',
  'Pagos',
  'Días no laborables',
]

export default function PanelAdmin() {
  // La pestaña va en la URL: al recargar (F5) se vuelve a la misma pestaña y
  // sus datos se piden de nuevo a la API.
  const [params, setParams] = useSearchParams()
  const pestana = pestanas.includes(params.get('pestana')) ? params.get('pestana') : 'Resumen'
  const setPestana = (p) => setParams(p === 'Resumen' ? {} : { pestana: p }, { replace: true })

  return (
    <div className="min-h-screen bg-ink-950">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">
          Panel de administración
        </h1>

        <div className="mt-6 flex flex-wrap gap-2">
          {pestanas.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPestana(p)}
              className={`rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-wider transition ${
                pestana === p
                  ? 'bg-gold-500 text-ink-950'
                  : 'border border-white/15 text-cream-200 hover:border-gold-400'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {pestana === 'Resumen' && <AdminResumen />}
          {pestana === 'Citas' && <AdminCitas />}
          {pestana === 'Nueva cita' && <AdminNuevaCita />}
          {pestana === 'Usuarios' && <AdminUsuarios />}
          {pestana === 'Servicios' && <AdminServicios />}
          {pestana === 'Barberos' && <AdminBarberos />}
          {pestana === 'Horarios' && <AdminHorarios />}
          {pestana === 'Permisos' && <AdminPermisos />}
          {pestana === 'Lista de espera' && <AdminListaEspera />}
          {pestana === 'Reseñas' && <AdminResenas />}
          {pestana === 'Pagos' && <AdminTransacciones />}
          {pestana === 'Días no laborables' && <AdminFeriados />}
        </div>
      </div>
    </div>
  )
}
