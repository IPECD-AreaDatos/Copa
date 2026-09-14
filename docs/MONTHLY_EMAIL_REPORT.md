# Informe mensual por correo

El API puede generar y enviar automáticamente el informe ejecutivo del último
mes calendario cerrado. La ejecución consulta la misma respuesta que utiliza el
monitor mensual y solo continúa cuando RON, ROP y masa salarial figuran como
completos.

## Variables de entorno

```dotenv
MONTHLY_REPORT_JOB_SECRET=<secreto-aleatorio>
MONTHLY_REPORT_RECIPIENTS=matizalazar2001@gmail.com,ivanfedericorodriguez@gmail.com
MONTHLY_REPORT_STATE_FILE=/home/ubuntu/ipecd-infra/state/copa-monthly-email.json
REPORT_TIMEZONE=America/Argentina/Buenos_Aires
GMAIL_USER=imi.areadatos@gmail.com
GMAIL_APP_PASSWORD=<contraseña-de-aplicación-de-Google>
```

`GMAIL_APP_PASSWORD` debe ser una contraseña de aplicación exclusiva, nunca la
contraseña normal de la cuenta. El archivo `.env` no se versiona.

## Ejecución

Desde `apps/api`:

```bash
npm run report:preview
npm run report:send
```

La vista previa no envía correos. El envío registra cada destinatario confirmado
en el archivo de estado y no vuelve a enviarle el mismo período.

En producción se programa a las 20:30 (hora argentina) de martes a viernes. La
actualización habitual ocurre el martes; los días adicionales permiten reintentar
si alguna fuente todavía no estaba completa, sin producir duplicados.

Las unidades listas para instalar están en `deploy/systemd`. Antes de habilitar
el temporizador se debe ejecutar manualmente `report:send` y comprobar la recepción
en ambos destinatarios.
