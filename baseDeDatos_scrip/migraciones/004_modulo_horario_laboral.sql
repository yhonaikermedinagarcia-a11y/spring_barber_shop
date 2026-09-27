-- Migración 004: el módulo de horario laboral
--
-- El controller usa `ON CONFLICT ("barberoID", dia_semana)` para hacer upsert, pero
-- horario_laboral solo tenía su primary key sobre "horarioID". PostgreSQL responde
-- 42P10: there is no unique or exclusion constraint matching the ON CONFLICT
-- specification. Verificado antes de escribir esta migración.
--
-- Además fija el dominio de `dia_semana` y descarta horarios invertidos, datos que
-- hasta ahora la base aceptaba sinrestriction alguna.

BEGIN;

-- 0. Verificar que no haya horarios duplicados: la UNIQUE fallaría si los hay
DO
$$
    DECLARE
        duplicados text;
    BEGIN
        SELECT string_agg(detalle, ', ') INTO duplicados
        FROM (
            SELECT 'horario duplicado: barbero ' || "barberoID"::text || ' / ' || dia_semana AS detalle
            FROM horario_laboral
            GROUP BY "barberoID", dia_semana
            HAVING count(*) > 1
        ) d;

        IF duplicados IS NOT NULL THEN
            RAISE EXCEPTION 'Horarios duplicados que impiden crear la UNIQUE: %', duplicados;
        END IF;
    END
$$;

-- 1. Un horario por barbero y día: habilita el upsert del controller
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'horario_laboral_barbero_dia_key') THEN
            ALTER TABLE public.horario_laboral
                ADD CONSTRAINT horario_laboral_barbero_dia_key UNIQUE ("barberoID", dia_semana);
        END IF;
    END
$$;

-- 2. Días válidos. Se usan en minúsculas y sin tilde; el módulo de citas convierte
--    la fecha de la cita al mismo nombre para poder compararla.
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'horario_laboral_dia_check') THEN
            ALTER TABLE public.horario_laboral
                ADD CONSTRAINT horario_laboral_dia_check
                    CHECK (dia_semana IN ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'));
        END IF;
    END
$$;

-- 3. Una franja horaria inviertida nunca es válida
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'horario_laboral_rango_check') THEN
            ALTER TABLE public.horario_laboral
                ADD CONSTRAINT horario_laboral_rango_check
                    CHECK (hora_fin > hora_inicio);
        END IF;
    END
$$;

COMMIT;
