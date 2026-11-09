const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.click('#btn-start');
  await p.evaluate(() => { const g = window.__game; window.__seen = []; setInterval(() => { const h = g.hero(); const n = h.act && h.act.name; if (n && window.__last !== n) { window.__last = n; window.__seen.push(n + '@' + g.G.time.toFixed(1)); }; }, 10); g.hero().rage = 100; g.G.substeps = 3; });
  await p.keyboard.press('KeyU'); await p.waitForTimeout(2500);
  await p.keyboard.down('KeyJ'); await p.waitForTimeout(20000); await p.keyboard.up('KeyJ');
  await p.waitForTimeout(1500);
  console.log(JSON.stringify(await p.evaluate(() => ({ seen: window.__seen, rageT: window.__game.hero().rageT, pitch: window.__game.hero().pose.rootPitch }))));
  await b.close();
})();
