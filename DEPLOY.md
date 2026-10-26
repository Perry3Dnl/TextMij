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
| `TEXTMIJ_DOMAIN` | Yes | The chosen TextMij hostname, e.g. `messages.your-domain.com`. Hostname only, without `https://` or a path. No domain has been assumed or configured. |
| `DEPLOY_HOST_KEY_FINGERPRINT` | No | Defaults to the existing shared server's Ed25519 fingerprint, matching MetElkaarOnline. Set this only when deploying to a different server or after a verified host-key change. |
| `DEPLOY_APP_DIR` | No | `/opt/textmij` |
| `SHARED_PROXY_NETWORK` | No | `dummy-stock-simulator_default` |
| `SHARED_CADDY_CONTAINER` | No | `dummy-stock-caddy` |
| `SHARED_CADDYFILE` | No | `/opt/dummy-stock-simulator/deploy/Caddyfile` |

No fingerprint variable needs to be added for the existing shared server. If an override becomes necessary, verify the Ed25519 fingerprint through the provider console or another trusted channel. On the server it can be read with:

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
- The chosen hostname resolves to this server. Configure the DNS A record, and an AAAA record only if the server's IPv6 is working. Existing Caddy owns ports 80/443 and handles HTTPS.
- Sufficient disk space for the image archive, loaded image, and retained release directories.

The deployment does not create another reverse proxy or publish TextMij's port on the host. It joins the existing external Docker network, following MetElkaarOnline's shared-proxy setup. Other repositories and live server files were inspected through the reference repository only; no server changes have been applied while preparing this setup.

## Automatic deployment

1. A PR targeting `main` runs HTTP tests, deployment/recovery tests, shell checks, and a Docker smoke test. PRs do not receive deployment credentials or change production.
2. Merging creates a push to `main`, where those checks run again against the exact new revision. Direct pushes to `main` also follow this path; use branch protection to require PRs.
3. The container job saves the exact image it tested and archives the committed source. The deployment job requires both test jobs to succeed. Future required test jobs must also be added to the deployment job's `needs` list.
4. The deployment job verifies the pinned SSH host key, uploads the image and source, and loads the image on the server. The server does not clone the repo or rebuild the image.
5. A new container starts alongside the existing TextMij release. Compose waits for its Docker health check.
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

The foundation has no customer database yet. Persistent storage, backups, and schema migrations must be added before implementing messaging; deployment does not claim to preserve data that is not implemented.

Release directories and Docker images are retained for recovery. There is no automatic disk cleanup yet; monitor space and remove only obsolete TextMij releases after confirming they are not `current` or `previous`. Never prune shared Docker resources as part of this repository's deployment.

To redeploy a known revision, rerun its successful workflow on `main`; it retests and reloads the corresponding image in a new release directory. This restores application code only. Once a database is added, rollback must also account for schema compatibility.
