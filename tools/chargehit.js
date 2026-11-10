const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.evaluate(() => { const g = window.__game; g.startGame(0, 1, 0); g.G.substeps = 3; });
  await p.waitForTimeout(1500);
  await p.keyboard.down('KeyK'); await p.waitForTimeout(500);
  // simulate an enemy strike in the middle of the charge (call hurt via a real enemy hit path)
  const r1 = await p.evaluate(() => { const g = window.__game, h = g.hero(); const hp0 = h.hp; h.iframe = 0;
    // place a grunt on the hero and force its strike to land
    g.enemies.push({ type: 'grunt', x: h.x + 0.8, z: h.z, y: 0, vx: 0, vz: 0, vy: 0, face: -Math.PI / 2, hp: 40, state: 'strike', t: 0.07, struck: false, cd: 9, phase: 0, dead: false, lastHit: -1, pose: {}, spin: 0, slot: 0 });
    return { hp0, act: h.act && h.act.name }; });
  await p.waitForTimeout(400);
  const r2 = await p.evaluate(() => { const h = window.__game.hero(); return { hp: h.hp, act: h.act && h.act.name, charge: +h.charge.toFixed(2) }; });
  await p.waitForTimeout(800); await p.keyboard.up('KeyK'); await p.waitForTimeout(150);
  const r3 = await p.evaluate(() => { const h = window.__game.hero(); return { act: h.act && h.act.name, target: h.spinTarget }; });
  console.log(JSON.stringify({ before: r1, afterHit: r2, afterRelease: r3 }));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})();
