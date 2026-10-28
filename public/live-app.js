import { conversationExport,downloadConversation } from './conversation-actions.js';
import { showSettings,closeSettings,settingsDialog,conversationControls } from './session-ui.js';
import { ConapptClient } from './client.js';
import { startBenchmarkLabel } from './benchmark.js';
import { optimizeCompanyLogo } from './logo.js';
import { deviceGet,deviceSet } from './device-store.js';
import { escapeHtml as html,byteLength,cleanBusinessProfile,safeExternalUrl,BUSINESS_THEMES,PROFILE_DAYS } from './model.js';
import { INDUSTRIES,industryFor,searchIndustries,quickActionsFor,messageFromAction } from './business-templates.js';
import { REPORT_REASONS,USER_REPORT_REASONS,validateReport } from './report-options.js';
import { contactCode } from './contact-code.js';
import { icon } from './icons.js';

const client=new ConapptClient();
const main=document.querySelector('#main'),dialog=document.querySelector('#app-dialog');
const drafts=new Map();
let query='',industryQuery='',industryLimit=12,scanner,toastTimer,sending=false,editing=false,logoDraft;
let online=true,settingsContactId;
const business=()=>client.role==='business';
const route=()=>{const [page='gesprekken',id]=location.hash.slice(1).split('/');return {page,id};};
const contact=id=>client.contacts.find(item=>item.accountId===id);
const label=item=>item.alias||item.name||'Conappt-gebruiker';
const button=(text,action,extra='',secondary=false)=>'<button type="button" class="button '+(secondary?'secondary':'')+'" data-action="'+action+'" '+extra+'>'+text+'</button>';
const errorLine='<p class="form-error" role="alert" data-error hidden></p>';
function toast(text) {
  const element=document.querySelector('#toast');clearTimeout(toastTimer);
  element.textContent=text;element.classList.add('visible');
  toastTimer=setTimeout(()=>element.classList.remove('visible'),4000);
}
function setError(form,error) {
  const element=form.querySelector('[data-error]');
  if(element){element.textContent=error.message||String(error);element.hidden=false;}
  else toast(error.message||String(error));
}
function openDialog(content) {
  if(dialog.open) dialog.close();
  dialog.innerHTML=content;
  const heading=dialog.querySelector('h2');heading.id='dialog-heading';dialog.setAttribute('aria-labelledby',heading.id);
  dialog.showModal();
}
const closeButton=()=>button('Sluiten','close-dialog','',true);
function go(hash) {
  if(location.hash==='#'+hash) render();
  else location.hash=hash;
}
function avatar(item,extra='') {
  if(item.profile?.logo) return '<img class="avatar company-avatar '+extra+'" src="'+html(item.profile.logo)+'" alt="">';
  return '<span class="avatar sage '+extra+'" aria-hidden="true">'+html(Array.from(label(item))[0]?.toLocaleUpperCase('nl')||'C')+'</span>';
}
function header(title,subtitle,eyebrow='CONAPPT') {
  return '<header class="page-header"><div><p class="eyebrow">'+eyebrow+'</p><h1>'+html(title)+'</h1><p class="page-subtitle">'+html(subtitle)+'</p></div><span class="preview-pill connection-status">'+(online?'Verbonden':'Verbinding herstellen…')+'</span></header>';
}
function messages(id) {
  return [...client.history.messages.filter(item=>item.contactId===id),
    ...client.history.pending.filter(item=>item.contactId===id).map(item=>({...item,own:true,pending:true}))].sort((a,b)=>a.at-b.at);
}
function unread(id) {
  return messages(id).filter(item=>!item.own && item.at>(client.history.read[id]||0)).length;
}
function navigation() {
  const {page,id}=route();
  document.querySelector('.desktop-navigation').innerHTML='';
  document.querySelector('.mobile-navigation').innerHTML='';
  document.querySelectorAll('[data-profile-name]').forEach(el=>el.textContent=client.account?(business()?client.account.name:'Mijn Conappt'):'Welkom');
  document.querySelectorAll('[data-profile-initial]').forEach(el=>{if(business()&&client.account?.profile?.logo)el.innerHTML='<img class="profile-logo-image" src="'+html(client.account.profile.logo)+'" alt="">';else el.textContent=client.account?Array.from(client.account.name)[0]:'C';});
  document.querySelectorAll('[data-profile-role]').forEach(el=>el.textContent=business()?'Zakelijk · wissel profiel':'Persoonlijk · wissel profiel');
  document.querySelectorAll('[data-mode-label]').forEach(el=>el.textContent=client.account?(business()?'Zakelijk':'Persoonlijk'):'Start');
  document.querySelectorAll('[data-mode-icon]').forEach(el=>el.innerHTML=business()&&client.account?.profile?.logo?'<img class="mode-logo-image" src="'+html(client.account.profile.logo)+'" alt="">':icon(business()?'business':'person'));
  const themeAccount=business()?client.account:((page==='gesprek'||page==='bedrijf')?contact(id):null);
  const theme=themeAccount?.theme==='custom'?themeAccount.customTheme:BUSINESS_THEMES[themeAccount?.theme||'white'];
  const active=Boolean(themeAccount?.kind==='business'&&theme);
  document.body.classList.toggle('business-theme-active',active);
  document.body.classList.toggle('customer-company-chat-theme',active&&!business());
  for(const [key,value] of Object.entries(theme||BUSINESS_THEMES.white)) {
    if(key==='label')continue;
    document.body.style.setProperty('--business-'+key,value);
    document.body.style.setProperty('--chat-'+key,value);
  }
  document.body.style.colorScheme=active&&themeAccount.theme==='black'?'dark':'light';
}
function welcome(message='') {
  document.body.classList.remove('is-chat','business-theme-active');
  main.innerHTML=header('Korte lijntjes. Zo geregeld.','Voor jezelf en voor je bedrijf. Gratis, zonder telefoonnummer of e-mailadres.')+
    '<div class="start-grid"><section class="card start-panel"><span class="start-icon">'+icon('person')+'</span><h2>Voor jezelf</h2><p>Maak je eigen code. Laat een bedrijf die scannen en ontvang je updates op één plek.</p>'+
    button('Maak mijn code '+icon('arrow'),'start-personal')+'</section><section class="card start-panel"><span class="start-icon">'+icon('business')+'</span><h2>Voor je bedrijf</h2><p>Vul je bedrijfsnaam in. Je kunt daarna meteen klanten verbinden en berichten sturen.</p>'+
    '<form id="signup-business"><label class="field-label" for="signup-name">Bedrijfsnaam</label><input class="text-input" id="signup-name" name="name" maxlength="80" autocomplete="organization" required><button class="button" type="submit">Start je bedrijf '+icon('arrow')+'</button>'+errorLine+'</form></section></div>'+
    (message?'<p class="form-error" role="alert">'+html(message)+'</p>':'')+
    '<p class="field-help live-footnote">Je profiel blijft op dit apparaat beschikbaar. <a href="/?preview=1#home">Bekijk de voorbeeldomgeving</a></p>';
  navigation();
}
function row(item) {
  const history=messages(item.accountId),last=history.at(-1),count=unread(item.accountId);
  return '<div class="session-row"><a class="conversation-row '+(count?'has-unread':'')+'" href="#gesprek/'+item.accountId+'">'+avatar(item)+
    '<div class="conversation-copy"><div class="conversation-top"><span class="conversation-name">'+html(label(item))+'</span>'+(client.preferences(item.accountId).pinned?'<span class="conversation-pin" role="img" aria-label="Vastgezet">'+icon('pin')+'</span>':'')+(last?'<time class="conversation-time">'+new Intl.DateTimeFormat('nl',{hour:'2-digit',minute:'2-digit'}).format(last.at)+'</time>':'')+
    '</div><div class="conversation-bottom"><span class="conversation-preview">'+html(item.messagingBlocked?'Geblokkeerd':last?(last.own?'Jij: ':'')+(last.title||last.text):'Verbonden · stuur je eerste bericht')+'</span>'+(count?'<span class="unread-badge">'+count+'</span>':'')+'</div></div></a><button class="icon-button session-settings" data-action="settings" data-id="'+item.accountId+'" aria-label="Instellingen voor '+html(label(item))+'">'+icon('settings')+'</button></div>';
}
function rows(items=client.contacts) {
  return items.length?items.map(row).join(''):'<div class="empty-state">'+icon('chat')+'<h2>Je eerste gesprek begint hier.</h2><p>'+(business()?'Scan de code van je klant om contact te maken.':'Laat een bedrijf je QR-code scannen. Het gesprek verschijnt hier vanzelf.')+'</p></div>';
}
function inbox() {
  main.innerHTML='<section class="sessions-view"><header class="sessions-header"><div><p class="eyebrow">'+(business()?html(client.account.name):'CONAPPT')+'</p><h1>'+(business()?'Klantgesprekken':'Gesprekken')+'</h1></div><button class="icon-button" data-action="settings" aria-label="Instellingen">'+icon('settings')+'</button></header>'+
    '<div class="session-shortcuts">'+(business()?button(icon('plus')+' Klant verbinden','connect'):'<button class="button secondary live-device-code" data-action="show-qr" aria-label="Toon QR-code">'+icon('qr')+'<span>'+html(client.account.code)+'</span></button>')+'<span class="connection-status" role="status">'+(online?'Verbonden':'Verbinding herstellen…')+'</span></div>'+
    '<div class="inbox-toolbar"><div class="search-field">'+icon('search')+'<label class="sr-only" for="conversation-search">Zoek een gesprek</label><input id="conversation-search" type="search" placeholder="Zoek een gesprek…" value="'+html(query)+'"></div></div><section class="conversation-list" id="conversation-list" aria-label="Gesprekken"></section></section>';
  updateInbox();
}
function updateInbox() {
  const element=document.querySelector('#conversation-list');
  if(element) {
    const items=client.contacts.filter(item=>label(item).toLocaleLowerCase('nl').includes(query.toLocaleLowerCase('nl'))).sort((a,b)=>Number(client.preferences(b.accountId).pinned)-Number(client.preferences(a.accountId).pinned)||(messages(b.accountId).at(-1)?.at||0)-(messages(a.accountId).at(-1)?.at||0));
    element.innerHTML=items.length?rows(items):query?'<div class="empty-state"><h2>Geen gesprekken gevonden</h2><p>Probeer een andere naam.</p></div>':rows(items);
  }
}
function renderMessage(message) {
  return '<div class="message '+(message.own?'outgoing':'incoming')+'"><div class="message-body">'+
    (message.title&&message.title!=='Reactie'?'<h2 class="message-title">'+html(message.title)+'</h2>':'')+
    '<p class="message-text">'+html(message.text)+'</p><div class="message-meta"><time>'+new Intl.DateTimeFormat('nl',{hour:'2-digit',minute:'2-digit'}).format(message.at)+'</time>'+
    (message.pending?'<button class="text-link plain-button" data-action="retry-message" data-id="'+message.id+'">Niet bevestigd · opnieuw proberen</button>':message.own?icon('check'):'')+'</div></div></div>';
}
function thread(id,scroll=false) {
  const element=document.querySelector('#message-thread');if(!element)return;
  const nearBottom=element.scrollHeight-element.scrollTop-element.clientHeight<100;
  const history=messages(id);
  element.innerHTML=history.length?history.map(renderMessage).join(''):'<div class="thread-empty"><h2>Jullie zijn verbonden.</h2><p>Stuur je eerste bericht.</p></div>';
  if(scroll||nearBottom)element.scrollTop=element.scrollHeight;
  const newest=history.filter(item=>!item.own).at(-1);
  if(newest&&client.history.read[id]!==newest.at){client.history.read[id]=newest.at;void client.saveHistory().catch(error=>toast(error.message));}
}
function chat(id) {
  const item=contact(id);
  if(!item){main.innerHTML=header('Gesprek niet gevonden','Open je gesprekken om verder te gaan.');return;}
  const draft=drafts.get(client.account.accountId+':'+id)||{title:'',text:''};
  const tools=business()?quickActionsFor(client.account.industryId):[];
  main.innerHTML='<section class="chat-panel live-chat" aria-label="Gesprek met '+html(label(item))+'"><header class="chat-header"><a class="icon-button chat-back" href="#gesprekken" aria-label="Terug naar gesprekken">'+icon('back')+'</a>'+avatar(item)+
    '<div class="chat-identity"><h1 class="chat-business-name">'+(business()?html(label(item)):'<a class="company-chat-link" href="#bedrijf/'+id+'">'+html(label(item))+'</a>')+'</h1><span class="chat-business-detail">'+(business()?html(item.code):'Bedrijfsprofiel')+'</span></div><div class="chat-header-actions">'+
    (!business()?'<button class="icon-button" data-action="report" data-id="'+id+'" aria-label="Bedrijf melden" title="Bedrijf melden">'+icon('flag')+'</button>':'')+'<button class="icon-button" data-action="settings" data-id="'+id+'" aria-label="Gespreksinstellingen">'+icon('settings')+'</button></div></header>'+
    '<p class="conversation-block-notice" id="conversation-block-notice" role="status" '+(item.messagingBlocked?'':'hidden')+'>Dit gesprek is geblokkeerd. Nieuwe berichten zijn niet beschikbaar.</p><div class="thread" id="message-thread" role="log" aria-label="Berichten"></div>'+
    '<div class="composer-wrap">'+(business()?'<div class="quick-tools"><div><strong>Snelle berichten</strong><button class="text-link plain-button" data-action="industries">'+html(industryFor(client.account.industryId)?.label||'Kies een bedrijfstemplate')+'</button></div><div class="quick-tool-buttons">'+tools.map(action=>button(html(action.label)+(action.fields.length?'…':icon('send')),'quick-message','data-id="'+action.id+'" title="'+html(action.text)+'"',true)).join('')+'</div></div>':'')+
    '<form class="composer" id="reply-form" data-id="'+id+'">'+
    '<div class="composer-row"><label class="sr-only" for="reply">Bericht</label><textarea id="reply" name="text" rows="1" placeholder="'+('Schrijf je bericht…')+'" required>'+html(draft.text)+'</textarea><button class="button send-button" type="submit" aria-label="Bericht versturen">'+icon('send')+'</button></div>'+errorLine+'</form>'+
    '<div class="composer-help"><span>Berichten worden opgehaald zolang Conappt openstaat.</span><span id="byte-count"></span></div></div></section>';
  thread(id,true);composer();
}
function composer() {
  const form=document.querySelector('#reply-form');if(!form)return;
  const blocked=Boolean(contact(form.dataset.id)?.messagingBlocked);
  form.elements.text.disabled=blocked;
  const notice=document.querySelector('#conversation-block-notice');if(notice)notice.hidden=!blocked;
  document.querySelectorAll('[data-action="quick-message"]').forEach(el=>el.disabled=blocked||sending);
  const size=byteLength(form.elements.text.value);
  document.querySelector('#byte-count').textContent=size+' / 1024 bytes';
  form.querySelector('[type="submit"]').disabled=blocked||sending||!form.elements.text.value.trim()||size>1024;
}
function profile(id) {
  const own=business()&&id===client.account.accountId,item=own?client.account:contact(id);
  if(!item||item.kind!=='business'){main.innerHTML=header('Bedrijf niet gevonden','Open het bedrijf vanuit je gesprek.');return;}
  const p=cleanBusinessProfile(item.profile);
  if(own&&editing){profileEditor(item,p);return;}
  const external=(title,url)=>url?'<a class="button secondary" href="'+html(url)+'" target="_blank" rel="noopener noreferrer">'+html(title)+' ↗</a>':'';
  main.innerHTML='<section class="company-profile"><div class="company-profile-toolbar"><a class="text-link" href="'+(own?'#gesprekken':'#gesprek/'+id)+'">← Terug</a>'+
    (own?button('Profiel bewerken','edit-profile'):button(icon('flag')+' Bedrijf melden','report','data-id="'+id+'"',true))+'</div><div class="company-profile-hero">'+avatar(item,'company-logo-fallback')+
    '<div><h1>'+html(item.name)+'</h1><p>'+html(p.description||'Welkom bij ons bedrijfsprofiel.')+'</p></div></div>'+
    (p.phone||p.website||Object.values(p.socials).some(Boolean)?'<section class="card company-profile-section"><h2>Contact</h2>'+(p.phone?'<p><a href="tel:'+html(p.phone.replace(/[^+0-9]/g,''))+'">'+html(p.phone)+'</a></p>':'')+'<div class="company-actions">'+external('Website',p.website)+Object.entries(p.socials).map(([name,url])=>external(name,url)).join('')+'</div></section>':'')+
    (Object.values(p.hours).some(Boolean)?'<section class="card company-profile-section"><h2>Openingstijden</h2>'+PROFILE_DAYS.map(day=>p.hours[day]?'<div class="company-hour"><strong>'+day+'</strong><span>'+html(p.hours[day])+'</span></div>':'').join('')+'</section>':'')+
    (p.actions.length?'<section class="card company-profile-section"><h2>Wat wil je doen?</h2><div class="company-actions">'+p.actions.map(action=>external(action.label,action.url)).join('')+'</div></section>':'')+'</section>';
}
function field(name,title,value='',type='text',extra='') {
  return '<label class="field-label" for="'+name+'">'+title+'</label><input class="text-input" id="'+name+'" name="'+name+'" type="'+type+'" value="'+html(value)+'" '+extra+'>';
}
function profileEditor(item,p) {
  logoDraft=p.logo;
  main.innerHTML='<div class="company-profile-toolbar"><h1>Je bedrijfsprofiel</h1>'+button('Annuleren','cancel-edit','',true)+'</div><form id="company-profile-form" class="company-profile-form"><section class="card company-editor-panel">'+
    '<div class="live-brand-editor"><label class="live-logo-editor" for="company-logo">'+avatar(item,'company-logo-fallback')+'<span>'+icon('edit')+' Logo wijzigen</span><input id="company-logo" type="file" accept="image/*" class="sr-only"></label><div>'+field('company-name','Bedrijfsnaam',item.name,'text','maxlength="80" required')+
    '<label class="field-label" for="company-description">Beschrijving</label><textarea class="text-input" id="company-description" name="description" rows="4" maxlength="500">'+html(p.description)+'</textarea></div></div><p class="field-help" id="logo-feedback">Afbeeldingen worden vierkant uitgesneden en verkleind tot maximaal 100 KB</p>'+button('Logo verwijderen','remove-logo','',true)+'</section>'+
    '<details class="card company-editor-panel"><summary>Contactgegevens</summary>'+field('company-phone','Telefoonnummer (optioneel)',p.phone)+field('company-website','Website (optioneel)',p.website,'url')+
    ['instagram','facebook','linkedin'].map(key=>field('social-'+key,key,p.socials[key],'url')).join('')+'</details>'+
    '<details class="card company-editor-panel"><summary>Openingstijden</summary><div class="company-hour-fields">'+PROFILE_DAYS.map(day=>'<div>'+field('hours-'+day,day,p.hours[day])+'</div>').join('')+'</div></details>'+
    '<section class="card company-editor-panel"><h2>Actieknoppen</h2><p class="field-help">Optioneel. Open bijvoorbeeld je eigen reserveringspagina.</p>'+
    [0,1,2].map(i=>'<details class="live-action-editor" '+(p.actions[i]?'open':'')+'><summary>Actie '+(i+1)+'</summary>'+field('action-label-'+i,'Knoptekst',p.actions[i]?.label||'','text','maxlength="35"')+field('action-url-'+i,'Link (https://)',p.actions[i]?.url||'','url')+'</details>').join('')+'</section>'+
    '<div class="company-form-footer"><button class="button" type="submit">Bedrijfsprofiel opslaan</button>'+errorLine+'</div></form>';
}
function settings(id) {
  settingsContactId=id;
  const item=contact(id);
  if(id) {
    if(!item){toast('Gesprek niet gevonden.');return;}
    showSettings('<section class="card settings-card session-context">'+avatar(item)+'<h3>'+html(label(item))+'</h3><a class="button secondary" href="#gesprek/'+item.accountId+'">Open gesprek</a> '+(!business()?'<a class="button secondary" href="#bedrijf/'+item.accountId+'">Bedrijfsprofiel</a>':'')+'</section>'+conversationControls({id,...client.preferences(id),blocked:item.blocked,targetKind:item.kind}),'Gespreksinstellingen');
    return;
  }
  const a=client.account;
  const content=(business()?'<section class="card settings-card"><h2>Je bedrijf</h2><p>'+html(a.name)+'</p><a class="button secondary" href="#bedrijf/'+a.accountId+'">Bedrijfsprofiel bekijken</a> '+button('Bedrijfstemplate','industries','',true)+'</section>':
    '<section class="card settings-card"><h2>Hoe wil je genoemd worden?</h2><p>Een bijnaam is genoeg. Dit is optioneel.</p><form id="personal-profile">'+field('personal-name','Naam of bijnaam',a.name==='Conappt-gebruiker'?'':a.name,'text','maxlength="80"')+'<button class="button" type="submit">Opslaan</button>'+errorLine+'</form></section>')+
    (business()?'<section class="card settings-card"><h2>Bedrijfsthema</h2><p>Ook je klanten zien dit thema in hun gesprek met jou.</p><div class="theme-options">'+Object.entries(BUSINESS_THEMES).map(([key,value])=>button(html(value.label),'theme','data-id="'+key+'" aria-pressed="'+(a.theme===key)+'"',a.theme!==key)).join('')+'</div>'+
    (a.theme==='custom'?'<form id="custom-theme" class="theme-custom-fields">'+[['accent','Accent'],['tint','Berichtachtergrond'],['ink','Berichttekst'],['background','Achtergrond'],['foreground','Tekst']].map(([key,title])=>field(key,title,a.customTheme?.[key]||BUSINESS_THEMES.white[key],'color')).join('')+'<button class="button" type="submit">Thema opslaan</button>'+errorLine+'</form>':'')+'</section>':'')+
    '<section class="card settings-card"><h2>Dit apparaat</h2><p>Conappt ververst je gesprekken zolang de app openstaat. Achtergrondmeldingen en het overzetten naar een ander apparaat zijn nog niet beschikbaar.</p>'+button('Wissel van profiel','switch-account','',true)+'</section>';
  showSettings(content);
}

