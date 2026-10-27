# Stable account identities and future device migration

Status: foundation only. Existing browser demo IDs and messages are **not** migrated, and device-transfer UI and APIs are **not** enabled. Do not use these helpers as authentication.

## Identity rules
- Customer: show a human-friendly public contact code; separately generate a random opaque 256-bit account identifier (represented as SHA-256 digest) once, on the trusted registration backend. Store the ID permanently and associate contact codes with it. Changing phones does not regenerate this account ID.
- Business: collect name + email at registration for display and verification purposes, but **do not derive identity from a plain hash of name and email**. Those values are guessable, may change and can identify businesses across datasets. Instead create another random opaque ID, securely associate the current name/email to it, enforce unique registration policy separately and authenticate the registrant before registration or transfer.
- Only the backend assigns IDs; never accept browser-chosen IDs or a premium/verified flag as proof of ownership.
- Use the stable account ID as the account foreign key for durable encrypted messages. Sender and recipient IDs remain metadata visible to the server. Conversation context can include both IDs as *authenticated associated data*, bound to each encrypted message. **Combining two public IDs cannot create a secret encryption key.**

## Secure migration protocol (to implement)
1. On the **existing authenticated device**, the owner selects “Verhuizen naar ander apparaat”. It requests a short-lived, one-time rendezvous session over HTTPS. QR contains only an opaque session ID and random secret, never an account key, private key, or bearer session token with unrestricted account access.
2. The **new device** scans it and establishes an authenticated encrypted peer-to-peer transfer channel. Both devices show a matching verification code; user physically confirms on the old device, with rate limits and replay prevention on the server.
3. Transfer the account credential and E2EE device keys or securely re-wrap/restablish them for the new device, encrypted end-to-end over the device channel. Register the new device key and rotate/revoke the old device session only after successful acknowledgement.
4. Server atomically switches active device bindings without changing account ID, public contact code, database history or business entitlement. Lock down conflicting sessions; test interrupted transfers and recovery.
5. Old device is securely signed out and key material removed when the move completes. If the old device is lost, require a separately designed recovery mechanism, not knowledge of the code, hash, business email/name or QR alone.

The included `DeviceTransferRegistry` only issues and consumes expiring single-use rendezvous tokens. It is **not** an authorization API, a complete key agreement, or a production-ready distributed session store: its in-memory sessions disappear at restart. Implement DB-backed atomic one-time redemption, authenticated enrollment, cryptographic channel and key migration before exposing it in the app.

## E2EE
Use vetted public-key encryption with verified recipient device keys, authenticated sender keys, forward secrecy where appropriate and per-message nonces. Store encrypted payloads in MySQL; the server never gets unencrypted title, text, images or E2EE private keys. Both sender and recipient IDs may be included in an authenticated data envelope, but this is context binding, **not a shared secret**.
