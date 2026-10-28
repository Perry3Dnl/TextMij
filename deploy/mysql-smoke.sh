#!/usr/bin/env bash
# Integration test runs ONLY with disposable CI networks, secrets, and MySQL volume.
set -euo pipefail
: "${GITHUB_SHA:?GITHUB_SHA required}"
umask 077
tmp="$(mktemp -d)"
db=(docker compose -p textmij-ci-db -f deploy/mysql.compose.yml -f "$tmp/mysql.override.yml")
api=(docker compose -p textmij-ci-api -f deploy/compose.yml -f deploy/api.messaging.compose.yml -f "$tmp/api.override.yml")
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    "${db[@]}" logs --no-color --tail 100 mysql >&2 || true
    "${api[@]}" logs --no-color --tail 100 api >&2 || true
  fi
  "${api[@]}" down --remove-orphans >/dev/null 2>&1 || true
  "${db[@]}" down --remove-orphans --volumes >/dev/null 2>&1 || true
  docker network rm textmij-ci-messaging-proxy >/dev/null 2>&1 || true
  rm -rf -- "$tmp"
  exit "$status"
}
trap cleanup EXIT
python3 - "$tmp" <<'PY'
from pathlib import Path
import secrets,sys
base=Path(sys.argv[1])
for name in ('app.secret','root.secret'):
    (base / name).write_text(secrets.token_hex(32)+'\n')
PY
export TEXTMIJ_MYSQL_APP_PASSWORD_FILE="$tmp/app.secret"
export TEXTMIJ_MYSQL_ROOT_PASSWORD_FILE="$tmp/root.secret"
# Docker Compose file secrets are bind mounts, so grant only the Node UID access.
docker run --rm --user 0:0 --network none --cap-drop ALL --cap-add CHOWN --cap-add FOWNER --cap-add DAC_OVERRIDE \
  --security-opt no-new-privileges:true --mount "type=bind,source=$tmp,target=/private-secrets" \
  --entrypoint sh "textmij:$GITHUB_SHA" -c \
  'chown 1000:1000 /private-secrets/app.secret && chmod 0400 /private-secrets/app.secret'

cat > "$tmp/mysql.override.yml" <<'YAML'
networks:
  backend:
    name: textmij-ci-messaging-backend
volumes:
  textmij_mysql:
    name: textmij-ci-messaging-data
YAML
cat > "$tmp/api.override.yml" <<'YAML'
networks:
  backend:
    name: textmij-ci-messaging-backend
  proxy:
    name: textmij-ci-messaging-proxy
YAML
docker network create textmij-ci-messaging-proxy >/dev/null
"${db[@]}" up -d --wait --wait-timeout 180
for sql in deploy/sql/00{1,2,3,4,5,6,7}_*.sql; do
  # shellcheck disable=SC2016 # Expand inside the isolated test MySQL container.
  "${db[@]}" exec -T mysql sh -c 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" exec mysql -uroot textmij' < "$sql"
