export const STORAGE_KEY = 'textmij.preview.v1';
export const DEMO_CODE = '7483-RGY-RCH';
// Independent limits: increasing one must never change the other.
export const MESSAGE_LIMITS = Object.freeze({ business: 1024, customer: 1024 });

export const businesses = Object.freeze([
  { id: 'studio-noord', name: 'Studio Noord', initials: 'N', color: 'lilac', category: 'Afspraken & advies', lastLabel: 'Afspraak bevestigd', unread: 2 },
  { id: 'fietsatelier', name: 'Het Fietsatelier', initials: 'f.', color: 'peach', category: 'Onderhoud & reparatie', lastLabel: 'Je fiets staat klaar', unread: 1 },
  { id: 'pakket-co', name: 'Pakket & Co', initials: 'p', color: 'sage', category: 'Bestellingen & bezorging', lastLabel: 'Je pakket is onderweg', unread: 0 },
]);

const seedMessages = {
  'studio-noord': [
    { id: 'noord-1', from: 'business', title: 'Welkom bij Studio Noord', text: 'Fijn dat we je hier kunnen bereiken. Je ontvangt in dit gesprek de updates over je afspraak.', ago: 1560 },
    { id: 'noord-2', from: 'customer', text: 'Handig, dank je wel!', ago: 1550 },
    { id: 'noord-3', from: 'business', title: 'Afspraak bevestigd', text: 'Je afspraak staat in de agenda.\n\nDonderdag 29 oktober · 14:30 uur\nStudio Noord · Stationsstraat 12\n\nKomt er iets tussen? Laat het ons hier gerust weten.', ago: 24 },
    { id: 'noord-4', from: 'business', title: 'Goed om te weten', text: 'Je hoeft niets mee te nemen. De koffie staat voor je klaar. Tot donderdag!', ago: 22 },
  ],
  fietsatelier: [
    { id: 'fiets-1', from: 'business', title: 'We gaan voor je aan de slag', text: 'Je fiets is bij ons in goede handen. Zodra het onderhoud klaar is, krijg je hier een bericht.', ago: 290 },
    { id: 'fiets-2', from: 'business', title: 'Je fiets staat klaar', text: 'Alles loopt weer soepel! Je kunt je fiets vandaag tot 18:00 uur ophalen.\n\nDe ketting is afgesteld en de remmen zijn nagekeken. Tot zo!', ago: 85 },
  ],
  'pakket-co': [
    { id: 'pakket-1', from: 'business', title: 'Bestelling ontvangen', text: 'Bedankt voor je bestelling. We houden je in dit gesprek op de hoogte van je pakket.', ago: 2800 },
    { id: 'pakket-2', from: 'business', title: 'Je pakket is onderweg', text: 'Je bestelling is ingepakt en meegegeven aan de bezorger. Je ontvangt hier een update zodra we meer weten.', ago: 230 },
  ],
  'customer-sam': [
    { id: 'sam-1', from: 'business', title: 'Afspraak bevestigd', text: 'Je afspraak staat in de agenda. We zien je donderdag om 11:00 uur. Heb je vooraf nog een vraag? Stuur gerust een bericht.', ago: 130 },
    { id: 'sam-2', from: 'customer', text: 'Dank je! Kan ik ook iets eerder langskomen?', ago: 8 },
  ],
  'customer-noa': [
    { id: 'noa-1', from: 'business', title: 'Je bestelling ligt klaar', text: 'Goed nieuws: je bestelling ligt voor je klaar. Je kunt hem vandaag tot 17:30 uur ophalen.', ago: 190 },
    { id: 'noa-2', from: 'customer', text: 'Fijn, ik kom hem vanmiddag ophalen. Bedankt!', ago: 65 },
  ],
};

export function byteLength(text) {
  return new TextEncoder().encode(text).byteLength;
}

export function validateReply(text, limit = MESSAGE_LIMITS.customer) {
  if (!text.trim()) return 'Schrijf eerst een bericht.';
  if (byteLength(text) > limit) return `Je bericht is te groot. Maximaal ${limit} bytes.`;
  return null;
}

export function validateBusinessMessage(title, text, limit = MESSAGE_LIMITS.business) {
  if (!title.trim()) return 'Vul een titel in.';
  if (!text.trim()) return 'Schrijf eerst een bericht.';
  if (byteLength(title) + byteLength(text) > limit) return `Titel en bericht zijn samen te groot. Maximaal ${limit} bytes.`;
  return null;
}

