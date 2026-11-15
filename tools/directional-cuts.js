const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.IRONWAKE_CHROME || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.argv[2] || 'http://localhost:8123/dist/test.html');
    await page.locator('#btn-start').waitFor({ timeout: 120000 });
    const results = await page.evaluate(async () => {
      const g = window.__game;
      g.renderer.render = () => {};
      const h = g.hero();
      const dirs = [
        ['N', []], ['F', ['ArrowUp']], ['FL', ['ArrowUp', 'ArrowLeft']], ['L', ['ArrowLeft']],
        ['BL', ['ArrowDown', 'ArrowLeft']], ['B', ['ArrowDown']], ['BR', ['ArrowDown', 'ArrowRight']],
        ['R', ['ArrowRight']], ['FR', ['ArrowUp', 'ArrowRight']],
      ];
      const dirKeys = new Map(dirs);
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
      const direction = id => {
        g.input.keys.clear();
        dirKeys.get(id).forEach(code => key('keydown', code));
      };
      function reset() {
        g.input.keys.clear();
        g.input.held.clear();
        g.input.resetStick();
        g.startGame(0, 10, 0, { technique: 10 });
        Object.assign(g.G, { introT: 99, substeps: 1 });
      }
      async function open(id) {
        direction(id);
        key('keydown', 'KeyJ');
        key('keyup', 'KeyJ');
        await frame();
        return h.act?.name;
      }
      async function follow(id, heavy = false, buffered = false) {
        const before = h.act;
        if (!before) return null;
        direction(id);
        const code = heavy ? 'KeyK' : 'KeyJ';
        key('keydown', code);
        key('keyup', code);
        if (buffered) {
          await frame();
          direction('N');
        }
        before.t = before.def.chainAt;
        await frame();
        if (h.act === before && before.def.landingFX && before.hitDone) await frame();
        return h.act !== before ? h.act?.name : null;
      }

      const matrix = [];
      for (const [first] of dirs) {
        for (const [next] of dirs) {
          for (const heavy of [false, true]) {
            reset();
            const opener = await open(first);
            const finisher = await follow(next, heavy);
            matrix.push({ first, next, heavy, opener, finisher, lightCount: h.lightCount });
          }
        }
      }

      reset();
      await open('F');
      const forwardFlip = await follow('F');
      const forwardSlam = await follow('F', false, true);
      reset();
      await open('B');
      const fallingCut = await follow('B');
      const backSlam = await follow('B', false, true);
      const startZ = h.z;
      const enemy = {
        type: 'grunt', x: h.x + 1, y: 0, z: startZ - 2, vx: 0, vy: 0, vz: 0, hp: 1000,
        state: 'hit', t: -1, cd: 99, phase: 0, pose: {}, face: 0, dead: false, lastHit: -1,
      };
      g.enemies.push(enemy);
      let high = 0, hit = false;
      while (h.act?.name === 'BACK_LEAP') {
        high = Math.max(high, h.target.rootY || 0);
        hit ||= h.act.hitDone;
        await frame();
      }
      const rearTravel = h.z - startZ;
      const face = h.face;

      const jumpMoves = [];
      for (const horizontal of [false, true]) {
        reset();
        await open('F');
        if (horizontal) await follow('F');
        const name = await follow('F', true, true);
        const z0 = h.z;
        const target = { ...enemy, x: h.x + 0.95, z: z0 + 2.5, hp: 1000, dead: false, lastHit: -1,
          state: 'hit', t: -1, pose: {}, vx: 0, vy: 0, vz: 0, y: 0 };
        g.enemies.push(target);
        let apex = 0, midairTurn = 0, turn = 0;
        let landed = false;
        while (name && h.act?.name === name) {
          const height = h.target.rootY || 0;
          const angle = Math.abs((horizontal ? h.pose.rootYaw : h.pose.rootPitch) || 0);
          apex = Math.max(apex, height);
          turn = Math.max(turn, angle);
          if (height >= 0.55) midairTurn = Math.max(midairTurn, angle);
          landed ||= h.act.hitDone;
          await frame();
        }
        jumpMoves.push({ name, apex, midairTurn, turn, landed, travel: h.z - z0, damage: 1000 - target.hp });
      }

      reset();
      const attackButton = document.querySelector('#btn-attack');
      const heavyButton = document.querySelector('#btn-heavy');
      const touch = (el, type, pointerId) => el.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch' }));
      g.input.mx = -0.7; g.input.my = 0.7;
      touch(attackButton, 'pointerdown', 2); touch(attackButton, 'pointerup', 2);
      await frame();
      const touchOpener = h.act?.name;
      if (h.act) h.act.t = h.act.def.chainAt;
      touch(heavyButton, 'pointerdown', 3); touch(heavyButton, 'pointerup', 3);
      await frame();
      const touchFinisher = h.act?.name;
      return { matrix, forwardFlip, forwardSlam, fallingCut, backSlam, high, hit, rearTravel, face, targetDamage: 1000 - enemy.hp, jumpMoves, touchOpener, touchFinisher };
    });

    const { matrix } = results;
    assert.equal(matrix.length, 162);
    assert.ok(matrix.every(row => row.opener && row.finisher), JSON.stringify(matrix.filter(row => !row.opener || !row.finisher)));
    assert.ok(matrix.every(row => row.lightCount === (row.heavy ? 0 : 2)));
    const move = (first, next, heavy) => matrix.find(row => row.first === first && row.next === next && row.heavy === heavy).finisher;
    for (const heavy of [false, true]) {
      assert.equal(move('F', 'F', heavy), 'JUMP_FLIP');
      assert.equal(move('L', 'L', heavy), heavy ? 'L4' : 'SPIN1');
      assert.equal(move('R', 'R', heavy), 'REVSPIN');
      assert.equal(move('L', 'R', heavy), 'XCUT_REV');
      assert.equal(move('R', 'L', heavy), 'XCUT');
      assert.equal(move('N', 'F', heavy), 'STEP_CUT');
      assert.equal(move('N', 'B', heavy), heavy ? 'RETREAT_SWEEP' : 'RISING_STEP');
      assert.equal(move('B', 'B', heavy), heavy ? 'FIN2' : 'DOWNCUT');
    }
    assert.equal(move('B', 'N', false), 'AIR_SLASH');
    assert.equal(move('B', 'L', false), 'AIR_CROSS');
    assert.equal(move('B', 'R', false), 'AIR_CROSS');
    assert.equal(move('B', 'F', true), 'AIR_DROP');
    assert.equal(move('N', 'N', true), 'RISING_STEP');
    assert.equal(results.forwardFlip, 'JUMP_FLIP');
    assert.equal(results.forwardSlam, 'L6');
    assert.equal(results.fallingCut, 'DOWNCUT');
    assert.equal(results.backSlam, 'BACK_LEAP');
    assert.ok(results.high >= 1.2 && results.hit && results.targetDamage > 0 && results.rearTravel < -2 && Math.abs(results.face) < 0.01);
    assert.deepEqual(results.jumpMoves.map(move => move.name), ['JUMP_FLIP', 'JUMP_SPIN']);
    assert.deepEqual(results.jumpMoves.map(move => move.landed), [true, false]);
    for (const move of results.jumpMoves) {
      assert.ok(move.apex >= 1.2 && move.midairTurn > Math.PI && move.turn >= 6 && move.travel > 2, JSON.stringify(move));
    }
    assert.ok(results.jumpMoves[1].damage > 0, 'airborne horizontal spin must hit nearby mobs');
    assert.equal(results.touchOpener, 'HIGHCUT');
    assert.equal(results.touchFinisher, 'VAULT');
    assert.deepEqual(errors, []);
    console.log('162 direction/button sequences, buffered jumps, rearward motion, landing impact, both forward jump rotations and touch controls passed.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
