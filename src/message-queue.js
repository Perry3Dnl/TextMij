// Internal message scheduler. No unauthenticated HTTP endpoint is exposed.
export const DISPATCH_INTERVAL_MS = 3_000;
export const LIMITS = Object.freeze({
  standard: Object.freeze({ textBytes: 1024, imageBytes: 0, templates: ['title-text'] }),
  premium: Object.freeze({ textBytes: 2048, imageBytes: 1024, templates: ['title-text', 'title-text-image'] }),
});
const bytes = value => Buffer.byteLength(value, 'utf8');

export class MessageValidationError extends Error {
  constructor(message) { super(message); this.name = 'MessageValidationError'; }
}
function validateImage(image) {
  if (!Buffer.isBuffer(image)) throw new MessageValidationError('Image must be a binary Buffer.');
  const valid = (image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    || (image.length >= 3 && image.subarray(0, 3).equals(Buffer.from([255,216,255])))
    || (image.length >= 12 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP');
  if (!valid) throw new MessageValidationError('Only PNG, JPEG and WebP images are accepted.');
}

export function validateMessage(payload, tier = 'standard') {
  if (!Object.hasOwn(LIMITS, tier)) throw new MessageValidationError('Unknown entitlement tier.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new MessageValidationError('Invalid message.');
  const allowed = new Set(['recipientId', 'title', 'text', 'template', 'image']);
  if (Object.keys(payload).some(key => !allowed.has(key))) throw new MessageValidationError('Unexpected message field.');
  if (typeof payload.recipientId !== 'string' || !/^\\d{4}-[A-Z]{3}-[A-Z]{3}$/.test(payload.recipientId)) throw new MessageValidationError('Invalid recipient code.');
  if (typeof payload.title !== 'string' || !payload.title.trim() || typeof payload.text !== 'string' || !payload.text.trim()) throw new MessageValidationError('Title and message text are required.');
  const limits = LIMITS[tier];
  const template = payload.template ?? 'title-text';
  if (!limits.templates.includes(template)) throw new MessageValidationError('Template is not included in this plan.');
  const textBytes = bytes(payload.title) + bytes(payload.text);
  if (textBytes > limits.textBytes) throw new MessageValidationError(`Text exceeds ${limits.textBytes} UTF-8 bytes.`);
  if (template === 'title-text-image') {
    if (payload.image === undefined) throw new MessageValidationError('Image is required for this template.');
    validateImage(payload.image);
    if (payload.image.length > limits.imageBytes) throw new MessageValidationError(`Image exceeds ${limits.imageBytes} bytes.`);
  } else if (payload.image !== undefined) {
    throw new MessageValidationError('Image is not allowed with the text-only template.');
  }
  return { recipientId: payload.recipientId, title: payload.title.trim(), text: payload.text.trim(), template,
    ...(payload.image === undefined ? {} : { image: Buffer.from(payload.image) }) };
}

// resolveTier must query a trusted, server-owned entitlement source, never the request body.
// dispatch must persist/deliver the message using the future authenticated messaging service.
export class MessageQueue {
  #standard = [];
  #premium = [];
  #timer = null;
  #busy = false;
  #lastStartedAt = -Infinity;
  constructor({ resolveTier = () => 'standard', dispatch, now = () => Date.now(), intervalMs = DISPATCH_INTERVAL_MS, maxPending = 1000, onError = () => {} } = {}) {
    if (typeof dispatch !== 'function' || typeof resolveTier !== 'function') throw new TypeError('dispatch and resolveTier are required functions.');
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || !Number.isSafeInteger(maxPending) || maxPending < 1) throw new RangeError('Invalid queue limits.');
    Object.assign(this, { resolveTier, dispatch, now, intervalMs, maxPending, onError });
  }
  get pending() { return this.#premium.length + this.#standard.length; }
  get pendingByTier() { return { premium: this.#premium.length, standard: this.#standard.length }; }
  enqueue(senderId, payload) {
    if (typeof senderId !== 'string' || !senderId.trim()) throw new MessageValidationError('Authenticated sender required.');
    // A payment-preview flag stored in the browser is never an entitlement.
    const tier = this.resolveTier(senderId) === 'premium' ? 'premium' : 'standard';
    const message = validateMessage(payload, tier);
    if (this.pending >= this.maxPending) throw new MessageValidationError('Queue capacity reached.');
    const job = Object.freeze({ senderId, tier, message, enqueuedAt: this.now() });
    (tier === 'premium' ? this.#premium : this.#standard).push(job);
    return { accepted: true, tier, position: this.pending };
  }
  // At most one dispatch begins in any interval. Premium FIFO is always drained first.
  async tick() {
    if (this.#busy || this.now() - this.#lastStartedAt < this.intervalMs) return false;
    const job = this.#premium.shift() ?? this.#standard.shift();
    if (!job) return false;
    this.#busy = true;
    this.#lastStartedAt = this.now();
    try { await this.dispatch(job); }
    catch (error) { this.onError(error, job); }
    finally { this.#busy = false; }
    return true;
  }
  start() {
    if (this.#timer) return;
    this.#timer = setInterval(() => { void this.tick(); }, this.intervalMs);
    this.#timer.unref?.();
  }
  stop() { if (this.#timer) clearInterval(this.#timer); this.#timer = null; }
}
