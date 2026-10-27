-- Migración 015: permisos de los barberos y lista de espera
--
-- 1. Permisos (ausencias). Un barbero puede no trabajar unos días concretos:
--    vacaciones, un permiso médico, un curso. Antes solo existían los
--    feriados, que cierran la peluquería entera. Una ausencia va de una fecha
--    a otra (las dos incluidas) y, mientras dura, ese barbero no acepta
--    reservas.
--
-- 2. Lista de espera. Cuando un día está lleno, el cliente (con o sin cuenta)
--    se apunta para ese barbero, servicio y fecha. La API calcula en cada
--    consulta si se ha liberado alguna hora que le sirva, y el administrador
--    le avisa por WhatsApp desde el panel.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ausencia_barbero
(
    "ausenciaID"   serial  NOT NULL,
    "barberoID"    integer NOT NULL,
    fecha_inicio   date    NOT NULL,
    fecha_fin      date    NOT NULL,
    motivo         text,
    creado_en      timestamp(0) without time zone DEFAULT now() NOT NULL,
    CONSTRAINT ausencia_barbero_pkey PRIMARY KEY ("ausenciaID"),
    CONSTRAINT ausencia_barbero_barbero_fkey FOREIGN KEY ("barberoID")
        REFERENCES public.barbero ("barberoID") ON DELETE CASCADE,
    CONSTRAINT ausencia_barbero_rango_check CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS ausencia_barbero_barbero_idx
    ON public.ausencia_barbero ("barberoID", fecha_inicio, fecha_fin);

CREATE TABLE IF NOT EXISTS public.lista_espera
(
    "esperaID"     serial  NOT NULL,
    "barberoID"    integer NOT NULL,
    "servicioID"   integer NOT NULL,
    fecha          date    NOT NULL,
    "clienteID"    integer,
    nombre         text    NOT NULL,
    telefono       text    NOT NULL,
    -- Franja que le viene bien al cliente (opcional): "cualquier hora" si
    -- las dos están vacías.
    hora_desde     time without time zone,
    hora_hasta     time without time zone,
    nota           text,
    -- esperando: aún no se le ha avisado
    -- avisado:   el administrador ya le escribió
    -- atendido:  consiguió su cita
    -- cancelado: ya no la quiere (lo quita el cliente o el administrador)
    estado         text    NOT NULL DEFAULT 'esperando',
    creado_en      timestamp(0) without time zone DEFAULT now() NOT NULL,
    avisado_en     timestamp(0) without time zone,
    CONSTRAINT lista_espera_pkey PRIMARY KEY ("esperaID"),
    CONSTRAINT lista_espera_barbero_fkey FOREIGN KEY ("barberoID")
        REFERENCES public.barbero ("barberoID") ON DELETE CASCADE,
    CONSTRAINT lista_espera_servicio_fkey FOREIGN KEY ("servicioID")
        REFERENCES public.servicios ("serviciosID") ON DELETE CASCADE,
    CONSTRAINT lista_espera_cliente_fkey FOREIGN KEY ("clienteID")
        REFERENCES public.usuario ("usuarioID") ON DELETE SET NULL,
    CONSTRAINT lista_espera_estado_check
        CHECK (estado IN ('esperando', 'avisado', 'atendido', 'cancelado')),
    CONSTRAINT lista_espera_franja_check CHECK (
        (hora_desde IS NULL AND hora_hasta IS NULL)
        OR (hora_desde IS NOT NULL AND hora_hasta IS NOT NULL AND hora_hasta > hora_desde)
    )
);

CREATE INDEX IF NOT EXISTS lista_espera_fecha_idx
    ON public.lista_espera (fecha, "barberoID", estado);

COMMIT;
