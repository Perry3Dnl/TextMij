import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEncryptedEnvelope } from '../src/encrypted-envelope.js';
const b = data => Buffer.from(data).toString('base64');
const base = { version: 1, keyVersion: 1, recipientId: '7483-RGY-RCH', template: 'title-text', ciphertext: b(Buffer.alloc(40)), nonce: b(Buffer.alloc(12)), wrappedKey: b(Buffer.alloc(48)) };
test('server accepts only opaque ciphertext envelope with strict required nonce and wrapped key', () => {
  const result = validateEncryptedEnvelope(base);
  assert.equal(result.ciphertext.length, 40);
  assert.equal(Object.hasOwn(result,'text'), false);
  assert.throws(() => validateEncryptedEnvelope({...base, text:'plaintext'}), /Unexpected/);
  assert.throws(() => validateEncryptedEnvelope({...base,nonce:b(Buffer.alloc(8))}), /limits/);
  assert.throws(() => validateEncryptedEnvelope({...base,ciphertext:b(Buffer.alloc(2000))}), /limits/);
});
test('premium may attach encrypted image while standard cannot', () => {
  const image = {...base,template:'title-text-image',imageCiphertext:b(Buffer.alloc(300)),imageNonce:b(Buffer.alloc(12))};
  assert.throws(() => validateEncryptedEnvelope(image,'standard'), /Premium/);
  assert.equal(validateEncryptedEnvelope(image,'premium').imageCiphertext.length,300);
  assert.throws(() => validateEncryptedEnvelope({...image,imageCiphertext:b(Buffer.alloc(1200))},'premium'), /limits/);
});
