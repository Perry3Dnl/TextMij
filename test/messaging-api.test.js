import { memoryDatabase } from '../support/memory-database.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { MessagingApi } from '../src/messaging-api.js';
import { generateDeviceKeyPair, exportDevicePublicKey, encryptForRecipient, decryptFromSender } from '../public/crypto.js';

test('HTTP registration, encrypted send and receive, authorization and privacy contract', async t => {
  const db = memoryDatabase();
  const server = createApp({messaging:new MessagingApi(db),revision:'integration-test'});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  t.after(()=>new Promise(ok=>server.close(ok)));
  const base='http://127.0.0.1:'+server.address().port;
  const post=(path,body,token)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',
    ...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  const privateA=await generateDeviceKeyPair(), privateB=await generateDeviceKeyPair();
  const [a,b]=await Promise.all([
    post('/api/v1/accounts',{kind:'business',name:'Atelier',email:'a@example.test',publicKey:await exportDevicePublicKey(privateA.publicKey)}),
    post('/api/v1/accounts',{kind:'personal',name:'Robin',publicKey:await exportDevicePublicKey(privateB.publicKey)})
  ]);
  assert.equal(a.status,201);
  assert.equal(b.status,201);
  const sender=await a.json(), recipient=await b.json();
  assert.equal(sender.tier,'standard');
  assert.match(sender.accountId,/^[a-f0-9]{64}$/);
  assert.equal((await fetch(base+'/api/v1/accounts/'+recipient.code)).status,200);
  const encrypted=await encryptForRecipient({senderId:sender.accountId,recipientId:recipient.accountId,
    recipientPublicKey:await exportDevicePublicKey(privateB.publicKey),title:'Update',text:'Geheim bericht'});
  assert.equal(JSON.stringify(encrypted).includes('Geheim bericht'),false);
  assert.equal((await post('/api/v1/messages',{envelope:encrypted,idempotencyKey:'12345678-1234-4234-8234-123456789abc'})).status,401);
  const sent=await post('/api/v1/messages',{envelope:encrypted,idempotencyKey:'12345678-1234-4234-8234-123456789abc'},sender.token);
  assert.equal(sent.status,202);
  assert.equal(db.messages.length,1);
  const wrong=await fetch(base+'/api/v1/messages',{headers:{authorization:'Bearer '+sender.token}});
  assert.equal((await wrong.json()).messages.length,0);
  const inbox=await fetch(base+'/api/v1/messages',{headers:{authorization:'Bearer '+recipient.token}});
  const payload=await inbox.json();
  assert.equal(payload.messages.length,1);
  assert.equal(payload.messages[0].senderId,sender.accountId);
  assert.deepEqual(await decryptFromSender({senderId:sender.accountId,recipientId:recipient.accountId,
    privateKey:privateB.privateKey,envelope:payload.messages[0].envelope}),{title:'Update',text:'Geheim bericht'});
  assert.equal(JSON.stringify(payload).includes('Geheim bericht'),false);
  const spoofed=await post('/api/v1/messages',{envelope:{...encrypted,tier:'premium'},idempotencyKey:'12345678-1234-4234-8234-123456789abd'},sender.token);
  assert.equal(spoofed.status,400);
});
