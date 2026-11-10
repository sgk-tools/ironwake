// Generates src/cuts.js: natural sword cuts solved with tools/ik.mjs.
// Each cut is a sequence: cocked wind-up (elbow bent, blade by the shoulder) -> the arm extends into the
// strike -> contact in front -> wrist turns over and the blade carries past -> the arm folds back across
// the body (follow-through) -> recovery. Positions are in the hero's body frame (faces +Z, right = -X).
import * as THREE from 'three';
import fs from 'node:fs';
import { solve } from './ik.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const stanceBack = { thighR: [0.25, 0, -0.12], shinR: [0.4, 0, 0], thighL: [-0.45, 0, 0.12], shinL: [0.45, 0, 0], rootY: -0.12 };
const stanceLunge = { thighR: [0.4, 0, -0.15], shinR: [0.55, 0, 0], thighL: [-0.8, 0, 0.15], shinL: [0.8, 0, 0], footL: [0.15, 0, 0], rootY: -0.26 };
const stanceLow = { thighR: [-0.9, 0, -0.22], shinR: [1.5, 0, 0], thighL: [0.25, 0, 0.3], shinL: [1.1, 0, 0], rootY: -0.5 };
const stanceBrace = { thighR: [-0.65, 0, -0.38], shinR: [0.95, 0, 0], thighL: [0.45, 0, 0.38], shinL: [0.85, 0, 0], footR: [-0.25, 0, 0], rootY: -0.42 };
const body = (yaw, pitch, legs, extra = {}) => ({
  pelvis: [0, yaw * 0.45, 0], torso: [pitch, yaw * 0.55, 0], head: [-pitch * 0.5, -yaw * 0.45, 0],
  cloak: [0.45 + Math.abs(yaw) * 0.25, 0, -yaw * 0.2], ...legs, ...extra,
});
const mirror = (v) => V(-v.x, v.y, v.z);

// key: [time, ease, body, hilt, tip, extraPoseFields]
const R2L = [   // horizontal cut, right to left, chest height
  [0.0, null, body(-0.75, 0.1, stanceBack), V(-0.42, 1.38, -0.08), V(-1.25, 1.75, -1.65)],
  [0.1, 'out', body(-0.8, 0.12, stanceBack), V(-0.45, 1.4, -0.12), V(-1.2, 1.85, -1.7)],
  [0.14, 'in', body(-0.35, 0.15, stanceLunge), V(-0.6, 1.25, 0.32), V(-2.15, 1.3, 0.75)],
  [0.18, 'lin', body(0.2, 0.2, stanceLunge), V(-0.05, 1.18, 0.62), V(0.05, 1.15, 2.7)],
  [0.24, 'out', body(0.75, 0.2, stanceLunge), V(0.45, 1.15, 0.3), V(2.15, 1.1, -0.25)],
  [0.33, 'out', body(0.9, 0.12, stanceLunge), V(0.38, 1.32, 0.0), V(1.2, 1.7, -1.45)],
];
const HIGH_R_TO_LOW_L = [
  [0.0, null, body(-0.6, -0.05, stanceBack), V(-0.35, 1.8, -0.05), V(-0.85, 2.6, -1.25)],
  [0.1, 'out', body(-0.65, -0.08, stanceBack), V(-0.32, 1.85, -0.08), V(-0.8, 2.7, -1.25)],
  [0.15, 'in', body(-0.25, 0.1, stanceLunge), V(-0.42, 1.6, 0.4), V(-1.6, 2.35, 1.3)],
  [0.2, 'lin', body(0.25, 0.3, stanceLunge), V(-0.02, 1.15, 0.65), V(0.35, 0.85, 2.6)],
  [0.26, 'out', body(0.7, 0.4, stanceLunge), V(0.42, 0.85, 0.32), V(1.85, 0.2, 0.45)],
  [0.35, 'out', body(0.8, 0.3, stanceLunge), V(0.35, 0.95, 0.0), V(1.25, 0.45, -1.4)],
];
const LOW_R_TO_HIGH_L = [
  [0.0, null, body(-0.55, 0.3, stanceLow), V(-0.4, 0.78, -0.15), V(-1.05, 0.25, -1.75)],
  [0.1, 'out', body(-0.6, 0.32, stanceLow), V(-0.42, 0.75, -0.18), V(-1.0, 0.2, -1.8)],
  [0.15, 'in', body(-0.2, 0.2, stanceLunge), V(-0.48, 0.92, 0.45), V(-1.9, 0.55, 1.05)],
  [0.2, 'lin', body(0.3, 0.0, stanceLunge), V(0.0, 1.3, 0.6), V(0.45, 1.95, 2.35)],
  [0.26, 'out', body(0.7, -0.15, stanceBack), V(0.38, 1.7, 0.2), V(1.55, 2.6, -0.6)],
  [0.35, 'out', body(0.75, -0.1, stanceBack), V(0.3, 1.75, 0.0), V(0.85, 2.55, -1.3)],
];
const LOW_SWEEP = [
  [0.0, null, body(-0.7, 0.4, stanceLow), V(-0.5, 0.72, -0.2), V(-1.6, 0.55, -1.45)],
  [0.1, 'out', body(-0.75, 0.42, stanceLow), V(-0.52, 0.7, -0.22), V(-1.55, 0.5, -1.5)],
  [0.15, 'in', body(-0.3, 0.42, stanceLow), V(-0.62, 0.66, 0.35), V(-2.15, 0.48, 0.8)],
  [0.2, 'lin', body(0.25, 0.42, stanceLow), V(-0.02, 0.64, 0.62), V(0.05, 0.45, 2.65)],
  [0.27, 'out', body(0.8, 0.4, stanceLow), V(0.5, 0.66, 0.25), V(2.1, 0.5, -0.35)],
  [0.36, 'out', body(0.9, 0.35, stanceLow), V(0.4, 0.8, 0.0), V(1.3, 0.95, -1.4)],
];
// level spin: arm reaches out to the right with a soft elbow, blade rising slightly toward the tip
const SPIN_HILT = V(-0.68, 1.32, 0.32), SPIN_TIP = V(-2.28, 1.58, 0.85);
const spinBody = body(-0.15, 0.08, stanceLunge);

