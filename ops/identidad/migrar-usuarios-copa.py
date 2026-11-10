#!/usr/bin/env python3
"""Importa las cuentas actuales de Copa a identidad central.

Por defecto hace una simulación transaccional y termina con ROLLBACK. La opción
--apply crea primero un respaldo restringido de identidad y luego confirma el
mismo plan. No modifica datos_tablero.public.usuarios_tableros.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import shlex
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[2]
SERVERS_CONFIG = ROOT.parents[1] / "servidores" / "config" / "servers.json"
SOURCE_DB = "datos_tablero"
TARGET_DB = "imi_identidad"
EXPECTED_USERS = {
    "gcorrales", "hgrachot", "jpvaldes", "dinsaurralde", "fgonzalez",
    "admin", "jgazzo", "cvignolo", "abrunel", "ministerio_salud",
    "ministerio_educacion",
}
EXPECTED_SCOPES = {"ministerio_salud": [4], "ministerio_educacion": [3]}
GASTOS_ANALYSTS = {"gcorrales", "hgrachot", "dinsaurralde", "fgonzalez", "jgazzo"}
GENERAL_READERS = {"jpvaldes", "cvignolo", "abrunel"}
BCRYPT = re.compile(r"^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$")

SOURCE_SQL = r"""
SELECT COALESCE(json_agg(json_build_object(
  'id', id_usuario,
  'usuario', username,
  'activo', activo,
  'tablero', tablero_acceso,
  'password_hash', password_hash,
  'jurisdicciones', gastos_jurisdicciones
) ORDER BY id_usuario), '[]'::json)::text
FROM public.usuarios_tableros
"""

TARGET_SQL = r"""
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtext('imi-copa-central-import-v1'));
CREATE TEMP TABLE _copa_import (
  id_origen bigint PRIMARY KEY,
  usuario text NOT NULL,
  password_hash text NOT NULL,
  rango text NOT NULL,
  jurisdicciones text NOT NULL,
  activo boolean NOT NULL
) ON COMMIT DROP;
\copy _copa_import FROM '__IMPORT_CSV__' WITH (FORMAT csv, HEADER true)

DO $validar$
BEGIN
  IF (SELECT count(*) FROM _copa_import) <> 11 THEN
    RAISE EXCEPTION 'copa_import_unexpected_count';
  END IF;
  IF EXISTS (SELECT 1 FROM _copa_import GROUP BY lower(btrim(usuario)) HAVING count(*) <> 1) THEN
    RAISE EXCEPTION 'copa_import_duplicate_username';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _copa_import
    WHERE NOT (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$')
       OR rango NOT IN ('admin','lector','analista-gastos','ministerio')
       OR NOT activo
       OR NOT (
         (usuario='admin' AND rango='admin' AND jurisdicciones='-') OR
         (usuario IN ('gcorrales','hgrachot','dinsaurralde','fgonzalez','jgazzo') AND rango='analista-gastos' AND jurisdicciones='-') OR
         (usuario IN ('jpvaldes','cvignolo','abrunel') AND rango='lector' AND jurisdicciones='-') OR
         (usuario='ministerio_salud' AND rango='ministerio' AND jurisdicciones='4') OR
         (usuario='ministerio_educacion' AND rango='ministerio' AND jurisdicciones='3')
       )
  ) THEN
    RAISE EXCEPTION 'copa_import_validation_failed';
  END IF;
END
$validar$;

