# Conappt

Conappt is a hosted business-to-customer messaging service. Customers receive a contact code without a phone number or email address. A business enters its company name, connects a customer, and sends updates from the app or its own software.

## Current release: 0.13.0

- Real device and business accounts, authenticated with separate HttpOnly cookies for each role.
- No required personal details. A business name is sufficient; an optional legacy API email field remains supported.
- Non-exportable device keys in IndexedDB. Credentials are never put in QR codes, URLs or localStorage.
- A customer taps their code to show a real QR code. A business scans it inside Conappt or enters the code manually.
- Connections and public business profiles persist in MySQL and appear on both devices.
- Searchable catalogue of industry starter packs, including a garage pack with ready-for-collection, progress, parts, approval and appointment messages.
- Customer replies and business updates use the existing ciphertext API. The live client polls while open.
- Business profile editing, optional logos/contact details/opening hours/external action links, and synchronized business chat themes.
- A private **Bedrijf melden** form in the customer chat and company profile. Reports are stored in MySQL and receive a receipt only after commit.
- Responsive browser UI for desktop and phone. No packaged Android/iOS release or background push notifications yet.

The original browser-local example remains available at **/?preview=1**. Its conversations, demo verification and preferences are preserved under their existing storage key. Example data is never submitted as real company reports.

## Try the in-person flow

1. Open Conappt on the customer's device and choose **Maak mijn code**.
2. On the business device enter the company name and choose **Start je bedrijf**.
3. Optionally choose a company template, such as **Autogarage**.
4. The customer taps their code. The business chooses **Klant verbinden → Scan QR-code**.
5. Both devices show the connection. Send **Auto klaar** from the business conversation and reply from the customer device.
6. A customer can choose **Bedrijf melden** in the chat or company profile, select a reason and send an optional explanation. **Iets anders** requires an explanation.

Browser camera permission and a secure context (HTTPS, or localhost for development) are required for scanning. Manual code entry remains available when camera access is unavailable.

## Development and tests

Requirements: Node.js 24 and Python 3. Production and real database integration tests also require Docker Compose and MySQL 8.4.

~~~sh
npm install
npm run check
npm test
python3 -m unittest discover -s tests -v
npx playwright install --with-deps chromium
npm run test:e2e
~~~

Run **npm start** for the web server. Without the configured MySQL backend, live registration is unavailable; the explicit example environment still works. The browser test server uses an isolated test adapter, never production data. Docker CI separately verifies the actual MySQL schema, authenticated API, ciphertext dispatch, profile updates, private reports and retries.

See [DEPLOY.md](DEPLOY.md) for the existing shared-server deployment. CI requires unit tests, browser flows and container/MySQL smoke tests before production deployment.

## Accounts, privacy and limits

Account IDs are opaque and stable; public contact codes are delivery addresses, not credentials or verified legal identities. Clearing browser data or using a new device starts a new profile. Secure account migration is not implemented.

Core messaging is intended to stay free. Actual paid subscriptions and business identity verification are not implemented; the old example's paid-verification simulation grants no server rights. Live company names are not yet checked through Unclaimable or exclusively reserved.

Business title and text share a 1024 UTF-8 byte limit. Customer replies have an independent 1024-byte limit. The existing durable dispatcher releases at most one queued message globally every three seconds, Premium FIFO before Standard FIFO. This is availability for polling, not push delivery or a read receipt. The production queue and database survive process restarts; outgoing display history is cached on the originating device.

The WebCrypto implementation provides recipient encryption against passive ciphertext storage. It does **not** provide independently verified end-to-end security against server key substitution, sender signing, or forward secrecy following long-term device-key compromise. Do not market this release as independently authenticated E2EE. See [docs/E2EE.md](docs/E2EE.md).

## Business reports

Only an authenticated personal account can report a connected business. The server derives the reporter, verifies the target, snapshots the current business name and validates a reason plus at most 2000 characters of explanation. Ten new reports per account per rolling day are allowed.

Reports use a client request UUID for safe retries: replaying an identical submission returns the original receipt; reusing it with a different payload is rejected. Database transactions and an account row lock serialize concurrent requests. Report contents are readable by Conappt moderators, kept separate from ciphertext chat, and never exposed through a public listing API or to the reported company. No conversation history, email or phone number is automatically attached.

Reports are available to authorized server/database operators through the moderation query in [docs/MESSAGING_API.md](docs/MESSAGING_API.md). There is no moderation dashboard, automatic notification email, automatic account suspension or automated report-retention job in this release.

## Release verification

GET **/api/health** identifies the exact running Git revision. GET **/api/ready** checks database readiness. Root HTML contains **conappt-version** and **conappt-revision** meta tags, with no-store caching. Verify both conappt.com and the retained textmij.perry3d.nl hostname against the deployment commit.