done
export SHARED_PROXY_NETWORK=textmij-ci-messaging-proxy
export TEXTMIJ_IMAGE="textmij:$GITHUB_SHA"
export TEXTMIJ_CONTAINER=textmij-api-ci-messaging
"${api[@]}" up -d --no-build --wait --wait-timeout 120
# MySQL must not share the proxy network or publish any TCP port.
mysql_id="$("${db[@]}" ps -q mysql)"
docker inspect "$mysql_id" --format '{{json .NetworkSettings.Ports}}' | python3 -c 'import json,sys; ports=json.load(sys.stdin); assert all(value is None for value in ports.values())'
docker inspect "$mysql_id" --format '{{json .NetworkSettings.Networks}}' | python3 -c 'import json,sys; n=json.load(sys.stdin); assert set(n)=={"textmij-ci-messaging-backend"}'
docker exec -i "$TEXTMIJ_CONTAINER" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { generateDeviceKeyPair, exportDevicePublicKey, encryptForRecipient, decryptFromSender } from './public/crypto.js';
const url='http://127.0.0.1:3000';
assert.equal((await fetch(url+'/api/ready')).status,200);
const post=(path, body, token)=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
const keysA=await generateDeviceKeyPair(), keysB=await generateDeviceKeyPair();
const publicA=await exportDevicePublicKey(keysA.publicKey), publicB=await exportDevicePublicKey(keysB.publicKey);
const senderResponse=await post('/api/v1/accounts',{kind:'business',name:'Integration Garage',publicKey:publicA});
const recipientResponse=await post('/api/v1/accounts',{kind:'personal',name:'Integration User',publicKey:publicB});
assert.equal(senderResponse.status,201);
assert.equal(recipientResponse.status,201);
const sender=await senderResponse.json(), recipient=await recipientResponse.json();
const envelope=await encryptForRecipient({senderId:sender.accountId,recipientId:recipient.accountId,recipientPublicKey:publicB,title:'Integration',text:'E2EE test message'});
const delivery=await post('/api/v1/messages',{idempotencyKey:'12345678-1234-4234-8234-123456789abc',envelope},sender.token);
assert.equal(delivery.status,202,await delivery.text().catch(()=>'')); // 202 JSON consumed only in failure
let item;
for(let i=0;i<20;i++) {
  const inbox=await fetch(url+'/api/v1/messages',{headers:{authorization:'Bearer '+recipient.token}});
  assert.equal(inbox.status,200);
  item=(await inbox.json()).messages[0];
  if(item)break;
  await new Promise(r=>setTimeout(r,500));
}
assert.ok(item,'Encrypted message was not released by durable dispatcher');
const plain=await decryptFromSender({senderId:sender.accountId,recipientId:recipient.accountId,privateKey:keysB.privateKey,envelope:item.envelope});
assert.deepEqual(plain,{title:'Integration',text:'E2EE test message'});
const linked=await post('/api/v1/connections',{code:recipient.code},sender.token);
assert.equal(linked.status,201);
assert.equal((await post('/api/v1/connections',{code:recipient.code},sender.token)).status,200);
const update=await fetch(url+'/api/v1/profile',{method:'PUT',headers:{'content-type':'application/json',authorization:'Bearer '+sender.token},body:JSON.stringify({name:'Integration Garage',industryId:'garage',profile:{description:'Synthetic garage profile'},theme:'white'})});
assert.equal(update.status,200);
const connections=await fetch(url+'/api/v1/connections',{headers:{authorization:'Bearer '+recipient.token}});
const contact=(await connections.json()).contacts[0];
assert.equal(contact.accountId,sender.accountId);
assert.equal(contact.industryId,'garage');
assert.equal(contact.profile.description,'Synthetic garage profile');
const reportBody={businessId:sender.accountId,requestId:crypto.randomUUID(),reason:'impersonation',details:'Synthetic CI report'};
assert.equal((await post('/api/v1/business-reports',reportBody)).status,401);
assert.equal((await post('/api/v1/business-reports',reportBody,sender.token)).status,403);
const reportResponse=await post('/api/v1/business-reports',reportBody,recipient.token);
assert.equal(reportResponse.status,201);
const report=await reportResponse.json();
assert.equal(report.status,'received');
const retries=await Promise.all(Array.from({length:3},()=>post('/api/v1/business-reports',reportBody,recipient.token)));
assert.ok(retries.every(response=>response.status===200));
for(const response of retries)assert.equal((await response.json()).reportId,report.reportId);
assert.equal((await post('/api/v1/business-reports',{...reportBody,details:'Conflicting body'},recipient.token)).status,409);
assert.equal((await post('/api/v1/business-reports',{...reportBody,requestId:crypto.randomUUID(),reason:'other',details:''},recipient.token)).status,400);
assert.equal((await fetch(url+'/api/v1/business-reports',{headers:{authorization:'Bearer '+sender.token}})).status,405);
const {createPool}=await import('mysql2/promise');
const {readFileSync}=await import('node:fs');
const database=createPool({host:process.env.MYSQL_HOST,user:process.env.MYSQL_USER,database:process.env.MYSQL_DATABASE,password:readFileSync(process.env.MYSQL_PASSWORD_FILE,'utf8').trimEnd()});
const [[stored]]=await database.execute('SELECT reporter_id,business_id,business_name,reason,details,status FROM business_reports WHERE id = ?',[report.reportId]);
assert.deepEqual(stored,{reporter_id:recipient.accountId,business_id:sender.accountId,business_name:'Integration Garage',reason:'impersonation',details:'Synthetic CI report',status:'open'});
for(let i=0;i<9;i++)assert.equal((await post('/api/v1/business-reports',{...reportBody,requestId:crypto.randomUUID()},recipient.token)).status,201);
assert.equal((await post('/api/v1/business-reports',{...reportBody,requestId:crypto.randomUUID()},recipient.token)).status,429);
const [[count]]=await database.execute('SELECT COUNT(*) AS total FROM business_reports WHERE reporter_id = ?',[recipient.accountId]);
assert.equal(count.total,10);
// Conversation actions exercise real MySQL authorization, transactions and delivery filters.
const userReport={userId:recipient.accountId,requestId:crypto.randomUUID(),reason:'abuse',details:'Synthetic user report'};
const reported=await post('/api/v1/user-reports',userReport,sender.token);
assert.equal(reported.status,201);
const userReceipt=await reported.json();
assert.equal((await post('/api/v1/user-reports',userReport,sender.token)).status,200);
assert.equal((await post('/api/v1/user-reports',{...userReport,details:'Conflict'},sender.token)).status,409);
assert.equal((await post('/api/v1/user-reports',userReport,recipient.token)).status,403);
const [[storedUser]]=await database.execute('SELECT reporter_id,user_id,user_name,reason,details FROM user_reports WHERE id = ?',[userReceipt.reportId]);
assert.deepEqual(storedUser,{reporter_id:sender.accountId,user_id:recipient.accountId,user_name:'Integration User',reason:'abuse',details:'Synthetic user report'});
const setBlock=(account,target,blocked)=>fetch(url+'/api/v1/conversation-block',{method:'PUT',headers:{'content-type':'application/json',authorization:'Bearer '+account.token},body:JSON.stringify({contactId:target.accountId,blocked})});
// Hold only this disposable test scheduler so a newly queued message cannot dispatch before blocking.
const scheduler=await database.getConnection();
try {
  const [[lease]]=await scheduler.query("SELECT GET_LOCK('textmij_outbox_dispatch_v1',5) AS locked");assert.equal(lease.locked,1);
  const pending=await post('/api/v1/messages',{idempotencyKey:crypto.randomUUID(),envelope},sender.token);assert.equal(pending.status,202);
  const pendingId=(await pending.json()).messageId;
  assert.equal((await setBlock(recipient,sender,true)).status,200);
  const [[pendingRow]]=await database.execute('SELECT status FROM encrypted_messages WHERE id = ?',[pendingId]);assert.equal(pendingRow.status,'failed');
} finally {await scheduler.query("SELECT RELEASE_LOCK('textmij_outbox_dispatch_v1')");scheduler.release();}
assert.equal((await post('/api/v1/messages',{idempotencyKey:crypto.randomUUID(),envelope},sender.token)).status,403);
const reverse=await encryptForRecipient({senderId:recipient.accountId,recipientId:sender.accountId,recipientPublicKey:publicA,title:'',text:'Blocked reverse',allowEmptyTitle:true});
assert.equal((await post('/api/v1/messages',{idempotencyKey:crypto.randomUUID(),envelope:reverse},recipient.token)).status,403);
const hidden=await fetch(url+'/api/v1/messages',{headers:{authorization:'Bearer '+recipient.token}});assert.deepEqual((await hidden.json()).messages,[]);
assert.equal((await setBlock(sender,recipient,false)).status,200);
assert.equal((await post('/api/v1/messages',{idempotencyKey:crypto.randomUUID(),envelope},sender.token)).status,403);
assert.equal((await setBlock(recipient,sender,false)).status,200);
assert.equal((await post('/api/v1/messages',{idempotencyKey:crypto.randomUUID(),envelope},sender.token)).status,202);
const race=await Promise.all([
  ...Array.from({length:4},()=>post('/api/v1/messages',{idempotencyKey:crypto.randomUUID(),envelope},sender.token)),
  setBlock(recipient,sender,true)
]);
assert.ok(race.slice(0,4).every(r=>[202,403].includes(r.status)));assert.equal(race[4].status,200);
const [[waiting]]=await database.execute("SELECT COUNT(*) AS total FROM encrypted_messages WHERE status='queued' AND sender_business_id = ? AND recipient_device_id = ?",[sender.accountId,recipient.accountId]);assert.equal(waiting.total,0);
assert.equal((await post('/api/v1/messages',{idempotencyKey:crypto.randomUUID(),envelope},sender.token)).status,403);
console.log('Real MySQL user reports, retry safety, blocking, queued-message cancellation and concurrent acceptance passed');
await database.end();
console.log('MySQL, authentication, encryption, links, profiles, private reports, retry safety and rate limits passed');
JS
