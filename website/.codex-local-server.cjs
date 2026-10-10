const http = require('http');
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};
function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}
function resolveRequest(url) {
  const parsed = new URL(url, `http://127.0.0.1:${port}`);
  let pathname = safeDecode(parsed.pathname).replace(/^\/+/, '').replace(/\\/g, '/');
  if (!pathname) pathname = 'index.html';
  if (/^magazin\/produs\/[^/]+\/?$/i.test(pathname)) pathname = 'produs.html';
  const candidates = [];
  candidates.push(pathname);
  if (!path.extname(pathname)) {
    candidates.push(`${pathname}.html`);
    candidates.push(path.join(pathname, 'index.html'));
  }
  for (const rel of candidates) {
    const full = path.resolve(root, rel);
    if (!full.startsWith(root)) continue;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  const fallback = path.resolve(root, '404.html');
  return fs.existsSync(fallback) ? fallback : null;
}
const server = http.createServer((req, res) => {
  const file = resolveRequest(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const is404 = path.basename(file).toLowerCase() === '404.html' && !fs.existsSync(path.resolve(root, safeDecode(new URL(req.url, `http://127.0.0.1:${port}`).pathname).replace(/^\/+/, '')));
  res.writeHead(is404 ? 404 : 200, {
    'content-type': mime[ext] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  fs.createReadStream(file).pipe(res);
});
server.listen(port, '0.0.0.0', () => console.log(`G-Trots local server: http://127.0.0.1:${port}/`));
