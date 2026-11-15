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
    const trigger = page.getByRole('button', { name: '斬撃チュートリアル' });
    await trigger.waitFor({ timeout: 120000 });
    await trigger.tap();
    const modal = page.getByRole('dialog', { name: '斬撃チュートリアル' });
    const buttons = modal.locator('[data-slash]');
    await modal.waitFor();
    assert.equal(await buttons.count(), await page.evaluate(() => window.__game.getSlashLessons().length));
    await buttons.first().tap();
    await page.locator('#tutorial-guide').waitFor();

    const lessons = await page.evaluate(async () => {
      const g = window.__game, h = g.hero();
      g.renderer.render = () => {};
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const $ = selector => document.querySelector(selector);
      const angle = { FWD: 0, L45: Math.PI / 4, R45: -Math.PI / 4, L90: Math.PI / 2, R90: -Math.PI / 2, L135: 3 * Math.PI / 4, R135: -3 * Math.PI / 4, BACK: Math.PI };
      const direction = dir => {
        const facing = h.act?.cutFacing ?? h.face;
        [g.input.mx, g.input.my] = dir ? [-Math.sin(facing + angle[dir]), Math.cos(facing + angle[dir])] : [0, 0];
      };
      const tap = key => { g.input.press(key); g.input.held.delete(key); };
      async function tryMove(lesson) {
        for (const command of lesson.commands) {
          const previous = h.act;
          if (previous) previous.t = Math.max(previous.def.chainAt, previous.def.active[1] + 0.002);
          if (command.kind === 'counter') {
            direction(null);
            tap('dodge');
            await frame();
            if (h.act?.name !== 'DODGE') throw new Error(`${lesson.move}: dodge did not start`);
          }
          direction(command.dir);
          tap(command.kind === 'heavy' ? 'heavy' : 'attack');
          await frame();
          if (h.act === previous) await frame();
          direction(null);
          if (h.act?.name !== command.move) throw new Error(`${lesson.move}: ${command.move} became ${h.act?.name}`);
        }
      }
      const catalog = g.getSlashLessons();
      // The charged spin and boss counters have their own lessons. The other excluded definitions have no input route.
      const excluded = new Set(['SPIN', 'SPIN_IN', 'SPIN_LOOP', 'CLASH_FOLLOWUP', 'CLASH_DISARM', 'HIGHCUT~H', 'HIGHCUT2~F', 'HIGHCUT2~H']);
      const missing = Object.entries(g.HERO_ACTIONS).filter(([move, def]) => def.type && def.dmg && !excluded.has(move)
        && !catalog.some(lesson => lesson.move === move)).map(([move]) => move);
      if (missing.length) throw new Error(`Missing lessons: ${missing.join(', ')}`);
      for (const lesson of catalog) {
        g.startGame(0, lesson.technique, 0, { technique: lesson.technique }, 'normal', 'tutorial', lesson);
        await frame();
        await tryMove(lesson);
        if ($('#tutorial-progress').textContent !== '1 / 3 回') throw new Error(`${lesson.move}: success did not count`);
      }
      const sample = catalog.find(lesson => lesson.move === 'AIR_SLASH');
      g.startGame(0, sample.technique, 0, { technique: sample.technique }, 'normal', 'tutorial', sample);
      for (let i = 1; i <= 3; i++) {
        await tryMove(sample);
        if ($('#tutorial-progress').textContent !== `${i} / 3 回`) throw new Error('Air slash repetition did not count');
        while (h.act) await frame();
      }
      return catalog.map(lesson => lesson.move);
    });
    assert.equal(new Set(lessons).size, lessons.length);
    assert.ok(['JUMP_FLIP', 'JUMP_SPIN', 'RFLIP', 'AIR_SLASH', 'RISECUT+DOWNCUT'].every(move => lessons.includes(move)));
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
