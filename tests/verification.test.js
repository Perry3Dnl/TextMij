import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, restoreState, hasDemoVerification, setDemoVerification, VERIFY_PRICE_EUR, contactsFor } from '../public/model.js';

test('verification preview defaults to off and costs 20 euro', () => {
 const state = freshState();
 assert.equal(VERIFY_PRICE_EUR, 20);
 assert.equal(hasDemoVerification(state), false);
 assert.equal(contactsFor(state, 'personal')[0].name, 'Studio Noord');
});
test('demo verification is explicitly reversible and survives reload', () => {
 const state = freshState();
 assert.equal(setDemoVerification(state, true), true);
 assert.equal(hasDemoVerification(restoreState(JSON.stringify(state))), true);
 assert.equal(setDemoVerification(state, false), true);
 assert.equal(hasDemoVerification(restoreState(JSON.stringify(state))), false);
});
test('corrupt or legacy verification state never grants a badge', () => {
 const state = freshState();
 state.business.demoVerification = 'verified';
 assert.equal(hasDemoVerification(restoreState(JSON.stringify(state))), false);
 delete state.business.demoVerification;
 assert.equal(hasDemoVerification(restoreState(JSON.stringify(state))), false);
});
