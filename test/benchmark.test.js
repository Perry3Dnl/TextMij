import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { BenchmarkApi } from '../src/benchmark.js';
import { formatBenchmark, nextBurstTarget } from '../public/benchmark.js';

test('isolated benchmark measures exact binary returns and persists revision-bound results', async t => {
  let time = 100_000;
  const dir = await mkdtemp(join(tmpdir(), 'conappt-benchmark-'));
  const resultFile = join(dir, 'result.json');
  t.after(() => rm(dir, { recursive: true }));
  const benchmark = new BenchmarkApi({ revision: 'release-a', token: 'test-secret', resultFile, now: () => time });
  const server = createApp({ revision: 'release-a', benchmark });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const status = () => fetch(origin + '/api/benchmark').then(r => r.json());
  const headers = { Authorization: 'Bearer test-secret' };
  const post = (path, body, extra = {}) => fetch(origin + '/api/benchmark/' + path, { method: 'POST', headers: { ...headers, ...extra }, body });

  assert.equal((await status()).status, 'pending');
  assert.equal((await fetch(origin + '/api/benchmark/start', { method: 'POST' })).status, 401);
  const start = await post('start');
  assert.equal(start.status, 201);
  const { runId } = await start.json();
  const batchHeaders = { 'X-Benchmark-Run': runId, 'Content-Type': 'application/octet-stream' };
  assert.equal((await post('start')).status, 409);
  assert.equal((await post('echo', randomBytes(1024), { ...batchHeaders, 'X-Benchmark-Run': 'wrong' })).status, 409);
  for (const size of [0, 1023, 1025]) assert.equal((await post('echo', randomBytes(size), batchHeaders)).status, 400);
  assert.equal((await post('echo', randomBytes(256 * 1024 + 1), batchHeaders)).status, 413);
  const payload = randomBytes(256 * 1024);
  const echo = await post('echo', payload, batchHeaders);
  assert.equal(echo.status, 200);
  assert.equal(echo.headers.get('content-encoding'), 'identity');
  assert.deepEqual(Buffer.from(await echo.arrayBuffer()), payload);
  assert.equal((await status()).received, 256);
  const result = { sent: 260, completed: 256, elapsedMs: 60_000, failedRequests: 1,
    bursts: Array.from({ length: 6 }, (_, i) => ({ offsetMs: i * 10_000, target: 260, sent: i ? 0 : 260, completed: i ? 0 : 256 })) };
  const finish = value => post('finish', JSON.stringify(value), { ...batchHeaders, 'Content-Type': 'application/json' });
  assert.equal((await finish(result)).status, 400, 'cannot publish before 60 seconds');
  time += 60_000;
  assert.equal((await finish({ ...result, completed: 257 })).status, 400, 'cannot count undelivered messages');
  assert.equal((await finish({ ...result, bursts: result.bursts.slice(1) })).status, 400);
  const finished = await finish(result);
  assert.equal(finished.status, 200);
  const saved = await finished.json();
  assert.equal(saved.completed, 256);
  assert.equal(saved.uncompleted, 4);
  assert.equal(saved.roundTripBytes, 256 * 1024 * 2);
  assert.equal(saved.serverReceived, 256);
  assert.deepEqual(await status(), saved);
  assert.deepEqual(JSON.parse(await readFile(resultFile, 'utf8')), saved);
  assert.equal(new BenchmarkApi({ revision: 'release-a', resultFile }).status().completed, 256);
  assert.equal(new BenchmarkApi({ revision: 'release-b', resultFile }).status().status, 'pending');
  assert.equal((await post('echo', payload, batchHeaders)).status, 409, 'load endpoint closes after finish');
  assert.ok(!JSON.stringify(saved).includes('test-secret'));
});

test('stale benchmark reports failure and refuses further traffic', async () => {
  let now = 0;
  const api = new BenchmarkApi({ revision: 'r', token: 'secret', now: () => now });
  api.run = { id: 'test', started: 0 };
  now = 90_001;
  assert.equal(api.status().status, 'failed');
});

test('full large counts are displayed and adaptive demand has no small counter cap', () => {
  const label = formatBenchmark({ status: 'complete', completed: 100_000_000, uncompleted: 1 });
  assert.ok(label.includes('100.000.000'));
  assert.ok(label.includes('60 s'));
  assert.equal(nextBurstTarget(100_000_000, 100_000_000, 1000), 1_150_000_000);
  assert.equal(formatBenchmark({ status: 'failed' }), 'Dev-test · stresstest niet voltooid');
});
