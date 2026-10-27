export function nextBurstTarget(previous, completed, elapsedMs) {
  // A target is demand, never the reported capacity. Batches bound memory at any size.
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(previous * 2, Math.ceil(completed * 10_000 / Math.max(elapsedMs, 1) * 1.15)));
}

export function formatBenchmark(result) {
  if (result.status === 'complete') {
    const n = value => new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(value);
    return `Dev-test · ${n(result.completed)} retourberichten / 60 s · 1 KB · ${n(result.uncompleted)} niet retour`;
  }
  if (result.status === 'running') return 'Dev-test · 60 seconden stresstest bezig… · 1 KB';
  if (result.status === 'failed') return 'Dev-test · stresstest niet voltooid';
  return 'Dev-test · wacht op stresstest van deze update · 1 KB';
}

// Invoked only by the deployment browser; ordinary visitors only read the result.
export async function runBenchmark(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const start = await fetch('/api/benchmark/start', { method: 'POST', headers });
  if (!start.ok) throw new Error(`Benchmark start failed (${start.status})`);
  const config = await start.json();
  const started = performance.now();
  const deadline = started + config.durationMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.durationMs);
  const bursts = [];
  let target = 1_000_000, sequence = 0, sent = 0, completed = 0, failedRequests = 0;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    for (let index = 0; index < 6; index++) {
      const offsetMs = index * config.intervalMs;
      await sleep(Math.max(0, started + offsetMs - performance.now()));
      const burst = { offsetMs, target, sent: 0, completed: 0 };
      bursts.push(burst);
      const burstStarted = performance.now();
      const burstEnd = Math.min(deadline, started + offsetMs + config.intervalMs);
      let claimed = 0;
      await Promise.all(Array.from({ length: config.concurrency }, async () => {
        while (claimed < target && performance.now() < burstEnd && !controller.signal.aborted) {
          const count = Math.min(config.batchMessages, target - claimed);
          claimed += count;
          const body = new Uint8Array(count * config.payloadBytes);
          for (let offset = 0; offset < body.length; offset += 65536) crypto.getRandomValues(body.subarray(offset, Math.min(offset + 65536, body.length)));
          const view = new DataView(body.buffer);
          for (let message = 0; message < count; message++) view.setBigUint64(message * config.payloadBytes, BigInt(sequence++));
          sent += count; burst.sent += count;
          try {
            const response = await fetch('/api/benchmark/echo', {
              method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-Benchmark-Run': config.runId },
              body, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(1, Math.ceil(burstEnd - performance.now())))]),
            });
            if (!response.ok) throw new Error('echo');
            const echoed = new Uint8Array(await response.arrayBuffer());
            if (echoed.length !== body.length) throw new Error('length');
            for (let i = 0; i < body.length; i++) if (body[i] !== echoed[i]) throw new Error('corrupt');
            if (performance.now() <= deadline) { completed += count; burst.completed += count; }
          } catch {
            failedRequests++;
            if (!controller.signal.aborted) await sleep(100);
          }
        }
      }));
      target = nextBurstTarget(target, burst.completed, performance.now() - burstStarted);
    }
    await sleep(Math.max(0, deadline - performance.now()));
  } finally { clearTimeout(timer); controller.abort(); }
  const finish = await fetch('/api/benchmark/finish', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-Benchmark-Run': config.runId }, body: JSON.stringify({ sent, completed, failedRequests, bursts, elapsedMs: performance.now() - started }) });
  if (!finish.ok) throw new Error(`Benchmark result failed (${finish.status})`);
  return finish.json();
}

export function startBenchmarkLabel(element) {
  async function refresh() {
    if (document.hidden) return;
    try {
      const response = await fetch('/api/benchmark', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('status');
      const result = await response.json();
      element.textContent = formatBenchmark(result);
      element.dataset.status = result.status;
      element.title = result.status === 'complete'
        ? `Gemeten browser ↔ HTTPS-server transport, zonder chatopslag of wachtrij. ${result.sent.toLocaleString('nl-NL')} verzonden; ${result.completed.toLocaleString('nl-NL')} byte voor byte gecontroleerd retour binnen 60 s. Zes oplopende bursts om de 10 s; 1024 bytes per bericht per richting. ${result.measuredAt} · ${result.revision}`
        : 'Automatische ontwikkeltest na iedere deployment. Geen berichten van klanten.';
    } catch { element.textContent = 'Dev-test · testresultaat tijdelijk niet bereikbaar'; }
  }
  void refresh();
  setInterval(() => void refresh(), 15_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
}
