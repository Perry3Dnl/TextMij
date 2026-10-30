import {test} from 'node:test';
import assert from 'node:assert/strict';
import {APPROVAL_REPLIES,validateReplyOptions,replyButtons} from '../public/interactive-replies.js';
import {quickActionsFor,quickMessageCollection,validateQuickMessageCollection,messageFromAction} from '../public/business-templates.js';

test('garage approval message offers three concrete customer replies',()=>{
  const approval=quickActionsFor('garage').find(item=>item.id==='approval');
  assert.deepEqual(approval.replyOptions,APPROVAL_REPLIES);
  const rendered=messageFromAction(approval,{details:'APK',amount:'150'});
  assert.equal(rendered.text.includes('€150'),true);
  assert.deepEqual(rendered.replyOptions,APPROVAL_REPLIES);
  const html=replyButtons({id:'received-1',own:false,replyOptions:rendered.replyOptions});
  assert.match(html,/data-action="send-reply-option"/);
  assert.match(html,/Andere opties\?/);
  assert.equal((html.match(/data-index=/g)||[]).length,3);
  assert.equal(replyButtons({id:'sent-1',own:true,replyOptions:rendered.replyOptions}),'');
});
test('legacy saved quick messages inherit default reply choices only when unspecified',()=>{
  const entry=quickActionsFor('garage').find(item=>item.id==='approval');
  const saved=[{key:'garage:approval',label:entry.label,title:entry.title,text:entry.text}];
  assert.deepEqual(quickMessageCollection('garage',saved)[0].replyOptions,APPROVAL_REPLIES);
  assert.deepEqual(quickMessageCollection('garage',[{...saved[0],replyOptions:[]}])[0].replyOptions,[]);
});
test('editing reply messages preserves options and rejects unsafe or oversized answers',()=>{
  const entry=quickActionsFor('garage').find(item=>item.id==='approval');
  const clean=validateQuickMessageCollection([{key:'garage:approval',label:entry.label,title:entry.title,text:entry.text,replyOptions:APPROVAL_REPLIES}]);
  assert.deepEqual(clean[0].replyOptions,APPROVAL_REPLIES);
  assert.throws(()=>validateReplyOptions([{label:'A',text:'x'},{label:'B',text:'y'},{label:'C',text:'z'},{label:'D',text:'w'}]),/maximaal drie/);
  assert.throws(()=>validateReplyOptions([{label:'',text:'Ja'}]),/geldig antwoord/);
  assert.throws(()=>validateReplyOptions([{label:'Ja',text:'x'.repeat(1025)}]),/geldig antwoord/);
  assert.equal(replyButtons({id:'received-5',own:false,replyOptions:[{label:'<img>',text:'Hallo'}]}).includes('<img>'),false);
});
test('server serves the optional encrypted replies module',async()=>{
  const {createApp}=await import('../src/app.js');
  const server=createApp({revision:'test-replies'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/interactive-replies.js');
    assert.equal(response.status,200);
    assert.match(await response.text(),/validateReplyOptions/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
