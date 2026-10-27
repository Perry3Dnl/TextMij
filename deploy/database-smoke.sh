#!/usr/bin/env bash
# Exercise EXACT production database bootstrap on an ephemeral GitHub-hosted runner.
# Never run on a shared server. Only disposable CI-owned paths/volumes are removed.
set -euo pipefail
: "${GITHUB_ACTIONS:?Must run in GitHub Actions}"
: "${GITHUB_RUN_ID:?Must run in GitHub Actions}"
: "${GITHUB_SHA:?Revision required}"
base="/opt/textmij-ci-$GITHUB_RUN_ID"
release="$base/releases/$GITHUB_SHA-$GITHUB_RUN_ID-1"
[ ! -e "$base" ] || { echo 'CI test root already exists; refusing to touch it' >&2; exit 1; }
docker volume inspect textmij_mysql_data >/dev/null 2>&1 && { echo 'MySQL volume already exists; refusing to use it' >&2; exit 1; }
docker network inspect textmij_backend >/dev/null 2>&1 && { echo 'MySQL network already exists; refusing to use it' >&2; exit 1; }
sudo install -d -o "$(id -u)" -g "$(id -g)" -m 0700 "$base"
mkdir -p "$release"
cp -a deploy "$release/deploy"
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker compose -p textmij-db -f "$release/deploy/mysql.compose.yml" logs --no-color --tail 80 mysql >&2 || true
  fi
  if [ -d "$release/deploy" ]; then
    export TEXTMIJ_MYSQL_APP_PASSWORD_FILE="$base/secrets/mysql_app_password"
    export TEXTMIJ_MYSQL_ROOT_PASSWORD_FILE="$base/secrets/mysql_root_password"
    docker compose -p textmij-db -f "$release/deploy/mysql.compose.yml" down --remove-orphans --volumes >/dev/null 2>&1 || true
  fi
  sudo rm -rf -- "$base"
  exit "$status"
}
trap cleanup EXIT
export TEXTMIJ_IMAGE="textmij:$GITHUB_SHA"
bash "$release/deploy/database.sh" "$base" "$release"
secret_mode="$(stat -c '%u:%a' "$base/secrets/mysql_app_password")"
[ "$secret_mode" = '1000:400' ] || { echo "API secret not isolated to Node UID" >&2; exit 1; }
mysql_root() {
  docker compose -p textmij-db -f "$release/deploy/mysql.compose.yml" exec -T mysql sh -c \
    'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" exec mysql --batch --skip-column-names -uroot textmij'
}
# Persist a harmless synthetic account across a second bootstrap. No production data.
printf "INSERT INTO accounts (id,kind,public_code,display_name,public_key,credential_hash) VALUES (REPEAT('a',64),'personal','0000-AAA-AAA','CI synthetic','invalid-test-key',UNHEX(REPEAT('01',32)));" | mysql_root
bash "$release/deploy/database.sh" "$base" "$release"
count="$(printf "SELECT COUNT(*) FROM accounts WHERE public_code='0000-AAA-AAA';" | mysql_root)"
[ "$count" = 1 ] || { echo 'Repeated bootstrap lost synthetic data' >&2; exit 1; }
migrated="$(printf 'SELECT COUNT(*) FROM schema_migrations;' | mysql_root)"
[ "$migrated" = 4 ] || { echo 'Migration tracking failed' >&2; exit 1; }
echo 'Production MySQL bootstrap, secrets, migrations, persistence and repeatability passed'
