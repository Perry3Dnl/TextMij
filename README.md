# Conappt

Conappt (formerly TextMij) is a free business-to-customer messaging service with a REST API and a lightweight web and mobile client. Businesses send updates and confirmations to unique device IDs, and customers can reply directly—no phone number or email required for customers.

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

The existing browser interface is explicitly a **preview**: its example conversations are stored only in this browser. A separately authenticated server-side registration and encrypted message API has now been implemented; the browser preview is not yet wired to it. Independent E2EE public-key verification, mobile notifications, device migration and a packaged mobile shell are still unfinished. Preview codes are not real delivery addresses.

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

## Authenticated messaging API (version 0.9.0)

The Node server can now register accounts, authenticate bearer tokens, accept validated ciphertext messages, persist messages in MySQL and expose an encrypted recipient inbox. When enabled, MySQL-backed dispatch limits the service to one released message each three seconds, with Premium FIFO before Standard FIFO. The release script now provisions TextMij's dedicated MySQL volume, private network and locally generated credentials, applies additive schema migrations and activates the authenticated messaging API after successful CI integration tests. Existing MySQL data is preserved and a restricted SQL snapshot is produced before future schema migrations. Confirm the deployed revision and database readiness from CI before relying on the service. Client-side chat, premium billing, independently authenticated E2EE keys and QR migration are not yet integrated. See [Messaging API deployment guide](docs/MESSAGING_API.md).

## Business chat themes (preview)

In business mode, **Instellingen → Bedrijfsthema** offers four accessible predefined color palettes. The selection is saved in the browser and changes the business-mode accent and the chat session colors. In the linked Studio Noord customer conversation, the same theme appears when switching back to personal mode. Other demonstration businesses remain unchanged. Themes are deliberately constrained to vetted palettes instead of accepting arbitrary CSS, protecting contrast and avoiding CSS injection. Multi-device and cross-user synchronization requires the future authenticated business-profile API; a separate customer's browser cannot receive the changes yet.

Theme choices now include White, Black (dark mode), and Custom. Custom exposes saved accent, message bubble background/text, chat background and text colors. These persist in local preview state and are applied to the linked customer chat. Remote customer synchronization still needs the business profile backend.

## Live release verification

The server injects two inspectable `<head>` meta tags into the root HTML response: `<meta name="conappt-version" content="0.10.1">` and `<meta name="conappt-revision" content="<running Git SHA>">`. The latter is taken from the running container's `APP_REVISION`; the former from `package.json`. Compare the exact revision from `curl -fsS https://textmij.perry3d.nl/` against the deployment commit. HTML responses set `Cache-Control: no-store`; the health endpoint `/api/health` also identifies the deployed Git SHA. The public domain and internal identifiers remain unchanged.

## Whole-business theme coverage

In business mode, the saved White, Black, or Custom palette now colors the complete interface: page background, sidebar/mobile navigation, cards, controls, buttons, settings, conversation list and chat. The themed variables are scoped to the business mode; personal navigation remains independent and only the linked business chat inherits company colors. Custom changes are still saved locally in the browser preview and not synchronized to another device.

## Company profile preview (0.11.0)

Business → Settings includes an optional public company profile: small image logo (PNG/JPEG/WebP, max 90KB), description, telephone, HTTPS website and social links, free-text opening hours for each day, and three configurable outbound quick action links. The linked demo company name in a personal chat navigates to its themed company profile. Links open the company's own systems (e.g. booking or appointment software); Conappt does not implement or replace those workflows. Values are stored only in existing browser preview state, **not synchronized to other users/devices**. Logos as data URLs may increase local storage usage; remote media storage and authorization are needed for production. External URLs are HTTPS-only, credentials are rejected, and user-provided HTML is escaped.

In the personal-mode conversation with the linked example company, the complete conversation workspace (header, message bubbles, thread, composer and surrounding business theme) now adopts that company's saved palette. Leaving the chat removes the company-wide theme from personal navigation. Other mock businesses still use the neutral styling until server-synchronized profiles are available.

## Business profile editor panels (0.12.0)

The business profile settings now group branding, contact info, opening hours, and external quick actions into smaller panels. Businesses add/remove up to three actions as needed instead of seeing six mandatory fields. The public company profile renders configured actions as prominent call-to-action buttons linking into the business's own systems.

## In-place business profile editing (0.12.1)

In Business mode open **Bekijk bedrijfsprofiel**, then **Profiel bewerken** to edit public details and action buttons directly on the profile page; saving returns to the profile preview. The standalone public-profile editor was removed from Settings, which retains account credentials, theme, verification, and notification controls. The same profile route in Personal mode is read-only. Changes remain browser-local until authenticated server profiles are available.

## Consistent business logos (0.12.4)

When a company sets a logo, Conappt displays it in its business account selector, account avatar in desktop/mobile navigation, business dashboard, company profile and linked customer conversations. Initials or the existing company icon remain the fallback for businesses without a logo. The existing browser-local logo persistence is unchanged.

## Title-free business chat replies (0.12.5)

Within an existing business conversation, the message composer now has just one text field, like the customer's composer. Structured title/text templates and their strict validator remain available for future outbound updates and API use. Previously sent messages with titles still render their titles. Messages remain browser-local in the preview.

## Automatic round-trip development benchmark (0.13.0)

After each successful production activation, a Chromium browser loads `https://conappt.com` and verifies the exact release revision. The browser runs six increasing bulk bursts at 0, 10, 20, 30, 40 and 50 seconds. Each message contains **1024 binary bytes in each direction**, including a unique sequence number; random content prevents compression from inflating the result. Messages travel browser → public HTTPS/Caddy → Node → browser. The browser compares every returned byte and counts only complete returns within the same 60-second window. A return counts as **one round-trip message**, not two messages. No extrapolated totals or abbreviated millions are displayed.

The bottom-of-screen **Dev-test** label shows the full completed count and messages not returned before the deadline. Hover for sent counts, measurement time, revision and methodology. `/api/benchmark` exposes aggregate results and per-burst counts without credentials or payloads. Results survive process/container restarts in a dedicated Docker volume and are only shown for the matching release revision. Ordinary visitors fetch results; they do not generate load.

This is **measured transport throughput**, not a proven absolute server maximum or production chat delivery throughput. It excludes account authorization, encryption, MySQL persistence and the real message scheduler (which currently releases one message per three seconds). Browser CPU, network path, six concurrent HTTP requests and batch overhead also affect the measured count. Every binary HTTP batch carries at most 256 messages (256 KiB); workers apply backpressure while burst demand grows adaptively, with no small message-count cap. Failed requests and messages outstanding/late at the deadline are included in the published result rather than counted as delivered.

Load endpoints require a fresh deployment-only credential transferred over pinned SSH, a single active run and a short measurement window. There is no public start button. Diagnostic traffic is never inserted into customer messages or databases. CI runs the same full-minute browser test against an isolated local server before release. A failed post-deployment benchmark fails the workflow/production status and remains visible as pending/failed; it does not undo an otherwise healthy activation or touch existing data. No mobile package is currently implemented in this repository.

## Logo image processing (0.12.6)

The browser accepts any image type it can decode (up to a 50 MB input safety cap), center-crops it to a square, then downscales/compresses to a maximum **100 KiB** WebP or JPEG before storing the result in the existing local preview profile. SVG documents are never inserted as executable markup. The source image is not retained. Server-backed business logo hosting and cross-device synchronization are **not implemented yet** because the live browser preview has no authenticated profile upload API or persistent media volume; an unauthenticated public upload endpoint must not be introduced.
