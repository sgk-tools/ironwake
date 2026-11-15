const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.IRONWAKE_CHROME || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const url = process.argv[2] || 'http://localhost:8123/dist/test.html';
  const portrait = { width: 393, height: 852 }, landscape = { width: 852, height: 393 };
  try {
    const page = await browser.newPage(devices['iPhone 15 Pro']);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const guard = page.locator('#orientation-guard');
    const rotate = async blocked => {
      await page.setViewportSize(blocked ? landscape : portrait);
      await guard.waitFor({ state: blocked ? 'visible' : 'hidden' });
      assert.equal(await page.locator('#game-shell').evaluate(el => el.inert), blocked);
    };
    await page.setViewportSize(landscape);
    await page.goto(url);
    await guard.waitFor();
    assert.match(await guard.innerText(), /端末を縦向きに/);
    await page.waitForFunction(() => Boolean(window.__game), undefined, { timeout: 120000 });
    await rotate(false);
    await page.locator('#btn-start').tap();

    const snapshot = () => page.evaluate(() => {
      const g = window.__game, h = g.hero();
      return { state: g.G.state, time: g.G.time, hp: h.hp, x: h.x, action: h.act?.name };
    });
    await rotate(true);
    const frozen = await snapshot();
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(250);
    assert.deepEqual(await snapshot(), frozen);
    await rotate(false);
    await page.waitForFunction(time => window.__game.G.time > time, frozen.time);
    assert.equal((await snapshot()).state, 'play');

    // A portrait-only guard must preserve the campaign result and its continuation.
    await page.evaluate(() => {
      const g = window.__game;
      g.startGame(0, 46, 0, undefined, 'normal', 'boss');
      g.G.introT = 0;
      g.renderer.render = () => {};
    });
    await page.waitForFunction(() => window.__game.boss()?.state === 'roar');
    await page.evaluate(() => {
      const g = window.__game, h = g.hero(), boss = g.boss();
      g.G.mode = 'campaign';
      g.setBoss('walk', 99);
      Object.assign(boss, { hp: 1, x: 0, z: 2 });
      Object.assign(h, { x: 0, z: 0, face: 0 });
      g.startAction('RAGE');
      h.act.t = h.act.def.impact - 0.001;
    });
    const next = page.locator('#btn-next');
    await next.waitFor();
    const result = await page.locator('#result-title').textContent();
    assert.match(result, /第一戦場.*突破/);
    await rotate(true);
    assert.equal(await page.locator('#result-title').textContent(), result);
    await rotate(false);
    const box = await next.boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= portrait.height);
    await next.tap();
    assert.equal(await page.evaluate(() => window.__game.G.stageIdx), 1);

    const desktop = await browser.newPage({ viewport: landscape });
    await desktop.goto(url);
    await desktop.locator('#btn-start').waitFor({ timeout: 120000 });
    assert.equal(await desktop.locator('#orientation-guard').isVisible(), false);
    await desktop.locator('#btn-start').click();
    assert.equal(await desktop.evaluate(() => window.__game.G.state), 'play');
    assert.deepEqual(errors, []);
    console.log('Phone rotation blocks interaction and freezes play, then restores the same result; desktop landscape works.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