// Dense path: between waypoints the hilt moves on a straight line and the blade direction turns about the
// vertical axis (shortest way) while tilting, so the cut follows a clean arc; each sample is solved by IK
// seeded from (and kept close to) the previous one, so joint interpolation cannot take detours.
const ease = { io: t => t * t * (3 - 2 * t), out: t => 1 - (1 - t) ** 3, in: t => t * t, lin: t => t };
function lerpBody(a, b, u) {
  const o = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    if (Array.isArray(x) || Array.isArray(y)) { const xa = x || [0, 0, 0], ya = y || [0, 0, 0]; o[k] = xa.map((v, i) => v + (ya[i] - v) * u); }
    else o[k] = (x || 0) + ((y || 0) - (x || 0)) * u;
  }
  return o;
}
function dirLerp(d0, d1, u) {
  const a0 = Math.atan2(d0.x, d0.z), a1 = Math.atan2(d1.x, d1.z);
  let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  const h0 = Math.hypot(d0.x, d0.z), h1 = Math.hypot(d1.x, d1.z);
  const el0 = Math.atan2(d0.y, h0), el1 = Math.atan2(d1.y, h1);
  const a = a0 + da * u, el = el0 + (el1 - el0) * u;
  return V(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el));
}
function solveSeq(seq, mirrorX = false, steps = 4) {
  const W = seq.map(([t, e, b, hilt, tip, extra]) => {
    const h = mirrorX ? mirror(hilt) : hilt, tp = mirrorX ? mirror(tip) : tip;
    const bb = mirrorX ? { ...b, pelvis: [b.pelvis[0], -b.pelvis[1], 0], torso: [b.torso[0], -b.torso[1], 0], head: [b.head[0], -b.head[1], 0], cloak: [b.cloak[0], 0, -b.cloak[2]] } : b;
    return { t, e: e || 'io', b: bb, h, d: tp.clone().sub(h), len: tp.distanceTo(h), extra };
  });
  let prev = null; const out = []; const errs = [];
  const emit = (t, b, h, d, len, e, extra) => {
    const s = solve(b, { hilt: h, tip: h.clone().add(d.clone().normalize().multiplyScalar(len)), prev }, prev);
    prev = s.pose; errs.push(s.err.tip);
    const p = {};
    for (const [k, v] of Object.entries(s.pose)) p[k] = Array.isArray(v) ? v.map(x => +x.toFixed(3)) : +(+v).toFixed(3);
    out.push([+t.toFixed(4), p, e, extra || null]);
  };
  emit(W[0].t, W[0].b, W[0].h, W[0].d, W[0].len, null, W[0].extra);
  for (let i = 1; i < W.length; i++) {
    const A = W[i - 1], B = W[i];
    for (let k = 1; k <= steps; k++) {
      const u = k / steps, ue = ease[B.e](u);
      emit(A.t + (B.t - A.t) * u, lerpBody(A.b, B.b, ue), A.h.clone().lerp(B.h, ue), dirLerp(A.d, B.d, ue), A.len + (B.len - A.len) * ue, 'lin', B.extra);
    }
  }
  return { keys: out, maxTipErr: Math.max(...errs) };
}

const R = {};
const report = [];
const add = (name, seq, mirrorX) => { const s = solveSeq(seq, mirrorX); R[name] = s.keys; report.push(`${name}: max tip error ${s.maxTipErr.toFixed(3)} m`); };
add('R2L', R2L);
add('L2R', R2L, true);
add('HIGH_R_LOW_L', HIGH_R_TO_LOW_L);
add('HIGH_L_LOW_R', HIGH_R_TO_LOW_L, true);
add('LOW_R_HIGH_L', LOW_R_TO_HIGH_L);
add('LOW_L_HIGH_R', LOW_R_TO_HIGH_L, true);
add('LOW_SWEEP', LOW_SWEEP);
add('SPIN', [[0, null, spinBody, SPIN_HILT, SPIN_TIP]]);
add('SPIN_REV', [[0, null, spinBody, SPIN_HILT, SPIN_TIP]], true);
// heavy release: from the wind-up behind the hip, the blade swings out low then rises to the spin line
add('RELEASE', [
  [0.06, 'out', body(-0.55, 0.25, stanceLunge), V(-0.55, 0.95, -0.35), V(-1.85, 0.75, -1.35)],
  [0.12, 'io', body(-0.3, 0.15, stanceLunge), V(-0.66, 1.18, 0.05), V(-2.25, 1.3, -0.2)],
]);
// heavy follow-through after the turn: the blade carries on across the front and the arm folds in
add('HEAVY_FOLLOW', [
  [0.06, 'out', body(0.6, 0.35, stanceBrace), V(0.35, 1.05, 0.45), V(1.9, 0.95, 0.9)],
  [0.18, 'out', body(0.85, 0.35, stanceBrace), V(0.42, 1.12, 0.12), V(1.75, 1.05, -0.9)],
]);
fs.writeFileSync(new URL('../src/cuts.js', import.meta.url),
  '// Generated by tools/gen_cuts.mjs (arm poses solved by IK). Do not edit by hand.\n' +
  '// Each entry: [time, pose, ease, extra]\nexport const CUTS = ' + JSON.stringify(R) + ';\n');
console.log(report.join('\n'));
