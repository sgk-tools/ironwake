// Boss combat regression: exchanges, precise disarms with and without direction, and missed timings.
// Serve dist/test.html on :8123. Use a single update per frame for strike timing.
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
    await p.evaluate((s) => { window.__game.startGame(s, 1, 0); }, stageIdx);
    await p.waitForTimeout(500);
    // jump to the boss wave and stop the crowd so only the boss matters
    await p.evaluate(() => { const g = window.__game; g.G.substeps = 4; g.G.introT = 0; g.G.waveIdx = 2; g.enemies.forEach(e => { e.hp = 0; e.dead = true; e.t = 5; }); g.G.spawnLeft = 0; });
    await p.waitForFunction(() => { const bb = window.__game.boss(); return bb && bb.state !== 'hidden' && bb.state !== 'roar'; }, null, { timeout: 60000 });
    await p.evaluate(() => { window.__game.G.spawnLeft = 0; window.__game.G.substeps = 1; });
    const ONLY = process.argv[2] ? process.argv[2].split(',') : null;   // optional attack filter, e.g. leap,charge
    const attacks = (await p.evaluate(() => [...window.__game.boss().attacks])).filter(a => !ONLY || ONLY.includes(a));
    for (const atk of attacks) {
      const rolls = { draw: 0.499, hero: 0.5, boss: 0.75, redirect: 0.499, nearMiss: 0.499 };
      const modes = ['none', 'early', 'draw', 'hero', 'boss', 'side', 'back', 'redirect', 'precise'];
      if (atk === 'cleave') modes.push('nearMiss');
      for (const mode of modes) {
        const roll = rolls[mode];
        const r = await p.evaluate(({ atk, mode, roll }) => new Promise(res => {
          const g = window.__game, bb = g.boss(), h = g.hero();
          g.enemies.forEach(e => { e.hp = 0; e.dead = true; e.t = 5; }); g.G.spawnLeft = 0;
          // boss at the arena centre facing +z, hero in front of it
          const far = atk === 'charge' || atk === 'leap';
          bb.x = 0; bb.z = 0; bb.y = 0; bb.face = 0; bb.hp = bb.maxHp; bb.poise = 0; bb.speed = bb.speed || 1;
          h.x = 0; h.z = far ? 9 : 3.6 * bb.scale / 2.3; h.face = Math.PI; h.act = null; h.iframe = 0; h.dead = false;
          h.maxHp = h.hp = 1e5; h.rageT = 0;
          g.input.keys.clear(); g.input.clear(); g.input.held.clear();
          g.input.mx = g.input.my = 0; h.lastSlashPress = null;
          const p0 = g.G.parries || 0, c0 = g.G.clashHits || 0, hp0 = h.hp;
          g.setBoss(atk + 'Wind'); bb.tele = false; bb.glinted = false;
          const expectedHeroDamage = 160 * bb.dmgMul;
          const expectedBossDamage = g.HERO_ACTIONS.L1.dmg;
          const random = Math.random;
          let rolled = false, sawRecoil = false;
          let bossHpAtClash, initialPattern, contacts, sawDisarmHitstop = false, sawRedirect = false, sawDisarm = false, sawHitstop = false, sawClashText = false;
          const cuts = new Set();
          if (roll !== undefined) {
            Math.random = () => {
              const a = h.act;
              if (bb.state !== 'clash' || a?.name !== 'CLASH' || a.beat !== a.contacts || a.t < a.def.active[1]) return random();
              rolled = true;
              Math.random = random;
              return roll;
            };
          }
          let pressed = false, t0 = performance.now(), glint = false;
          const key = mode === 'side' ? 'KeyD' : mode === 'back' ? 'KeyW' : null;   // hero faces -z: W = away from the boss
          const precise = mode === 'precise' || key !== null;
          const tick = () => {
            if (bb.glinted) glint = true;
            // The initiating slash can hit before it parries. Count damage from the exchange only.
            const a = h.act;
            if (a?.name === 'CLASH' || a?.name === 'CLASH_DISARM') bossHpAtClash ??= bb.hp;
            if (a?.name === 'CLASH') {
              contacts = a.contacts;
              if (a.cut) cuts.add(a.cut);
              initialPattern ??= a.pattern;
              if (mode === 'redirect' && a.beat === 1 && a.pattern === initialPattern && !a.nextPattern) {
                const direction = h.face + (initialPattern[0] === 'CROSS' ? -1 : 1) * Math.PI / 2;
                g.input.mx = -Math.sin(direction); g.input.my = Math.cos(direction);
                g.input.press('attack'); g.input.held.delete('attack');
              }
              if (a.pattern !== initialPattern) {
                sawRedirect = a.cut === (initialPattern[0] === 'CROSS' ? 'CROSS2' : 'CROSS') || sawRedirect;
                g.input.mx = g.input.my = 0;
              }
            }
            if (a?.name === 'CLASH_DISARM' && !bb.axe.visible && bb.droppedAxe?.mesh.parent) {
              sawDisarm = true; sawDisarmHitstop ||= g.G.hitstop > 0.17;
              if (key) g.input.keys.delete(key);
            }
            if (bossHpAtClash !== undefined && bb.hp < bossHpAtClash && g.G.hitstop >= 0.08) sawHitstop = true;
            const callout = document.querySelector('#callout');
            if (callout.classList.contains('show') && /鍔迫り合い|相打ち|見切り|打ち落とし/.test(callout.textContent)) sawClashText = true;
            const eta = bb.strikeIn;
            const at = precise ? 0.028 : mode === 'early' ? 1.1 : mode === 'nearMiss' ? 0.07 : 0.22;
            if (!pressed && mode !== 'none' && eta != null && eta <= at) {
              pressed = true; if (key) g.input.keys.add(key); g.input.press('attack'); g.input.held.delete('attack');
            }
            if (h.act?.name === 'CLASH_RECOIL' && bb.state === 'clashRecoil') sawRecoil = true;
            const busy = h.act?.def.clashLocked;
            const done = !busy && (precise && sawDisarm ? bb.state === 'walk'
              : ['walk', 'parried', 'stagger', 'leapLand'].includes(bb.state));
            if ((done && performance.now() - t0 > 300) || performance.now() - t0 > 90000) {
              g.input.keys.clear(); g.input.mx = g.input.my = 0;
              Math.random = random;
              res({
                atk, mode, state: bb.state, parried: (g.G.parries || 0) - p0,
                contacts, clash: (g.G.clashHits || 0) - c0,
                dmg: Math.round(hp0 - h.hp), bossDmg: Math.round((bossHpAtClash ?? bb.maxHp) - bb.hp),
                expectedHeroDamage: Math.round(expectedHeroDamage), expectedBossDamage: Math.round(expectedBossDamage),
                act: h.act?.name || null, glint, rolled, sawRecoil, sawRedirect, sawDisarm, sawHitstop, sawClashText, sawDisarmHitstop,
                cuts: [...cuts], axeRestored: bb.axe.visible && !bb.droppedAxe,
                expectedDisarmDamage: g.HERO_ACTIONS.CLASH_DISARM.dmg,
              });
              return;
            }
            requestAnimationFrame(tick);
          };
          tick();
        }), { atk, mode, roll });
        // The winner lands exactly one hit and a draw staggers both without damage.
        const exchange = r.rolled && r.parried === 1 && r.contacts >= 3 && r.contacts <= 7 && r.clash === r.contacts && !r.sawClashText && r.cuts.length >= 3;
        const ok = mode === 'none' ? r.dmg > 0 && r.parried === 0
          : mode === 'early' ? r.parried === 0
          : (mode === 'draw' || mode === 'nearMiss') ? exchange && r.dmg === 0 && r.bossDmg === 0 && r.sawRecoil
          : mode === 'redirect' ? exchange && r.dmg === 0 && r.sawRedirect
          : mode === 'hero' ? exchange && r.dmg === 0 && r.bossDmg === r.expectedBossDamage && r.sawHitstop
          : mode === 'boss' ? exchange && r.dmg === r.expectedHeroDamage && r.bossDmg === 0
          : r.parried === 1 && r.clash === 0 && r.sawDisarm && r.axeRestored && r.sawDisarmHitstop
            && r.dmg === 0 && r.bossDmg === r.expectedDisarmDamage && r.sawHitstop && !r.sawClashText;
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
