import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import worker from '../server/index.js';
const root = process.cwd();
const port = Number(process.env.PORT || 4173);
await mkdir(path.join(root, '.local'), { recursive: true });
const sqlite = new DatabaseSync(path.join(root, '.local/ranking.sqlite'));
sqlite.exec('PRAGMA foreign_keys=ON');
// Local SQLite is a development emulator. Production D1 applies migrations at deployment.
if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='players'").get()) sqlite.exec(await readFile(path.join(root, 'migrations/0001_ranking.sql'), 'utf8'));
class Statement {
  constructor(sql, values = []) { this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.sql, values); }
  async first(column) { const row = sqlite.prepare(this.sql).get(...this.values) || null; return column ? row?.[column] ?? null : row; }
  async all() { return { success: true, results: sqlite.prepare(this.sql).all(...this.values) }; }
  async run() { return this.execute(); }
  execute() {
    const statement = sqlite.prepare(this.sql);
    if (statement.columns().length) return { success: true, results: statement.all(...this.values) };
    return { success: true, results: [], meta: { changes: statement.run(...this.values).changes } };
  }
}
const db = {
  prepare(sql) { return new Statement(sql); },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8' };
const env = { DB: db, ASSETS: { fetch: async (request) => {
  const url = new URL(request.url);
  let relative;
  try { relative = decodeURIComponent(url.pathname); } catch { return new Response('Solicitud inválida', { status: 400 }); }
  if (relative === '/') relative = '/index.html';
  const filename = path.resolve(root, '.' + relative);
  if (!filename.startsWith(root + path.sep) || relative.split('/').some(p => p.startsWith('.') && p !== '') || !['/index.html', '/sw.js', '/manifest.webmanifest'].includes(relative) && !['/js/', '/css/', '/icons/', '/assets/', '/tests/'].some(p => relative.startsWith(p))) return new Response('No encontrado', { status: 404 });
  try {
    let contents = await readFile(filename);
    if (relative === '/index.html') {
      contents = contents.toString().replace('<script type="module" src="js/bootstrap.js">', '<script>window.MC_CONFIG={rankingApiBase:location.origin};</script><script type="module" src="js/bootstrap.js">');
    }
    return new Response(contents, { headers: { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
  } catch { return new Response('No encontrado', { status: 404 }); }
} } };
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = []; let length = 0;
    for await (const chunk of incoming) {
      length += chunk.length;
      if (length > 16384) { outgoing.writeHead(413); outgoing.end(); return; }
      chunks.push(chunk);
    }
    const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, { method: incoming.method, headers: incoming.headers, body: ['GET', 'HEAD'].includes(incoming.method) ? undefined : Buffer.concat(chunks) });
    const response = await worker.fetch(request, env, { waitUntil: p => p.catch(console.error) });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { console.error(error.message); outgoing.writeHead(500); outgoing.end('Error del servidor local'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Mapache Cinema: http://127.0.0.1:${port} · base de datos local de prueba`));
