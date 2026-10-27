export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export async function readJson(request, limit = 16 * 1024) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers['content-type'] || ''))
    throw httpError(415, 'JSON content type required');
  const parts = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw httpError(413, 'Request too large');
    parts.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw httpError(400, 'Invalid JSON object'); }
}

export function responseJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}
