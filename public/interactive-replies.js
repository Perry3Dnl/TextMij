import { byteLength } from './model.js';

// Reply choices travel inside the encrypted message body, never as unencrypted metadata.
export const APPROVAL_REPLIES = Object.freeze([
  {label:'Ja',text:'Ja, ik ga akkoord.'},
  {label:'Nee',text:'Nee, ik ga niet akkoord.'},
  {label:'Andere opties?',text:'Welke andere opties zijn er?'},
]);

export function validateReplyOptions(options) {
  if (options == null) return [];
  if (!Array.isArray(options) || options.length > 3) throw new TypeError('Kies maximaal drie antwoordopties.');
  return options.map(option => {
    if (!option || typeof option !== 'object' || Array.isArray(option) ||
        typeof option.label !== 'string' || typeof option.text !== 'string') throw new TypeError('Ongeldige antwoordoptie.');
    const label=option.label.trim(),text=option.text.trim();
    if (!label || !text || Array.from(label).length > 35 || byteLength(text) > 1024)
      throw new TypeError('Antwoordknoppen hebben een naam en een geldig antwoord nodig.');
    return {label,text};
  });
}

export function replyButtons(message, disabled=false) {
  if (message.own || !Array.isArray(message.replyOptions) || !message.replyOptions.length) return '';
  let replies;
  try { replies=validateReplyOptions(message.replyOptions); } catch { return ''; }
  return '<div class="message-reply-options" aria-label="Snel antwoorden">'+replies.map((reply,index)=>
    '<button type="button" class="button secondary message-reply-button" data-action="send-reply-option" data-message-id="'+String(message.id).replace(/[^a-zA-Z0-9-]/g,'')+'" data-index="'+index+'" '+(disabled?'disabled':'')+'>'+reply.label.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</button>').join('')+'</div>';
}
