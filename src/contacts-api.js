import { httpError, readJson, responseJson } from './http-json.js';
import { cleanBusinessProfile, BUSINESS_THEMES, validThemeColors } from '../public/model.js';
import { industryFor } from '../public/business-templates.js';

function parseProfile(value) {
  try { return typeof value === 'string' ? JSON.parse(value) : value || {}; }
  catch { return {}; }
}

export function publicAccount(row) {
  const result = {
    accountId: String(row.id), kind: row.kind, code: row.public_code,
    name: row.display_name, publicKey: row.public_key, keyVersion: row.key_version,
  };
  if (row.kind === 'business') {
    const profile = parseProfile(row.profile_json);
    result.profile = cleanBusinessProfile(profile);
    result.theme = Object.hasOwn(BUSINESS_THEMES, profile.theme) ? profile.theme : 'white';
    result.customTheme = validThemeColors(profile.customTheme) ? profile.customTheme : null;
    result.industryId = industryFor(row.industry_id)?.id || null;
  }
  return result;
}

export class ContactsApi {
  constructor(pool, authenticate) {
    this.pool = pool;
    this.authenticate = authenticate;
  }
  async account(id) {
    const [rows] = await this.pool.execute(
      'SELECT a.*, p.industry_id, p.profile_json FROM accounts a LEFT JOIN business_profiles p ON p.account_id = a.id WHERE a.id = ? LIMIT 1',
      [id]);
    if (!rows.length) throw httpError(404, 'Account not found');
    return publicAccount(rows[0]);
  }
  async handle(request, response, path) {
    if (!['/api/v1/session', '/api/v1/profile', '/api/v1/connections'].includes(path)) return false;
    const account = await this.authenticate(request);
    if (path === '/api/v1/session' && request.method === 'GET') {
      responseJson(response, 200, await this.account(account.id));
    } else if (path === '/api/v1/profile' && request.method === 'PUT') {
      const input = await readJson(request, 160 * 1024);
      if (typeof input.name !== 'string' || !input.name.trim() || Array.from(input.name.trim()).length > 80)
        throw httpError(400, 'Display name required (maximum 80 characters)');
      if (account.kind === 'business') {
        if (input.industryId !== null && input.industryId !== undefined && !industryFor(input.industryId))
          throw httpError(400, 'Unknown business template');
        const profile = cleanBusinessProfile(input.profile);
        profile.theme = Object.hasOwn(BUSINESS_THEMES, input.theme) ? input.theme : 'white';
        if (profile.theme === 'custom' && !validThemeColors(input.customTheme))
          throw httpError(400, 'Invalid theme colors');
        if (profile.theme === 'custom') profile.customTheme = input.customTheme;
        await this.pool.execute(
          'INSERT INTO business_profiles (account_id, industry_id, profile_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE industry_id = ?, profile_json = ?',
          [account.id, input.industryId || null, JSON.stringify(profile), input.industryId || null, JSON.stringify(profile)]);
      }
      await this.pool.execute('UPDATE accounts SET display_name = ? WHERE id = ?', [input.name.trim(), account.id]);
      responseJson(response, 200, await this.account(account.id));
    } else if (path === '/api/v1/connections' && request.method === 'POST') {
      if (account.kind !== 'business') throw httpError(403, 'Only businesses can connect a customer');
      const input = await readJson(request);
      const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
      if (!/^[0-9]{4}-[A-Z]{3}-[A-Z]{3}$/.test(code)) throw httpError(400, 'Invalid customer code');
      const [rows] = await this.pool.execute('SELECT id,kind FROM accounts WHERE public_code = ? LIMIT 1', [code]);
      if (!rows.length) throw httpError(404, 'Customer not found');
      const customer = rows[0];
      if (customer.kind !== 'personal' || customer.id === account.id) throw httpError(400, 'A customer code is required');
      const alias = typeof input.alias === 'string' ? Array.from(input.alias.trim()).slice(0,60).join('') : '';
      const [created] = await this.pool.execute(
        'INSERT IGNORE INTO connections (business_id,customer_id,customer_alias) VALUES (?,?,?)',
        [account.id, customer.id, alias]);
      if (alias) await this.pool.execute(
        'UPDATE connections SET customer_alias = ? WHERE business_id = ? AND customer_id = ?', [alias, account.id, customer.id]);
      responseJson(response, created.affectedRows ? 201 : 200, { contact: await this.account(customer.id) });
    } else if (path === '/api/v1/connections' && request.method === 'GET') {
      const business = account.kind === 'business';
      const [rows] = await this.pool.execute(
        'SELECT a.*, p.industry_id, p.profile_json, c.customer_alias, c.created_at AS connected_at ' +
        'FROM connections c JOIN accounts a ON a.id = ' + (business ? 'c.customer_id' : 'c.business_id') +
        ' LEFT JOIN business_profiles p ON p.account_id = a.id WHERE ' + (business ? 'c.business_id' : 'c.customer_id') +
        ' = ? ORDER BY c.created_at DESC LIMIT 1000', [account.id]);
      responseJson(response, 200, { contacts: rows.map(row => ({
        ...publicAccount(row), connectedAt: row.connected_at,
        ...(business && row.customer_alias ? { alias: row.customer_alias } : {}),
      })) });
    } else {
      responseJson(response, 405, { error: 'Method not allowed' });
    }
    return true;
  }
}
