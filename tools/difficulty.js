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
    await page.locator('#btn-start').waitFor({ timeout: 120000 });
    const choices = page.locator('.title-inner .difficulty-choice label');
    assert.equal(await choices.count(), 3);
    assert.ok(await page.locator('input[name=difficulty][value=normal]').isChecked());
    for (const size of [{ width: 393, height: 852 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(size);
      for (const label of [...await choices.all(), page.locator('#btn-start')]) {
        const box = await label.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= size.width && box.y >= 0 && box.y + box.height <= size.height);
      }
    }
    await page.evaluate(() => {
      window.__game.renderer.render = () => {};
      localStorage.setItem('ironwake-save-v1', JSON.stringify({ stage: 1, level: 1, exp: 0 }));
    });

    const select = async name => {
      await choices.filter({ hasText: name.toUpperCase() }).tap();
      assert.ok(await page.locator('input[name=difficulty][value=' + name + ']').isChecked());
    };
    const current = () => page.evaluate(() => {
      const g = window.__game, h = g.hero();
      return { mode: g.G.difficulty, stage: g.G.stageIdx, level: h.level, stats: h.stats, tier: h.growTier };
    });
    const start = () => page.locator('#btn-start').tap();
    const leave = async () => {
      await page.locator('#btn-pause').tap();
      await page.locator('#btn-quit').tap();
    };
    const continueButton = page.locator('#btn-continue');

    await select('easy');
    assert.ok(!(await continueButton.isVisible()));
    await start();
    const easy = await current();
    assert.deepEqual(easy, {
      mode: 'easy', stage: 0, level: 46, stats: { health: 10, power: 10, technique: 10, dodge: 10, awakening: 10 }, tier: 4,
    });
    assert.ok(!(await page.locator('#stat-select').isVisible()));
    await page.evaluate(() => {
      const g = window.__game;
      Object.assign(g.G, { waveIdx: 2, spawnLeft: 0, waveDelay: 2 });
    });
    await page.waitForFunction(() => window.__game.boss().state === 'roar');
    await page.evaluate(() => {
      const g = window.__game;
      g.setBoss('dead');
      Object.assign(g.boss(), { dead: true, hp: 0, deadT: 3.3 });
    });
    await page.locator('#btn-next').tap();
    assert.deepEqual(await current(), { ...easy, stage: 1 });
    const saves = await page.evaluate(() => ({
      normal: JSON.parse(localStorage.getItem('ironwake-save-v1')),
      easy: JSON.parse(localStorage.getItem('ironwake-save-v1-easy')),
      hard: localStorage.getItem('ironwake-save-v1-hard'),
    }));
    assert.deepEqual(saves.normal, { stage: 1, level: 1, exp: 0 });
    assert.deepEqual(saves.easy, { stage: 1, level: 46, exp: 0, stats: easy.stats, difficulty: 'easy' });
    assert.equal(saves.hard, null);
    await leave();
    await continueButton.tap();
    assert.deepEqual(await current(), { ...easy, stage: 1 });
    await leave();

    await select('normal');
    assert.ok(await continueButton.isVisible());
    await continueButton.tap();
    assert.equal((await current()).mode, 'normal');
    assert.equal((await current()).stage, 1);
    await leave();

    const enemyValues = async mode => {
      await select(mode);
      await start();
      const player = await current();
      assert.equal(player.mode, mode);
      assert.equal(player.level, 1);
      assert.equal(player.tier, 0);
      await page.evaluate(() => {
        const g = window.__game;
        Object.assign(g.G, { waveIdx: 0, spawnLeft: 1, spawnT: 0 });
      });
      await page.waitForFunction(() => window.__game.enemies.length > 0);
      const mob = await page.evaluate(() => new Promise(resolve => {
        const g = window.__game, h = g.hero(), e = g.enemies[0], hp = h.hp;
        const speedCheckStart = { x: e.x, z: e.z, t: g.G.time };
        requestAnimationFrame(() => {
          const speed = Math.hypot(e.x - speedCheckStart.x, e.z - speedCheckStart.z) / (g.G.time - speedCheckStart.t);
          Object.assign(e, { x: h.x, z: h.z + 1, face: Math.PI, state: 'strike', t: 0.08, struck: false });
          requestAnimationFrame(() => resolve({ hp: e.hp, damage: hp - h.hp, speed }));
        });
      }));
      await page.evaluate(() => {
        const g = window.__game;
        Object.assign(g.G, { waveIdx: 2, spawnLeft: 0, waveDelay: 2 });
        for (const e of g.enemies) e.dead = true;
      });
      await page.waitForFunction(() => window.__game.boss().state === 'roar');
      const boss = await page.evaluate(() => {
        const b = window.__game.boss();
        return { hp: b.maxHp, damage: b.dmgMul, speed: b.speed };
      });
      if (mode === 'hard') {
        await page.evaluate(() => {
          const g = window.__game, h = g.hero();
          h.iframe = 0; h.hp = 1;
          g.hurtHero(100, h.x, h.z);
        });
        await page.locator('#btn-retry').tap();
        assert.equal((await current()).mode, 'hard');
      }
      await leave();
      return { mob, boss };
    };
    const normal = await enemyValues('normal');
    const hard = await enemyValues('hard');
    for (const key of ['mob', 'boss']) {
      assert.equal(hard[key].hp, Math.round(normal[key].hp * 1.35));
      assert.ok(Math.abs(hard[key].damage / normal[key].damage - 1.4) < 0.001);
      assert.ok(Math.abs(hard[key].speed / normal[key].speed - 1.15) < 0.02);
    }
    assert.deepEqual(errors, []);
    console.log('Difficulty selection, max stats and weapon growth, separate saves, legacy continue, retry and HARD multipliers passed.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
