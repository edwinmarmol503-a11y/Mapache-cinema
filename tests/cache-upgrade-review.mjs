import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Real Chromium Service Workers, including an installed stale v3 cache. Every
// ranking request is blocked, and this creates its own HTTP server/profile.
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const root = path.resolve('.');
const output = path.join(root, 'test-results/cache-upgrade');
const scopePath = '/Mapache-cinema/';
const version = '6.0.2';
const styles = ['style', 'menu', 'game', 'ui', 'touch', 'controller-settings', 'death', 'typography', 'endings'];
const legacyCache = 'mapache-cinema-v3.1.0-stale-review';
const staleMarker = 'QA_STALE_MENU_WITH_REMOVED_SCALE';
const optionsKey = 'mapache_cinema_opts_v1';
const saveKey = 'mapache_cinema_save_v1';
const seedOptions = { music: 0, sfx: 0, visualMode: 'clear', nick: 'CACHE-QA', bindingVersion: 4,
  bindings: { jump: ['KeyW', 'ArrowUp'], attack: ['KeyF'] }, padBindingVersion: 1,
  padBindings: { left: 14, right: 15, up: 12, down: 13, jump: 2, attack: 0, dodge: 1,
    parry: 4, interact: 3, throw: 5, cycleL: 6, cycleR: 7, pause: 9 } };
const seedSave = { level: 2, checkpoint: { x: 320, y: 160 }, items: { magnet: true }, collected: ['qa-preserved'],
  levelProgress: { d_s1: true }, hp: 2, maxHp: 3, memories: 5, flags: { qa_preserved: true },
  ending: null, completed: false, playtime: 730, created: 123456789, difficulty: 'hard', nick: 'CACHE-QA', levelElapsedMs: 4321 };
