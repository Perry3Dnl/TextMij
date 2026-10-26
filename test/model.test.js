import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freshState, restoreState, addReply, messagesFor, conversationsFor, totalUnread,
  byteLength, validateReply, MESSAGE_LIMITS, escapeHtml,
} from '../public/model.js';

test('text limit measures UTF-8 bytes, including emoji and accented characters', () => {
  assert.equal(byteLength('é'), 2);
  assert.equal(byteLength('🙂'), 4);
  assert.equal(validateReply('a'.repeat(1024)), null);
  assert.equal(validateReply('🙂'.repeat(256)), null);
  assert.notEqual(validateReply('🙂'.repeat(257)), null);
  assert.notEqual(validateReply('   \n  '), null);
  assert.equal(validateReply('a'.repeat(1024), 2048), null);
  assert.equal(MESSAGE_LIMITS.business, 1024);
  assert.equal(MESSAGE_LIMITS.customer, 1024);
});

test('a reply stays in its company conversation and is explicitly local', () => {
  const state = freshState();
  assert.equal(addReply(state, 'studio-noord', '  Tot donderdag!  '), null);
  assert.equal(messagesFor('studio-noord', state).at(-1).text, 'Tot donderdag!');
  assert.equal(messagesFor('studio-noord', state).at(-1).local, true);
  assert.equal(state.read.includes('studio-noord'), true);
  assert.equal(totalUnread(state), 1);
  assert.equal(messagesFor('fietsatelier', state).length, 2);
  const before = JSON.stringify(state);
  assert.notEqual(addReply(state, 'studio-noord', '🙂'.repeat(257)), null);
  assert.notEqual(addReply(state, 'missing-company', 'Hallo'), null);
  assert.equal(JSON.stringify(state), before);
});

test('local state round-trips profile, preferences, read state and replies', () => {
  const state = freshState();
  state.name = 'Sam';
  state.preferences.sound = true;
  state.muted.push('fietsatelier');
  addReply(state, 'studio-noord', 'Bedankt!');
  const restored = restoreState(JSON.stringify(state));
  assert.equal(restored.name, 'Sam');
  assert.equal(restored.preferences.sound, true);
  assert.deepEqual(restored.muted, ['fietsatelier']);
  assert.equal(restored.replies['studio-noord'][0].text, 'Bedankt!');
  assert.equal(restored.replies['studio-noord'][0].local, true);
  assert.equal(totalUnread(restored), 1);
});

test('corrupt or incompatible storage starts safely and invalid messages are discarded', () => {
  for (const raw of [null, 'broken JSON', '{}', '{"version":99}']) {
    assert.equal(restoreState(raw).name, 'Robin');
  }
  const restored = restoreState(JSON.stringify({ version: 1, startedAt: 1e30, read: ['unknown', 'studio-noord'], replies: { 'studio-noord': [null, { text: 'a'.repeat(1025), at: Date.now() }, { text: 'valid', at: 1e30 }, { text: 'valid', at: Date.now() }] } }));
  assert.ok(Number.isFinite(new Date(restored.startedAt).getTime()));
  assert.deepEqual(restored.read, ['studio-noord']);
  assert.equal(restored.replies['studio-noord'].length, 1);
});

test('search is case insensitive and the unread filter reflects opened conversations', () => {
  const state = freshState();
  assert.equal(conversationsFor(state, { query: 'STUDIO' })[0].id, 'studio-noord');
  assert.equal(conversationsFor(state, { unreadOnly: true }).length, 2);
  state.read.push('studio-noord', 'fietsatelier');
  assert.equal(conversationsFor(state, { unreadOnly: true }).length, 0);
  assert.equal(conversationsFor(state).length, 3);
  assert.equal(conversationsFor(state, { query: 'onbekend bedrijf' }).length, 0);
});

test('user supplied content is escaped before rendering HTML', () => {
  const escaped = escapeHtml('<img src=x onerror="alert(1)"> & \'quoted\'');
  assert.equal(escaped.includes('<'), false);
  assert.equal(escaped.includes('>'), false);
  assert.ok(escaped.includes('&quot;'));
  assert.ok(escaped.includes('&#39;'));
});
