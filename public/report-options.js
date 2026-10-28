export const REPORT_REASONS = Object.freeze([
  { id:'impersonation',label:'Doet zich voor als een ander bedrijf' },
  { id:'scam',label:'Oplichting of verdachte verzoeken' },
  { id:'spam',label:'Spam of ongewenste reclame' },
  { id:'abuse',label:'Belediging, intimidatie of bedreiging' },
  { id:'misleading',label:'Misleidende bedrijfsinformatie' },
  { id:'other',label:'Iets anders' },
]);
export const USER_REPORT_REASONS=Object.freeze(REPORT_REASONS.filter(reason=>reason.id!=='misleading').map(reason=>reason.id==='impersonation'?{...reason,label:'Doet zich voor als iemand anders'}:reason));
export const REPORT_DETAILS_LIMIT = 2000;
export function validateReport(reason,details) {
  if(!REPORT_REASONS.some(item=>item.id===reason)) return 'Kies een reden voor je melding.';
  if(typeof details!=='string' || Array.from(details).length>REPORT_DETAILS_LIMIT)
    return 'Gebruik maximaal 2000 tekens voor je toelichting.';
  if(reason==='other' && !details.trim()) return 'Vertel kort waarom je dit contact meldt.';
  return null;
}
