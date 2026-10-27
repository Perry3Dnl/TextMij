# Authenticated encrypted messaging backend

Status: `src/messaging-api.js` is an authenticated encrypted HTTP API backed by MySQL. The release script provisions an isolated database and activates the API after CI tests, additive migrations and readiness checks. The browser chat remains a separate local preview until its UI is connected. This is not yet independently authenticated E2EE.

## HTTP API

All requests and responses are JSON over HTTPS.

- `POST /api/v1/accounts`: `{kind:"personal"|"business",name,publicKey,email?}`. The public key is a base64-encoded **uncompressed P-256 ECDH public key** of 65 bytes. Returns `{accountId,code,token,kind,tier,keyVersion}`. The bearer token is secret and returned once. Client MUST store it in protected device storage, never in a URL, QR, log, analytics event or website localStorage.
- `GET /api/v1/accounts/:id-or-code`: resolve stable account ID and public key. **Keys are not independently authenticated**. Do not claim secure E2EE until a verified directory, signed keys and anti-substitution checks exist.
- `POST /api/v1/messages`: authorized bearer account token with `{idempotencyKey: UUID, envelope: encryptedEnvelope}`. Message recipients must exist. Accepts opaque ciphertext only, returns queued ID, and derives Standard/Premium rights from MySQL accounts, never a client flag. Customer replies are Standard. Sender ID is derived from bearer authentication.
- `GET /api/v1/messages?after=N`: authorized recipient-only paginated inbox (max 100), consisting of dispatched encrypted envelopes and sender account IDs. Clients decrypt locally.

`src/durable-dispatcher.js` selects Premium FIFO before Standard FIFO. MySQL advisory lock + a persistent dispatch clock limit all worker processes to **at most one new dispatched message every 3 seconds**. A dispatch means that a ciphertext row is available for polling, *not* that the recipient phone has received a push notification or read the message.

The in-memory registration throttle limits each IP to five signups/hour per server process; not production-grade distributed abuse prevention. Production API activation needs a shared ingress limiter, device proof of possession, identity-key verification, monitoring, retention policy, and scalable abuse controls.

## Deployment gate

`deploy/mysql.compose.yml` defines a MySQL 8.4 container with an internal-only network, persisted volume and file-backed secrets. `deploy/api.messaging.compose.yml` is an optional overlay that places the API on both the shared Caddy network and the internal backend network. MySQL is **never exposed** to the Caddy network or a host TCP port.

The database requires schema migrations in order: `deploy/sql/001_encrypted_messages.sql`, `002_idempotency.sql`, `003_accounts_dispatch.sql`, `004_payload_fingerprint.sql`. Existing deployments must be inspected and backed up before migrations; never run against an unknown schema. Credentials are separate host-managed files, not repository secrets. Verify staged backup and restore before turning on `TEXTMIJ_MESSAGING_ENABLED`.

The production `deploy/activate.sh` executes `deploy/database.sh` before launching its candidate API, and automatically adds `deploy/api.messaging.compose.yml` once the database checks pass. Secret files are generated locally under `/opt/textmij/secrets`; the app secret is readable only to UID 1000, and the root secret remains private to the deployment user. CI exercises real MySQL integration and the production bootstrap. No production data volume is ever removed in activation or rollback. A restricted SQL snapshot is taken before additional migrations of an existing volume. Off-host encrypted backups, full restore exercises against production-scale data, and a retention policy are not yet automated.

## Remaining security boundaries

The browser's example chat still stores local data and uses no authenticated account backend. New API consumers must implement key authentication and protected private-key storage. The current P-256 ECDH prototype provides confidentiality against a passive server storing ciphertext, **not verified E2EE against an active server substituting public keys**. QR moving, business name ownership and premium payments remain separate features. The backend deliberately does not trust the demo verification flag for any privilege.
