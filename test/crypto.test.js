import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDeviceKeyPair, exportDevicePublicKey, encryptForRecipient, decryptFromSender } from '../public/crypto.js';
import { validateEncryptedEnvelope } from '../src/encrypted-envelope.js';
const senderId='a'.repeat(64), recipientId='b'.repeat(64), wrongId='c'.repeat(64);
test('encrypted title/text can be read by recipient but not another device', async()=>{
 const recipient=await generateDeviceKeyPair(), stranger=await generateDeviceKeyPair();
 const recipientPublicKey=await exportDevicePublicKey(recipient.publicKey);
 const envelope=await encryptForRecipient({senderId,recipientId,recipientPublicKey,title:'Titel',text:'Geheim 👋'});
 assert.ok(validateEncryptedEnvelope(envelope,'standard'));
 assert.deepEqual(await decryptFromSender({senderId,recipientId,privateKey:recipient.privateKey,envelope}),{title:'Titel',text:'Geheim 👋'});
 assert.equal(JSON.stringify(envelope).includes('Geheim'),false);
 await assert.rejects(()=>decryptFromSender({senderId,recipientId,privateKey:stranger.privateKey,envelope}));
 await assert.rejects(()=>decryptFromSender({senderId:wrongId,recipientId,privateKey:recipient.privateKey,envelope}));
});
test('image ciphertext roundtrips and tampering fails authentication',async()=>{
 const recipient=await generateDeviceKeyPair(), recipientPublicKey=await exportDevicePublicKey(recipient.publicKey);
 const image=new Uint8Array([137,80,78,71,13,10,26,10,2,3]);
 const envelope=await encryptForRecipient({senderId,recipientId,recipientPublicKey,title:'T',text:'X',image});
 const parsed=validateEncryptedEnvelope(envelope,'premium');
 assert.equal(parsed.imageCiphertext.length,image.length+16);
 const out=await decryptFromSender({senderId,recipientId,privateKey:recipient.privateKey,envelope});
 assert.deepEqual(out.image,image);
 const corruption={...envelope,ciphertext:envelope.ciphertext.replace(/^./,envelope.ciphertext[0]==='A'?'B':'A')};
 await assert.rejects(()=>decryptFromSender({senderId,recipientId,privateKey:recipient.privateKey,envelope:corruption}));
});
