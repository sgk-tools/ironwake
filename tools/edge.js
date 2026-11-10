// For each move, measures how the blade meets its own motion during the hit window:
// |cos| between the blade's face normal (sword local Z = thickness axis) and the tip's direction of travel.
// ~0 = edge leading (cutting), ~1 = flat leading (slapping with the side).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 300, height: 300 } });
  await p.goto('http://localhost:8123/dist/test.html');
  await p.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  const r = await p.evaluate((names) => {
    const g = window.__game, h = g.hero(), V = h.base.constructor, out = {};
    for (const n of names) {
      const act = g.HERO_ACTIONS[n]; if (!act) continue;
      const [a0, a1] = act.active; const vals = [];
      let prevTip = null;
      for (let t = a0; t <= a1 + 1e-6; t += (a1 - a0) / 12) {
        g.debugPose(n, t); h.rig.root.updateMatrixWorld(true);
        const tip = new V(0, 1.6, 0); h.sword.localToWorld(tip);
        const o = new V(0, 0, 0); h.sword.localToWorld(o);
        const nz = new V(0, 0, 1); h.sword.localToWorld(nz); nz.sub(o).normalize();
        if (prevTip) { const vel = tip.clone().sub(prevTip); if (vel.length() > 1e-3) vals.push(Math.abs(vel.normalize().dot(nz))); }
        prevTip = tip;
      }
      out[n] = vals.length ? +(vals.reduce((a, x) => a + x, 0) / vals.length).toFixed(2) : null;
    }
    return out;
  }, JSON.parse(process.argv[2]));
  console.log(JSON.stringify(r)); await b.close();
})();