DO $conflictos$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM identidad.tableros WHERE codigo='copa' AND activo AND modalidad='restringido') THEN
    RAISE EXCEPTION 'copa_board_missing_or_inactive';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _copa_import i
    JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
    LEFT JOIN identidad.identidades_origen src
      ON src.usuario_id=u.id AND src.sistema='copa' AND src.entidad='usuarios_tableros' AND src.id_origen=i.id_origen::text
    WHERE src.id IS NULL
  ) THEN RAISE EXCEPTION 'copa_central_username_conflict'; END IF;
  IF EXISTS (
    SELECT 1 FROM _copa_import i
    JOIN identidad.identidades_origen src
      ON src.sistema='copa' AND src.entidad='usuarios_tableros' AND src.id_origen=i.id_origen::text
    JOIN identidad.usuarios u ON u.id=src.usuario_id
    WHERE lower(btrim(u.usuario))<>lower(btrim(i.usuario))
  ) THEN RAISE EXCEPTION 'copa_origin_link_conflict'; END IF;
  IF EXISTS (
    SELECT 1 FROM _copa_import i
    JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
    JOIN identidad.accesos a ON a.usuario_id=u.id
    JOIN identidad.tableros t ON t.id=a.tablero_id AND t.codigo='copa'
    JOIN identidad.rangos r ON r.id=a.rango_id
    WHERE r.codigo<>i.rango OR NOT a.activo OR NOT u.activo OR u.es_admin_global
  ) THEN RAISE EXCEPTION 'copa_existing_access_conflict'; END IF;
  IF EXISTS (
    SELECT 1 FROM _copa_import i
    JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
    JOIN identidad.accesos a ON a.usuario_id=u.id
    JOIN identidad.tableros t ON t.id=a.tablero_id AND t.codigo='copa'
    JOIN identidad.alcances s ON s.acceso_id=a.id
    WHERE i.jurisdicciones='-'
       OR s.tipo<>'jurisdiccion'
       OR s.valor<>ALL(string_to_array(i.jurisdicciones, ','))
  ) OR EXISTS (
    SELECT 1 FROM _copa_import i
    JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
    JOIN identidad.accesos a ON a.usuario_id=u.id
    JOIN identidad.tableros t ON t.id=a.tablero_id AND t.codigo='copa'
    CROSS JOIN LATERAL unnest(string_to_array(NULLIF(i.jurisdicciones, '-'), ',')) expected(valor)
    WHERE NOT EXISTS (
      SELECT 1 FROM identidad.alcances s
      WHERE s.acceso_id=a.id AND s.tipo='jurisdiccion' AND s.valor=expected.valor
    )
  ) THEN RAISE EXCEPTION 'copa_existing_scope_conflict'; END IF;
  IF EXISTS (
    SELECT 1 FROM identidad.rangos r
    JOIN identidad.tableros t ON t.id=r.tablero_id AND t.codigo='copa'
    JOIN identidad.accesos a ON a.rango_id=r.id
    WHERE r.codigo='editor'
  ) THEN RAISE EXCEPTION 'copa_legacy_editor_range_in_use'; END IF;
  IF EXISTS (
    SELECT 1 FROM _copa_import i
    JOIN identidad.identidades_origen src
      ON src.sistema='copa' AND src.entidad='usuarios_tableros' AND src.id_origen=i.id_origen::text
    JOIN identidad.usuarios u ON u.id=src.usuario_id
    LEFT JOIN identidad.credenciales c ON c.usuario_id=u.id
    WHERE c.usuario_id IS NOT NULL AND c.algoritmo NOT IN ('bcrypt-legacy','scrypt-n131072-r8-p1')
  ) THEN RAISE EXCEPTION 'copa_existing_credential_conflict'; END IF;
END
$conflictos$;

CREATE TEMP TABLE _copa_plan ON COMMIT DROP AS
SELECT
  count(*) FILTER (WHERE u.id IS NULL)::int usuarios_nuevos,
  count(*) FILTER (WHERE c.usuario_id IS NULL)::int credenciales_nuevas,
  count(*) FILTER (WHERE a.id IS NULL)::int accesos_nuevos,
  count(*) FILTER (WHERE src.id IS NULL)::int vinculos_nuevos,
  (SELECT count(*)::int FROM (VALUES
    ('lector'),('analista-gastos'),('ministerio')
  ) expected(codigo) CROSS JOIN identidad.tableros t
  LEFT JOIN identidad.rangos r ON r.tablero_id=t.id AND r.codigo=expected.codigo
  WHERE t.codigo='copa' AND r.id IS NULL) AS rangos_nuevos
FROM _copa_import i
LEFT JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
LEFT JOIN identidad.credenciales c ON c.usuario_id=u.id
LEFT JOIN identidad.tableros t ON t.codigo='copa'
LEFT JOIN identidad.accesos a ON a.usuario_id=u.id AND a.tablero_id=t.id
LEFT JOIN identidad.identidades_origen src ON src.sistema='copa' AND src.entidad='usuarios_tableros' AND src.id_origen=i.id_origen::text;

INSERT INTO identidad.rangos(tablero_id,codigo,descripcion)
SELECT t.id,r.codigo,r.descripcion
FROM identidad.tableros t
CROSS JOIN (VALUES
  ('admin','Administrador del tablero'),
  ('lector','Lectura general del tablero'),
  ('analista-gastos','Consulta de gastos desagregados y sus hojas disponibles'),
  ('ministerio','Consulta de Inicio provincial y gastos limitados a las jurisdicciones asignadas')
) AS r(codigo,descripcion)
WHERE t.codigo='copa'
ON CONFLICT (tablero_id,codigo) DO NOTHING;

