-- Migración 002: agrega las llaves foráneas definidas en el script de esquema public_IA.sql
-- La BD se creó desde `public.sql`, que no incluye la sección de RELACIONES / LLAVES FORÁNEAS.
-- Sin estas FKs la base acepta citas de clientes/barberos/servicios inexistentes.

BEGIN;

-- 0. Verificar que no haya datos huérfanos: las FKs fallarían si los hay.
--    Se usa LEFT JOIN ... IS NULL para que una tabla vacía NO se reporte como huérfana.
DO
$$
    DECLARE
        huerfanos text;
    BEGIN
        SELECT string_agg(origen, ', ') INTO huerfanos
        FROM (
            SELECT 'cita.clienteID -> usuario' AS origen WHERE EXISTS (SELECT 1 FROM cita c LEFT JOIN usuario u ON c."clienteID" = u."usuarioID" WHERE u."usuarioID" IS NULL)
            UNION ALL SELECT 'cita.barberoID -> barbero' WHERE EXISTS (SELECT 1 FROM cita c LEFT JOIN barbero b ON c."barberoID" = b."barberoID" WHERE b."barberoID" IS NULL)
            UNION ALL SELECT 'cita.servicioID -> servicios' WHERE EXISTS (SELECT 1 FROM cita c LEFT JOIN servicios s ON c."servicioID" = s."serviciosID" WHERE s."serviciosID" IS NULL)
            UNION ALL SELECT 'barbero.usuarioID -> usuario' WHERE EXISTS (SELECT 1 FROM barbero b LEFT JOIN usuario u ON b."usuarioID" = u."usuarioID" WHERE u."usuarioID" IS NULL)
            UNION ALL SELECT 'barbero_servicio.barberoID -> barbero' WHERE EXISTS (SELECT 1 FROM barbero_servicio bs LEFT JOIN barbero b ON bs."barberoID" = b."barberoID" WHERE b."barberoID" IS NULL)
            UNION ALL SELECT 'barbero_servicio.servicioID -> servicios' WHERE EXISTS (SELECT 1 FROM barbero_servicio bs LEFT JOIN servicios s ON bs."servicioID" = s."serviciosID" WHERE s."serviciosID" IS NULL)
            UNION ALL SELECT 'horario_laboral.barberoID -> barbero' WHERE EXISTS (SELECT 1 FROM horario_laboral h LEFT JOIN barbero b ON h."barberoID" = b."barberoID" WHERE b."barberoID" IS NULL)
            UNION ALL SELECT 'transacciones.usuarioID -> usuario' WHERE EXISTS (SELECT 1 FROM transacciones t LEFT JOIN usuario u ON t."usuarioID" = u."usuarioID" WHERE u."usuarioID" IS NULL)
        ) h;

        IF huerfanos IS NOT NULL THEN
            RAISE EXCEPTION 'Datos huérfanos que impiden crear las FKs: %', huerfanos;
        END IF;
    END
$$;

-- 1. Un barbero pertenece a un usuario registrado
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'fk_barbero_usuario') THEN
            ALTER TABLE public.barbero
                ADD CONSTRAINT fk_barbero_usuario
                    FOREIGN KEY ("usuarioID") REFERENCES public.usuario ("usuarioID")
                        ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
    END
$$;

-- 2. Tabla intermedia barbero <-> servicios
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'fk_bs_barbero') THEN
            ALTER TABLE public.barbero_servicio
                ADD CONSTRAINT fk_bs_barbero
                    FOREIGN KEY ("barberoID") REFERENCES public.barbero ("barberoID")
                        ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'fk_bs_servicio') THEN
            ALTER TABLE public.barbero_servicio
                ADD CONSTRAINT fk_bs_servicio
                    FOREIGN KEY ("servicioID") REFERENCES public.servicios ("serviciosID")
                        ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
    END
$$;

-- 3. El horario laboral pertenece a un barbero
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'fk_horario_barbero') THEN
            ALTER TABLE public.horario_laboral
                ADD CONSTRAINT fk_horario_barbero
                    FOREIGN KEY ("barberoID") REFERENCES public.barbero ("barberoID")
                        ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
    END
$$;

-- 4. Las transacciones de saldo pertenecen al usuario administrador
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'fk_transaccion_usuario') THEN
            ALTER TABLE public.transacciones
                ADD CONSTRAINT fk_transaccion_usuario
                    FOREIGN KEY ("usuarioID") REFERENCES public.usuario ("usuarioID")
                        ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
    END
$$;

-- 5. Una cita vincula a un cliente, un barbero y un servicio
DO
$$
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'fk_cita_cliente') THEN
            ALTER TABLE public.cita
                ADD CONSTRAINT fk_cita_cliente
                    FOREIGN KEY ("clienteID") REFERENCES public.usuario ("usuarioID")
                        ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'fk_cita_barbero') THEN
            ALTER TABLE public.cita
                ADD CONSTRAINT fk_cita_barbero
                    FOREIGN KEY ("barberoID") REFERENCES public.barbero ("barberoID")
                        ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'fk_cita_servicio') THEN
            ALTER TABLE public.cita
                ADD CONSTRAINT fk_cita_servicio
                    FOREIGN KEY ("servicioID") REFERENCES public.servicios ("serviciosID")
                        ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
    END
$$;

COMMIT;
