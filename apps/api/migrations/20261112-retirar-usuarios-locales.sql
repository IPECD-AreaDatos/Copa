-- Aplicar únicamente después de publicar la API SSO y detener copa-api-test.
-- El respaldo de usuarios y telemetría debe estar verificado antes de ejecutar.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.coparticipacion_registros
    WHERE usuario IS NULL OR btrim(usuario) = ''
  ) THEN
    RAISE EXCEPTION 'Hay registros de uso sin usuario; no se puede retirar la tabla local';
  END IF;
END $$;

ALTER TABLE public.coparticipacion_registros ALTER COLUMN usuario SET NOT NULL;
ALTER TABLE public.coparticipacion_registros DROP CONSTRAINT fk_usuario;
DROP TABLE public.usuarios_tableros;
COMMIT;
