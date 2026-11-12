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
    const modal = page.getByRole('dialog', { name: 'ボス戦' });
    const level = modal.getByRole('spinbutton', { name: '自分のレベル' });
    await page.locator('#btn-boss-mode').tap();
    const names = ['角の魔騎士', '灰の処刑人', '双角の魔将', '鎖斧の巨人', '黒鉄の魔王'];
    const choices = modal.locator('.boss-options button');
    assert.deepEqual(await choices.allTextContents(), names);
    assert.equal(await level.getAttribute('max'), '46');
    for (const size of [{ width: 667, height: 375 }, { width: 390, height: 780 }]) {
      await page.setViewportSize(size);
      for (const button of [...await choices.all(), modal.getByRole('button', { name: '対戦する' })]) {
        const box = await button.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= size.width && box.y >= 0 && box.y + box.height <= size.height);
      }
    }
    for (const name of names) {
      const choice = modal.getByRole('button', { name });
      await choice.tap();
      assert.equal(await choice.getAttribute('aria-pressed'), 'true');
    }
    await modal.getByRole('button', { name: '閉じる' }).tap();
    await modal.waitFor({ state: 'hidden' });

    const checkpoint = JSON.stringify({ stage: 2, level: 5, exp: 7, stats: { health: 2, power: 2, technique: 2, dodge: 2, awakening: 1 } });
    await page.evaluate(saved => {
      window.__game.renderer.render = () => {};
      localStorage.setItem('ironwake-save-v1', saved);
    }, checkpoint);
    const read = () => page.evaluate(() => {
      const g = window.__game, h = g.hero(), boss = g.boss();
      return { stage: g.G.stageIdx, difficulty: g.G.difficulty, mode: g.G.mode, level: h.level,
        stats: h.stats, hp: boss.maxHp, speed: boss.speed, damage: boss.dmgMul, mobs: g.enemies.length };
    });
    const leave = async () => {
      await page.locator('#btn-pause').tap();
      await page.locator('#btn-quit').tap();
    };
    const profiles = {};
    for (const [mode, selectedLevel, expectedLevel] of [['easy', '7', 7], ['normal', '0', 1], ['hard', '999', 46]]) {
      await page.locator('#btn-boss-mode').tap();
      await modal.getByRole('button', { name: '黒鉄の魔王' }).tap();
      await modal.locator('.difficulty-choice label').filter({ hasText: mode.toUpperCase() }).tap();
      await level.fill(selectedLevel);
      await modal.getByRole('button', { name: '対戦する' }).tap();
      await page.waitForFunction(() => window.__game.boss().state === 'roar');
      assert.ok(!(await page.locator('#stat-select').isVisible()));
      const values = profiles[mode] = await read();
      assert.equal(values.mode, 'boss');
      assert.equal(values.stage, 4);
      assert.equal(values.difficulty, mode);
      assert.equal(values.level, expectedLevel);
      assert.equal(Object.values(values.stats).reduce((a, b) => a + b, 0), expectedLevel + 4);
      assert.equal(values.mobs, 0);
      if (mode !== 'hard') await leave();
    }
    const { easy, normal, hard } = profiles;
    for (const key of ['hp', 'speed', 'damage']) assert.ok(easy[key] < normal[key] && normal[key] < hard[key], key);
    assert.ok(Object.values(hard.stats).every(rank => rank === 10));

    const strike = hp => page.evaluate(hp => {
      const g = window.__game, h = g.hero(), boss = g.boss();
      g.setBoss('walk', 99);
      Object.assign(boss, { hp, x: 0, z: 2 });
      Object.assign(h, { x: 0, z: 0 });
      g.startAction('RAGE');
      h.act.t = h.act.def.impact - 0.001;
    }, hp);
    await strike(hard.hp / 2 + 1);
    await page.waitForFunction(() => window.__game.boss().enraged);
    assert.equal((await read()).mobs, 0);
    assert.equal(await page.evaluate(() => window.__game.G.spawnLeft), 0);
    await strike(1);
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result-title').textContent(), 'ボス討伐');
    assert.ok(!(await page.locator('#btn-next').isVisible()));
    assert.equal(await page.evaluate(() => localStorage.getItem('ironwake-save-v1')), checkpoint);
    assert.equal(await page.evaluate(() => localStorage.getItem('ironwake-save-v1-hard')), null);
    await page.locator('#btn-retry').tap();
    assert.equal((await read()).mode, 'boss');
    assert.equal((await read()).difficulty, 'hard');
    assert.equal((await read()).stage, 4);
    assert.equal((await read()).level, 46);
    await leave();
    await page.locator('#btn-continue').tap();
    const campaign = await read();
    assert.equal(campaign.mode, 'campaign');
    assert.equal(campaign.stage, 2);
    assert.equal(campaign.level, 5);
    assert.deepEqual(errors, []);
    console.log('Five boss choices, all difficulties, level bounds, no reinforcements, result/retry and isolated saves passed.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
