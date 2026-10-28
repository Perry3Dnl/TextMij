# Deploying TextMij

## GitHub setup

Open **Settings → Secrets and variables → Actions** in this repository. Values may also be configured on the `production` environment. Repository secrets are available to that environment unless its policies restrict them.

### Secrets

| Name | Required | Value |
| --- | --- | --- |
| `DEPLOY_HOST` | Yes | SSH hostname or IP of the existing shared server. |
| `DEPLOY_USER` | Yes | SSH user with the server permissions described below. |
| `DEPLOY_PASSWORD` | Yes | Password for that SSH user. |
| `DEPLOY_PORT` | No | SSH port; defaults to `22`. |

This matches the password-based SSH deployment currently used by MetElkaarOnline. Secrets are repository-scoped: putting them in MetElkaarOnline does not make them available to TextMij. Reuse the same server details here if appropriate. No GitHub PAT, registry credential, or SSH private-key secret is needed.

### Variables (not secrets)

| Name | Required | Value/default |
| --- | --- | --- |
| `TEXTMIJ_DOMAIN` | No | Legacy hostname; defaults to `textmij.perry3d.nl`. The same owned Caddy route also serves `conappt.com` automatically. Supply a hostname without `https://` or a path. |
| `DEPLOY_HOST_KEY_FINGERPRINT` | No | Defaults to the existing shared server's Ed25519 fingerprint, matching MetElkaarOnline. Set this only when deploying to a different server or after a verified host-key change. |
| `DEPLOY_APP_DIR` | No | `/opt/textmij` |
| `SHARED_PROXY_NETWORK` | No | `dummy-stock-simulator_default` |
| `SHARED_CADDY_CONTAINER` | No | `dummy-stock-caddy` |
| `SHARED_CADDYFILE` | No | `/opt/dummy-stock-simulator/deploy/Caddyfile` |

No Actions variables need to be added for the existing shared server and `textmij.perry3d.nl`. If a fingerprint override becomes necessary, verify it through the provider console or another trusted channel. On the server it can be read with:

```sh
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

Use the field beginning with `SHA256:`. The workflow scans the server key and compares it to this trusted fingerprint before sending credentials.

Create a GitHub environment named `production` if you want to configure it before the first run. For fully automatic deployment, it must allow `main` and must not require manual reviewers. Recommended branch protection for `main`: require a PR and the **Tests** and **Container smoke test** checks before merging. Branch protection is not configured by these files.

## Shared-server prerequisites

- An x86-64 Linux server with Docker Engine, Docker Compose v2 with `up --wait`, Bash, Python 3, `flock`, `curl`, and `tar`. The image is built and tested on GitHub's x86-64 Ubuntu runner; an ARM server needs an ARM runner/build configuration first.
- Password-based SSH access, as used by the reference repository.
- The deployment user can use Docker, create/write `/opt/textmij`, and update the shared Caddyfile and an adjacent lock file. There is no interactive `sudo` in the remote deployment.
- The existing Caddy container is running, is attached to `dummy-stock-simulator_default`, and reads `/etc/caddy/Caddyfile` from the configured host Caddyfile.
- `textmij.perry3d.nl` (or the overridden hostname) resolves to this server. Configure the DNS A record, and an AAAA record only if the server's IPv6 is working. Existing Caddy owns ports 80/443 and handles HTTPS.
- Sufficient disk space for the image archive, loaded image, and retained release directories.

The deployment does not create another reverse proxy or publish TextMij's port on the host. It joins the existing external Docker network, following MetElkaarOnline's shared-proxy setup. Other repositories and live server files were inspected through the reference repository only; no server changes have been applied while preparing this setup.

## Automatic deployment

1. A PR targeting `main` runs HTTP tests, deployment/recovery tests, shell checks, and a Docker smoke test. PRs do not receive deployment credentials or change production.
2. Merging creates a push to `main`, where those checks run again against the exact new revision. Direct pushes to `main` also follow this path; use branch protection to require PRs.
3. The container job saves the exact image it tested and archives the committed source. The deployment job requires both test jobs to succeed. Future required test jobs must also be added to the deployment job's `needs` list.
4. The deployment job verifies the pinned SSH host key, uploads the image and source, and loads the image on the server. The server does not clone the repo or rebuild the image.
5. A new container starts alongside the existing TextMij release. Its name uses a shortened commit prefix and the workflow run/attempt IDs to stay within Docker DNS's 63-byte label limit. Compose waits for its Docker health check, and a second check verifies reachability from Caddy's network namespace before any route changes. CI exercises a live Caddy-to-container request with the same naming function.
6. The script updates **only the TextMij marker block** in the shared Caddyfile, validates the complete configuration, and reloads the existing Caddy container.
7. The public HTTPS health endpoint must report the expected Git SHA. Only then does the script update `current` and stop the old TextMij container.
8. If activation fails, the previous TextMij route is restored and the old container stays running. Other projects' Caddy blocks are retained, including changes made after TextMij's backup. A first-deployment failure removes TextMij's block instead. If route restoration itself fails, the candidate stays running and the workflow reports the recovery record path.

The Caddyfile is edited in place to preserve its Docker bind mount. The shared proxy is reloaded, not restarted. No shared `docker compose down`, volume deletion, or Docker pruning is performed. TextMij deployments are serialized; Caddy updates made by other projects should also be serialized operationally because their scripts may use different locking conventions.

The workflow also supports **Actions → Test and deploy → Run workflow** on `main`. A manual run still executes all tests and the container smoke test before deployment. Selecting another branch runs checks without deployment.

## Server layout and recovery

```text
/opt/textmij/
  releases/<revision>-<run-id>-<attempt>/
    deploy/
    .container
    .caddy-rollback.json
  current -> releases/<active-release>/
  previous -> releases/<previous-release>/
  incoming/
