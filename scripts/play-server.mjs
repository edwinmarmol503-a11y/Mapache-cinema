// Serve a downloaded copy; rankings still use the shared HTTPS database.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const port = Number(process.env.PORT || 4174);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (!['/index.html', '/sw.js', '/manifest.webmanifest'].includes(relative) && !['/js/', '/css/', '/icons/', '/assets/'].some(prefix => relative.startsWith(prefix))) throw new Error('No encontrado');
    const filename = path.resolve(root, '.' + relative);
    if (!filename.startsWith(root + path.sep)) throw new Error('No encontrado');
    const contents = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch { response.writeHead(404); response.end('No encontrado'); }
}).listen(port, '127.0.0.1', () => console.log(`JUGAR: http://127.0.0.1:${port}\nClasificación mundial conectada a Lumera. Mantén esta ventana abierta mientras juegas.`));
