import test from 'node:test';
import assert from 'node:assert/strict';
import {icon} from '../public/icons.js';

test('pin action and pinned badges render a recognizable upright pushpin',()=>{
  const svg=icon('pin');
  assert.match(svg, /M12 17v5/); // straight downward point
  assert.match(svg, /M9 10\.76/); // conventional pushpin head
  assert.doesNotMatch(svg, /m16 3 5 5/); // former crooked nail design
  assert.match(svg, /aria-hidden="true"/);
});
