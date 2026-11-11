// Spawns a crowd around the hero, swings, and captures frames mid-impact; reports how far corpses flew.
const { chromium } = require('playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.evaluate(() => { const g = window.__game; g.startGame(0, 3, 0, { health: 3 }); g.hero().iframe = 1e9; });
  await p.waitForTimeout(3500);
  await p.evaluate(() => { const g = window.__game, h = g.hero(); g.G.waveIdx = 0; g.G.spawnLeft = 999;
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = 1.8 + (i % 2) * 0.9;
      g.enemies.push({ type: 'grunt', x: h.x + Math.cos(a) * r, z: h.z + Math.sin(a) * r, y: 0, vx: 0, vz: 0, vy: 0, face: 0, hp: 20, state: 'walk', t: 0, cd: 99, phase: 0, dead: false, lastHit: -1, pose: {}, spin: 0, slot: 0, x0: h.x + Math.cos(a) * r, z0: h.z + Math.sin(a) * r }); } });
  await p.keyboard.down('KeyK'); await p.waitForTimeout(700); await p.keyboard.up('KeyK');
  for (let i = 0; i < 4; i++) { await p.waitForTimeout(260); await p.evaluate(() => document.querySelector('#hud').hidden = true); await p.screenshot({ path: `${OUT}/fx_${i}.png` }); }
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const g = window.__game; const d = g.enemies.filter(e => e.x0 !== undefined); const air = d.filter(e => e.y > 0.3).length; const dd = d.map(e => ({ dead: e.dead, dist: Math.hypot(e.x - e.x0, e.z - e.z0) }));
    return { airborne: air, killed: d.filter(x => x.dead).length, total: d.length, avgFlight: (d.reduce((a, x) => a + x.dist, 0) / (d.length || 1)).toFixed(1), maxFlight: Math.max(0, ...d.map(x => x.dist)).toFixed(1) }; });
  console.log(JSON.stringify(r)); console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})();
