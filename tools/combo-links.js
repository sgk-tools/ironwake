// Button combinations: finite hold chains, damage fall-off for plain 斬, links that restore it,
// dodge -> heavy (DHEAVY) and chain -> dodge (BSTEP). Run against dist/test.html on :8123.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await p.evaluate(() => {
    window.__until = (cond, ms = 90000) => new Promise((res, rej) => { const t0 = performance.now(); const tick = () => { try { if (cond()) return res(true); } catch (e) { return rej(e); } if (performance.now() - t0 > ms) return res(false); requestAnimationFrame(tick); }; tick(); });
    window.__setup = (rank) => {
      const g = window.__game; g.startGame(0, 1, 0, { technique: rank });
      return window.__until(() => g.G.state === 'play').then(() => {
        const h = g.hero(); Object.assign(g.G, { introT: 99, substeps: 2 });
        g.enemies.length = 0; g.G.spawnLeft = 0; h.act = null; h.x = 0; h.z = 0; h.face = 0; h.iframe = 0; h.lightRecovery = 0; h.monoRun = 0; h.lightCount = 0;
        g.input.clear(); g.input.held.clear(); g.input.keys.clear(); return true;
      });
    };
    window.__dummy = (z, type = 'brute') => { const g = window.__game; const e = { type, x: 0, z, y: 0, vx: 0, vz: 0, vy: 0, face: Math.PI, hp: 1e6, state: 'walk', t: 0, cd: 1e9, phase: 0, dead: false, lastHit: -1, pose: {}, spin: 0, slot: 0 }; g.enemies.push(e); return e; };
  });
  const out = {};

  // 1. every rank stops at its cap; plain 斬 only gets the long pause
  out.caps = [];
  for (let rank = 1; rank <= 5; rank++) {
    await p.evaluate(rank => window.__setup(rank), rank);
    const r = await p.evaluate(() => new Promise(res => {
      const g = window.__game, h = g.hero(); h.iframe = 1e9; g.input.press('attack');
      const t0 = performance.now();
      const tick = () => { if (h.lightRecovery > 0 || performance.now() - t0 > 60000) { g.input.held.delete('attack'); res({ hits: h.lightCount, recovery: +h.lightRecovery.toFixed(2), cap: g.LIGHT_CAP[h.stats.technique] }); } else requestAnimationFrame(tick); };
      tick();
    }));
    out.caps.push(r);
    assert.equal(r.hits, r.cap, `rank ${rank}: stops at its cap`);
    assert.ok(r.recovery > 0.5, `rank ${rank}: plain-斬 string ends with the long pause`);
  }
  assert.deepEqual(out.caps.map(c => c.cap), [3, 4, 5, 6, 9]);

  // 2. plain 斬 falls off after MONO_FREE cuts; a link restores it
  await p.evaluate(() => window.__setup(5));
  out.decay = await p.evaluate(async () => {
    const g = window.__game, h = g.hero(); h.iframe = 1e9;
    const cut = async (monoRun, keys) => {
      g.enemies.length = 0; const e = window.__dummy(1.9); h.act = null; h.lightRecovery = 0; h.x = 0; h.z = 0; h.face = 0; h.lightCount = 0; h.monoRun = monoRun;
      g.input.keys.clear(); for (const k of keys || []) g.input.keys.add(k);
      g.input.press('attack'); g.input.held.delete('attack');
      await window.__until(() => h.act && h.act.light);
      const mono = h.act.mono, run = h.monoRun; g.input.keys.clear();
      await window.__until(() => !h.act || h.act.t > h.act.def.active[1] + 0.05);
      return { dmg: 1e6 - e.hp, mono, run };
    };
    return { fresh: await cut(0), tired: await cut(5), linked: await cut(5, ['KeyA']) };
  });
  assert.ok(out.decay.fresh.dmg > 0, 'fresh cut hits');
  assert.ok(Math.abs(out.decay.tired.dmg / out.decay.fresh.dmg - 0.5) < 0.05, `tired cut does half damage (${out.decay.tired.dmg}/${out.decay.fresh.dmg})`);
  assert.equal(out.decay.linked.mono, 0, 'a direction input is a link');
  assert.equal(out.decay.linked.run, 0);

  // 3. links reset the run: dodge and heavy
  out.links = await p.evaluate(async () => {
    const g = window.__game, h = g.hero(); h.iframe = 1e9; const r = {};
    h.act = null; h.monoRun = 5; g.input.press('dodge'); await window.__until(() => h.act && h.act.name === 'DODGE'); r.dodge = h.monoRun;
    await window.__until(() => !h.act);
    h.monoRun = 5; g.input.press('heavy'); await window.__until(() => h.act && h.act.name === 'CHARGE'); r.heavy = h.monoRun; g.input.held.delete('heavy');
    await window.__until(() => !h.act);
    return r;
  });
  assert.equal(out.links.dodge, 0); assert.equal(out.links.heavy, 0);

  // 4. dodge -> heavy: a rising crush right after the roll
  await p.evaluate(() => window.__setup(3));
  out.dheavy = await p.evaluate(async () => {
    const g = window.__game, h = g.hero(); h.iframe = 1e9; const e = window.__dummy(2.0);
    g.input.press('dodge'); await window.__until(() => h.act && h.act.name === 'DODGE');
    g.input.press('heavy'); g.input.held.delete('heavy');
    const names = []; let last = null;
    await window.__until(() => { const n = h.act ? h.act.name : null; if (n !== last) { names.push(n); last = n; } return names.includes('DHEAVY') && !h.act; });
    return { names, dmg: 1e6 - e.hp };
  });
  assert.deepEqual(out.dheavy.names.slice(0, 2), ['DODGE', 'DHEAVY']);
  assert.ok(out.dheavy.dmg > 0, 'dodge-heavy connects');

  // 5. chain -> dodge: back-step cut (invulnerable, steps back); one cut -> plain dodge
  out.bstep = [];
  for (const cuts of [1, 2, 3]) {
    await p.evaluate(() => window.__setup(5));
    const r = await p.evaluate(async (cuts) => {
      const g = window.__game, h = g.hero(); h.iframe = 0;
      g.input.press('attack'); g.input.held.delete('attack');
      for (let i = 1; i < cuts; i++) { await window.__until(() => h.act && h.act.light && h.lightCount === i && h.act.t > h.act.def.active[0]); g.input.press('attack'); g.input.held.delete('attack'); }
      await window.__until(() => h.act && h.act.light && h.lightCount === cuts && h.act.t > h.act.def.active[1] + 0.02);
      const before = h.act.name; const x0 = h.x, z0 = h.z, fx = Math.sin(h.face), fz = Math.cos(h.face);
      g.input.press('dodge');
      await window.__until(() => h.act && (h.act.name === 'BSTEP' || h.act.name === 'DODGE'));
      const name = h.act.name, iframe = h.iframe;
      await window.__until(() => h.act && h.act.t > 0.25);
      const back = -((h.x - x0) * fx + (h.z - z0) * fz);
      let hurt = false; await window.__until(() => { if (h.act && h.act.name === 'HURT') hurt = true; return !h.act; });
      return { cuts, before, name, iframe: +iframe.toFixed(2), back: +back.toFixed(2), hurt };
    }, cuts);
    out.bstep.push(r);
  }
  assert.equal(out.bstep[0].name, 'DODGE', 'one cut then dodge stays a plain dodge');
  for (const r of out.bstep.slice(1)) { assert.equal(r.name, 'BSTEP'); assert.ok(r.iframe > 0.2, 'back-step is invulnerable at the start'); assert.ok(r.back > 0.4, 'steps back'); }

  console.log(JSON.stringify(out));
  console.log('ALL OK');
  console.log('errors:', errors.length ? [...new Set(errors)].slice(0, 6).join('\n') : 'none');
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
