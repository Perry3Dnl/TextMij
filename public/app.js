import {
  STORAGE_KEY, DEMO_CODE, MESSAGE_LIMITS, freshState, restoreState, contactsFor,
  escapeHtml as html, byteLength, validateReply, validateBusinessMessage, messagesFor,
  conversationsFor, totalUnread, addReply, addBusinessMessage, addCustomer, markRead,
  VERIFY_PRICE_EUR, hasDemoVerification, setDemoVerification,
  BUSINESS_THEMES, businessThemeFor, setBusinessTheme, PROFILE_DAYS, cleanBusinessProfile,
} from './model.js';

const paths = {
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 21v-8h6v8"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8Z"/><path d="M8 10h8M8 14h5"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m9 3-.8 2.3-2 .9-2.3-.3-1.8 3.2 1.5 1.9v2l-1.5 1.9 1.8 3.2 2.3-.3 2 .9L9 21h6l.8-2.3 2-.9 2.3.3 1.8-3.2-1.5-1.9v-2l1.5-1.9-1.8-3.2-2.3.3-2-.9L15 3Z"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>',
  share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  bellOff: '<path d="m3 3 18 18M10 21h4M6.4 6.4A6 6 0 0 0 6 8c0 7-3 7-3 9h14M10 2.4A6 6 0 0 1 18 8c0 2 .3 3.5.7 4.6"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  send: '<path d="m21 3-7 18-4-7-7-4L21 3Zm0 0L10 14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  leaf: '<path d="M20 4c-8-2-15 2-15 8a6 6 0 0 0 6 6c6 0 9-7 9-14ZM4 21l10-10"/>',
  business: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a20 20 0 0 0 18 0M12 11v4"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

function icon(name, className = '') {
  return `<svg class="${className}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.info}</svg>`;
}

let raw;
try { raw = localStorage.getItem(STORAGE_KEY); } catch { /* Private browsing can restrict storage. */ }
let state = restoreState(raw);
let query = '';
let unreadOnly = false;
let editingCompanyProfile = false;
const drafts = new Map();
const titleDrafts = new Map();
const main = document.querySelector('#main');
const dialog = document.querySelector('#app-dialog');
let toastTimer;
const isBusiness = () => state.mode === 'business';
const draftKey = (id) => `${state.mode}:${id}`;
const contactFor = (id) => contactsFor(state).find((contact) => contact.id === id);
const mutedChats = () => isBusiness() ? state.mutedBusiness : state.muted;

function toast(message) {
  const element = document.querySelector('#toast');
  clearTimeout(toastTimer);
  element.textContent = message;
  element.classList.add('visible');
  toastTimer = setTimeout(() => element.classList.remove('visible'), 3400);
}

function persist(notify = true) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    if (notify) toast('Opslaan op dit apparaat lukt niet. Je wijzigingen blijven in dit tabblad beschikbaar.');
    return false;
  }
}
persist(false);

function route() {
  const hash = location.hash.slice(1) || 'home';
  const [page, id] = hash.split('/');
  return { page, id };
}

function avatar(business, extra = '') {
  if (!isBusiness() && business.id === 'studio-noord' && state.business.profile.logo) {
    return `<img class="avatar company-avatar ${extra}" src="${state.business.profile.logo}" alt="" aria-hidden="true">`;
  }
  return `<span class="avatar ${business.color} ${extra}" aria-hidden="true">${html(business.initials)}</span>`;
}

function verificationLabel() {
  return hasDemoVerification(state) ? '<span class="verification-outline" title="Demo: identiteit niet gecontroleerd">Demo-verificatie</span>' : '';
}

function previewPill() {
  return '<span class="preview-pill"><span></span>Voorbeeldmodus</span>';
}

function previewNote() {
  return `<p class="preview-note">${icon('info')}<span>Je bekijkt voorbeeldgesprekken. Reacties en voorkeuren worden alleen in deze browser bewaard; er worden nog geen berichten bezorgd.</span></p>`;
}

function pageHeader(title, subtitle, eyebrow = 'FIJN DAT JE ER BENT') {
  return `<header class="page-header"><div><p class="eyebrow">${html(eyebrow)}</p><h1>${html(title)}</h1><p class="page-subtitle">${html(subtitle)}</p></div><div class="header-tools">${previewPill()}<a class="icon-button" href="#instellingen" aria-label="Meldingsinstellingen">${icon('bell')}</a></div></header>`;
}

function updateNavigation() {
  const { page } = route();
  const active = page === 'gesprek' ? 'gesprekken' : page;
  const count = totalUnread(state);
  const links = [ ['home', 'Home', 'home'], ['gesprekken', 'Gesprekken', 'chat'], ['instellingen', 'Instellingen', 'settings'] ];
  const markup = links.map(([id, title, symbol]) => `<a class="nav-link ${active === id ? 'active' : ''}" href="#${id}" ${active === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${title}</span>${id === 'gesprekken' && count ? `<span class="nav-badge" aria-label="${count} ongelezen berichten">${count}</span>` : ''}</a>`).join('');
  document.querySelector('.desktop-navigation').innerHTML = markup;
  document.querySelector('.mobile-navigation').innerHTML = markup;
  const profileName = isBusiness() ? state.business.name : state.name;
  document.querySelectorAll('[data-profile-name]').forEach((element) => { element.textContent = profileName; });
  document.querySelectorAll('[data-profile-initial]').forEach((element) => { element.textContent = Array.from(profileName)[0]?.toLocaleUpperCase('nl') || 'J'; });
  document.querySelectorAll('[data-profile-role]').forEach((element) => { element.textContent = isBusiness() ? 'Zakelijk · wissel account' : 'Persoonlijk · wissel account'; });
  document.querySelectorAll('[data-mode-label]').forEach((element) => { element.textContent = isBusiness() ? 'Zakelijk' : 'Persoonlijk'; });
  document.querySelectorAll('[data-mode-icon]').forEach((element) => { element.innerHTML = icon(isBusiness() ? 'business' : 'person'); });
}

function shortTime(timestamp) {
  const date = new Date(timestamp);
  if (date.toDateString() === new Date().toDateString()) return new Intl.DateTimeFormat('nl', { hour: '2-digit', minute: '2-digit' }).format(date);
  return new Intl.DateTimeFormat('nl', { day: 'numeric', month: 'short' }).format(date);
}

function dayLabel(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Vandaag';
  if (date.toDateString() === yesterday.toDateString()) return 'Gisteren';
  return new Intl.DateTimeFormat('nl', { day: 'numeric', month: 'long' }).format(date);
}

function conversationRow(business) {
  const last = business.last;
  const outgoing = isBusiness() ? last.from === 'business' : last.from === 'customer';
  const preview = !business.hasMessages ? 'Nog geen berichten' : `${outgoing ? 'Jij: ' : ''}${last.title || last.text}`;
  return `<a class="conversation-row ${business.unread ? 'has-unread' : ''}" href="#gesprek/${business.id}" aria-label="Gesprek met ${html(business.name)}${business.unread ? `, ${business.unread} ongelezen berichten` : ''}">
    ${avatar(business)}<div class="conversation-copy"><div class="conversation-top"><span class="conversation-name">${html(business.name)}${!isBusiness() && business.id === 'studio-noord' ? verificationLabel() : ''}</span><time class="conversation-time" datetime="${new Date(last.at).toISOString()}">${shortTime(last.at)}</time></div><div class="conversation-bottom"><span class="conversation-preview">${html(preview)}</span>${mutedChats().includes(business.id) ? icon('bellOff', 'muted-icon') : ''}${business.unread ? `<span class="unread-badge" aria-hidden="true">${business.unread}</span>` : ''}</div></div></a>`;
}

