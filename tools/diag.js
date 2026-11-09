const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  p.on('pageerror', e => console.log('err', e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.click('#btn-start'); await p.evaluate(() => { window.__game.G.substeps = 3; });
  for (let i = 0; i < 8; i++) {
    await p.waitForTimeout(1500);
    const s = await p.evaluate(() => {
      const g = window.__game, h = g.hero();
      const d = g.enemies.filter(e => !e.dead).map(e => Math.hypot(e.x - h.x, e.z - h.z).toFixed(1) + e.state[0]);
      return `t=${g.G.time.toFixed(1)} hero=${h.x.toFixed(1)},${h.z.toFixed(1)} act=${h.act?.name} ko=${g.G.ko} n=${d.length} ${d.slice(0, 12).join(' ')}`;
    });
    console.log(s);
    if (i >= 3) { await p.keyboard.down('KeyJ'); await p.waitForTimeout(1200); await p.keyboard.up('KeyJ'); }
  }
  await b.close();
})();
