import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpeningHours,openingHoursFields,readOpeningHours } from '../public/opening-hours.js';

test('legacy opening hours are interpreted as time ranges, not arbitrary text', () => {
  assert.deepEqual(parseOpeningHours('09:00–17:30'), {open:true,start:'09:00',end:'17:30'});
  assert.deepEqual(parseOpeningHours('09:00 - 17:30'), {open:true,start:'09:00',end:'17:30'});
  assert.equal(parseOpeningHours('xcvscsaf').open,false);
  assert.equal(parseOpeningHours('Gesloten').open,false);
  assert.equal(parseOpeningHours('25:00–17:00').open,false);
});
test('editor uses native time inputs and closed-day toggles', () => {
  const markup=openingHoursFields({Maandag:'08:30–16:45',Dinsdag:'Gesloten'});
  assert.equal((markup.match(/type="time"/g)||[]).length,14);
  assert.match(markup,/id="hours-start-Maandag" value="08:30"/);
  assert.match(markup,/id="hours-end-Maandag" value="16:45"/);
  assert.match(markup,/data-hours-open="Dinsdag"/);
  assert.match(markup,/id="hours-start-Dinsdag" value="09:00" disabled/);
});
test('saving serializes selected times and closed days', () => {
  const root={querySelector(selector){
    if (selector==='[data-hours-open="Maandag"]')return {checked:true};
    if (selector==='[id="hours-start-Maandag"]')return {value:'08:30'};
    if (selector==='[id="hours-end-Maandag"]')return {value:'16:45'};
    return {checked:false};
  }};
  const result=readOpeningHours(root);
  assert.equal(result.Maandag,'08:30–16:45');
  assert.equal(result.Dinsdag,'Gesloten');
  assert.equal(Object.keys(result).length,7);
});
test('invalid time values cannot be saved',()=>{
  const root={querySelector(selector){
    if(selector.includes('data-hours-open'))return {checked:true};
    if(selector.includes('hours-start'))return {value:'25:00'};
    return {value:'17:00'};
  }};
  assert.throws(()=>readOpeningHours(root),/geldige begin- en eindtijd/);
});
