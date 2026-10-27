import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

test('HTTP deployment contract', async (t) => {
  const revision = 'a'.repeat(40);
  const server = createApp({ revision });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  await t.test('health identifies the exact running revision and is not cached', async () => {
    const response = await fetch(`${origin}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { status: 'ok', service: 'textmij', revision });
  });
  await t.test('web entry point is served', async () => {
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /<title>Conappt/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  });
  await t.test('client assets have correct MIME types and cannot read arbitrary files', async () => {
    for (const [path, type] of [['/styles.css', 'text/css'], ['/base.css', 'text/css'], ['/app.js', 'text/javascript'], ['/model.js', 'text/javascript'], ['/icon.svg', 'image/svg+xml']]) {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, 200, path);
      assert.ok(response.headers.get('content-type').startsWith(type), path);
      assert.ok((await response.text()).length > 0, path);
    }
    assert.equal((await fetch(`${origin}/package.json`)).status, 404);
    assert.equal((await fetch(`${origin}/src/app.js`)).status, 404);
  });
  await t.test('HEAD returns headers without a response body', async () => {
    const response = await fetch(`${origin}/api/health`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  });
  await t.test('unimplemented API endpoints fail instead of reporting success', async () => {
    const response = await fetch(`${origin}/api/messages`);
    assert.equal(response.status, 404);
  });
  await t.test('health endpoint rejects writes', async () => {
    const response = await fetch(`${origin}/api/health`, { method: 'POST' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  });
});
