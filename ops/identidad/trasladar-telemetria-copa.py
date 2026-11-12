#!/usr/bin/env python3
"""Copia eventos SSO de Copa a su tabla de uso, sin borrarlos del origen.

Por defecto simula con ROLLBACK. --apply crea primero un respaldo de la tabla
destino y confirma una inserción idempotente por auditoria_central_id.
"""

import argparse
import csv
import io
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = next(p for p in Path(__file__).resolve().parents if (p / 'servidores/config/servers.json').exists())


def query(ssh, database, sql):
    command = 'sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -At -d ' + shlex.quote(database)
    stdin, stdout, stderr = ssh.exec_command(command, timeout=90)
    stdin.write(sql)
    stdin.channel.shutdown_write()
    result = stdout.read().decode()
    error = stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(f'Falló {database}: {error[:400]}')
    return result


def backup(ssh):
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    path = f'/var/backups/imi-identidad/copa-telemetria-pretraslado-{stamp}.dump'
    command = 'sudo -n -u postgres sh -c ' + shlex.quote(
        'umask 077; test ! -e ' + shlex.quote(path) +
        ' && pg_dump -Fc --no-owner --no-acl -t public.coparticipacion_registros -d datos_tablero -f ' + shlex.quote(path) +
        ' && pg_restore --list ' + shlex.quote(path) + ' >/dev/null'
    )
    _, stdout, stderr = ssh.exec_command(command, timeout=120)
    stdout.read()
    error = stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError('No se verificó el respaldo: ' + error[:400])
    print('Respaldo verificado en el servidor:', path)


def make_sql(events, apply):
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator='\n')
    for event in events:
        writer.writerow((event['id'], event['usuario'], event['fecha'], event['seccion'], event['accion']))
    return """BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE _copa_sso_import (
  audit_id bigint PRIMARY KEY, usuario text NOT NULL, fecha text NOT NULL,
  seccion text NOT NULL, accion text NOT NULL
) ON COMMIT DROP;
COPY _copa_sso_import FROM STDIN WITH (FORMAT csv);
""" + buffer.getvalue() + "\\.\n" + """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _copa_sso_import WHERE btrim(usuario)='' OR btrim(seccion)='' OR btrim(accion)='')
  THEN RAISE EXCEPTION 'Evento de Copa incompleto'; END IF;
  IF EXISTS (
    SELECT 1 FROM _copa_sso_import i JOIN public.coparticipacion_registros r ON r.auditoria_central_id=i.audit_id
    WHERE r.usuario<>i.usuario OR r.fecha_hora<>i.fecha::timestamp OR r.seccion_tablero<>i.seccion OR r.accion<>i.accion
  ) THEN RAISE EXCEPTION 'Un evento importado difiere del origen'; END IF;
END $$;
INSERT INTO public.coparticipacion_registros
  (id_usuario,usuario,fecha_hora,seccion_tablero,accion,detalle_interaccion,ip_cliente,auditoria_central_id)
SELECT NULL,usuario,fecha::timestamp,seccion,accion,NULL,NULL,audit_id
FROM _copa_sso_import
ON CONFLICT (auditoria_central_id) WHERE auditoria_central_id IS NOT NULL DO NOTHING;
SELECT 'fuente',count(*) FROM _copa_sso_import;
SELECT 'destino',count(*) FROM _copa_sso_import i
JOIN public.coparticipacion_registros r ON r.auditoria_central_id=i.audit_id;
DO $$
BEGIN
  IF (SELECT count(*) FROM _copa_sso_import) <>
     (SELECT count(*) FROM _copa_sso_import i
      JOIN public.coparticipacion_registros r ON r.auditoria_central_id=i.audit_id)
  THEN RAISE EXCEPTION 'Faltan eventos importados de Copa'; END IF;
END $$;
""" + ('COMMIT;\n' if apply else 'ROLLBACK;\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    config = json.loads((ROOT / 'servidores/config/servers.json').read_text())['donweb'][0]
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(config['ip'], port=int(config['port']), username=config['user'], password=config['password'], timeout=20)
    try:
        source_sql = """SELECT COALESCE(json_agg(json_build_object(
          'id',a.id,'usuario',u.usuario,
          'fecha',to_char(a.creado_en AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD HH24:MI:SS.US'),
          'seccion',a.seccion,'accion',a.accion) ORDER BY a.id),'[]'::json)::text
          FROM identidad.sso_auditoria_tableros a
          JOIN identidad.usuarios u ON u.id=a.usuario_id
          JOIN identidad.tableros t ON t.id=a.tablero_id WHERE t.codigo='copa';"""
        events = json.loads(query(ssh, 'imi_identidad', source_sql))
        if args.apply:
            backup(ssh)
        output = query(ssh, 'datos_tablero', make_sql(events, args.apply))
        if f'fuente|{len(events)}' not in output or f'destino|{len(events)}' not in output:
            raise RuntimeError('Los recuentos del origen y destino no coinciden')
        print(len(events), 'eventos de Copa', 'copiados' if args.apply else 'simulados y revertidos')
    finally:
        ssh.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('Error:', exc, file=sys.stderr)
        raise SystemExit(1)
