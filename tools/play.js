// Automated play test: boots the game, starts a run, drives input, screenshots, reports errors.
const { chromium, devices } = require('playwright');
const OUT = process.argv[2] || '.';
const MODE = process.argv[3] || 'desktop';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = MODE === 'iphone'
    ? await b.newContext({ ...devices['iPhone 15 Pro landscape'] })
    : await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${MODE}_title.png` });
  if (MODE === 'iphone') await p.tap('#btn-start'); else await p.click('#btn-start');
  await p.evaluate(() => { window.__game.G.substeps = 3; });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${MODE}_wave.png` });
  const kb = p.keyboard;
  const step = async (ms) => { await p.waitForTimeout(ms); };
  // fight: move toward enemies and attack
  await p.evaluate(() => { window.__game.hero().rage = 100; });
  for (let i = 0; i < 6; i++) {
    await kb.down('KeyW'); await step(500); await kb.up('KeyW');
    await kb.down('KeyJ'); await step(1400); await kb.up('KeyJ');
  }
  await p.screenshot({ path: `${OUT}/${MODE}_fight.png` });
  await kb.press('KeyK'); await step(250);
  await p.screenshot({ path: `${OUT}/${MODE}_spin.png` });
  await kb.press('KeyU'); await step(600);
  await p.screenshot({ path: `${OUT}/${MODE}_rage.png` });
  const st = await p.evaluate(() => {
    const g = window.__game; const h = g.hero();
    return { state: g.G.state, wave: g.G.waveIdx, ko: g.G.ko, hp: Math.round(h.hp), enemies: g.enemies.length, maxCombo: g.G.maxCombo, ratio: g.QUALITY.ratio, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
  });
  console.log(JSON.stringify(st));
  // jump to boss to check it
  await p.evaluate(() => {
    const g = window.__game; g.enemies.forEach(e => { e.hp = 0; e.dead = true; e.t = 5; });
    g.G.waveIdx = 2; g.G.spawnLeft = 0;
  });
  await step(4500);
  await p.screenshot({ path: `${OUT}/${MODE}_boss.png` });
  for (let i = 0; i < 4; i++) { await kb.down('KeyJ'); await step(900); await kb.up('KeyJ'); }
  await p.screenshot({ path: `${OUT}/${MODE}_boss2.png` });
  const st2 = await p.evaluate(() => { const g = window.__game; return { wave: g.G.waveIdx, bossHp: Math.round(g.boss().hp), bossState: g.boss().state, hp: Math.round(g.hero().hp) }; });
  console.log(JSON.stringify(st2));
  // finish boss for result screen
  await p.evaluate(() => { const g = window.__game, b = g.boss(), h = g.hero(); b.hp = 1; h.hp = 1000; h.iframe = 99; h.x = b.x; h.z = b.z - 2.6; h.face = 0; });
  for (let i = 0; i < 6 && !(await p.$('#result:not([hidden])')); i++) { await kb.down('KeyJ'); await step(1000); await kb.up('KeyJ'); }
  await step(4000);
  await p.screenshot({ path: `${OUT}/${MODE}_result.png` });
  console.log('result visible:', !!(await p.$('#result:not([hidden])')));
  console.log('errors:', errors.length ? errors.slice(0, 15).join('\n') : 'none');
  await b.close();
})();
