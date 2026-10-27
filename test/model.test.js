import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freshState, restoreState, addReply, messagesFor, conversationsFor, totalUnread,
  byteLength, validateReply, MESSAGE_LIMITS, escapeHtml,
  validateBusinessMessage, addBusinessMessage, addCustomer, contactsFor, markRead, unreadFor,
} from '../public/model.js';

test('text limit measures UTF-8 bytes, including emoji and accented characters', () => {
  assert.equal(byteLength('é'), 2);
  assert.equal(byteLength('🙂'), 4);
  assert.equal(validateReply('a'.repeat(1024)), null);
  assert.equal(validateReply('🙂'.repeat(256)), null);
  assert.notEqual(validateReply('🙂'.repeat(257)), null);
  assert.notEqual(validateReply('   \n  '), null);
  assert.equal(validateReply('a'.repeat(1024), 2048), null);
  assert.equal(MESSAGE_LIMITS.business, 1024);
  assert.equal(MESSAGE_LIMITS.customer, 1024);
});

test('a reply stays in its company conversation and is explicitly local', () => {
  const state = freshState();
  assert.equal(addReply(state, 'studio-noord', '  Tot donderdag!  '), null);
  assert.equal(messagesFor('studio-noord', state).at(-1).text, 'Tot donderdag!');
  assert.equal(messagesFor('studio-noord', state).at(-1).local, true);
  assert.equal(state.read.includes('studio-noord'), true);
  assert.equal(totalUnread(state), 1);
  assert.equal(messagesFor('fietsatelier', state).length, 2);
  const before = JSON.stringify(state);
  assert.notEqual(addReply(state, 'studio-noord', '🙂'.repeat(257)), null);
  assert.notEqual(addReply(state, 'missing-company', 'Hallo'), null);
  assert.equal(JSON.stringify(state), before);
});

test('local state round-trips profile, preferences, read state and replies', () => {
  const state = freshState();
  state.name = 'Sam';
  state.preferences.sound = true;
  state.muted.push('fietsatelier');
  addReply(state, 'studio-noord', 'Bedankt!');
  const restored = restoreState(JSON.stringify(state));
  assert.equal(restored.name, 'Sam');
  assert.equal(restored.preferences.sound, true);
  assert.deepEqual(restored.muted, ['fietsatelier']);
  assert.equal(restored.replies['studio-noord'][0].text, 'Bedankt!');
  assert.equal(restored.replies['studio-noord'][0].local, true);
  assert.equal(totalUnread(restored), 1);
});

test('corrupt or incompatible storage starts safely and invalid messages are discarded', () => {
  for (const raw of [null, 'broken JSON', '{}', '{"version":99}']) {
    assert.equal(restoreState(raw).name, 'Robin');
  }
  const restored = restoreState(JSON.stringify({ version: 1, startedAt: 1e30, read: ['unknown', 'studio-noord'], replies: { 'studio-noord': [null, { text: 'a'.repeat(1025), at: Date.now() }, { text: 'valid', at: 1e30 }, { text: 'valid', at: Date.now() }] } }));
  assert.ok(Number.isFinite(new Date(restored.startedAt).getTime()));
  assert.deepEqual(restored.read, ['studio-noord']);
  assert.equal(restored.replies['studio-noord'].length, 1);
});

test('search is case insensitive and the unread filter reflects opened conversations', () => {
  const state = freshState();
  assert.equal(conversationsFor(state, { query: 'STUDIO' })[0].id, 'studio-noord');
  assert.equal(conversationsFor(state, { unreadOnly: true }).length, 2);
  state.read.push('studio-noord', 'fietsatelier');
  assert.equal(conversationsFor(state, { unreadOnly: true }).length, 0);
  assert.equal(conversationsFor(state).length, 3);
  assert.equal(conversationsFor(state, { query: 'onbekend bedrijf' }).length, 0);
});

test('user supplied content is escaped before rendering HTML', () => {
  const escaped = escapeHtml('<img src=x onerror="alert(1)"> & \'quoted\'');
  assert.equal(escaped.includes('<'), false);
  assert.equal(escaped.includes('>'), false);
  assert.ok(escaped.includes('&quot;'));
  assert.ok(escaped.includes('&#39;'));
});

