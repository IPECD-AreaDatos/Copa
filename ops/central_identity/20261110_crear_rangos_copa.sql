BEGIN;

INSERT INTO identidad.rangos (tablero_id, codigo, descripcion)
SELECT t.id, nuevos.codigo, nuevos.descripcion
FROM identidad.tableros t
CROSS JOIN (VALUES
  ('lector', 'Consulta de módulos generales; sin gastos desagregados ni administración.'),
  ('analista-gastos', 'Consulta de módulos generales y gastos desagregados, incluidas sus hojas disponibles.'),
  ('ministerio', 'Consulta de Inicio provincial y gastos limitados a las jurisdicciones asignadas en identidad.alcances.')
) AS nuevos(codigo, descripcion)
WHERE t.codigo = 'copa'
ON CONFLICT (tablero_id, codigo) DO UPDATE
SET descripcion = EXCLUDED.descripcion
WHERE identidad.rangos.descripcion IS DISTINCT FROM EXCLUDED.descripcion;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM identidad.rangos r
    JOIN identidad.tableros t ON t.id = r.tablero_id
    JOIN identidad.accesos a ON a.rango_id = r.id
    WHERE t.codigo = 'copa' AND r.codigo = 'editor'
  ) THEN
    RAISE EXCEPTION 'Copa legacy editor range is still assigned';
  END IF;
  DELETE FROM identidad.rangos r
  USING identidad.tableros t
  WHERE t.id = r.tablero_id AND t.codigo = 'copa' AND r.codigo = 'editor';

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
    WHERE t.codigo = 'copa' AND r.codigo IN ('admin', 'lector', 'analista-gastos', 'ministerio')
  ) <> 4 OR (
    SELECT count(*)
    FROM identidad.rangos r
    JOIN identidad.tableros t ON t.id = r.tablero_id
    WHERE t.codigo = 'copa'
  ) <> 4 THEN
    RAISE EXCEPTION 'Copa roles were not created as expected';
  END IF;
END
$$;

COMMIT;
