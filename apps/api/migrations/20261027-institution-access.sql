ALTER TABLE public.usuarios_tableros
    ADD COLUMN IF NOT EXISTS gastos_jurisdicciones integer[] DEFAULT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'public.usuarios_tableros'::regclass
                     AND conname = 'usuarios_tableros_gastos_jurisdicciones_check') THEN
        ALTER TABLE public.usuarios_tableros
            ADD CONSTRAINT usuarios_tableros_gastos_jurisdicciones_check
            CHECK (gastos_jurisdicciones IS NULL OR (
                array_ndims(gastos_jurisdicciones) = 1
                AND cardinality(gastos_jurisdicciones) > 0
                AND array_position(gastos_jurisdicciones, NULL) IS NULL
                AND 0 < ALL(gastos_jurisdicciones)
            ));
    END IF;
END $$;
