import { randomBytes, createHash } from 'node:crypto';
import { EncryptedOutbox } from './encrypted-outbox.js';
import { ContactsApi } from './contacts-api.js';
import { ReportsApi } from './reports-api.js';
import { ReputationApi } from './reputation-api.js';
import { httpError as error, readJson, responseJson } from './http-json.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const idPattern = /^[a-f0-9]{64}$/;
const codePattern = /^[0-9]{4}-[A-Z]{3}-[A-Z]{3}$/;
const b64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const hash = value => createHash('sha256').update(value).digest();
function identity(result) { return { id: String(result.id), kind: result.kind, tier: result.tier, code: result.public_code }; }
function makeCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', bytes = randomBytes(10);
  const digits = Array.from(bytes.subarray(0, 4), x => x % 10).join('');
  const letters = Array.from(bytes.subarray(4), x => alphabet[x % alphabet.length]).join('');
  return digits + '-' + letters.slice(0, 3) + '-' + letters.slice(3);
}

export class MessagingApi {
  constructor(pool, { now = Date.now } = {}) {
    if (!pool || typeof pool.execute !== 'function') throw new TypeError('MySQL pool required');
    this.pool = pool;
    this.outbox = new EncryptedOutbox(pool);
    this.now = now;
    this.registrationCounts = new Map();
    this.contacts = new ContactsApi(pool, request => this.authenticate(request));
    this.reports = new ReportsApi(pool, request => this.authenticate(request));
    this.reputation = new ReputationApi(pool, request => this.authenticate(request));
  }
  async authenticate(request) {
    const role = request.headers['x-conappt-role'];
    const cookieName = ['personal','business'].includes(role) ? 'conappt_' + role : null;
    const cookie = cookieName && String(request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization || '')?.[1] || cookie;
    if (cookie && !request.headers.authorization && request.headers.origin && new URL(request.headers.origin).host !== request.headers.host)
      throw error(403, 'Cross-origin browser request rejected');
    if (!token) throw error(401, 'Account token required');
    const raw = Buffer.from(token, 'base64url');
    if (raw.length !== 32) throw error(401, 'Invalid account token');
    const [rows] = await this.pool.execute('SELECT id,kind,tier,public_code FROM accounts WHERE credential_hash = ?', [hash(raw)]);
    if (!rows.length) throw error(401, 'Invalid account token');
    return identity(rows[0]);
  }
  checkRegistrationBudget(request) {
    // Caddy canonicalizes X-Forwarded-For for untrusted incoming clients.
    const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = /^[A-Fa-f0-9:.]{3,45}$/.test(forwarded) ? forwarded : (request.socket.remoteAddress || 'unknown');
    const now = this.now(), record = this.registrationCounts.get(ip);
    if (record && now - record.start < 3600_000 && record.count >= 5) throw error(429, 'Registration rate limited');
    if (!record || now - record.start >= 3600_000) this.registrationCounts.set(ip,{start:now,count:1});
    else record.count++;
  }
  async register(request, response) {
    this.checkRegistrationBudget(request);
    const input = await readJson(request);
    const kind = input.kind;
    const name = input.name;
    if (!['personal','business'].includes(kind) || typeof name !== 'string' || !name.trim() || name.trim().length > 80)
      throw error(400,'Account type and display name required');
    const email = kind === 'business' ? input.email : null;
    if (email !== undefined && email !== null && (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
      throw error(400,'Invalid optional business email');
    const key = input.publicKey;
    if (typeof key !== 'string' || !b64Pattern.test(key) || Buffer.from(key,'base64').length !== 65 || Buffer.from(key,'base64')[0] !== 4)
      throw error(400,'P-256 device public key required');
    const accountId = hash(Buffer.concat([Buffer.from('textmij:account:v1:'),randomBytes(32)])).toString('hex');
    const tokenRaw = randomBytes(32), credentialHash = hash(tokenRaw);
    let code;
    for (let i = 0; i < 5; i++) {
      code = makeCode();
      try {
        await this.pool.execute('INSERT INTO accounts (id,kind,public_code,display_name,email,public_key,credential_hash) VALUES (?,?,?,?,?,?,?)',
          [accountId,kind,code,name.trim(),email?.trim().toLowerCase() ?? null,key,credentialHash]);
        const token = tokenRaw.toString('base64url');
        if (input.browser === true) {
          const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https';
          response.setHeader('Set-Cookie', 'conappt_' + kind + '=' + token + '; HttpOnly; SameSite=Strict; Path=/api/v1/; Max-Age=31536000' + (secure ? '; Secure' : ''));
        }
        responseJson(response,201,{ accountId, code, ...(input.browser === true ? {} : { token }), name:name.trim(), kind, tier:'standard', keyVersion:1 });
        return;
      } catch (e) { if (e?.code !== 'ER_DUP_ENTRY' || i === 4) throw e; }
    }
  }
  async getPublicKey(request, response, pathname) {
    const identifier = decodeURIComponent(pathname.slice('/api/v1/accounts/'.length));
    if (!idPattern.test(identifier) && !codePattern.test(identifier)) throw error(400,'Invalid contact identifier');
    const [rows] = await this.pool.execute(
      'SELECT id,kind,public_code,public_key,key_version FROM accounts WHERE id = ? OR public_code = ? LIMIT 1',
      [identifier,identifier]);
    if (!rows.length) throw error(404,'Account not found');
    const a = rows[0];
    responseJson(response,200,{accountId:a.id,code:a.public_code,kind:a.kind,publicKey:a.public_key,keyVersion:a.key_version});
  }
  async send(request,response) {
    const sender = await this.authenticate(request);
    const input = await readJson(request);
    if (!uuid.test(input.idempotencyKey || '')) throw error(400,'UUID idempotency key required');
    const envelope = input.envelope;
    if (!envelope || typeof envelope !== 'object' || !idPattern.test(envelope.recipientId || '') || sender.id === envelope.recipientId)
      throw error(400,'Stable recipient ID required');
    const [rows] = await this.pool.execute('SELECT id FROM accounts WHERE id = ? LIMIT 1',[envelope.recipientId]);
    if (!rows.length) throw error(404,'Recipient not found');
    const accepted = await this.outbox.enqueue({senderId:sender.id,tier:sender.kind==='personal'?'standard':sender.tier,
      envelope,idempotencyKey:input.idempotencyKey.toLowerCase()});
    responseJson(response,202,{messageId:accepted.id,status:'queued'});
  }
  async inbox(request,response,url) {
    const account = await this.authenticate(request);
    const raw = url.searchParams.get('after') || '0';
    if (!/^(0|[1-9][0-9]{0,14})$/.test(raw) || Number(raw) > Number.MAX_SAFE_INTEGER) throw error(400,'Invalid cursor');
    const [rows] = await this.pool.execute(
      `SELECT id,sender_business_id,message_type,ciphertext,nonce,image_ciphertext,image_nonce,wrapped_key,key_version,queued_at
       FROM encrypted_messages WHERE recipient_device_id = ? AND id > ? AND status = 'dispatched' ORDER BY id ASC LIMIT 100`,
      [account.id,Number(raw)]);
    responseJson(response,200,{messages:rows.map(row=>({id:String(row.id),senderId:Buffer.isBuffer(row.sender_business_id)?row.sender_business_id.toString('utf8'):String(row.sender_business_id),
      queuedAt:row.queued_at, envelope:{version:1,recipientId:account.id,template:row.message_type,
        ciphertext:Buffer.from(row.ciphertext).toString('base64'),nonce:Buffer.from(row.nonce).toString('base64'),
        wrappedKey:Buffer.from(row.wrapped_key).toString('base64'),keyVersion:row.key_version,
        ...(row.image_ciphertext ? {imageCiphertext:Buffer.from(row.image_ciphertext).toString('base64'),
          imageNonce:Buffer.from(row.image_nonce).toString('base64')} : {})}
    }))});
  }
  async handle(request,response,path) {
    try {
      const url = new URL(request.url,'http://localhost');
      if (await this.reputation.handle(request,response,path)) return;
      if (await this.reports.handle(request,response,path)) return;
      if (await this.contacts.handle(request,response,path)) return;
      if (request.method === 'POST' && path === '/api/v1/accounts') return await this.register(request,response);
      if (request.method === 'GET' && path.startsWith('/api/v1/accounts/')) return await this.getPublicKey(request,response,path);
      if (request.method === 'POST' && path === '/api/v1/messages') return await this.send(request,response);
      if (request.method === 'GET' && path === '/api/v1/messages') return await this.inbox(request,response,url);
      responseJson(response,405,{error:'Method not allowed'});
    } catch(e) {
      const status = Number.isInteger(e?.status) ? e.status :
        e?.name === 'MessageValidationError' || e instanceof TypeError || e instanceof RangeError ? 400 : 503;
      if (status === 503) console.error('Messaging API request failed:', e?.code || e?.message);
      if (!response.headersSent) responseJson(response,status,{error:status === 503 ? 'Service temporarily unavailable' : e.message});
    }
  }
}
