import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import handler from '../api/studio.js';

const root = resolve('public');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/api/studio') return await handler(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const name = path === '/' ? '/index.html' : path === '/watch' ? '/watch.html' : path;
    const file = resolve(root, '.' + name);
    if (!file.startsWith(root + sep)) { res.writeHead(404).end(); return; }
    const content = await readFile(file);
    res.setHeader('Content-Type', (mime[extname(file)] || 'application/octet-stream') +
      (/\.(html|js|mjs|css|txt)$/.test(file) ? '; charset=utf-8' : ''));
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404).end(); }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '127.0.0.1', () => console.log('Avatar Bulletin studio http://127.0.0.1:' + port));
