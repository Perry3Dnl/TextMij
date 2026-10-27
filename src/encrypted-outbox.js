import { createHash, timingSafeEqual } from 'node:crypto';
import { validateEncryptedEnvelope } from './encrypted-envelope.js';

// MySQL 8.4 prepared-statement repository. Database connection is injected so
// there is no unconfigured public endpoint or implicit production migration.
export class EncryptedOutbox {
  constructor(db) {
    if (!db || typeof db.execute !== 'function') throw new TypeError('A prepared-statement database connection is required');
    this.db = db;
  }
  async enqueue({ senderId, tier, envelope, idempotencyKey }) {
    if (typeof senderId !== 'string' || !/^[a-f0-9]{64}$/.test(senderId)) throw new TypeError('Authenticated stable sender ID required');
    if (!['standard', 'premium'].includes(tier)) throw new TypeError('Invalid server-authoritative tier');
    if (typeof idempotencyKey !== 'string' || !/^[0-9a-f-]{36}$/.test(idempotencyKey)) throw new TypeError('Idempotency key required');
    const body = validateEncryptedEnvelope(envelope, tier);
    if (!/^[a-f0-9]{64}$/.test(body.recipientId)) throw new TypeError('Stable recipient ID required');
    const digest = createHash('sha256').update(JSON.stringify([
      body.recipientId, body.template, body.ciphertext.toString('base64'), body.nonce.toString('base64'),
      body.wrappedKey.toString('base64'), body.keyVersion, body.imageCiphertext?.toString('base64') ?? null,
      body.imageNonce?.toString('base64') ?? null, tier])).digest();
    const args = [idempotencyKey, digest, senderId, body.recipientId, body.template, body.ciphertext, body.nonce,
      body.imageCiphertext ?? null, body.imageNonce ?? null, body.wrappedKey, body.keyVersion, tier];
    await this.db.execute(`INSERT INTO encrypted_messages
      (idempotency_key, payload_hash, sender_business_id, recipient_device_id, message_type, ciphertext, nonce,
       image_ciphertext, image_nonce, wrapped_key, key_version, tier_at_acceptance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, args);
    const [[row]] = await this.db.execute('SELECT id, payload_hash FROM encrypted_messages WHERE sender_business_id = ? AND idempotency_key = ?', [senderId, idempotencyKey]);
    if (!row?.payload_hash || !timingSafeEqual(Buffer.from(row.payload_hash), digest)) throw new TypeError('Idempotency key reused for a different message');
    return { id: String(row.id) };
  }
  async nextQueued() {
    // A single dispatch worker must call this method. The 3-second pacing is
    // managed by the scheduler, not by an unsafe database polling race.
    const [rows] = await this.db.execute(`SELECT id, sender_business_id, recipient_device_id, message_type,
      ciphertext, nonce, image_ciphertext, image_nonce, wrapped_key, key_version, tier_at_acceptance
      FROM encrypted_messages WHERE status = 'queued'
      ORDER BY CASE WHEN tier_at_acceptance = 'premium' THEN 0 ELSE 1 END, id ASC LIMIT 1`);
    return rows[0] ?? null;
  }
  async markDispatched(id) {
    const [result] = await this.db.execute(`UPDATE encrypted_messages SET status = 'dispatched', dispatched_at = CURRENT_TIMESTAMP(6)
      WHERE id = ? AND status = 'queued'`, [id]);
    return result.affectedRows === 1;
  }
  async forRecipient(recipientId, { afterId = 0, limit = 100 } = {}) {
    if (typeof recipientId !== 'string' || !/^[a-f0-9]{64}$/.test(recipientId)) throw new TypeError('Invalid recipient');
    if (!Number.isSafeInteger(afterId) || afterId < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Invalid pagination');
    const [rows] = await this.db.execute(`SELECT id, sender_business_id, message_type, ciphertext,
      nonce, image_ciphertext, image_nonce, wrapped_key, key_version, queued_at
      FROM encrypted_messages WHERE recipient_device_id = ? AND id > ? ORDER BY id ASC LIMIT ?`,
      [recipientId, afterId, limit]);
    return rows;
  }
}
