# Migración de usuarios de Copa a identidad central

## Rangos y permisos

| Rango central | Permiso actual de Copa |
| --- | --- |
| `admin` | Administración del tablero y gastos desagregados |
| `lector` | Consulta general |
| `analista-gastos` | Gastos desagregados y archivos Excel |
| `consulta-salud` | Consulta de gastos limitada a Salud Pública (jurisdicción 4) |
| `consulta-educacion` | Consulta de gastos limitada a Educación (jurisdicción 3) |

La migración agrega los cuatro rangos que todavía no existan en el catálogo de
Copa. Crea 11 cuentas centrales, conserva los hashes bcrypt actuales y asigna un
acceso por cuenta. En el primer login central, el servicio convierte el hash
heredado a su algoritmo actual.

## Ejecución

Desde la raíz del repositorio, primero ejecutar la simulación:

```powershell
python ops/identidad/migrar-usuarios-copa.py
```

Debe informar el plan `11|11|11|4|11` (usuarios, credenciales, accesos, rangos
nuevos y vínculos de origen), verificar 11 cuentas y revertir la transacción.
La simulación no escribe cambios persistentes.

Después de publicar el código de Copa con la integración central todavía
desactivada, aplicar la migración:

```powershell
python ops/identidad/migrar-usuarios-copa.py --apply
```

El comando vuelve a simular, genera y valida un respaldo restringido del esquema
`identidad`, y recién entonces confirma la importación. No modifica ni elimina
`datos_tablero.public.usuarios_tableros`; esa tabla conserva las cuentas y
contraseñas anteriores para la convivencia o una vuelta atrás controlada.

## Activación y vuelta atrás

Activar SSO de Copa solo cuando el código esté publicado y las 11 cuentas
centrales estén verificadas. La activación requiere `COPA_SSO_MODE=production`,
`COPA_SSO_PRODUCTION_ENABLED=si`, el origen interno `http://127.0.0.1:39001` y
el origen público `https://appimi.corrientes.gob.ar`.

Para volver al login local, quitar la configuración `COPA_SSO_*` del proceso de
la API y reiniciarlo. La tabla local se conserva y permite validar el ingreso
anterior. No restaurar el respaldo completo del esquema si la base central ya
recibió otros cambios; desactivar los accesos de Copa importados desde la
administración central y conservar el respaldo para recuperación puntual.