test('business title and content share a byte limit independent of customer replies', () => {
  assert.equal(validateBusinessMessage('é', '🙂'.repeat(255) + 'aa'), null);
  assert.notEqual(validateBusinessMessage('é', '🙂'.repeat(255) + 'aaa'), null);
  assert.notEqual(validateBusinessMessage(' ', 'Body'), null);
  assert.notEqual(validateBusinessMessage('Title', '\n '), null);
  assert.equal(validateBusinessMessage('Title', 'a'.repeat(1500), 2048), null);
  assert.notEqual(validateReply('a'.repeat(1500)), null);
  const state = freshState();
  state.mode = 'business';
  const before = JSON.stringify(state);
  assert.notEqual(addBusinessMessage(state, 'customer-sam', 'Title', '🙂'.repeat(256)), null);
  assert.notEqual(addBusinessMessage(state, 'fietsatelier', 'Title', 'Body'), null);
  assert.equal(JSON.stringify(state), before);
});

test('both roles see the same exchange with separate read state and inboxes', () => {
  const state = freshState();
  markRead(state, 'studio-noord');
  state.mode = 'business';
  assert.equal(conversationsFor(state).length, 3);
  assert.equal(conversationsFor(state, { query: '6291-KVN-DPT' })[0].name, 'Sam Vermeer');
  assert.equal(addBusinessMessage(state, 'studio-noord', '  Update  ', '  Je bestelling is klaar.  '), null);
  assert.equal(unreadFor('studio-noord', state), 0);
  const sent = messagesFor('studio-noord', state).at(-1);
  assert.deepEqual({ from: sent.from, title: sent.title, text: sent.text, local: sent.local }, {
    from: 'business', title: 'Update', text: 'Je bestelling is klaar.', local: true,
  });
  state.mode = 'personal';
  assert.equal(unreadFor('studio-noord', state), 1);
  assert.equal(conversationsFor(state, { query: 'Sam Vermeer' }).length, 0);
  assert.equal(addReply(state, 'studio-noord', 'Dank je wel!'), null);
  assert.equal(unreadFor('studio-noord', state), 0);
  assert.equal(unreadFor('studio-noord', state, 'business'), 1);
  state.mode = 'business';
  assert.equal(conversationsFor(state, { unreadOnly: true }).length, 3);
  markRead(state, 'studio-noord');
  assert.equal(unreadFor('studio-noord', state), 0);
  assert.equal(totalUnread(state), 2);
  assert.equal(addBusinessMessage(state, 'customer-sam', 'Hallo', 'Welkom terug'), null);
  state.mode = 'personal';
  assert.equal(totalUnread(state), 1);
  assert.equal(contactsFor(state).some((contact) => contact.id === 'customer-sam'), false);
});

test('customer codes create one business conversation and existing codes reopen it', () => {
  const state = freshState();
  state.mode = 'business';
  const result = addCustomer(state, ' 9876–abc–def ', '  Alex  ', 1000);
  assert.equal(result.created, true);
  assert.equal(conversationsFor(state, { query: '9876-ABC-DEF' }).length, 1);
  const chat = conversationsFor(state).find((contact) => contact.id === result.id);
  assert.equal(chat.name, 'Alex');
  assert.equal(chat.hasMessages, false);
  assert.deepEqual(addCustomer(state, '9876-ABC-DEF', 'Other name'), { id: result.id, created: false });
  assert.deepEqual(addCustomer(state, '7483-RGY-RCH'), { id: 'studio-noord', created: false });
  assert.ok(addCustomer(state, 'not-a-code').error);
  assert.equal(state.customers.length, 1);
  assert.equal(addBusinessMessage(state, result.id, 'Hallo', 'Welkom'), null);
  assert.equal(messagesFor(result.id, state).length, 1);
  state.mode = 'personal';
  assert.equal(conversationsFor(state, { query: 'Alex' }).length, 0);
  const before = JSON.stringify(state);
  assert.notEqual(addReply(state, result.id, 'Cannot reply from unrelated profile'), null);
  assert.equal(JSON.stringify(state), before);
});