function renderHome() {
  const recent = conversationsFor(state).slice(0, 3);
  main.innerHTML = `${pageHeader(`Hoi ${state.name},`, 'Jouw berichten. Lekker overzichtelijk.')}
    <div class="home-grid">
      <section class="card code-card" aria-labelledby="code-heading"><div class="card-heading"><h2 class="card-label" id="code-heading">JOUW TEXTMIJ-CODE</h2><span class="sample-label">Voorbeeld</span></div><p class="code-description">Eén code voor al je zakelijke berichten.<br>Deel hem met een bedrijf en blijf op de hoogte.</p><div class="device-code" aria-label="Voorbeeldcode ${DEMO_CODE}"><span>7483</span><span class="code-dash">–</span><span>RGY</span><span class="code-dash">–</span><span>RCH</span></div><div class="code-actions"><button class="button" data-action="copy-code" aria-label="Kopieer voorbeeldcode">${icon('copy')}Kopieer code</button><button class="button secondary" data-action="share-code" aria-label="Deel voorbeeldcode">${icon('share')}Delen</button></div><div class="device-note">${icon('phone')}Een eigen code per toestel</div></section>
      <div class="home-secondary"><section class="card how-card" aria-labelledby="how-heading"><h2 id="how-heading">Klein gebaar, korte lijntjes.</h2><ol class="how-list"><li><span class="step-number">1</span><div><strong>Deel je code</strong><p>Geef je Conappt-code aan een bedrijf.</p></div></li><li><span class="step-number">2</span><div><strong>Ontvang een update</strong><p>Van een bevestiging tot goed nieuws.</p></div></li><li><span class="step-number">3</span><div><strong>Reageer gewoon hier</strong><p>Een vraag of bedankje? Zo geregeld.</p></div></li></ol></section><section class="card quiet-card"><div class="icon-orbit">${icon('leaf')}</div><h3>Jouw inbox. Jouw rust.</h3><p>Jij bepaalt welke meldingen je wilt ontvangen.</p><a class="text-link" href="#instellingen">Pas je voorkeuren aan ${icon('arrow')}</a></section></div>
      <section class="home-recent" aria-labelledby="recent-heading"><div class="section-heading"><h2 id="recent-heading">Je laatste gesprekken</h2><a class="text-link" href="#gesprekken">Bekijk alles ${icon('arrow')}</a></div><div class="card conversation-list">${recent.map(conversationRow).join('')}</div></section>
    </div>${previewNote()}`;
}

function renderInbox() {
  const business = isBusiness();
  main.innerHTML = `${pageHeader(business ? 'Klantgesprekken' : 'Gesprekken', business ? 'Je klanten dichtbij. Alles gewoon vanuit de app.' : 'Alle bedrijven op één plek. Jij houdt het overzicht.', business ? 'JOUW BEDRIJF' : 'KORTE LIJNTJES')}
    <div class="inbox-toolbar"><div class="search-field">${icon('search')}<label class="sr-only" for="conversation-search">${business ? 'Zoek een klant' : 'Zoek een bedrijf'}</label><input id="conversation-search" type="search" placeholder="${business ? 'Zoek een klant…' : 'Zoek een bedrijf…'}" value="${html(query)}" autocomplete="off"><button class="search-clear" type="button" data-action="clear-search" aria-label="Zoekopdracht wissen" ${query ? '' : 'hidden'}>${icon('close')}</button></div><div class="inbox-actions"><div class="filter-tabs" role="group" aria-label="Gesprekken filteren"><button class="filter-button" data-filter="all">Alle gesprekken</button><button class="filter-button" data-filter="unread">Ongelezen</button></div>${business ? `<button class="button" data-action="new-customer">${icon('plus')}Nieuw gesprek</button>` : ''}</div></div>
    <section class="card conversation-list inbox-list" id="conversation-list" aria-label="Gesprekken"></section><p class="inbox-summary" id="inbox-summary" role="status"></p>${previewNote()}`;
  updateInboxList();
}

function updateInboxList() {
  const list = document.querySelector('#conversation-list');
  if (!list) return;
  const conversations = conversationsFor(state, { query, unreadOnly });
  const unreadCount = conversationsFor(state, { unreadOnly: true }).length;
  list.innerHTML = conversations.length ? conversations.map(conversationRow).join('') : `<div class="empty-state">${icon(query ? 'search' : 'check')}<h2>${query ? 'Geen gesprekken gevonden' : 'Helemaal bij.'}</h2><p>${query ? `Probeer een andere ${isBusiness() ? 'klantnaam' : 'bedrijfsnaam'}.` : 'Je hebt alle voorbeeldberichten gelezen.'}</p><button class="button secondary" data-action="show-all">Toon alle gesprekken</button></div>`;
  document.querySelector('#inbox-summary').textContent = `${conversations.length} ${conversations.length === 1 ? 'gesprek' : 'gesprekken'} · één gesprek per ${isBusiness() ? 'klant' : 'bedrijf'}`;
  document.querySelectorAll('[data-filter]').forEach((button) => {
    const selected = (button.dataset.filter === 'unread') === unreadOnly;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    if (button.dataset.filter === 'unread') button.textContent = `Ongelezen${unreadCount ? ` (${unreadCount})` : ''}`;
  });
  const clear = document.querySelector('[data-action="clear-search"]');
  if (clear) clear.hidden = !query;
}

function switchRow(key, title, description) {
  const checked = state.preferences[key];
  const disabled = key === 'sound' && !state.preferences.notifications;
  return `<div class="toggle-row"><div><span class="toggle-label" id="label-${key}">${title}</span><span class="toggle-description" id="help-${key}">${description}</span></div><button class="toggle" role="switch" aria-checked="${checked}" aria-labelledby="label-${key}" aria-describedby="help-${key}" data-preference="${key}" ${disabled ? 'disabled' : ''}></button></div>`;
}

