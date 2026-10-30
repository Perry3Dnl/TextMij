import { validateReplyOptions } from './interactive-replies.js';
// Client-side prototype: recipient confidentiality with WebCrypto P-256 ECDH + HKDF + AES-GCM.
// IMPORTANT: no sender authentication or recipient key transparency yet. Do not label production E2EE.
const subtle = globalThis.crypto?.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
const bytes = text => enc.encode(text);
const b64 = array => btoa(Array.from(new Uint8Array(array), x => String.fromCharCode(x)).join(''));
const unb64 = text => {
  if (typeof text !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw new TypeError('Invalid base64');
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
};
const account = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function assertCrypto() {
  if (!subtle || !globalThis.crypto?.getRandomValues) throw new Error('Secure WebCrypto context required');
}
function context({ senderId, recipientId, template, keyVersion }) {
  if (!account(senderId) || !account(recipientId) || senderId === recipientId) throw new TypeError('Invalid participants');
  if (!['title-text', 'title-text-image'].includes(template) || !Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new TypeError('Invalid message metadata');
  return bytes(JSON.stringify(['textmij', 1, senderId, recipientId, template, keyVersion]));
}
function random(n) { const out = new Uint8Array(n); globalThis.crypto.getRandomValues(out); return out; }
async function derive(ephemeralOrPrivate, remoteKey, nonce, associatedData) {
  const bits = await subtle.deriveBits({ name: 'ECDH', public: remoteKey }, ephemeralOrPrivate, 256);
  const material = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: nonce, info: associatedData }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function generateDeviceKeyPair() {
  assertCrypto();
  return subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
}
export async function exportDevicePublicKey(publicKey) {
  assertCrypto();
  return b64(await subtle.exportKey('raw', publicKey));
}
export async function encryptForRecipient({ senderId, recipientId, recipientPublicKey, title, text, image, keyVersion = 1, allowEmptyTitle = false, replyOptions = [] }) {
  assertCrypto();
  const template = image === undefined ? 'title-text' : 'title-text-image';
  const aad = context({ senderId, recipientId, template, keyVersion });
  if (typeof title !== 'string' || (!allowEmptyTitle && !title.trim()) || typeof text !== 'string' || !text.trim()) throw new TypeError('Title/text required');
  const ephemeral = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const recipientKey = await subtle.importKey('raw', unb64(recipientPublicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const nonce = random(12);
  const key = await derive(ephemeral.privateKey, recipientKey, nonce, aad);
  const plaintext = bytes(JSON.stringify({ title, text, ...(replyOptions?.length ? {replyOptions:validateReplyOptions(replyOptions)} : {}) }));
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, key, plaintext);
  const envelope = { version: 1, recipientId, template, ciphertext: b64(ciphertext), nonce: b64(nonce),
    wrappedKey: b64(await subtle.exportKey('raw', ephemeral.publicKey)), keyVersion };
  if (image !== undefined) {
    if (!(image instanceof Uint8Array) || image.byteLength < 1) throw new TypeError('Image must be a byte array');
    const imageNonce = random(12);
    envelope.imageNonce = b64(imageNonce);
    envelope.imageCiphertext = b64(await subtle.encrypt({ name: 'AES-GCM', iv: imageNonce, additionalData: aad, tagLength: 128 }, key, image));
  }
  return envelope;
}
export async function decryptFromSender({ senderId, recipientId, privateKey, envelope }) {
  assertCrypto();
  if (envelope?.recipientId !== recipientId || envelope?.version !== 1) throw new TypeError('Wrong recipient/envelope version');
  const aad = context({ senderId, recipientId, template: envelope.template, keyVersion: envelope.keyVersion });
  const nonce = unb64(envelope.nonce);
  if (nonce.byteLength !== 12) throw new TypeError('Invalid nonce');
  const remote = await subtle.importKey('raw', unb64(envelope.wrappedKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const key = await derive(privateKey, remote, nonce, aad);
  const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, key, unb64(envelope.ciphertext));
  const message = JSON.parse(dec.decode(plaintext));
  if (typeof message.title !== 'string' || typeof message.text !== 'string') throw new TypeError('Invalid decrypted message');
  message.replyOptions=validateReplyOptions(message.replyOptions);
  if (envelope.template === 'title-text-image') {
    const imageNonce = unb64(envelope.imageNonce);
    if (imageNonce.length !== 12) throw new TypeError('Invalid image nonce');
    const image = await subtle.decrypt({ name: 'AES-GCM', iv: imageNonce, additionalData: aad, tagLength: 128 }, key, unb64(envelope.imageCiphertext));
    return { ...message, image: new Uint8Array(image) };
  }
  return message;
}
