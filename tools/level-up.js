const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:8125/dist/test.html';
const saveKey = 'ironwake-save-v1';
const maxStats = { health: 5, power: 5, technique: 5, dodge: 5 };

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.IRONWAKE_CHROME || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 360 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.locator('#title').waitFor({ state: 'visible', timeout: 120000 });
    await page.locator('#btn-start').tap();
    await page.evaluate(() => window.__game.gainExp(24));
    const dialog = page.locator('#stat-select');
    await dialog.waitFor({ state: 'visible' });
    const buttons = await dialog.locator('button:not(:disabled)').all();
    assert.equal(buttons.length, 4);
    const frozen = await page.evaluate(() => window.__game.G.time);
    for (const button of buttons) {
      const box = await button.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 360);
    }
    assert.equal(await page.evaluate(() => window.__game.G.time), frozen);
    await page.keyboard.press('Space');
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => {
      const h = window.__game.hero();
      return [h.level, h.stats.health, h.maxHp, h.hp, h.act?.name];
    }), [2, 2, 1090, 1090, undefined]);
    console.log('Modal, frozen combat, narrow touch layout, keyboard and health passed');

    // Combat assertions use the game loop without software WebGL drawing every frame.
    await page.evaluate(() => {
      const g = window.__game;
      g.renderer.render = () => {};
      g.gainExp(5000);
    });
    await dialog.waitFor({ state: 'visible' });
    assert.match(await page.locator('#stat-points').textContent(), /Lv 17.*15/);
    for (const [key, count] of Object.entries({ health: 3, power: 4, technique: 4, dodge: 4 })) {
      const button = dialog.locator('[data-stat="' + key + '"]');
      for (let i = 0; i < count; i++) await button.tap();
      if (key !== 'dodge') assert.ok(await button.isDisabled(), key);
    }
    await dialog.waitFor({ state: 'hidden' });
    const readStats = () => page.evaluate(() => window.__game.hero().stats);
    assert.deepEqual(await readStats(), maxStats);
    assert.deepEqual(await page.evaluate(() => {
      const h = window.__game.hero();
      return [h.exp, h.maxHp];
    }), [0, 1360]);
    console.log('Lv17, 16 selections, touch input and all Lv5 caps passed');

    await page.evaluate(() => {
      const g = window.__game;
      Object.assign(g.G, { waveIdx: 2, spawnLeft: 0, waveDelay: 2, substeps: 3 });
    });
    await page.waitForFunction(() => window.__game.boss()?.state === 'roar');
    await page.evaluate(() => {
      const g = window.__game;
      g.setBoss('dead');
      Object.assign(g.boss(), { hp: 0, dead: true, deadT: 3.2 });
    });
    await page.locator('#btn-next').click();
    assert.deepEqual(await readStats(), maxStats);
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
    assert.equal(saved.stage, 1);
    assert.equal(saved.level, 17);
    assert.deepEqual(saved.stats, maxStats);
    const lose = async () => {
      await page.evaluate(() => {
        const g = window.__game;
        const h = g.hero();
        h.hp = 1;
        g.hurtHero(10, h.x, h.z);
      });
      await page.locator('#result').waitFor({ state: 'visible' });
    };
    await lose();
    await page.locator('#btn-retry').click();
    assert.deepEqual(await readStats(), maxStats);
    await lose();
    await page.locator('#btn-title').click();
    await page.locator('#btn-continue').click();
    assert.deepEqual(await readStats(), maxStats);
    await lose();
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ stage: 2, level: 4, exp: 2 })), saveKey);
    await page.locator('#btn-title').click();
    await page.locator('#btn-continue').click();
    await dialog.waitFor({ state: 'visible' });
    assert.match(await page.locator('#stat-points').textContent(), /Lv 4.*3/);
    assert.deepEqual(await readStats(), { health: 1, power: 1, technique: 1, dodge: 1 });
    for (let i = 0; i < 3; i++) await page.locator('[data-stat="power"]').click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__game.G.stageIdx), 2);
    console.log('Stage checkpoint, retry, continue and legacy save migration passed');

    for (let rank = 1; rank <= 5; rank++) {
      const chain = await page.evaluate(technique => new Promise(resolve => {
        const g = window.__game;
        g.startGame(0, technique, 0, { technique });
        Object.assign(g.G, { introT: 99, substeps: 1 });
        g.input.press('attack');
        const h = g.hero();
        const end = performance.now() + 8000;
        const tick = () => {
          if (h.lightRecovery > 0 || h.lightCount >= 9 || performance.now() >= end) {
            g.input.held.delete('attack');
            resolve({ hits: h.lightCount, recovery: h.lightRecovery });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), rank);
      assert.equal(chain.hits, rank === 5 ? 9 : rank + 2);
      assert.equal(chain.recovery > 0, rank < 5);
    }
    console.log('Held attack chains at all five technique ranks passed');

    const dodge = await page.evaluate(() => {
      const g = window.__game;
      return [1, 2, 3, 4, 5].map(dodgeRank => {
        const canTakeDamage = t => {
          g.startGame(0, dodgeRank, 0, { dodge: dodgeRank });
          const h = g.hero();
          g.startAction('DODGE');
          h.act.t = t;
          g.hurtHero(10, h.x, h.z);
          return h.hp < h.maxHp;
        };
        return [canTakeDamage(0), canTakeDamage(0.07), canTakeDamage(0.13), canTakeDamage(0.4)];
      });
    });
    assert.deepEqual(dodge, [
      [true, true, false, true], [true, true, false, true], [true, false, false, true],
      [true, false, false, true], [false, false, false, true],
    ]);
    const cancels = await page.evaluate(() => new Promise(resolve => {
      const g = window.__game;
      g.startGame(0, 5, 0, { dodge: 5 });
      g.startAction('L1');
      g.input.press('dodge');
      requestAnimationFrame(() => resolve(g.hero().act?.name));
    }));
    assert.equal(cancels, 'DODGE');
    console.log('Dodge windows, rank 5 immediate invulnerability and attack cancel passed');

    const strikes = [];
    for (const power of [1, 5]) {
      strikes.push(await page.evaluate(powerRank => new Promise(resolve => {
        const g = window.__game;
        g.startGame(0, powerRank, 0, { power: powerRank });
        Object.assign(g.G, { introT: 99, substeps: 1 });
        const h = g.hero();
        const enemy = {
          type: 'grunt', x: h.x + 1, z: h.z, y: 0, hp: 1000, vx: 0, vz: 0, vy: 0, face: 0,
          state: 'walk', t: 0, cd: 99, phase: 0, dead: false, lastHit: -1, pose: {}, spin: 0, slot: 0,
        };
        g.enemies.push(enemy);
        g.startAction('RAGE');
        h.act.t = h.act.def.impact - 0.001;
        const stop = g.G.time + 0.25;
        const end = performance.now() + 5000;
        const tick = () => {
          if (g.G.time >= stop || performance.now() >= end) {
            resolve({ damage: 1000 - enemy.hp, distance: Math.hypot(enemy.x - h.x - 1, enemy.z - h.z) });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), power));
    }
    assert.ok(strikes[0].damage > 0 && strikes[1].damage > strikes[0].damage);
    assert.ok(strikes[0].distance > 0 && strikes[1].distance > strikes[0].distance);
    assert.deepEqual(errors, []);
    console.log('Damage and actual enemy knockback distance increased', strikes);
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