function renderSettings() {
  if (isBusiness()) { renderBusinessSettings(); return; }
  main.innerHTML = `${pageHeader('Helemaal naar jouw hand.', 'Een paar voorkeuren. Verder lekker eenvoudig.', 'INSTELLINGEN')}
    <div class="settings-layout"><div>
      <section class="card settings-card"><div class="settings-section-heading"><h2>Zo heet je hier</h2><p>Deze naam wordt bij je berichten getoond.</p></div><form class="profile-form" id="profile-form"><label class="field-label" for="display-name">Naam of gebruikersnaam</label><input class="text-input" id="display-name" name="name" value="${html(state.name)}" maxlength="60" autocomplete="nickname" required><div class="form-footer"><p class="field-help">Gewoon hoe je genoemd wilt worden.</p><button class="button" id="save-name" type="submit" disabled>Opslaan</button></div><p class="form-error" id="name-error" role="alert" hidden></p></form></section>
      <section class="card settings-card"><div class="settings-section-heading"><h2>Meldingen</h2><p>Bewaar je voorkeuren voor dit apparaat. In deze voorbeeldversie worden nog geen meldingen verstuurd.</p></div>${switchRow('notifications', 'Nieuwe berichten', 'Een melding wanneer er iets nieuws voor je is.')}${switchRow('sound', 'Een geluidje erbij', 'Een subtiele toon bij een nieuw bericht.')}${switchRow('previews', 'Berichtvoorbeeld tonen', 'Laat een stukje van het bericht in de melding zien.')}</section>
      <section class="card settings-card"><div class="settings-section-heading"><h2>Dit voorbeeld</h2><p>Je reacties en voorkeuren worden alleen in deze browser bewaard.</p></div><div class="reset-row"><button class="reset-button" data-action="reset-preview">Voorbeeld opnieuw beginnen</button></div></section>
    </div><aside class="card settings-info"><div class="icon-orbit">${icon('phone')}</div><h2>Nieuw toestel.<br>Nieuwe start.</h2><p>Bij Conappt hoort je code bij je toestel. Een nieuwe telefoon krijgt een nieuwe code en begint met een lege inbox.</p><div class="info-divider"></div><p class="small-copy">Je hebt geen telefoonnummer of e-mailadres nodig. Alleen een naam om je in het gesprek te herkennen.</p></aside></div>`;
}

function renderBusinessHome() {
  const recent = conversationsFor(state).slice(0, 3);
  main.innerHTML = `${pageHeader('Korte lijntjes met je klanten.', 'Updates versturen, vragen beantwoorden. Gewoon hier.', 'JOUW BEDRIJF')}
    <div class="home-grid"><section class="card code-card business-home-card"><div class="card-heading"><h2 class="card-label">JE ZAKELIJKE PROFIEL</h2><span class="sample-label">Voorbeeld</span></div><div class="business-identity"><span class="business-mark">${icon('business')}</span><div><h2>${html(state.business.name)} ${verificationLabel()}</h2><p>${html(state.business.email)}</p></div></div><p class="code-description">Een bevestiging of een korte update?<br>Vraag om de Conappt-code van je klant en begin.</p><div class="code-actions"><button class="button" data-action="new-customer">${icon('plus')}Nieuw gesprek</button><a class="button secondary" href="#gesprekken">Je klanten ${icon('arrow')}</a></div><div class="device-note">${icon('phone')}Alles vanuit dezelfde app</div></section>
    <div class="home-secondary"><section class="card how-card"><h2>Een bericht is zo geregeld.</h2><ol class="how-list"><li><span class="step-number">1</span><div><strong>Vraag om de code</strong><p>Je klant vindt die op zijn eigen Home.</p></div></li><li><span class="step-number">2</span><div><strong>Stuur een update</strong><p>Een titel, je bericht en klaar.</p></div></li><li><span class="step-number">3</span><div><strong>Houd contact</strong><p>Antwoorden komen in hetzelfde gesprek.</p></div></li></ol></section><section class="card quiet-card"><div class="icon-orbit">${icon('chat')}</div><h3>Geen eigen website nodig.</h3><p>Gebruik Conappt voor jezelf én voor je bedrijf. Wisselen kan altijd via je profiel.</p><button class="text-link plain-button" data-action="switch-account">Wissel van account ${icon('arrow')}</button></section></div>
    <section class="home-recent"><div class="section-heading"><h2>Je laatste klantgesprekken</h2><a class="text-link" href="#gesprekken">Bekijk alles ${icon('arrow')}</a></div><div class="card conversation-list">${recent.map(conversationRow).join('')}</div></section></div>${previewNote()}`;
}

function themeStyle(theme) {
  return `--chat-accent:${theme.accent};--chat-tint:${theme.tint};--chat-ink:${theme.ink};--chat-background:${theme.background};--chat-foreground:${theme.foreground};background-color:${theme.background};color:${theme.foreground};`;
}
function businessThemePicker() {
  const selected = state.business.theme;
  const colors = state.business.customTheme;
  const fields = [['accent', 'Accentkleur'], ['tint', 'Berichtachtergrond'], ['ink', 'Berichttekst'], ['background', 'Chatachtergrond'], ['foreground', 'Algemene tekst']];
  return `<section class="card settings-card" id="company-theme-settings"><div class="settings-section-heading"><h2>Bedrijfsthema</h2><p>Kies wit, zwart of ontwerp je eigen kleurenschema voor jouw zakelijke app en klantgesprekken.</p></div><div class="theme-settings"><div class="theme-options" role="group" aria-label="Kies een bedrijfsthema">${Object.entries(BUSINESS_THEMES).map(([key, value]) => `<button type="button" class="theme-option ${selected === key ? 'selected' : ''}" style="${selected === key ? `background:${businessThemeFor(state, 'studio-noord').background};color:${businessThemeFor(state, 'studio-noord').foreground};border-color:${businessThemeFor(state, 'studio-noord').accent}` : ''}" data-theme="${key}" aria-pressed="${selected === key}"><span class="theme-swatch" style="background:${key === 'custom' ? colors.accent : value.accent || '#64748b'}"></span><span>${value.label}</span>${selected === key ? icon('check') : ''}</button>`).join('')}</div>${selected === 'custom' ? `<form id="business-theme-form" class="theme-custom-fields">${fields.map(([key,label]) => `<label class="theme-color-field"><span>${label}</span><input type="color" name="${key}" value="${colors[key]}" aria-label="${label}"></label>`).join('')}<button class="button" type="submit">Bewaar eigen thema</button></form>` : ''}<div class="theme-preview" style="${themeStyle(businessThemeFor(state, 'studio-noord'))}"><strong>${html(state.business.name)}</strong><div class="theme-preview-bubble">Zo zien klanten jouw berichten.</div><small>Voorbeeld van jouw chatkleuren</small></div><p class="field-help">Deze preview bewaart het thema op dit apparaat. Synchronisatie naar andere gebruikers volgt met bedrijfsprofielen op de server.</p></div></section>`;
}

