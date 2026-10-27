import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { BenchmarkApi } from '../src/benchmark.js';

const directory = await mkdtemp(join(tmpdir(), 'conappt-browser-'));
const token = randomBytes(32).toString('hex');
const revision = process.env.GITHUB_SHA || 'isolated-browser-test';
const server = createApp({ revision, benchmark: new BenchmarkApi({ revision, token, resultFile: join(directory, 'result.json') }) });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const child = spawn(process.execPath, ['scripts/run-benchmark.js'], { stdio: 'inherit', env: { ...process.env, BENCHMARK_ORIGIN: `http://127.0.0.1:${server.address().port}`, BENCHMARK_REVISION: revision, BENCHMARK_TOKEN: token } });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error('Isolated browser benchmark failed');
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true });
}