```

The 0.9.0 release provisions its own **MySQL 8.4** database using `deploy/database.sh`, before switching the Caddy route. It creates uniquely owned TextMij secret files in `/opt/textmij/secrets`, an internal-only `textmij_backend` network, and persistent Docker volume `textmij_mysql_data`. The API container joins both the reverse-proxy network and the internal database network. MySQL never publishes TCP ports and is not connected to Caddy's network. Six additive SQL migrations are checksum-tracked; an existing database without migration history is rejected rather than modified blindly. Before applying new migrations to an existing volume, the script writes a restricted gzip SQL backup under `/opt/textmij/backups` and verifies it. Deployment rollback preserves the entire volume and all existing backups; it cannot automatically roll schema backwards. Automatic off-host backups and complete disaster recovery still need an independent operating procedure and should be configured before using the service for important customer data.

Release directories and Docker images are retained for recovery. There is no automatic disk cleanup yet; monitor space and remove only obsolete TextMij releases after confirming they are not `current` or `previous`. Never prune shared Docker resources as part of this repository's deployment.

To redeploy a known revision, rerun its successful workflow on `main`; it retests and reloads the corresponding image in a new release directory. This restores application code only. Once a database is added, rollback must also account for schema compatibility.

## Encrypted messaging API readiness

Production releases after version 0.9.0 include an authenticated encrypted messaging API and MySQL-backed FIFO dispatch, with one dispatched message per three seconds globally. CI starts a disposable real MySQL instance, migrates it, and runs a complete encrypted HTTP send/receive test; a separate test runs the actual production bootstrap twice and checks that synthetic data survives. Deployment aborts before switching Caddy if the database, secrets, migrations or `/api/ready` checks fail. `/api/health` still reports the running Git SHA.

Release 0.14.0 connects the live browser to authenticated accounts, profiles, connections and ciphertext messages. The original browser-local preview remains available at /?preview=1. Additive migrations 005 and 006 introduce business profiles, connections and private business reports. Report receipts are issued after transaction commit; reports have no public listing endpoint. Unit, browser and real MySQL smoke tests gate deployment. The public key directory is not independently authenticated against key substitution; therefore **this version must not be advertised as fully authenticated E2EE**. Never put device private keys or account bearer tokens in server logs. See `docs/MESSAGING_API.md` and `docs/E2EE.md` for protocol limitations.

## Machine-readable production release result

Starting in version 0.9.1, the deploy job posts `textmij/production` to GitHub commit statuses. `success` is recorded only after the deployment script verifies public HTTPS health returns the exact Git SHA. A failed release records `failure`, allowing automated status verification without exposing SSH secrets or changing the shared Caddy setup. See the workflow run for rollback details.

## Conappt canonical domain

The existing shared Caddy reverse proxy serves both `conappt.com` and the historic `textmij.perry3d.nl` from the same container and deployment revision. HTTPS for both names is handled by the existing Caddy instance; preserve DNS A/AAAA and firewall ports 80/443. The existing legacy domain remains operational to preserve user access and integrations. Neither host is redirected in this release, to avoid breaking API callers. The deploy continues to edit only the managed TextMij marker block and validates the whole shared Caddy configuration before reloading. CI tests both hostnames through the reverse proxy on its isolated network. For production verification, check `https://conappt.com/api/health` and `https://textmij.perry3d.nl/api/health` return the same deployed revision.

## Automatic browser stress test

Version 0.13.0 adds a 60-second browser round-trip benchmark after `ship.sh` has activated and verified production. The deploy job installs pinned Playwright/Chromium on the GitHub Ubuntu runner (which already contains the required shared libraries); the app container remains a small Node server. `ship.sh` generates a fresh random credential in its private temporary directory, transfers it with pinned SSH and installs it as a read-only Compose secret in the release directory. No new GitHub secret is needed. Never print this credential, enable shell tracing around it, or include it in artifacts/URLs.

Activation includes `deploy/benchmark.compose.yml`. It mounts the credential and the dedicated `textmij_benchmark_results` volume at `/app/benchmark-data` (owned by the existing non-root Node user). The benchmark API atomically saves only aggregate results. It does not read or write customer data, and normal rollback leaves this volume intact. The result includes the running revision; a different revision displays pending instead of presenting old measurements as current. Retained releases keep their credential file for Compose restart/rollback; starting a load test still requires that credential and an unused, time-limited process session.

The runner loads `https://conappt.com`, checks the revision meta tag, runs the browser module, verifies the public result and reloads the actual app footer. Logs and the Actions summary contain full totals, unsuccessful returns and six per-burst counts. If this step fails after activation, the current release remains running and production status is marked failed; inspect whether activation or only the benchmark failed before choosing recovery. A workflow rerun creates a new release container and fresh credential, and repeats the measurement.

For an isolated local browser check (no production data), install dev dependencies and Chromium, then run:

```sh
npm install --ignore-scripts --no-audit --no-fund
npx playwright install --with-deps chromium
node scripts/benchmark-smoke.js
```

The test reports observed throughput for this browser/network and current bounded batch transport, not an absolute hardware maximum or the durable messaging API's throughput. Details and counting semantics are in README.md.


Release 0.16.0 applies additive migration 007 for server-enforced conversation blocks and private business-to-user reports. Pins, private notes and chat exports remain device-local. CI exercises blocking and concurrent message acceptance against real MySQL, and verifies block/report persistence through a repeated production bootstrap.