function render() {
  if(!client.account){welcome();return;}
  let {page,id}=route();
  const legacySettings=page==='instellingen';
  if(page==='home'||legacySettings){page='gesprekken';history.replaceState(null,'','#gesprekken');}
  document.body.classList.toggle('is-chat',page==='gesprek'&&Boolean(contact(id)));
  if(page==='gesprekken')inbox();
  else if(page==='gesprek')chat(id);
  else if(page==='bedrijf')profile(id);
  else inbox();
  if(legacySettings)settings();
  navigation();
  document.title=(page==='gesprek'?label(contact(id)||{}):business()?client.account.name:'Mijn inbox')+' · Conappt';
}
async function showQr() {
  openDialog('<h2>Laat je code scannen</h2><p>Het bedrijf scant deze QR-code vanuit Conappt. Jullie gesprek verschijnt daarna vanzelf.</p><canvas id="contact-qr" class="contact-qr" role="img" aria-label="Conappt QR-code"></canvas><p class="qr-code-label">'+html(client.account.code)+'</p><div class="dialog-actions">'+button('Kopieer code','copy-code','',true)+closeButton()+'</div>');
  const {drawContactQr}=await import('./qr.js');
  const canvas=dialog.querySelector('#contact-qr');
  if(canvas)drawContactQr(canvas,client.account.code);
}
function connectDialog(code='') {
  if(!business()){toast('Wissel naar je bedrijfsprofiel om een klant te verbinden.');return;}
  openDialog('<h2>Klant verbinden</h2><p>Laat je klant op de Conappt-code tikken. Scan de QR-code of vul de code in.</p>'+
    '<div id="scanner-area" hidden><video id="scanner-video" class="scanner-video" playsinline muted></video><p class="field-help" id="scanner-status" role="status">Houd de QR-code voor de camera.</p></div>'+
    button(icon('scan')+' Scan QR-code','start-scan')+
    '<form id="connect-form">'+field('customer-code','Conappt-code',code,'text','placeholder="7483-RGY-RCH" autocomplete="off" autocapitalize="characters" required')+
    field('customer-alias','Naam voor jouw overzicht (optioneel)','','text','maxlength="60"')+errorLine+'<div class="dialog-actions">'+closeButton()+'<button class="button" type="submit">Verbinden</button></div></form>');
}
function industries() {
  industryQuery='';industryLimit=12;
  openDialog('<h2>Bedrijfstemplates</h2><p>Kies wat bij je bedrijf past. Je snelle berichtknoppen staan daarna klaar in je klantgesprekken.</p>'+
    '<div class="search-field">'+icon('search')+'<label class="sr-only" for="industry-search">Zoek een bedrijfstemplate</label><input id="industry-search" type="search" placeholder="Bijvoorbeeld garage, kapper of loodgieter…"></div><p id="industry-count" class="field-help" role="status"></p><div id="industry-results" class="industry-results"></div><div class="dialog-actions">'+closeButton()+'</div>');
  industryResults();
}
function industryResults() {
  const matches=searchIndustries(industryQuery);
  document.querySelector('#industry-count').textContent=matches.length+' bedrijfstemplates';
  document.querySelector('#industry-results').innerHTML=matches.slice(0,industryLimit).map(item=>'<button class="industry-choice" data-action="choose-industry" data-id="'+item.id+'"><span class="industry-icon">'+icon('business')+'</span><span><strong>'+html(item.label)+'</strong><small>'+html(item.category)+' · '+quickActionsFor(item.id).length+' snelle berichten</small></span>'+icon(client.account.industryId===item.id?'check':'arrow')+'</button>').join('')+
    (matches.length>industryLimit?button('Meer bekijken','more-industries','',true):!matches.length?'<p>Geen template gevonden. Probeer een andere zoekterm of kies ‘Ander bedrijf’.</p>':'');
}
function reportDialog(id) {
  const item=contact(id);
  if(!item)return;
  const user=item.kind==='personal';
  openDialog('<h2>'+(user?'Gebruiker melden':'Bedrijf melden')+'</h2><p>Je meldt <strong>'+html(item.name)+'</strong> bij Conappt.</p><form id="report-form" data-id="'+id+'" data-request-id="'+crypto.randomUUID()+'"><fieldset class="report-reasons"><legend>Wat is er aan de hand?</legend>'+
    (user?USER_REPORT_REASONS:REPORT_REASONS).map(reason=>'<label class="report-reason"><input type="radio" name="reason" value="'+reason.id+'" required><span>'+html(reason.label)+'</span></label>').join('')+'</fieldset>'+
    '<label class="field-label" for="report-details">Toelichting <span id="report-optional">(optioneel)</span></label><textarea class="text-input" name="details" id="report-details" rows="4" maxlength="2000" placeholder="Beschrijf kort wat er misgaat…"></textarea><p class="field-help"><span id="report-count">0</span> / 2000 tekens</p>'+
    '<p class="report-privacy">'+icon('info')+'<span>Je melding wordt met Conappt gedeeld. Je contact kan deze niet bekijken. Je gespreksgeschiedenis wordt niet meegestuurd.</span></p>'+errorLine+
    '<div class="dialog-actions">'+button('Annuleren','close-dialog','',true)+'<button class="button" type="submit">Melding versturen</button></div></form>');
}
async function send(id,title,text,pendingId) {
  if(sending)return;
  sending=true;composer();
  document.querySelectorAll('[data-action="quick-message"]').forEach(el=>el.disabled=true);
  try {
    await client.send(id,title,text,pendingId);
    drafts.delete(client.account.accountId+':'+id);
    if(dialog.open&&dialog.querySelector('#quick-action-form'))dialog.close();
    if(route().page==='gesprek'&&route().id===id)chat(id);
    toast('Bericht verstuurd naar Conappt.');
  } catch(error) {
    const form=dialog.querySelector('#quick-action-form')||document.querySelector('#reply-form');
    if(form)setError(form,error);else toast(error.message);
    thread(id);
  } finally {
    sending=false;composer();
    composer();
  }
}
function profileChoice(role,title,symbol) {
  const account=client.profiles[role];
  const image=account?.profile?.logo;
  return '<button type="button" class="account-choice '+(client.role===role?'selected':'')+'" data-action="choose-role" data-id="'+role+'"><span class="account-choice-icon">'+(image?'<img class="account-logo-image" src="'+html(image)+'" alt="">':icon(symbol))+'</span><span class="account-choice-copy"><strong>'+html(title)+'</strong><small>'+(role==='business'?'Zakelijk profiel':'Persoonlijk profiel')+'</small></span>'+(client.role===role?icon('check'):'')+'</button>';
}
async function switchRole(role) {
  if(sending)throw new Error('Wacht even tot je bericht is verstuurd.');
  if(!await client.restore(role)) {
    if(role==='business') {
      openDialog('<h2>Start je bedrijf</h2><p>Je bedrijfsnaam is genoeg. Je kunt meteen beginnen.</p><form id="signup-business">'+field('signup-name','Bedrijfsnaam','','text','maxlength="80" autocomplete="organization" required')+errorLine+'<div class="dialog-actions">'+closeButton()+'<button class="button" type="submit">Bedrijf aanmaken</button></div></form>');
      return;
    }
    await client.register('personal','');
  }
  if(dialog.open)dialog.close();closeSettings();settingsContactId=undefined;query='';editing=false;go('gesprekken');render();
}
document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
  const action=el.dataset.action;
  try {
    if(action==='start-personal'){el.disabled=true;await client.register('personal','');render();}
    else if(action==='settings')settings(el.dataset.id);
    else if(action==='switch-account') {
      if(!client.account){welcome();return;}
      openDialog('<h2>Wissel van profiel</h2><p>Voor jezelf en voor je bedrijf, in dezelfde app.</p><div class="account-choices">'+
        profileChoice('personal','Persoonlijk','person')+profileChoice('business',client.profiles.business?.name||'Start je bedrijf','business')+'</div><div class="dialog-actions">'+closeButton()+'</div>');
    } else if(action==='choose-role'){el.disabled=true;await switchRole(el.dataset.id);}
    else if(action==='close-dialog')dialog.close();
    else if(action==='show-qr')await showQr();
    else if(action==='copy-code'){await navigator.clipboard.writeText(client.account.code);toast('Code gekopieerd.');}
    else if(action==='connect')connectDialog();
    else if(action==='start-scan') {
      el.disabled=true;document.querySelector('#scanner-area').hidden=false;
      scanner?.abort();scanner=new AbortController();
      try {
        const {scanCustomer}=await import('./qr.js');
        await scanCustomer(document.querySelector('#scanner-video'),{signal:scanner.signal,
          onCode:code=>{const form=dialog.querySelector('#connect-form');if(form){form.elements['customer-code'].value=code;form.requestSubmit();}},
          onError:text=>{const element=document.querySelector('#scanner-status');if(element)element.textContent=text;}});
      } catch(error){const element=document.querySelector('#scanner-status');if(element)element.textContent=error.name==='NotAllowedError'?'Geen cameratoegang. Geef toestemming of vul de code hieronder in.':error.message;el.disabled=false;}
    } else if(action==='industries')industries();
    else if(action==='more-industries'){industryLimit+=12;industryResults();}
    else if(action==='choose-industry'){el.disabled=true;await client.update({industryId:el.dataset.id});dialog.close();render();toast('Je snelle berichtknoppen staan klaar.');}
    else if(action==='quick-message') {
      const item=quickActionsFor(client.account.industryId).find(item=>item.id===el.dataset.id);
      if(!item)return;
      if(!item.fields.length){const message=messageFromAction(item);await send(route().id,message.title,message.text);}
      else openDialog('<h2>'+html(item.label)+'</h2><form id="quick-action-form" data-id="'+item.id+'" data-contact="'+route().id+'">'+item.fields.map(f=>field(f.name,f.label,'',f.type,'required '+(f.type==='number'?'min="0" max="1000000" step="0.01"':'maxlength="200"'))).join('')+errorLine+'<div class="dialog-actions">'+closeButton()+'<button class="button" type="submit">Bericht versturen</button></div></form>');
    } else if(action==='retry-message') {
      const pending=client.history.pending.find(item=>item.id===el.dataset.id);
      if(pending)await send(pending.contactId,pending.title,pending.text,pending.id);
    } else if(action==='pin-chat') {
      const id=el.dataset.id;await client.updateConversation(id,{pinned:!client.preferences(id).pinned});
      if(route().page==='gesprekken')updateInbox();settings(id);
    } else if(action==='export-chat') {
      const id=el.dataset.id,item=contact(id);if(!item)return;
      downloadConversation(id,conversationExport({ownName:business()?client.account.name:'Jij',contactName:label(item),messages:messages(id)}));
    } else if(action==='block-chat') {
      const item=contact(el.dataset.id);if(!item)return;
      openDialog('<h2>'+(item.blocked?'Contact deblokkeren?':'Contact blokkeren?')+'</h2><p>'+(item.blocked?'Je staat nieuwe berichten weer toe, tenzij je contact het gesprek ook heeft geblokkeerd.':'Nieuwe berichten worden in beide richtingen gestopt. Berichten die nog in de verzendwachtrij staan worden niet meer bezorgd. Je bestaande geschiedenis blijft op dit apparaat staan.')+'</p><div class="dialog-actions">'+button('Annuleren','close-dialog','',true)+button(item.blocked?'Deblokkeren':'Blokkeren','confirm-block','data-id="'+item.accountId+'" data-blocked="'+(!item.blocked)+'"')+'</div>');
    } else if(action==='confirm-block') {
      el.disabled=true;const id=el.dataset.id;
      await client.block(id,el.dataset.blocked==='true');dialog.close();
      if(route().page==='gesprekken')updateInbox();composer();settings(id);
    } else if(action==='report')reportDialog(el.dataset.id);
    else if(action==='edit-profile'){editing=true;go('bedrijf/'+client.account.accountId);render();}
    else if(action==='cancel-edit'){editing=false;render();}
    else if(action==='remove-logo'){logoDraft='';document.querySelector('#logo-feedback').textContent='Logo wordt verwijderd zodra je opslaat.';document.querySelector('.live-logo-editor .avatar')?.remove();}
    else if(action==='theme') {
      await client.update({theme:el.dataset.id,...(el.dataset.id==='custom'?{customTheme:client.account.customTheme||{accent:'#42633b',tint:'#e9f1e5',ink:'#304b2b',background:'#ffffff',foreground:'#263326'}}:{})});
      render();if(settingsDialog.open)settings(settingsContactId);toast('Bedrijfsthema opgeslagen.');
    }
  } catch(error){toast(error.message);el.disabled=false;}
});
document.addEventListener('input',event=>{
  if(event.target.id==='conversation-search'){query=event.target.value;updateInbox();}
  else if(event.target.id==='industry-search'){industryQuery=event.target.value;industryLimit=12;industryResults();}
  else if(event.target.id==='reply'||event.target.id==='message-title') {
    const form=document.querySelector('#reply-form');
    drafts.set(client.account.accountId+':'+route().id,{title:form.elements.title?.value||'',text:form.elements.text.value});composer();
  } else if(event.target.id==='report-details')document.querySelector('#report-count').textContent=Array.from(event.target.value).length;
});
document.addEventListener('change',async event=>{
  if(event.target.name==='reason') {
    const other=event.target.value==='other';dialog.querySelector('#report-details').required=other;
    document.querySelector('#report-optional').textContent=other?'(verplicht)':'(optioneel)';
  }
  if(event.target.id!=='company-logo')return;
  try {
    const file=event.target.files?.[0];if(!file)return;
    document.querySelector('#logo-feedback').textContent='Logo wordt verwerkt…';
    logoDraft=await optimizeCompanyLogo(file);
    const element=document.querySelector('.live-logo-editor');
    element.querySelector('.avatar')?.remove();
    const image=document.createElement('img');image.className='avatar company-logo-fallback';image.src=logoDraft;image.alt='';element.prepend(image);
    document.querySelector('#logo-feedback').textContent='Logo gekozen. Sla je profiel op om het te publiceren.';
  } catch(error){document.querySelector('#logo-feedback').textContent=error.message;}
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!['signup-business','connect-form','reply-form','quick-action-form','report-form','company-profile-form','personal-profile','custom-theme','conversation-note-form'].includes(form.id))return;
  event.preventDefault();
  if(form.dataset.submitting==='true')return;
  form.dataset.submitting='true';
  const submit=form.querySelector('[type="submit"]');submit.disabled=true;
  try {
    const data=new FormData(form);
    if(form.id==='conversation-note-form') {
      await client.updateConversation(form.dataset.id,{note:data.get('note')});toast('Privénotitie opgeslagen.');
    } else if(form.id==='signup-business') {
      await client.register('business',data.get('name')||data.get('signup-name'));
      if(dialog.open)dialog.close();closeSettings();settingsContactId=undefined;query='';render();toast('Je bedrijf staat klaar.');
      const code=contactCode(location.href,location.origin);
      if(code)connectDialog(code);
    } else if(form.id==='connect-form') {
      const code=contactCode(data.get('customer-code'),location.origin);
      if(!code)throw new Error('Gebruik een Conappt-code zoals 7483-RGY-RCH.');
      const id=await client.connect(code,data.get('customer-alias'));
      dialog.close();go('gesprek/'+id);render();toast('Jullie zijn verbonden.');
    } else if(form.id==='reply-form')await send(form.dataset.id,'',data.get('text'));
    else if(form.id==='quick-action-form') {
      const action=quickActionsFor(client.account.industryId).find(item=>item.id===form.dataset.id);
      const message=messageFromAction(action,Object.fromEntries(data));
      await send(form.dataset.contact,message.title,message.text);
    } else if(form.id==='report-form') {
      const reason=data.get('reason'),details=data.get('details').trim();
      const error=validateReport(reason,details);if(error)throw new Error(error);
      const payload=JSON.stringify({reason,details});
      if(form.dataset.payload&&form.dataset.payload!==payload)form.dataset.requestId=crypto.randomUUID();
      form.dataset.payload=payload;
      const result=await client.request(business()?'user-reports':'business-reports',{method:'POST',body:{[business()?'userId':'businessId']:form.dataset.id,reason,details,requestId:form.dataset.requestId}});
      if(dialog.contains(form))openDialog('<div class="report-success">'+icon('check')+'<h2>Melding ontvangen</h2><p>Je melding is opgeslagen bij Conappt. Je contact kan je melding niet bekijken.</p><p class="field-help">Referentie: '+html(result.reportId)+'</p></div><div class="dialog-actions">'+button('Klaar','close-dialog')+'</div>');
      else toast('Je melding is opgeslagen bij Conappt.');
    } else if(form.id==='company-profile-form') {
      const value=id=>document.getElementById(id).value.trim();
      for(const id of ['company-website',...['instagram','facebook','linkedin'].map(k=>'social-'+k),...[0,1,2].map(i=>'action-url-'+i)])
        if(value(id)&&!safeExternalUrl(value(id)))throw new Error('Gebruik volledige HTTPS-links zonder inloggegevens.');
      const actions=[0,1,2].map(i=>({label:value('action-label-'+i),url:value('action-url-'+i)}));
      if(actions.some(a=>Boolean(a.label)!==Boolean(a.url)))throw new Error('Vul voor iedere actie een knoptekst én link in.');
      const profile=cleanBusinessProfile({logo:logoDraft,description:value('company-description'),phone:value('company-phone'),website:value('company-website'),
        socials:Object.fromEntries(['instagram','facebook','linkedin'].map(k=>[k,value('social-'+k)])),
        hours:Object.fromEntries(PROFILE_DAYS.map(day=>[day,value('hours-'+day)])),actions});
      await client.update({name:value('company-name'),profile});editing=false;render();toast('Bedrijfsprofiel opgeslagen.');
    } else if(form.id==='personal-profile') {
      await client.update({name:data.get('personal-name').trim()||'Conappt-gebruiker'});navigation();toast('Je profiel is opgeslagen.');
    } else if(form.id==='custom-theme') {
      await client.update({theme:'custom',customTheme:Object.fromEntries(data)});render();if(settingsDialog.open)settings(settingsContactId);toast('Bedrijfsthema opgeslagen.');
    }
  } catch(error){setError(form,error);}
  finally {form.dataset.submitting='false';submit.disabled=false;composer();}
});
document.addEventListener('keydown',event=>{
  if(event.target.id==='reply'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){
    event.preventDefault();const form=document.querySelector('#reply-form');if(!form.querySelector('[type="submit"]').disabled)form.requestSubmit();
  }
});
dialog.addEventListener('close',()=>{scanner?.abort();scanner=null;});
dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
});
window.addEventListener('hashchange',()=>{
  editing=false;render();
  const code=contactCode(location.href,location.origin);if(code&&business()&&client.account)connectDialog(code);
});
async function refresh() {
  if(!client.account||document.hidden)return;
  try {
    const changed=await client.sync();online=true;
    if(changed) {
      if(route().page==='gesprek'){thread(route().id);composer();navigation();}
      else if(route().page==='gesprekken'){updateInbox();navigation();}
      else if(!editing&&!(main.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select')))render();
    }
  } catch {online=false;}
  document.querySelectorAll('.connection-status').forEach(el=>el.textContent=online?'Verbonden':'Verbinding herstellen…');
}
try {
  client.profiles.business=await deviceGet('public-profile:business');
  const mode=await deviceGet('mode')||'personal';
  if(!await client.restore(mode))await client.restore(mode==='personal'?'business':'personal');
  render();
  const code=contactCode(location.href,location.origin);if(code&&business()&&client.account)connectDialog(code);
} catch(error){welcome(error.message);}
setInterval(()=>void refresh(),2000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});

startBenchmarkLabel(document.querySelector('#benchmark-status'));