DELETE FROM identidad.rangos r
USING identidad.tableros t
WHERE t.id=r.tablero_id AND t.codigo='copa' AND r.codigo='editor'
  AND NOT EXISTS (SELECT 1 FROM identidad.accesos a WHERE a.rango_id=r.id);

INSERT INTO identidad.usuarios(usuario,activo,es_admin_global)
SELECT lower(btrim(i.usuario)),true,false
FROM _copa_import i
WHERE NOT EXISTS (SELECT 1 FROM identidad.usuarios u WHERE lower(btrim(u.usuario))=lower(btrim(i.usuario)));

INSERT INTO identidad.credenciales(usuario_id,password_hash,algoritmo)
SELECT u.id,i.password_hash,'bcrypt-legacy'
FROM _copa_import i JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
LEFT JOIN identidad.credenciales c ON c.usuario_id=u.id
WHERE c.usuario_id IS NULL;

INSERT INTO identidad.accesos(usuario_id,tablero_id,rango_id,activo)
SELECT u.id,t.id,r.id,true
FROM _copa_import i
JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
JOIN identidad.tableros t ON t.codigo='copa'
JOIN identidad.rangos r ON r.tablero_id=t.id AND r.codigo=i.rango
WHERE NOT EXISTS (SELECT 1 FROM identidad.accesos a WHERE a.usuario_id=u.id AND a.tablero_id=t.id);

INSERT INTO identidad.alcances(acceso_id,tipo,valor)
SELECT a.id,'jurisdiccion',expected.valor
FROM _copa_import i
JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
JOIN identidad.tableros t ON t.codigo='copa'
JOIN identidad.accesos a ON a.usuario_id=u.id AND a.tablero_id=t.id
CROSS JOIN LATERAL unnest(string_to_array(NULLIF(i.jurisdicciones, '-'), ',')) expected(valor)
ON CONFLICT (acceso_id,tipo,valor) DO NOTHING;

GRANT SELECT ON TABLE identidad.alcances TO imi_sso_production_login;

INSERT INTO identidad.identidades_origen(usuario_id,sistema,entidad,id_origen)
SELECT u.id,'copa','usuarios_tableros',i.id_origen::text
FROM _copa_import i JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
ON CONFLICT (sistema,entidad,id_origen) DO NOTHING;

DO $verificar$
BEGIN
  IF EXISTS (
    SELECT 1 FROM _copa_import i
    LEFT JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
    LEFT JOIN identidad.credenciales c ON c.usuario_id=u.id
    LEFT JOIN identidad.accesos a ON a.usuario_id=u.id
    LEFT JOIN identidad.tableros t ON t.id=a.tablero_id AND t.codigo='copa'
    LEFT JOIN identidad.rangos r ON r.id=a.rango_id
    LEFT JOIN identidad.identidades_origen src ON src.usuario_id=u.id AND src.sistema='copa' AND src.entidad='usuarios_tableros' AND src.id_origen=i.id_origen::text
    WHERE NOT COALESCE(u.activo,false) OR COALESCE(u.es_admin_global,true)
       OR c.usuario_id IS NULL OR a.id IS NULL OR NOT a.activo OR r.codigo<>i.rango OR src.id IS NULL
  ) THEN RAISE EXCEPTION 'copa_import_postcheck_failed'; END IF;
  IF EXISTS (
    SELECT 1 FROM _copa_import i
    JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
    JOIN identidad.accesos a ON a.usuario_id=u.id
    JOIN identidad.tableros t ON t.id=a.tablero_id AND t.codigo='copa'
    JOIN identidad.alcances s ON s.acceso_id=a.id
    WHERE i.jurisdicciones='-'
       OR s.tipo<>'jurisdiccion'
       OR s.valor<>ALL(string_to_array(i.jurisdicciones, ','))
  ) OR EXISTS (
    SELECT 1 FROM _copa_import i
    JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
    JOIN identidad.accesos a ON a.usuario_id=u.id
    JOIN identidad.tableros t ON t.id=a.tablero_id AND t.codigo='copa'
    CROSS JOIN LATERAL unnest(string_to_array(NULLIF(i.jurisdicciones, '-'), ',')) expected(valor)
    WHERE NOT EXISTS (
      SELECT 1 FROM identidad.alcances s
      WHERE s.acceso_id=a.id AND s.tipo='jurisdiccion' AND s.valor=expected.valor
    )
  ) THEN RAISE EXCEPTION 'copa_import_scope_mismatch'; END IF;
