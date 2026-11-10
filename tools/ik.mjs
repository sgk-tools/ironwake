// Offline arm IK for the hero rig: given the body (pelvis/torso/root) and where the sword's hilt and tip
// should be, solve the right arm (and a supporting left hand on the grip) with natural joint limits.
// Output is pose data that src/cuts.js embeds. Uses the same skeleton, Euler orders and sword mount as
// the game (sword mounted in handR at (0,-0.085,0) rotated +90 deg about X; hilt = local y 0.45, tip 2.1).
import * as THREE from 'three';
import fs from 'node:fs';

const SKEL = JSON.parse(fs.readFileSync(new URL('../assets/skeleton.json', import.meta.url)));
const ORDER = { uarmR: 'YZX', uarmL: 'YZX', torso: 'YXZ', pelvis: 'YXZ', handR: 'YZX', handL: 'YZX' };
const PIVOT = 0.55;
const MOUNT = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2, Math.PI / 2, 0)).setPosition(0, -0.085, 0);
const HILT = new THREE.Vector3(0, 0.45, 0), TIP = new THREE.Vector3(0, 2.1, 0), GRIP2 = new THREE.Vector3(0, -0.24, 0);

function local(name, rot) {
  const off = new THREE.Vector3().fromArray(SKEL[name][1]);
  if (!SKEL[name][0]) off.y -= PIVOT;
  const e = new THREE.Euler(rot?.[0] || 0, rot?.[1] || 0, rot?.[2] || 0, ORDER[name] || 'XYZ');
  return new THREE.Matrix4().compose(off, new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 1, 1));
}
export function fk(pose) {
  const inner = new THREE.Matrix4().compose(new THREE.Vector3(0, PIVOT + (pose.rootY || 0), 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rootPitch || 0, pose.rootYaw || 0, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const W = {};
  const chain = (n) => {
    if (W[n]) return W[n];
    const par = SKEL[n][0];
    W[n] = new THREE.Matrix4().multiplyMatrices(par ? chain(par) : inner, local(n, pose[n]));
    return W[n];
  };
  const sw = new THREE.Matrix4().multiplyMatrices(chain('handR'), MOUNT);
  const handL = chain('handL');
  return {
    hilt: HILT.clone().applyMatrix4(sw), tip: TIP.clone().applyMatrix4(sw), grip2: GRIP2.clone().applyMatrix4(sw),
    handL: new THREE.Vector3(0, -0.06, 0).applyMatrix4(handL), elbowR: new THREE.Vector3().setFromMatrixPosition(chain('farmR')),
    normal: new THREE.Vector3(0, 0, 1).transformDirection(sw),   // blade face normal (thickness axis)
  };
}

// joint limits (radians) and preferred values for a natural, slightly bent arm
const VARS = [
  ['uarmR', 0, -3.1, 1.0], ['uarmR', 1, -1.6, 2.6], ['uarmR', 2, -2.4, 0.3],
  ['farmR', 0, -2.3, -0.12],
  ['handR', 0, -0.6, 3.4], ['handR', 1, -1.7, 1.7], ['handR', 2, -0.9, 0.9],
  ['uarmL', 0, -3.0, 1.0], ['uarmL', 1, -1.6, 1.6], ['uarmL', 2, -0.4, 2.0],
  ['farmL', 0, -2.3, -0.1],
];
function cost(pose, tgt) {
  const r = fk(pose);
  let c = r.hilt.distanceToSquared(tgt.hilt) * 4 + r.tip.distanceToSquared(tgt.tip);
  if (tgt.twoHand !== false) c += r.handL.distanceToSquared(r.grip2) * 2;     // left hand on the grip
  const bend = -pose.farmR[0];
  c += 0.02 * Math.max(0, 0.35 - bend) ** 2;                                  // avoid a locked-straight elbow
  if (tgt.elbowBend !== undefined) c += 0.4 * (bend - tgt.elbowBend) ** 2;
  if (tgt.motion) c += 0.8 * r.normal.dot(tgt.motion) ** 2;                  // lead with the edge, not the flat
  if (tgt.prev) for (const [j, i] of VARS) c += 0.015 * (pose[j][i] - tgt.prev[j][i]) ** 2;   // continuity
  return c;
}
export function solve(body, tgt, seed) {
  const base = JSON.parse(JSON.stringify(body));
  for (const [j] of VARS) base[j] = base[j] || [0, 0, 0];
  let best = null, bestC = Infinity;
  const tries = seed ? [seed] : [];
  for (let k = 0; k < (seed ? 8 : 24); k++) {
    const p = JSON.parse(JSON.stringify(base));
    for (const [j, i, lo, hi] of VARS) p[j][i] = (tries[0] && k < 3) ? tries[0][j][i] + (k ? (Math.random() - 0.5) * 0.3 : 0) : lo + Math.random() * (hi - lo);
    let c = cost(p, tgt), step = 0.4;
    for (let it = 0; it < 900 && step > 1e-3; it++) {
      let improved = false;
      for (const [j, i, lo, hi] of VARS) {
        for (const s of [step, -step]) {
          const old = p[j][i]; p[j][i] = Math.min(hi, Math.max(lo, old + s));
          const c2 = cost(p, tgt);
          if (c2 < c) { c = c2; improved = true; } else p[j][i] = old;
        }
      }
      if (!improved) step *= 0.6;
    }
    if (c < bestC) { bestC = c; best = p; }
  }
  const r = fk(best);
  return { pose: best, err: { hilt: +r.hilt.distanceTo(tgt.hilt).toFixed(3), tip: +r.tip.distanceTo(tgt.tip).toFixed(3), handL: +r.handL.distanceTo(r.grip2).toFixed(3) } };
}
