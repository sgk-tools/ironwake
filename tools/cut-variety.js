// More slash patterns: 1) every name in the tables exists, 2) every new action (quick / weighty versions, double
// cuts) runs, hits and stays off the ground, 3) real inputs give exactly what the tables say (light cuts from the 3rd
// on, heavy after 3+ cuts, dodge out of a string), 4) how many different moves can come out now vs before.
// Run against dist/test.html on :8123 (the fixed directional table is checked by directional-cuts.js).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(process.argv[2] || 'http://localhost:8123/dist/test.html');
  await p.locator('#btn-start').waitFor({ timeout: 120000 });
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  const out = {};

  // 1. integrity + variety numbers (pure functions, no game time needed)
  out.tables = await p.evaluate(() => {
    const g = window.__game, A = g.HERO_ACTIONS;
    const dirs = ['FWD', 'L45', 'R45', 'L90', 'R90', 'L135', 'R135', 'BACK'];
    const names = new Set();
    for (const d of dirs) g.EXT_LIGHT[d].forEach(n => names.add(n));
    for (const d of Object.keys(g.FINISH_EXT)) g.FINISH_EXT[d].forEach(pool => pool.forEach(n => names.add(n)));
    for (const d of Object.keys(g.DODGE_EXT)) g.DODGE_EXT[d].forEach(n => names.add(n));
    const missing = [...names].filter(n => !A[n]);
    // before: moves reachable through the old tables; after: plus everything the new tables can give
    const before = new Set(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
    for (const d of dirs) { const t = g.DIRECTIONAL_CUTS[d]; before.add(t.open); t.light.forEach(n => before.add(n)); t.heavy.forEach(n => before.add(n)); }
    Object.values(g.FINISHERS).forEach(l => l.forEach(n => before.add(n))); Object.values(g.DODGE_CUT).forEach(n => before.add(n));
    ['XCUT', 'XCUT_REV', 'STEP_CUT', 'BACKCUT', 'JUMP_FLIP', 'JUMP_SPIN', 'SPIN1', 'REVSPIN', 'DASH'].forEach(n => before.add(n));
    const after = new Set(before); names.forEach(n => after.add(n));
    // contexts that now give a defined move
    let lightCtx = 0, lightNames = new Set(), finCtx = 0, finNames = new Set(), dodCtx = 0, dodNames = new Set();
    const prevs = ['L1', 'CROSS', 'LOWSWEEP2', 'DOWNCUT', 'HIGHCUT', 'SPIN1'];
    for (const d of dirs) for (let k = 3; k <= 14; k++) for (let step = 0; step <= 3; step++) for (const pv of prevs) { lightCtx++; lightNames.add(g.extendedLight(d, k, step, pv)); }
    for (const d of [null, ...dirs]) for (let n = 3; n <= 14; n++) for (const pv of prevs) { finCtx++; finNames.add(g.finisherFor(n, d, pv)); }
    for (const d of [null, ...dirs]) for (let n = 1; n <= 14; n++) { dodCtx++; dodNames.add(g.dodgeCutFor(n, d)); }
    // technique ranks add moves to the neutral string
    const chainNames = (rank) => { const h = g.hero(); const was = h.stats.technique; h.stats.technique = rank; const set = new Set(g.hero && (g.comboChainNames ? g.comboChainNames() : [])); h.stats.technique = was; return set; };
    return { missing, newActions: g.CUT_VARIANTS.length + g.DOUBLE_CUTS.length, beforeMoves: before.size, afterMoves: after.size,
      lightCtx, lightMoves: lightNames.size, finCtx, finMoves: finNames.size, dodCtx, dodMoves: dodNames.size };
  });
  console.log('tables', JSON.stringify(out.tables));
  assert.deepEqual(out.tables.missing, [], 'every name in the tables is a real action');
  assert.equal(out.tables.newActions, 40);
  assert.ok(out.tables.afterMoves >= out.tables.beforeMoves * 1.6, 'at least 1.6x as many different moves can come out');

  // 2. every new action runs, hits and keeps the blade off the ground
  const names = await p.evaluate(() => [...window.__game.CUT_VARIANTS, ...window.__game.DOUBLE_CUTS]);
  out.actions = [];
  await p.evaluate(() => {
    window.__until = (cond, ms = 60000) => new Promise((res, rej) => { const t0 = performance.now(); const tick = () => { try { if (cond()) return res(true); } catch (e) { return rej(e); } if (performance.now() - t0 > ms) return res(false); requestAnimationFrame(tick); }; tick(); });
    window.__fresh = async (stats) => {
      const g = window.__game; g.startGame(0, 10, 0, stats || { technique: 10, dodge: 10 });
      await window.__until(() => g.G.state === 'play'); Object.assign(g.G, { introT: 99, substeps: 1 });
      const h = g.hero(); h.iframe = 1e9; g.enemies.length = 0; g.G.spawnLeft = 0; h.act = null; h.x = 0; h.z = 0; h.face = 0;
      g.input.keys.clear(); g.input.held.clear(); g.input.clear(); return true;
    };
  });
  await p.evaluate(() => window.__fresh());
  for (const name of names) {
    const r = await p.evaluate(async (name) => {
      const g = window.__game, h = g.hero(); h.act = null; h.x = 0; h.z = 0; h.face = 0; h.lightCount = 0;
      g.enemies.length = 0;
      // five dummies on an arc in front of the hero (a cut may pass to either side); they are put back every frame
      const ring = [-60, -30, 0, 30, 60].map(deg => ({ x: Math.sin(deg * Math.PI / 180) * 1.9, z: Math.cos(deg * Math.PI / 180) * 1.9 }));
      const dummies = ring.map(pt => { const e = { type: 'brute', x: pt.x, z: pt.z, y: 0, vx: 0, vy: 0, vz: 0, face: Math.PI, hp: 1e7, state: 'walk', t: 0, cd: 1e9, phase: 0, dead: false, lastHit: -1, pose: {}, spin: 0, slot: 0 }; g.enemies.push(e); return e; });
      const total = () => dummies.reduce((a, e) => a + e.hp, 0);
      g.startAction(name);
      const e = { get hp() { return total() / dummies.length; } };
      const def = h.act.def; let last = total(), hits = 0, minTip = 9, frames = 0, gap = 99;
      await window.__until(() => {
        dummies.forEach((d, i) => { d.x = ring[i].x; d.z = ring[i].z; d.vx = d.vz = 0; d.y = 0; d.vy = 0; });   // only the cut's own reach counts
        if (total() < last) { if (gap > 2) hits++; gap = 0; last = total(); } else gap++;
        // only while the cut can hit: the recovery back to the guard pose dips low in the original cuts too
        if (h.act && h.act.t >= def.active[0] && h.act.t <= def.active[1]) minTip = Math.min(minTip, h.tip.y);
        frames++;
        return !h.act;
      });
      return { name, dur: def.dur, hits, minTip: +minTip.toFixed(2), damage: dummies.length * 1e7 - total(), finished: !h.act };
    }, name);
    out.actions.push(r);
    assert.ok(r.finished, `${name} finishes`);
    assert.ok(r.damage > 0, `${name} hits`);
    if (name.includes('+')) assert.ok(r.hits >= 2, `${name} is a double cut: two separate hits (${r.hits})`);
  }
  const byName = Object.fromEntries(out.actions.map(a => [a.name, a]));
  assert.ok(byName['L1~F'].dur < byName['L1~H'].dur && byName['L1~H'].damage > byName['L1~F'].damage, 'quick is shorter and lighter than weighty');

  // 2b. the blade stays off the ground: the pose is evaluated every 0.01 s over the whole hitting window (frame
  // sampling can miss a short dip), including the transition between the two cuts of a double
  out.ground = await p.evaluate(() => {
    const g = window.__game, A = g.HERO_ACTIONS, h = g.hero(); const render = g.renderer.render; g.renderer.render = () => {};
    const tipY = (name, t) => { g.debugPose(name, t); h.rig.root.updateMatrixWorld(true); const v = h.blade.tip.clone(); h.sword.localToWorld(v); return v.y; };
    const low = [];
    for (const name of [...g.CUT_VARIANTS, ...g.DOUBLE_CUTS]) {
      const d = A[name]; let m = 9;
      for (let t = d.active[0]; t <= d.active[1]; t += 0.01) m = Math.min(m, tipY(name, t));
      if (m < -0.15) low.push([name, +m.toFixed(2)]);
    }
    g.renderer.render = render; g.G.state = 'play';
    return low;
  });
  assert.deepEqual(out.ground, [], 'no new cut puts the blade below the ground while it can hit');

  // 3. real inputs give exactly what the tables say
  out.wiring = await p.evaluate(async () => {
    const g = window.__game, h = g.hero();
    const KEYS = { N: [], FWD: ['ArrowUp'], L45: ['ArrowUp', 'ArrowLeft'], R45: ['ArrowUp', 'ArrowRight'], L90: ['ArrowLeft'], R90: ['ArrowRight'],
      L135: ['ArrowDown', 'ArrowLeft'], R135: ['ArrowDown', 'ArrowRight'], BACK: ['ArrowDown'] };
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
    const frame = () => new Promise(r => requestAnimationFrame(r));
    const dir = (id) => { g.input.keys.clear(); KEYS[id].forEach(c => key('keydown', c)); };
    const press = async (code) => { key('keydown', code); key('keyup', code); await frame(); };
    const results = { light: [], heavy: [], dodge: [] };

    // light cuts: a string of one direction, then another; compare each cut from the 3rd on with the table
    for (const seq of [['L90', 'L90', 'L90', 'L90', 'L90', 'L90'], ['R45', 'L135', 'R90', 'BACK', 'FWD', 'L45', 'R135'], ['L45', 'L45', 'R135', 'R135', 'L90', 'R90', 'FWD', 'BACK']]) {
      await window.__fresh();
      dir(seq[0]); await press('KeyJ');
      for (let i = 1; i < seq.length; i++) {
        const before = h.act; if (!before) break;
        dir(seq[i]); key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
        before.t = before.def.chainAt; await frame();
        const k = h.lightCount, step = before.cutDir === seq[i] ? before.cutStep : 0;
        // a direct left <-> right switch is the fixed reverse cross (XCUT / XCUT_REV) and is checked in directional-cuts.js
        const reversal = (before.cutDir === 'L90' && seq[i] === 'R90') || (before.cutDir === 'R90' && seq[i] === 'L90');
        const extended = !reversal && (k >= 4 || (k === 3 && step === 0));
        if (extended && h.act !== before) results.light.push({ dir: seq[i], k, name: h.act.name, expected: g.extendedLight(seq[i], k, step, before.name) });
      }
    }
    // heavy after n cuts
    for (const n of [3, 4, 5, 6, 8, 9]) for (const d of ['N', 'FWD', 'L90', 'BACK']) {
      await window.__fresh();
      dir('N'); await press('KeyJ');
      for (let i = 1; i < n; i++) { const before = h.act; before.t = before.def.chainAt; key('keydown', 'KeyJ'); key('keyup', 'KeyJ'); await frame(); }
      const before = h.act; if (!before) continue;
      const count = h.lightCount; dir(d); key('keydown', 'KeyK'); key('keyup', 'KeyK');
      before.t = before.def.chainAt; await frame();
      const heavyDir = d === 'N' ? (before.cutDir || null) : d;
      if (h.act !== before) results.heavy.push({ n: count, dir: d, name: h.act.name, expected: g.finisherFor(count, heavyDir === 'N' ? null : heavyDir, before.name) });
    }
    // dodge out of a string of c cuts, then slash in a direction
    for (const c of [1, 2, 3, 5, 7]) for (const d of ['N', 'FWD', 'L90', 'R135', 'BACK']) {
      await window.__fresh();
      dir('N'); await press('KeyJ');
      for (let i = 1; i < c; i++) { const before = h.act; before.t = before.def.chainAt; key('keydown', 'KeyJ'); key('keyup', 'KeyJ'); await frame(); }
      if (!h.act) continue;
      h.act.t = h.act.def.active[1] + 0.05;
      const count = h.lightCount;
      dir('N'); await press('Space');
      if (h.act?.name !== 'DODGE') continue;
      dir(d); await press('KeyJ');
      results.dodge.push({ c: count, dir: d, name: h.act?.name, expected: g.dodgeCutFor(count, d === 'N' ? null : d), from: null });
    }
    return results;
  });
  for (const kind of ['light', 'heavy', 'dodge']) {
    assert.ok(out.wiring[kind].length >= 10, `${kind}: enough situations checked (${out.wiring[kind].length})`);
    const bad = out.wiring[kind].filter(r => r.name !== r.expected);
    assert.deepEqual(bad, [], `${kind}: inputs give the table's move`);
  }
  console.log('checked situations: light ' + out.wiring.light.length + ', heavy ' + out.wiring.heavy.length + ', dodge ' + out.wiring.dodge.length);
  console.log('ALL OK');
  assert.deepEqual(errors, []);
  console.log('errors: none');
  await b.close();
})().catch(e => { console.error('FAILED', e.message.slice(0, 1500)); process.exit(1); });
