import { validateReplyOptions } from './interactive-replies.js';
import { conversationPreference } from './conversation-actions.js';
import { deviceGet,deviceSet } from './device-store.js';
import { generateDeviceKeyPair,exportDevicePublicKey,encryptForRecipient,decryptFromSender } from './crypto.js';
import { validateBusinessMessage,validateReply } from './model.js';

export class ConapptClient {
  profiles={};
  role='personal';
  account=null;
  contacts=[];
  history={messages:[],cursor:'0',read:{},pending:[]};
  busy=false;

  async request(path,{method='GET',body,role=this.role}={}) {
    let response;
    try {
      response=await fetch('/api/v1/'+path,{method,credentials:'same-origin',headers:{
        'x-conappt-role':role,...(body?{'content-type':'application/json'}:{})
      },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    } catch { throw new Error('Geen verbinding. Je kunt het opnieuw proberen zodra je online bent.'); }
    const result=await response.json();
    if (!response.ok) {
      const messages={401:'Dit profiel is niet aangemeld op dit apparaat.',404:'Deze Conappt-code is niet gevonden.',429:result.error||'Te veel aanvragen. Probeer later opnieuw.',503:'Conappt is tijdelijk niet bereikbaar. Probeer het zo opnieuw.'};
      throw Object.assign(new Error(messages[response.status]||result.error||'Dit is niet gelukt.'),{status:response.status});
    }
    return result;
  }
  async restore(role) {
    const keys=await deviceGet('keys:'+role);
    if (!keys) return false;
    let account;
    try { account=await this.request('session',{role}); }
    catch(error) { if(error.status===401) return false; throw error; }
    await this.activate(role,account,keys);
    return true;
  }
  async register(role,name) {
    // Persist the key before signup so a lost HTTP response can be recovered via the HttpOnly session.
    let keys=await deviceGet('keys:'+role);
    if (keys) {
      try { if (await this.restore(role)) return this.account; }
      catch(error) { if(error.status!==401) throw error; }
    } else {
      keys=await generateDeviceKeyPair();
      await deviceSet('keys:'+role,keys);
    }
    const result=await this.request('accounts',{method:'POST',role,body:{
      kind:role,name:role==='personal'?'Conappt-gebruiker':name.trim(),browser:true,
      publicKey:await exportDevicePublicKey(keys.publicKey)
    }});
    const account=await this.request('session',{role});
    if(account.accountId!==result.accountId) throw new Error('Je profiel kon niet veilig worden geopend. Probeer opnieuw.');
    await this.activate(role,account,keys);
    return account;
  }
  async activate(role,account,keys) {
    if(account.publicKey!==await exportDevicePublicKey(keys.publicKey))
      throw new Error('De apparaatsleutel hoort niet bij dit profiel. Open Conappt op het oorspronkelijke apparaat.');
    this.contactsVersion=(this.contactsVersion||0)+1;
    this.role=role;this.account=account;this.profiles[role]=account;this.keys=keys;this.contacts=[];
    await deviceSet('public-profile:'+role,account);
    this.history=await deviceGet('history:'+account.accountId)||{messages:[],cursor:'0',read:{},pending:[]};
    await deviceSet('mode',role);
    await this.sync();
  }
  async saveHistory() {
    await deviceSet('history:'+this.account.accountId,this.history);
  }
  async sync() {
    if(!this.account || this.busy) return false;
    this.busy=true;
    const account=this.account,role=this.role,history=this.history,contactsVersion=this.contactsVersion||0;
    try {
      const [connections,inbox]=await Promise.all([
        this.request('connections',{role}),this.request('messages?after='+history.cursor,{role})
      ]);
      if(this.account.accountId!==account.accountId) return false;
      let changed=false;
      if(contactsVersion===(this.contactsVersion||0)){changed=JSON.stringify(this.contacts)!==JSON.stringify(connections.contacts);this.contacts=connections.contacts;}
      const keys=this.keys;
      for(const item of inbox.messages) {
        if(!history.messages.some(message=>message.id==='received-'+item.id)) {
          let content;
          try { content=await decryptFromSender({senderId:item.senderId,recipientId:account.accountId,privateKey:keys.privateKey,envelope:item.envelope}); }
          catch { content={title:'Bericht niet beschikbaar',text:'Dit bericht kon niet op dit apparaat worden geopend.'}; }
          history.messages.push({id:'received-'+item.id,contactId:item.senderId,own:false,...content,at:new Date(item.queuedAt).getTime()});
          changed=true;
        }
        history.cursor=item.id;
      }
      if(inbox.messages.length) await deviceSet('history:'+account.accountId,history);
      return changed;
    } finally { this.busy=false; }
  }
  async connect(code,alias='') {
    const result=await this.request('connections',{method:'POST',body:{code,alias}});
    const contacts=await this.request('connections');
    this.contacts=contacts.contacts;
    return result.contact.accountId;
  }
  preferences(id) {return conversationPreference(this.history.conversationPrefs,id);}
  async updateConversation(id,patch) {
    if(!this.contacts.some(c=>c.accountId===id))throw new Error('Gesprek niet gevonden.');
    const previous=this.history.conversationPrefs;
    this.history.conversationPrefs={...previous,[id]:{...this.preferences(id),...patch}};
    try {await this.saveHistory();}catch(error){this.history.conversationPrefs=previous;throw error;}
  }
  async block(id,blocked) {
    this.contactsVersion=(this.contactsVersion||0)+1;
    const role=this.role,accountId=this.account.accountId;
    await this.request('conversation-block',{method:'PUT',role,body:{contactId:id,blocked}});
    const result=await this.request('connections',{role});
    if(this.account.accountId===accountId){this.contactsVersion++;this.contacts=result.contacts;}
  }
  async update(patch) {
    const previous=this.account;
    const updated=await this.request('profile',{method:'PUT',body:{...previous,...patch}});
    this.account=updated;
    this.profiles[this.role]=updated;
    await deviceSet('public-profile:'+this.role,updated);
    return updated;
  }
  async send(contactId,title,text,pendingId,replyOptions=[]) {
    if(this.role!=='business' && replyOptions?.length)throw new Error('Alleen bedrijven kunnen antwoordopties toevoegen.');
    replyOptions=validateReplyOptions(replyOptions);
    const error=this.role==='business'?validateBusinessMessage(title,text,undefined,false):validateReply(text);
    if(error) throw new Error(error);
    const contact=this.contacts.find(item=>item.accountId===contactId);
    if(contact?.messagingBlocked)throw new Error('Dit gesprek is geblokkeerd.');
    if(!contact) throw new Error('Dit gesprek is niet gevonden. Open je gesprekken opnieuw.');
    const account=this.account,role=this.role,history=this.history;
    let pending=pendingId ? history.pending.find(item=>item.id===pendingId) : history.pending.find(item=>item.contactId===contactId && item.title===title && item.text===text && JSON.stringify(item.replyOptions||[])===JSON.stringify(replyOptions));
    if(!pending) {
      pending={id:crypto.randomUUID(),contactId,title,text,replyOptions,at:Date.now(),envelope:await encryptForRecipient({
        senderId:account.accountId,recipientId:contactId,recipientPublicKey:contact.publicKey,title,text,replyOptions,keyVersion:contact.keyVersion,allowEmptyTitle:!title.trim()
      })};
      history.pending.push(pending);
      await deviceSet('history:'+account.accountId,history);
    }
    const result=await this.request('messages',{method:'POST',role,body:{idempotencyKey:pending.id,envelope:pending.envelope}});
    history.messages.push({id:'sent-'+result.messageId,contactId,own:true,title:pending.title,text:pending.text,replyOptions:pending.replyOptions||[],at:pending.at});
    history.pending=history.pending.filter(item=>item.id!==pending.id);
    await deviceSet('history:'+account.accountId,history);
  }
}
