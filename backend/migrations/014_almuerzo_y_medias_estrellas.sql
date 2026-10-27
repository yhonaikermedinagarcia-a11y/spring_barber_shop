-- Migración 014: hora de almuerzo de los barberos y reseñas con media estrella
--
-- 1. Almuerzo. Cada día del horario laboral puede tener un descanso
--    (almuerzo_inicio - almuerzo_fin). Durante ese tramo no se puede reservar:
--    lo comprueba la API al agendar y la web no ofrece esas horas.
--    Los dos campos van juntos (los dos vacíos = sin almuerzo) y el descanso
--    tiene que caer dentro de la jornada.
--
--    A los días de jornada completa que ya existen (los que abren antes de las
--    12:00 y cierran a las 15:00 o más tarde) se les pone el almuerzo de
--    12:00 a 13:00. Los días cortos, como el sábado de 09:00 a 14:00, se
--    quedan sin almuerzo. Se cambia por barbero y por día desde el panel.
--
-- 2. Reseñas. La web deja calificar con medias estrellas (4.5), pero la
--    columna era un entero entre 1 y 5: las reseñas con media estrella se
--    rechazaban con un error. Ahora admite de 0.5 a 5, de media en media.

BEGIN;

ALTER TABLE public.horario_laboral
    ADD COLUMN IF NOT EXISTS almuerzo_inicio time without time zone,
    ADD COLUMN IF NOT EXISTS almuerzo_fin    time without time zone;

DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'horario_laboral_almuerzo_check') THEN
            ALTER TABLE public.horario_laboral
                ADD CONSTRAINT horario_laboral_almuerzo_check CHECK (
                    (almuerzo_inicio IS NULL AND almuerzo_fin IS NULL)
                    OR (
                        almuerzo_inicio IS NOT NULL AND almuerzo_fin IS NOT NULL
                        AND almuerzo_fin > almuerzo_inicio
                        AND almuerzo_inicio >= hora_inicio
                        AND almuerzo_fin <= hora_fin
                    )
                );
        END IF;
    END
$$;

UPDATE public.horario_laboral
SET almuerzo_inicio = '12:00', almuerzo_fin = '13:00'
WHERE almuerzo_inicio IS NULL
  AND hora_inicio <= '12:00'
  AND hora_fin >= '15:00';

-- Reseñas: de entero a numeric(2,1), en pasos de 0.5.
ALTER TABLE public.resena DROP CONSTRAINT IF EXISTS resena_calificacion_check;
ALTER TABLE public.resena ALTER COLUMN calificacion TYPE numeric(2,1) USING calificacion::numeric(2,1);
ALTER TABLE public.resena
    ADD CONSTRAINT resena_calificacion_check
        CHECK (calificacion BETWEEN 0.5 AND 5 AND calificacion * 2 = floor(calificacion * 2));

COMMIT;
