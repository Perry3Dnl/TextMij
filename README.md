# TextMij

TextMij is a free business-to-customer messaging service with a REST API and a lightweight web and mobile client. Businesses send updates and confirmations to unique device IDs, and customers can reply directly—no phone number or email required for customers.

## Project scope

- A device registers with a display name and receives an ID such as `7483-RGY-RCH`.
- A new phone means a new ID and a fresh chat history, by design.
- Businesses register with an email address and business name and receive a free API key.
- Customers and businesses can use the same web client; a Capacitor-style shell will package it as a mobile app.
- Three main pages: Home (device ID), Conversations (one per business), and Settings, plus the conversation view.
- Initially, businesses send a text template containing a title and content. Customers reply with text.
- Business and customer text limits start at 1 KB each and must be independently configurable. Image replies and their separate limits remain to be specified.
- Basic messaging stays free. Businesses may later pay for priority or additional features.

Device IDs are public delivery addresses, not authentication credentials. The future client must authenticate its device session before it can access messages.

## Current implementation

This repository contains the deployment foundation and the first responsive web client:

- A dependency-free Node.js 24 HTTP server and a light Dutch interface for desktop and phone.
- Home with an example device code, a searchable company inbox, settings, and a chat view.
- Working local example replies, unread state, per-conversation mute preferences, profile editing, and settings persistence.
- An account switcher on desktop and phone, using the same layout for personal and business profiles. The selected profile persists across reloads.
- Business Home, customer conversations, editable business name/email, and a new-conversation form accepting a customer code. Reusing a code opens the existing conversation.
- Local business messages with a required title and content; outgoing messages appear on the right in either role. The example personal profile is a customer of the example business, allowing the same exchange to be viewed from both sides. Other customer conversations remain in the business inbox.
- Separate unread state, mute preferences, and in-memory message drafts per role. Notification preferences apply to the device across both profiles.
- UTF-8-aware 1 KB limits for customer replies and business title/content combined, independently configurable in `public/model.js`.
- Company-theme variables scoped to the chat panel, keeping the rest of the app neutral.
- `GET /api/health` reports service status and the running Git revision.
- A non-root Docker container and production Compose configuration.
- PR tests, container smoke tests, and automatic production deployment after successful checks on `main`.
- Shared-Caddy routing with health checks and failure recovery.

The interface is explicitly a **preview**: company conversations and the code are examples, and replies are stored in this browser only. Real device registration, server-side message storage, messaging endpoints, business authentication, push notifications, and the mobile shell are still to be implemented. Preview codes are not real delivery addresses.

## Local development

With Node.js 24 and Python 3 installed:

```sh
npm start
npm run dev
npm test
python3 -m unittest discover -s tests -v
```

The web entry point is at `http://localhost:3000` and health is at `http://localhost:3000/api/health`. Use either `npm start` for the server or `npm run dev` to restart it automatically when source changes. No npm dependencies need to be installed.

See [DEPLOY.md](DEPLOY.md) for GitHub secrets, variables, shared-server prerequisites, and the deployment flow.

## Business verification preview

The business Settings screen offers a simulated verification plan priced at **€20/month**. Confirming the mock checkout enables a blue **Demo-verificatie** outline beside the business name in the business dashboard and the example customer inbox/chat. Users can disable it at any time. The selection is stored locally with other preview preferences and survives business profile edits and page reloads. **No money is collected, no subscription is created, and no identity is checked.** The badge must not be described as genuine verification until a secured backend implements payment events, entitlement management, business identity review, and a server-authoritative public badge. Core business messaging stays free.

## Server-side message policy (prepared, not yet connected to delivery)

`src/message-queue.js` implements the internal scheduler and validator, independently of the local browser preview. Standard companies can use the `title-text` template with **1024 UTF-8 bytes shared by title and text**. Premium companies can use **2048 UTF-8 text bytes** and optionally the `title-text-image` template with an additional **1024 binary image bytes** (PNG, JPEG, WebP). This is message *content* size, not the HTTP/JSON envelope size or base64 wire encoding overhead.

