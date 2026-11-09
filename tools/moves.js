// Exercises the attack variations and records which actions actually ran.
const { chromium } = require('playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.click('#btn-start');
  // record every action the hero starts and the max spin loop count
  await p.evaluate(() => {
    const g = window.__game; g.G.substeps = 2; window.__seen = []; window.__maxLoops = 0;
    setInterval(() => { const h = g.hero(); const n = h.act && h.act.name; if (n && window.__seen[window.__seen.length - 1] !== n) window.__seen.push(n); window.__maxLoops = Math.max(window.__maxLoops, h.spinLoops || 0); }, 15);
  });
  const kb = p.keyboard, w = ms => p.waitForTimeout(ms);
  const shot = async n => p.screenshot({ path: `${OUT}/mv_${n}.png` });
  // 1. running attack -> DASH
  await kb.down('KeyW'); await w(300); await kb.press('KeyJ'); await w(250); await shot('dash'); await kb.up('KeyW'); await w(700);
  // 2. combo then back input -> UPPER ; side input -> CROSS
  await kb.press('KeyJ'); await w(300); await kb.down('KeyS'); await kb.press('KeyJ'); await w(350); await shot('upper'); await kb.up('KeyS'); await w(900);
  await kb.press('KeyJ'); await w(300); await kb.down('KeyA'); await kb.press('KeyJ'); await w(350); await shot('cross'); await kb.up('KeyA'); await w(900);
  // 3. hold heavy for a long time -> multiple spin loops
  await kb.down('KeyK'); await w(2500); await shot('spin'); await kb.up('KeyK'); await w(1200);
  // 4. rage chain
  await p.evaluate(() => { window.__game.hero().rage = 100; });
  await kb.press('KeyU'); await w(1400);
  for (let i = 0; i < 6; i++) { await kb.press('KeyJ'); await w(i === 1 ? 300 : 520); if (i === 1) await shot('rflip'); }
  await w(1500);
  const r = await p.evaluate(() => ({ seen: window.__seen, maxLoops: window.__maxLoops, ko: window.__game.G.ko, pitch: window.__game.hero().pose.rootPitch, yaw: window.__game.hero().pose.rootYaw }));
  console.log(JSON.stringify(r));
  console.log('errors:', errors.length ? errors.slice(0, 8).join('\n') : 'none');
  await b.close();
})();
