const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.evaluate(() => { const g = window.__game; g.startGame(0, 1, 0); g.G.substeps = 1; });
  await p.waitForTimeout(1500);
  await p.keyboard.down('KeyK'); await p.waitForTimeout(1500); await p.keyboard.up('KeyK');
  await p.waitForTimeout(100);
  const res = await p.evaluate(async () => {
    const g = window.__game, h = g.hero(), out = [];
    for (let i = 0; i < 6; i++) {
      const hp0 = h.hp, act = h.act && h.act.name; h.iframe = 0;
      g.enemies.push({ type: 'grunt', x: h.x + 0.8, z: h.z, y: 0, vx: 0, vz: 0, vy: 0, face: -Math.PI / 2, hp: 9999, state: 'strike', t: 0.07, struck: false, cd: 9, phase: 0, dead: false, lastHit: -1, pose: {}, spin: 0, slot: 0 });
      await new Promise(r => setTimeout(r, 120));
      out.push(`${act}:${hp0 - h.hp}`);
    }
    return out;
  });
  console.log('during spin (action:damage):', res.join(' '));
  const after = await p.evaluate(async () => { const g = window.__game, h = g.hero(); await new Promise(r => setTimeout(r, 3000)); const hp0 = h.hp; h.iframe = 0;
    g.enemies.push({ type: 'grunt', x: h.x + 0.8, z: h.z, y: 0, vx: 0, vz: 0, vy: 0, face: -Math.PI / 2, hp: 9999, state: 'strike', t: 0.07, struck: false, cd: 9, phase: 0, dead: false, lastHit: -1, pose: {}, spin: 0, slot: 0 });
    await new Promise(r => setTimeout(r, 200)); return `${h.act ? h.act.name : 'idle'}:${hp0 - h.hp}`; });
  console.log('after spin:', after);
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})();