Messages enter a bounded 1000-item in-memory queue. The server starts **at most one dispatch per 3000 ms**, with *FIFO within each priority tier* and Premium always taking precedence over pending Standard messages. Premium therefore may starve Standard if Premium traffic remains continuous; no end-to-end latency SLA can be promised. Delivery failures are reported to an injected `onError` callback, not retried automatically. Stopping or restarting the process loses pending messages; use durable storage, idempotency, retry/backoff, and an outbox before production messaging is enabled.

Usage for the later authenticated backend:

```js
import { MessageQueue } from './src/message-queue.js';
const queue = new MessageQueue({
  resolveTier: senderId => serverOwnedEntitlements.get(senderId) === 'premium' ? 'premium' : 'standard',
  dispatch: async job => { /* store and deliver to authenticated recipient */ },
  onError: (error, job) => { /* redact and record safe failure details */ },
});
queue.start();
queue.enqueue(authenticatedBusinessId, { recipientId: '7483-RGY-RCH', title: 'Update', text: 'Hallo' });
```

There is deliberately **no publicly writable message endpoint** yet: identity, recipient sessions, persistence, and payment-webhook-derived entitlements do not exist. A local browser `demoVerification` flag never gives a sender Premium server privileges. A verified blue company mark and name reservation are separate, future server-controlled features. This module is not a per-sender requests-per-second throttle; it enforces content sizes and **global dispatch cadence**. Implement per-identity ingress rate limits and HTTP request-body caps when introducing the authenticated API.

## Storage encryption foundation

A MySQL 8.4 Docker Compose configuration on an isolated internal network, an encrypted-envelope schema, and server-side ciphertext validation are staged for review. The database is **not deployed** and the app is **not E2EE-enabled** yet. See [E2EE design and rollout requirements](docs/E2EE.md). The shared reverse proxy does not have database access. Release version: 0.5.0.

## Stable account identity and moving devices

A future account has an opaque random persistent identifier, independent of its public contact code or mutable company name/email. Prototype transfer rendezvous tokens are short lived and single use; the UI, authentication, device-to-device key handover, and production registration are not available yet. The pair of account IDs binds sender/recipient metadata but does **not** serve as an E2EE key. See [account transfer design](docs/ACCOUNT_TRANSFER.md). Version 0.6.0.

## Endpoint encryption prototype (0.7.0)

`public/crypto.js` uses built-in WebCrypto P-256 ECDH, HKDF-SHA256 and AES-256-GCM to encrypt message title/content (and optionally an image) before upload. An ephemeral ECDH public key is transmitted in the existing envelope `wrappedKey` field; that field is **not a wrapped symmetric key** in this prototype. The client decrypts with its own non-exportable private key. The encrypted envelope validates against `src/encrypted-envelope.js`, and automated tests cover round-trip, participant context binding and tampering. This module is served as `/crypto.js` but is **not integrated into the chat UI, messaging API or database**.

**Security limitation:** this prototype provides recipient confidentiality with a previously authenticated public key, not authenticated E2EE: without signed/safely verified public keys the server could substitute keys. It also lacks sender signing, forward secrecy across long-lived device key compromise, safe key recovery, a reviewed interoperable protocol and production key storage. Do not enable or advertise production E2EE until these are implemented and security reviewed. See docs/E2EE.md.

## Prepared durable encrypted outbox (0.8.0)

The new `src/encrypted-outbox.js` repository provides parameterized MySQL inserts for already-encrypted message envelopes, bounded per-recipient retrieval, a premium-first FIFO query and explicit status transition. `deploy/sql/002_idempotency.sql` adds a per-sender unique idempotency key without deleting existing rows. The database connection is injected, not opened by the production web server; this is **not an active message API**. Production MySQL is still not provisioned. The prototype must not be enabled before the database migration and integration tests in staging, encrypted backups and restore validation, authenticated account/key management, and a transactional claim/lease-based worker with retries and cross-worker pacing. Duplicate retries with the same key must also be checked against immutable payload fingerprints before use. See docs/E2EE.md for security limits.
