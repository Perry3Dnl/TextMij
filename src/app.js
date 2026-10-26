import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../public/index.html', import.meta.url));

// Deployment foundation only. Messaging and authentication are not implemented yet.
export function createApp({ revision = 'development' } = {}) {
  return createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const path = new URL(request.url, 'http://localhost').pathname;
    let status = 200;
    let body;
    let contentType = 'application/json; charset=utf-8';

    if (path !== '/' && path !== '/api/health') {
      status = 404;
      body = JSON.stringify({ error: 'Not found' });
    } else if (!['GET', 'HEAD'].includes(request.method)) {
      status = 405;
      response.setHeader('Allow', 'GET, HEAD');
      body = JSON.stringify({ error: 'Method not allowed' });
    } else if (path === '/api/health') {
      body = JSON.stringify({ status: 'ok', service: 'textmij', revision });
    } else {
      contentType = 'text/html; charset=utf-8';
      body = home;
    }

    response.writeHead(status, { 'Content-Type': contentType });
    response.end(request.method === 'HEAD' ? undefined : body);
  });
}
