// Pure hold test: attack held with no stick input, technique at max, against a boss that cannot act.
// Reports how much boss HP the hold alone removes in 30 s of game time (argv[2] = technique rank, default 5).
const { chromium } = require('playwright');
const RANK = +(process.argv[2] || 5);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.evaluate((rank) => { try { localStorage.clear(); } catch (e) {} window.__game.startGame(2, rank, 0, { technique: rank }); }, RANK);
  await p.waitForTimeout(600);
  await p.evaluate(() => { const g = window.__game; g.G.introT = 0; g.G.waveIdx = 2; g.enemies.forEach(e => { e.hp = 0; e.dead = true; }); g.G.spawnLeft = 0; });
  await p.waitForFunction(() => { const bb = window.__game.boss(); return bb && bb.state !== 'hidden' && bb.state !== 'roar'; }, null, { timeout: 120000 });
  const r = await p.evaluate(() => new Promise(res => {
    const g = window.__game, h = g.hero(), bb = g.boss();
    g.G.substeps = 4; g.enemies.length = 0; h.iframe = 1e9; h.hp = h.maxHp = 1e6;
    bb.speed = 0; bb.hp = bb.maxHp = 1e9; bb.state = 'walk'; bb.cd = 1e9; bb.poise = 0;
    bb.x = 0; bb.z = 0; h.x = 0; h.z = -2.6; h.face = 0; h.act = null;
    g.input.clear(); g.input.held.clear(); g.input.keys.clear();
    const hp0 = bb.hp, t0 = g.G.time, stats = { cuts: 0, names: {} }; let last = null;
    g.input.press('attack');   // held from here on: no stick, so no direction links
    const tick = () => {
      h.x = 0; h.z = -2.6; bb.x = 0; bb.z = 0;
      const a = h.act; if (a && a !== last) { stats.cuts++; stats.names[a.name] = (stats.names[a.name] || 0) + 1; } last = a;
      if (g.G.time - t0 >= 30) { g.input.held.clear(); res({ rank: h.stats.technique, seconds: +(g.G.time - t0).toFixed(1), bossLost: +(hp0 - bb.hp).toFixed(0), bossPct: +((hp0 - bb.hp) / hp0 * 100).toFixed(2), cuts: stats.cuts, cutNames: Object.keys(stats.names).length }); return; }
      requestAnimationFrame(tick);
    }; tick();
  }));
  console.log(JSON.stringify(r), 'errors', errors.length ? errors : 'none');
  await b.close();
})();
