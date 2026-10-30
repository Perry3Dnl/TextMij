import { PROFILE_DAYS,escapeHtml } from './model.js';

const VALID_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function parseOpeningHours(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = raw.match(/^([0-2]\d:[0-5]\d)\s*[-–—]\s*([0-2]\d:[0-5]\d)$/);
  if (match && VALID_TIME.test(match[1]) && VALID_TIME.test(match[2]))
    return { open: true, start: match[1], end: match[2] };
  return { open: false, start: '09:00', end: '17:00' };
}

export function openingHoursFields(hours = {}) {
  return PROFILE_DAYS.map(day => {
    const {open,start,end} = parseOpeningHours(hours[day]);
    const key = escapeHtml(day);
    return '<div class="company-hour-editor"><label class="company-hour-heading"><span>'+key+'</span><span class="company-hour-toggle"><input type="checkbox" data-hours-open="'+key+'" '+(open?'checked':'')+'> Open</span></label>'+
      '<div class="company-hour-time-row"><label>Van<input class="text-input" type="time" id="hours-start-'+key+'" value="'+start+'" '+(open?'':'disabled')+' required></label>'+
      '<label>Tot<input class="text-input" type="time" id="hours-end-'+key+'" value="'+end+'" '+(open?'':'disabled')+' required></label></div></div>';
  }).join('');
}

export function syncOpeningHours(target) {
  if (!target?.matches?.('[data-hours-open]')) return;
  const row = target.closest('.company-hour-editor');
  if (!row) return;
  row.querySelectorAll('input[type="time"]').forEach(input => { input.disabled = !target.checked; });
}

export function readOpeningHours(root = document) {
  return Object.fromEntries(PROFILE_DAYS.map(day => {
    const open = root.querySelector('[data-hours-open="'+day+'"]');
    if (!open?.checked) return [day, 'Gesloten'];
    const start = root.querySelector('[id="hours-start-'+day+'"]')?.value;
    const end = root.querySelector('[id="hours-end-'+day+'"]')?.value;
    if (!VALID_TIME.test(start || '') || !VALID_TIME.test(end || '')) throw new Error('Kies voor '+day+' een geldige begin- en eindtijd.');
    if (start === end) throw new Error('Begin- en eindtijd mogen niet gelijk zijn ('+day+').');
    return [day, start+'–'+end];
  }));
}
