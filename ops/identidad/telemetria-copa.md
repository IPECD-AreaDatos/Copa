# Telemetría de uso de Copa

La identidad central conserva usuarios, permisos y auditoría de acceso. La
telemetría de uso de Copa se guarda en `datos_tablero.public.coparticipacion_registros`.

## Primer corte, 12/11/2026

- Respaldo de las tablas históricas: `/var/backups/imi-identidad/copa-telemetria-preparacion-20261112.dump` (modo `0600`, verificado con `pg_restore --list`).
- La migración aditiva `apps/api/migrations/20261112-telemetria-usuario-central.sql` copió `username` a los 3.880 registros históricos y permitió nuevos registros sin ID local.
- La API escribe acciones e ingresos de cuentas centrales en esa tabla, con el usuario y los detalles disponibles.
- La vista de administración todavía combina la tabla local y `identidad.sso_auditoria_tableros` durante la transición. Los eventos centrales anteriores deben copiarse con su ID de origen antes de retirar esa combinación.
- `usuarios_tableros` sigue disponible para las referencias históricas y la vuelta atrás; no retirarlo en este corte.

## Segundo corte, 12/11/2026

- Respaldo antes del traslado: `/var/backups/imi-identidad/copa-telemetria-pretraslado-20261112T151032Z.dump` (modo `0600`, verificado con `pg_restore --list`).
- `ops/identidad/trasladar-telemetria-copa.py` copió 42 eventos anteriores de la auditoría central. Se conserva el origen y el ID en `auditoria_central_id`, para repetir el traslado sin duplicados.
- La administración de Copa lee únicamente `coparticipacion_registros`; los eventos nuevos de sesiones centrales se escriben allí. Los eventos anteriores del servicio central no incluyen IP ni detalle de interacción; esos campos quedan vacíos.
- `usuarios_tableros` y su clave foránea siguen presentes en este corte. La
  instancia de prueba `/copa-test` usa la misma base y debe detenerse antes de
  aplicar `apps/api/migrations/20261112-retirar-usuarios-locales.sql`.

## Retiro de la tabla local, 12/11/2026

La API publicada valida exclusivamente la sesión central y lee
`coparticipacion_registros.usuario`. La cuenta administradora abrió Inicio y
la auditoría con la API nueva antes del retiro. La instancia de prueba
`/copa-test` quedó detenida y su URL redirige a `/copa`.

El respaldo de `usuarios_tableros` y `coparticipacion_registros` está en
`/var/backups/imi-identidad/copa-usuarios-retiro-20261112T154002Z.dump`
(modo `0600`, verificado con `pg_restore --list`). La configuración anterior
de Nginx está en
`/etc/nginx/sites-available/ipecd.pre-copa-retire-20261112T154024Z`.
La migración `20261112-retirar-usuarios-locales.sql` se simuló con `ROLLBACK`
y luego se aplicó. La comprobación inmediata contó 3.935 registros de uso,
ninguno sin usuario y 42 eventos trasladados de identidad central. Los IDs
locales históricos permanecen en `coparticipacion_registros.id_usuario` solo
como dato de procedencia.
