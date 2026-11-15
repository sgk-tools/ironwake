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
    await page.locator('#btn-start').waitFor({ timeout: 120000 });
    const report = await page.evaluate(async () => {
      const g = window.__game, h = g.hero();
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const until = async (condition, label) => {
        const end = performance.now() + 8000;
        while (!condition() && performance.now() < end) await frame();
        if (!condition()) throw new Error(`Timed out waiting for ${label} (action ${h.act?.name})`);
      };
      let world;
      g.renderer.render = scene => { world = scene; };
      const tap = (button, mx = 0, my = 0) => {
        g.input.mx = mx; g.input.my = my;
        g.input.press(button); g.input.held.delete(button);
      };

      const routes = [];
      for (const [launcher, follow] of [['heavy', 'AIR_CROSS'], ['back', 'AIR_DROP'], ['direct', 'AIR_SLASH'], ['heavy', 'AIR_DROP']]) {
        g.startGame(0, 1, 0);
        g.G.introT = 99;
        const enemy = {
          type: 'brute', x: 0, z: 1.85, y: 0, vx: 0, vz: 0, vy: 0, face: Math.PI,
          hp: 1000, state: 'walk', t: 0, cd: 999, phase: 0, dead: false, lastHit: -1, pose: {}, spin: 0, slot: 0,
        };
        g.enemies.push(enemy);
        if (launcher === 'direct') {
          tap('attack', 0, -1);
        } else {
          const random = Math.random;
          Math.random = () => 0;
          tap('attack');
          await frame();
          Math.random = random;
          if (h.act?.name !== 'L1') throw new Error('The first slash did not start');
          if (launcher === 'heavy') tap('heavy');
          else tap('attack', 0, -1);
        }
        await frame();
        g.input.mx = g.input.my = 0;
        await until(() => h.act?.def.launcher && h.act.launchTarget === enemy, `${launcher} launcher hit`);
        const opening = h.act.name, before = enemy.hp;
        if (follow === 'AIR_CROSS') tap('attack', 1);
        else if (follow === 'AIR_DROP') tap('heavy', 0, 1);
        else tap('attack');
        await frame();
        g.input.mx = g.input.my = 0;
        await until(() => h.act?.name === follow, follow);
        const action = h.act;
        let airborneHits = 0, knockedDown = false, hp = before;
        while (h.act === action) {
          await frame();
          if (enemy.hp < hp && enemy.y > 0.25) {
            airborneHits++;
            knockedDown ||= enemy.vy < -6;
          }
          hp = enemy.hp;
        }
        routes.push({ launcher, opening, follow, airborneHits, knockedDown, damage: before - enemy.hp });
      }

      g.startGame(0, 1, 0, undefined, 'normal', 'boss');
      g.G.introT = 0;
      await until(() => g.boss()?.state === 'roar', 'boss spawn');
      const boss = g.boss();
      Object.assign(boss, { x: 0, z: 3.6, face: Math.PI });
      Object.assign(h, { x: 0, z: 0, face: 0 });
      g.setBoss('cleave');
      boss.t = 0.119;
      tap('attack');
      await until(() => h.act?.name === 'CLASH_DISARM' && boss.droppedAxe, 'precise disarm');
      const rings = () => world.children.filter(mesh => mesh.geometry?.type === 'RingGeometry');
      const launchColors = rings().map(mesh => mesh.material.color.getHex());
      const dropped = boss.droppedAxe;
      await until(() => dropped.mesh.position.y === 0.32 && dropped.vy < 0, 'axe landing');
      const landingColors = rings().filter(mesh => mesh.position.distanceTo(dropped.mesh.position) < 0.4)
        .map(mesh => mesh.material.color.getHex());
      return { routes, launchColors, landingColors };
    });
    console.log(JSON.stringify(report));
    assert.deepEqual(report.routes.map(route => route.opening), ['RISING_STEP', 'RISING_STEP', 'UPPER', 'RISING_STEP']);
    for (const route of report.routes) {
      assert.ok(route.airborneHits > 0 && route.damage > 0, JSON.stringify(route));
      if (route.follow === 'AIR_CROSS') assert.equal(route.airborneHits, 2);
      if (route.follow === 'AIR_DROP') assert.equal(route.knockedDown, true);
    }
    for (const colors of [report.launchColors, report.landingColors]) {
      assert.ok([0xd4f9ff, 0x4dbbff].every(color => colors.includes(color)));
    }
    assert.deepEqual(errors, []);
    console.log('Launch routes, aerial follow-ups, airborne knockdown and two-phase disarm effects passed.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
