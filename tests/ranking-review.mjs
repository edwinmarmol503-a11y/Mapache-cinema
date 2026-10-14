// Two isolated real browser profiles, real HTTP endpoints and actual SQLite
// transactions. The database is in memory and all off-origin traffic is blocked.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Worker from '../server/index.js';
import { createTestDatabase } from './ranking-d1.mjs';

const root = process.cwd();
const output = path.resolve('test-results/ranking-v6');
await mkdir(output, { recursive: true });
const db = createTestDatabase();
const apiCalls = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://${incoming.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const request = new Request(url, { method: incoming.method, headers: incoming.headers,
        ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Buffer.concat(chunks) } : {}) });
      const response = await Worker.fetch(request, { DB: db }, {});
      const body = await response.text();
      apiCalls.push({ method: incoming.method, path: url.pathname, status: response.status });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(body); return;
    }
    const relative = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const filename = path.resolve(root, '.' + relative);
    if (!filename.startsWith(root + path.sep) || relative.split('/').some(part => part.startsWith('.'))) throw Error('Path');
    let content = await readFile(filename);
    if (relative === '/index.html') content = content.toString().replace('<head>', '<head><script>window.MC_CONFIG={rankingApiBase:location.origin}</script>');
    outgoing.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); outgoing.end(content);
  } catch { outgoing.writeHead(404); outgoing.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const browser = await chromium.launch({ headless: true });
const errors = [];
const report = { checks: [], origin, apiCalls, errors, productionRequests: 0 };
const contexts = [];
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  contexts.push(context);
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  try { await page.waitForFunction(() => !!window.MC?.Ranking.getStatus().playerId && document.getElementById('boot-hint').classList.contains('hide'), null, { timeout: 12000 }); }
  catch (error) { console.log(await page.evaluate(() => ({ mc: !!window.MC, ranking: window.MC?.Ranking.getStatus(), boot: document.getElementById('boot-hint').outerHTML }))); throw error; }
  await page.evaluate(() => { MC.Audio.master.gain.value = 0; });
  return page;
}
async function playing(page) {
  await page.waitForFunction(() => !MC.game._rankingStarting && !!MC.game._levelTicket);
  await page.evaluate(() => {
    const g = MC.game;
    g.state = 'playing'; g.dialogue.active = false; g.transition = null; g.fadeAlpha = 0;
    g.triggers.forEach(trigger => trigger.fired = true);
    g.player.invuln = 3600;
    g.enemies.forEach(enemy => enemy.x = -1000);
  });
}
async function activeMs(page) { return page.evaluate(() => MC.game.getLevelElapsedMs()); }

