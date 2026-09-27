-- Migración 006: módulo de transacciones (movimientos de saldo)
--
-- fecha_creacion era nullable y sin default. Eso tiene dos efectos:
--   1. El INSERT la dejaba en NULL, dejando un libro de saldo sin marca temporal.
--   2. En `ORDER BY fecha_creacion DESC`, PostgreSQL coloca los NULL primero
--      (NULLS FIRST es el default en DESC), de modo que las filas sin fecha
--      encabezaban el listado.
--
-- El resto del módulo no necesitó cambios de esquema: la tabla ya tenía
-- usuarioID, tipo_movimiento, monto, saldo_restante y referencia_pago.

BEGIN;

-- 0. Rellenar las filas que ya estén sin fecha antes de imposing NOT NULL
UPDATE transacciones
SET fecha_creacion = NOW()
WHERE fecha_creacion IS NULL;

-- 1. Toda transacción queda fechada al insertarse
DO
$$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'transacciones' AND column_name = 'fecha_creacion'
              AND column_default IS NULL
        ) THEN
            ALTER TABLE public.transacciones
                ALTER COLUMN fecha_creacion SET DEFAULT NOW();
        END IF;

        ALTER TABLE public.transacciones
            ALTER COLUMN fecha_creacion SET NOT NULL;
    END
$$;

COMMIT;
