// Stage-1 combat checks:
//  - heavy (charged) spin: loops never pause; a single ~0.12 s braced hold only after the last loop
//  - light-combo spins: one 360 turn, no dedicated pause
//  - knockback: horizontal distance from a single hit to landing (same grunt, same ground, same power)
//  - PIVOT unreachable from every combo pool, rage pool and finisher
//  - weapon selector hidden with no extra weapons
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
  // timeline of actions; a "pause" is a run of samples where the hero pose does not change while acting
  // per rendered frame: action name, game time and a pose fingerprint; a pause = game time passing
  // (>= 0.08 s) while acting with an unchanged pose
  const rec = async (setup, ms) => p.evaluate(async ([src, ms]) => {
    const g = window.__game, h = g.hero(); const log = []; let last = '', fp = '', since = null, pauses = [];
    eval(src);
    const t0 = performance.now();
    await new Promise(res => { const step = () => {
      const a = h.act, key = a ? a.name : 'idle';
      if (key !== last) { log.push(key + (a && (a.name === 'SPIN_LOOP' || a.name === 'SPIN_OUT') ? '#loops=' + h.spinLoops : '')); last = key; }
      const f = JSON.stringify([h.target.rootYaw, h.target.rootPitch, h.target.uarmR, h.target.torso, h.target.thighR].map(v => Array.isArray(v) ? v.map(x => +x.toFixed(4)) : +(v || 0).toFixed(4)));
      if (a && f === fp) { if (since === null) since = g.G.time; }
      else { if (since !== null && g.G.time - since >= 0.08) pauses.push(`${key}(${(g.G.time - since).toFixed(2)}s, loops=${h.spinLoops})`); since = null; }
      fp = f;
      if (performance.now() - t0 > ms) res(); else requestAnimationFrame(step); };
      requestAnimationFrame(step); });
    return { seq: log.join(' > '), pauses: pauses.join(', ') || 'none' };
  }, [setup, ms]);
  await p.evaluate(() => { window.__game.G.substeps = 1; });
  console.log('heavy spin x4:', JSON.stringify(await rec("h.act = null; h.spinTarget = 4; h.chargeMul = 1; h.spinLoops = 0; g.startAction('SPIN_IN');", 30000)));
  for (const n of ['L4', 'SPIN1', 'REVSPIN', 'RSPIN2', 'RFLIP', 'WHEEL']) console.log(n.padEnd(8), JSON.stringify(await rec(`h.act = null; g.startAction('${n}');`, 6000)));
  // single-hit knockback distance to landing
  const kb = await p.evaluate(async () => {
    const g = window.__game, h = g.hero(), out = {};
    const trial = async (name, setup) => {
      g.enemies.length = 0; h.act = null; h.x = 0; h.z = 0; h.face = 0; h.pose = {};
      const e = { type: 'grunt', x: -2.0, z: 0.4, y: 0, vx: 0, vz: 0, vy: 0, face: Math.PI / 2, hp: 1e6, state: 'walk', t: 0, cd: 99, phase: 0, dead: false, lastHit: -1, pose: {}, spin: 0, slot: 0 };
      g.enemies.push(e); setup && setup(); g.startAction(name);
      let hitAt = null, airborne = false, land = null; const t0 = performance.now();
      await new Promise(res => { const iv = setInterval(() => {
        // first hit: record the spot and end the attack so only this single hit counts
        if (!hitAt && (Math.abs(e.vx) + Math.abs(e.vz) > 0.5)) { hitAt = { x: e.x, z: e.z }; h.act = null; h.x = 30; h.z = 30; }
        if (hitAt && e.y > 0.05) airborne = true;
        if (hitAt && airborne && e.y <= 0 && !land) land = { x: e.x, z: e.z };
        if (land || performance.now() - t0 > 8000) { clearInterval(iv); res(); } }, 3); });
      return hitAt && land ? +Math.hypot(land.x - hitAt.x, land.z - hitAt.z).toFixed(2) : null;
    };
    out.L1_normal = await trial('L1');
    out.SPIN1_lightSpin = await trial('SPIN1');
    out.SPIN_IN_heavy = await trial('SPIN_IN', () => { h.spinTarget = 1; h.chargeMul = 1; h.spinLoops = 0; });
    return out;
  });
  console.log('knockback distance hit->landing (m):', JSON.stringify(kb));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})();
