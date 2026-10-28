import test from 'node:test';
import assert from 'node:assert/strict';
import { INDUSTRIES,industryFor,searchIndustries,quickActionsFor,messageFromAction,quickMessageCollection,addQuickMessageTemplate,validateQuickMessageCollection } from '../public/business-templates.js';
import { contactCode } from '../public/contact-code.js';
import { validateBusinessMessage } from '../public/model.js';
import { qrcodegen } from '../public/vendor/qrcodegen.js';
import decode from '../public/vendor/jsQR.js';

test('industry search finds garages through Dutch and English terms and all quick messages fit',()=>{
  assert.ok(INDUSTRIES.length>=80);
  assert.equal(new Set(INDUSTRIES.map(i=>i.id)).size,INDUSTRIES.length);
  assert.equal(searchIndustries('garage')[0].id,'garage');
  assert.equal(searchIndustries('car automotive')[0].id,'garage');
  assert.equal(industryFor('missing'),undefined);
  for(const industry of INDUSTRIES)for(const action of quickActionsFor(industry.id)) {
    const message=messageFromAction(action,{date:'2026-11-10',time:'14:30',amount:'125.50',details:'Een onderdeel moet worden vervangen.'});
    assert.equal(validateBusinessMessage(message.title,message.text),null,industry.id+':'+action.id);
    assert.equal(message.text.includes('{'),false);
  }
  const approval=quickActionsFor('garage').find(action=>action.id==='approval');
  assert.throws(()=>messageFromAction(approval,{details:'Test',amount:'-1'}));
  assert.throws(()=>messageFromAction(approval,{details:'',amount:'10'}));
});

test('real QR encoding decodes to a public contact link and rejects unrelated or secret-bearing input',()=>{
  const origin='https://conappt.com',code='7483-RGY-RCH',payload=origin+'/#connect/'+code;
  const qr=qrcodegen.QrCode.encodeText(payload,qrcodegen.QrCode.Ecc.MEDIUM);
  const scale=6,border=4,size=(qr.size+border*2)*scale,pixels=new Uint8ClampedArray(size*size*4).fill(255);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(qr.getModule(Math.floor(x/scale)-border,Math.floor(y/scale)-border)){
    const i=(y*size+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;
  }
  const scanned=decode(pixels,size,size);
  assert.equal(scanned.data,payload);
  assert.equal(contactCode(scanned.data,origin),code);
  assert.equal(contactCode('7483–rgy–rch',origin),code);
  assert.equal(contactCode('https://unrelated.invalid/#connect/'+code,origin),null);
  assert.equal(contactCode(origin+'/#connect/token-or-private-key',origin),null);
});

test('applying templates adds unique entries, preserves edits and validates private collection',()=>{
  let items=addQuickMessageTemplate(null,null,'garage');
  assert.equal(items.length,6);
  items[0]={...items[0],label:'Mijn aangepaste knop'};
  items=addQuickMessageTemplate('garage',items,'bloemist');
  assert.equal(items.length,10);
  assert.equal(items[0].label,'Mijn aangepaste knop');
  items=addQuickMessageTemplate('bloemist',items,'garage');
  assert.equal(items.length,10);
  const saved=validateQuickMessageCollection(items);
  assert.equal(saved.length,10);
  assert.equal(quickMessageCollection('bloemist',saved).find(i=>i.key==='garage:approval').fields.length,2);
  assert.throws(()=>validateQuickMessageCollection([...items,items[0]]));
  assert.throws(()=>validateQuickMessageCollection([{key:'invalid',label:'x',title:'x',text:'x'}]));
});
