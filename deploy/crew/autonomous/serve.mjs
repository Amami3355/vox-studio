import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 8767);
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };
http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep) || !types[path.extname(file)]) {
      res.writeHead(404).end(); return;
    }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    const headers = { 'Content-Type': types[path.extname(file)], 'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    let start = 0, end = info.size - 1, status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) { res.writeHead(416).end(); return; }
      start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      if (start > end || start >= info.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return;
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      status = 206;
    }
    res.writeHead(status, { ...headers, 'Content-Length': Math.max(0, end - start + 1) });
    if (req.method === 'HEAD' || info.size === 0) res.end();
    else createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
