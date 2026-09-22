-- Table: public.usuario

-- DROP TABLE IF EXISTS public.usuario;

CREATE TABLE IF NOT EXISTS public.usuario
(
    "usuarioID" serial NOT NULL,
    nombre text COLLATE pg_catalog."default" NOT NULL,
    apellido text COLLATE pg_catalog."default" NOT NULL,
    correo text COLLATE pg_catalog."default" NOT NULL,
    telefono text COLLATE pg_catalog."default" NOT NULL,
    clave text COLLATE pg_catalog."default" NOT NULL,
    rol text COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT usuario_pkey PRIMARY KEY ("usuarioID")
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.usuario
    OWNER to postgres;



-- Table: public.transacciones

-- DROP TABLE IF EXISTS public.transacciones;

CREATE TABLE IF NOT EXISTS public.transacciones
(
    "transaccionID" serial NOT NULL,
    "usuarioID" integer NOT NULL,
    tipo_movimiento text COLLATE pg_catalog."default" NOT NULL,
    monto numeric(10,2) NOT NULL,
    saldo_restante numeric(10,2) NOT NULL,
    referencia_pago text COLLATE pg_catalog."default" NOT NULL,
    fecha_creacion timestamp(0) without time zone,
    CONSTRAINT transacciones_pkey PRIMARY KEY ("transaccionID")
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.transacciones
    OWNER to postgres;


-- Table: public.servicios

-- DROP TABLE IF EXISTS public.servicios;

CREATE TABLE IF NOT EXISTS public.servicios
(
    "serviciosID" serial NOT NULL,
    nombre text COLLATE pg_catalog."default" NOT NULL,
    "descripcion " text COLLATE pg_catalog."default" NOT NULL,
    precio numeric(10,2) NOT NULL,
    duracion_minutos integer NOT NULL,
    CONSTRAINT servicios_pkey PRIMARY KEY ("serviciosID")
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.servicios
    OWNER to postgres;


-- Table: public.horario_laboral

-- DROP TABLE IF EXISTS public.horario_laboral;

CREATE TABLE IF NOT EXISTS public.horario_laboral
(
    "horarioID" serial NOT NULL,
    "barberoID" integer NOT NULL,
    dia_semana text COLLATE pg_catalog."default" NOT NULL,
    hora_inicio time(0) without time zone NOT NULL,
    hora_fin time(0) without time zone NOT NULL,
    CONSTRAINT horario_laboral_pkey PRIMARY KEY ("horarioID")
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.horario_laboral
    OWNER to postgres;


-- Table: public.cita

-- DROP TABLE IF EXISTS public.cita;

CREATE TABLE IF NOT EXISTS public.cita
(
    "citaID" serial NOT NULL,
    "clienteID" integer NOT NULL,
    "barberoID" integer NOT NULL,
    "servicioID" integer NOT NULL,
    fecha_inicio timestamp(0) without time zone NOT NULL,
    fecha_fin timestamp(0) without time zone NOT NULL,
    CONSTRAINT cita_pkey PRIMARY KEY ("citaID")
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.cita
    OWNER to postgres;

-- Table: public.barbero_servicio

-- DROP TABLE IF EXISTS public.barbero_servicio;

CREATE TABLE IF NOT EXISTS public.barbero_servicio
(
    "barbero_servicioID" serial NOT NULL,
    "barberoID" integer NOT NULL,
    "servicioID" integer NOT NULL,
    CONSTRAINT barbero_servicio_pkey PRIMARY KEY ("barbero_servicioID")
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.barbero_servicio
    OWNER to postgres;    



-- Table: public.barbero

-- DROP TABLE IF EXISTS public.barbero;

CREATE TABLE IF NOT EXISTS public.barbero
(
    "barberoID" serial NOT NULL,
    "usuarioID" integer NOT NULL,
    comision numeric(5,2) NOT NULL,
    estado boolean NOT NULL,
    CONSTRAINT barbero_pkey PRIMARY KEY ("barberoID")
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.barbero
    OWNER to postgres;