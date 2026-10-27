#!/usr/bin/env bash
# Runner-side upload. Credentials are never passed on the SSH command line.
set -euo pipefail
bundle_dir="${1:?artifact directory required}"
: "${DEPLOY_HOST:?Missing DEPLOY_HOST secret}"
: "${DEPLOY_USER:?Missing DEPLOY_USER secret}"
: "${DEPLOY_PASSWORD:?Missing DEPLOY_PASSWORD secret}"
: "${DEPLOY_HOST_KEY_FINGERPRINT:?Missing DEPLOY_HOST_KEY_FINGERPRINT variable}"
: "${TEXTMIJ_DOMAIN:?Missing TEXTMIJ_DOMAIN variable}"
: "${GITHUB_SHA:?Missing revision}"
: "${GITHUB_RUN_ID:?Missing workflow run ID}"
: "${GITHUB_RUN_ATTEMPT:?Missing workflow run attempt}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_APP_DIR="${DEPLOY_APP_DIR:-/opt/textmij}"
SHARED_PROXY_NETWORK="${SHARED_PROXY_NETWORK:-dummy-stock-simulator_default}"
SHARED_CADDY_CONTAINER="${SHARED_CADDY_CONTAINER:-dummy-stock-caddy}"
SHARED_CADDYFILE="${SHARED_CADDYFILE:-/opt/dummy-stock-simulator/deploy/Caddyfile}"

[[ "$DEPLOY_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.:-]*$ ]] || { echo 'Invalid deployment host' >&2; exit 1; }
[[ "$DEPLOY_USER" =~ ^[A-Za-z_][A-Za-z0-9._-]*$ ]] || { echo 'Invalid deployment user' >&2; exit 1; }
if ! [[ "$DEPLOY_PORT" =~ ^[0-9]{1,5}$ ]] || ((10#$DEPLOY_PORT < 1 || 10#$DEPLOY_PORT > 65535)); then
  echo 'Invalid SSH port' >&2
  exit 1
fi
[[ "$DEPLOY_APP_DIR" =~ ^/opt/[A-Za-z0-9_-][A-Za-z0-9_/-]*$ && "$DEPLOY_APP_DIR" != *//* ]] \
  || { echo 'Application directory must be a safe path below /opt' >&2; exit 1; }
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ && "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]] \
  || { echo 'Invalid release identifier' >&2; exit 1; }
[[ "$SHARED_PROXY_NETWORK" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ && "$SHARED_CADDY_CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] \
  || { echo 'Invalid shared proxy configuration' >&2; exit 1; }
[[ "$SHARED_CADDYFILE" =~ ^/opt/[A-Za-z0-9_./-]+$ && "$SHARED_CADDYFILE" != *..* && "$SHARED_CADDYFILE" != *//* ]] \
  || { echo 'Invalid shared Caddyfile path' >&2; exit 1; }
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
python3 -c 'import sys; sys.path.insert(0,sys.argv[1]); import caddy; caddy.render(sys.argv[2], "textmij-api-validation")' \
  "$script_dir" "$TEXTMIJ_DOMAIN"
test -s "$bundle_dir/image.tar.gz"
test -s "$bundle_dir/source.tar.gz"

umask 077
ssh_dir="$(mktemp -d)"
trap 'rm -rf -- "$ssh_dir"' EXIT
printf '%s\n' "$DEPLOY_PASSWORD" >"$ssh_dir/password"
python3 -c 'import secrets; print(secrets.token_hex(32))' >"$ssh_dir/benchmark-token"
ssh-keyscan -T 15 -p "$DEPLOY_PORT" -t ed25519 "$DEPLOY_HOST" >"$ssh_dir/known_hosts" 2>/dev/null
actual="$(ssh-keygen -lf "$ssh_dir/known_hosts" -E sha256 | awk 'NR == 1 {print $2}')"
[ "$actual" = "$DEPLOY_HOST_KEY_FINGERPRINT" ] \
  || { echo 'SSH host fingerprint does not match the pinned server' >&2; exit 1; }

ssh_options=(-o BatchMode=no -o PubkeyAuthentication=no -o 'PreferredAuthentications=password,keyboard-interactive'
  -o NumberOfPasswordPrompts=1 -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o ConnectTimeout=15)
remote="$DEPLOY_USER@$DEPLOY_HOST"
release_id="$GITHUB_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
incoming="$DEPLOY_APP_DIR/incoming/$release_id"
printf -v quoted_incoming '%q' "$incoming"
sshpass -f "$ssh_dir/password" ssh "${ssh_options[@]}" -p "$DEPLOY_PORT" "$remote" \
  "install -d -m 0750 $quoted_incoming"
sshpass -f "$ssh_dir/password" scp "${ssh_options[@]}" -P "$DEPLOY_PORT" \
  "$bundle_dir/image.tar.gz" "$bundle_dir/source.tar.gz" "$ssh_dir/benchmark-token" "$remote:$incoming/"

printf -v remote_arguments '%q ' "$DEPLOY_APP_DIR" "$GITHUB_SHA" "$release_id" "$TEXTMIJ_DOMAIN" \
  "$SHARED_PROXY_NETWORK" "$SHARED_CADDY_CONTAINER" "$SHARED_CADDYFILE"
sshpass -f "$ssh_dir/password" ssh "${ssh_options[@]}" -p "$DEPLOY_PORT" "$remote" \
  "bash -s -- $remote_arguments" <<'REMOTE'
set -euo pipefail
app_dir="$1"
revision="$2"
release_id="$3"
domain="$4"
export SHARED_PROXY_NETWORK="$5" SHARED_CADDY_CONTAINER="$6" SHARED_CADDYFILE="$7"
incoming="$app_dir/incoming/$release_id"
release_dir="$app_dir/releases/$release_id"
for executable in docker python3 flock curl; do command -v "$executable" >/dev/null; done
docker compose version >/dev/null
exec 8>"$app_dir/.deploy.lock"
flock -w 600 8
[ ! -e "$release_dir" ] || { echo 'Release directory already exists' >&2; exit 1; }
install -d -m 0750 "$release_dir"
tar -xzf "$incoming/source.tar.gz" -C "$release_dir" --no-same-owner
docker load -i "$incoming/image.tar.gz"
install -m 0444 "$incoming/benchmark-token" "$release_dir/.benchmark-token"
bash "$release_dir/deploy/activate.sh" "$app_dir" "$revision" "$domain"
rm -f -- "$incoming/image.tar.gz" "$incoming/source.tar.gz" "$incoming/benchmark-token"
rmdir -- "$incoming"
REMOTE

# Credential stays in the SSH-protected temporary file and browser memory, never logs/artifacts.
BENCHMARK_TOKEN="$(cat "$ssh_dir/benchmark-token")" BENCHMARK_ORIGIN="https://conappt.com" \
  node "$script_dir/../scripts/run-benchmark.js"
