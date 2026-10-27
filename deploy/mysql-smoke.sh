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
for sql in deploy/sql/00{1,2,3,4}_*.sql; do
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
const senderResponse=await post('/api/v1/accounts',{kind:'business',name:'Integration Atelier',email:'test@example.invalid',publicKey:publicA});
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
console.log('MySQL, HTTP authentication, ciphertext persistence and dispatch passed');
JS
