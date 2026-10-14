import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const output = path.resolve('test-results/mechanics-v6');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { checks: [], errors: [], screenshots: [], blockedApiRequests: 0, physicalControllerTested: false };
const check = (name) => report.checks.push(name);
const frames = async (page, n = 4) => page.evaluate(n => new Promise(resolve => {
  const step = () => { if (--n <= 0) resolve(); else requestAnimationFrame(step); }; requestAnimationFrame(step);
}), n);
async function open(width, height, touch = false) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/\/api(?:\/|$)/.test(url.pathname)) { report.blockedApiRequests++; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"mechanics_review_offline"}' }); }
    return url.origin === new URL(base).origin ? route.continue() : route.abort();
  });
  await context.addInitScript(() => {
    localStorage.setItem('mapache_cinema_opts_v1', JSON.stringify({ music: 0, sfx: 0, visualMode: 'clear', nick: 'QA_LOCAL' }));
    window.__qaPads = [{ index: 0, id: 'DualShock 4 simulated QA', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, () => ({pressed:false,value:0})) }];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__qaPads });
  });
  const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.MC?.game && document.querySelector('#boot-hint').classList.contains('hide'));
  await page.evaluate(() => document.fonts.ready);
  return {page, context};
}
async function start(page, level = 0) {
  await page.evaluate(async level => {
    MC.menu.hooks.onPlayLevel('normal', level, 'QA_LOCAL');
    await MC.game._levelTicketPromise;
    const g = MC.game;
    g.state = 'playing'; g.introT = 0; g.fadeAlpha = 0; g.dialogue.active = false; g.dialogue.isChoice = false;
    g.triggers = []; g.weather = 'clear'; g.enemies = []; g.projectiles = [];
    const ground = level === 4 ? 288 : g.levelDef.def.groundY * 16;
    Object.assign(g.player, {x: 170, y: ground - g.player.h, vx:0, vy:0, hp:3, invuln:0, hurtFlash:0, onGround:true});
    g.camera.snapTo(g.player);
    MC.Input.reset(); MC.Input.clearFrame();
  }, level);
  await frames(page, 5);
}
async function shot(page, name) {
  await page.screenshot({path:path.join(output, name+'.png')}); report.screenshots.push(name+'.png');
}
async function padTap(page, index) {
  await page.evaluate(index => { window.__qaPads[0].buttons[index] = {pressed:true,value:1}; }, index);
  await frames(page, 4);
  await page.evaluate(index => { window.__qaPads[0].buttons[index] = {pressed:false,value:0}; }, index);
  await frames(page, 2);
}
async function bossShot(page, name) {
  await start(page, 4);
  const initialCameraY = await page.evaluate(() => {
    const g = MC.game; g.startBoss(); g.boss.hp = g.boss.maxHp * .6;
    g.boss.t = 0; g.boss.stateT = 100; g.player.invuln = 60; g.boss.vulnerable = false;
    document.querySelector('#toast-layer').replaceChildren();
    return g.camera.y;
  });
  await frames(page, 4);
  const enteringCameraY = await page.evaluate(() => MC.game.camera.y);
  assert.ok(enteringCameraY < initialCameraY && enteringCameraY > 48, 'camera eases into the boss arena');
  await frames(page, 90);
  const metrics = await page.evaluate(() => {
    const g=MC.game,ctx=g.ctx,old=ctx.fillText,drawn=[];
    ctx.fillText=function(text,x,y,...rest){ if(String(text).includes('FAROLERO')) drawn.push({text,x,y,width:this.measureText(text).width});return old.call(this,text,x,y,...rest);};
    g._renderBossBar(ctx);ctx.fillText=old;
    const r=document.querySelector('#gs').getBoundingClientRect();
    const controls=[...document.querySelectorAll('.tc-actions > .tc-btn, .tc-joystick')].filter(e=>e.getClientRects().length).map(e=>{const q=e.getBoundingClientRect();return {x:q.x,y:q.y,w:q.width,h:q.height};});
    return {label:drawn[0],canvas:{x:r.x,y:r.y,w:r.width,h:r.height},controls,
      cameraY:g.camera.y,bossTop:g.boss.y-g.camera.y,bossBottom:g.boss.y+g.boss.h-g.camera.y,
      arenaFloor:g.bossArena.y+g.bossArena.h-g.camera.y};
  });
  report[name]=metrics;
  assert.ok(metrics.label && metrics.label.y > 220, 'boss label stays at the bottom');
  assert.ok(metrics.label.width <= 180, 'boss label fits between mobile control groups');
  assert.ok(Math.abs(metrics.cameraY-48)<.1, 'camera settles on the complete arena');
  assert.ok(metrics.bossTop>18 && metrics.bossBottom<220, 'airborne boss and projectile origin stay visible');
  assert.ok(metrics.arenaFloor<metrics.label.y-5, 'the arena floor and Riko stay above the boss HUD');
  check(name+': boss bar and readable label below projectile area');
  check(name+': smooth camera reveals boss, projectile origin and arena floor together');
  report[name]=metrics;
  await shot(page,name);
}
try {
  if (process.env.MECHANICS_REVIEW_BOSS_ONLY === '1') {
    for (const [width,height,touch,name] of [[1920,1080,false,'boss-desktop-1920'],[844,390,true,'boss-mobile-844']]) {
      const {page,context}=await open(width,height,touch);
      await bossShot(page,name);
      await context.close();
    }
  } else {
  {
    const {page,context}=await open(1920,1080);
    await start(page);
    await page.evaluate(()=>{MC.game.inventory.add('memory',4);MC.game.inventory.selected='memory';MC.game.player.hp=1;});
    await page.keyboard.press('KeyE');await frames(page);
    assert.deepEqual(await page.evaluate(()=>({hp:MC.game.player.hp,memory:MC.game.inventory.count('memory')})),{hp:2,memory:1});
    check('keyboard E uses exactly 3 memories for exactly 1 heart');
    await page.keyboard.press('KeyE');await frames(page);
    assert.deepEqual(await page.evaluate(()=>({hp:MC.game.player.hp,memory:MC.game.inventory.count('memory')})),{hp:2,memory:1});
    check('insufficient memories do not heal or consume the last memory');
    await page.evaluate(()=>{MC.game.inventory.add('memory',5);MC.game.player.hp=MC.game.player.maxHp;});
    await page.keyboard.press('KeyE');await frames(page);
    assert.equal(await page.evaluate(()=>MC.game.inventory.count('memory')),6);
    check('full health does not consume memories');
    for(const id of ['sleep','flip','wave','dance']) {
      await page.keyboard.press('KeyG');await frames(page,3);
      assert.equal(await page.evaluate(()=>MC.game.player.emote?.id),id);
      assert.deepEqual(await page.evaluate(()=>({w:MC.game.player.w,h:MC.game.player.h,hp:MC.game.player.hp,invuln:MC.game.player.invuln})),{w:10,h:14,hp:3,invuln:0});
      await shot(page,'keyboard-emote-'+id);
    }
    check('keyboard G cycles all four visible emotes without changing collision, health or vulnerability');
    await page.keyboard.down('KeyD');await frames(page,2);await page.keyboard.up('KeyD');
    assert.equal(await page.evaluate(()=>MC.game.player.emote),null);
    check('walking cancels an emote immediately');
    await bossShot(page,'boss-desktop-1920');
    await context.close();
  }
  {
    const {page,context}=await open(1920,1080);
    await page.locator('#menu-nav [data-act="credits"]').click();
    await page.locator('#developer-controls summary').click();
    await page.locator('#developer-code').fill('Mapache-cinema');
    await page.locator('.developer-unlock button').click();
    await page.waitForFunction(()=>MC.Controls.getMode()==='gamepad'&&MC.gamepad.getStatus().ready);
    await start(page);
    await frames(page,8);
    await padTap(page,10);
    assert.equal(await page.evaluate(()=>MC.game.player.emote?.id),'sleep');
    check('simulated DualShock L3 starts the emote through the unlocked controller mapping');
    await shot(page,'controller-l3-emote');
    await context.close();
  }
  {
    const {page,context}=await open(844,390,true);
    await start(page);
    await page.evaluate(()=>{MC.game.inventory.add('memory',3);MC.game.inventory.selected='memory';MC.game.player.hp=1;});
    await page.locator('.tc-a-interact').tap();await frames(page);
    assert.deepEqual(await page.evaluate(()=>({hp:MC.game.player.hp,memory:MC.game.inventory.count('memory')})),{hp:2,memory:0});
    check('mobile USAR heals through the same memory inventory');
    await page.locator('.tc-a-more').tap();
    assert.equal(await page.locator('.tc-s-emote').isVisible(),true);
    await page.locator('.tc-s-emote').tap();await frames(page,3);
    assert.equal(await page.evaluate(()=>MC.game.player.emote?.id),'sleep');
    const controls=await page.locator('#touch-secondary').evaluate(e=>[...e.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {name:b.textContent,inViewport:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};}));
    assert.ok(controls.every(c=>c.inViewport));report.mobileSecondary=controls;
    check('mobile MÁS reveals GESTO and all five secondary actions remain on screen');
    await shot(page,'mobile-gesture-844');
    await page.locator('.tc-a-more').tap();
    await bossShot(page,'boss-mobile-844');
    await context.close();
  }
  }
  assert.deepEqual(report.errors,[],'no browser runtime errors');
  console.log(JSON.stringify({checks:report.checks.length,errors:report.errors,blockedApiRequests:report.blockedApiRequests},null,2));
} finally {
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  await browser.close();
}
