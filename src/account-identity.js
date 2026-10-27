import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// Stable opaque IDs are independent of public contact codes, email and company names.
export function newAccountIdentity({ kind, name, email } = {}) {
  if (!['personal', 'business'].includes(kind)) throw new TypeError('Invalid account type');
  if (kind === 'business' && (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new TypeError('Valid business name and email required');
  const id = createHash('sha256').update('textmij:account:v1:').update(randomBytes(32)).digest('hex');
  return Object.freeze({ id, kind, ...(kind === 'business' ? { name: name.trim(), email: email.trim().toLowerCase() } : {}) });
}

export function validateAccountId(id) {
  return typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
}

// The two IDs bind the cryptographic context to participants, NOT an encryption key.
export function conversationContext(senderId, recipientId) {
  if (!validateAccountId(senderId) || !validateAccountId(recipientId) || senderId === recipientId) throw new TypeError('Invalid conversation participants');
  return createHash('sha256').update('textmij:conversation:v1:').update(senderId).update(':').update(recipientId).digest('hex');
}

// Transfer handshakes are ephemeral, single-use, and only confirm a securely-authenticated
// device-to-device transfer. Account secrets and E2EE private keys MUST NOT be put in the QR.
export class DeviceTransferRegistry {
  #sessions = new Map();
  constructor({ now = Date.now, ttlMs = 120_000 } = {}) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new TypeError('Invalid TTL');
    this.now = now; this.ttlMs = ttlMs;
  }
  create(accountId) {
    if (!validateAccountId(accountId)) throw new TypeError('Invalid account ID');
    const token = randomBytes(32).toString('base64url');
    const sessionId = randomBytes(16).toString('hex');
    const expiresAt = this.now() + this.ttlMs;
    this.#sessions.set(sessionId, { accountId, tokenHash: createHash('sha256').update(token).digest(), expiresAt });
    // QR content is a rendezvous token, not an account ID, private key or authorization to transfer.
    return { version: 1, sessionId, token, expiresAt };
  }
  consume({ sessionId, token }, accountId) {
    const session = this.#sessions.get(sessionId);
    if (!session) return false;
    this.#sessions.delete(sessionId);
    if (this.now() >= session.expiresAt || session.accountId !== accountId || typeof token !== 'string') return false;
    const supplied = createHash('sha256').update(token).digest();
    return timingSafeEqual(session.tokenHash, supplied);
  }
  get pending() { return this.#sessions.size; }
}
