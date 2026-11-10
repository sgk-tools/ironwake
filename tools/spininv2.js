const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.evaluate(() => { window.__game.startGame(0, 1, 0); });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const g = window.__game, h = g.hero(), out = [];
    for (const name of [null, 'CHARGE', 'SPIN_IN', 'SPIN_LOOP', 'SPIN_OUT', 'L4', 'SPIN1', 'RSPIN2', 'L1', 'L3', 'DASH']) {
      h.hp = h.maxHp; h.iframe = 0; h.dead = false;
      if (name) g.startAction(name); else h.act = null;
      g.hurtHero(50, h.x + 1, h.z);
      out.push(`${name || 'idle'}=${h.maxHp - h.hp}`);
      h.act = null; h.iframe = 0;
    }
    return out.join('  ');
  });
  console.log('damage taken per action (50 incoming):', r);
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})();
