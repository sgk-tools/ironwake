const { chromium } = require('playwright');
(async () => {
  const [,, f, out, ry='0.5', sp='0.8', w='1000', h='700'] = process.argv;
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  p.on('console', m => console.log('console:', m.text())); p.on('pageerror', e => console.log('err', e.message));
  await p.goto(`http://localhost:8123/tools/viewer.html?f=${f}&ry=${ry}&sp=${sp}&rig=${process.env.RIG||''}`);
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  await p.screenshot({ path: out }); await b.close();
})();
