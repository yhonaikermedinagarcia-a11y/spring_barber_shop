import { useState } from 'react'
import { Link } from 'react-router-dom'
import { recuperarClave } from '../api/auth'
import { mensajeDeError } from '../api/client'
import { inputClase } from '../ui/estilos'
import logo from '../assets/logo-spring.jpg'

export default function Recuperar() {
  const [form, setForm] = useState({
    correo: '',
    telefono: '',
    claveNueva: '',
    confirmar: '',
  })
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)

  function cambio(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function enviar(e) {
    e.preventDefault()
    setError(null)

    if (form.claveNueva.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres')
      return
    }
    if (form.claveNueva !== form.confirmar) {
      setError('Las contraseñas no coinciden')
      return
    }

    setEnviando(true)
    try {
      await recuperarClave({
        correo: form.correo.trim(),
        telefono: form.telefono.trim(),
        claveNueva: form.claveNueva,
      })
      setHecho(true)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-ink-950 px-4 py-8 sm:px-5 sm:py-12">
      <div className="my-auto flex w-full flex-col items-center">
        <Link to="/" className="mb-6 flex flex-col items-center sm:mb-8">
          <img
            src={logo}
            alt="Spring Barber Shop"
            className="h-20 w-20 rounded-full object-cover shadow-lg shadow-black/50 sm:h-28 sm:w-28"
          />
        </Link>

        <form
          onSubmit={enviar}
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 sm:p-7"
        >
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide">
          Recuperar contraseña
        </h1>

        {hecho ? (
          <>
            <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
              Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.
            </p>
            <Link
              to="/login"
              className="mt-6 block w-full rounded-full bg-gold-500 py-3 text-center text-sm font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400"
            >
              Ir a iniciar sesión
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-cream-200/60">
              Confirma tu identidad con el correo y el teléfono de tu cuenta.
            </p>
            <p className="mt-2 text-xs text-cream-200/50">
              Las cuentas de barbero y de administración no se recuperan desde aquí:
              pide al administrador que te asigne una contraseña nueva.
            </p>

            <label className="mt-6 block text-xs uppercase tracking-wider text-cream-200/70">
              Correo
              <input
                type="email"
                name="correo"
                autoComplete="email"
                required
                value={form.correo}
                onChange={cambio}
                className={`mt-2 ${inputClase}`}
                placeholder="tu@correo.com"
              />
            </label>

            <label className="mt-4 block text-xs uppercase tracking-wider text-cream-200/70">
              Teléfono
              <input
                type="tel"
                name="telefono"
                autoComplete="tel"
                required
                value={form.telefono}
                onChange={cambio}
                className={`mt-2 ${inputClase}`}
                placeholder="300 000 0000"
              />
            </label>

            <label className="mt-4 block text-xs uppercase tracking-wider text-cream-200/70">
              Nueva contraseña
              <input
                type="password"
                name="claveNueva"
                autoComplete="new-password"
                required
                value={form.claveNueva}
                onChange={cambio}
                className={`mt-2 ${inputClase}`}
              />
            </label>

            <label className="mt-4 block text-xs uppercase tracking-wider text-cream-200/70">
              Repite la nueva contraseña
              <input
                type="password"
                name="confirmar"
                autoComplete="new-password"
                required
                value={form.confirmar}
                onChange={cambio}
                className={`mt-2 ${inputClase}`}
              />
            </label>

            {error && (
              <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="mt-6 w-full rounded-full bg-gold-500 py-3 text-sm font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enviando ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </>
        )}

        <p className="mt-5 text-center text-sm text-cream-200/60">
          ¿Recordaste tu contraseña?{' '}
          <Link to="/login" className="font-semibold text-gold-400 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </form>
      </div>
    </div>
  )
}
