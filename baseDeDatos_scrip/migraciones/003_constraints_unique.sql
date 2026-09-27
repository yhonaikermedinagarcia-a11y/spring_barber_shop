-- Migración 003: constraints UNIQUE faltantes
-- Sin estas restricciones la base acepta datos duplicados que el código ya asumía
-- prohibidos: los handlers de `error.code === '23505'` en usuarioController.crearUsuario
-- ("El correo ya está registrado") y barberoController.crearBarbero nunca se ejecutaban.
--
-- Nota de identificadores: la columna es "usuarioID" (camelCase). Sin las comillas
-- dobles PostgreSQL la pliega a `usuarioid`, que no existe (error 42703).

BEGIN;

-- 0. Verificar que no haya duplicados: la UNIQUE fallaría si los hay
DO
$$
    DECLARE
        duplicados text;
    BEGIN
        SELECT string_agg(detalle, ', ') INTO duplicados
        FROM (
            SELECT 'correo duplicado en usuario: ' || correo AS detalle
            FROM usuario GROUP BY correo HAVING count(*) > 1
            UNION ALL
            SELECT 'usuario con mas de un barbero: ' || "usuarioID"::text
            FROM barbero GROUP BY "usuarioID" HAVING count(*) > 1
        ) d;

        IF duplicados IS NOT NULL THEN
            RAISE EXCEPTION 'Datos duplicados que impiden crear las UNIQUE: %', duplicados;
        END IF;
    END
$$;

-- 1. Un correo identifica a un solo usuario
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'usuario_correo_key') THEN
            ALTER TABLE public.usuario
                ADD CONSTRAINT usuario_correo_key UNIQUE (correo);
        END IF;
    END
$$;

-- 2. Un usuario solo puede registrarse como barbero una vez
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'barbero_usuarioid_key') THEN
            ALTER TABLE public.barbero
                ADD CONSTRAINT barbero_usuarioid_key UNIQUE ("usuarioID");
        END IF;
    END
$$;

COMMIT;