const report = { version, checks: [], scenarios: [], apiRequestsBlocked: [], errors: [], requests: [] };
const swSource = await readFile(path.join(root, 'sw.js'), 'utf8');
const htmlSource = await readFile(path.join(root, 'index.html'), 'utf8');
const assetsBlock = swSource.match(/const ASSETS\s*=\s*\[([\s\S]*?)\];/);
assert.ok(assetsBlock, 'fixture can find the actual precached assets');
const assets = [...assetsBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
assert.ok(htmlSource.includes(`js/bootstrap.js?v=${version}`), 'new HTML bypasses an old cached bootstrap');
for (const css of styles) {
  assert.ok(htmlSource.includes(`css/${css}.css?v=${version}`), `${css} stylesheet is versioned`);
}
assert.match(swSource, /GET_BUILD_VERSION/, 'new worker can identify its build');

await mkdir(output, { recursive: true });
let servingLegacy = false;
let updateNonce = 0;
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.mp3': 'audio/mpeg' };

function legacyWorker() {
  return `const NAME = ${JSON.stringify(legacyCache)};
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(NAME);
  await cache.addAll(ASSETS);
  await cache.put('./js/menu.js', new Response(${JSON.stringify(`// ${staleMarker}\nconst scale = document.getElementById('opt-scale');\nscale.addEventListener('change', () => {});\nexport class Menu {}\n`)}, {headers:{'Content-Type':'text/javascript'}}));
  await self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); return; }
  e.respondWith((async () => {
    const hit = await caches.match(e.request);
    if (hit) {
      const client = await self.clients.get(e.clientId);
      if (client) client.postMessage({type:'QA_LEGACY_CACHE_HIT', pathname:new URL(e.request.url).pathname});
      return hit;
    }
    return fetch(e.request);
  })());
});`;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://fixture.invalid');
  report.requests.push({ path: url.pathname, query: url.search, method: request.method, legacy: servingLegacy });
  if (url.pathname.includes('/api/')) {
    report.apiRequestsBlocked.push({ method: request.method, path: url.pathname });
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end('{"error":"cache_upgrade_review_offline"}');
    return;
  }
  if (!url.pathname.startsWith(scopePath)) { response.writeHead(404); response.end(); return; }
  const relative = decodeURIComponent(url.pathname.slice(scopePath.length)) || 'index.html';
  response.setHeader('Cache-Control', 'no-store');
  if (relative === 'setup.html') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>Cache upgrade fixture</title><p>Isolated legacy setup</p>');
    return;
  }
  if (relative === 'sw.js') {
    response.writeHead(200, { 'Content-Type': contentTypes['.js'] });
    response.end(servingLegacy ? legacyWorker() : swSource + `\n// QA worker update ${updateNonce}\n`);
    return;
  }
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  try {
    const bytes = await readFile(target);
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(target)] || 'application/octet-stream' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}${scopePath}`;
const origin = new URL(baseURL).origin;
const browser = await chromium.launch({ headless: true });

async function makeContext(name, { unsupported = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'allow' });
  // This override routes the game's client to the local API rejection too.
  await context.addInitScript(({ baseURL, optionsKey, saveKey, seedOptions, seedSave, unsupported }) => {
    window.MC_CONFIG = { rankingApiBase: baseURL };
    if (!localStorage.getItem('qa_seeded')) {
      localStorage.setItem(optionsKey, JSON.stringify(seedOptions));
      localStorage.setItem(saveKey, JSON.stringify(seedSave));
      localStorage.setItem('qa_seeded', '1');
    }
    window.__qaBootCount = Number(sessionStorage.getItem('qa_boot_count') || 0) + 1;
    sessionStorage.setItem('qa_boot_count', String(window.__qaBootCount));
    window.__qaLegacyCacheHits = [];
    if (unsupported) delete Object.getPrototypeOf(navigator).serviceWorker;
    else navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'QA_LEGACY_CACHE_HIT') window.__qaLegacyCacheHits.push(event.data.pathname);
    });
  }, { baseURL, optionsKey, saveKey, seedOptions, seedSave, unsupported });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/api/')) {
      report.apiRequestsBlocked.push({ method: route.request().method(), path: url.pathname });
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"cache_upgrade_review_offline"}' });
    } else if (url.origin === origin) await route.continue();
    else await route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ name, error: error.message }));
  const scenario = { name, navigations: 0 };
  report.scenarios.push(scenario);
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) scenario.navigations++; });
  return { context, page, scenario };
}

async function waitBoot(page) {
  await page.waitForFunction(() => !!window.MC && document.getElementById('boot-hint').classList.contains('hide'), null, { timeout: 25000 });
  await page.waitForFunction(() => MC.Audio.getMusicStatus().configuredTracks === 43);
}
async function workerVersion(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error('worker did not identify its build')), 3000);
    channel.port1.onmessage = event => { clearTimeout(timer); resolve(event.data?.version); };
    navigator.serviceWorker.controller.postMessage({ type: 'GET_BUILD_VERSION' }, [channel.port2]);
  }));
}
async function assertPersisted(page, label) {
  const values = await page.evaluate(async ({ optionsKey, saveKey }) => {
    const { PadBindings } = await import('./js/controller-bindings.js');
    return { options: JSON.parse(localStorage.getItem(optionsKey)), save: JSON.parse(localStorage.getItem(saveKey)),
      customAttack: MC.Input.bindings.attack, customPad: PadBindings.getBindings() };
  }, { optionsKey, saveKey });
  // v6 adds an emote mapping. Existing user values must remain
  // intact while newly introduced keys may be saved alongside them.
  const storedOriginalValues = Object.fromEntries(Object.keys(seedOptions).map(key => [key, values.options[key]]));
  storedOriginalValues.padBindings = Object.fromEntries(Object.keys(seedOptions.padBindings).map(key => [key, values.options.padBindings[key]]));
  assert.deepEqual(storedOriginalValues, seedOptions, `${label}: stored user options survive`);
  assert.deepEqual(values.save, { ...seedSave, items: { ...seedSave.items, memory: seedSave.memories }, memoryInventoryVersion: 1 }, `${label}: checkpoint and old memories survive the inventory migration`);
  assert.deepEqual(values.customAttack, ['KeyF'], `${label}: custom bindings are respected`);
  assert.deepEqual(values.customPad, { ...seedOptions.padBindings, emote: 10 }, `${label}: custom controller buttons survive with the new emote action`);
}
function check(message) { report.checks.push(message); console.log(message); }

try {
  const fresh = await makeContext('fresh installation');
  await fresh.page.goto(baseURL);
  await waitBoot(fresh.page);
  assert.equal(await workerVersion(fresh.page), version);
  await assertPersisted(fresh.page, 'fresh installation');
  assert.equal(fresh.scenario.navigations, 1, 'first installation claims without reloading the page');
  check('Fresh browser installs, activates and claims v6.0.2 before starting the game, without reload.');
  await fresh.context.close();

  servingLegacy = true;
  const upgrade = await makeContext('legacy stale cache upgrade');
  await upgrade.page.goto(baseURL + 'setup.html');
  await upgrade.page.evaluate(async () => {
    await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Legacy worker did not install')), 20000))]);
    if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Legacy worker did not claim setup')), 15000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  });
  assert.ok(await upgrade.page.evaluate(async ({ legacyCache, staleMarker }) =>
    (await (await caches.open(legacyCache)).match('./js/menu.js')).text().then(source => source.includes(staleMarker)),
  { legacyCache, staleMarker }), 'fixture really has the old module that crashes against the new HTML');
  await upgrade.page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === 'activated' && !registration.installing && !registration.waiting;
  });
  servingLegacy = false;
  await upgrade.page.goto(baseURL);
  await waitBoot(upgrade.page);
  assert.equal(await workerVersion(upgrade.page), version);
  await assertPersisted(upgrade.page, 'legacy upgrade');
  // A worker can answer the version message while activation is finishing.
  await upgrade.page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === 'activated' && !registration.installing && !registration.waiting;
  });
  await upgrade.page.waitForFunction(async key => !(await caches.keys()).includes(key), legacyCache);
  const upgraded = await upgrade.page.evaluate(async () => ({
    keys: await caches.keys(), legacyHits: window.__qaLegacyCacheHits,
    source: await (await fetch('./js/menu.js')).text(),
  }));
  assert.equal(upgraded.keys.includes(legacyCache), false, 'only obsolete game cache is removed');
  assert.equal(upgraded.source.includes(staleMarker), false, 'new menu module is served');
  assert.deepEqual(upgraded.legacyHits.filter(hit => hit.endsWith('.js')), [], 'no stale unversioned game module is requested before the new worker claims');
  assert.equal(upgrade.scenario.navigations, 2, 'upgrade uses the existing document without an automatic extra navigation');
  check('An installed v3.1 cache containing a broken old menu cannot mix with new HTML; new worker claims before modules load.');
  check('Cache migration keeps nickname, custom keys and controller buttons, checkpoint, inventory, difficulty, elapsed time and saved progress.');

  // A changed worker script with the same release version emulates a background
  // reinstallation. It may claim, but must never destroy the current session.
  await upgrade.page.evaluate(() => {
    MC.menu.hooks.onPlayLevel('easy', 0, 'CACHE-QA');
    MC.game.startDialogue([{ speaker: 'QA', text: 'La partida debe continuar después de actualizar la caché.' }]);
    window.__qaLivePlayer = MC.game.player;
    window.__qaSessionToken = 'preserve-live-game';
  });
  await upgrade.page.waitForFunction(() => !MC.game._rankingStarting);
  const beforeUpdate = await upgrade.page.evaluate(() => ({ boot: window.__qaBootCount, state: MC.getState() }));
  assert.equal(beforeUpdate.state, 'game');
  // controllerchange can be delivered while the activation event is finishing.
  // Start the separate update only after that previous install job is settled.
  await upgrade.page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === 'activated' && !registration.installing && !registration.waiting;
  });
  updateNonce++;
  await upgrade.page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const changed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Background worker did not claim session')), 20000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    await registration.update();
    await changed;
  });
  const afterUpdate = await upgrade.page.evaluate(() => ({ boot: window.__qaBootCount, state: MC.getState(),
    samePlayer: window.__qaLivePlayer === MC.game.player, session: window.__qaSessionToken }));
  assert.deepEqual(afterUpdate, { ...beforeUpdate, samePlayer: true, session: 'preserve-live-game' });
  assert.equal(upgrade.scenario.navigations, 2, 'worker controller change never reloads active gameplay');
  check('A background worker update claims during gameplay without reload, lost session or player replacement.');

  await upgrade.context.setOffline(true);
  await upgrade.page.reload();
  await waitBoot(upgrade.page);
  assert.equal(await workerVersion(upgrade.page), version);
  const offlinePad = await upgrade.page.evaluate(async () => (await import('./js/controller-bindings.js')).PadBindings.getBindings());
  assert.deepEqual(offlinePad, { ...seedOptions.padBindings, emote: 10 }, 'custom controller mappings and emote also load offline');
  for (const asset of ['js/bootstrap.js', ...styles.map(style => `css/${style}.css`)]) {
    const served = await upgrade.page.evaluate(async ({ asset, version }) => {
      const response = await fetch('./' + asset + '?v=' + version);
      return { status: response.status, source: await response.text() };
    }, { asset, version });
    assert.equal(served.status, 200, `${asset} versioned request loads offline`);
    assert.equal(served.source, await readFile(path.join(root, asset), 'utf8'), `${asset} versioned request maps to its current canonical cache`);
  }
  await upgrade.page.screenshot({ path: path.join(output, 'offline-upgraded-menu.png'), fullPage: true });
  for (const module of ['controller-bindings', 'controller-settings']) {
    const served = await upgrade.page.evaluate(async module => {
      const response = await fetch(`./js/${module}.js`);
      return { status: response.status, source: await response.text() };
    }, module);
    assert.equal(served.status, 200, `${module} module loads offline`);
    assert.equal(served.source, await readFile(path.join(root, 'js', module + '.js'), 'utf8'), `${module} loads from the installed build`);
  }
  check('Installed v6.0.2 starts offline, including versioned bootstrap, fonts, styles and controller modules under the repository subdirectory.');
  await upgrade.context.close();

  const unsupported = await makeContext('Service Worker unsupported fallback', { unsupported: true });
  await unsupported.page.goto(baseURL);
  await waitBoot(unsupported.page);
  assert.equal(await unsupported.page.evaluate(() => 'serviceWorker' in navigator), false);
  await assertPersisted(unsupported.page, 'unsupported worker');
  assert.equal(unsupported.scenario.navigations, 1);
  check('Browsers without Service Workers start directly and preserve stored data.');
  await unsupported.context.close();
  assert.deepEqual(report.errors, [], 'all real-browser cache scenarios have zero uncaught errors');
  report.ok = true;
  console.log(JSON.stringify({ ok: true, checks: report.checks, blockedApiRequests: report.apiRequestsBlocked.length, errors: report.errors.length }, null, 2));
} catch (error) {
  report.ok = false;
  report.failure = error.stack;
  report.workerStates = [];
  for (const context of browser.contexts()) for (const page of context.pages()) {
    try {
      report.workerStates.push(await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return { url: location.href, controller: navigator.serviceWorker.controller?.state,
          active: registration?.active?.state, installing: registration?.installing?.state, waiting: registration?.waiting?.state,
          caches: await caches.keys() };
      }));
    } catch {}
  }
  throw error;
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
