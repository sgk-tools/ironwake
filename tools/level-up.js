const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:8125/dist/test.html';
const saveKey = 'ironwake-save-v1';
const maxStats = { health: 10, power: 10, technique: 10, dodge: 10, awakening: 10 };

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
    assert.equal(buttons.length, 5);
    assert.equal(await dialog.getByRole('heading', { name: 'レベルアップ' }).count(), 1);
    assert.equal(await dialog.locator('.stat-bar span').count(), 50);
    assert.equal(await dialog.locator('.stat-bar .filled').count(), 5);
    await page.waitForFunction(() => document.querySelector('.stat-portrait img').naturalWidth > 0);
    const portrait = await dialog.locator('.stat-portrait').boundingBox();
    const firstStat = await buttons[0].boundingBox();
    assert.ok(portrait.x > firstStat.x + firstStat.width && portrait.y < firstStat.y);
    const freezeState = () => page.evaluate(() => {
      const g = window.__game;
      return [g.G.time, g.renderer.info.render.frame];
    });
    const frozen = await freezeState();
    for (const button of buttons) {
      const box = await button.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 360);
    }
    assert.deepEqual(await freezeState(), frozen);
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForFunction(frame => window.__game.renderer.info.render.frame > frame, frozen[1]);
    assert.equal((await freezeState())[0], frozen[0]);
    for (const button of buttons) {
      const box = await button.boundingBox();
      assert.ok(box.height >= 44 && box.y >= 0 && box.y + box.height <= 393);
    }
    if (process.env.IRONWAKE_LEVEL_UP_PREVIEW) await page.screenshot({ path: process.env.IRONWAKE_LEVEL_UP_PREVIEW });
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
      g.gainExp(50000);
    });
    await dialog.waitFor({ state: 'visible' });
    assert.match(await page.locator('#stat-points').textContent(), /Lv 46.*44/);
    for (const [key, count] of Object.entries({ health: 8, power: 9, technique: 9, dodge: 9, awakening: 9 })) {
      const button = dialog.locator('[data-stat="' + key + '"]');
      for (let i = 0; i < count; i++) await button.tap();
      if (key !== 'awakening') assert.ok(await button.isDisabled(), key);
    }
    await dialog.waitFor({ state: 'hidden' });
    const readStats = () => page.evaluate(() => window.__game.hero().stats);
    assert.deepEqual(await readStats(), maxStats);
    assert.deepEqual(await page.evaluate(() => {
      const h = window.__game.hero();
      return [h.exp, h.maxHp];
    }), [0, 1810]);
    console.log('Lv46, 45 selections, touch input and all Lv10 caps passed');

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
    assert.equal(saved.level, 46);
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
    assert.deepEqual(await readStats(), { health: 1, power: 1, technique: 1, dodge: 1, awakening: 1 });
    for (let i = 0; i < 3; i++) await page.locator('[data-stat="power"]').click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__game.G.stageIdx), 2);
    await page.evaluate(() => window.__game.startGame(0, 11, 0, { health: 2, power: 3, technique: 4, dodge: 5 }));
    assert.deepEqual(await readStats(), { health: 2, power: 3, technique: 4, dodge: 5, awakening: 1 });
    await dialog.waitFor({ state: 'hidden' });
    console.log('Stage checkpoint, retry, continue and legacy save migration passed');

    // One press = one attack, so a string is built by tapping. Every rank stops at its cap (n + 2 cuts; the top
    // rank is no longer unlimited but 14); a plain-slash string ends with the long 0.6 s pause.
    const tapChain = (technique, directional) => page.evaluate(([technique, directional]) => new Promise(resolve => {
      const g = window.__game;
      g.startGame(0, technique, 0, { technique });
      Object.assign(g.G, { introT: 99, substeps: 1 });
      const h = g.hero();
      let key = 'KeyW', nextTap = g.G.time;
      const end = performance.now() + 12000;
      const tick = () => {
        if (h.lightRecovery > 0 || h.lightCount >= 17 || performance.now() >= end) {
          g.input.keys.clear();
          resolve({ hits: h.lightCount, recovery: h.lightRecovery });
          return;
        }
        if (g.G.time >= nextTap) {
          if (directional) { g.input.keys.delete(key); key = key === 'KeyW' ? 'KeyD' : 'KeyW'; g.input.keys.add(key); }
          g.input.press('attack'); g.input.held.delete('attack');
          nextTap = g.G.time + 0.12;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), [technique, directional]);
    for (let rank = 1; rank <= 10; rank++) {
      const cap = rank === 10 ? 14 : rank + 2;
      const plain = await tapChain(rank, false);
      assert.equal(plain.hits, cap, `rank ${rank}: tapped chain stops at its cap`);
      assert.ok(plain.recovery > 0.5, `rank ${rank}: plain string ends with the long pause`);
      // direction changes are links: same cap, but the normal short pause
      const directional = await tapChain(rank, true);
      assert.equal(directional.hits, cap, `rank ${rank}: directional chain stops at its cap`);
      assert.ok(directional.recovery > 0 && directional.recovery < 0.4, `rank ${rank}: linked string ends with the short pause`);
    }
    console.log('Tapped attack chains at all ten technique ranks stop at their caps (plain: long pause, directional: short pause)');

    const dodge = await page.evaluate(() => {
      const g = window.__game;
      return [0.24, 0.27, 0.30, 0.33, 0.36, 0.39, 0.42, 0.44, 0.46, 0.48].map((duration, index) => {
        const dodgeRank = index + 1;
        const canTakeDamage = t => {
          g.startGame(0, dodgeRank, 0, { dodge: dodgeRank });
          const h = g.hero();
          g.startAction('DODGE');
          h.act.t = t;
          g.hurtHero(10, h.x, h.z);
          return h.hp < h.maxHp;
        };
        return [0, duration - 0.005, duration + 0.005].map(canTakeDamage);
      });
    });
    assert.deepEqual(dodge, Array.from({ length: 10 }, () => [false, false, true]));
    const movement = [];
    for (const dodgeRank of [1, 5, 10]) {
      movement.push(await page.evaluate(rank => new Promise(resolve => {
        const g = window.__game;
        g.input.keys.clear();
        g.startGame(0, rank, 0, { dodge: rank });
        g.G.substeps = 1;
        const h = g.hero();
        g.startAction('DODGE');
        let start;
        const tick = () => {
          if (h.z > 0 && start == null) start = h.act?.t;
          if (h.act?.t >= 0.42 || h.act?.name !== 'DODGE') resolve({ start, distance: h.z });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), dodgeRank));
    }
    assert.ok(movement[0].start >= 0.09 && movement[0].start <= 0.14);
    assert.ok(movement[1].start >= 0.05 && movement[1].start <= 0.10);
    assert.ok(movement[2].start > 0 && movement[2].start <= 0.05);
    assert.ok(movement.every(result => Math.abs(result.distance - 5.04) < 0.001));
    const cancels = await page.evaluate(() => new Promise(resolve => {
      const g = window.__game;
      g.startGame(0, 5, 0, { dodge: 5 });
      g.startAction('L1');
      g.input.press('dodge');
      requestAnimationFrame(() => resolve(g.hero().act?.name));
    }));
    assert.equal(cancels, 'DODGE');
    console.log('All ten immunity windows, three movement delays and rank 5 attack cancel passed');

    const counters = [];
    for (const key of [null, 'KeyW', 'KeyS', 'KeyA', 'KeyD']) {
      counters.push(await page.evaluate(key => new Promise(resolve => {
        const g = window.__game;
        g.input.keys.clear();
        g.input.held.clear();
        g.startGame();
        const h = g.hero();
        g.startAction('DODGE');
        if (key) g.input.keys.add(key);
        const attack = document.querySelector('#btn-attack');
        attack.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, pointerType: 'touch' }));
        const tick = () => {
          if (h.act?.t < 0.11) {
            requestAnimationFrame(tick);
            return;
          }
          attack.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, pointerType: 'touch' }));
          g.hurtHero(50, h.x, h.z);
          resolve({ action: h.act?.name, sliding: h.z > 0 && Math.abs(h.x) < 0.001, hp: h.hp });
        };
        requestAnimationFrame(tick);
      }), key));
    }
    assert.deepEqual(counters.map(test => test.action), ['L1', 'DASH', 'UPPER', 'CROSS', 'CROSS2']);
    assert.ok(counters.every(test => test.sliding && test.hp === 1000));
    const awakenedCounter = await page.evaluate(() => new Promise(resolve => {
      const g = window.__game;
      g.input.keys.clear();
      g.input.held.clear();
      g.startGame(0, 10, 0, { dodge: 10 });
      const h = g.hero();
      h.rageT = 10;
      g.startAction('DODGE');
      g.input.press('attack');
      g.input.held.delete('attack');
      const start = g.G.time;
      const tick = () => {
        if (g.G.time - start >= 0.39) {
          g.hurtHero(50, h.x, h.z);
          resolve(h.hp);
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    assert.equal(awakenedCounter, 1000);
    console.log('Five directional dodge attacks and accelerated counters retain roll invulnerability');

    for (const releaseDuringDodge of [false, true]) {
      const heavy = await page.evaluate(early => new Promise(resolve => {
        const g = window.__game;
        g.input.keys.clear();
        g.input.held.clear();
        g.startGame();
        g.G.substeps = 1;
        const dodgeButton = document.querySelector('#btn-dodge');
        const heavyButton = document.querySelector('#btn-heavy');
        const tapEvent = (type, pointerId) => new PointerEvent(type, { pointerId, pointerType: 'touch' });
        dodgeButton.dispatchEvent(tapEvent('pointerdown', 2));
        heavyButton.dispatchEvent(tapEvent('pointerdown', 3));
        dodgeButton.dispatchEvent(tapEvent('pointerup', 2));
        const releaseHeavy = () => heavyButton.dispatchEvent(tapEvent('pointerup', 3));
        const h = g.hero();
        let chargedWhileRolling = false;
        let chargeAfterRoll = false;
        const end = performance.now() + 6000;
        const tick = () => {
          if (h.act?.name === 'DODGE' && h.charge >= 0.15) {
            chargedWhileRolling = true;
            if (early) releaseHeavy();
          }
          if (h.act?.name === 'CHARGE' && h.charge >= 0.55) {
            chargeAfterRoll = true;
            releaseHeavy();
          }
          if (h.act?.name === 'SPIN_IN' || performance.now() >= end) {
            g.input.held.clear();
            resolve({ chargedWhileRolling, chargeAfterRoll, spin: h.act?.name === 'SPIN_IN', power: h.chargeMul });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), releaseDuringDodge);
      assert.deepEqual(heavy, { chargedWhileRolling: true, chargeAfterRoll: !releaseDuringDodge,
        spin: true, power: releaseDuringDodge ? 1 : 1.25 });
    }
    console.log('Heavy starts charging during the roll and releases correctly before or after recovery');

    const strikes = [];
    for (const ranks of [{ power: 1, awakening: 1 }, { power: 5, awakening: 10 }]) {
      strikes.push(await page.evaluate(stats => new Promise(resolve => {
        const g = window.__game;
        g.startGame(0, stats.power + stats.awakening - 1, 0, stats);
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
            const gain = h.rage;
            h.act = null;
            h.rage = 100;
            g.input.press('rage');
            requestAnimationFrame(() => {
              g.input.held.delete('rage');
              resolve({ damage: 1000 - enemy.hp, distance: Math.hypot(enemy.x - h.x - 1, enemy.z - h.z), gain, duration: h.rageT });
            });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), ranks));
    }
    assert.ok(strikes[0].damage > 0 && strikes[1].damage > strikes[0].damage);
    assert.ok(strikes[0].distance > 0 && strikes[1].distance > strikes[0].distance);
    assert.ok(Math.abs(strikes[0].gain - 1.4) < 1e-6 && Math.abs(strikes[1].gain - 2.66) < 1e-6);
    assert.ok(strikes[0].duration >= 11.95 && strikes[0].duration <= 12);
    assert.ok(strikes[1].duration >= 20.95 && strikes[1].duration <= 21);
    assert.deepEqual(errors, []);
    console.log('Damage, knockback, awakening gauge gain and awakening duration passed', strikes);
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
