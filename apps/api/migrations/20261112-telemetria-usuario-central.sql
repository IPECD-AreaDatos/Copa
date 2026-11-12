-- Corte aditivo: conserva las 3.880 acciones y prepara nuevos eventos centrales.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.coparticipacion_registros
  ADD COLUMN IF NOT EXISTS usuario text,
  ADD COLUMN IF NOT EXISTS auditoria_central_id bigint;
UPDATE public.coparticipacion_registros r
   SET usuario = u.username
  FROM public.usuarios_tableros u
 WHERE r.id_usuario = u.id_usuario AND r.usuario IS NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.coparticipacion_registros WHERE usuario IS NULL OR btrim(usuario)='') THEN
    RAISE EXCEPTION 'Quedaron acciones sin usuario histórico';
  END IF;
END $$;
ALTER TABLE public.coparticipacion_registros ALTER COLUMN id_usuario DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS coparticipacion_registros_auditoria_central_id_uniq
  ON public.coparticipacion_registros(auditoria_central_id)
  WHERE auditoria_central_id IS NOT NULL;
COMMIT;
