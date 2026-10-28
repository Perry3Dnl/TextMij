import { icon } from './icons.js';

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
