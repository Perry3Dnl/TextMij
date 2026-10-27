import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const origin = process.env.BENCHMARK_ORIGIN;
const revision = process.env.GITHUB_SHA || process.env.BENCHMARK_REVISION;
const token = process.env.BENCHMARK_TOKEN;
if (!origin || !revision || !token) throw new Error('Benchmark origin, revision and deployment credential required');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const response = await page.goto(origin, { waitUntil: 'networkidle' });
  if (!response.ok() || await page.locator('meta[name="conappt-revision"]').getAttribute('content') !== revision) throw new Error('Website is not running the intended revision');
  const result = await page.evaluate(async credential => {
    const { runBenchmark } = await import('/benchmark.js');
    return runBenchmark(credential);
  }, token);
  if (result.revision !== revision || result.completed < 1) throw new Error('No verified round trips for this release');
  const publicResult = await (await page.request.get(new URL('/api/benchmark', origin).href)).json();
  if (publicResult.completed !== result.completed || publicResult.revision !== revision) throw new Error('Published result does not match measurement');
  await page.reload({ waitUntil: 'networkidle' });
  const label = page.locator('#benchmark-status');
  await label.waitFor();
  if (!(await label.textContent()).includes(new Intl.NumberFormat('nl-NL').format(result.completed))) throw new Error('Result missing from app footer');
  // Check that the temporary footer leaves both navigation and chat composer usable.
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(new URL('/#home', origin).href);
    const footer = await label.boundingBox();
    if (!footer || footer.y + footer.height > viewport.height + 1) throw new Error('Footer outside viewport');
    if (viewport.width < 761) {
      const nav = await page.locator('.mobile-navigation').boundingBox();
      if (!nav || nav.y + nav.height > footer.y + 1) throw new Error('Footer overlaps mobile navigation');
    }
    await page.goto(new URL('/#gesprek/studio-noord', origin).href);
    const composer = await page.locator('.composer-wrap').boundingBox();
    if (!composer || composer.y + composer.height > footer.y + 1) throw new Error('Footer overlaps chat composer');
  }
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `### Browser round-trip stress test\n\n${result.completed.toLocaleString('en-US')} completed / 60 seconds, 1024 bytes each direction.\n\nSent: ${result.sent}; not returned before deadline: ${result.uncompleted}; failed requests: ${result.failedRequests}.\n\nSix increasing bursts, 10 seconds apart. Measured transport throughput, excluding chat persistence/queue. Revision: ${revision}.\n`, { flag: 'a' });
} finally { await browser.close(); }
