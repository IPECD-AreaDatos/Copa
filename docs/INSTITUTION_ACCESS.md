# Acceso a gastos por institución

Los usuarios y permisos de Copa se administran en `imi_identidad`. Una cuenta
con rango `ministerio` tiene el alcance `jurisdiccion` asignado en
`identidad.alcances`. Las jurisdicciones actuales incluyen Salud Pública (4),
Educación (3) y Coordinación y Planificación (13).

El usuario ingresa desde el portal o desde `/copa/login` con su cuenta central.
La API consulta `/sso/me?audiencia=tablero` en cada petición y toma el rango y
los alcances vigentes. El inicio del tablero muestra indicadores provinciales
agregados; Gasto y Gastos desagregados filtran por la jurisdicción asignada.

## Controles

- La API aplica el alcance en SQL antes de calcular totales, catálogos y gráficos.
- Un filtro que mezcla jurisdicciones ajenas devuelve 403.
- El rango `ministerio` no habilita archivos Excel originales, auditoría ni
  otras secciones con datos provinciales detallados.
- Las respuestas autenticadas son privadas y no se almacenan en caché.
- Para suspender o cambiar un acceso se usa la administración de usuarios del
  portal. El cambio rige desde la siguiente petición al servicio central.

## Verificación

```sh
cd apps/api
npm test
RUN_INSTITUTION_DB_TESTS=1 node --test tests/institution-access.integration.test.js
```

Los scripts antiguos `create-institution-users.js`,
`activate-institution-users.js` y `migrate-access.js` corresponden a la tabla
local anterior y no deben volver a ejecutarse. El historial de esa etapa se
conserva en Git.
