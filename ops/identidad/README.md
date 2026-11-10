# Migración de usuarios de Copa a identidad central

## Rangos y permisos

| Rango central | Permiso actual de Copa |
| --- | --- |
| `admin` | Administración del tablero y gastos desagregados |
| `lector` | Consulta general |
| `analista-gastos` | Gastos desagregados y sus hojas de Excel disponibles dentro del tablero |
| `ministerio` | Inicio con indicadores provinciales agregados; Gasto y Gastos desagregados filtrados por las jurisdicciones asignadas en `identidad.alcances` |

La migración agrega los rangos necesarios que todavía no existan en el catálogo
de Copa. Retira `editor` solo si sigue sin accesos asignados (la comprobación
actual encontró cero). Crea 11 cuentas centrales, conserva los hashes bcrypt
actuales y asigna un acceso por cuenta. Salud Pública queda con jurisdicción 4,
Educación con jurisdicción 3 y Coordinación y Planificación queda preparado
para la jurisdicción 13; falta crear su cuenta cuando se defina el usuario y la
contraseña. En el primer login central, el servicio convierte el hash heredado
a su algoritmo actual. `jgazzo` queda como `analista-gastos`.

## Ejecución

Desde la raíz del repositorio, primero ejecutar la simulación:

```powershell
python ops/identidad/migrar-usuarios-copa.py
```

Debe informar un plan para 11 cuentas, credenciales, accesos, rangos faltantes y
vínculos de origen, verificar las 11 y revertir la transacción. La simulación no
escribe cambios persistentes.

Para aplicar una migración pendiente, usar:

```powershell
python ops/identidad/migrar-usuarios-copa.py --apply
```

El comando vuelve a simular, genera y valida un respaldo restringido del esquema
`identidad`, y recién entonces confirma la importación. No modifica ni elimina
`datos_tablero.public.usuarios_tableros`; esa tabla conserva las cuentas y
contraseñas anteriores para la convivencia o una vuelta atrás controlada.

La migración inicial de las 11 cuentas se aplicó el 10 de noviembre de 2026 y se
verificó con una segunda simulación sin cambios pendientes. El código debe
publicarse después de esa importación para que el login de Copa valide las
credenciales centrales. La verificación de despliegue omite JWT locales cuando
SSO está activo y conserva las comprobaciones de salud y disponibilidad del
login.

## Activación y vuelta atrás

La configuración actual requiere `COPA_SSO_MODE=production`,
`COPA_SSO_PRODUCTION_ENABLED=si`, el origen interno `http://127.0.0.1:39001` y
el origen público `https://appimi.corrientes.gob.ar`.

Para volver al login local, quitar la configuración `COPA_SSO_*` del proceso de
la API y reiniciarlo. La tabla local se conserva y permite validar el ingreso
anterior. No restaurar el respaldo completo del esquema si la base central ya
recibió otros cambios; desactivar los accesos de Copa importados desde la
administración central y conservar el respaldo para recuperación puntual.
