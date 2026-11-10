BEGIN;

INSERT INTO identidad.rangos (tablero_id, codigo, descripcion)
SELECT t.id, nuevos.codigo, nuevos.descripcion
FROM identidad.tableros t
CROSS JOIN (VALUES
  ('editor', 'Consulta de modulos generales y desglose de gastos; sin administracion.'),
  ('lector', 'Consulta de modulos generales; sin desglose de gastos ni administracion.')
) AS nuevos(codigo, descripcion)
WHERE t.codigo = 'copa'
ON CONFLICT (tablero_id, codigo) DO UPDATE
SET descripcion = EXCLUDED.descripcion
WHERE identidad.rangos.descripcion IS DISTINCT FROM EXCLUDED.descripcion;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM identidad.rangos r
    JOIN identidad.tableros t ON t.id = r.tablero_id
    WHERE t.codigo = 'copa' AND r.codigo = 'admin'
  ) THEN
    RAISE EXCEPTION 'Copa admin role is missing';
  END IF;
  IF (
    SELECT count(*)
    FROM identidad.rangos r
    JOIN identidad.tableros t ON t.id = r.tablero_id
    WHERE t.codigo = 'copa' AND r.codigo IN ('admin', 'editor', 'lector')
  ) <> 3 THEN
    RAISE EXCEPTION 'Copa roles were not created as expected';
  END IF;
END
$$;

COMMIT;
