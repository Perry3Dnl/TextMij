import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { BenchmarkApi } from './benchmark.js';

const appVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
function releaseHtml(html, revision) {
  // Revision originates from deployment metadata; never interpolate arbitrary HTML.
  const safeRevision = /^[a-zA-Z0-9._-]{1,80}$/.test(revision) ? revision : 'unknown';
  return html.toString('utf8').replace('</head>', `  <meta name="conappt-version" content="${appVersion}">\n    <meta name="conappt-revision" content="${safeRevision}">\n  </head>`);
}


const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/base.css', ['base.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/model.js', ['model.js', 'text/javascript']],
  ['/crypto.js', ['crypto.js', 'text/javascript']],
  ['/logo.js', ['logo.js', 'text/javascript']],
  ['/benchmark.js', ['benchmark.js', 'text/javascript']],
  ...['bootstrap.js','live-app.js','interactive-replies.js','opening-hours.js','session-ui.js','conversation-actions.js','client.js','device-store.js','contact-code.js','icons.js','business-templates.js','qr.js','report-options.js','vendor/qrcodegen.js','vendor/jsQR.js'].map(file => ['/'+file,[file,'text/javascript']]),
  ['/live.css', ['live.css','text/css']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']],
].map(([path, [file, type]]) => [path, {
  body: readFileSync(new URL(`../public/${file}`, import.meta.url)),
  contentType: `${type}; charset=utf-8`,
}]));

// The live client uses authenticated device profiles. The original preview remains opt-in.
export function createApp({ revision = 'development', messaging = null, benchmark = new BenchmarkApi({ revision }) } = {}) {
  return createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    let path;
    try { path = new URL(request.url, 'http://localhost').pathname; }
    catch {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Invalid request URL' }));
      return;
    }
    if (path === '/api/benchmark' || path.startsWith('/api/benchmark/')) {
      void benchmark.handle(request, response, path).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
      return;
    }
    if (path === '/api/ready') {
      if (!messaging || request.method !== 'GET') {
        response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ status: 'unavailable' }));
        return;
      }
      void messaging.pool.query('SELECT 1').then(() => {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({status:'ready'}));
      }).catch(() => {
        response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({status:'unavailable'}));
      });
      return;
    }
    if (path.startsWith('/api/v1/') && messaging) { void messaging.handle(request, response, path); return; }
    let status = 200;
    let body;
    let contentType = 'application/json; charset=utf-8';

    if (!assets.has(path) && path !== '/api/health') {
      status = 404;
      body = JSON.stringify({ error: 'Not found' });
    } else if (!['GET', 'HEAD'].includes(request.method)) {
      status = 405;
      response.setHeader('Allow', 'GET, HEAD');
      body = JSON.stringify({ error: 'Method not allowed' });
    } else if (path === '/api/health') {
      body = JSON.stringify({ status: 'ok', service: 'textmij', revision });
    } else {
      ({ contentType, body } = assets.get(path));
      if (path === '/') body = releaseHtml(body, revision);
    }

    response.writeHead(status, { 'Content-Type': contentType });
    response.end(request.method === 'HEAD' ? undefined : body);
  });
}

