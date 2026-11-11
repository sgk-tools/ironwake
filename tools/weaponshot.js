// Close-ups of every weapon at corruption tiers 0, 2 and 4 (argv[2] = output folder).
const { chromium } = require('playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 720, height: 720 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  const ids = await p.evaluate(() => Object.keys(window.__game.hero().weapons));
  const info = [];
  for (const id of ids) for (const tier of [0, 2, 4]) {
    const r = await p.evaluate(({ id, tier }) => {
      const g = window.__game, h = g.hero();
      for (const [k, w] of Object.entries(h.weapons)) w.mesh.visible = k === id;
      const w = h.weapons[id]; g.applyGrowth(w, tier);
      g.debugPose('RISECUT', 0.33, 0.9, 4.6);
      g.debugPose('RISECUT', 0.33, 0.9, 4.6);
      return { id, tier, scale: w.mesh.scale.toArray().map(x => +x.toFixed(2)), deco: w.corruption.children.length };
    }, { id, tier });
    info.push(r);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/w_${id}_${tier}.png` });
  }
  console.log(JSON.stringify(info));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})();
