// Validate the transport envelope without ever accessing plaintext.
export const ENVELOPE_VERSION = 1;
export const ENVELOPE_LIMITS = Object.freeze({
  standard: Object.freeze({ maxCiphertextBytes: 1024 + 16 + 128, maxImageCiphertextBytes: 0 }),
  premium: Object.freeze({ maxCiphertextBytes: 2048 + 16 + 128, maxImageCiphertextBytes: 1024 + 16 }),
});
const MAX_WRAPPED_KEY_BYTES = 1024;
const cleanBase64 = value => typeof value === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
function decode(value, name) {
  if (!cleanBase64(value)) throw new TypeError(`Invalid ${name} base64`);
  return Buffer.from(value, 'base64');
}
export function validateEncryptedEnvelope(body, tier = 'standard') {
  if (!Object.hasOwn(ENVELOPE_LIMITS, tier)) throw new TypeError('Unknown entitlement');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('Invalid envelope');
  const keys = new Set(['version','recipientId','template','ciphertext','nonce','wrappedKey','keyVersion','imageCiphertext','imageNonce']);
  if (Object.keys(body).some(key => !keys.has(key))) throw new TypeError('Unexpected envelope field');
  if (body.version !== ENVELOPE_VERSION || !Number.isSafeInteger(body.keyVersion) || body.keyVersion < 1) throw new TypeError('Unsupported envelope version');
  if (typeof body.recipientId !== 'string' || !(/^[0-9]{4}-[A-Z]{3}-[A-Z]{3}$/.test(body.recipientId) || /^[a-f0-9]{64}$/.test(body.recipientId))) throw new TypeError('Invalid recipient');
  if (!['title-text','title-text-image'].includes(body.template)) throw new TypeError('Unsupported template');
  if (tier === 'standard' && body.template !== 'title-text') throw new TypeError('Premium template required');
  const cipher = decode(body.ciphertext, 'ciphertext'), nonce = decode(body.nonce, 'nonce'), wrapped = decode(body.wrappedKey, 'wrappedKey');
  if (nonce.length !== 12 || cipher.length < 17 || cipher.length > ENVELOPE_LIMITS[tier].maxCiphertextBytes || !wrapped.length || wrapped.length > MAX_WRAPPED_KEY_BYTES)
    throw new RangeError('Encrypted message exceeds size or nonce limits');
  if (body.template === 'title-text-image') {
    const image = decode(body.imageCiphertext, 'imageCiphertext'), imageNonce = decode(body.imageNonce, 'imageNonce');
    if (imageNonce.length !== 12 || image.length < 17 || image.length > ENVELOPE_LIMITS[tier].maxImageCiphertextBytes)
      throw new RangeError('Encrypted image exceeds size or nonce limits');
  } else if (body.imageCiphertext !== undefined || body.imageNonce !== undefined) throw new TypeError('Unexpected encrypted image');
  return { version: body.version, recipientId: body.recipientId, template: body.template,
    ciphertext: cipher, nonce, wrappedKey: wrapped, keyVersion: body.keyVersion,
    ...(body.template === 'title-text-image' ? { imageCiphertext: decode(body.imageCiphertext, 'imageCiphertext'), imageNonce: decode(body.imageNonce, 'imageNonce') } : {}) };
}
