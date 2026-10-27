#!/usr/bin/env bash
# Exercise the actual production naming, Compose settings, and Caddy proxy hop.
set -euo pipefail
: "${GITHUB_SHA:?revision required}"
: "${GITHUB_RUN_ID:?run ID required}"
: "${GITHUB_RUN_ATTEMPT:?run attempt required}"
export SHARED_PROXY_NETWORK=textmij-ci TEXTMIJ_IMAGE="textmij:$GITHUB_SHA"
TEXTMIJ_CONTAINER="$(python3 deploy/names.py "$GITHUB_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT")"
export TEXTMIJ_CONTAINER
export TEXTMIJ_BENCHMARK_TOKEN_FILE="$RUNNER_TEMP/benchmark-smoke-token"
python3 -c 'import secrets; print(secrets.token_hex(32))' >"$TEXTMIJ_BENCHMARK_TOKEN_FILE"
chmod 0444 "$TEXTMIJ_BENCHMARK_TOKEN_FILE"
cleanup() {
  docker logs "$TEXTMIJ_CONTAINER" || true
  docker logs textmij-ci-caddy || true
  docker rm -f "$TEXTMIJ_CONTAINER" textmij-ci-caddy || true
  docker network rm textmij-ci || true
  docker volume rm textmij_benchmark_results || true
  rm -f -- "$TEXTMIJ_BENCHMARK_TOKEN_FILE"
}
trap cleanup EXIT
docker network create textmij-ci
docker compose -p textmij-ci -f deploy/compose.yml -f deploy/benchmark.compose.yml up -d --no-build --wait --wait-timeout 120
docker exec "$TEXTMIJ_CONTAINER" node --input-type=module -e '
  import { writeFile, unlink, readFile } from "node:fs/promises";
  const file = "/app/benchmark-data/.volume-smoke";
  await writeFile(file, "isolated volume permission check");
  await unlink(file);
  if (!(await readFile(process.env.BENCHMARK_TOKEN_FILE, "utf8")).trim()) throw new Error("Missing benchmark credential");
  if ((await fetch("http://127.0.0.1:3000/api/benchmark/start", { method: "POST" })).status !== 401) throw new Error("Benchmark start must be private");
'
docker exec "$TEXTMIJ_CONTAINER" node -e "Promise.all([fetch('http://127.0.0.1:3000/'),fetch('http://127.0.0.1:3000/api/health')]).then(async ([web,health])=>{const b=await health.json();const html=await web.text();if(!web.ok||!health.ok||b.revision!==process.env.APP_REVISION||!html.includes('conappt-revision')||!html.includes(process.env.APP_REVISION)||!html.includes('conappt-version'))process.exit(1)}).catch(()=>process.exit(1))"

# Only the CI listener uses plain HTTP to avoid external ACME/DNS dependencies.
# Headers and the reverse-proxy upstream are rendered from the production file.
python3 - "$TEXTMIJ_CONTAINER" <<'PY' >"$RUNNER_TEMP/TextMij.proxy.Caddyfile"
import sys
sys.path.insert(0, 'deploy')
import caddy
print(caddy.render('textmij.example.com', sys.argv[1]).replace('textmij.example.com, conappt.com {', 'http://textmij.example.com, http://conappt.com {'))
PY
docker run -d --name textmij-ci-caddy --network textmij-ci --network-alias textmij.example.com --network-alias conappt.com \
  -v "$RUNNER_TEMP/TextMij.proxy.Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine
docker exec "$TEXTMIJ_CONTAINER" node --input-type=module -e '
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      for (const domain of ["textmij.example.com", "conappt.com"]) {
      const response = await fetch(`http://${domain}/api/health`, {
        signal: AbortSignal.timeout(3000)
      });
      const body = await response.json();
      if (!response.ok || body.service !== "textmij" || body.revision !== process.env.APP_REVISION) {
        throw new Error("Caddy did not reach the tested release");
      }
      }
      console.log("Both Caddy reverse-proxy hostnames passed");
      process.exit(0);
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
'
