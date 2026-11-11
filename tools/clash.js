// Boss parry / evade-cut and the stage 4-5 boss attacks.
// For every boss strike, check all three sword exchange outcomes after a timed slash,
// an early slash, side/back evade-cuts and an undefended hit. Serve dist/test.html on :8123.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => {
    if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text());
  });
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  const results = [];
  for (const stageIdx of [0, 3, 4]) {
    await p.evaluate((s) => { window.__game.startGame(s, 6, 0); }, stageIdx);
    await p.waitForTimeout(500);
    // jump to the boss wave and stop the crowd so only the boss matters
    await p.evaluate(() => { const g = window.__game; g.G.substeps = 4; g.G.introT = 0; g.G.waveIdx = 2; g.enemies.forEach(e => { e.hp = 0; e.dead = true; e.t = 5; }); g.G.spawnLeft = 0; });
    await p.waitForFunction(() => { const bb = window.__game.boss(); return bb && bb.state !== 'hidden' && bb.state !== 'roar'; }, null, { timeout: 60000 });
    await p.evaluate(() => { window.__game.G.spawnLeft = 0; window.__game.G.substeps = 2; });
    const ONLY = process.argv[2] ? process.argv[2].split(',') : null;   // optional attack filter, e.g. leap,charge
    const attacks = (await p.evaluate(() => [...window.__game.boss().attacks])).filter(a => !ONLY || ONLY.includes(a));
    for (const atk of attacks) {
      const rolls = { draw: 0.499, hero: 0.5, boss: 0.75 };
      for (const mode of ['none', 'early', 'draw', 'hero', 'boss', 'side', 'back']) {
        const roll = rolls[mode];
        const r = await p.evaluate(({ atk, mode, roll }) => new Promise(res => {
          const g = window.__game, bb = g.boss(), h = g.hero();
          g.enemies.forEach(e => { e.hp = 0; e.dead = true; e.t = 5; }); g.G.spawnLeft = 0;
          // boss at the arena centre facing +z, hero in front of it
          const far = atk === 'charge' || atk === 'leap';
          bb.x = 0; bb.z = 0; bb.y = 0; bb.face = 0; bb.hp = bb.maxHp; bb.poise = 0; bb.speed = bb.speed || 1;
          h.x = 0; h.z = far ? 9 : 3.6 * bb.scale / 2.3; h.face = Math.PI; h.act = null; h.iframe = 0; h.dead = false;
          h.maxHp = h.hp = 1e5; h.rageT = 0;
          g.input.keys.clear(); g.input.clear();
          const p0 = g.G.parries || 0, m0 = g.G.mikiriHits || 0, c0 = g.G.clashHits || 0, hp0 = h.hp;
          g.setBoss(atk + 'Wind'); bb.tele = false; bb.glinted = false;
          const expectedHeroDamage = 160 * bb.dmgMul;
          const expectedBossDamage = g.HERO_ACTIONS.L1.dmg * (1 + 0.07 * (h.level - 1));
          const random = Math.random;
          let rolled = false, sawRecoil = false;
          if (roll !== undefined) {
            Math.random = () => {
              const a = h.act;
              if (bb.state !== 'clash' || a?.name !== 'CLASH' || a.beat !== 4 || a.t < a.def.active[1]) return random();
              rolled = true;
              Math.random = random;
              return roll;
            };
          }
          let pressed = false, t0 = performance.now(), glint = false;
          const key = mode === 'side' ? 'KeyD' : mode === 'back' ? 'KeyW' : null;   // hero faces -z: W = away from the boss
          const tick = () => {
            if (bb.glinted) glint = true;
            const eta = bb.strikeIn;
            const at = mode === 'early' ? 1.1 : roll !== undefined ? 0.22 : 0.3;
            if (!pressed && mode !== 'none' && eta != null && eta <= at) {
              pressed = true; if (key) g.input.keys.add(key); g.input.press('attack'); g.input.held.delete('attack');
            }
            if (h.act?.name === 'CLASH_RECOIL' && bb.state === 'clashRecoil') sawRecoil = true;
            const busy = h.act && (h.act.name.startsWith('MIKIRI') || h.act.def.clashLocked);
            const done = !busy && (bb.state === 'walk' || bb.state === 'parried' || bb.state === 'stagger' || bb.state === 'leapLand' || bb.state === 'chargeStop');
            if ((done && performance.now() - t0 > 300) || performance.now() - t0 > 90000) {
              g.input.keys.clear();
              Math.random = random;
              res({
                atk, mode, state: bb.state, parried: (g.G.parries || 0) - p0,
                mikiri: (g.G.mikiriHits || 0) - m0, clash: (g.G.clashHits || 0) - c0,
                dmg: Math.round(hp0 - h.hp), bossDmg: Math.round(bb.maxHp - bb.hp),
                expectedHeroDamage: Math.round(expectedHeroDamage), expectedBossDamage: Math.round(expectedBossDamage),
                act: h.act?.name || null, glint, rolled, sawRecoil,
              });
              return;
            }
            if (pressed && key && h.act && h.act.name.startsWith('MIKIRI')) g.input.keys.delete(key);
            requestAnimationFrame(tick);
          };
          tick();
        }), { atk, mode, roll });
        // The winner lands exactly one hit and a draw staggers both without damage.
        const exchange = r.rolled && r.parried === 1 && r.clash === 4;
        const ok = mode === 'none' ? r.dmg > 0 && r.parried === 0
          : mode === 'early' ? r.parried === 0
          : mode === 'draw' ? exchange && r.dmg === 0 && r.bossDmg === 0 && r.sawRecoil
          : mode === 'hero' ? exchange && r.dmg === 0 && r.bossDmg === r.expectedBossDamage
          : mode === 'boss' ? exchange && r.dmg === r.expectedHeroDamage && r.bossDmg === 0
          : r.dmg === 0 && r.mikiri >= 1;
        results.push({ stage: stageIdx + 1, ...r, ok }); console.log(JSON.stringify(results[results.length - 1]));
        // let the boss settle
        await p.evaluate(() => { const g = window.__game; g.setBoss('walk', 99); g.hero().act = null; });
        await p.waitForTimeout(150);
      }
    }
  }
  const bad = results.filter(r => !r.ok);
  console.log(`${results.length - bad.length}/${results.length} ok`);
  console.log('errors:', errors.length ? [...new Set(errors)].slice(0, 8).join('\n') : 'none');
  await b.close();
  if (bad.length || errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exit(1); });
