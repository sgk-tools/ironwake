const { chromium } = require('playwright');
const OUT = process.argv[2];
const list = JSON.parse(process.argv[3]); // [[name,t,yaw,dist,who],...]
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 420, height: 420 } });
  p.on('pageerror', e => console.log('err', e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  let i = 0;
  for (const [n, t, yaw, dist, who] of list) {
    await p.evaluate(([n, t, yaw, dist, who]) => window.__game.debugPose(n, t, yaw, dist, who), [n, t, yaw ?? 0.6, dist ?? 5, who ?? 'hero']);
    await p.screenshot({ path: `${OUT}/pose_${String(i++).padStart(2, '0')}.png` });
  }
  await b.close();
})();
