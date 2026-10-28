import test from 'node:test';
import assert from 'node:assert/strict';
import { ReputationApi } from '../src/reputation-api.js';
import { memoryDatabase } from '../support/memory-database.js';

const businessId='b'.repeat(64),personId='a'.repeat(64);
function reply(){
  return {status:0,headers:{},setHeader(k,v){this.headers[k]=v;},
    writeHead(status,headers){this.status=status;this.headers={...this.headers,...headers};},
    end(value){this.body=value?JSON.parse(value):null;}};
}
function request(method,body){
  return {method,url:'/api/v1/business-reputation?businessId='+businessId,
    headers:{'content-type':'application/json'},
    async *[Symbol.asyncIterator](){if(body)yield Buffer.from(JSON.stringify(body));}};
}
test('ratings replace rather than duplicate, red warning starts at 11, business cannot read',async()=>{
  const db=memoryDatabase();
  db.accounts.push({id:businessId,kind:'business',display_name:'Example'});
  db.connections.push({business_id:businessId,customer_id:personId});
  let kind='personal';
  const api=new ReputationApi(db,async()=>({id:personId,kind}));
  async function call(method,body){const res=reply();await api.handle(request(method,body),res,'/api/v1/business-reputation');return res.body;}
  assert.equal((await call('GET')).redFlags,0);
  assert.equal((await call('PUT',{businessId,stars:5})).average,5);
  const updated=await call('PUT',{businessId,stars:2});
  assert.equal(updated.average,2);assert.equal(updated.ratingCount,1);assert.equal(updated.yourStars,2);
  for(let i=0;i<10;i++)db.reports.push({business_id:businessId,reason:'spam'});
  let result=await call('GET');assert.equal(result.redFlags,10);assert.deepEqual(result.warning,[]);
  db.reports.push({business_id:businessId,reason:'scam'});
  result=await call('GET');assert.equal(result.redFlags,11);
  assert.deepEqual(result.warning.map(x=>x.reason).sort(),['scam','spam']);
  kind='business';
  await assert.rejects(()=>call('GET'),error=>error.status===403);
});
