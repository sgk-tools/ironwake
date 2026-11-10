// Screenshots each stage at the same moment and prints mean luminance (0-255) of the 3D view.
const { chromium } = require('playwright');
const OUT = process.argv[2], TAG = process.argv[3];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  for (let st = 0; st < 3; st++) {
    await p.evaluate((st) => { const g = window.__game; g.startGame(st, 1, 0); g.G.substeps = 3; g.hero().iframe = 1e9; }, st);
    await p.waitForTimeout(9000);
    await p.evaluate(() => { document.querySelector('#hud').hidden = true; });
    const f = `${OUT}/bright_${TAG}_${st}.png`;
    await p.screenshot({ path: f });
  }
  await b.close();
})();
