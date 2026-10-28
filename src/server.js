import { createApp } from './app.js';
import { DurableDispatcher } from './durable-dispatcher.js';
import { MessagingApi } from './messaging-api.js';
import { readFileSync } from 'node:fs';
import { BenchmarkApi } from './benchmark.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');

let pool, dispatcher, messaging;
if (process.env.TEXTMIJ_MESSAGING_ENABLED === '1') {
  for (const key of ['MYSQL_HOST','MYSQL_USER','MYSQL_DATABASE','MYSQL_PASSWORD_FILE']) {
    if (!process.env[key]) throw new Error(key + ' required when messaging is enabled');
  }
  // This optional dependency is imported only when the MySQL backend is configured.
  const { createPool } = await import('mysql2/promise');
  pool = createPool({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, database: process.env.MYSQL_DATABASE,
    password: readFileSync(process.env.MYSQL_PASSWORD_FILE,'utf8').trimEnd(),
    connectionLimit: 5, waitForConnections: true, queueLimit: 50, connectTimeout: 5000,
    namedPlaceholders: false, multipleStatements: false,
  });
  // Reject startup without correctly provisioned schema rather than silently dropping messages.
  try {
    await pool.query('SELECT id, kind, tier, credential_hash FROM accounts LIMIT 0');
    await pool.query('SELECT payload_hash FROM encrypted_messages LIMIT 0');
    await pool.query('SELECT last_dispatch FROM dispatch_clock LIMIT 0');
    await pool.query('SELECT account_id FROM business_profiles LIMIT 0');
    await pool.query('SELECT business_id,customer_id FROM connections LIMIT 0');
    await pool.query('SELECT id,status FROM business_reports LIMIT 0');
    await pool.query('SELECT business_id,stars FROM business_ratings LIMIT 0');
    messaging = new MessagingApi(pool);
    dispatcher = new DurableDispatcher(pool);
  } catch (e) { await pool.end(); throw e; }
}
const revision = process.env.APP_REVISION || 'development';
const benchmark = new BenchmarkApi({ revision,
  token: process.env.BENCHMARK_TOKEN_FILE ? readFileSync(process.env.BENCHMARK_TOKEN_FILE, 'utf8').trim() : '',
  resultFile: process.env.BENCHMARK_RESULT_FILE,
});
const server = createApp({ revision, messaging, benchmark });
server.listen(port, '0.0.0.0', () => {
  console.log(`TextMij listening on port ${port}`);
  dispatcher?.start();
});
for (const signal of ['SIGTERM','SIGINT']) {
  process.on(signal, () => {
    dispatcher?.stop();
    server.close(async () => { await pool?.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
