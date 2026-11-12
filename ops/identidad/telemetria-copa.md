# Telemetría de uso de Copa

La identidad central conserva usuarios, permisos y auditoría de acceso. La
telemetría de uso de Copa se guarda en `datos_tablero.public.coparticipacion_registros`.

## Primer corte, 12/11/2026

- Respaldo de las tablas históricas: `/var/backups/imi-identidad/copa-telemetria-preparacion-20261112.dump` (modo `0600`, verificado con `pg_restore --list`).
- La migración aditiva `apps/api/migrations/20261112-telemetria-usuario-central.sql` copió `username` a los 3.880 registros históricos y permitió nuevos registros sin ID local.
- La API escribe acciones e ingresos de cuentas centrales en esa tabla, con el usuario y los detalles disponibles.
- La vista de administración todavía combina la tabla local y `identidad.sso_auditoria_tableros` durante la transición. Los eventos centrales anteriores deben copiarse con su ID de origen antes de retirar esa combinación.
- `usuarios_tableros` sigue disponible para las referencias históricas y la vuelta atrás; no retirarlo en este corte.

## Siguiente corte

Copiar de forma idempotente los eventos anteriores de `identidad.sso_auditoria_tableros` a `coparticipacion_registros`, usando `auditoria_central_id` para evitar duplicados. Luego la administración leerá una sola fuente. Los eventos anteriores del servicio central no incluyen IP ni detalle de interacción; esos campos quedarán vacíos. Verificar la pantalla de auditoría y los ingresos antes de retirar la tabla local de usuarios y su clave foránea.
