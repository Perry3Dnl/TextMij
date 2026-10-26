#!/usr/bin/env bash
# Run on the server after the tested image and source bundle have been uploaded.
set -euo pipefail

app_dir="${1:?application directory required}"
revision="${2:?revision required}"
domain="${3:?domain required}"
release_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
release_id="${release_dir##*/}"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid revision' >&2; exit 1; }
[[ "$release_id" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
[[ "$release_dir" = "$app_dir/releases/$release_id" ]] || { echo 'Unexpected release path' >&2; exit 1; }

export SHARED_PROXY_NETWORK="${SHARED_PROXY_NETWORK:-dummy-stock-simulator_default}"
caddy_container="${SHARED_CADDY_CONTAINER:-dummy-stock-caddy}"
caddyfile="${SHARED_CADDYFILE:-/opt/dummy-stock-simulator/deploy/Caddyfile}"
export TEXTMIJ_IMAGE="textmij:$revision"
export TEXTMIJ_CONTAINER="textmij-api-$release_id"
compose=(docker compose -p "textmij-$release_id" -f "$release_dir/deploy/compose.yml")
backup="$release_dir/.caddy-rollback.json"
candidate_started=false
route_changed=false
activated=false

cleanup() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ "$activated" = false ]; then
    restored=true
    if [ "$route_changed" = true ] || [ -f "$backup" ]; then
      echo 'Restoring the previous TextMij route.' >&2
      if ! python3 "$release_dir/deploy/caddy.py" restore "$caddyfile" "$backup" \
        || ! docker exec "$caddy_container" caddy validate --config /etc/caddy/Caddyfile \
        || ! docker exec "$caddy_container" caddy reload --config /etc/caddy/Caddyfile; then
        restored=false
        echo "Route restoration failed; leaving candidate running. Recovery record: $backup" >&2
      fi
    fi
    if [ "$candidate_started" = true ] && [ "$restored" = true ]; then
      docker rm -f "$TEXTMIJ_CONTAINER" >/dev/null 2>&1 || true
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

for executable in docker python3 curl; do command -v "$executable" >/dev/null; done
docker compose version >/dev/null
docker network inspect "$SHARED_PROXY_NETWORK" >/dev/null
docker inspect "$caddy_container" >/dev/null
test -f "$caddyfile"
# Check Caddy can reach candidate containers before changing anything.
docker inspect "$caddy_container" --format '{{json .NetworkSettings.Networks}}' \
  | python3 -c 'import json,sys; sys.exit(0 if sys.argv[1] in json.load(sys.stdin) else 1)' "$SHARED_PROXY_NETWORK"
python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import caddy; caddy.render(sys.argv[2], sys.argv[3])' \
  "$release_dir/deploy" "$domain" "$TEXTMIJ_CONTAINER"

previous_container=''
if [ -L "$app_dir/current" ] && [ -f "$app_dir/current/.container" ]; then
  previous_container="$(cat "$app_dir/current/.container")"
  [[ "$previous_container" =~ ^textmij-api-[a-z0-9-]+$ ]] || { echo 'Invalid previous container' >&2; exit 1; }
fi

"${compose[@]}" config --quiet
candidate_started=true
"${compose[@]}" up -d --no-build --wait --wait-timeout 120
docker exec "$TEXTMIJ_CONTAINER" node -e \
  "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const b=await r.json();process.exit(r.ok&&b.service==='textmij'&&b.revision===process.env.APP_REVISION?0:1)}).catch(()=>process.exit(1))"

# Keep this lock until activation/rollback has completed. It serializes TextMij
# Caddy edits; other projects retain ownership of their own blocks.
exec 9>"${caddyfile}.textmij.lock"
flock -w 120 9
python3 "$release_dir/deploy/caddy.py" apply "$caddyfile" "$backup" "$domain" "$TEXTMIJ_CONTAINER"
route_changed=true
docker exec "$caddy_container" caddy validate --config /etc/caddy/Caddyfile
docker exec "$caddy_container" caddy reload --config /etc/caddy/Caddyfile

healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --connect-timeout 5 --max-time 10 \
    "https://$domain/api/health" \
    | python3 -c 'import json,sys; b=json.load(sys.stdin); sys.exit(0 if b.get("status")=="ok" and b.get("service")=="textmij" and b.get("revision")==sys.argv[1] else 1)' "$revision"; then
    healthy=true
    break
  fi
  sleep 2
done
[ "$healthy" = true ] || { echo 'Public health check failed' >&2; exit 1; }

printf '%s\n' "$TEXTMIJ_CONTAINER" >"$release_dir/.container"
if [ -L "$app_dir/current" ]; then
  ln -sfn -- "$(readlink -f "$app_dir/current")" "$app_dir/previous.next"
  mv -Tf -- "$app_dir/previous.next" "$app_dir/previous"
fi
ln -sfn -- "$release_dir" "$app_dir/current.next"
mv -Tf -- "$app_dir/current.next" "$app_dir/current"
activated=true
if [ -n "$previous_container" ] && [ "$previous_container" != "$TEXTMIJ_CONTAINER" ]; then
  docker stop --time 20 "$previous_container" >/dev/null \
    || echo "Warning: could not stop previous TextMij container $previous_container" >&2
fi
echo "TextMij deployed: $revision at https://$domain"
# Release archives/images are retained for recovery. No shared Docker pruning.
