import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { MessagingApi } from '../src/messaging-api.js';
import { memoryDatabase } from '../support/memory-database.js';
import { generateDeviceKeyPair,exportDevicePublicKey } from '../public/crypto.js';

async function fixture(t) {
  const db=memoryDatabase(),api=new MessagingApi(db),server=createApp({messaging:api});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  const request=(path,{method='GET',body,session,...headers}={})=>fetch(origin+'/api/v1/'+path,{
    method,headers:{...(body?{'content-type':'application/json'}:{}),...(session?{cookie:session.cookie,'x-conappt-role':session.kind}:{}),...headers},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  async function signup(kind,name) {
    const keys=await generateDeviceKeyPair();
    const response=await request('accounts',{method:'POST',body:{kind,name,publicKey:await exportDevicePublicKey(keys.publicKey),browser:true},'x-forwarded-proto':'https'});
    assert.equal(response.status,201);
    const account=await response.json();
    assert.equal(Object.hasOwn(account,'token'),false);
    assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    assert.match(response.headers.get('set-cookie'),/; Secure$/);
    return {...account,cookie:response.headers.get('set-cookie').split(';')[0]};
  }
  const company=await signup('business','Garage Testbedrijf'),customer=await signup('personal','Conappt-gebruiker');
  const connect=await request('connections',{method:'POST',session:company,body:{code:customer.code}});
  assert.equal(connect.status,201);
  const report=(body={},session=customer)=>request('business-reports',{method:'POST',session,body:{
    businessId:company.accountId,reason:'impersonation',details:'Een privacyveilige testmelding.',requestId:randomUUID(),...body
  }});
  return {db,api,server,request,signup,company,customer,report};
}

test('name-only signup, real linking and private server-persisted company reports',async t=>{
  const {db,request,company,customer,report}=await fixture(t);
  assert.equal(db.accounts.find(a=>a.id===company.accountId).email,null);
  const contacts=await request('connections',{session:customer});
  const body=await contacts.json();
  assert.equal(body.contacts[0].accountId,company.accountId);
  assert.equal(body.contacts[0].name,'Garage Testbedrijf');
  assert.equal(JSON.stringify(body).includes('credential_hash'),false);
  const response=await report({businessName:'Spoofed name',reporterId:company.accountId});
  assert.equal(response.status,201);
  const result=await response.json();
  assert.equal(result.status,'received');
  assert.equal(db.reports.length,1);
  assert.equal(db.reports[0].id,result.reportId);
  assert.equal(db.reports[0].reporter_id,customer.accountId);
  assert.equal(db.reports[0].business_name,'Garage Testbedrijf');
  assert.equal(db.reports[0].status,'open');
  const listing=await request('business-reports',{session:company});
  assert.equal(listing.status,405);
  assert.equal(listing.headers.get('allow'),'POST');
  assert.equal(JSON.stringify(await listing.json()).includes(db.reports[0].details),false);
});

test('business quick-message edits persist for the owner and stay out of customer profiles',async t=>{
  const {db,request,signup,company,customer}=await fixture(t);
  const quickMessages={garage:{ready:{label:'Ophalen',title:'Klaar',text:'Je auto is klaar. Tot straks!'}}};
  const update=body=>request('profile',{method:'PUT',session:company,body:{name:company.name,industryId:'garage',...body}});
  assert.equal((await update({quickMessages})).status,200);
  assert.deepEqual((await(await request('session',{session:company})).json()).quickMessages,quickMessages);
  // Legacy clients updating other fields must not discard private saved messages.
  assert.equal((await update({theme:'black'})).status,200);
  assert.deepEqual(JSON.parse(db.profiles[0].profile_json).quickMessages,quickMessages);
  const own=await(await request('session',{session:company})).json();
  assert.equal(own.theme,'black');assert.deepEqual(own.quickMessages,quickMessages);
  const contacts=await(await request('connections',{session:customer})).json();
  assert.equal(Object.hasOwn(contacts.contacts[0],'quickMessages'),false);
  assert.equal(JSON.stringify(contacts).includes('Tot straks!'),false);
  const other=await signup('business','Ander bedrijf');
  assert.deepEqual((await(await request('session',{session:other})).json()).quickMessages,{});
  const invalid=await update({quickMessages:{garage:{ready:{label:'Test',title:'Test',text:'Onbekend {token}'}}}});
  assert.equal(invalid.status,400);
  assert.deepEqual((await(await request('session',{session:company})).json()).quickMessages,quickMessages);
  assert.equal((await update({quickMessages:{}})).status,200);
  assert.deepEqual((await(await request('session',{session:company})).json()).quickMessages,{});
});

test('report authorization, relation, reason and length validation reject invalid submissions',async t=>{
  const {db,request,signup,company,report}=await fixture(t);
  assert.equal((await request('business-reports',{method:'POST',body:{}})).status,401);
  assert.equal((await report({},company)).status,403);
  assert.equal((await report({reason:'unknown'})).status,400);
  assert.equal((await report({reason:'other',details:'   '})).status,400);
  assert.equal((await report({details:'a'.repeat(2001)})).status,400);
  assert.equal((await report({details:' '.repeat(2001)})).status,400);
  assert.equal((await report({businessId:'f'.repeat(64)})).status,404);
  const unrelated=await signup('personal','Ander testprofiel');
  assert.equal((await report({},unrelated)).status,404);
  const crossSite=await request('business-reports',{method:'POST',session:unrelated,origin:'https://unrelated.invalid',body:{}});
  assert.equal(crossSite.status,403);
  assert.equal(db.reports.length,0);
});

test('concurrent retries produce one report and conflicting retry payloads are rejected',async t=>{
  const {db,report}=await fixture(t);
  const requestId=randomUUID();
  const responses=await Promise.all([report({requestId}),report({requestId}),report({requestId})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,200,201]);
  const payloads=await Promise.all(responses.map(r=>r.json()));
  assert.equal(new Set(payloads.map(p=>p.reportId)).size,1);
  assert.equal(db.reports.length,1);
  assert.equal((await report({requestId,details:'Andere inhoud'})).status,409);
  assert.equal(db.reports.length,1);
});

test('report budget persists across API instances and failed writes never return a receipt',async t=>{
  const {db,request,customer,company,report}=await fixture(t);
  db.failReportInsert=true;
  assert.equal((await report()).status,503);
  assert.equal(db.reports.length,0);
  db.failReportInsert=false;
  for(let i=0;i<10;i++)assert.equal((await report()).status,201);
  assert.equal((await report()).status,429);
  const second=createApp({messaging:new MessagingApi(db)});
  await new Promise(resolve=>second.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>second.close(resolve)));
  const limited=await fetch('http://127.0.0.1:'+second.address().port+'/api/v1/business-reports',{
    method:'POST',headers:{'content-type':'application/json',cookie:customer.cookie,'x-conappt-role':'personal'},
    body:JSON.stringify({businessId:company.accountId,reason:'spam',details:'',requestId:randomUUID()})
  });
  assert.equal(limited.status,429);
  const previous=db.reports[0];
  const retry=await request('business-reports',{method:'POST',session:customer,body:{
    businessId:company.accountId,reason:previous.reason,details:previous.details,requestId:previous.request_id
  }});
  assert.equal(retry.status,200);
});
