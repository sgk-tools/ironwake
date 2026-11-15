const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.IRONWAKE_CHROME || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage(devices['iPhone 15 Pro']);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.argv[2] || 'http://localhost:8123/dist/test.html');
    await page.locator('#btn-start').waitFor({ timeout: 120000 });
    const result = await page.evaluate(async () => {
      const g = window.__game;
      const h = g.hero();
      g.renderer.render = () => {};
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const pointer = (target, event, pointerId) =>
        target.dispatchEvent(new PointerEvent(event, { pointerId, pointerType: 'touch' }));
      const tap = (action, pointerId = 2) => {
        pointer(document.querySelector('#btn-' + action), 'pointerdown', pointerId);
        pointer(window, 'pointerup', pointerId);
      };
      const until = async test => {
        const end = performance.now() + 12000;
        while (!test() && performance.now() < end) await frame();
        return Boolean(test());
      };
      const reset = (technique = 1) => {
        g.input.resetButtons();
        g.input.keys.clear();
        g.input.resetStick();
        g.startGame(0, technique, 0, { technique });
        Object.assign(g.G, { introT: 99, substeps: 1 });
      };

      reset();
      g.startAction('HURT');
      tap('heavy');
      await frame();
      const heavyQueued = h.act?.name === 'HURT';
      const heavyAfterStagger = await until(() => h.act?.name === 'SPIN_IN');

      reset();
      g.startAction('L1');
      tap('dodge');
      await frame();
      const dodgeQueued = h.act?.name === 'L1';
      const dodgeAfterSlash = await until(() => h.act?.name === 'DODGE');
      const hp = h.hp;
      g.hurtHero(40, h.x, h.z);
      const invulnerable = h.hp === hp;

      reset();
      h.rage = 100;
      g.startAction('CLASH_RECOIL');
      tap('rage');
      await frame();
      const rageQueued = h.act?.name === 'CLASH_RECOIL';
      const rageAfterClash = await until(() => h.act?.name === 'RAGE' && h.rageT > 0);

      reset();
      tap('rage');
      await frame();
      const rageWarning = document.querySelector('#callout').textContent === '覚醒ゲージ不足';
      h.rage = 100;
      await frame();
      const noDelayedRage = h.rageT === 0;

      reset();
      const heavyButton = document.querySelector('#btn-heavy');
      pointer(heavyButton, 'pointerdown', 2);
      pointer(heavyButton, 'pointerdown', 3);
      pointer(heavyButton, 'lostpointercapture', 3);
      pointer(window, 'pointerup', 2);
      const secondTouchHeld = g.input.held.has('heavy') && heavyButton.classList.contains('down');
      pointer(window, 'pointerup', 3);
      const cleanRelease = !g.input.held.has('heavy') && !heavyButton.classList.contains('down');

      const chain = async technique => {
        reset(technique);
        const start = g.G.time;
        // one press = one attack: tap the attack button every 0.12 s of game time (holding it does nothing)
        tap('attack');
        let nextTap = g.G.time + 0.12;
        const moves = [];
        let idle = false, last;
        await until(() => {
          if (g.G.time >= nextTap) { tap('attack'); nextTap = g.G.time + 0.12; }
          const action = h.act;
          if (moves.length && !action) idle = true;
          if (action && action !== last) {
            last = action;
            moves.push({ name: action.name, time: g.G.time - start, yaw: h.pose.rootYaw });
          }
          return moves.length === (technique === 10 ? 12 : 3);
        });
        return { moves, idle };
      };
      return {
        heavyQueued, heavyAfterStagger, dodgeQueued, dodgeAfterSlash, invulnerable,
        rageQueued, rageAfterClash, rageWarning, noDelayedRage, secondTouchHeld, cleanRelease,
        low: await chain(1), max: await chain(10),
      };
    });
    const { low, max, ...checks } = result;
    for (const [name, passed] of Object.entries(checks)) assert.ok(passed, name);
    for (const chain of [low, max]) {
      assert.ok(['SPIN1', 'REVSPIN'].includes(chain.moves[1]?.name));
      assert.ok(['JUMP_SPIN', 'JUMP_FLIP'].includes(chain.moves[2]?.name));
      assert.ok(Math.abs(chain.moves[2].yaw) < Math.PI, 'yaw unwound after full turn');
    }
    assert.equal(max.moves.length, 12);
    assert.deepEqual([max.moves[2].name, max.moves[8].name], ['JUMP_SPIN', 'JUMP_FLIP']);
    assert.equal(max.idle, false);
    assert.ok(Math.abs((max.moves[2].time - max.moves[0].time) - (low.moves[2].time - low.moves[0].time)) < 0.07);
    assert.deepEqual(errors, []);
    console.log('Buffered heavy, dodge and awakening, multitouch release, rotation chains and unchanged speed at Lv10 passed.');
    console.log('Time to third attack:', (low.moves[2].time - low.moves[0].time).toFixed(3), 's at Lv1;',
      (max.moves[2].time - max.moves[0].time).toFixed(3), 's at Lv10.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