function renderCompanyProfile(id) {
  const linked = id === 'studio-noord';
  const contact = contactsFor(state, 'personal').find(item => item.id === id);
  if (!contact || !linked) {
    main.innerHTML = `${pageHeader('Bedrijfsprofiel niet beschikbaar','Dit voorbeeldbedrijf heeft nog geen openbaar profiel.')}<a class="button secondary" href="#gesprekken">Terug</a>`;
    return;
  }
  const profile = state.business.profile;
  const theme = businessThemeFor(state, id, 'personal');
  const external = (label,url) => url ? `<a class="button secondary" href="${html(url)}" target="_blank" rel="noopener noreferrer">${html(label)} ↗</a>` : '';
  const hours = PROFILE_DAYS.map(day => profile.hours[day] ? `<div class="company-hour"><strong>${day}</strong><span>${html(profile.hours[day])}</span></div>` : '').join('');
  main.innerHTML = `<section class="company-profile" style="${themeStyle(theme)}"><div class="company-profile-toolbar"><a class="text-link" href="${isBusiness() ? '#home' : '#gesprek/'+id}">← ${isBusiness() ? 'Terug naar bedrijf' : 'Terug naar gesprek'}</a>${isBusiness() ? `<button class="button ${editingCompanyProfile ? 'secondary' : ''}" type="button" data-action="toggle-company-profile-edit">${editingCompanyProfile ? 'Annuleren' : 'Profiel bewerken'}</button>` : ''}</div>${isBusiness() && editingCompanyProfile ? `<div class="company-profile-edit">${businessProfileEditor()}</div>` : ''}<div class="company-profile-hero">${profile.logo ? `<img class="company-logo" src="${profile.logo}" alt="Logo van ${html(contact.name)}">` : avatar(contact,'company-logo-fallback')}<div><h1>${html(contact.name)}${verificationLabel()}</h1><p>${html(profile.description || 'Welkom bij ons bedrijfsprofiel.')}</p></div></div><div class="company-profile-grid"><section class="card company-profile-section"><h2>Contact</h2>${profile.phone ? `<p>Telefoon: <a href="tel:${html(profile.phone.replace(/[^+0-9]/g,''))}">${html(profile.phone)}</a></p>` : ''}<p>E-mail: <a href="mailto:${html(state.business.email)}">${html(state.business.email)}</a></p><div class="company-actions">${external('Website',profile.website)}${Object.entries(profile.socials).map(([name,url])=>external(name[0].toUpperCase()+name.slice(1),url)).join('')}</div></section><section class="card company-profile-section"><h2>Openingstijden</h2>${hours || '<p>Geen openingstijden opgegeven.</p>'}</section></div>${profile.actions.length ? `<section class="card company-profile-section company-actions-panel"><h2>Wat wil je doen?</h2><p>Deze knoppen openen een bestaande dienst van het bedrijf. Conappt neemt geen afspraken of reserveringen over.</p><div class="company-actions company-action-buttons">${profile.actions.map(item=>`<a class="button company-action-button" href="${html(item.url)}" target="_blank" rel="noopener noreferrer">${html(item.label)} ${icon('arrow')}</a>`).join('')}</div></section>` : ''}<p class="field-help">Voorbeeldprofiel · gegevens alleen op dit apparaat opgeslagen</p></section>`;
}
function businessProfileEditor() {
  const profile = state.business.profile;
  const input=(name,label,value,placeholder='')=>`<label class="field-label" for="${name}">${label}</label><input class="text-input" id="${name}" name="${name}" value="${html(value)}" placeholder="${html(placeholder)}">`;
  const actionRow=(i,action={})=>`<div class="action-editor" data-action-index="${i}"><div class="action-editor-top"><span class="action-icon">${icon('arrow')}</span><strong>Actie ${i+1}</strong><button type="button" class="text-link plain-button" data-action="remove-profile-action" data-index="${i}" aria-label="Verwijder actie ${i+1}">Verwijderen</button></div><div class="action-editor-fields">${input('action-label-'+i,'Knoptekst',action.label||'','Bijv. Reserveren')}${input('action-url-'+i,'Link naar bestaande dienst',action.url||'','https://...')}</div></div>`;
  return `<section class="card settings-card" id="public-company-profile-settings"><div class="settings-section-heading"><h2>Openbaar bedrijfsprofiel</h2><p>Bouw je profiel op met overzichtelijke onderdelen. Alleen ingevulde informatie wordt getoond.</p></div><form class="company-profile-form" id="company-public-form">
  <section class="company-editor-panel"><h3>Presentatie</h3><p>Laat klanten direct zien wie je bent.</p><div class="company-brand-editor"><div class="company-logo-editor"><label class="company-logo-tile" for="company-logo" aria-label="Bedrijfslogo kiezen of wijzigen">${profile.logo ? `<img src="${profile.logo}" alt="Huidig bedrijfslogo">` : `<span class="company-logo-initial">${html(Array.from(state.business.name)[0]?.toUpperCase() || 'B')}</span>`}<span class="company-logo-edit">${icon('edit')} Bewerken</span></label><input class="sr-only" id="company-logo" type="file" accept="image/png,image/jpeg,image/webp"><span id="company-logo-feedback" class="company-logo-caption" role="status">${profile.logo ? 'Logo ingesteld' : 'Geen logo ingesteld'}</span><button type="button" class="company-logo-remove text-link plain-button" data-action="remove-company-logo" ${profile.logo ? '' : 'hidden'}>Logo verwijderen</button></div><div class="company-description-editor"><label class="field-label" for="company-description">Bedrijfsbeschrijving</label><textarea class="text-input" id="company-description" maxlength="500" rows="5" placeholder="Vertel kort wie jullie zijn en hoe jullie klanten helpen.">${html(profile.description)}</textarea><p class="field-help">Logo: PNG, JPEG of WebP · maximaal 90 KB</p></div></div></section>
  <details class="company-editor-panel" open><summary>Contactgegevens <span>Telefoon, website en sociale media</span></summary><div class="company-panel-fields">${input('company-phone','Telefoonnummer',profile.phone,'Optioneel')}${input('company-website','Website (https://)',profile.website,'https://...')}${['instagram','facebook','linkedin'].map(key=>input('social-'+key,key,profile.socials[key],'https://...')).join('')}</div></details>
  <details class="company-editor-panel"><summary>Openingstijden <span>Stel de tijden per dag in</span></summary><div class="company-hour-fields">${PROFILE_DAYS.map(day=>`<div>${input('hours-'+day,day,profile.hours[day],'Bijv. 09:00–17:00 of Gesloten')}</div>`).join('')}</div></details>
  <section class="company-editor-panel" id="company-action-settings"><div class="company-panel-heading"><div><h3>Actieknoppen</h3><p>Laat klanten iets regelen via jouw bestaande website of systeem.</p></div><button type="button" class="button secondary" data-action="add-profile-action" id="add-profile-action" ${profile.actions.length>=3?'disabled':''}>${icon('plus')} Actie toevoegen</button></div><div class="action-editors" id="profile-action-editors">${profile.actions.map((action,i)=>actionRow(i,action)).join('')}${profile.actions.length===0?'<p class="action-empty">Nog geen actieknoppen. Voeg bijvoorbeeld ‘Reserveren’ of ‘Afspraak maken’ toe.</p>':''}</div><p class="field-help">Maximaal 3 knoppen. Elke knop opent een externe HTTPS-link.</p></section>
  <div class="company-form-footer"><button class="button" type="submit">Bedrijfsprofiel opslaan</button><p class="form-error" id="company-profile-error" role="alert" hidden></p></div></form></section>`;
}