END
$verificar$;

SELECT 'plan|'||usuarios_nuevos||'|'||credenciales_nuevas||'|'||accesos_nuevos||'|'||rangos_nuevos||'|'||vinculos_nuevos FROM _copa_plan;
SELECT 'verified|'||count(*) FROM _copa_import i
JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario)) AND u.activo
JOIN identidad.credenciales c ON c.usuario_id=u.id
JOIN identidad.accesos a ON a.usuario_id=u.id AND a.activo
JOIN identidad.tableros t ON t.id=a.tablero_id AND t.codigo='copa'
JOIN identidad.rangos r ON r.id=a.rango_id AND r.codigo=i.rango
JOIN identidad.identidades_origen src ON src.usuario_id=u.id AND src.sistema='copa' AND src.entidad='usuarios_tableros' AND src.id_origen=i.id_origen::text;
__TRANSACTION_END__
"""


def connection():
    config = json.loads(SERVERS_CONFIG.read_text(encoding="utf-8"))
    server = next(x for x in config["donweb"] if x["ip"] == "149.50.145.182")
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(
        hostname=server["ip"], port=int(server["port"]), username=server["user"],
        password=server["password"], timeout=15, look_for_keys=False, allow_agent=False,
    )
    return client


def remote_output(ssh: paramiko.SSHClient, command: str, timeout: int = 60) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    result = stdout.read().decode("utf-8", errors="replace")
    errors = stderr.read().decode("utf-8", errors="replace")
    status = stdout.channel.recv_exit_status()
    if status:
        diagnostic = next((line for line in errors.splitlines() if re.search(r"error:|fatal:|permission denied|not permitted", line, re.I)), "")
        diagnostic = re.sub(r"^.*?(?:error:|fatal:)", "", diagnostic, flags=re.I).strip()
        diagnostic = re.sub(r"\$2[aby]\$[^\s,;\"]+", "[hash-redacted]", diagnostic)
        raise RuntimeError(f"remote_command_failed:{status}:{diagnostic[:180]}")
    return result.strip()


def read_source(ssh: paramiko.SSHClient) -> list[dict]:
    command = "sudo -n -u postgres psql -X -A -t -v ON_ERROR_STOP=1 -d " + SOURCE_DB + " -c " + shlex.quote(SOURCE_SQL)
    raw = remote_output(ssh, command)
    rows = json.loads(raw)
    usernames = [str(row.get("usuario", "")).strip().lower() for row in rows]
    if len(rows) != 11 or set(usernames) != EXPECTED_USERS or len(set(usernames)) != len(usernames):
        raise RuntimeError("source_user_inventory_mismatch")
    normalized = []
    for row in rows:
        username = str(row["usuario"]).strip().lower()
        scopes = row.get("jurisdicciones")
        if not row.get("activo") or row.get("tablero") != "coparticipacion":
            raise RuntimeError("source_user_disabled_or_wrong_board")
        password_hash = str(row.get("password_hash") or "")
        if not BCRYPT.fullmatch(password_hash):
            raise RuntimeError("source_password_hash_format_mismatch")
        expected_scopes = EXPECTED_SCOPES.get(username)
        actual_scopes = None if scopes is None else sorted(int(value) for value in scopes)
        if username in EXPECTED_SCOPES:
            if actual_scopes != EXPECTED_SCOPES[username]:
                raise RuntimeError("institution_scope_requires_review")
            range_code = "ministerio"
        else:
            if actual_scopes is not None:
                raise RuntimeError("unexpected_user_scope_requires_review")
            range_code = "admin" if username == "admin" else "analista-gastos" if username in GASTOS_ANALYSTS else "lector" if username in GENERAL_READERS else None
            if range_code is None:
                raise RuntimeError("source_user_role_requires_review")
        normalized.append({
            "id": int(row["id"]), "usuario": username, "password_hash": password_hash,
            "rango": range_code,
            "jurisdicciones": "-" if actual_scopes is None else ",".join(str(value) for value in actual_scopes),
            "activo": bool(row["activo"]),
        })
    return normalized


def csv_text(rows: list[dict]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["id_origen", "usuario", "password_hash", "rango", "jurisdicciones", "activo"])
    for row in rows:
        writer.writerow([row["id"], row["usuario"], row["password_hash"], row["rango"], row["jurisdicciones"], row["activo"]])
    return output.getvalue()


def apply_sql(ssh: paramiko.SSHClient, rows: list[dict], apply: bool) -> str:
    temp = "/var/tmp/imi-copa-import-" + uuid.uuid4().hex
    csv_path = temp + ".csv"
    sql_path = temp + ".sql"
    sftp = ssh.open_sftp()
    try:
        with sftp.file(csv_path, "w") as handle:
            handle.write(csv_text(rows))
        sftp.chmod(csv_path, 0o600)
        sql = TARGET_SQL.replace("__IMPORT_CSV__", csv_path).replace("__TRANSACTION_END__", "COMMIT;" if apply else "ROLLBACK;")
        with sftp.file(sql_path, "w") as handle:
            handle.write(sql)
        sftp.chmod(sql_path, 0o600)
        remote_output(ssh, "sudo -n chown postgres:postgres " + shlex.quote(csv_path) + " " + shlex.quote(sql_path), 10)
        command = "sudo -n -u postgres psql -X -A -t -v ON_ERROR_STOP=1 -d " + TARGET_DB + " -f " + shlex.quote(sql_path)
        return remote_output(ssh, command, 120)
    finally:
        sftp.close()
        remote_output(ssh, "sudo -n rm -f " + shlex.quote(csv_path) + " " + shlex.quote(sql_path), 10)


def create_backup(ssh: paramiko.SSHClient) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    folder = "/var/backups/imi/identidad/copa-migracion-" + stamp
    backup = folder + "/imi_identidad.dump"
    temporary = "/var/tmp/imi-identidad-copa-" + uuid.uuid4().hex + ".dump"
    remote_output(ssh, "sudo -n install -d -o postgres -g postgres -m 700 " + shlex.quote(folder), 15)
    dump = "umask 077; pg_dump -Fc --no-owner --no-acl --schema=identidad -d imi_identidad -f " + shlex.quote(temporary)
    try:
        remote_output(ssh, "sudo -n -u postgres sh -c " + shlex.quote(dump), 120)
        remote_output(
            ssh,
            "sudo -n install -o postgres -g postgres -m 600 " + shlex.quote(temporary) + " " + shlex.quote(backup)
            + " && sudo -n pg_restore --list " + shlex.quote(backup) + " >/dev/null",
            30,
        )
    finally:
        remote_output(ssh, "sudo -n rm -f " + shlex.quote(temporary), 10)
    return backup


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Crea respaldo y confirma el alta central")
    args = parser.parse_args()
    phase = "conectar"
    ssh = connection()
    try:
        phase = "leer-cuentas-copa"
        rows = read_source(ssh)
        phase = "simular-importacion-central"
        result = apply_sql(ssh, rows, False)
        plans = [line for line in result.splitlines() if line.startswith("plan|")]
        verified = [line for line in result.splitlines() if line.startswith("verified|")]
        if len(plans) != 1 or verified != ["verified|11"]:
            raise RuntimeError("target_migration_validation_failed")
        if args.apply:
            phase = "respaldar-identidad-central"
            backup = create_backup(ssh)
            # Respalda antes de escribir. La simulación y el apply comparten el mismo plan.
            phase = "aplicar-importacion-central"
            result = apply_sql(ssh, rows, True)
            plans = [line for line in result.splitlines() if line.startswith("plan|")]
            verified = [line for line in result.splitlines() if line.startswith("verified|")]
            if len(plans) != 1 or verified != ["verified|11"]:
                raise RuntimeError("target_migration_validation_failed_after_commit")
            print("Copa importada a identidad central. Respaldo:", backup)
        else:
            print("Simulación correcta; transacción revertida. No se modificó ninguna base.")
        print("Usuarios, credenciales bcrypt, rangos, accesos y trazabilidad verificados:", verified[0].split("|")[1])
        print("Plan (usuarios nuevos, credenciales, accesos, rangos, vínculos):", plans[0].split("|", 1)[1])
        return 0
    except Exception as error:
        raise RuntimeError(f"{phase}:{error}") from None
    finally:
        ssh.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        message = str(error)
        # Nunca imprimir consultas, hashes ni credenciales al fallar.
        print("Migración detenida:", message[:250], file=sys.stderr)
        raise SystemExit(1)
