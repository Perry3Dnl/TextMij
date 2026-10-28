# Authenticated messaging, profiles and reports

The production Node 24 server uses the isolated MySQL backend. The live browser is connected to it; the original local example is available only through /?preview=1.

## Authentication and registration

All production requests use HTTPS and JSON. API clients authenticate with Authorization: Bearer TOKEN.

- POST /api/v1/accounts accepts {kind:"personal"|"business",name,publicKey,email?,browser?}. The public key is a base64 uncompressed P-256 ECDH public key (65 bytes). Business email is optional.
- API clients receive {accountId,code,token,name,kind,tier,keyVersion}. The token is secret and returned once.
- With browser:true the token is omitted from JSON and set as an HttpOnly, SameSite=Strict role cookie. HTTPS uses Secure cookies. Browser requests send X-Conappt-Role: personal or business. Origin checks reject foreign-origin cookie-authenticated requests.
- Browser keys are non-exportable CryptoKeys stored in IndexedDB. Do not put credentials/private keys in QR codes, URLs, logs, analytics or localStorage.
- GET /api/v1/session returns the current authenticated account and its public profile.
- GET /api/v1/accounts/:id-or-code resolves stable account ID and public key. This directory does not independently authenticate cryptographic keys or verify legal business identity.

## Connections and profiles

- POST /api/v1/connections accepts {code,alias?} from an authenticated business. The code must identify a personal account. Reconnecting opens the same pair. The optional alias is visible only to that business.
- GET /api/v1/connections returns the authenticated account's connected customers or businesses, including safe public profiles, keys and selected industry.
- PUT /api/v1/profile accepts {name,industryId?,profile?,theme?,customTheme?} for the authenticated account. Business profile fields are logo, description, optional phone/HTTPS website/social links, opening hours and up to three external actions. Unknown industries and invalid theme colors are rejected.

The live QR contains only the same-origin public contact link /#connect/CODE. Physical sharing of that code is the invitation to connect; it is not a login or device-transfer token.

## Encrypted messaging

- POST /api/v1/messages requires {idempotencyKey:UUID,envelope:encryptedEnvelope}. Sender and tier are derived from authentication. Only ciphertext is persisted.
- GET /api/v1/messages?after=N returns up to 100 dispatched envelopes for the authenticated recipient. The browser decrypts them locally.

The durable dispatcher uses a MySQL advisory lock and persistent clock to release at most one message globally every three seconds, Premium FIFO before Standard FIFO. Standard messages may wait during continuous Premium traffic. A dispatch means availability to authenticated polling, not a push notification or proof of reading. Browser polling pauses while hidden. Background push and native mobile packaging remain unfinished.

Recipient key authentication, sender signing, forward secrecy and reviewed device transfer are still required before advertising independently authenticated E2EE. See [E2EE.md](E2EE.md).

## Private business reports

POST /api/v1/business-reports accepts:

~~~json
{
  "businessId": "64-character stable account ID",
  "requestId": "UUID v4 generated once for this submission",
  "reason": "impersonation",
  "details": "Optional explanation"
}
~~~

Reasons: impersonation, scam, spam, abuse, misleading, other. Explanation is limited to 2000 Unicode characters; other requires nonblank text.

The server authenticates a personal account and verifies its connection to the target business. It does not trust client-supplied reporter IDs, company names, status or dates. A report stores a server-generated UUID, reporter/target IDs, the business name at submission, reason, explanation, open status and UTC creation time.

The response is 201 {reportId,status:"received"} after transaction commit. An identical retry with the same requestId returns 200 with the original receipt. A conflicting retry returns 409. A persistent rolling-day quota allows ten new reports per account; duplicates do not consume another slot. Account row locking makes the check and insert safe across concurrent API replicas.

Unauthenticated submissions return 401; business-role submissions return 403; unconnected targets return 404; invalid fields return 400; exhausted quota returns 429; storage failures return 503 without a success receipt. GET/listing is not implemented and returns 405. Companies cannot retrieve reports.

Reports are intentionally server-readable moderation data, not encrypted chat. No chat history or private contact fields are automatically attached. The application neither emails reports nor automatically penalizes the reported company.

Authorized database operators can inspect the queue using their existing restricted administrative connection:

~~~sql
SELECT id, business_id, business_name, reason, details, created_at
FROM business_reports
WHERE status = 'open'
ORDER BY created_at ASC
LIMIT 100;
~~~

Do not publish this output or connection credentials. A moderation dashboard and report-retention automation are separate work.

## Deployment and rollback

The tracked additive migrations are:

1. 001_encrypted_messages.sql
2. 002_idempotency.sql
3. 003_accounts_dispatch.sql
4. 004_payload_fingerprint.sql
5. 005_connections.sql
6. 006_business_reports.sql

The existing deployment script preserves the dedicated MySQL volume and secrets, validates recorded checksums and takes a restricted SQL snapshot before pending migrations on an existing volume. It validates the new profile, connection and report tables before starting the candidate API.

Rollback must preserve all six schemas and their data. The prior application can ignore the new tables; do not reverse migrations by dropping accounts, connections or reports. Off-host encrypted backups, production-scale restore drills and automated retention are not implemented by this change.

CI exercises disposable real MySQL databases, repeated production bootstrap, ciphertext delivery and report storage/authorization/retries. Browser tests separately exercise signup, a real QR decode with simulated camera frames, camera denial/manual entry, message exchange, a failed report request with retained input, and successful server receipt. No production accounts or messages are used as test fixtures.


## Conversation actions (0.16.0)

`PUT /api/v1/conversation-block` requires an authenticated role and `{contactId, blocked: boolean}` for an existing connection. Each account controls only its own block. Either account's active block rejects sends in both directions with HTTP 403, excludes that pair from inbox delivery and marks their queued messages as failed. Existing history on either device is retained. Removing your block does not remove the other account's block. Account row locks serialize message acceptance and blocking; clients may show the changed state after their next poll.

`POST /api/v1/user-reports` is for authenticated businesses reporting a connected personal account. Body: `{userId, requestId, reason, details}`. Reasons are impersonation, scam, spam, abuse or other; other requires details. The existing UUID retry contract, maximum 2000 characters, account row lock, ten new reports per rolling day and post-commit receipt apply. Reporter identity and the target name come from server records. No message history or private note is attached. GET is not a report listing API. The existing personal-to-business endpoint remains unchanged.

Authorized database operators can review user reports with:

```sql
SELECT id, reporter_id, user_id, user_name, reason, details, status, created_at
FROM user_reports WHERE status = 'open' ORDER BY created_at, id;
```

Migration 007 adds `account_blocks` and `user_reports`. It preserves the existing accounts, connections, encrypted messages and business reports. The production migration runner verifies old checksums and makes a verified backup before applying a pending migration to an existing database.

Pins and private notes are device-local preferences, scoped to the active account and conversation. Notes are not transmitted to the server or included in chat exports. Chat exports are plain UTF-8 text and contain only messages available on the exporting device; pending messages are marked unconfirmed. Example reports are stored locally in the example state, explicitly labelled as examples, and never sent to moderation.
