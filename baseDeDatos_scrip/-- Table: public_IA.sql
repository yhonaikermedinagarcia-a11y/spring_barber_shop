-- Table: public.usuario
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


-- Table: public.barbero
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


-- Table: public.servicios
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


-- Table: public.barbero_servicio
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


-- Table: public.horario_laboral
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


-- Table: public.transacciones
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


-- Table: public.cita
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


-----------------------------------------------------------------
-- RELACIONES / LLAVES FORÁNEAS (FOREIGN KEYS)
-----------------------------------------------------------------

-- Relación: Un barbero pertenece a un usuario registrado
ALTER TABLE public.barbero
    ADD CONSTRAINT fk_barbero_usuario 
    FOREIGN KEY ("usuarioID") 
    REFERENCES public.usuario ("usuarioID") 
    ON UPDATE CASCADE ON DELETE CASCADE;

-- Relación: Tabla intermedia que une un barbero con los servicios que ofrece
ALTER TABLE public.barbero_servicio
    ADD CONSTRAINT fk_bs_barbero 
    FOREIGN KEY ("barberoID") 
    REFERENCES public.barbero ("barberoID") 
    ON UPDATE CASCADE ON DELETE CASCADE,
    ADD CONSTRAINT fk_bs_servicio 
    FOREIGN KEY ("servicioID") 
    REFERENCES public.servicios ("serviciosID") 
    ON UPDATE CASCADE ON DELETE CASCADE;

-- Relación: El horario laboral pertenece a un barbero específico
ALTER TABLE public.horario_laboral
    ADD CONSTRAINT fk_horario_barbero 
    FOREIGN KEY ("barberoID") 
    REFERENCES public.barbero ("barberoID") 
    ON UPDATE CASCADE ON DELETE CASCADE;

-- Relación: Las transacciones de saldo (Pay-Per-Booking) pertenecen al usuario administrador
ALTER TABLE public.transacciones
    ADD CONSTRAINT fk_transaccion_usuario 
    FOREIGN KEY ("usuarioID") 
    REFERENCES public.usuario ("usuarioID") 
    ON UPDATE CASCADE ON DELETE CASCADE;

-- Relación: Una cita vincula a un cliente, un barbero y un servicio
ALTER TABLE public.cita
    ADD CONSTRAINT fk_cita_cliente 
    FOREIGN KEY ("clienteID") 
    REFERENCES public.usuario ("usuarioID") 
    ON UPDATE CASCADE ON DELETE CASCADE,
    ADD CONSTRAINT fk_cita_barbero 
    FOREIGN KEY ("barberoID") 
    REFERENCES public.barbero ("barberoID") 
    ON UPDATE CASCADE ON DELETE CASCADE,
    ADD CONSTRAINT fk_cita_servicio 
    FOREIGN KEY ("servicioID") 
    REFERENCES public.servicios ("serviciosID") 
    ON UPDATE CASCADE ON DELETE CASCADE;