try {
  const a = await newPage();
  const b = await newPage();
  const ids = await Promise.all([a, b].map(page => page.evaluate(() => MC.Ranking.getStatus().playerId)));
  assert.notEqual(ids[0], ids[1]);
  report.checks.push('Dos perfiles independientes tienen identidades distintas en la misma base SQLite.');
  await a.evaluate(() => {
    const meta = MC.Save.loadMeta(); meta.nightmareDeaths = 25; MC.Save.saveMeta(meta);
    MC.menu.hooks.onPlayLevel('nightmare', 0, 'QA_AYUDA');
  });
  await playing(a);
  await a.waitForFunction(() => MC.game.getLevelElapsedMs() >= 6000, null, { timeout: 30000 });
  await a.keyboard.press('Escape');
  await a.waitForFunction(() => MC.pause.active);
  const paused = await activeMs(a);
  await a.waitForTimeout(1200);
  assert.equal(await activeMs(a), paused);
  await a.locator('#screen-pause [data-act="options"]').click();
  await a.waitForTimeout(1200);
  assert.equal(await activeMs(a), paused);
  await a.evaluate(() => { MC.menu.closeOptions(); MC.pause.resume(); MC.game.startDialogue([{ text: 'Prueba de diálogo con cronómetro congelado.' }]); });
  const dialogue = await activeMs(a);
  await a.waitForTimeout(1200);
  assert.equal(await activeMs(a), dialogue);
  await a.evaluate(() => { MC.game.dialogue.active = false; MC.pause.hooks.onExitToMenu(); });
  const saved = await a.evaluate(() => ({ campaignId: MC.Save.data.rankingSession.campaignTicket.id, levelId: MC.Save.data.rankingSession.levelTicket.id, time: MC.Save.data.rankingSession.levelElapsedMs }));
  await a.locator('#btn-continue').click();
  await playing(a);
  assert.deepEqual(await a.evaluate(() => ({ campaignId: MC.game._campaignTicket.id, levelId: MC.game._levelTicket.id })), { campaignId: saved.campaignId, levelId: saved.levelId });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM runs').get().n, 2);
  report.pauseMs = paused;
  report.checks.push('Cronómetro congelado con Escape, Opciones y diálogo; continuar reutiliza los tickets originales.');
  for (let level = 1; level < 5; level++) {
    await a.evaluate(() => MC.game.nextLevel());
    await a.waitForFunction(level => MC.game.levelIndex === level && !MC.game._rankingStarting, level);
    await playing(a);
    await a.waitForFunction(() => MC.game.getLevelElapsedMs() >= 5200, null, { timeout: 30000 });
  }
  await a.evaluate(() => {
    window.qaCampaignTicket = { ...MC.game._campaignTicket };
    MC.game.onBossDefeated();
    MC.game._playEnding('B');
  });
  await a.waitForFunction(async () => (await MC.Ranking.getLeaderboard({ difficulty: 'nightmare', kind: 'campaign', level: -1, assisted: true })).entries.length === 1);
  const rows = db.sqlite.prepare('SELECT difficulty, kind, level, ruleset, elapsed_ms, ending FROM scores ORDER BY kind, level').all();
  assert.equal(rows.length, 6);
  assert.ok(rows.every(row => row.ruleset.endsWith(':assisted')));
  const campaign = rows.find(row => row.kind === 'campaign');
  assert.equal(campaign.ending, 'B');
  await b.evaluate(async () => {
    MC.menu._scoreDiff = 'nightmare'; MC.menu.showScores();
    document.getElementById('score-level').value = '-1';
    document.getElementById('score-assisted').value = 'assisted';
    await MC.menu._renderScores();
  });
  await b.waitForFunction(() => document.getElementById('score-table').textContent.includes('QA_AYUDA'));
  assert.deepEqual(await b.locator('.s-name').allTextContents(), ['QA_AYUDA']);
  await b.screenshot({ path: path.join(output, 'clasificacion-dos-dispositivos.png') });
  report.checks.push('Cinco niveles y campaña Pesadilla con ayuda aparecen en el segundo navegador con el apodo exacto.');
  const duplicate = await a.evaluate(() => MC.Ranking.finishRun(qaCampaignTicket, { activeMs: Math.round(MC.Save.data.playtime * 1000), ending: 'B', assisted: true }));
  assert.equal(duplicate.duplicate, true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM scores').get().n, 6);
  report.checks.push('Reenviar el final de campaña no duplica ni modifica el resultado original.');
  await a.evaluate(async () => { window.qaRetryTicket = (await MC.Ranking.beginRun({ difficulty: 'easy', kind: 'level', level: 2 })).ticket; });
  await a.waitForTimeout(5300);
  await contexts[0].setOffline(true);
  const queued = await a.evaluate(() => MC.Ranking.finishRun(qaRetryTicket, { activeMs: 5100 }));
  assert.equal(queued.status, 'queued');
  await contexts[0].setOffline(false);
  await a.waitForFunction(() => MC.Ranking.getStatus().pending === 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM scores').get().n, 7);
  const retryDuplicate = await a.evaluate(() => MC.Ranking.finishRun(qaRetryTicket, { activeMs: 5100 }));
  assert.equal(retryDuplicate.duplicate, true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM scores').get().n, 7);
  report.checks.push('Corte de red real del navegador, reenvío automático al reconectar y cero duplicados.');
  report.campaign = campaign;
  report.rows = rows;
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: report.checks, campaign, requests: apiCalls.length, errors }, null, 2));
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  db.sqlite.close();
}