test('business profile, role, customers and role-specific preferences survive reloads', () => {
  const state = freshState();
  state.mode = 'business';
  state.business = { name: 'Klein Atelier', email: 'hallo@atelier.example', demoVerification: 'inactive', profile: {description:'',phone:'',website:'',socials:{instagram:'',facebook:'',linkedin:''},hours:{Maandag:'',Dinsdag:'',Woensdag:'',Donderdag:'',Vrijdag:'',Zaterdag:'',Zondag:''},actions:[],logo:''}, theme: 'white', customTheme: { accent: '#245c91', tint: '#e5f1fc', ink: '#173e65', background: '#ffffff', foreground: '#263326' } };
  const { id } = addCustomer(state, '9876-ABC-DEF', 'Alex');
  state.mutedBusiness.push(id);
  markRead(state, 'customer-sam');
  addBusinessMessage(state, id, 'Update', 'Alles klaar');
  addBusinessMessage(state, 'studio-noord', 'Een update', 'Tot zo!');
  const restored = restoreState(JSON.stringify(state));
  assert.equal(restored.mode, 'business');
  assert.deepEqual(restored.business, state.business);
  assert.deepEqual(restored.mutedBusiness, [id]);
  assert.deepEqual(restored.muted, []);
  assert.ok(restored.readBusiness.includes('customer-sam'));
  assert.equal(restored.read.includes('customer-sam'), false);
  assert.equal(restored.customers[0].code, '9876-ABC-DEF');
  assert.equal(messagesFor(id, restored).at(-1).title, 'Update');
  assert.equal(unreadFor('studio-noord', restored, 'personal'), 3);
  assert.equal(contactsFor(restored, 'personal')[0].name, 'Klein Atelier');
});

test('old personal-only storage migrates without losing local replies or preferences', () => {
  const restored = restoreState(JSON.stringify({
    version: 1, name: 'Perry', preferences: { sound: true }, read: ['fietsatelier'], muted: ['pakket-co'],
    replies: { 'studio-noord': [{ text: 'Bedankt', at: Date.now(), local: true }] },
  }));
  assert.equal(restored.mode, 'personal');
  assert.equal(restored.name, 'Perry');
  assert.equal(restored.preferences.sound, true);
  assert.deepEqual(restored.muted, ['pakket-co']);
  assert.equal(messagesFor('studio-noord', restored).at(-1).from, 'customer');
  assert.equal(restored.business.name, 'Studio Noord');
  assert.equal(contactsFor(restored, 'business').length, 3);
});

test('malformed business storage drops bad customers and over-limit business messages', () => {
  const now = Date.now();
  const restored = restoreState(JSON.stringify({ version: 1, mode: 'other',
    business: { name: '', email: 'invalid' },
    customers: [null, { code: 'not-a-code', name: 'bad' }, { code: '7483-RGY-RCH', name: 'duplicate' },
      { code: '9876-ABC-DEF', name: 'Alex', addedAt: 1e30 }, { code: '9876-ABC-DEF', name: 'duplicate' }],
    replies: { 'customer-sam': [
      { from: 'business', text: 'Missing title', at: now },
      { from: 'business', title: 'Title', text: 'a'.repeat(1024), at: now },
      { from: 'business', title: 'Title', text: 'Valid', at: now },
    ] },
  }), now);
  assert.equal(restored.mode, 'personal');
  assert.equal(restored.business.name, 'Studio Noord');
  assert.equal(restored.business.email, 'hallo@studio-noord.example');
  assert.equal(restored.customers.length, 1);
  assert.equal(restored.customers[0].addedAt, now);
  assert.equal(restored.replies['customer-sam'].length, 1);
  assert.equal(restored.replies['customer-sam'][0].title, 'Title');
});


test('white, dark and custom themes persist across reloads without affecting other companies', async () => {
  const { BUSINESS_THEMES, setBusinessTheme, businessThemeFor } = await import('../public/model.js');
  const state = freshState();
  assert.equal(state.business.theme, 'white');
  assert.equal(setBusinessTheme(state,'black'),true);
  assert.equal(businessThemeFor(state,'customer-sam','business').background, '#161c19');
  const colors = { accent:'#aabbcc',tint:'#112233',ink:'#fefefe',background:'#101010',foreground:'#ffffff' };
  assert.equal(setBusinessTheme(state,'custom',colors),true);
  assert.equal(restoreState(JSON.stringify(state)).business.customTheme.accent,'#aabbcc');
  assert.deepEqual(businessThemeFor(state,'studio-noord','personal'),colors);
  assert.deepEqual(businessThemeFor(state,'fietsatelier','personal'),BUSINESS_THEMES.white);
  assert.equal(setBusinessTheme(state,'custom',{...colors,accent:'red;inject'}),false);
  assert.equal(restoreState(JSON.stringify({version:1,business:{theme:'unknown'}})).business.theme,'white');
});

