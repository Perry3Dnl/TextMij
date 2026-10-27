import test from 'node:test';
import assert from 'node:assert/strict';
import { newAccountIdentity, conversationContext, DeviceTransferRegistry, validateAccountId } from '../src/account-identity.js';
test('new accounts use opaque random stable IDs rather than predictable personal data', () => {
  const a = newAccountIdentity({kind:'business',name:'Atelier',email:'Owner@example.com'});
  const b = newAccountIdentity({kind:'business',name:'Atelier',email:'Owner@example.com'});
  assert.equal(validateAccountId(a.id),true);
  assert.notEqual(a.id,b.id);
  assert.equal(a.id.includes('atelier'),false);
  assert.equal(a.email,'owner@example.com');
  assert.equal(newAccountIdentity({kind:'personal'}).kind,'personal');
});
test('conversation context is deterministic, directional, and not an encryption key', () => {
  const a=newAccountIdentity({kind:'personal'}).id, b=newAccountIdentity({kind:'personal'}).id;
  assert.equal(conversationContext(a,b), conversationContext(a,b));
  assert.notEqual(conversationContext(a,b),conversationContext(b,a));
  assert.throws(()=>conversationContext(a,a),/Invalid/);
});
test('QR rendezvous tokens expire and are single use', () => {
  let now=100;
  const id=newAccountIdentity({kind:'personal'}).id;
  const sessions=new DeviceTransferRegistry({now:()=>now,ttlMs:2000});
  const qr=sessions.create(id);
  assert.equal(Object.hasOwn(qr,'accountId'),false);
  assert.equal(sessions.consume({sessionId:qr.sessionId,token:'wrong'},id),false);
  assert.equal(sessions.consume(qr,id),false);
  const fresh=sessions.create(id);
  assert.equal(sessions.consume(fresh,id),true);
  assert.equal(sessions.consume(fresh,id),false);
  const expired=sessions.create(id);now+=2000;
  assert.equal(sessions.consume(expired,id),false);
});
