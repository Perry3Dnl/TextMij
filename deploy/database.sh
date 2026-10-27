#!/usr/bin/env bash
# Production MySQL bootstrap and additive migration. Never removes production volumes.
set -euo pipefail
app_dir="${1:?app directory required}"
release_dir="${2:?release directory required}"
[[ "$app_dir" == /opt/* && "$release_dir" == "$app_dir"/releases/* ]] || { echo 'Invalid database deployment path' >&2; exit 1; }
umask 077
secrets_dir="$app_dir/secrets"
backup_dir="$app_dir/backups"
install -d -m 0700 "$secrets_dir" "$backup_dir"
export TEXTMIJ_MYSQL_APP_PASSWORD_FILE="$secrets_dir/mysql_app_password"
export TEXTMIJ_MYSQL_ROOT_PASSWORD_FILE="$secrets_dir/mysql_root_password"
db=(docker compose -p textmij-db -f "$release_dir/deploy/mysql.compose.yml")

existing_volume=false
if docker volume inspect textmij_mysql_data >/dev/null 2>&1; then existing_volume=true; fi
for secret_file in "$TEXTMIJ_MYSQL_APP_PASSWORD_FILE" "$TEXTMIJ_MYSQL_ROOT_PASSWORD_FILE"; do
  if [ -L "$secret_file" ]; then echo 'Symlink secrets forbidden' >&2; exit 1; fi
  if [ ! -f "$secret_file" ]; then
    if [ "$existing_volume" = true ]; then
      echo 'Database volume exists but secret file is missing; refusing to rotate credentials' >&2
      exit 1
    fi
    tmp_file="$(mktemp "$secrets_dir/.new-secret.XXXXXXXX")"
    python3 -c 'import secrets; print(secrets.token_hex(32))' > "$tmp_file"
    mv -n "$tmp_file" "$secret_file"
    rm -f "$tmp_file"
  fi
  if [ "$secret_file" = "$TEXTMIJ_MYSQL_ROOT_PASSWORD_FILE" ]; then
    chmod 0600 "$secret_file"
  fi
done
# Only the unprivileged Node UID can read the app secret. Host directory stays 0700.
docker run --rm --user 0:0 --network none --cap-drop ALL --cap-add CHOWN --cap-add FOWNER --cap-add DAC_OVERRIDE \
  --security-opt no-new-privileges:true \
  --mount "type=bind,source=$secrets_dir,target=/private-secrets" \
  --entrypoint sh "$TEXTMIJ_IMAGE" -c \
  'chown 1000:1000 /private-secrets/mysql_app_password && chmod 0400 /private-secrets/mysql_app_password'


"${db[@]}" config --quiet
"${db[@]}" up -d --wait --wait-timeout 180
# The backend may not be joined to the shared reverse proxy Docker network.
[ "$(docker network inspect textmij_backend --format '{{.Internal}}')" = true ] \
  || { echo 'Database network must be internal' >&2; exit 1; }
db_container="$("${db[@]}" ps -q mysql)"
[ -n "$db_container" ] || { echo 'MySQL container missing' >&2; exit 1; }
docker inspect "$db_container" --format '{{json .NetworkSettings.Networks}}' \
  | python3 -c 'import json,sys; assert set(json.load(sys.stdin))=={"textmij_backend"}'
docker inspect "$db_container" --format '{{json .NetworkSettings.Ports}}' \
  | python3 -c 'import json,sys; assert all(v is None for v in json.load(sys.stdin).values())'

mysql_root() {
  # shellcheck disable=SC2016 # Expand password inside the MySQL container.
  "${db[@]}" exec -T mysql sh -c 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" exec mysql --batch --skip-column-names -uroot textmij'
}
migration_table="$(printf "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='textmij' AND table_name='schema_migrations';" | mysql_root)"
if [ "$migration_table" = 0 ]; then
  existing_tables="$(printf "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='textmij';" | mysql_root)"
  if [ "$existing_tables" != 0 ]; then
    echo 'Existing database without tracked migration history: manual review required' >&2
    exit 1
  fi
  printf 'CREATE TABLE schema_migrations (version INT NOT NULL PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6));' | mysql_root
fi

pending=false
for version in 001 002 003 004; do
  sql_file="$release_dir/deploy/sql/${version}_"
  # Precisely one matching version file must exist.
  matches=( "${sql_file}"*.sql )
  if [ "${#matches[@]}" -ne 1 ] || [ ! -f "${matches[0]}" ]; then
    echo "Migration $version missing" >&2
    exit 1
  fi
  checksum="$(sha256sum "${matches[0]}" | awk '{print $1}')"
  migration_id="$((10#$version))"
  recorded="$(printf 'SELECT checksum FROM schema_migrations WHERE version=%s;' "$migration_id" | mysql_root)"
  if [ -n "$recorded" ] && [ "$recorded" != "$checksum" ]; then
    echo "Migration $version checksum changed; refusing to continue" >&2
    exit 1
  fi
  if [ -z "$recorded" ]; then pending=true; fi
done

if [ "$pending" = true ] && [ "$existing_volume" = true ]; then
  snapshot="$backup_dir/pre-migration-$(date -u +%Y%m%dT%H%M%SZ)-$$.sql.gz"
  # shellcheck disable=SC2016 # Expand password inside the MySQL container.
  "${db[@]}" exec -T mysql sh -c 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" exec mysqldump -uroot --single-transaction --routines --events --hex-blob textmij' \
    | gzip -9 > "$snapshot"
  test -s "$snapshot"
  gzip -t "$snapshot"
  chmod 0600 "$snapshot"
  echo "Verified pre-migration SQL snapshot: $snapshot"
fi

for version in 001 002 003 004; do
  matches=( "$release_dir/deploy/sql/${version}_"*.sql )
  checksum="$(sha256sum "${matches[0]}" | awk '{print $1}')"
  migration_id="$((10#$version))"
  recorded="$(printf 'SELECT checksum FROM schema_migrations WHERE version=%s;' "$migration_id" | mysql_root)"
  if [ -z "$recorded" ]; then
    echo "Applying additive MySQL migration $version"
    mysql_root < "${matches[0]}"
    printf "INSERT INTO schema_migrations (version,checksum) VALUES (%s,'%s');" "$migration_id" "$checksum" | mysql_root
  fi
done
# Validate all tables expected by the authenticated messaging service.
printf 'SELECT id,kind,tier,credential_hash FROM accounts LIMIT 0; SELECT payload_hash FROM encrypted_messages LIMIT 0; SELECT last_dispatch FROM dispatch_clock LIMIT 0;' | mysql_root >/dev/null
echo 'TextMij private MySQL network, durable volume, and schema verified'
