const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  for (const lv of [1, 2, 3, 4, 5]) {
    await p.evaluate((lv) => { const g = window.__game; g.startGame(0, lv, 0, { technique: lv }); g.G.substeps = 3; g.hero().iframe = 1e9; window.__seen = []; window.__last = null;
      clearInterval(window.__iv); window.__iv = setInterval(() => { const h = g.hero(); const n = h.act && h.act.name; if (n !== window.__last) { window.__last = n; if (n) window.__seen.push(n); } }, 5); }, lv);
    await p.waitForTimeout(2500);
    await p.keyboard.down('KeyJ'); await p.waitForTimeout(9000); await p.keyboard.up('KeyJ');
    console.log('Lv' + lv + ':', (await p.evaluate(() => window.__seen)).slice(0, 14).join(' > '));
  }
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})();
