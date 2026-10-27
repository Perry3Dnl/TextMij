import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageQueue, MessageValidationError, validateMessage, LIMITS, DISPATCH_INTERVAL_MS } from '../src/message-queue.js';

const recipientId = '7483-RGY-RCH';
const sample = { recipientId, title: 'Update', text: 'Hallo!' };
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(30)]);
test('enforces independent byte limits and template entitlements', () => {
  assert.equal(DISPATCH_INTERVAL_MS, 3000);
  assert.equal(LIMITS.standard.textBytes, 1024);
  assert.equal(LIMITS.premium.textBytes, 2048);
  assert.equal(LIMITS.premium.imageBytes, 1024);
  assert.ok(validateMessage({ ...sample, text: 'é'.repeat(508) }, 'standard'));
  assert.throws(() => validateMessage({ ...sample, text: 'é'.repeat(510) }, 'standard'), MessageValidationError);
  assert.ok(validateMessage({ ...sample, text: 'é'.repeat(900) }, 'premium'));
  assert.throws(() => validateMessage({ ...sample, text: 'a'.repeat(2048) }, 'premium'), /Text exceeds/);
  assert.throws(() => validateMessage({ ...sample, template: 'title-text-image', image: png }, 'standard'), /Template/);
  assert.ok(validateMessage({ ...sample, template: 'title-text-image', image: png }, 'premium'));
  assert.throws(() => validateMessage({ ...sample, template: 'title-text-image', image: Buffer.concat([png, Buffer.alloc(1000)]) }, 'premium'), /Image exceeds/);
  assert.throws(() => validateMessage({ ...sample, template: 'title-text-image', image: Buffer.from('not an image') }, 'premium'), /Only PNG/);
  assert.throws(() => validateMessage({ ...sample, image: png }, 'premium'), /not allowed/);
  assert.throws(() => validateMessage({ ...sample, plan: 'premium' }, 'standard'), /Unexpected/);
});
test('premium FIFO always precedes standard FIFO, without LIFO inversion', async () => {
  let clock = 3000;
  const sent = [];
  const plans = { a: 'standard', p: 'premium' };
  const queue = new MessageQueue({ now: () => clock, resolveTier: id => plans[id], dispatch: async job => sent.push(job.message.title) });
  for (const [sender, title] of [['a','A'],['a','B'],['p','P1'],['p','P2'],['a','C']]) queue.enqueue(sender, { ...sample, title });
  for (let i=0; i<5; i++) { assert.equal(await queue.tick(), true); clock+=3000; }
  assert.deepEqual(sent, ['P1','P2','A','B','C']);
  assert.equal(queue.pending,0);
});
test('at most one dispatch starts every three seconds even when busy or failing', async () => {
  let clock=10000, resolve;
  const sent=[];
  const errors=[];
  const queue=new MessageQueue({now:()=>clock,dispatch:job=>{sent.push(job.message.title); if(job.message.title==='first') return new Promise(r=>{resolve=r}); throw Error('delivery failure')},onError:e=>errors.push(e.message)});
  queue.enqueue('a',{...sample,title:'first'});
  queue.enqueue('a',{...sample,title:'second'});
  const first=queue.tick();
  assert.equal(await queue.tick(),false);
  clock+=3000;
  assert.equal(await queue.tick(),false);
  resolve();
  assert.equal(await first,true);
  assert.equal(await queue.tick(),true);
  assert.deepEqual(sent,['first','second']);
  assert.deepEqual(errors,['delivery failure']);
});
test('browser demo plan cannot elevate sender; capacity is bounded', () => {
  const queue = new MessageQueue({dispatch:async()=>{},maxPending:1});
  assert.throws(()=>queue.enqueue('a',{...sample,template:'title-text-image',image:png,tier:'premium'}), /Unexpected/);
  assert.equal(queue.enqueue('a',sample).tier,'standard');
  assert.throws(()=>queue.enqueue('a',sample), /capacity/);
});