test('custom mode can be opened before colors are submitted and retains saved colors', async () => {
  const { setBusinessTheme, businessThemeFor } = await import('../public/model.js');
  const state = freshState();
  assert.equal(setBusinessTheme(state, 'custom'), true);
  assert.equal(state.business.theme, 'custom');
  const saved = { accent:'#112233',tint:'#eaeaea',ink:'#111111',background:'#202020',foreground:'#ffffff' };
  assert.equal(setBusinessTheme(state,'custom',saved),true);
  assert.deepEqual(businessThemeFor(state,'studio-noord','personal'), saved);
  assert.equal(setBusinessTheme(state,'black'),true);
  assert.equal(setBusinessTheme(state,'custom'),true);
  assert.deepEqual(businessThemeFor(state,'studio-noord','personal'), saved);
  assert.deepEqual(restoreState(JSON.stringify(state)).business.customTheme, saved);
  assert.equal(setBusinessTheme(state,'custom',{...saved,accent:'red'}),false);
});

test('full business UI themes expose valid contrasting backgrounds and preserve personal isolation', async () => {
  const { BUSINESS_THEMES, businessThemeFor, setBusinessTheme } = await import('../public/model.js');
  const state = freshState();
  for (const theme of ['white','black']) {
    assert.equal(setBusinessTheme(state,theme),true);
    const palette=businessThemeFor(state,'customer-sam','business');
    assert.match(palette.background,/^#[a-f0-9]{6}$/i);
    assert.match(palette.foreground,/^#[a-f0-9]{6}$/i);
    assert.notEqual(palette.background,palette.foreground);
    assert.deepEqual(businessThemeFor(state,'fietsatelier','personal'), BUSINESS_THEMES.white);
  }
});

test('company profile validates external links and persists optional public fields', async () => {
  const { cleanBusinessProfile, safeExternalUrl } = await import('../public/model.js');
  assert.equal(safeExternalUrl('javascript:alert(1)'), '');
  assert.equal(safeExternalUrl('http://example.com'), '');
  assert.equal(safeExternalUrl('https://user:pass@example.com'), '');
  const profile=cleanBusinessProfile({description:'Garage onderhoud',phone:'+31 45 123 4567',website:'https://garage.example/afspraak',hours:{Maandag:'09:00–17:00'},actions:[{label:'Afspraak maken',url:'https://garage.example/afspraak'},{label:'Onveilig',url:'javascript:alert(1)'}],socials:{instagram:'https://instagram.com/example'},logo:'data:image/png;base64,aGVsbG8='});
  assert.equal(cleanBusinessProfile(null).description,'');
  assert.equal(restoreState(JSON.stringify({version:1,name:'Robin',business:{profile:null}})).name,'Robin');
  assert.equal(profile.actions.length,1);
  assert.equal(profile.website,'https://garage.example/afspraak');
  assert.equal(profile.hours.Maandag,'09:00–17:00');
  assert.equal(profile.actions[0].label,'Afspraak maken');
  assert.equal(profile.logo,'data:image/png;base64,aGVsbG8=');
  const state=freshState();state.business.profile=profile;
  assert.deepEqual(restoreState(JSON.stringify(state)).business.profile,profile);
});

test('business can send a plain chat message without title; structured templates still require one', () => {
  const state = freshState();
  state.mode = 'business';
  assert.equal(validateBusinessMessage('', 'Hallo', MESSAGE_LIMITS.business, false), null);
  assert.notEqual(validateBusinessMessage('', 'Hallo'), null);
  assert.equal(addBusinessMessage(state, 'customer-sam', '', 'Hallo in de chat'), null);
  const sent = messagesFor('customer-sam', state).at(-1);
  assert.equal(sent.title, '');
  assert.equal(sent.text, 'Hallo in de chat');
  assert.notEqual(addBusinessMessage(state, 'customer-sam', '', 'x'.repeat(1025)), null);
});

test('stored logo sanitization permits a compressed 100 KiB image but rejects oversized data', async () => {
  const { cleanBusinessProfile } = await import('../public/model.js');
  const valid = 'data:image/webp;base64,' + Buffer.alloc(100*1024).toString('base64');
  assert.equal(cleanBusinessProfile({logo: valid}).logo, valid);
  const huge = 'data:image/webp;base64,' + Buffer.alloc(102*1024).toString('base64');
  assert.equal(cleanBusinessProfile({logo: huge}).logo, '');
});
