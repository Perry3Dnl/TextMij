# Conappt: encryption and database architecture

**Status (0.13.0):** the live browser now encrypts/decrypts on the endpoints and uses the authenticated MySQL messaging API. Non-exportable device keys are stored in IndexedDB and browser authentication uses HttpOnly cookies. The public-key directory is not independently authenticated; sender signing and forward secrecy are also incomplete. Do not describe this as independently authenticated E2EE. Business reports are separately submitted server-readable moderation records, not chat ciphertext.

## Threat model and trust boundaries

A dedicated Docker bridge with `internal: true` isolates MySQL from other containers on the shared reverse-proxy network. There is **no host port mapping**. Only the TextMij API containers should join `textmij_backend`; do not put MySQL on the existing shared Caddy network. Docker socket/host root, compromised API code and backup operators remain privileged threat actors. Use least-privilege DB accounts, hardened hosts, backup encryption, firewall policy and auditing as well.

Message content is **encrypted on the sender's device** before submission and **decrypted only on the recipient's device**. The server stores opaque ciphertext, transport nonces, key-wrapping material and necessary routing metadata. It cannot validate the *plaintext* size, title, template fields or image content without breaking E2EE. Client-side enforcement is therefore UX only; the server must enforce ciphertext-byte caps, expected envelope structure and **trusted** sender entitlement. Because ciphertext overhead adds bytes, caps are deliberately larger than content limits. Absolute 1024/2048-byte plaintext limits cannot be independently proven by a server without complex zero-knowledge mechanisms; reject any product promise implying otherwise.

Recommended protocol work before releasing E2EE:
1. Generate per-device non-exportable asymmetric key pairs on the device. Use a vetted, reviewed hybrid-encryption protocol (e.g. HPKE with X25519 + HKDF-SHA256 + AES-256-GCM) and separate signature/authentication keys. Prefer an audited library instead of custom cryptographic primitives.
2. Publish authenticated recipient public keys, plus key version, with anti-substitution/key-transparency verification. A server that can silently replace public keys defeats E2EE despite encryption.
3. Encrypt a random per-message content key with authenticated recipient key material; use unique AEAD nonces, bound authenticated metadata, and rotate keys as needed. Clearly define multi-device envelopes and replay protection.
4. For business-to-customer messaging, protect both recipients and sending-device keys. Define how a business operating via REST API holds its **private** sending/decryption keys (never send them to TextMij). An API sender encrypts before calling TextMij.
5. Specify what happens on device loss, key rotation, key revocation and backups. New device ID implies fresh device keys and no old history unless user explicitly opts in to encrypted recovery.
6. Ship interoperable crypto test vectors and independent security review before claiming E2EE.

The `src/encrypted-envelope.js` validator rejects plaintext JSON fields and bounds opaque ciphertext payloads but **does not encrypt or decrypt anything**. The encrypted_messages table stores ciphertext envelopes, including optional encrypted image fields. The authenticated API and durable dispatcher are active; the in-memory queue remains a separately tested policy foundation. The live browser currently sends text only. Chat ingress must not accept plaintext.

## Database setup and preservation

`deploy/mysql.compose.yml` is activated by the existing production database bootstrap before routing a candidate release. MySQL 8.4 has a named volume `textmij_mysql_data` and separate application/root credentials supplied by secret files outside git. Never expose port 3306, never run `down -v`, and never delete the named volume on deploy/rollback. The Node application uses mysql2. Six additive, checksum-tracked migrations preserve existing accounts and ciphertext while adding profiles, connections and reports. See [MESSAGING_API.md](MESSAGING_API.md) for the protocol and moderation query. Restricted SQL snapshots are taken before pending migrations on an existing volume; off-host encrypted backups and production-scale restore procedures remain separate operational work.

Before enabling a production database, confirm the host disk/backup setup, the existing deploy's replacement-container networking, secret provisioning and restore procedures. Do not create an unbacked production data store via CI. Keep the release rollback schema-compatible with existing data.
