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
};

export function byteLength(text) {
  return new TextEncoder().encode(text).byteLength;
}

export function validateReply(text, limit = MESSAGE_LIMITS.customer) {
  if (!text.trim()) return 'Schrijf eerst een bericht.';
  if (byteLength(text) > limit) return `Je bericht is te groot. Maximaal ${limit} bytes.`;
  return null;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function freshState(now = Date.now()) {
  return { version: 1, name: 'Robin', startedAt: now, preferences: { notifications: true, sound: false, previews: true }, read: [], muted: [], replies: {} };
}

export function restoreState(raw, now = Date.now()) {
  const fallback = freshState(now);
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return fallback;
    const ids = new Set(businesses.map((business) => business.id));
    const validTime = (value) => Number.isFinite(value) && !Number.isNaN(new Date(value).getTime());
    const state = freshState(validTime(data.startedAt) ? data.startedAt : now);
    if (typeof data.name === 'string' && data.name.trim()) state.name = Array.from(data.name.trim()).slice(0, 60).join('');
    for (const key of Object.keys(state.preferences)) {
      if (typeof data.preferences?.[key] === 'boolean') state.preferences[key] = data.preferences[key];
    }
    for (const key of ['read', 'muted']) {
      if (Array.isArray(data[key])) state[key] = [...new Set(data[key].filter((id) => ids.has(id)))];
    }
    for (const id of ids) {
      if (!Array.isArray(data.replies?.[id])) continue;
      state.replies[id] = data.replies[id].filter((message) =>
        typeof message?.text === 'string' && !validateReply(message.text) && validTime(message.at)
      ).map((message, index) => ({ id: `local-${id}-${index}`, from: 'customer', text: message.text, at: message.at, local: true })).slice(-200);
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

export function unreadFor(id, state) {
  return state.read.includes(id) ? 0 : businesses.find((business) => business.id === id)?.unread || 0;
}

export function totalUnread(state) {
  return businesses.reduce((count, business) => count + unreadFor(business.id, state), 0);
}

export function conversationsFor(state, { query = '', unreadOnly = false } = {}) {
  const search = query.toLocaleLowerCase('nl').trim();
  return businesses.map((business) => {
    const messages = messagesFor(business.id, state);
    return { ...business, last: messages.at(-1), unread: unreadFor(business.id, state) };
  }).filter((business) => {
    const haystack = `${business.name} ${business.last.title || ''} ${business.last.text}`.toLocaleLowerCase('nl');
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
  if (!state.read.includes(id)) state.read.push(id);
  return null;
}
