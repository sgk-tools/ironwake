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
    const trigger = page.getByRole('button', { name: '斬撃チュートリアル' });
    await trigger.waitFor({ timeout: 120000 });
    await trigger.tap();
    const modal = page.getByRole('dialog', { name: '斬撃チュートリアル' });
    const buttons = modal.locator('[data-slash]');
    await modal.waitFor();
    assert.equal(await buttons.count(), 7);
    await modal.getByRole('button', { name: '右上への斬り込み' }).tap();
    await page.locator('#tutorial-guide').waitFor();
    assert.match(await page.locator('#tutorial-hint').textContent(), /右上にスティックを倒したまま「斬」/);
    const touchDiagonal = await page.evaluate(async () => {
      const g = window.__game, h = g.hero();
      g.renderer.render = () => {};
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const stick = document.querySelector('#stick-zone'), rect = stick.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const pointer = (target, type, pointerId, clientX, clientY) =>
        target.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', clientX, clientY }));
      pointer(stick, 'pointerdown', 11, x, y);
      pointer(window, 'pointermove', 11, x + 40, y - 40);
      const afterTurn = g.G.time + 0.3;
      while (g.G.time < afterTurn) await frame();
      const facing = h.face;
      pointer(document.querySelector('#btn-attack'), 'pointerdown', 12, 0, 0);
      pointer(window, 'pointerup', 12, 0, 0);
      await frame();
      pointer(window, 'pointerup', 11, x + 40, y - 40);
      return { facing, move: h.act?.name, progress: document.querySelector('#tutorial-progress').textContent };
    });
    assert.ok(touchDiagonal.facing < -0.6, 'the hero turned while the stick was held');
    assert.deepEqual([touchDiagonal.move, touchDiagonal.progress], ['HIGHCUT2', '1 / 3 回']);

    const lessons = await page.evaluate(async () => {
      const g = window.__game, h = g.hero();
      g.renderer.render = () => {};
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const $ = selector => document.querySelector(selector);
      const angle = { FWD: 0, R45: -Math.PI / 4, L90: Math.PI / 2, BACK: Math.PI };
      const direction = dir => {
        [g.input.mx, g.input.my] = dir ? [-Math.sin(angle[dir]), Math.cos(angle[dir])] : [0, 0];
      };
      const tap = key => { g.input.press(key); g.input.held.delete(key); };
      async function tryMove(lesson) {
        for (const command of lesson.commands) {
          const previous = h.act;
          if (previous) previous.t = Math.max(previous.def.chainAt, previous.def.active[1] + 0.002);
          if (command.dir == null && !$('#tutorial-hint').textContent.includes('スティックから指を離して')) {
            throw new Error(`${lesson.move}: missing neutral-stick instruction`);
          }
          direction(command.dir);
          tap(command.kind === 'heavy' ? 'heavy' : 'attack');
          await frame();
          if (h.act === previous) await frame();
          direction(null);
          if (h.act?.name !== command.move) throw new Error(`${lesson.move}: ${command.move} became ${h.act?.name}`);
        }
      }
      const catalog = g.SLASH_LESSONS;
      for (const lesson of catalog) {
        g.startGame(0, 1, 0, undefined, 'normal', 'tutorial', lesson);
        await frame();
        await tryMove(lesson);
        if ($('#tutorial-progress').textContent !== '1 / 3 回') throw new Error(`${lesson.move}: success did not count`);
      }
      const sample = catalog.find(lesson => lesson.move === 'AIR_SLASH');
      g.startGame(0, 1, 0, undefined, 'normal', 'tutorial', sample);
      for (let i = 1; i <= 3; i++) {
        await tryMove(sample);
        if ($('#tutorial-progress').textContent !== `${i} / 3 回`) throw new Error('Air slash repetition did not count');
        while (h.act) await frame();
      }
      return catalog.map(lesson => lesson.move);
    });
    assert.equal(new Set(lessons).size, lessons.length);
    assert.deepEqual(lessons, ['HIGHCUT2', 'SPIN1', 'JUMP_FLIP', 'JUMP_SPIN', 'BACK_LEAP', 'AIR_SLASH', 'FIN2']);
    const completed = page.getByRole('dialog', { name: 'チュートリアルクリア' });
    await completed.waitFor({ timeout: 5000 });
    await completed.getByRole('button', { name: 'ほかの斬撃を選ぶ' }).tap();
    await modal.getByRole('button', { name: '閉じる' }).tap();
    await page.locator('#btn-start').tap();
    await page.evaluate(() => {
      const { G } = window.__game;
      Object.assign(G, { ko: 12345, waveIdx: 0, spawnLeft: 9999, spawnT: 99 });
    });
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 852, height: 393 }]) {
      await page.setViewportSize(size);
      const [objective, ko, buttons] = await Promise.all([
        page.locator('#objective').boundingBox(), page.locator('.ko').boundingBox(), page.locator('.right-top').boundingBox(),
      ]);
      assert.match(await page.locator('#objective').textContent(), /残り 9999 体/);
      for (const box of [ko, buttons]) {
        assert.ok(objective.x + objective.width <= box.x || box.x + box.width <= objective.x
          || objective.y + objective.height <= box.y || box.y + box.height <= objective.y, JSON.stringify({ size, objective, box }));
      }
    }
    assert.deepEqual(errors, []);
    console.log(`${lessons.length} slash lessons, three-repetition completion and separated HUD counters passed.`);
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
