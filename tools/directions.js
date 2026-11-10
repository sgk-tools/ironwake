// Directional light attacks (keyboard and touch), buffered direction, and PIVOT reachability.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  for (const mode of ['keyboard', 'touch']) {
    const ctx = mode === 'touch' ? await b.newContext({ ...devices['iPhone 15 Pro landscape'] }) : await b.newContext({ viewport: { width: 900, height: 500 } });
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto('http://localhost:8123/dist/test.html');
    await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
    await p.evaluate(() => { const g = window.__game; g.startGame(0, 1, 0); g.hero().iframe = 1e9; });
    await p.waitForTimeout(2500);
    // fire direction + attack in the same frame, then read which action started
    const fire = (dir, mode) => p.evaluate(async ([dir, mode]) => {
      const g = window.__game, h = g.hero(), inp = g.input;
      h.act = null; h.face = 0; h.pose.rootYaw = 0; inp.keys.clear(); inp.resetStick && inp.resetStick();
      const vec = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0], none: [0, 0] }[dir];
      if (mode === 'keyboard') {
        const code = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }[dir];
        if (code) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ' }));
      } else {
        const zone = document.querySelector('#stick-zone'), r = zone.getBoundingClientRect();
        const x = r.left + r.width * 0.4, y = r.top + r.height * 0.6;
        if (dir !== 'none') {
          zone.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: x, clientY: y, bubbles: true }));
          window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: x + vec[0] * 60, clientY: y - vec[1] * 60, bubbles: true }));
        }
        const btn = document.querySelector('#btn-attack');
        btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, bubbles: true }));
        btn.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, bubbles: true }));
      }
      const faceBefore = h.face;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const name = h.act ? h.act.name : 'none';
      inp.keys.clear(); window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
      return { dir, started: name, faceBefore: +faceBefore.toFixed(2), faceAfter: +h.face.toFixed(2) };
    }, [dir, mode]);
    for (const d of ['up', 'left', 'right', 'down', 'none']) results.push({ mode, ...(await fire(d, mode)) });
    // buffered: during an attack press right+attack, release right immediately; the next move must still be the right cut
    const buf = await p.evaluate(async (mode) => {
      const g = window.__game, h = g.hero(), inp = g.input;
      h.act = null; h.face = 0; inp.keys.clear(); g.startAction('L1');
      await new Promise(r => setTimeout(r, 60));
      if (mode === 'keyboard') { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ' }));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' })); }
      else { const zone = document.querySelector('#stick-zone'), r = zone.getBoundingClientRect(); const x = r.left + r.width * 0.4, y = r.top + r.height * 0.6;
        zone.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, clientX: x, clientY: y, bubbles: true }));
        window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, clientX: x + 60, clientY: y, bubbles: true }));
        const btn = document.querySelector('#btn-attack'); btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 10, bubbles: true })); btn.dispatchEvent(new PointerEvent('pointerup', { pointerId: 10, bubbles: true }));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true })); }
      const queuedDir = h.act && h.act.queuedDir;
      const seen = [];
      await new Promise(res => { const t0 = performance.now(); const iv = setInterval(() => { const n = h.act ? h.act.name : 'idle'; if (seen[seen.length - 1] !== n) seen.push(n); if (performance.now() - t0 > 6000) { clearInterval(iv); res(); } }, 5); });
      return { queuedDir, sequence: seen.join(' > ') };
    }, mode);
    results.push({ mode, buffered: buf });
    if (errors.length) results.push({ mode, errors });
    await ctx.close();
  }
  console.log(results.map(r => JSON.stringify(r)).join('\n'));
  // PIVOT reachability through every pool at every level, rage on/off, and every finisher
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto('http://localhost:8123/dist/test.html'); await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  const piv = await p.evaluate(() => { const g = window.__game, h = g.hero(); const found = [];
    for (const rage of [0, 12]) for (let lv = 1; lv <= 10; lv++) { h.level = lv; h.rageT = rage; g.comboChain().forEach((pool, i) => { if (pool.includes('PIVOT')) found.push(`lv${lv} rage${!!rage} slot${i}`); }); }
    for (const [n, pool] of Object.entries(g.FINISHERS)) if (pool.includes('PIVOT')) found.push('finisher ' + n);
    let defined = true; try { g.startAction('PIVOT'); } catch (e) { defined = false; }
    h.rageT = 0; h.act = null; return { found, pivotDefined: defined }; });
  console.log('PIVOT check:', JSON.stringify(piv));
  await b.close();
})();
