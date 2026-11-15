// Level-up: the screen holds on "レベルアップ" (world frozen) before the stat selection opens; a tap skips it only
// after a short moment; all five stats have a description. Run against dist/test.html on :8123.
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
  await p.evaluate(() => {
    window.__until = (cond, ms = 90000) => new Promise((res, rej) => { const t0 = performance.now(); const tick = () => { try { if (cond()) return res(true); } catch (e) { return rej(e); } if (performance.now() - t0 > ms) return res(false); requestAnimationFrame(tick); }; tick(); });
    window.__fresh = async () => {
      const g = window.__game; g.startGame(0, 1, 0); await window.__until(() => g.G.state === 'play');
      Object.assign(g.G, { introT: 99, substeps: 1 }); g.hero().iframe = 1e9; return true;
    };
  });

  // 1. banner, frozen world, then the stat selection
  await p.evaluate(() => window.__fresh());
  out.freeze = await p.evaluate(async () => {
    const g = window.__game, h = g.hero();
    g.enemies.length = 0; g.G.spawnLeft = 0;
    const e = { type: 'grunt', x: 5, z: 5, y: 0, vx: 0, vy: 0, vz: 0, face: 0, hp: 1e6, state: 'walk', t: 0, cd: 1e9, phase: 0, dead: false, lastHit: -1, pose: {}, spin: 0, slot: 0 };
    g.enemies.push(e);
    g.gainExp(30);                                   // level 2 -> one point to spend
    await window.__until(() => g.G.state === 'levelup');
    const banner = document.querySelector('#levelup-freeze');
    const r = { state: g.G.state, bannerVisible: !banner.hidden, title: banner.querySelector('.lu-title').textContent, lv: document.querySelector('#lu-lv').textContent,
      statHidden: document.querySelector('#stat-select').hidden };
    const p0 = [h.x, h.z, e.x, e.z, g.G.time, h.act && h.act.t];
    // the world must not move while the banner is up
    await window.__until(() => g.G.levelUpT > 0.3 || g.G.state !== 'levelup');
    r.frozen = g.G.state === 'levelup' && h.x === p0[0] && h.z === p0[1] && e.x === p0[2] && e.z === p0[3] && g.G.time === p0[4];
    await window.__until(() => g.G.state === 'stat-select');
    r.after = { state: g.G.state, bannerHidden: banner.hidden, statVisible: !document.querySelector('#stat-select').hidden };
    return r;
  });
  assert.equal(out.freeze.state, 'levelup'); assert.ok(out.freeze.bannerVisible); assert.equal(out.freeze.title, 'レベルアップ');
  assert.match(out.freeze.lv, /Lv 2/); assert.ok(out.freeze.statHidden, 'the stat screen does not open at once');
  assert.ok(out.freeze.frozen, 'world frozen on the banner');
  assert.equal(out.freeze.after.state, 'stat-select'); assert.ok(out.freeze.after.bannerHidden && out.freeze.after.statVisible);

  // 2. a tap too early does not skip; a tap after the first moment does
  await p.evaluate(() => window.__fresh());
  out.skip = await p.evaluate(async () => {
    const g = window.__game; g.gainExp(30);
    await window.__until(() => g.G.state === 'levelup');
    const early = () => window.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch' }));
    early();
    const stillWaiting = g.G.state === 'levelup';
    await window.__until(() => g.G.levelUpT >= 0.55);
    early();
    return { stillWaiting, skipped: g.G.state === 'stat-select' && !document.querySelector('#stat-select').hidden, t: +g.G.levelUpT.toFixed(2) };
  });
  assert.ok(out.skip.stillWaiting, 'an early tap is ignored'); assert.ok(out.skip.skipped, 'a later tap goes straight to the stat selection');

  // 3. after choosing, play resumes; every stat has a description
  await p.locator('[data-stat="power"]').click();
  await p.waitForFunction(() => window.__game.G.state === 'play');
  out.desc = await p.evaluate(() => [...document.querySelectorAll('.stat-option')].map(el => [el.dataset.stat, (el.querySelector('.stat-effect')?.textContent || '').trim()]));
  for (const [stat, text] of out.desc) assert.ok(text.length >= 10, `${stat} has a description`);
  assert.equal(out.desc.length, 5);

  // 4. a second level-up works the same way
  out.second = await p.evaluate(async () => { const g = window.__game; g.gainExp(60); await window.__until(() => g.G.state === 'levelup'); await window.__until(() => g.G.state === 'stat-select'); return g.G.state; });
  assert.equal(out.second, 'stat-select');
  console.log(JSON.stringify(out));
  assert.deepEqual(errors, []);
  console.log('ALL OK');
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
