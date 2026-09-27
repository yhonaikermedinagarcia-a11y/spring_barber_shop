-- Migración 005: el módulo barbero_servicio
--
-- El controller usa `ON CONFLICT DO NOTHING` para no duplicar la asignación, pero
-- barbero_servicio solo tenía su primary key sobre "barbero_servicioID". Sin una
-- UNIQUE sobre el par, el DO NOTHING nunca encuentra conflicto y los duplicados se
-- guardan sin error. Verificado: dos inserciones idénticas dejaron 2 filas.
--
-- La tabla es una relación N:M; el par (barbero, servicio) debe ser único.

BEGIN;

-- 0. Verificar que no haya asignaciones duplicadas: la UNIQUE fallaría si las hay
DO
$$
    DECLARE
        duplicados text;
    BEGIN
        SELECT string_agg(detalle, ', ') INTO duplicados
        FROM (
            SELECT 'asignación duplicada: barbero ' || "barberoID"::text || ' / servicio ' || "servicioID"::text AS detalle
            FROM barbero_servicio
            GROUP BY "barberoID", "servicioID"
            HAVING count(*) > 1
        ) d;

        IF duplicados IS NOT NULL THEN
            RAISE EXCEPTION 'Asignaciones duplicadas que impiden crear la UNIQUE: %', duplicados;
        END IF;
    END
$$;

-- 1. Un servicio por barbero, una sola vez
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'barbero_servicio_barbero_servicio_key') THEN
            ALTER TABLE public.barbero_servicio
                ADD CONSTRAINT barbero_servicio_barbero_servicio_key UNIQUE ("barberoID", "servicioID");
        END IF;
    END
$$;

COMMIT;
