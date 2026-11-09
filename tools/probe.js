const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 400, height: 400 } });
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  const r = await p.evaluate((list) => list.map(([n, t]) => {
    const g = window.__game; g.debugPose(n, t);
    const h = g.hero(); h.rig.root.updateMatrixWorld(true);
    const V = h.base.constructor;
    const a = new V(0, 0.5, 0), c = new V(0, 2.1, 0); h.sword.localToWorld(a); h.sword.localToWorld(c);
    const f = v => v.toArray().map(x => x.toFixed(2)).join(',');
    return `${n}@${t}: base ${f(a)} tip ${f(c)}`;
  }), JSON.parse(process.argv[2]));
  console.log(r.join('\n')); await b.close();
})();
