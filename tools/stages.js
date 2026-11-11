// Plays through every stage with test hooks: levels, stage environments, bosses, next-stage flow.
const { chromium } = require('playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await p.click('#btn-start');
  await p.evaluate(() => { window.__game.G.substeps = 3; window.__game.hero().iframe = 1e9; });
  const w = ms => p.waitForTimeout(ms);
  const log = [];
  const NST = await p.evaluate(() => window.__game.STAGES.length);
  for (let st = 0; st < NST; st++) {
    await w(2500);
    // fight a little on wave 1 so real kills grant EXP
    for (let i = 0; i < 5; i++) { await p.keyboard.down('KeyJ'); await w(900); await p.keyboard.up('KeyJ'); }
    await p.screenshot({ path: `${OUT}/st${st}_fight.png` });
    const s1 = await p.evaluate(() => { const g = window.__game, h = g.hero(); return { stage: g.G.stageIdx, wave: g.G.waveIdx, lv: h.level, exp: h.exp, ko: g.G.ko, types: [...new Set(g.enemies.map(e => e.type))] }; });
    // skip to the boss wave
    await p.evaluate(() => { const g = window.__game; g.enemies.forEach(e => { e.hp = 0; e.dead = true; e.t = 5; }); g.G.waveIdx = 2; g.G.spawnLeft = 0; g.hero().iframe = 1e9; });
    await w(4000);
    await p.screenshot({ path: `${OUT}/st${st}_boss.png` });
    const s2 = await p.evaluate(() => { const g = window.__game, bb = g.boss(); return { bossName: document.querySelector('#boss .name').textContent, hp: bb.maxHp, speed: bb.speed, fog: '#' + (g.renderer && 0, 0) }; });
    // finish the boss next to the hero
    await p.evaluate(() => { const g = window.__game, bb = g.boss(), h = g.hero(); bb.hp = 1; h.x = bb.x; h.z = bb.z - 2.6; h.face = 0; });
    for (let i = 0; i < 8 && !(await p.$('#result:not([hidden])')); i++) { await p.keyboard.down('KeyJ'); await w(900); await p.keyboard.up('KeyJ'); await p.evaluate(() => { const g = window.__game, bb = g.boss(), h = g.hero(); if (!bb.dead) { h.x = bb.x; h.z = bb.z - 2.6; h.face = 0; } }); }
    await p.waitForSelector('#result:not([hidden])', { timeout: 60000 });
    await p.screenshot({ path: `${OUT}/st${st}_result.png` });
    const s3 = await p.evaluate(() => ({ title: document.querySelector('#result-title').textContent, next: !document.querySelector('#btn-next').hidden, lv: document.querySelector('#r-lv').textContent, save: localStorage.getItem('ironwake-save-v1') }));
    log.push({ s1, s2, s3 });
    if (s3.next) { await p.click('#btn-next'); await p.evaluate(() => { window.__game.hero().iframe = 1e9; }); }
  }
  // level perks: force levels and check combo chain lengths
  const lv = await p.evaluate(() => { const g = window.__game; const h = g.hero(); const r = []; h.level = 1; h.exp = 0; for (let i = 0; i < 9; i++) { g.gainExp(200); r.push(h.level); } return r; });
  console.log(JSON.stringify(log, null, 1));
  console.log('levels after exp:', lv.join(','));
  console.log('errors:', errors.length ? [...new Set(errors)].slice(0, 8).join('\n') : 'none');
  await b.close();
})();
