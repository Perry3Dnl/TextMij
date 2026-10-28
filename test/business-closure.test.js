import test from 'node:test';
import assert from 'node:assert/strict';
import {parseClosure,expiredClosure,closureLimit,closurePublic} from '../src/business-closure.js';

test('closed profiles remain visible for 90 days, then expire',()=>{
  const at='2026-10-28T10:00:00.000Z';
  assert.equal(parseClosure(JSON.stringify({closedAt:at})),at);
  assert.equal(parseClosure('invalid'),null);
  assert.equal(expiredClosure(at,closureLimit(at)-1),false);
  assert.equal(expiredClosure(at,closureLimit(at)),true);
  assert.deepEqual(closurePublic({},Date.now()),{closedAt:null,closed:false,expired:false});
});
