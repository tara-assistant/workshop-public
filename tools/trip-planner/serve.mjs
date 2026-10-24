import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 8766);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.gpx': 'application/gpx+xml',
  '.md': 'text/plain; charset=utf-8'
};
const inside = (path) => {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../') && !isAbsolute(rel);
};

const server = createServer(async (req, res) => {
  const fail = (status, text) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(req.method === 'HEAD' ? undefined : text); };
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); fail(405, 'Method not allowed'); return; }
  try {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (!path.startsWith('/') || /[\\\0:]/.test(path)) { fail(403, 'Forbidden'); return; }
    let file = resolve(root, '.' + path);
    if (!inside(file)) { fail(403, 'Forbidden'); return; }
    file = await realpath(file);
    if (!inside(file)) { fail(403, 'Forbidden'); return; }
    if ((await stat(file)).isDirectory()) file = await realpath(resolve(file, 'index.html'));
    if (!inside(file)) { fail(403, 'Forbidden'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': body.length, 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) { fail(error instanceof URIError ? 400 : error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 403, 'File unavailable'); }
});

server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Trip Planner: http://127.0.0.1:${server.address().port}`));
