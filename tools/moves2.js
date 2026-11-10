const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  const run = async (label, fn) => {
    await p.evaluate(() => { const g = window.__game; g.startGame(0, 1, 0); g.G.substeps = 3; g.hero().iframe = 1e9; window.__seen = []; window.__last = null; window.__loops = 0;
      clearInterval(window.__iv); window.__iv = setInterval(() => { const h = g.hero(); const n = h.act && h.act.name; window.__loops = Math.max(window.__loops, h.spinLoops || 0); if (n !== window.__last) { window.__last = n; if (n) window.__seen.push(n); } }, 5); });
    await p.waitForTimeout(1500);
    await fn();
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => ({ seen: window.__seen.join(' > '), loops: window.__loops }));
    console.log(label.padEnd(16), r.seen, '| spins:', r.loops);
  };
  const k = p.keyboard, w = ms => p.waitForTimeout(ms);
  await run('tap heavy', async () => { await k.down('KeyK'); await w(60); await k.up('KeyK'); });
  await run('charge 1.2s', async () => { await k.down('KeyK'); await w(1200); await k.up('KeyK'); });
  await run('charge max', async () => { await k.down('KeyK'); await w(3000); await k.up('KeyK'); });
  await run('J,J,J,J,K', async () => { for (let i = 0; i < 4; i++) { await k.press('KeyJ'); await w(420); } await k.press('KeyK'); });
  await run('J,K', async () => { await k.press('KeyJ'); await w(150); await k.press('KeyK'); });
  await run('J,J,K', async () => { await k.press('KeyJ'); await w(250); await k.press('KeyJ'); await w(250); await k.press('KeyK'); });
  await run('J,J,J,K', async () => { for (let i = 0; i < 3; i++) { await k.press('KeyJ'); await w(420); } await k.press('KeyK'); });
  await run('dodge+J', async () => { await k.press('Space'); await w(300); await k.press('KeyJ'); });
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})();
