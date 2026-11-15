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
    const start = page.getByRole('button', { name: 'チュートリアル', exact: true });
    await start.waitFor({ timeout: 120000 });
    const saveKey = 'ironwake-save-v1';
    const checkpoint = JSON.stringify({ stage: 2, level: 1, exp: 7 });
    await page.evaluate(({ saveKey, checkpoint }) => localStorage.setItem(saveKey, checkpoint), { saveKey, checkpoint });
    await start.tap();

    const guide = page.locator('#tutorial-guide');
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 780 }]) {
      await page.setViewportSize(size);
      const [panel, attack] = await Promise.all([guide.boundingBox(), page.locator('#btn-attack').boundingBox()]);
      assert.ok(panel.x >= 0 && panel.x + panel.width <= size.width && panel.y + panel.height < attack.y);
    }

    await page.evaluate(async () => {
      const g = window.__game;
      const h = g.hero();
      g.renderer.render = () => {};
      const $ = selector => document.querySelector(selector);
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      async function until(test, label) {
        const deadline = performance.now() + 14000;
        while (!test() && performance.now() < deadline) await frame();
        if (!test()) throw new Error(`${label}: ${$('#tutorial-name').textContent}, ${$('#tutorial-progress').textContent}, ${$('#tutorial-status').textContent}`);
      }
      const progress = reps => $('#tutorial-progress').textContent.startsWith(`${reps} /`);
      const lesson = name => until(() => $('#tutorial-name').textContent.endsWith(name), name);
      const pointer = (target, type) => target.dispatchEvent(new PointerEvent(type, { pointerId: 2, pointerType: 'touch' }));
      const down = name => pointer($('#btn-' + name), 'pointerdown');
      const up = () => pointer(window, 'pointerup');
      const tap = name => { down(name); up(); };
      const idle = () => until(() => !h.act, 'recovered');
      async function repeat(action) {
        for (let reps = 1; reps <= 3; reps++) {
          await action();
          await until(() => progress(reps), `success ${reps}`);
        }
      }
      async function nextLesson(name, testPause = false) {
        const next = $('#btn-tutorial-next');
        await until(() => !next.hidden, 'next lesson button');
        if (!progress(3) || !next.textContent.endsWith(name)) throw new Error(`Missing transition to ${name}`);
        const rect = next.getBoundingClientRect();
        if (document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) !== next) {
          throw new Error('Next lesson button cannot receive a touch');
        }
        const time = g.G.time;
        await frame();
        await frame();
        if (g.G.time !== time || next.hidden) throw new Error('The tutorial advanced by itself');
        if (testPause) {
          $('#btn-pause').click();
          if (g.G.state !== 'pause') throw new Error('Could not pause while waiting for the next lesson');
          $('#btn-resume').click();
          if (g.G.state !== 'play' || next.hidden) throw new Error('Lost the next lesson prompt on resume');
        }
        next.click();
        await lesson(name);
        if (!next.hidden || !progress(0)) throw new Error('The next lesson did not reset progress');
      }

      async function checkBattleView() {
        const render = g.renderer.render;
        await new Promise((resolve, reject) => {
          g.renderer.render = (_scene, camera) => {
            g.renderer.render = render;
            camera.updateMatrixWorld(true);
            const panel = $('#tutorial-guide').getBoundingClientRect();
            for (const actor of [h, g.boss()]) {
              for (const joint of [actor.rig.j.head, actor.rig.j.torso, actor.rig.j.pelvis]) {
                const point = joint.getWorldPosition(h.tip.clone()).project(camera);
                const x = (point.x + 1) * innerWidth / 2, y = (1 - point.y) * innerHeight / 2;
                if (x >= panel.left - 12 && x <= panel.right + 12 && y >= panel.top - 12 && y <= panel.bottom + 12) {
                  reject(new Error(`Tutorial guide overlaps a combatant at ${x}, ${y}`));
                  return;
                }
              }
            }
            resolve();
          };
        });
      }

      await lesson('斬撃');
      await repeat(async () => {
        await idle();
        tap('attack');
        await until(() => h.act?.light, 'starting slash');
        g.input.mx = 0.8;
        tap('heavy');
        await frame();
        g.input.mx = 0;
      });
      await nextLesson('重回転', true);
      await idle();
      tap('heavy');
      await until(() => h.act?.name === 'SPIN_LOOP', 'quick heavy');
      if (!progress(0)) throw new Error('Quick heavy counted as a charged spin');
      await repeat(async () => {
        await idle();
        down('heavy');
        await until(() => h.chargeLv > 0 && h.act?.name === 'CHARGE', 'heavy charged');
        up();
      });

      await nextLesson('回避からの斬撃');
      await repeat(async () => {
        await idle();
        tap('dodge');
        await until(() => h.act?.name === 'DODGE', 'rolling');
        tap('attack');
      });
      await nextLesson('回避からの重回転');
      await repeat(async () => {
        await idle();
        tap('dodge');
        await until(() => h.act?.name === 'DODGE', 'rolling');
        down('heavy');
        await until(() => h.chargeLv > 0 && (h.act?.charging || h.act?.name === 'CHARGE'), 'charged from a roll');
        up();
      });

      async function alignSlash(precise) {
        await until(() => {
          const boss = g.boss();
          return precise ? boss?.state === 'cleave' && !boss.hitDone && boss.t >= 0.087
            : boss?.state === 'cleaveWind' && boss.strikeIn != null && boss.strikeIn <= 0.22;
        }, 'strike window');
        tap('attack');
      }
      await nextLesson('打ち落とし');
      await checkBattleView();
      await until(() => $('#tutorial-status').textContent.includes('もう一度'), 'miss feedback');
      if (!progress(0) || h.hp !== h.maxHp) throw new Error('Miss counted or did damage');
      await alignSlash(false);
      await until(() => $('#tutorial-status').textContent.includes('打ち合いになった'), 'clash feedback');
      if (!progress(0)) throw new Error('Clash counted as a disarm');
      await until(() => h.act?.name === 'CLASH' && h.act.t > 0.45, 'exchanging blows');
      await checkBattleView();
      await repeat(() => alignSlash(true));

      await nextLesson('打ち合い');
      await alignSlash(true);
      await until(() => $('#tutorial-status').textContent.includes('打ち落としになった'), 'disarm feedback');
      if (!progress(0)) throw new Error('Disarm counted as a clash');
      await repeat(() => alignSlash(false));
    });

    const completed = page.getByRole('dialog', { name: 'チュートリアルクリア' });
    await completed.waitFor({ state: 'visible', timeout: 20000 });
    assert.match(await completed.textContent(), /全6課題を3回ずつ/);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), checkpoint);
    await completed.getByRole('button', { name: 'もう一度練習' }).tap();
    await guide.waitFor({ state: 'visible' });
    assert.match(await guide.textContent(), /斬撃0 \/ 3 回/);
    await page.getByRole('button', { name: '一時停止' }).tap();
    await page.getByRole('button', { name: 'タイトルへ戻る' }).tap();
    await start.waitFor();
    assert.equal(await guide.isVisible(), false);
    await page.locator('#btn-continue').tap();
    assert.equal(await page.evaluate(() => window.__game.G.stageIdx), 2);
    assert.deepEqual(errors, []);
    console.log('All six tutorial lessons, combatant clearance, manual transitions, replay, quit and campaign save isolation passed.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
