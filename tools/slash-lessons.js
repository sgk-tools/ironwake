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
    await page.evaluate(() => {
      localStorage.setItem('ironwake-save-v1', JSON.stringify({ stage: 1, level: 1, exp: 0 }));
      document.querySelector('input[name="difficulty"]:checked').dispatchEvent(new Event('change', { bubbles: true }));
    });
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      for (const id of ['btn-start', 'btn-tutorial', 'btn-slash-tutorial', 'btn-continue', 'btn-boss-mode', 'btn-controls-guide']) {
        const box = await page.locator('#' + id).boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height,
          JSON.stringify({ size, id, box }));
      }
      const controls = page.getByRole('dialog', { name: '操作ガイド' });
      await page.getByRole('button', { name: '操作ガイド', exact: true }).tap();
      const helpText = controls.locator('.keys.touch');
      assert.match(await helpText.innerText(), /左側をなぞって移動/);
      await helpText.evaluate(el => { el.scrollTop = el.scrollHeight; });
      const close = controls.getByRole('button', { name: '閉じる' });
      const closeBox = await close.boundingBox();
      assert.ok(closeBox && closeBox.y >= 0 && closeBox.y + closeBox.height <= size.height);
      await close.tap();
      await controls.waitFor({ state: 'hidden' });
    }
    await trigger.tap();
    const modal = page.getByRole('dialog', { name: '斬撃チュートリアル' });
    const buttons = modal.locator('[data-slash]');
    await modal.waitFor();
    assert.equal(await buttons.count(), 7);
    await modal.getByRole('button', { name: '右上への斬り込み' }).tap();
    await page.locator('#tutorial-guide').waitFor();
    assert.match(await page.locator('#tutorial-steps').textContent(), /右上にスティックを倒したまま「斬」/);
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
        const list = $('#tutorial-steps');
        const items = [...list.children];
        if (list.hidden || items.length !== lesson.commands.length) throw new Error(`${lesson.move}: missing steps`);
        for (const [index, command] of lesson.commands.entries()) {
          if (list.querySelector('[aria-current="step"]') !== items[index]) throw new Error(`${lesson.move}: wrong highlighted step`);
          const previous = h.act;
          if (previous) previous.t = Math.max(previous.def.chainAt, previous.def.active[1] + 0.002);
          if (command.dir == null && !items[index].textContent.includes('スティックから指を離して')) {
            throw new Error(`${lesson.move}: missing neutral-stick instruction`);
          }
          direction(command.dir);
          tap(command.kind === 'heavy' ? 'heavy' : 'attack');
          await frame();
          if (h.act === previous) await frame();
          direction(null);
          if (h.act?.name !== command.move) throw new Error(`${lesson.move}: ${command.move} became ${h.act?.name}`);
          if (list.hidden || items.some((item, i) => list.children[i] !== item)) throw new Error(`${lesson.move}: steps changed during the combo`);
        }
        if (list.querySelector('[aria-current="step"]')) throw new Error(`${lesson.move}: still highlighting a finished step`);
      }
      const catalog = g.SLASH_LESSONS;
      const slam = catalog.find(lesson => lesson.move === 'FIN2');
      const zone = $('#stick-zone');
      const bounds = zone.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2, y = bounds.top + bounds.height / 2;
      const touch = (target, type, id, clientX = 0, clientY = 0) =>
        target.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: id, clientX, clientY }));
      const tilt = (degrees, pixels) => {
        const radians = degrees * Math.PI / 180;
        touch(window, 'pointermove', 21, x + pixels * Math.sin(radians), y - pixels * Math.cos(radians));
      };
      const pressButton = name => { touch($('#btn-' + name), 'pointerdown', 22); touch(window, 'pointerup', 22); };

      g.startGame(0, 1, 0, undefined, 'normal', 'tutorial', slam);
      touch(zone, 'pointerdown', 21, x, y);
      tilt(52, 50);
      pressButton('attack');
      await frame();
      touch(window, 'pointerup', 21);
      if (h.act?.name !== 'HIGHCUT2' || $('#tutorial-progress').textContent !== '0 / 3 回') {
        throw new Error('An intentional diagonal must stay diagonal');
      }

      for (const [up, down, pixels] of [[35, 145, 48], [-35, 215, 48], [25, 155, 20]]) {
        g.startGame(0, 1, 0, undefined, 'normal', 'tutorial', slam);
        touch(zone, 'pointerdown', 21, x, y);
        tilt(up, pixels);
        pressButton('attack');
        await frame();
        if (h.act?.name !== 'DASH') throw new Error(`Tilt at ${up} degrees was not accepted as up`);
        h.act.t = Math.max(h.act.def.chainAt, h.act.def.active[1] + 0.002);
        tilt(down, pixels);
        pressButton('heavy');
        await frame();
        touch(window, 'pointerup', 21);
        if (h.act?.name !== 'FIN2' || $('#tutorial-progress').textContent !== '1 / 3 回') {
          throw new Error(`Tilt at ${down} degrees was not accepted as down + heavy`);
        }
      }
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
    await modal.getByRole('button', { name: '後ろジャンプ斬り' }).tap();
    const guide = page.locator('#tutorial-guide');
    await guide.waitFor();
    assert.equal(await page.locator('#tutorial-steps li:visible').count(), 3);
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      const panel = await guide.boundingBox();
      for (const button of ['attack', 'heavy', 'dodge', 'rage']) {
        const box = await page.locator('#btn-' + button).boundingBox();
        assert.ok(panel.y + panel.height <= box.y || panel.x + panel.width <= box.x, JSON.stringify({ size, panel, button, box }));
      }
    }
    await page.getByRole('button', { name: '一時停止' }).tap();
    await page.getByRole('button', { name: 'タイトルへ戻る' }).tap();
    await page.locator('#btn-start').tap();
    await page.evaluate(() => {
      const { G } = window.__game;
      Object.assign(G, { ko: 12345, waveIdx: 0, spawnLeft: 9999, spawnT: 99 });
    });
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
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
    await page.evaluate(() => window.__game.gainExp(24));
    const levelUp = page.getByRole('dialog', { name: 'レベルアップ' });
    await levelUp.waitFor({ state: 'visible' });
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      const panel = levelUp.locator('.stat-panel');
      const scroll = await panel.evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight, offset: el.scrollTop }));
      assert.ok(scroll.content <= scroll.height + 1 && scroll.offset === 0, JSON.stringify({ size, scroll }));
      assert.equal(await panel.locator('.stat-portrait img:visible').count(), 1);
      assert.equal(await panel.locator('.stat-effect-full:visible').count(), 5);
      for (const stat of await panel.locator('.stat-option').all()) {
        const box = await stat.boundingBox();
        assert.ok(box && box.y >= 0 && box.y + box.height <= size.height, JSON.stringify({ size, box }));
      }
    }
    await levelUp.locator('[data-stat="awakening"]').tap();
    await levelUp.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__game.hero().stats.awakening), 2);
    assert.deepEqual(errors, []);
    console.log(`${lessons.length} slash lessons, vertical touch input, portrait title and level-up layout, and HUD passed.`);
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
