import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';

export const BENCHMARK = Object.freeze({ durationMs: 60_000, intervalMs: 10_000, payloadBytes: 1024, batchMessages: 256, concurrency: 6 });
const maxBody = BENCHMARK.payloadBytes * BENCHMARK.batchMessages;
const integer = value => Number.isSafeInteger(value) && value >= 0;

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  if (Number(request.headers['content-length']) > limit) throw new Error('body');
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('body');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// An isolated transport diagnostic: never inserts messages into customer storage.
export class BenchmarkApi {
  constructor({ revision, token = '', resultFile, now = Date.now }) {
    this.revision = revision;
    this.token = Buffer.from(token);
    this.resultFile = resultFile;
    this.now = now;
    this.used = false;
    try {
      const saved = JSON.parse(readFileSync(resultFile, 'utf8'));
      if (saved.revision === revision && saved.status === 'complete') this.result = saved;
    } catch { /* A new installation/revision has no result yet. */ }
  }

  status() {
    if (this.run) {
      if (this.now() - this.run.started > 90_000) {
        return { status: 'failed', revision: this.revision, reason: 'timeout' };
      }
      return { status: 'running', revision: this.revision, received: this.run.received, ...BENCHMARK };
    }
    return this.result || { status: this.used ? 'failed' : 'pending', revision: this.revision, ...BENCHMARK };
  }

  async handle(request, response, path) {
    const json = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    if (path === '/api/benchmark' && request.method === 'GET') return json(200, this.status());
    const supplied = Buffer.from((request.headers.authorization || '').replace(/^Bearer /, ''));
    if (!this.token.length || supplied.length !== this.token.length || !timingSafeEqual(supplied, this.token)) return json(401, { error: 'Unauthorized' });
    if (request.method !== 'POST') return json(405, { error: 'POST required' });
    if (path === '/api/benchmark/start') {
      if (this.used) return json(409, { error: 'Benchmark already started for this process' });
      this.used = true;
      this.run = { id: randomUUID(), started: this.now(), received: 0, echoed: 0, inFlight: 0 };
      return json(201, { runId: this.run.id, revision: this.revision, ...BENCHMARK });
    }
    const run = this.run;
    if (!run || request.headers['x-benchmark-run'] !== run.id || this.now() - run.started > 90_000) return json(409, { error: 'No active benchmark' });
    if (path === '/api/benchmark/echo') {
      if (this.now() - run.started > BENCHMARK.durationMs + 5000) return json(409, { error: 'Measurement ended' });
      if (run.inFlight >= BENCHMARK.concurrency) return json(429, { error: 'Too many batches' });
      run.inFlight++;
      request.setTimeout(5000, () => request.destroy());
      try {
        const body = await readBody(request, maxBody);
        if (!body.length || body.length % BENCHMARK.payloadBytes || request.headers['content-type'] !== 'application/octet-stream') return json(400, { error: 'Whole 1024-byte messages required' });
        const count = body.length / BENCHMARK.payloadBytes;
        run.received += count;
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'identity', 'Content-Length': body.length });
        // Finishing the write is a server-side count, not proof of browser delivery.
        response.once('finish', () => { run.echoed += count; });
        response.end(body);
      } catch {
        if (!response.destroyed && !response.headersSent) json(413, { error: 'Invalid or oversized batch' });
      } finally { run.inFlight--; }
      return;
    }
    if (path === '/api/benchmark/finish') {
      try {
        const result = JSON.parse((await readBody(request, 16_384)).toString());
        const { sent, completed, failedRequests, bursts, elapsedMs } = result;
        if (![sent, completed, failedRequests].every(integer) || completed > sent || completed > run.echoed || !Number.isFinite(elapsedMs) || elapsedMs < BENCHMARK.durationMs || elapsedMs > BENCHMARK.durationMs + 2000 || this.now() - run.started < BENCHMARK.durationMs || !Array.isArray(bursts) || bursts.length !== 6) throw new Error('result');
        const cleanBursts = bursts.map((burst, index) => {
          if (burst.offsetMs !== index * BENCHMARK.intervalMs || ![burst.target, burst.sent, burst.completed].every(integer) || burst.completed > burst.sent || burst.sent > burst.target) throw new Error('burst');
          return { offsetMs: burst.offsetMs, target: burst.target, sent: burst.sent, completed: burst.completed };
        });
        if (cleanBursts.reduce((sum, b) => sum + b.completed, 0) !== completed || cleanBursts.reduce((sum, b) => sum + b.sent, 0) !== sent) throw new Error('totals');
        const saved = { status: 'complete', revision: this.revision, measuredAt: new Date(this.now()).toISOString(), ...BENCHMARK, elapsedMs, sent, completed, uncompleted: sent - completed, failedRequests, serverReceived: run.received, serverEchoed: run.echoed, messagesPerSecond: completed / 60, roundTripBytes: completed * BENCHMARK.payloadBytes * 2, bursts: cleanBursts };
        if (this.resultFile) {
          await writeFile(this.resultFile + '.tmp', JSON.stringify(saved) + '\n', { mode: 0o600 });
          await rename(this.resultFile + '.tmp', this.resultFile);
        }
        this.result = saved;
        this.run = null;
        return json(200, saved);
      } catch { return json(400, { error: 'Invalid benchmark result or result could not be saved' }); }
    }
    return json(404, { error: 'Not found' });
  }
}