function renderBusinessSettings() {
  main.innerHTML = `${pageHeader('Je bedrijf, jouw voorkeuren.', 'Je zakelijke profiel en meldingen op één plek.', 'ZAKELIJKE INSTELLINGEN')}
    <div class="settings-layout"><div><section class="card settings-card"><div class="settings-section-heading"><h2>Je bedrijfsprofiel</h2><p>Deze voorbeeldgegevens worden lokaal bewaard.</p></div><form class="profile-form" id="business-profile-form"><label class="field-label" for="business-name">Bedrijfsnaam</label><input class="text-input" id="business-name" name="business-name" value="${html(state.business.name)}" maxlength="80" autocomplete="organization" required><label class="field-label extra-field" for="business-email">E-mailadres</label><input class="text-input" id="business-email" name="business-email" type="email" value="${html(state.business.email)}" maxlength="254" autocomplete="email" required><div class="form-footer"><p class="field-help">Alleen een bedrijfsnaam en e-mailadres.</p><button class="button" type="submit">Opslaan</button></div><p class="form-error" id="business-error" role="alert" hidden></p></form></section>
    ${businessThemePicker()}
    <section class="card settings-card"><div class="settings-section-heading"><h2>Bedrijfsverificatie</h2><p>Geef je bedrijfsnaam een herkenbare blauwe rand. €${VERIFY_PRICE_EUR} per maand wanneer betalingen echt worden ingeschakeld.</p></div><div class="verification-plan"><div><strong>${hasDemoVerification(state) ? 'Demo-verificatie actief' : 'Gratis bedrijfsprofiel'}</strong><p>${hasDemoVerification(state) ? 'De blauwe demo-markering is zichtbaar. Er is geen identiteit gecontroleerd en niets afgeschreven.' : 'Berichten en klantgesprekken blijven gratis. Probeer de markering zonder afschrijving.'}</p></div>${verificationLabel()}<button class="button ${hasDemoVerification(state) ? 'secondary' : ''}" type="button" data-action="${hasDemoVerification(state) ? 'cancel-verification' : 'start-verification'}">${hasDemoVerification(state) ? 'Demo-verificatie uitschakelen' : 'Probeer verificatie · €20/maand'}</button><p class="field-help">Demo: geen echte betaling, abonnement of controle van bedrijfsgegevens.</p></div></section>
    <section class="card settings-card"><div class="settings-section-heading"><h2>Meldingen</h2><p>Deze apparaatvoorkeuren gelden voor beide profielen. In dit voorbeeld worden nog geen meldingen verstuurd.</p></div>${switchRow('notifications', 'Nieuwe berichten', 'Een melding wanneer een klant reageert.')}${switchRow('sound', 'Een geluidje erbij', 'Een subtiele toon bij een nieuw bericht.')}${switchRow('previews', 'Berichtvoorbeeld tonen', 'Laat een stukje van het bericht in de melding zien.')}</section></div>
    <aside class="business-settings-tools"><section class="card business-settings-panel"><h2>Jouw bedrijfsprofiel</h2><p>Bekijk wat een klant ziet en pas direct je profiel aan.</p><a class="button" href="#bedrijf/studio-noord">Bekijk bedrijfsprofiel ${icon('arrow')}</a><a class="business-settings-link" href="#bedrijf/studio-noord" data-edit-company-profile="true">${icon('business')} Profiel bewerken</a></section><section class="card business-settings-panel"><h2>Snelle instellingen</h2><p>Ga rechtstreeks naar de onderdelen die je gebruikt.</p><a class="business-settings-link" href="#instellingen" data-scroll-target="company-action-settings">${icon('arrow')} Actieknoppen beheren <span>${state.business.profile.actions.length}/3</span></a><a class="business-settings-link" href="#instellingen" data-scroll-target="company-theme-settings">${icon('settings')} Thema aanpassen <span>${html(state.business.theme === 'black' ? 'Donker' : state.business.theme === 'custom' ? 'Eigen kleuren' : 'Wit')}</span></a></section></aside></div>${previewNote()}`;
}

function renderMessage(message, business) {
  const outgoing = isBusiness() ? message.from === 'business' : message.from === 'customer';
  return `<div class="message ${outgoing ? 'outgoing' : 'incoming'}">${!outgoing ? avatar(business) : ''}<div class="message-body">${message.title ? `<h2 class="message-title">${html(message.title)}</h2>` : ''}<p class="message-text">${html(message.text)}</p><div class="message-meta">${message.local ? '<span>Lokaal bewaard</span>' : ''}<time datetime="${new Date(message.at).toISOString()}">${new Intl.DateTimeFormat('nl', { hour: '2-digit', minute: '2-digit' }).format(message.at)}</time>${outgoing ? icon('check') : ''}</div></div></div>`;
}

function renderChat(id) {
  const business = contactFor(id);
  if (!business) {
    main.innerHTML = `${pageHeader('Gesprek niet gevonden', 'Dit gesprek bestaat niet in de voorbeeldomgeving.')}<a class="button" href="#gesprekken">Naar je gesprekken</a>`;
    return;
  }
  markRead(state, id); persist(false);
  const muted = mutedChats().includes(id);
  main.innerHTML = `<section class="chat-panel" style="${themeStyle(businessThemeFor(state, id))}" aria-label="Gesprek met ${html(business.name)}" data-company-id="${id}"><header class="chat-header"><a class="icon-button chat-back" href="#gesprekken" aria-label="Terug naar gesprekken">${icon('back')}</a>${avatar(business)}<div class="chat-identity"><h1 class="chat-business-name">${!isBusiness() && id === 'studio-noord' ? `<a class="company-chat-link" href="#bedrijf/${id}">${html(business.name)}</a>` : html(business.name)}${!isBusiness() && id === 'studio-noord' ? verificationLabel() : ''}</h1><span class="chat-business-detail">${html(business.category)}</span></div><div class="chat-header-actions"><button class="icon-button" data-action="switch-account" aria-label="Wissel van account in dit gesprek">${icon(isBusiness() ? 'business' : 'person')}</button><button class="icon-button" data-action="mute-chat" data-id="${id}" aria-label="${muted ? 'Meldingen voor dit gesprek aanzetten' : 'Meldingen voor dit gesprek uitzetten'}" aria-pressed="${muted}">${icon(muted ? 'bellOff' : 'bell')}</button><button class="icon-button" data-action="business-info" data-id="${id}" aria-label="Over ${html(business.name)}">${icon('info')}</button></div></header><div class="chat-demo-strip">${isBusiness() ? `Zakelijk · ${html(state.business.name)} · ` : ''}Voorbeeldgesprek · berichten blijven lokaal</div><div class="thread" id="message-thread" role="log" aria-label="Berichten" aria-live="off"></div><div class="composer-wrap"><form class="composer" id="reply-form" data-id="${id}">${isBusiness() ? `<label class="sr-only" for="message-title">Titel van het bericht</label><input class="text-input message-title-input" id="message-title" placeholder="Titel van je bericht…" value="${html(titleDrafts.get(draftKey(id)) || '')}" aria-describedby="composer-help reply-error" required>` : ''}<div class="composer-row"><label class="sr-only" for="reply">${isBusiness() ? 'Inhoud van het bericht' : 'Je reactie'}</label><textarea id="reply" rows="1" placeholder="${isBusiness() ? 'Schrijf je update…' : 'Schrijf een bericht…'}" enterkeyhint="send" aria-describedby="composer-help reply-error">${html(drafts.get(draftKey(id)) || '')}</textarea><button class="button send-button" type="submit" aria-label="${isBusiness() ? 'Bedrijfsbericht lokaal bewaren' : 'Reactie lokaal bewaren'}" disabled>${icon('send')}</button></div></form><div class="composer-help" id="composer-help"><span>${isBusiness() ? 'Titel en inhoud samen · Alleen lokaal bewaard' : 'Alleen lokaal bewaard'} <span class="desktop-hint">· Enter om te versturen</span></span><span class="byte-count" id="byte-count"></span></div><p class="composer-error" id="reply-error" role="alert" hidden></p></div></section>`;
  const messages = messagesFor(id, state);
  let previousDay = '';
  const thread = document.querySelector('#message-thread');
  thread.innerHTML = messages.length ? messages.map((message) => {
    const day = new Date(message.at).toDateString();
    const heading = day !== previousDay ? `<div class="date-label">${dayLabel(message.at)}</div>` : '';
    previousDay = day;
    return heading + renderMessage(message, business);
  }).join('') : `<div class="thread-empty">${icon('chat')}<h2>Begin met een update.</h2><p>Schrijf een titel en een bericht voor ${html(business.name)}.<br>In dit voorbeeld blijft alles lokaal.</p></div>`;
  thread.scrollTop = thread.scrollHeight;
  requestAnimationFrame(() => { thread.setAttribute('aria-live', 'polite'); });
  updateComposer();
}

