// Verifies: charged spin keeps turning and holds only after the last loop; each other turning move holds once;
// spin hits on grunts push 1.6x harder than the same hit from a non-turning move; selector hidden.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  console.log('weapon selector hidden:', await p.$eval('.weapon-choice', e => e.hidden), '| options:', await p.$$eval('#weapon-select option', o => o.map(x => x.value).join(',')));
  await p.evaluate(() => { const g = window.__game; g.startGame(0, 1, 0); g.G.substeps = 3; g.hero().iframe = 1e9; });
  await p.waitForTimeout(3000);
  // record a timeline in-page (game time) of action name, loop count and hold state
  const rec = async (fn, ms) => p.evaluate(async ([src, ms]) => {
    const g = window.__game, h = g.hero(); const log = []; let last = '';
    eval(src);
    const t0 = performance.now();
    await new Promise(res => { const iv = setInterval(() => {
      const a = h.act; const key = a ? `${a.name}${a.turnHold > 0 ? '[HOLD]' : ''}` : 'idle';
      if (key !== last) { log.push(key + (a && a.name === 'SPIN_LOOP' ? `#${h.spinLoops}` : '')); last = key; }
      if (performance.now() - t0 > ms) { clearInterval(iv); res(); } }, 4); });
    return log.join(' > ');
  }, [fn, ms]);
  console.log('charged spin (target 4):', await rec("h.spinTarget = 4; h.chargeMul = 1; h.spinLoops = 0; g.startAction('SPIN_IN');", 14000));
  for (const n of ['L4', 'SPIN1', 'REVSPIN', 'RSPIN2', 'PIVOT', 'RFLIP', 'WHEEL', 'SPIN']) {
    console.log(n.padEnd(8), await rec(`h.act = null; g.startAction('${n}');`, 7000));
  }
  // knockback: same grunt placement, compare a spin hit with a non-spin sweep (both kb 7)
  const kb = await p.evaluate(async () => {
    const g = window.__game, h = g.hero(), out = {};
    for (const n of ['L4', 'L1']) {
      g.enemies.length = 0; h.act = null; h.x = 0; h.z = 0; h.face = 0;
      const e = { type: 'grunt', x: 0, z: 2.0, y: 0, vx: 0, vz: 0, vy: 0, face: Math.PI, hp: 1e6, state: 'walk', t: 0, cd: 99, phase: 0, dead: false, lastHit: -1, pose: {}, spin: 0, slot: 0 };
      // place the grunt where the blade passes for each move
      g.enemies.push(e); g.startAction(n);
      let peak = 0, vy = 0; const t0 = performance.now();
      await new Promise(res => { const iv = setInterval(() => { const v = Math.hypot(e.vx, e.vz); if (v > peak) { peak = v; vy = e.vy; } if (performance.now() - t0 > 4000) { clearInterval(iv); res(); } }, 4); });
      out[n] = { peakHorizontal: +peak.toFixed(2), vyAtPeak: +vy.toFixed(2), kbDef: g.G && undefined };
    }
    return out;
  });
  console.log('knockback (kb L4=7, L1=5):', JSON.stringify(kb));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})();
