import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import logo from '../assets/logo-spring.jpg'
import MenuMovil, { IconoHamburguesa, enlaceMenu } from './MenuMovil'

function enlaceClase({ isActive }) {
  return `rounded-full px-4 py-2 text-base uppercase tracking-wider transition ${
    isActive ? 'bg-gold-500/15 text-gold-300' : 'text-cream-200 hover:text-gold-400'
  }`
}

export default function AppHeader() {
  const { usuario, cerrarSesion } = useAuth()
  const navigate = useNavigate()
  const [menuAbierto, setMenuAbierto] = useState(false)

  const esBarbero = usuario?.rol === 'barbero'
  const esAdmin = usuario?.rol === 'administrador'

  // El administrador no es cliente de la peluquería: su cuenta es de trabajo,
  // así que no se le ofrecen los enlaces de reservar ni de "Mis citas". Las
  // citas las agenda desde el panel, para los demás.
  const esCliente = !esAdmin

  function salir() {
    setMenuAbierto(false)
    cerrarSesion()
    navigate('/login', { replace: true })
  }

  // Los enlaces de navegación, compartidos entre la barra de escritorio y el
  // menú lateral de móvil.
  const enlaces = (
    <>
      {esAdmin && (
        <NavLink to="/admin" className={enlaceClase} onClick={() => setMenuAbierto(false)}>
          Admin
        </NavLink>
      )}
      {esBarbero && (
        <NavLink to="/barbero" className={enlaceClase} onClick={() => setMenuAbierto(false)}>
          Mi agenda
        </NavLink>
      )}
      {esCliente && (
        <>
          <NavLink to="/reservar" className={enlaceClase} onClick={() => setMenuAbierto(false)}>
            Reservar
          </NavLink>
          {usuario && (
            <NavLink to="/mis-citas" className={enlaceClase} onClick={() => setMenuAbierto(false)}>
              Mis citas
            </NavLink>
          )}
        </>
      )}
      {usuario && (
        <NavLink to="/perfil" className={enlaceClase} onClick={() => setMenuAbierto(false)}>
          Mi perfil
        </NavLink>
      )}
    </>
  )

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-5">
        <Link to="/" className="flex shrink-0 items-center">
          <img
            src={logo}
            alt="Spring Barber Shop"
            className="h-11 w-11 rounded-full object-cover shadow-md shadow-black/40 sm:h-14 sm:w-14 md:h-20 md:w-20"
          />
        </Link>

        <nav className="hidden items-center gap-1 md:flex md:ml-6">{enlaces}</nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden text-right text-xs leading-tight text-cream-200/70 lg:block">
            <span className="block font-semibold text-cream-50">
              {usuario?.nombre} {usuario?.apellido}
            </span>
            <span className="uppercase tracking-wider text-gold-400">{usuario?.rol}</span>
          </span>

          {/* Quien reserva sin cuenta también ve esta cabecera: a esa persona
              no se le ofrece "Salir" (no hay sesión) sino entrar. */}
          {usuario ? (
            <button
              type="button"
              onClick={salir}
              className="hidden rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-cream-200 transition hover:border-red-400/60 hover:text-red-300 md:inline-flex"
            >
              Salir
            </button>
          ) : (
            <Link
              to="/login"
              className="hidden rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-cream-200 transition hover:border-gold-400 hover:text-gold-300 md:inline-flex"
            >
              Iniciar sesión
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
            aria-expanded={menuAbierto}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-cream-200 transition hover:border-gold-400 hover:text-gold-300 md:hidden"
          >
            <IconoHamburguesa />
          </button>
        </div>
      </div>

      <MenuMovil abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} titulo="Menú">
        <div className="mb-2 border-b border-white/10 px-4 pb-3">
          <p className="font-semibold text-cream-50">
            {usuario?.nombre} {usuario?.apellido}
          </p>
          <p className="text-xs uppercase tracking-wider text-gold-400">{usuario?.rol}</p>
        </div>

        <div className="flex flex-col gap-1">{enlaces}</div>

        {usuario ? (
          <button
            type="button"
            onClick={salir}
            className="mt-3 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold uppercase tracking-wider text-cream-200 transition hover:border-red-400/60 hover:text-red-300"
          >
            Salir
          </button>
        ) : (
          <Link
            to="/login"
            onClick={() => setMenuAbierto(false)}
            className="mt-3 rounded-full border border-white/15 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wider text-cream-200 transition hover:border-gold-400 hover:text-gold-300"
          >
            Iniciar sesión
          </Link>
        )}

        <Link
          to="/"
          onClick={() => setMenuAbierto(false)}
          className={`${enlaceMenu} mt-1 text-center`}
        >
          Ir al inicio
        </Link>
      </MenuMovil>
    </header>
  )
}
