// Local dev server that mimics Vercel (api/ functions + public/). With ACTAS_MOCK=1 it uses sample PDFs from fixtures/ instead of Silogtran/AI.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url).pathname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const parts = url.pathname.slice(5).split('/').filter(Boolean);
      const file = parts.length === 1 ? join(ROOT, 'api', `${parts[0]}.js`) : join(ROOT, 'api', parts[0], '[action].js');
      if (!existsSync(file)) { res.statusCode = 404; return res.end('{"ok":false,"code":"NOT_FOUND"}'); }
      req.query = { ...Object.fromEntries(url.searchParams), ...(parts.length > 1 ? { action: parts[1] } : {}) };
      const chunks = []; for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString();
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      res.send = (b) => res.end(b);
      return (await import(pathToFileURL(file).href)).default(req, res);
    }
    const p = url.pathname === '/' ? '/index.html' : url.pathname;
    const body = await readFile(join(ROOT, 'public', p));
    res.setHeader('content-type', MIME[extname(p)] || 'application/octet-stream'); res.end(body);
  } catch (e) { res.statusCode = e.code === 'ENOENT' ? 404 : 500; res.end(String(e.message)); }
}).listen(Number(process.env.PORT) || 3000, () => console.log('dev server on', process.env.PORT || 3000));
