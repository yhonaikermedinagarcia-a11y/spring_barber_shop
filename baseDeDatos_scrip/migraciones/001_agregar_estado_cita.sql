-- Migración 001: agrega la columna `estado` a la tabla `cita`
-- Necesaria para el módulo de citas (controller + endpoint PUT /api/citas/:id/estado)

BEGIN;

-- 1. Agregar la columna con valor por defecto
ALTER TABLE public.cita
    ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendiente';

-- 2. Backfill: las citas cuya hora de fin ya pasó se marcan como completadas
UPDATE public.cita
SET estado = CASE
                 WHEN fecha_fin < NOW() THEN 'completada'
                 ELSE 'pendiente'
             END
WHERE estado = 'pendiente';

-- 3. Restringir los valores permitidos (mismos estados que valida el controller)
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'cita_estado_check') THEN
            ALTER TABLE public.cita
                ADD CONSTRAINT cita_estado_check
                    CHECK (estado IN ('pendiente', 'confirmada', 'completada', 'cancelada'));
        END IF;
    END
$$;

COMMIT;
