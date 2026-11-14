// Frames of the sword exchange after a parry, saved to argv[2]. argv[3] = stage (0-based), argv[4] = kind of
// exchange (cross | rapid | low | lock; default cross). 8 frames spread over the length of that exchange,
// plus the first moment of the lock/press where there is one.
const { chromium } = require('playwright');
const OUT = process.argv[2], ST = +(process.argv[3] || 0), KIND = process.argv[4] || 'cross';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.evaluate((s) => { window.__game.startGame(s, 6, 0, { technique: 5, health: 2 }); }, ST);
  await p.waitForTimeout(500);
  await p.evaluate(() => { const g = window.__game; g.G.substeps = 4; g.G.introT = 0; g.G.waveIdx = 2; g.enemies.forEach(e => { e.hp = 0; e.dead = true; e.t = 5; }); g.G.spawnLeft = 0; });
  await p.waitForFunction(() => { const bb = window.__game.boss(); return bb && bb.state !== 'hidden' && bb.state !== 'roar'; }, null, { timeout: 60000 });
  // parry a cleave, then freeze the clock at points through the exchange
  await p.evaluate((KIND) => new Promise(res => {
    const g = window.__game, bb = g.boss(), h = g.hero();
    g.G.substeps = 1; g.G.spawnLeft = 0; g.enemies.forEach(e => { e.hp = 0; e.dead = true; e.t = 5; });
    bb.x = 0; bb.z = 0; bb.face = 0; h.x = 0; h.z = 3.6 * bb.scale / 2.3; h.face = Math.PI; h.act = null; h.iframe = 0; h.hp = h.maxHp = 1e5;
    g.G.clashForce = KIND;
    g.setBoss('cleaveWind');
    const tick = () => { if (bb.strikeIn != null && bb.strikeIn <= 0.2) { g.input.press('attack'); g.input.held.delete('attack'); res(); } else requestAnimationFrame(tick); };
    tick();
  }), KIND);
  await p.waitForFunction(() => window.__game.hero().act?.name === 'CLASH', null, { timeout: 20000 });
  const end = await p.evaluate(() => window.__game.CLASH_TYPES[window.__game.boss().clashType].end);
  const stops = Array.from({ length: 8 }, (_, i) => +(end * (0.08 + 0.84 * i / 7)).toFixed(2));
  for (let i = 0; i < stops.length; i++) {
    await p.waitForFunction((t) => { const h = window.__game.hero(); return !h.act || h.act.name !== 'CLASH' || h.act.t >= t; }, stops[i], { timeout: 20000, polling: 'raf' });
    await p.evaluate(() => { window.__game.G.state = 'pause'; });
    await p.screenshot({ path: `${OUT}/clash_${KIND}_${i}.png` });
    await p.evaluate(() => { window.__game.G.state = 'play'; });
  }
  console.log(KIND, JSON.stringify({ end, stops }), await p.evaluate(() => ({ clashHits: window.__game.G.clashHits, type: window.__game.boss().clashType, boss: window.__game.boss().state })));
  await b.close();
})();
