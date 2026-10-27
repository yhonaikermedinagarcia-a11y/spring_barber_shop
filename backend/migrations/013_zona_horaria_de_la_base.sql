-- Migración 013: la base de datos trabaja con la hora de la peluquería
--
-- Las citas se guardan con la hora de pared del local (timestamp sin zona):
-- la de las 15:00 se guarda como 15:00. Pero las consultas que comparan con
-- "ahora" (NOW(), CURRENT_DATE) usan la zona horaria de la sesión, y en Neon
-- esa zona es UTC. El resultado: entre las 20:00 y la medianoche de Caracas,
-- "citas de hoy" contaba las de mañana, las citas "próximas" se desfasaban
-- cuatro horas y un barbero con citas por delante se podía eliminar.
--
-- Se fija la zona en la propia base de datos, así vale para todas las
-- conexiones (también las que pasan por el pooler de Neon, donde un SET por
-- sesión no se conserva). Si el usuario de la aplicación no es dueño de la
-- base, no se puede cambiar: se avisa y la migración sigue, porque no es
-- motivo para que la aplicación no arranque.

BEGIN;

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone = %L', current_database(), 'America/Caracas');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin permiso para fijar la zona horaria de la base de datos; configúrala a mano: ALTER DATABASE % SET timezone = ''America/Caracas''', current_database();
END
$$;

-- La conexión actual también, para lo que se ejecute después en ella.
SET timezone = 'America/Caracas';

COMMIT;