function updateComposer() {
  const input = document.querySelector('#reply');
  if (!input) return;
  const title = document.querySelector('#message-title')?.value || '';
  const limit = isBusiness() ? MESSAGE_LIMITS.business : MESSAGE_LIMITS.customer;
  const size = byteLength(input.value) + (isBusiness() ? byteLength(title) : 0);
  const over = size > limit;
  const counter = document.querySelector('#byte-count');
  counter.textContent = `${size} / ${limit} bytes`;
  counter.classList.toggle('over-limit', over);
  input.setAttribute('aria-invalid', String(over));
  document.querySelector('#message-title')?.setAttribute('aria-invalid', String(over));
  document.querySelector('.send-button').disabled = Boolean(isBusiness() ? validateBusinessMessage(title, input.value) : validateReply(input.value));
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight + 2, 140)}px`;
  const error = document.querySelector('#reply-error');
  error.hidden = !over;
  error.textContent = over ? `${isBusiness() ? 'Titel en bericht zijn samen' : 'Je bericht is'} te groot. Maximaal ${limit} bytes.` : '';
}

function render(focus = false) {
  const { page, id } = route();
  const validChat = page === 'gesprek' && Boolean(contactFor(id));
  const chatCompanyTheme = !isBusiness() && validChat && id === 'studio-noord';
  document.body.classList.toggle('business-theme-active', isBusiness() || chatCompanyTheme);
  document.body.classList.toggle('customer-company-chat-theme', chatCompanyTheme);
  const theme = businessThemeFor(state, id);
  document.body.style.setProperty('--business-accent', theme.accent);
  document.body.style.setProperty('--business-tint', theme.tint);
  document.body.style.setProperty('--business-foreground', theme.foreground);
  document.body.style.setProperty('--business-background', theme.background);
  document.body.style.setProperty('--business-ink', theme.ink);
  document.body.style.setProperty('--business-mode', state.business.theme);
  document.body.style.colorScheme = (isBusiness() || chatCompanyTheme) && state.business.theme === 'black' ? 'dark' : 'light';
  document.body.classList.toggle('is-chat', validChat);
  if (page === 'gesprekken') renderInbox();
  else if (page === 'instellingen') renderSettings();
  else if (page === 'gesprek') renderChat(id);
  else if (page === 'bedrijf') renderCompanyProfile(id);
  else if (isBusiness()) renderBusinessHome();
  else renderHome();
  updateNavigation();
  const titles = { home: isBusiness() ? 'Zakelijk' : 'Home', gesprekken: isBusiness() ? 'Klantgesprekken' : 'Gesprekken', instellingen: 'Instellingen', gesprek: contactFor(id)?.name || 'Gesprek', bedrijf: 'Bedrijfsprofiel' };
  document.title = `${titles[page] || 'Home'} · Conappt`;
  if (focus) main.focus({ preventScroll: true });
  if (!validChat) window.scrollTo(0, 0);
}

function openDialog(content) {
  dialog.innerHTML = content;
  const heading = dialog.querySelector('h2');
  heading.id = 'dialog-heading';
  dialog.setAttribute('aria-labelledby', heading.id);
  dialog.showModal();
}

function openAccountSwitcher() {
  const choice = (mode, name, detail, symbol) => `<button class="account-choice ${state.mode === mode ? 'selected' : ''}" type="button" data-action="choose-account" data-mode="${mode}" aria-pressed="${state.mode === mode}"><span class="account-choice-icon">${icon(symbol)}</span><span class="account-choice-copy"><strong>${html(name)}</strong><small>${detail}</small></span>${state.mode === mode ? icon('check') : ''}</button>`;
  openDialog(`<h2>Wissel van account</h2><p>Voor jezelf of voor je bedrijf. Je gebruikt gewoon dezelfde app.</p><div class="account-choices">${choice('personal', state.name, 'Persoonlijk profiel', 'person')}${choice('business', state.business.name, 'Zakelijk profiel · voorbeeld', 'business')}</div><p class="dialog-note">Deze voorbeeldaccounts staan alleen op dit apparaat.</p><div class="dialog-actions"><button class="button secondary" data-action="close-dialog">Sluiten</button></div>`);
}

function newCustomerDialog() {
  openDialog(`<h2>Nieuw klantgesprek</h2><p>Vraag je klant om de Conappt-code. In dit voorbeeld blijft het gesprek lokaal.</p><form id="new-customer-form"><label class="field-label" for="customer-code">Conappt-code van je klant</label><input class="text-input code-input" id="customer-code" placeholder="7483-RGY-RCH" autocomplete="off" autocapitalize="characters" spellcheck="false" required><label class="field-label extra-field" for="customer-name">Naam voor je overzicht <span class="optional-label">(optioneel)</span></label><input class="text-input" id="customer-name" maxlength="60" placeholder="Bijvoorbeeld Sam"><p class="form-error" id="customer-error" role="alert" hidden></p><div class="dialog-actions spaced-actions"><button class="button secondary" type="button" data-action="close-dialog">Annuleren</button><button class="button" type="submit">Open gesprek</button></div></form>`);
}

async function copyCode() {
  let copied = false;
  try { await navigator.clipboard.writeText(DEMO_CODE); copied = true; } catch {
    const field = document.createElement('textarea');
    field.value = DEMO_CODE;
    field.className = 'sr-only';
    document.body.append(field);
    field.select();
    try { copied = document.execCommand('copy'); } catch { /* Use a selectable field below. */ }
    field.remove();
  }
  if (copied) toast('Voorbeeldcode gekopieerd.');
  else {
    openDialog(`<h2>Kopieer je voorbeeldcode</h2><p>Selecteer de code en kies kopiëren.</p><label class="sr-only" for="manual-copy">Voorbeeldcode</label><input class="text-input" id="manual-copy" value="${DEMO_CODE}" readonly><div class="dialog-actions"><button class="button" data-action="close-dialog">Klaar</button></div>`);
    document.querySelector('#manual-copy').select();
  }
}

document.addEventListener('click', async (event) => {
  if (event.target.closest('.skip-link')) { event.preventDefault(); main.focus(); return; }
  const editProfileLink = event.target.closest('[data-edit-company-profile]');
  if (editProfileLink && isBusiness()) {
    editingCompanyProfile = true;
    if (location.hash === '#bedrijf/studio-noord') { event.preventDefault(); render(true); }
    return;
  }
  const scrollLink = event.target.closest('[data-scroll-target]');
  if (scrollLink) {
    event.preventDefault();
    document.getElementById(scrollLink.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const filter = event.target.closest('[data-filter]');
  if (filter) { unreadOnly = filter.dataset.filter === 'unread'; updateInboxList(); return; }
  const preference = event.target.closest('[data-preference]');
  if (preference && !preference.disabled) {
    const key = preference.dataset.preference;
    state.preferences[key] = !state.preferences[key];
    const saved = persist();
    renderSettings();
    document.querySelector(`[data-preference="${key}"]`).focus({ preventScroll: true });
    if (saved) toast('Voorkeur opgeslagen op dit apparaat.');
    return;
  }
  const themeButton = event.target.closest('[data-theme]');
  if (themeButton && isBusiness()) {
    if (!setBusinessTheme(state, themeButton.dataset.theme)) return;
    const saved = persist(); render(true);
    if (saved) toast('Bedrijfsthema opgeslagen op dit apparaat.');
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'switch-account') openAccountSwitcher();
  else if (action === 'toggle-company-profile-edit') {
    if (!isBusiness() || route().page !== 'bedrijf' || route().id !== 'studio-noord') return;
    editingCompanyProfile = !editingCompanyProfile;
    render(true);
  } else if (action === 'add-profile-action') {
    const container=document.querySelector('#profile-action-editors');
    const count=container?.querySelectorAll('.action-editor').length ?? 0;
    if (!container || count>=3) return;
    container.querySelector('.action-empty')?.remove();
    const row=document.createElement('div');
    row.className='action-editor';
    row.dataset.actionIndex=String(count);
    row.innerHTML=`<div class="action-editor-top"><span class="action-icon">${icon('arrow')}</span><strong>Actie ${count+1}</strong><button type="button" class="text-link plain-button" data-action="remove-profile-action" data-index="${count}">Verwijderen</button></div><div class="action-editor-fields"><label class="field-label" for="action-label-${count}">Knoptekst</label><input class="text-input" id="action-label-${count}" placeholder="Bijv. Reserveren"><label class="field-label" for="action-url-${count}">Link naar bestaande dienst</label><input class="text-input" id="action-url-${count}" placeholder="https://..."></div>`;
    container.append(row);document.getElementById('add-profile-action').disabled=count+1>=3;
    row.querySelector('input')?.focus();
  } else if (action === 'remove-profile-action') {
    const container=document.querySelector('#profile-action-editors');
    const rows=Array.from(container?.querySelectorAll('.action-editor')||[]);
    rows[Number(button.dataset.index)]?.remove();
    Array.from(container.querySelectorAll('.action-editor')).forEach((row,i)=>{
      row.dataset.actionIndex=String(i);
      row.querySelector('strong').textContent=`Actie ${i+1}`;
      row.querySelector('[data-action="remove-profile-action"]').dataset.index=String(i);
      for(const kind of ['label','url']){const field=row.querySelector(`[id^="action-${kind}-"]`);if(field){field.id=`action-${kind}-${i}`;row.querySelector(`label[for^="action-${kind}-"]`).htmlFor=field.id;}}
    });
    if(!container.children.length)container.innerHTML='<p class="action-empty">Nog geen actieknoppen.</p>';
    document.getElementById('add-profile-action').disabled=false;
  } else if (action === 'remove-company-logo') {
    state.business.profile.logo = ''; persist();
    const feedback=document.querySelector('#company-logo-feedback'); if(feedback) feedback.textContent='Geen logo ingesteld';
    const tile=document.querySelector('.company-logo-tile'); if(tile) tile.querySelector('img')?.remove();
    if(tile && !tile.querySelector('.company-logo-initial')) tile.insertAdjacentHTML('afterbegin', `<span class="company-logo-initial">${html(Array.from(state.business.name)[0]?.toUpperCase() || 'B')}</span>`);
    button.hidden=true;
  } else if (action === 'start-verification') {
    openDialog(`<h2>Demo-verificatie</h2><p>De toekomstige prijs is <strong>€${VERIFY_PRICE_EUR} per maand</strong>. Dit is uitsluitend een betaal-simulatie: er wordt niets afgeschreven en je bedrijfsidentiteit wordt niet gecontroleerd.</p><p>De blauwe rand wordt expliciet als demo aangeduid, ook voor klanten in deze preview.</p><div class="dialog-actions"><button class="button secondary" data-action="close-dialog">Annuleren</button><button class="button" data-action="confirm-verification">Demo activeren</button></div>`);
  } else if (action === 'confirm-verification') {
    setDemoVerification(state, true);
    persist(); dialog.close(); render(true);
    toast('Demo-verificatie geactiveerd · geen betaling uitgevoerd.');
  } else if (action === 'cancel-verification') {
    setDemoVerification(state, false);
    persist(); render(true);
    toast('Demo-verificatie uitgeschakeld.');
  }
  else if (action === 'choose-account') {
    const mode = button.dataset.mode;
    if (!['personal', 'business'].includes(mode)) return;
    state.mode = mode; query = ''; unreadOnly = false;
    const saved = persist();
    dialog.close();
    if (location.hash === '#home') render(true); else location.hash = 'home';
    if (saved) toast(mode === 'business' ? `Je gebruikt Conappt nu als ${state.business.name}.` : 'Je persoonlijke inbox staat klaar.');
  } else if (action === 'new-customer') newCustomerDialog();
  else if (action === 'copy-code') await copyCode();
  else if (action === 'share-code') {
    if (navigator.share) {
      try { await navigator.share({ title: 'Conappt voorbeeldcode', text: `Mijn Conappt-voorbeeldcode is ${DEMO_CODE}. Dit is een voorbeeld en nog geen echt ontvangstadres.` }); }
      catch (error) { if (error.name !== 'AbortError') await copyCode(); }
    } else await copyCode();
  } else if (action === 'clear-search' || action === 'show-all') {
    query = '';
    if (action === 'show-all') unreadOnly = false;
    const search = document.querySelector('#conversation-search');
    if (search) { search.value = ''; search.focus(); }
    updateInboxList();
  } else if (action === 'mute-chat') {
    const id = button.dataset.id;
    const key = isBusiness() ? 'mutedBusiness' : 'muted';
    const muted = !state[key].includes(id);
    state[key] = muted ? [...state[key], id] : state[key].filter((item) => item !== id);
    const saved = persist();
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute('aria-label', muted ? 'Meldingen voor dit gesprek aanzetten' : 'Meldingen voor dit gesprek uitzetten');
    button.innerHTML = icon(muted ? 'bellOff' : 'bell');
    if (saved) toast(`Meldingsvoorkeur voor dit gesprek ${muted ? 'uit' : 'aan'}gezet.`);
  } else if (action === 'business-info') {
    const business = contactFor(button.dataset.id);
    openDialog(`<div class="dialog-business">${avatar(business)}<div><h2>${html(business.name)}</h2><small>${html(business.category)}</small></div></div><p>${isBusiness() ? `Voorbeeldklant met Conappt-code <strong>${html(business.code)}</strong>. Je updates en antwoorden van deze klant staan samen in dit gesprek.` : 'Dit is een voorbeeldbedrijf. In Conappt komen alle updates van hetzelfde bedrijf samen in één gesprek. Je kunt hier met tekst op reageren.'}</p><div class="dialog-actions"><button class="button secondary" data-action="close-dialog">Sluiten</button></div>`);
  } else if (action === 'reset-preview') {
    openDialog('<h2>Een frisse start?</h2><p>Je lokaal bewaarde reacties en voorkeuren worden gewist. De oorspronkelijke voorbeeldgesprekken komen terug.</p><div class="dialog-actions"><button class="button secondary" data-action="close-dialog">Annuleren</button><button class="button" data-action="confirm-reset">Opnieuw beginnen</button></div>');
  } else if (action === 'confirm-reset') {
    state = freshState(); drafts.clear(); titleDrafts.clear(); query = ''; unreadOnly = false;
    const saved = persist();
    dialog.close();
    if (location.hash === '#home') render(true); else location.hash = 'home';
    if (saved) toast('Je voorbeeldomgeving is opnieuw begonnen.');
  } else if (action === 'close-dialog') dialog.close();
});

document.addEventListener('change', async event => {
  if (event.target.id !== 'company-logo' || !isBusiness()) return;
  const file=event.target.files?.[0]; if(!file)return;
  const feedback=document.querySelector('#company-logo-feedback');
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 90*1024) {feedback.textContent='Alleen PNG, JPEG of WebP tot 90 KB.';return;}
  const bytes=new Uint8Array(await file.arrayBuffer());
  const valid=(file.type==='image/png' && bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71) || (file.type==='image/jpeg' && bytes[0]===255 && bytes[1]===216) || (file.type==='image/webp' && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP');
  if(!valid){feedback.textContent='Ongeldig afbeeldingsbestand.';return;}
  const encoded=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
  state.business.profile.logo=`data:${file.type};base64,${encoded}`;persist();feedback.textContent='Logo ingesteld';
  const tile=document.querySelector('.company-logo-tile');
  if(tile){tile.querySelector('img, .company-logo-initial')?.remove();const image=document.createElement('img');image.src=state.business.profile.logo;image.alt='Huidig bedrijfslogo';tile.prepend(image);}
  const remove=document.querySelector('[data-action="remove-company-logo"]');if(remove)remove.hidden=false;
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'conversation-search') { query = event.target.value; updateInboxList(); }
  else if (event.target.id === 'reply') { drafts.set(draftKey(route().id), event.target.value); updateComposer(); }
  else if (event.target.id === 'message-title') { titleDrafts.set(draftKey(route().id), event.target.value); updateComposer(); }
  else if (event.target.id === 'display-name') {
    document.querySelector('#save-name').disabled = event.target.value.trim() === state.name || !event.target.value.trim();
    document.querySelector('#name-error').hidden = true;
  }
});

document.addEventListener('submit', (event) => {
  if (event.target.id === 'company-public-form') {
    event.preventDefault();
    if (!isBusiness()) return;
    const value=id=>document.getElementById(id).value;
    const actions=Array.from(document.querySelectorAll('#profile-action-editors .action-editor')).map((row,i)=>({label:value('action-label-'+i),url:value('action-url-'+i)}));
    const profile=cleanBusinessProfile({ ...state.business.profile, description:value('company-description'),phone:value('company-phone'),website:value('company-website'),socials:Object.fromEntries(['instagram','facebook','linkedin'].map(k=>[k,value('social-'+k)])),hours:Object.fromEntries(PROFILE_DAYS.map(d=>[d,value('hours-'+d)])),actions });
    state.business.profile=profile;const saved=persist();editingCompanyProfile=false;render(true);if(saved)toast('Bedrijfsprofiel opgeslagen op dit apparaat.');
  } else if (event.target.id === 'business-theme-form') {
    event.preventDefault();
    if (!isBusiness()) return;
    const data = new FormData(event.target);
    const colors = Object.fromEntries(['accent','tint','ink','background','foreground'].map(key => [key, data.get(key)]));
    if (!setBusinessTheme(state, 'custom', colors)) { toast('Ongeldige themakleuren.'); return; }
    const saved = persist(); render(true);
    if (saved) toast('Eigen bedrijfsthema opgeslagen.');
  } else if (event.target.id === 'new-customer-form') {
    event.preventDefault();
    const result = addCustomer(state, document.querySelector('#customer-code').value, document.querySelector('#customer-name').value);
    if (result.error) { const error = document.querySelector('#customer-error'); error.textContent = result.error; error.hidden = false; return; }
    persist(); dialog.close();
    const destination = `#gesprek/${result.id}`;
    if (location.hash === destination) render(true); else location.hash = destination;
  } else if (event.target.id === 'business-profile-form') {
    event.preventDefault();
    const name = document.querySelector('#business-name').value.trim();
    const email = document.querySelector('#business-email').value.trim();
    if (!name || !email) { const error = document.querySelector('#business-error'); error.textContent = 'Vul je bedrijfsnaam en e-mailadres in.'; error.hidden = false; return; }
    state.business = { ...state.business, name: Array.from(name).slice(0, 80).join(''), email };
    const saved = persist(); updateNavigation();
    document.querySelector('#business-error').hidden = true;
    if (saved) toast('Je zakelijke voorbeeldprofiel is opgeslagen.');
  } else if (event.target.id === 'profile-form') {
    event.preventDefault();
    const name = document.querySelector('#display-name').value.trim();
    if (!name) {
      const error = document.querySelector('#name-error'); error.textContent = 'Vul een naam in.'; error.hidden = false; return;
    }
    state.name = Array.from(name).slice(0, 60).join('');
    const saved = persist();
    updateNavigation();
    document.querySelector('#display-name').value = state.name;
    document.querySelector('#save-name').disabled = true;
    if (saved) toast('Je naam is opgeslagen.');
  } else if (event.target.id === 'reply-form') {
    event.preventDefault();
    const id = event.target.dataset.id;
    const input = document.querySelector('#reply');
    const previous = messagesFor(id, state).at(-1);
    const titleInput = document.querySelector('#message-title');
    const error = isBusiness() ? addBusinessMessage(state, id, titleInput.value, input.value) : addReply(state, id, input.value);
    if (error) { const field = document.querySelector('#reply-error'); field.textContent = error; field.hidden = false; return; }
    const saved = persist();
    const message = messagesFor(id, state).at(-1);
    const business = contactFor(id);
    const thread = document.querySelector('#message-thread');
    const separator = !previous || new Date(previous.at).toDateString() !== new Date(message.at).toDateString() ? `<div class="date-label">${dayLabel(message.at)}</div>` : '';
    thread.querySelector('.thread-empty')?.remove();
    thread.insertAdjacentHTML('beforeend', separator + renderMessage(message, business));
    thread.scrollTop = thread.scrollHeight;
    drafts.delete(draftKey(id)); titleDrafts.delete(draftKey(id)); input.value = '';
    if (titleInput) titleInput.value = '';
    updateComposer(); updateNavigation(); input.focus();
    if (saved) toast(isBusiness() ? 'Bedrijfsbericht lokaal bewaard.' : 'Reactie lokaal bewaard.');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.target.id === 'reply' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    const title = document.querySelector('#message-title')?.value || '';
    if (!(isBusiness() ? validateBusinessMessage(title, event.target.value) : validateReply(event.target.value))) document.querySelector('#reply-form').requestSubmit();
  }
});
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
window.addEventListener('hashchange', () => render(true));
if (!location.hash) history.replaceState(null, '', '#home');
render();
