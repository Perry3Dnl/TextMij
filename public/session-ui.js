import { icon } from './icons.js';
import { escapeHtml as html } from './model.js';

export function conversationControls({id,pinned,note,blocked,targetKind}) {
  const target=targetKind==='business'?'Bedrijf':'Gebruiker';
  const action=(symbol,title,description,name,extra='')=>'<button type="button" class="conversation-action" aria-label="'+html(title)+'" data-action="'+name+'" data-id="'+html(id)+'" '+extra+'>'+icon(symbol)+'<span><strong>'+title+'</strong><small>'+description+'</small></span>'+icon('arrow')+'</button>';
  return '<div class="conversation-actions" role="group" aria-label="Gespreksacties">'+
    action('pin',pinned?'Gesprek losmaken':'Gesprek vastzetten','Bovenaan je gesprekkenlijst. Alleen op dit apparaat.','pin-chat','aria-pressed="'+Boolean(pinned)+'"')+
    action('download','Chat opslaan','Download de geschiedenis van dit apparaat als tekstbestand.','export-chat')+
    action('block',target+(blocked?' deblokkeren':' blokkeren'),blocked?'Sta nieuwe berichten weer toe.':'Stop nieuwe berichten in beide richtingen.','block-chat')+
    action('flag',target+' melden','Stuur een privémelding naar Conappt.','report')+'</div>'+
    '<form id="conversation-note-form" data-id="'+html(id)+'" class="conversation-note-form"><label class="field-label" for="conversation-note">Privénotitie</label><p class="field-help">Alleen voor jou op dit apparaat. Wordt niet met je contact gedeeld.</p><textarea class="text-input" id="conversation-note" name="note" rows="4" maxlength="2000" placeholder="Voeg een notitie bij dit gesprek toe…">'+html(note||'')+'</textarea><button class="button" type="submit">Notitie opslaan</button><p class="form-error" role="alert" data-error hidden></p></form>';
}

export const settingsDialog = document.querySelector('#settings-dialog');
document.body.classList.add('session-app');

export function closeSettings() {
  if (settingsDialog.open) settingsDialog.close();
}

export function showSettings(content, title = 'Instellingen') {
  const previous = settingsDialog.querySelector(':focus');
  const action = previous?.dataset.action, id = previous?.dataset.id;
  settingsDialog.innerHTML = '<header class="settings-overlay-header"><h2 id="settings-heading">'+title+'</h2><button class="icon-button" type="button" data-action="close-settings" aria-label="Instellingen sluiten" autofocus>'+icon('close')+'</button></header><div class="settings-overlay-content">'+content+'</div>';
  if (!settingsDialog.open) settingsDialog.showModal();
  else if (action) [...settingsDialog.querySelectorAll('[data-action]')].find(el => el.dataset.action === action && el.dataset.id === id)?.focus();
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-action="close-settings"]')) closeSettings();
  if (event.target.closest('#settings-dialog a[href^="#"]')) closeSettings();
});
settingsDialog.addEventListener('click', event => {
  if (event.target !== settingsDialog) return;
  const r = settingsDialog.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeSettings();
});
window.addEventListener('hashchange', closeSettings);
