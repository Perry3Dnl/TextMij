import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedOutbox } from '../src/encrypted-outbox.js';
const senderId = 'a'.repeat(64), recipientId = 'b'.repeat(64);
const base64 = bytes => Buffer.alloc(bytes, 7).toString('base64');
const message = { version:1, recipientId, template:'title-text', ciphertext:base64(40),
 nonce:base64(12), wrappedKey:base64(65), keyVersion:1 };
const idempotencyKey='12345678-1234-4234-8234-123456789abc';
test('encrypted repository uses parameterized insert and never stores plaintext or accepts browser tier',async()=>{
 const calls=[];
 const db={execute:async(sql,args=[])=>{calls.push({sql,args});return sql.startsWith('SELECT id FROM') ? [[{id:9}]] : [{affectedRows:1}]}};
 const outbox=new EncryptedOutbox(db);
 assert.deepEqual(await outbox.enqueue({senderId,tier:'standard',idempotencyKey,envelope:message}),{id:'9'});
 assert.match(calls[0].sql,/ON DUPLICATE KEY/);
 assert.equal(calls[0].args[4].equals(Buffer.alloc(40,7)),true);
 assert.equal(calls[0].args.includes('plaintext'),false);
 assert.ok(calls[0].sql.includes('?'));
 await assert.rejects(outbox.enqueue({senderId,tier:'fake',idempotencyKey,envelope:message}),/tier/);
 await assert.rejects(outbox.enqueue({senderId,tier:'standard',idempotencyKey,envelope:{...message,text:'secret'}}),/Unexpected/);
});
test('premium always precedes standard in durable queue ordering',async()=>{
 const queries=[];
 const db={execute:async(sql,args=[])=>{queries.push({sql,args});return sql.startsWith('SELECT id, sender_business_id') ? [[{id:2}]] : [{affectedRows:1}]}};
 const outbox=new EncryptedOutbox(db);
 assert.equal((await outbox.nextQueued()).id,2);
 assert.match(queries[0].sql,/premium.*THEN 0 ELSE 1 END, id ASC/);
 assert.equal(await outbox.markDispatched(2),true);
 assert.equal(queries[1].args[0],2);
});
test('recipient retrieval is bounded and parameterized',async()=>{
 const db={execute:async(sql,args)=>{assert.deepEqual(args,[recipientId,5,100]);return [[]]}};
 assert.deepEqual(await new EncryptedOutbox(db).forRecipient(recipientId,{afterId:5}),[]);
 await assert.rejects(new EncryptedOutbox(db).forRecipient(recipientId,{limit:1000}),/pagination/);
});