export function normaliseCode(code) {
  return String(code).trim().toUpperCase().replace(/[–—]/g, '-').replace(/\s/g, '');
}

export function contactsFor(state, mode = state.mode) {
  if (mode !== 'business') {
    return businesses.map((business) => business.id === 'studio-noord' ? {
      ...business, name: state.business.name,
      initials: state.business.name === 'Studio Noord' ? 'N' : Array.from(state.business.name)[0].toLocaleUpperCase('nl'),
    } : business);
  }
  return [
    { id: 'studio-noord', name: state.name, code: DEMO_CODE, initials: Array.from(state.name)[0].toLocaleUpperCase('nl'), color: 'sage', category: `Klant · ${DEMO_CODE}`, unread: 0 },
    { id: 'customer-sam', name: 'Sam Vermeer', code: '6291-KVN-DPT', initials: 'SV', color: 'lilac', category: 'Klant · 6291-KVN-DPT', unread: 1 },
    { id: 'customer-noa', name: 'Noa de Wit', code: '3158-HMK-SWB', initials: 'NW', color: 'peach', category: 'Klant · 3158-HMK-SWB', unread: 1 },
    ...state.customers,
  ];
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function freshState(now = Date.now()) {
  return {
    version: 1, mode: 'personal', name: 'Robin', startedAt: now,
    business: { name: 'Studio Noord', email: 'hallo@studio-noord.example' },
    preferences: { notifications: true, sound: false, previews: true },
    read: [], readBusiness: [], muted: [], mutedBusiness: [],
    unreadPersonal: {}, unreadBusiness: {}, customers: [], replies: {},
  };
}

export function restoreState(raw, now = Date.now()) {
  const fallback = freshState(now);
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return fallback;
    const validTime = (value) => Number.isFinite(value) && !Number.isNaN(new Date(value).getTime());
    const state = freshState(validTime(data.startedAt) ? data.startedAt : now);
    if (data.mode === 'business') state.mode = 'business';
    if (typeof data.name === 'string' && data.name.trim()) state.name = Array.from(data.name.trim()).slice(0, 60).join('');
    if (typeof data.business?.name === 'string' && data.business.name.trim()) state.business.name = Array.from(data.business.name.trim()).slice(0, 80).join('');
    if (typeof data.business?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.business.email) && data.business.email.length <= 254) state.business.email = data.business.email;
    if (Array.isArray(data.customers)) {
      const knownCodes = new Set(contactsFor(state, 'business').map((customer) => customer.code));
      for (const customer of data.customers.slice(0, 200)) {
        if (typeof customer?.code !== 'string' || typeof customer.name !== 'string') continue;
        const code = normaliseCode(customer.code);
        if (!/^\d{4}-[A-Z]{3}-[A-Z]{3}$/.test(code) || knownCodes.has(code)) continue;
        const name = Array.from(customer.name.trim()).slice(0, 60).join('') || `Klant ${code.slice(0, 4)}`;
        state.customers.push({ id: `client-${code.toLowerCase()}`, name, code, initials: Array.from(name)[0].toLocaleUpperCase('nl'), color: 'sage', category: `Klant · ${code}`, unread: 0, addedAt: validTime(customer.addedAt) ? customer.addedAt : now });
        knownCodes.add(code);
      }
    }
    const ids = new Set([...contactsFor(state, 'personal'), ...contactsFor(state, 'business')].map((contact) => contact.id));
    for (const key of Object.keys(state.preferences)) {
      if (typeof data.preferences?.[key] === 'boolean') state.preferences[key] = data.preferences[key];
    }
    for (const key of ['read', 'readBusiness', 'muted', 'mutedBusiness']) {
      if (Array.isArray(data[key])) state[key] = [...new Set(data[key].filter((id) => ids.has(id)))];
    }
    for (const key of ['unreadPersonal', 'unreadBusiness']) {
      for (const id of ids) {
        const value = data[key]?.[id];
        if (Number.isInteger(value) && value >= 0 && value <= 9999) state[key][id] = value;
      }
    }
    for (const id of ids) {
      if (!Array.isArray(data.replies?.[id])) continue;
      state.replies[id] = data.replies[id].filter((message) => {
        if (typeof message?.text !== 'string' || !validTime(message.at)) return false;
        return message.from === 'business' ? typeof message.title === 'string' && !validateBusinessMessage(message.title, message.text) : !validateReply(message.text);
      }).map((message, index) => ({ id: `local-${id}-${index}`, from: message.from === 'business' ? 'business' : 'customer', ...(message.from === 'business' ? { title: message.title } : {}), text: message.text, at: message.at, local: true })).slice(-200);
    }
    return state;
  } catch {
    return fallback;
  }
}

