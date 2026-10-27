# Acceso a gastos por institución

Cada cuenta puede tener un alcance general o una lista de jurisdicciones de gastos.
La configuración se guarda en `public.usuarios_tableros.gastos_jurisdicciones`:

| Configuración | Acceso |
| --- | --- |
| `NULL` | Conserva el alcance de los usuarios existentes y las restricciones de cada sección. |
| `ARRAY[4]` | Solo Ministerio de Salud Pública. |
| `ARRAY[3]` | Solo Ministerio de Educación. |
| Otros códigos del catálogo | Solo las instituciones asignadas. |

El inicio de sesión es el mismo para todas las cuentas. Un perfil institucional abre
`/copa/gasto` y tiene los apartados Gasto y Gastos desagregados. La sesión se valida
mediante `/api/auth/me` antes de mostrar el tablero. El encabezado identifica la
institución autorizada.

## Controles

- La API consulta el usuario activo y sus permisos en cada petición; no toma los
  permisos del navegador ni de los campos de usuario del JWT.
- Los filtros de institución se aplican en SQL antes de calcular datos, totales,
  rankings, créditos, catálogos y completitud. Una selección ajena o mixta retorna 403.
- Los perfiles institucionales no pueden consultar los recursos provinciales,
  totales de otras secciones, análisis salarial, auditoría ni los Excel originales
  que pueden contener varias instituciones.
- Los tres JSON históricos se encuentran en `apps/api/data/legacy`, fuera de los
  archivos públicos. Sus URLs anteriores pasan por la API y requieren acceso general.
- Las respuestas autenticadas son privadas y no se almacenan en caché.
- La firma requiere `JWT_SECRET` privada de al menos 32 caracteres. La configuración
  inicial genera una clave aleatoria únicamente si no existe; nunca se publica.

## Preparación y despliegue

Desde la raíz del repositorio:

```sh
node apps/api/scripts/configure-auth.js
node apps/api/scripts/migrate-access.js
node apps/api/scripts/create-institution-users.js
```

La migración es aditiva e idempotente. Las cuentas de prueba `ministerio_salud` y
`ministerio_educacion` se crean inactivas con contraseñas aleatorias almacenadas
mediante bcrypt. Las credenciales se guardan únicamente en
`apps/api/.env.institution-users.json` (ignorado por Git, permisos de archivo 0600).
Una segunda ejecución no cambia sus contraseñas ni reemplaza cuentas existentes.

El despliegue compila y prueba la aplicación antes de migrar, configurar la firma y
reiniciar la API y la web. Luego verifica las cuentas que ya están activas. Para
habilitar las dos cuentas de prueba una sola vez, ejecutar manualmente el workflow
`Verify Institutional Access` con `activate_test_users=true`. Este ejecuta
`activate-institution-users.js --activate` en el servidor: comprueba ambas cuentas,
habilita sus accesos y verifica mediante HTTP los datos
propios y el bloqueo de otras instituciones, secciones y archivos. Si falla, restaura
el estado previo de las cuentas recién habilitadas. Los despliegues posteriores no
reactivan cuentas suspendidas. La primera configuración de una
clave de firma exige iniciar sesión nuevamente a los usuarios con tokens antiguos.

## Verificación

```sh
cd apps/api
npm test
RUN_INSTITUTION_DB_TESTS=1 node --test tests/institution-access.integration.test.js
```

Las pruebas unitarias incluyen filtros omitidos o alterados, permisos falsificados,
bajas y cambios de institución con la misma sesión, bloqueos de secciones generales y
fallo cerrado ante errores de configuración/base. La integración compara las respuestas
de Salud y Educación con SQL real, sin modificar datos.

Para suspender un acceso, cambiar `activo` a `false`. Para reasignarlo, actualizar
`gastos_jurisdicciones` con códigos válidos. El cambio rige desde la siguiente petición.
Antes de revertir el código de permisos, inactivar todas las cuentas institucionales:
la versión anterior no interpreta este campo.
