// In-game camera shots of the hero on stages 1-3 (idle, attacking, charged spin) for armour readability.
const { chromium } = require('playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  for (const st of [0, 1, 2]) {
    await p.evaluate((st) => { const g = window.__game; g.startGame(st, 1, 0); g.G.substeps = 2; g.hero().iframe = 1e9; }, st);
    await p.waitForTimeout(3500);
    await p.evaluate(() => { document.querySelector('#hud').hidden = true; window.__game.G.substeps = 1; });
    await p.screenshot({ path: `${OUT}/armor_${st}_idle.png`, clip: { x: 300, y: 120, width: 360, height: 360 } });
    await p.keyboard.down('KeyK'); await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/armor_${st}_charge.png`, clip: { x: 300, y: 120, width: 360, height: 360 } });
    await p.keyboard.up('KeyK'); await p.waitForTimeout(250);
    await p.screenshot({ path: `${OUT}/armor_${st}_spin.png`, clip: { x: 300, y: 120, width: 360, height: 360 } });
  }
  await b.close();
})();
