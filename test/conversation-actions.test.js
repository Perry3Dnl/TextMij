import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {MessagingApi} from '../src/messaging-api.js';
import {memoryDatabase} from '../support/memory-database.js';
import {generateDeviceKeyPair,exportDevicePublicKey,encryptForRecipient} from '../public/crypto.js';
import {conversationPreference,conversationExport} from '../public/conversation-actions.js';
import {freshState,restoreState,addReply,addBusinessMessage} from '../public/model.js';

async function fixture(t) {
  const db=memoryDatabase(),api=new MessagingApi(db),server=createApp({messaging:api});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  const request=(path,account,method='GET',body)=>fetch(origin+'/api/v1/'+path,{method,headers:{...(account?{authorization:'Bearer '+account.token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  async function signup(kind,name) {
    const keys=await generateDeviceKeyPair(),publicKey=await exportDevicePublicKey(keys.publicKey);
    const r=await request('accounts',null,'POST',{kind,name,publicKey});assert.equal(r.status,201);
    return {...await r.json(),publicKey};
  }
  const business=await signup('business','Testbedrijf'),user=await signup('personal','Testgebruiker');
  assert.equal((await request('connections',business,'POST',{code:user.code})).status,201);
  const block=(account,target,blocked=true)=>request('conversation-block',account,'PUT',{contactId:target.accountId,blocked});
  async function send(from,to) {
    const envelope=await encryptForRecipient({senderId:from.accountId,recipientId:to.accountId,recipientPublicKey:to.publicKey,title:'',text:'Testbericht',allowEmptyTitle:true});
    return request('messages',from,'POST',{idempotencyKey:randomUUID(),envelope});
  }
  return {db,api,request,signup,business,user,block,send};
}

test('blocks are authenticated, connected, persisted and enforced in both directions',async t=>{
  const {db,request,signup,business,user,block,send}=await fixture(t);
  assert.equal((await request('conversation-block',null,'PUT',{contactId:user.accountId,blocked:true})).status,401);
  assert.equal((await request('conversation-block',business,'PUT',{contactId:user.accountId,blocked:'yes'})).status,400);
  assert.equal((await block(business,business)).status,400);
  const unrelated=await signup('personal','Andere gebruiker');
  assert.equal((await block(business,unrelated)).status,404);
  assert.equal((await send(business,user)).status,202);
  assert.equal((await send(user,business)).status,202);
  // A queued message must not survive a later block waiting for dispatch.
  db.messages[0].status='queued';
  assert.equal((await block(user,business)).status,200);
  assert.equal((await block(user,business)).status,200);
  assert.equal(db.blocks.length,1);assert.equal(db.messages[0].status,'failed');
  assert.equal((await send(business,user)).status,403);
  assert.equal((await send(user,business)).status,403);
  for(const account of [business,user]) {
    assert.deepEqual((await(await request('messages',account)).json()).messages,[]);
    const contact=(await(await request('connections',account)).json()).contacts[0];
    assert.equal(contact.messagingBlocked,true);assert.equal(contact.blocked,account===user);
  }
  // Unblocking your own direction cannot remove the other person's block.
  assert.equal((await block(business,user,false)).status,200);
  assert.equal((await send(business,user)).status,403);
  assert.equal((await block(business,user)).status,200);
  assert.equal((await block(user,business,false)).status,200);
  assert.equal((await send(user,business)).status,403);
  assert.equal((await block(business,user,false)).status,200);
  assert.equal((await send(business,user)).status,202);
  assert.equal((await send(user,business)).status,202);
});

test('a block racing a send prevents subsequent sends and hides any already accepted delivery',async t=>{
  const {db,request,business,user,block,send}=await fixture(t);
  const [sent,blocked]=await Promise.all([send(business,user),block(user,business)]);
  assert.ok([202,403].includes(sent.status));assert.equal(blocked.status,200);
  assert.equal((await send(business,user)).status,403);
  assert.deepEqual((await(await request('messages',user)).json()).messages,[]);
  const second=createApp({messaging:new MessagingApi(db)});
  await new Promise(resolve=>second.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>second.close(resolve)));
  const contacts=await fetch('http://127.0.0.1:'+second.address().port+'/api/v1/connections',{headers:{authorization:'Bearer '+user.token}});
  assert.equal((await contacts.json()).contacts[0].blocked,true);
});

test('businesses can privately report only connected users with committed, idempotent receipts',async t=>{
  const {db,request,signup,business,user}=await fixture(t);
  const body={userId:user.accountId,requestId:randomUUID(),reason:'abuse',details:'Synthetische melding',userName:'Spoofed',reporterId:user.accountId};
  const report=(bodyOverride={},account=business)=>request('user-reports',account,'POST',{...body,...bodyOverride});
  assert.equal((await request('user-reports',null,'POST',body)).status,401);
  assert.equal((await report({},user)).status,403);
  const unrelated=await signup('personal','Geen verbinding');
  assert.equal((await report({userId:unrelated.accountId})).status,404);
  assert.equal((await report({reason:'misleading'})).status,400);
  assert.equal((await report({reason:'other',details:''})).status,400);
  assert.equal((await report({details:'x'.repeat(2001)})).status,400);
  db.failReportInsert=true;assert.equal((await report()).status,503);assert.equal(db.userReports.length,0);db.failReportInsert=false;
  const responses=await Promise.all([report(),report(),report()]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,200,201]);
  const receipts=await Promise.all(responses.map(r=>r.json()));assert.equal(new Set(receipts.map(r=>r.reportId)).size,1);
  assert.equal(db.userReports[0].user_id,user.accountId);assert.equal(db.userReports[0].user_name,'Testgebruiker');assert.equal(db.userReports[0].reporter_id,business.accountId);
  assert.equal((await report({details:'Andere inhoud'})).status,409);
  for(let i=0;i<9;i++)assert.equal((await report({requestId:randomUUID()})).status,201);
  assert.equal((await report({requestId:randomUUID()})).status,429);
  assert.equal((await report()).status,200);
  assert.equal((await request('user-reports',user)).status,405);
  assert.ok(!JSON.stringify(await(await request('connections',user)).json()).includes('Synthetische melding'));
});

test('private notes and pins restore by role; exports include available chat text without private metadata',()=>{
  const state=freshState();state.conversationPrefs.business['studio-noord']={pinned:true,note:'Privé <notitie> 😀',blocked:true};
  const restored=restoreState(JSON.stringify(state));
  assert.equal(conversationPreference(restored.conversationPrefs.business,'studio-noord').note,'Privé <notitie> 😀');
  assert.equal(conversationPreference(restored.conversationPrefs.personal,'studio-noord').note,'');
  assert.equal(conversationPreference(restored.conversationPrefs.business,'studio-noord').pinned,true);
  assert.equal(addReply(restored,'studio-noord','Kan niet'), 'Dit gesprek is geblokkeerd.');
  assert.equal(addBusinessMessage(restored,'studio-noord','','Kan niet'), 'Dit gesprek is geblokkeerd.');
  restored.conversationPrefs.business['studio-noord'].blocked=false;
  assert.equal(addReply(restored,'studio-noord','Weer mogelijk'),null);
  const output=conversationExport({ownName:'Eigenaar',contactName:'Contact',note:'PRIVE',token:'GEHEIM',messages:[{own:true,at:1,title:'Update',text:'Hallo 😀',pending:true,envelope:{secret:'GEHEIM'}}]});
  assert.match(output,/Eigenaar/);assert.match(output,/Hallo 😀/);assert.match(output,/niet bevestigd/);assert.ok(!output.includes('PRIVE'));assert.ok(!output.includes('GEHEIM'));
});
