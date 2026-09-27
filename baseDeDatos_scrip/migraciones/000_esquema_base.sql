-- Migración 000: esquema base
--
-- Las migraciones 001-006 parten de tablas que ya existían, creadas a mano desde
-- `baseDeDatos_scrip/-- Table: public.sql`. Eso hacía que un clon limpio del
-- repositorio no pudiera construir la base: la 001 fallaba con
-- `relation "public.cita" does not exist`.
--
-- Esta migración crea el esquema completo para que la cadena 000..006 sea
-- reproducible desde una base vacía. Se declara con IF NOT EXISTS y las
-- constraints van condicionadas, de modo que también es segura sobre una base que
-- ya tenga el esquema (en ese caso no cambia nada).
--
-- Refleja el estado final de la base tras aplicar 001-006: incluye la columna
-- `cita.estado`, la unique de `usuario.correo`, la unique de `barbero.usuarioID`, las
-- uniques de horario_laboral y barbero_servicio, y el `DEFAULT now()` de
-- transacciones.fecha_creacion.

BEGIN;

-- Tablas
CREATE TABLE IF NOT EXISTS public.usuario
(
    "usuarioID"  serial                    NOT NULL,
    nombre       text                      NOT NULL,
    apellido     text                      NOT NULL,
    correo       text                      NOT NULL,
    telefono     text                      NOT NULL,
    clave        text                      NOT NULL,
    rol          text                      NOT NULL,
    CONSTRAINT usuario_pkey PRIMARY KEY ("usuarioID")
);

CREATE TABLE IF NOT EXISTS public.servicios
(
    "serviciosID"     serial             NOT NULL,
    nombre            text               NOT NULL,
    descripcion       text               NOT NULL,
    precio            numeric(10,2)      NOT NULL,
    duracion_minutos  integer            NOT NULL,
    CONSTRAINT servicios_pkey PRIMARY KEY ("serviciosID")
);

CREATE TABLE IF NOT EXISTS public.barbero
(
    "barberoID" serial             NOT NULL,
    "usuarioID" integer            NOT NULL,
    comision    numeric(5,2)       NOT NULL,
    estado      boolean            NOT NULL,
    CONSTRAINT barbero_pkey PRIMARY KEY ("barberoID")
);

CREATE TABLE IF NOT EXISTS public.barbero_servicio
(
    "barbero_servicioID" serial  NOT NULL,
    "barberoID"           integer NOT NULL,
    "servicioID"          integer NOT NULL,
    CONSTRAINT barbero_servicio_pkey PRIMARY KEY ("barbero_servicioID")
);

CREATE TABLE IF NOT EXISTS public.horario_laboral
(
    "horarioID"   serial  NOT NULL,
    "barberoID"   integer NOT NULL,
    dia_semana    text    NOT NULL,
    hora_inicio   time    NOT NULL,
    hora_fin      time    NOT NULL,
    CONSTRAINT horario_laboral_pkey PRIMARY KEY ("horarioID")
);

CREATE TABLE IF NOT EXISTS public.cita
(
    "citaID"     serial                        NOT NULL,
    "clienteID"  integer                       NOT NULL,
    "barberoID"  integer                       NOT NULL,
    "servicioID" integer                       NOT NULL,
    fecha_inicio timestamp(0) without time zone NOT NULL,
    fecha_fin    timestamp(0) without time zone NOT NULL,
    CONSTRAINT cita_pkey PRIMARY KEY ("citaID")
);

CREATE TABLE IF NOT EXISTS public.transacciones
(
    "transaccionID"   serial             NOT NULL,
    "usuarioID"       integer            NOT NULL,
    tipo_movimiento   text               NOT NULL,
    monto             numeric(10,2)      NOT NULL,
    saldo_restante    numeric(10,2)      NOT NULL,
    referencia_pago   text               NOT NULL,
    fecha_creacion    timestamp(0) without time zone DEFAULT now() NOT NULL,
    CONSTRAINT transacciones_pkey PRIMARY KEY ("transaccionID")
);

-- Columnas que aporta la migración 001
DO
$$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'cita' AND column_name = 'estado'
        ) THEN
            ALTER TABLE public.cita
                ADD COLUMN estado text NOT NULL DEFAULT 'pendiente';
        END IF;
    END
$$;

-- Unicidades (003, 004, 005)
DO
$$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuario_correo_key') THEN
            ALTER TABLE public.usuario ADD CONSTRAINT usuario_correo_key UNIQUE (correo);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'barbero_usuarioid_key') THEN
            ALTER TABLE public.barbero ADD CONSTRAINT barbero_usuarioid_key UNIQUE ("usuarioID");
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'horario_laboral_barbero_dia_key') THEN
            ALTER TABLE public.horario_laboral
                ADD CONSTRAINT horario_laboral_barbero_dia_key UNIQUE ("barberoID", dia_semana);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'barbero_servicio_barbero_servicio_key') THEN
            ALTER TABLE public.barbero_servicio
                ADD CONSTRAINT barbero_servicio_barbero_servicio_key UNIQUE ("barberoID", "servicioID");
        END IF;
    END
$$;

-- CHECK de dominio (001 y 004)
DO
$$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cita_estado_check') THEN
            ALTER TABLE public.cita ADD CONSTRAINT cita_estado_check
                CHECK (estado IN ('pendiente', 'confirmada', 'completada', 'cancelada'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'horario_laboral_dia_check') THEN
            ALTER TABLE public.horario_laboral ADD CONSTRAINT horario_laboral_dia_check
                CHECK (dia_semana IN ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'horario_laboral_rango_check') THEN
            ALTER TABLE public.horario_laboral ADD CONSTRAINT horario_laboral_rango_check
                CHECK (hora_fin > hora_inicio);
        END IF;
    END
$$;

-- Llaves foráneas (002)
DO
$$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_barbero_usuario') THEN
            ALTER TABLE public.barbero
                ADD CONSTRAINT fk_barbero_usuario FOREIGN KEY ("usuarioID")
                    REFERENCES public.usuario ("usuarioID") ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bs_barbero') THEN
            ALTER TABLE public.barbero_servicio
                ADD CONSTRAINT fk_bs_barbero FOREIGN KEY ("barberoID")
                    REFERENCES public.barbero ("barberoID") ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bs_servicio') THEN
            ALTER TABLE public.barbero_servicio
                ADD CONSTRAINT fk_bs_servicio FOREIGN KEY ("servicioID")
                    REFERENCES public.servicios ("serviciosID") ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_horario_barbero') THEN
            ALTER TABLE public.horario_laboral
                ADD CONSTRAINT fk_horario_barbero FOREIGN KEY ("barberoID")
                    REFERENCES public.barbero ("barberoID") ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transaccion_usuario') THEN
            ALTER TABLE public.transacciones
                ADD CONSTRAINT fk_transaccion_usuario FOREIGN KEY ("usuarioID")
                    REFERENCES public.usuario ("usuarioID") ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cita_cliente') THEN
            ALTER TABLE public.cita
                ADD CONSTRAINT fk_cita_cliente FOREIGN KEY ("clienteID")
                    REFERENCES public.usuario ("usuarioID") ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cita_barbero') THEN
            ALTER TABLE public.cita
                ADD CONSTRAINT fk_cita_barbero FOREIGN KEY ("barberoID")
                    REFERENCES public.barbero ("barberoID") ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cita_servicio') THEN
            ALTER TABLE public.cita
                ADD CONSTRAINT fk_cita_servicio FOREIGN KEY ("servicioID")
                    REFERENCES public.servicios ("serviciosID") ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
    END
$$;

COMMIT;
