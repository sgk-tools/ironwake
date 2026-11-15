const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.IRONWAKE_CHROME || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage(devices['iPhone 15 Pro landscape']);
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
    for (const size of [{ width: 667, height: 375 }, { width: 390, height: 780 }]) {
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
      await lesson('重回転');
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

      await lesson('回避からの斬撃');
      await repeat(async () => {
        await idle();
        tap('dodge');
        await until(() => h.act?.name === 'DODGE', 'rolling');
        tap('attack');
      });
      await lesson('回避からの重回転');
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
      await lesson('打ち落とし');
      await until(() => $('#tutorial-status').textContent.includes('もう一度'), 'miss feedback');
      if (!progress(0) || h.hp !== h.maxHp) throw new Error('Miss counted or did damage');
      await alignSlash(false);
      await until(() => $('#tutorial-status').textContent.includes('打ち合いになった'), 'clash feedback');
      if (!progress(0)) throw new Error('Clash counted as a disarm');
      await repeat(() => alignSlash(true));

      await lesson('打ち合い');
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
    console.log('All six tutorial lessons, timing feedback, replay, quit and campaign save isolation passed.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