export function messagesFor(id, state) {
  return [
    ...(seedMessages[id] || []).map(({ ago, ...message }) => ({ ...message, at: state.startedAt - ago * 60_000 })),
    ...(state.replies[id] || []),
  ];
}

export function unreadFor(id, state, mode = state.mode) {
  const read = mode === 'business' ? state.readBusiness : state.read;
  if (read.includes(id)) return 0;
  const counts = mode === 'business' ? state.unreadBusiness : state.unreadPersonal;
  return counts[id] ?? contactsFor(state, mode).find((contact) => contact.id === id)?.unread ?? 0;
}

export function totalUnread(state) {
  return contactsFor(state).reduce((count, contact) => count + unreadFor(contact.id, state), 0);
}

export function markRead(state, id, mode = state.mode) {
  const key = mode === 'business' ? 'readBusiness' : 'read';
  if (!state[key].includes(id)) state[key].push(id);
}

function notifyOtherRole(state, id, mode) {
  if (!contactsFor(state, mode).some((contact) => contact.id === id)) return;
  const countKey = mode === 'business' ? 'unreadBusiness' : 'unreadPersonal';
  const readKey = mode === 'business' ? 'readBusiness' : 'read';
  state[countKey][id] = unreadFor(id, state, mode) + 1;
  state[readKey] = state[readKey].filter((value) => value !== id);
}

export function conversationsFor(state, { query = '', unreadOnly = false } = {}) {
  const search = query.toLocaleLowerCase('nl').trim();
  return contactsFor(state).map((business) => {
    const messages = messagesFor(business.id, state);
    return { ...business, hasMessages: messages.length > 0, last: messages.at(-1) || { from: 'business', title: '', text: 'Nog geen berichten', at: business.addedAt || state.startedAt }, unread: unreadFor(business.id, state) };
  }).filter((business) => {
    const haystack = `${business.name} ${business.code || ''} ${business.last.title || ''} ${business.last.text}`.toLocaleLowerCase('nl');
    return (!unreadOnly || business.unread > 0) && (!search || haystack.includes(search));
  }).sort((a, b) => b.last.at - a.last.at);
}

export function addReply(state, id, text, now = Date.now()) {
  if (!businesses.some((business) => business.id === id)) return 'Dit gesprek bestaat niet.';
  const error = validateReply(text);
  if (error) return error;
  if (!state.replies[id]) state.replies[id] = [];
  state.replies[id].push({ id: `local-${id}-${now}`, from: 'customer', text: text.trim(), at: now, local: true });
  state.replies[id] = state.replies[id].slice(-200);
  markRead(state, id, 'personal');
  notifyOtherRole(state, id, 'business');
  return null;
}

export function addBusinessMessage(state, id, title, text, now = Date.now()) {
  if (!contactsFor(state, 'business').some((contact) => contact.id === id)) return 'Deze klant bestaat niet.';
  const error = validateBusinessMessage(title, text);
  if (error) return error;
  if (!state.replies[id]) state.replies[id] = [];
  state.replies[id].push({ id: `local-business-${id}-${now}`, from: 'business', title: title.trim(), text: text.trim(), at: now, local: true });
  state.replies[id] = state.replies[id].slice(-200);
  markRead(state, id, 'business');
  notifyOtherRole(state, id, 'personal');
  return null;
}

export function addCustomer(state, rawCode, rawName = '', now = Date.now()) {
  const code = normaliseCode(rawCode);
  if (!/^\d{4}-[A-Z]{3}-[A-Z]{3}$/.test(code)) return { error: 'Gebruik een code zoals 7483-RGY-RCH.' };
  const existing = contactsFor(state, 'business').find((contact) => contact.code === code);
  if (existing) return { id: existing.id, created: false };
  if (state.customers.length >= 200) return { error: 'Deze voorbeeldomgeving bevat maximaal 200 eigen klantgesprekken.' };
  const name = Array.from(rawName.trim()).slice(0, 60).join('') || `Klant ${code.slice(0, 4)}`;
  const id = `client-${code.toLowerCase()}`;
  state.customers.push({ id, name, code, initials: Array.from(name)[0].toLocaleUpperCase('nl'), color: 'sage', category: `Klant · ${code}`, unread: 0, addedAt: now });
  return { id, created: true };
}
