// Flow cuts: turning the stick part-way through a slash (attack held) redirects into a new cut.
// Checks: redirect happens mid-slash (before the normal chain point), the cut matches the turn bucket,
// the hero turns and steps toward the stick, holding one direction or not holding attack does nothing,
// rolling the stick one way produces a spin, the analog stick works, and many distinct cuts appear.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} window.__game.startGame(0, 6, 0); });
  await p.waitForTimeout(800);
  await p.evaluate(() => { const g = window.__game; g.G.introT = 0; g.hero().iframe = 1e9; });
  const run = (fn, arg) => p.evaluate(fn, arg);
  const out = {};

  // helper installed in the page: drives the stick from a script of directions, switching at mid-slash
  await run(() => {
    const g = window.__game, h = g.hero();
    const KEYS = { N: [], W: ['KeyW'], A: ['KeyA'], S: ['KeyS'], D: ['KeyD'], WA: ['KeyW', 'KeyA'], WD: ['KeyW', 'KeyD'], SA: ['KeyS', 'KeyA'], SD: ['KeyS', 'KeyD'] };
    const ANG = { W: 0, WA: Math.PI / 4, A: Math.PI / 2, SA: 3 * Math.PI / 4, S: Math.PI, SD: -3 * Math.PI / 4, D: -Math.PI / 2, WD: -Math.PI / 4 };
    const setDir = (d) => { g.input.keys.clear(); for (const k of KEYS[d]) g.input.keys.add(k); };
    const mid = (a) => a.def.active[0] + (a.def.active[1] - a.def.active[0]) * 0.5;
    const wrap = (x) => ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    // dirs: list of directions; each is applied once the current slash is past its midpoint
    window.__flow = (dirs, { hold = true, timeout = 120000 } = {}) => new Promise(res => {
      h.x = 0; h.z = 0; h.act = null; h.iframe = 1e9; h.flowSense = null; h.flowRun = 0; g.input.clear(); g.input.held.clear();
      setDir(dirs[0]); g.input.press('attack'); if (!hold) g.input.held.delete('attack');
      const log = []; let i = 0, lastAct = null, armed = false, t0 = performance.now(), pend = null;
      const tick = () => {
        const a = h.act;
        if (Math.hypot(h.x, h.z) > 20) { h.x = 0; h.z = 0; }
        const measure = (L) => { if (L && L.rec === null) L.rec = { step: (h.x - L.x0) * Math.sin(L.ang) + (h.z - L.z0) * Math.cos(L.ang), faceErr: Math.abs(wrap(h.face - L.ang)), t: lastAct ? lastAct.t : 0 }; };
        if (a && a !== lastAct) {
          measure(log[log.length - 1]);   // the cut that just ended (redirected or finished)
          lastAct = a; armed = false;
          if (pend) { log.push({ ...pend, name: a.name, flowed: !!a.flowed, bucket: a.bucket || null, x0: h.x, z0: h.z, rec: null }); pend = null; }
        }
        // finish the step/turn measurement of the latest logged cut when its action is half over
        const L = log[log.length - 1];
        if (L && L.rec === null && a === lastAct && a && a.t > 0.3) measure(L);
        if (a && a.def.type && !armed && a.t >= mid(a) && i + 1 < dirs.length) {
          armed = true; i++;
          const d = dirs[i];
          pend = { dir: d, ang: ANG[d], turn: wrap(ANG[d] - h.face), prev: a.name, prevT: a.t, prevChain: a.def.chainAt };
          setDir(d);
        }
        const idleDone = i + 1 >= dirs.length && (!a || (a === lastAct && a.t > 0.3 && !pend));
        if (idleDone || performance.now() - t0 > timeout) { g.input.keys.clear(); g.input.held.clear(); g.input.clear(); res({ log, flowCuts: g.G.flowCuts || 0, pendingLeft: !!pend }); return; }
        requestAnimationFrame(tick);
      };
      tick();
    });
  });

  // A: every bucket once, from a forward start (turn measured from the facing at the switch)
  const A = await run(() => window.__flow(['W', 'A', 'W', 'D', 'W', 'WA', 'SD', 'WD', 'SA', 'S', 'W', 'SA', 'D', 'A', 'D']));
  const g = await run(() => ({ FLOW: window.__game.FLOW, SPIN: window.__game.FLOW_SPIN }));
  const bucketOf = (t) => { const a = Math.abs(t), s = t > 0 ? 'L' : 'R'; return a < 0.4 ? 'FWD' : a > 2.75 ? 'BACK' : s + (a < 1.18 ? '45' : a < 1.97 ? '90' : '135'); };
  const valid = (e) => e.flowed && (g.FLOW[e.bucket].includes(e.name) || [...g.SPIN.L, ...g.SPIN.R].includes(e.name));
  out.A = {
    cuts: A.log.map(e => `${e.dir}:${e.bucket}:${e.name}`),
    allFlowed: A.log.length === 14 && A.log.every(valid),
    midSlash: A.log.every(e => e.prevT < e.prevChain + 0.06),
    stepsToward: A.log.every(e => e.rec && e.rec.step > 0.12),
    facesStick: A.log.every(e => e.rec && e.rec.faceErr < 0.6),
    noRepeat: A.log.every(e => e.name !== e.prev),
    steps: A.log.map(e => e.rec ? +e.rec.step.toFixed(2) : null), faceErr: A.log.map(e => e.rec ? +e.rec.faceErr.toFixed(2) : null),
  };

  console.log('A', JSON.stringify(out.A));
  // B: holding one direction with attack held never redirects
  const f0 = A.flowCuts;
  const B = await run(() => new Promise(res => { const gm = window.__game, h = gm.hero(); h.x = 0; h.z = 0; h.act = null; gm.input.keys.clear(); gm.input.keys.add('KeyA'); gm.input.press('attack'); const s = gm.G.time, f = gm.G.flowCuts || 0; const t = () => { if (gm.G.time - s > 2.5) { gm.input.keys.clear(); gm.input.held.clear(); res({ d: (gm.G.flowCuts || 0) - f }); } else requestAnimationFrame(t); }; t(); }));
  out.B = { noFlowWhenDirectionHeld: B.d === 0 };

  console.log('B', JSON.stringify(out.B));
  // C: attack not held and not pressed recently: a late direction change does nothing
  const C = await run(() => new Promise(res => { const gm = window.__game, h = gm.hero(); h.x = 0; h.z = 0; h.act = null; gm.input.keys.clear(); gm.input.clear(); gm.input.held.clear();
    const f = gm.G.flowCuts || 0; let ph = 0, s = 0;
    const t = () => {
      if (ph === 0 && !h.act) { gm.input.press('attack'); gm.input.held.delete('attack'); ph = 1; s = gm.G.time; }
      else if (ph === 1 && h.act && gm.G.time - s > 0.47) { gm.input.keys.add('KeyD'); ph = 2; }
      else if (ph === 2 && (!h.act || gm.G.time - s > 1.2)) { gm.input.keys.clear(); res({ d: (gm.G.flowCuts || 0) - f, lateT: gm.G.time - s }); return; }
      requestAnimationFrame(t);
    }; t(); }));
  out.C = { noFlowWithoutAttack: C.d === 0 };

  console.log('C', JSON.stringify(out.C));
  // D: rolling the stick one way (W -> WA -> A -> SA ...) rolls into a spin
  const D = await run(() => window.__flow(['W', 'WA', 'A', 'SA', 'S', 'SD', 'D', 'WD', 'W']));
  const Dr = await run(() => window.__flow(['W', 'WD', 'D', 'SD', 'S', 'SA', 'A', 'WA', 'W']));
  out.D = { left: D.log.map(e => e.name), right: Dr.log.map(e => e.name),
    spinLeft: D.log.some(e => g.SPIN.L.includes(e.name)), spinRight: Dr.log.some(e => g.SPIN.R.includes(e.name)) };

  console.log('D', JSON.stringify(out.D));
  // E: analog stick (touch) instead of keys
  const E = await run(() => new Promise(res => { const gm = window.__game, h = gm.hero(); h.x = 0; h.z = 0; h.act = null; gm.input.keys.clear(); gm.input.clear(); gm.input.held.clear();
    gm.input.mx = 0; gm.input.my = 1; gm.input.press('attack'); const f = gm.G.flowCuts || 0; let sw = false; const s = performance.now();
    const t = () => { const a = h.act;
      if (a && !sw && a.t >= a.def.active[0] + (a.def.active[1] - a.def.active[0]) * 0.5) { sw = true; gm.input.mx = -0.9; gm.input.my = 0.2; }
      if (sw && h.act && h.act.flowed && h.act.t > 0.1) { const r = { d: (gm.G.flowCuts || 0) - f, name: h.act.name }; gm.input.mx = gm.input.my = 0; gm.input.held.clear(); res(r); return; }
      if (performance.now() - s > 60000) { gm.input.mx = gm.input.my = 0; gm.input.held.clear(); res({ d: (gm.G.flowCuts || 0) - f, name: null }); return; }
      requestAnimationFrame(t); }; t(); }));
  out.E = { analogWorks: E.d >= 1, name: E.name };

  console.log('E', JSON.stringify(out.E));
  // F: long random walk of directions: how many different cuts and (turn, cut) pairs appear
  const seq = ['W']; const all = ['W', 'A', 'S', 'D', 'WA', 'WD', 'SA', 'SD'];
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 45; i++) { let d; do { d = all[Math.floor(rnd() * 8)]; } while (d === seq[seq.length - 1]); seq.push(d); }
  const F = await run((s) => window.__flow(s, { timeout: 400000 }), seq);
  const names = new Set(F.log.map(e => e.name)), pairs = new Set(F.log.map(e => e.bucket + ':' + e.name)), trans = new Set(F.log.map(e => e.prev + '>' + e.name));
  out.F = { redirects: F.log.length, of: seq.length - 1, distinctCuts: names.size, distinctTurnCutPairs: pairs.size, distinctTransitions: trans.size, allValid: F.log.every(valid), cuts: [...names].sort().join(',') };

  console.log('F', JSON.stringify(out.F));
  const ok = out.A.allFlowed && out.A.midSlash && out.A.stepsToward && out.A.facesStick && out.A.noRepeat && out.B.noFlowWhenDirectionHeld && out.C.noFlowWithoutAttack && out.D.spinLeft && out.D.spinRight && out.E.analogWorks && out.F.allValid && out.F.redirects === out.F.of && out.F.distinctCuts >= 14;
  console.log(ok ? 'ALL OK' : 'FAILED');
  console.log('errors:', errors.length ? [...new Set(errors)].slice(0, 8).join('\n') : 'none');
  await b.close();
})();
