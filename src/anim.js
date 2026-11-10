// Procedural pose library for the segmented humanoid rig.
// Conventions (three.js, character faces +Z, right side is -X):
//   arm/leg rotation.x < 0 swings the limb forward, shoulders use Euler order 'YZX'
//   (y = horizontal swing, z = raise sideways: negative raises the right arm, positive the left).
//   Weapon blade direction in hand space = (0, -sin θ, cos θ) with θ = sum of x rotations down the arm.
export const JOINTS = ['pelvis', 'torso', 'head', 'cloak', 'uarmR', 'uarmL', 'farmR', 'farmL', 'handR', 'handL',
  'thighR', 'thighL', 'shinR', 'shinL', 'footR', 'footL'];
export const ORDER = { uarmR: 'YZX', uarmL: 'YZX', torso: 'YXZ', pelvis: 'YXZ', handR: 'YZX', handL: 'YZX' };
const NUM = ['rootY', 'rootPitch', 'rootYaw', 'rootRoll'];

export const ease = {
  lin: t => t,
  io: t => t * t * (3 - 2 * t),
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t,
};

export function lerpPose(a, b, t, out = {}) {
  for (const k of JOINTS) {
    const va = a[k], vb = b[k];
    if (!va && !vb) { delete out[k]; continue; }
    const x = va || ZERO, y = vb || ZERO;
    const o = out[k] || (out[k] = [0, 0, 0]);
    o[0] = x[0] + (y[0] - x[0]) * t; o[1] = x[1] + (y[1] - x[1]) * t; o[2] = x[2] + (y[2] - x[2]) * t;
  }
  for (const k of NUM) out[k] = (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * t;
  return out;
}
const ZERO = [0, 0, 0];

// keys: [[time, pose, easeName]] sorted by time; ease applies to the segment ending at that key
export function sampleKeys(keys, t, out = {}) {
  if (t <= keys[0][0]) return lerpPose(keys[0][1], keys[0][1], 0, out);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, p0] = keys[i - 1], [t1, p1, e] = keys[i];
      const u = (t - t0) / (t1 - t0 || 1);
      return lerpPose(p0, p1, (ease[e] || ease.io)(u), out);
    }
  }
  const last = keys[keys.length - 1][1];
  return lerpPose(last, last, 0, out);
}

export function smoothPose(cur, target, k) {
  for (const j of JOINTS) {
    const t = target[j];
    if (!t) { if (cur[j]) { cur[j][0] *= 1 - k; cur[j][1] *= 1 - k; cur[j][2] *= 1 - k; } continue; }
    const c = cur[j] || (cur[j] = [t[0], t[1], t[2]]);
    c[0] += (t[0] - c[0]) * k; c[1] += (t[1] - c[1]) * k; c[2] += (t[2] - c[2]) * k;
  }
  for (const n of NUM) cur[n] = (cur[n] || 0) + ((target[n] || 0) - (cur[n] || 0)) * k;
  return cur;
}

const P = (o) => o;

// ------------------------------------------------------------------ hero
// Sword is mounted in handR so that θ = 0 points the blade straight forward.
export const HERO = {
  idle: P({
    pelvis: [0, 0.35, 0], torso: [0.12, -0.25, 0], head: [-0.05, -0.1, 0],
    uarmR: [-0.55, 0.15, -0.2], farmR: [-0.75, 0, 0], handR: [1.55, 0, 0],
    uarmL: [-0.75, 0.25, 0.25], farmL: [-0.95, 0, 0], handL: [0.3, 0, 0],
    thighR: [0.25, 0, -0.08], shinR: [0.35, 0, 0], footR: [-0.2, 0, 0],
    thighL: [-0.45, 0, 0.12], shinL: [0.45, 0, 0], footL: [0.0, 0, 0],
    cloak: [0.12, 0, 0], rootY: -0.07,
  }),
};

export function heroRun(phase, amt, out = {}) {
  const s = Math.sin(phase), c = Math.cos(phase);
  const p = {
    pelvis: [0, 0.15 * s, 0], torso: [0.32, -0.2 * s, 0], head: [-0.2, 0.1 * s, 0],
    uarmR: [0.45 + 0.1 * s, 0, -0.25], farmR: [-0.35, 0, 0], handR: [2.45, 0, 0],
    uarmL: [-0.7 * s, 0, 0.18], farmL: [-0.7 - 0.3 * Math.max(0, s), 0, 0],
    thighR: [-0.95 * s - 0.15, 0, 0], thighL: [0.95 * s - 0.15, 0, 0],
    shinR: [0.35 + 0.95 * Math.max(0, -c), 0, 0], shinL: [0.35 + 0.95 * Math.max(0, c), 0, 0],
    footR: [0.25 * s, 0, 0], footL: [-0.25 * s, 0, 0],
    cloak: [0.65 + 0.12 * Math.sin(phase * 2), 0, 0.06 * s],
    rootY: -0.05 + 0.07 * Math.abs(c),
  };
  return lerpPose(HERO.idle, p, amt, out);
}

// shared horizontal sweep arm: right arm raised to the side, blade continuing outward along the arm
const sweepArm = (swing, torsoYaw, lean = 0.15, raise = -1.25) => ({
  pelvis: [0, torsoYaw * 0.4, 0], torso: [lean, torsoYaw * 0.6, 0], head: [0, -torsoYaw * 0.5, 0],
  uarmR: [-0.1, swing, raise], farmR: [-0.15, 0, 0], handR: [1.45, 0, 0],
  uarmL: [-0.4, swing * 0.6, 0.6], farmL: [-0.9, 0, 0],
  thighR: [-0.35, 0, -0.15], shinR: [0.4, 0, 0], thighL: [0.15, 0, 0.15], shinL: [0.25, 0, 0],
  cloak: [0.5, 0, -torsoYaw * 0.2], rootY: -0.15,
});

// spin arm: arm straight out from the shoulder, blade continuing the arm almost level with the ground
// arm lifted a little above the shoulder line so the whole blade rises slightly from hilt to tip
const spinArm = (swing, torsoYaw, crouch = -0.3) => ({ ...sweepArm(swing, torsoYaw, 0.0, -1.78), farmR: [0, 0, 0], handR: [1.57, 0, 0], rootY: crouch });

export const HERO_ACTIONS = {
  // horizontal slash, right to left
  L1: {
    dur: 0.46, active: [0.1, 0.24], chainAt: 0.26, dmg: 24, kb: 5, lunge: [0.04, 0.22, 5.5], sound: 'swing', type: 'sweep',
    keys: [
      [0, sweepArm(0.15, -0.45)],
      [0.1, sweepArm(-0.1, -0.5), 'out'],
      [0.24, { ...sweepArm(2.3, 0.6), rootYaw: 0.4 }, 'out'],
      [0.46, HERO.idle, 'io'],
    ],
  },
  // backhand, left to right
  L2: {
    dur: 0.48, active: [0.11, 0.25], chainAt: 0.28, dmg: 26, kb: 5, lunge: [0.05, 0.23, 5.5], sound: 'swing', type: 'sweep',
    keys: [
      [0, { ...sweepArm(1.8, 0.45), rootYaw: 0.3 }],
      [0.11, { ...sweepArm(2.0, 0.5), rootYaw: 0.38 }, 'out'],
      [0.25, { ...sweepArm(-0.1, -0.4), rootYaw: -0.22 }, 'out'],
      [0.48, HERO.idle, 'io'],
    ],
  },
  // overhead slam with ground shockwave
  L3: {
    dur: 0.7, heavy: true, active: [0.28, 0.36], impact: 0.34, chainAt: 0.5, dmg: 42, kb: 7, up: 6, radius: 2.6, lunge: [0.1, 0.32, 6], sound: 'swingHeavy', type: 'slam',
    keys: [
      [0, HERO.idle],
      [0.2, {
        pelvis: [0, 0, 0], torso: [-0.35, 0, 0], head: [0.1, 0, 0],
        uarmR: [-2.9, 0, -0.15], farmR: [-0.6, 0, 0], handR: [0.05, 0, 0],
        uarmL: [-2.7, 0, 0.2], farmL: [-0.7, 0, 0],
        thighR: [-0.5, 0, 0], shinR: [0.4, 0, 0], thighL: [0.2, 0, 0], shinL: [0.2, 0, 0],
        cloak: [0.3, 0, 0], rootY: 0.05,
      }, 'out'],
      [0.34, {
        pelvis: [0.2, 0, 0], torso: [0.65, 0, 0], head: [-0.4, 0, 0],
        uarmR: [-0.75, 0, -0.1], farmR: [-0.15, 0, 0], handR: [0.35, 0, 0],
        uarmL: [-0.85, 0, 0.15], farmL: [-0.3, 0, 0],
        thighR: [-0.9, 0, 0], shinR: [0.9, 0, 0], thighL: [0.5, 0, 0], shinL: [0.6, 0, 0],
        cloak: [0.5, 0, 0], rootY: -0.38,
      }, 'in'],
      [0.52, {
        pelvis: [0.2, 0, 0], torso: [0.6, 0, 0], head: [-0.4, 0, 0],
        uarmR: [-0.75, 0, -0.1], farmR: [-0.15, 0, 0], handR: [0.35, 0, 0],
        uarmL: [-0.85, 0, 0.15], farmL: [-0.3, 0, 0],
        thighR: [-0.9, 0, 0], shinR: [0.9, 0, 0], thighL: [0.5, 0, 0], shinL: [0.6, 0, 0],
        cloak: [0.3, 0, 0], rootY: -0.36,
      }],
      [0.7, HERO.idle, 'io'],
    ],
  },
  // charged spin, full 360 degrees
  SPIN: {
    dur: 0.78, active: [0.2, 0.52], chainAt: 0.62, dmg: 36, kb: 9, lunge: [0.2, 0.5, 3], sound: 'swingHeavy', type: 'sweep',
    keys: [
      [0, HERO.idle],
      [0.18, { ...sweepArm(-0.2, -0.6, 0.3), rootYaw: 0.18, rootY: -0.3 }, 'out'],
      [0.52, { ...sweepArm(0.6, 0.3, 0.25), rootYaw: 5.36, rootY: -0.25 }, 'lin'],
      [0.78, { ...HERO.idle, rootYaw: 2 * Math.PI }, 'io'],
    ],
  },

  // ---- directional variations ----
  // attack while running: lunging thrust
  DASH: {
    dur: 0.56, active: [0.15, 0.32], chainAt: 0.34, dmg: 30, kb: 7, lunge: [0.06, 0.32, 11], sound: 'swing', type: 'thrust', reach: 0.35,
    keys: [
      [0, HERO.idle],
      [0.13, { pelvis: [0, -0.4, 0], torso: [0.1, -0.5, 0], head: [0, 0.4, 0], uarmR: [0.55, 0, -0.25], farmR: [-1.6, 0, 0], handR: [1.05, 0, 0],
        uarmL: [-0.6, 0, 0.3], farmL: [-1.0, 0, 0], thighR: [0.4, 0, 0], shinR: [0.6, 0, 0], thighL: [-0.7, 0, 0], shinL: [0.4, 0, 0], cloak: [0.5, 0, 0], rootY: -0.25 }, 'out'],
      [0.3, { pelvis: [0.15, 0.3, 0], torso: [0.45, 0.3, 0], head: [-0.3, -0.2, 0], uarmR: [-1.55, 0, -0.05], farmR: [0, 0, 0], handR: [1.0, 0, 0],
        uarmL: [0.4, 0, 0.3], farmL: [-0.3, 0, 0], thighR: [-1.0, 0, 0], shinR: [0.8, 0, 0], thighL: [0.7, 0, 0], shinL: [0.3, 0, 0], cloak: [1.1, 0, 0], rootY: -0.35 }, 'out'],
      [0.56, HERO.idle, 'io'],
    ],
  },
  // stick pulled back during a combo: turn and launch upward
  UPPER: {
    dur: 0.62, active: [0.15, 0.3], chainAt: 0.36, dmg: 28, kb: 2, up: 9, heavy: true, sound: 'swingHeavy', type: 'sweep',
    keys: [
      [0, { ...HERO.idle, uarmR: [0.5, 0, -0.3], farmR: [-0.3, 0, 0], handR: [2.3, 0, 0], torso: [0.45, 0, 0], rootY: -0.32 }],
      [0.13, { ...HERO.idle, uarmR: [0.6, 0, -0.3], farmR: [-0.3, 0, 0], handR: [2.3, 0, 0], torso: [0.5, 0, 0], thighR: [-0.8, 0, 0], shinR: [1.2, 0, 0], rootY: -0.4 }, 'out'],
      [0.3, { pelvis: [-0.15, 0, 0], torso: [-0.35, 0, 0], head: [-0.3, 0, 0], uarmR: [-2.7, 0, -0.2], farmR: [-0.2, 0, 0], handR: [1.7, 0, 0],
        uarmL: [-2.2, 0, 0.3], farmL: [-0.5, 0, 0], thighR: [0.1, 0, 0], thighL: [-0.3, 0, 0], shinL: [0.2, 0, 0], cloak: [0.8, 0, 0], rootY: 0.12 }, 'out'],
      [0.62, HERO.idle, 'io'],
    ],
  },
  // stick to the side during a combo: high diagonal cut down across the body
  CROSS: {
    dur: 0.5, active: [0.1, 0.25], chainAt: 0.3, dmg: 30, kb: 5, lunge: [0.05, 0.22, 5], sound: 'swing', type: 'sweep',
    keys: [
      [0, { ...sweepArm(0.2, -0.5, -0.2, -2.3), rootRoll: 0.15 }],
      [0.1, { ...sweepArm(0.0, -0.55, -0.2, -2.4), rootRoll: 0.2 }, 'out'],
      [0.25, { ...sweepArm(1.5, 0.45, 0.25, -1.0), rootYaw: 0.25, rootRoll: -0.1, rootY: -0.25 }, 'out'],
      [0.5, HERO.idle, 'io'],
    ],
  },
  // ---- held heavy: spin in, loop while held, spin out ----
  // charge: hold heavy to wind up (blade dragged low behind), release to unleash the spin
  CHARGE: {
    dur: 99,
    keys: [[0, HERO.idle], [0.25, { ...spinArm(-0.6, -0.9, -0.4), torso: [0.25, -0.75, 0], uarmL: [-0.4, 0, 0.9], farmL: [-0.6, 0, 0], thighR: [-0.6, 0, -0.2], shinR: [0.9, 0, 0], thighL: [0.3, 0, 0.25], shinL: [0.6, 0, 0], cloak: [0.4, 0, 0.2], rootYaw: 0.18 }, 'out']],
  },
  SPIN_IN: {
    dur: 0.1, active: [-1, -1], chainAt: 99, type: 'spin',
    keys: [[0, { ...spinArm(-0.6, -0.9, -0.4), rootYaw: 0.18 }], [0.1, { ...spinArm(-0.2, -0.6), rootYaw: 0.18 }, 'out']],
  },
  SPIN_LOOP: {
    dur: 0.3, active: [0.0, 0.3], chainAt: 99, dmg: 24, kb: 7, heavy: true, sound: 'swingHeavy', type: 'sweep',
    keys: [[0, { ...spinArm(-0.2, -0.6), rootYaw: 0.18 }],
      [0.3, { ...spinArm(-0.2, -0.6), rootYaw: 0.18 + (2 * Math.PI) }, 'lin']],
  },
  SPIN_OUT: {
    dur: 0.36, active: [-1, -1], chainAt: 0.2, type: 'spin',
    keys: [[0, { ...spinArm(-0.2, -0.6), rootYaw: 0.18 }], [0.36, HERO.idle, 'io']],
  },
  // ---- rage-only moves ----
  // vertical somersault cut: the blade wheels through a full vertical circle in front
  RFLIP: {
    dur: 0.74, active: [0.14, 0.52], chainAt: 0.5, dmg: 38, kb: 6, up: 4, heavy: true, lunge: [0.1, 0.5, 6.5], sound: 'swingHeavy', type: 'sweep',
    keys: [
      [0, HERO.idle],
      [0.12, { torso: [0.5, 0, 0], uarmR: [-1.5, 0, -0.1], farmR: [0, 0, 0], handR: [1.5, 0, 0], uarmL: [-1.4, 0, 0.2], farmL: [-0.3, 0, 0],
        thighR: [-0.6, 0, 0], shinR: [0.9, 0, 0], thighL: [-0.6, 0, 0], shinL: [0.9, 0, 0], cloak: [0.6, 0, 0], rootY: -0.2 }, 'out'],
      [0.32, { torso: [0.6, 0, 0], uarmR: [-1.5, 0, -0.1], farmR: [0, 0, 0], handR: [1.5, 0, 0], uarmL: [-1.4, 0, 0.2], farmL: [-0.3, 0, 0],
        thighR: [-1.4, 0, 0], shinR: [1.9, 0, 0], thighL: [-1.4, 0, 0], shinL: [1.9, 0, 0], cloak: [1.2, 0, 0], rootY: 1.0, rootPitch: Math.PI }, 'lin'],
      [0.52, { torso: [0.5, 0, 0], uarmR: [-1.5, 0, -0.1], farmR: [0, 0, 0], handR: [1.5, 0, 0], uarmL: [-1.4, 0, 0.2], farmL: [-0.3, 0, 0],
        thighR: [-0.9, 0, 0], shinR: [1.0, 0, 0], thighL: [-0.5, 0, 0], shinL: [0.8, 0, 0], cloak: [0.6, 0, 0], rootY: -0.25, rootPitch: (2 * Math.PI) }, 'lin'],
      [0.74, { ...HERO.idle, rootPitch: (2 * Math.PI) }, 'io'],
    ],
  },
  // double horizontal spin
  RSPIN2: {
    dur: 0.8, active: [0.14, 0.6], chainAt: 0.62, dmg: 30, kb: 8, heavy: true, lunge: [0.14, 0.6, 4], sound: 'swingHeavy', type: 'sweep', multi: 2,
    keys: [
      [0, HERO.idle],
      [0.14, { ...spinArm(-0.2, -0.6), rootYaw: 0.18 }, 'out'],
      [0.6, { ...spinArm(0.2, -0.2), rootYaw: 0.18 + 2 * (2 * Math.PI) }, 'lin'],
      [0.8, { ...HERO.idle, rootYaw: 2 * (2 * Math.PI) }, 'io'],
    ],
  },
  // leaping overhead slam with a wide shockwave
  RLEAP: {
    dur: 0.95, active: [0.4, 0.5], impact: 0.5, chainAt: 0.72, dmg: 60, kb: 11, up: 8, radius: 4.6, heavy: true, lunge: [0.08, 0.46, 8], sound: 'swingHeavy', type: 'slam',
    keys: [
      [0, HERO.idle],
      [0.12, { ...HERO.idle, thighR: [-0.9, 0, 0], shinR: [1.4, 0, 0], thighL: [-0.9, 0, 0], shinL: [1.4, 0, 0], torso: [0.5, 0, 0], rootY: -0.4 }, 'out'],
      [0.34, { pelvis: [0, 0, 0], torso: [-0.4, 0, 0], head: [0.1, 0, 0], uarmR: [-2.9, 0, -0.15], farmR: [-0.6, 0, 0], handR: [0.05, 0, 0],
        uarmL: [-2.7, 0, 0.2], farmL: [-0.7, 0, 0], thighR: [-1.0, 0, 0], shinR: [1.2, 0, 0], thighL: [-0.4, 0, 0], shinL: [0.8, 0, 0], cloak: [0.0, 0, 0], rootY: 1.5 }, 'out'],
      [0.5, { pelvis: [0.2, 0, 0], torso: [0.7, 0, 0], head: [-0.4, 0, 0], uarmR: [-0.75, 0, -0.1], farmR: [-0.15, 0, 0], handR: [0.35, 0, 0],
        uarmL: [-0.85, 0, 0.15], farmL: [-0.3, 0, 0], thighR: [-1.0, 0, 0], shinR: [1.1, 0, 0], thighL: [0.5, 0, 0], shinL: [0.7, 0, 0], cloak: [1.0, 0, 0], rootY: -0.42 }, 'in'],
      [0.95, HERO.idle, 'io'],
    ],
  },
  // ---- combo extensions unlocked by level ----
  // Lv2: one full turning backhand cut
  L4: {
    dur: 0.56, active: [0.08, 0.38], chainAt: 0.4, dmg: 30, kb: 7, heavy: true, lunge: [0.08, 0.38, 3.5], sound: 'swingHeavy', type: 'sweep',
    keys: [
      [0, { ...spinArm(-0.2, -0.6), rootYaw: 0.18 }],
      [0.08, { ...spinArm(-0.25, -0.65), rootYaw: 0.18 }, 'out'],
      [0.38, { ...spinArm(0.2, -0.2), rootYaw: 0.18 + 2 * Math.PI }, 'lin'],
      [0.56, { ...HERO.idle, rootYaw: 2 * Math.PI }, 'io'],
    ],
  },
  // Lv4: double thrust
  L5: {
    dur: 0.64, active: [0.1, 0.44], chainAt: 0.46, dmg: 26, kb: 6, multi: 2, lunge: [0.05, 0.42, 6], sound: 'swing', type: 'thrust', reach: 0.35,
    keys: [
      [0, HERO.idle],
      [0.1, { pelvis: [0, -0.4, 0], torso: [0.1, -0.5, 0], uarmR: [0.55, 0, -0.25], farmR: [-1.6, 0, 0], handR: [1.05, 0, 0], uarmL: [-0.6, 0, 0.3], farmL: [-1.0, 0, 0], thighR: [0.4, 0, 0], shinR: [0.6, 0, 0], thighL: [-0.7, 0, 0], shinL: [0.4, 0, 0], cloak: [0.5, 0, 0], rootY: -0.25 }, 'out'],
      [0.2, { pelvis: [0.15, 0.3, 0], torso: [0.45, 0.3, 0], uarmR: [-1.55, 0, -0.05], farmR: [0, 0, 0], handR: [1.0, 0, 0], uarmL: [0.4, 0, 0.3], farmL: [-0.3, 0, 0], thighR: [-1.0, 0, 0], shinR: [0.8, 0, 0], thighL: [0.7, 0, 0], shinL: [0.3, 0, 0], cloak: [1.1, 0, 0], rootY: -0.35 }, 'out'],
      [0.3, { pelvis: [0, -0.3, 0], torso: [0.2, -0.4, 0], uarmR: [0.4, 0, -0.25], farmR: [-1.5, 0, 0], handR: [1.05, 0, 0], uarmL: [-0.5, 0, 0.3], farmL: [-1.0, 0, 0], thighR: [-0.6, 0, 0], shinR: [0.7, 0, 0], thighL: [0.4, 0, 0], shinL: [0.4, 0, 0], cloak: [0.7, 0, 0], rootY: -0.3 }, 'io'],
      [0.42, { pelvis: [0.2, 0.35, 0], torso: [0.5, 0.35, 0], uarmR: [-1.6, 0, -0.05], farmR: [0, 0, 0], handR: [1.0, 0, 0], uarmL: [0.4, 0, 0.3], farmL: [-0.3, 0, 0], thighR: [-1.1, 0, 0], shinR: [0.8, 0, 0], thighL: [0.8, 0, 0], shinL: [0.3, 0, 0], cloak: [1.2, 0, 0], rootY: -0.38 }, 'out'],
      [0.64, HERO.idle, 'io'],
    ],
  },
  DODGE: {
    dur: 0.5, iframes: [0.0, 0.36], lunge: [0, 0.42, 12],
    keys: [
      [0, { ...HERO.idle, rootY: -0.3 }],
      [0.08, { torso: [0.6, 0, 0], uarmR: [0.6, 0, -0.2], farmR: [-0.6, 0, 0], handR: [2.4, 0, 0], thighR: [-1.6, 0, 0], shinR: [2.0, 0, 0], thighL: [-1.4, 0, 0], shinL: [2.0, 0, 0], uarmL: [-0.6, 0, 0.3], farmL: [-1.4, 0, 0], head: [0.4, 0, 0], cloak: [1.2, 0, 0], rootY: -0.4, rootPitch: 0.6 }, 'out'],
      [0.34, { torso: [0.6, 0, 0], uarmR: [0.6, 0, -0.2], farmR: [-0.6, 0, 0], handR: [2.4, 0, 0], thighR: [-1.6, 0, 0], shinR: [2.0, 0, 0], thighL: [-1.4, 0, 0], shinL: [2.0, 0, 0], uarmL: [-0.6, 0, 0.3], farmL: [-1.4, 0, 0], head: [0.4, 0, 0], cloak: [0.6, 0, 0], rootY: -0.4, rootPitch: 2 * Math.PI - 0.3 }, 'lin'],
      [0.5, { ...HERO.idle, rootPitch: 2 * Math.PI }, 'io'],
    ],
  },
  HURT: {
    dur: 0.36,
    keys: [
      [0, HERO.idle],
      [0.08, { ...HERO.idle, torso: [-0.45, 0.3, 0], head: [-0.4, 0, 0], rootY: -0.12, rootPitch: -0.15 }, 'out'],
      [0.36, HERO.idle, 'io'],
    ],
  },
  RAGE: {
    dur: 1.0, iframes: [0, 1.0], impact: 0.55, radius: 6, dmg: 60, kb: 12, up: 7,
    keys: [
      [0, HERO.idle],
      [0.45, { torso: [-0.5, 0, 0], head: [-0.6, 0, 0], uarmR: [-0.5, 0, -1.2], farmR: [-0.3, 0, 0], handR: [1.4, 0, 0], uarmL: [-0.4, 0, 1.3], farmL: [-0.4, 0, 0], thighR: [0, 0, -0.25], thighL: [0, 0, 0.25], cloak: [0.9, 0, 0], rootY: 0.0 }, 'out'],
      [0.6, { torso: [0.5, 0, 0], head: [0.2, 0, 0], uarmR: [-0.7, 0, -0.5], farmR: [-0.3, 0, 0], handR: [1.4, 0, 0], uarmL: [-0.6, 0, 0.5], farmL: [-0.4, 0, 0], thighR: [-0.6, 0, -0.2], shinR: [0.8, 0, 0], thighL: [0.3, 0, 0.2], shinL: [0.5, 0, 0], cloak: [1.1, 0, 0], rootY: -0.3 }, 'out'],
      [1.0, HERO.idle, 'io'],
    ],
  },
  DEATH: {
    dur: 1.4,
    keys: [
      [0, HERO.idle],
      [0.4, { ...HERO.idle, torso: [0.6, 0, 0], thighR: [-1.4, 0, 0], shinR: [2.0, 0, 0], thighL: [-1.2, 0, 0], shinL: [2.1, 0, 0], rootY: -0.5 }, 'out'],
      [1.0, { ...HERO.idle, torso: [0.3, 0, 0], head: [0.5, 0, 0], uarmR: [-0.2, 0, -0.6], uarmL: [-0.2, 0, 0.6], rootY: -0.62, rootPitch: 1.45 }, 'in'],
      [1.4, { ...HERO.idle, torso: [0.3, 0, 0], head: [0.5, 0, 0], uarmR: [-0.2, 0, -0.6], uarmL: [-0.2, 0, 0.6], rootY: -0.62, rootPitch: 1.45 }],
    ],
  },
};

// ------------------------------------------------------------------ enemies
const GIDLE = {
  torso: [0.25, 0, 0], head: [0.15, 0, 0.1],
  uarmR: [-0.25, 0, -0.15], farmR: [-0.6, 0, 0], handR: [0.85, 0, 0],
  uarmL: [0.1, 0, 0.12], farmL: [-0.3, 0, 0],
  thighR: [-0.2, 0, 0], shinR: [0.3, 0, 0], thighL: [0.1, 0, 0], shinL: [0.25, 0, 0], rootY: -0.05,
};
export function gruntPose(state, t, phase, out) {
  switch (state) {
    case 'walk': {
      const s = Math.sin(phase), c = Math.cos(phase);
      return lerpPose(GIDLE, {
        torso: [0.4, 0.15 * s, 0], head: [0.2, -0.1 * s, 0.15],
        uarmR: [-0.3 + 0.2 * s, 0, -0.2], farmR: [-0.6, 0, 0], handR: [0.85, 0, 0],
        uarmL: [0.6 * s, 0, 0.15], farmL: [-0.4, 0, 0],
        thighR: [-0.75 * s - 0.1, 0, 0], thighL: [0.75 * s - 0.1, 0, 0],
        shinR: [0.3 + 0.8 * Math.max(0, -c), 0, 0], shinL: [0.3 + 0.8 * Math.max(0, c), 0, 0],
        rootY: -0.04 + 0.05 * Math.abs(c),
      }, 1, out);
    }
    case 'windup': {
      const u = ease.out(Math.min(1, t));
      return lerpPose(GIDLE, {
        torso: [-0.25, -0.3, 0], head: [-0.1, 0, 0],
        uarmR: [-2.7, 0, -0.3], farmR: [-0.5, 0, 0], handR: [0.2, 0, 0],
        uarmL: [-0.4, 0, 0.4], farmL: [-0.5, 0, 0],
        thighR: [0.2, 0, 0], shinR: [0.2, 0, 0], thighL: [-0.4, 0, 0], shinL: [0.3, 0, 0], rootY: 0,
      }, u, out);
    }
    case 'strike': {
      const u = ease.out(Math.min(1, t));
      const A = { torso: [-0.25, -0.3, 0], uarmR: [-2.7, 0, -0.3], farmR: [-0.5, 0, 0], handR: [0.2, 0, 0], uarmL: [-0.4, 0, 0.4], farmL: [-0.5, 0, 0], thighR: [0.2, 0, 0], thighL: [-0.4, 0, 0], shinL: [0.3, 0, 0] };
      const B = { torso: [0.55, 0.25, 0], head: [-0.3, 0, 0], uarmR: [-0.7, 0, -0.1], farmR: [-0.1, 0, 0], handR: [1.2, 0, 0], uarmL: [0.4, 0, 0.3], farmL: [-0.3, 0, 0], thighR: [0.3, 0, 0], shinR: [0.4, 0, 0], thighL: [-0.7, 0, 0], shinL: [0.6, 0, 0], rootY: -0.2 };
      return lerpPose(A, B, u, out);
    }
    case 'hit': {
      const u = Math.sin(Math.min(1, t) * Math.PI);
      return lerpPose(GIDLE, { ...GIDLE, torso: [-0.6, 0.3, 0.2], head: [-0.6, 0, 0], uarmR: [0.4, 0, -0.6], uarmL: [0.4, 0, 0.6], rootPitch: -0.25, rootY: -0.1 }, u, out);
    }
    case 'dead': {
      const u = ease.out(Math.min(1, t));
      return lerpPose(GIDLE, { torso: [-0.5, 0.4, 0.2], head: [-0.7, 0.3, 0], uarmR: [-0.3, 0, -1.3], uarmL: [-0.2, 0, 1.4], farmR: [-0.4, 0, 0], thighR: [-0.4, 0, -0.2], shinR: [0.8, 0, 0], thighL: [0.1, 0, 0.2], rootPitch: -1.52, rootY: -0.4 }, u, out);
    }
    default: {
      const b = Math.sin(phase * 0.5) * 0.04;
      return lerpPose(GIDLE, { ...GIDLE, torso: [0.25 + b, 0, 0], head: [0.15 - b, 0, 0.1] }, 1, out);
    }
  }
}

// ------------------------------------------------------------------ boss (two-handed great axe)
const BIDLE = {
  torso: [0.1, -0.2, 0], head: [-0.05, 0.1, 0],
  uarmR: [-0.5, 0.1, -0.25], farmR: [-0.9, 0, 0], handR: [1.1, 0, 0],
  uarmL: [-0.6, 0.3, 0.35], farmL: [-1.0, 0, 0],
  thighR: [0.2, 0, -0.12], shinR: [0.3, 0, 0], thighL: [-0.35, 0, 0.12], shinL: [0.35, 0, 0], rootY: -0.05,
};
export function bossPose(state, t, phase, out) {
  switch (state) {
    case 'walk': {
      const s = Math.sin(phase), c = Math.cos(phase);
      return lerpPose(BIDLE, {
        ...BIDLE, torso: [0.2, 0.12 * s, 0],
        thighR: [-0.6 * s - 0.1, 0, -0.1], thighL: [0.6 * s - 0.1, 0, 0.1],
        shinR: [0.3 + 0.7 * Math.max(0, -c), 0, 0], shinL: [0.3 + 0.7 * Math.max(0, c), 0, 0],
        rootY: -0.03 + 0.05 * Math.abs(c),
      }, 1, out);
    }
    case 'roar': {
      const u = Math.sin(Math.min(1, t) * Math.PI);
      return lerpPose(BIDLE, { ...BIDLE, torso: [-0.5, 0, 0], head: [-0.6, 0, 0], uarmR: [-0.3, 0, -1.2], uarmL: [-0.3, 0, 1.2], farmR: [-0.6, 0, 0], farmL: [-0.6, 0, 0] }, u, out);
    }
    case 'cleaveWind': return lerpPose(BIDLE, { ...sweepArm(-1.2, -0.8, 0.1), handR: [1.45, 0, 0] }, ease.out(Math.min(1, t)), out);
    case 'cleave': return lerpPose({ ...sweepArm(-1.2, -0.8, 0.1) }, { ...sweepArm(2.4, 0.8, 0.3), rootYaw: 0.4 }, ease.out(Math.min(1, t)), out);
    case 'slamWind': return lerpPose(BIDLE, HERO_ACTIONS.L3.keys[1][1], ease.out(Math.min(1, t)), out);
    case 'slam': return lerpPose(HERO_ACTIONS.L3.keys[1][1], HERO_ACTIONS.L3.keys[2][1], ease.in(Math.min(1, t)), out);
    case 'chargeWind': return lerpPose(BIDLE, { ...BIDLE, torso: [0.6, 0, 0], head: [-0.4, 0, 0], thighR: [-0.8, 0, 0], shinR: [1.0, 0, 0], thighL: [0.5, 0, 0], rootY: -0.3 }, ease.out(Math.min(1, t)), out);
    case 'charge': {
      const s = Math.sin(phase * 1.6), c = Math.cos(phase * 1.6);
      return lerpPose(BIDLE, { ...BIDLE, torso: [0.7, 0, 0], head: [-0.5, 0, 0], uarmR: [-1.4, 0, -0.3], farmR: [-0.3, 0, 0], handR: [1.4, 0, 0],
        thighR: [-1.0 * s - 0.2, 0, 0], thighL: [1.0 * s - 0.2, 0, 0], shinR: [0.4 + Math.max(0, -c), 0, 0], shinL: [0.4 + Math.max(0, c), 0, 0], rootY: -0.1 }, 1, out);
    }
    case 'stagger': {
      const u = Math.sin(Math.min(1, t) * Math.PI);
      return lerpPose(BIDLE, { ...BIDLE, torso: [0.9, 0.3, 0.2], head: [0.5, 0, 0], uarmR: [0.3, 0, -0.5], uarmL: [0.3, 0, 0.5], thighR: [-1.2, 0, 0], shinR: [1.8, 0, 0], rootY: -0.45 }, u, out);
    }
    case 'dead': return lerpPose(BIDLE, { torso: [0.8, 0, 0.2], head: [0.6, 0, 0], uarmR: [-0.2, 0, -0.9], uarmL: [-0.2, 0, 0.9], thighR: [-1.5, 0, 0], shinR: [2.1, 0, 0], thighL: [-1.4, 0, 0], shinL: [2.1, 0, 0], rootY: -0.55, rootPitch: 0.3 }, ease.out(Math.min(1, t)), out);
    default: return lerpPose(BIDLE, BIDLE, 0, out);
  }
}

// Lv6 finisher: a leaping slam like the rage version with a slightly smaller shockwave
HERO_ACTIONS.L6 = { ...HERO_ACTIONS.RLEAP, dmg: 50, radius: 3.8 };
// heavy pressed after the 2nd light hit: a crushing overhead slam with a wide shockwave
HERO_ACTIONS.FIN2 = { ...HERO_ACTIONS.L3, dmg: 52, radius: 3.8, kb: 9, up: 5 };

// ---- random light-attack variants (picked per combo step) ----
// rising diagonal: low on the right to high on the left
HERO_ACTIONS.L1B = {
  dur: 0.46, active: [0.1, 0.24], chainAt: 0.26, dmg: 24, kb: 5, up: 3, lunge: [0.04, 0.22, 5], sound: 'swing', type: 'sweep',
  keys: [
    [0, { ...sweepArm(0.2, -0.45, 0.2, -1.05), rootY: -0.3 }],
    [0.1, { ...sweepArm(0.0, -0.5, 0.2, -1.05), rootY: -0.32 }, 'out'],
    [0.24, { ...sweepArm(2.2, 0.6, -0.15, -2.3), rootYaw: 0.35, rootY: -0.05 }, 'out'],
    [0.46, HERO.idle, 'io'],
  ],
};
// straight vertical cut, fast, no shockwave
HERO_ACTIONS.VCUT = {
  dur: 0.5, active: [0.15, 0.25], chainAt: 0.28, dmg: 30, kb: 5, lunge: [0.05, 0.24, 5], sound: 'swing', type: 'sweep',
  keys: [
    [0, HERO.idle],
    [0.14, HERO_ACTIONS.L3.keys[1][1], 'out'],
    [0.25, { ...HERO_ACTIONS.L3.keys[2][1], handR: [0.3, 0, 0], rootY: -0.2 }, 'in'],
    [0.5, HERO.idle, 'io'],
  ],
};
// cross cut: two diagonals, right-high to left-low then left-high to right-low
HERO_ACTIONS.XCUT = {
  dur: 0.64, active: [0.1, 0.44], chainAt: 0.46, dmg: 22, kb: 4, multi: 2, lunge: [0.05, 0.4, 4], sound: 'swing', type: 'sweep',
  keys: [
    [0, { ...sweepArm(0.2, -0.5, -0.2, -2.3) }],
    [0.1, { ...sweepArm(0.0, -0.55, -0.2, -2.4) }, 'out'],
    [0.22, { ...sweepArm(1.6, 0.45, 0.15, -1.3), rootYaw: 0.25, rootY: -0.2 }, 'out'],
    [0.32, { ...sweepArm(2.1, 0.55, -0.15, -2.3), rootYaw: 0.3 }, 'io'],
    [0.44, { ...sweepArm(0.1, -0.45, 0.15, -1.3), rootYaw: -0.15, rootY: -0.2 }, 'out'],
    [0.64, HERO.idle, 'io'],
  ],
};
// quick level one-turn spin
HERO_ACTIONS.SPIN1 = { ...HERO_ACTIONS.L4, dur: 0.48, chainAt: 0.36, lunge: [0.05, 0.3, 2.5], dmg: 26 };
// planted thrust (no long lunge)
HERO_ACTIONS.STAB = { ...HERO_ACTIONS.DASH, lunge: [0.08, 0.3, 4], dmg: 28 };

// ---- more random variants ----
// low sweep at shin height from a deep crouch; trips enemies into the air
HERO_ACTIONS.LOWSWEEP = {
  dur: 0.5, active: [0.1, 0.27], chainAt: 0.3, dmg: 24, kb: 3, up: 4, lunge: [0.04, 0.22, 3], sound: 'swing', type: 'sweep',
  keys: [
    [0, { ...spinArm(0.1, -0.5, -0.55), torso: [0.35, -0.3, 0], thighR: [-0.9, 0, -0.2], shinR: [1.5, 0, 0], thighL: [0.2, 0, 0.3], shinL: [1.1, 0, 0] }],
    [0.1, { ...spinArm(-0.1, -0.55, -0.55), torso: [0.35, -0.33, 0], thighR: [-0.9, 0, -0.2], shinR: [1.5, 0, 0], thighL: [0.2, 0, 0.3], shinL: [1.1, 0, 0] }, 'out'],
    [0.27, { ...spinArm(2.3, 0.6, -0.55), torso: [0.35, 0.36, 0], thighR: [-0.9, 0, -0.2], shinR: [1.5, 0, 0], thighL: [0.2, 0, 0.3], shinL: [1.1, 0, 0], rootYaw: 0.4 }, 'out'],
    [0.5, HERO.idle, 'io'],
  ],
};
// counter-rotating level spin (turns the other way)
HERO_ACTIONS.REVSPIN = {
  dur: 0.52, active: [0.08, 0.36], chainAt: 0.38, dmg: 28, kb: 7, heavy: true, lunge: [0.08, 0.36, 3], sound: 'swingHeavy', type: 'sweep',
  keys: [
    [0, { ...spinArm(1.6, 0.5), rootYaw: -0.2 }],
    [0.08, { ...spinArm(1.7, 0.55), rootYaw: -0.2 }, 'out'],
    [0.36, { ...spinArm(1.2, 0.2), rootYaw: -0.2 - 2 * Math.PI }, 'lin'],
    [0.52, { ...HERO.idle, rootYaw: -2 * Math.PI }, 'io'],
  ],
};
// retreating cut: steps back while sweeping across the front
HERO_ACTIONS.BACKCUT = {
  ...HERO_ACTIONS.L1, dmg: 24, lunge: [0.02, 0.3, -6],
  keys: HERO_ACTIONS.L1.keys.map(([t, p, e]) => [t, { ...p, torso: [-(p.torso ? 0.15 : 0), (p.torso || [0, 0, 0])[1], 0], cloak: [0.9, 0, 0] }, e]),
};
// shoulder charge: sword held low behind, the body does the hitting
HERO_ACTIONS.SHOULDER = {
  dur: 0.5, active: [0.08, 0.3], chainAt: 0.32, dmg: 20, kb: 12, up: 2, body: 1.5, lunge: [0.05, 0.3, 12], sound: 'swing', type: 'thrust',
  keys: [
    [0, HERO.idle],
    [0.08, { pelvis: [0, 1.0, 0], torso: [0.45, 0.4, 0], head: [0, -1.0, 0], uarmR: [0.45, 0, -0.25], farmR: [-0.35, 0, 0], handR: [2.45, 0, 0],
      uarmL: [-0.9, 0.6, 0.6], farmL: [-1.6, 0, 0], thighR: [-0.9, 0, 0], shinR: [0.8, 0, 0], thighL: [0.5, 0, 0], shinL: [0.6, 0, 0], cloak: [1.2, 0, 0], rootY: -0.25 }, 'out'],
    [0.3, { pelvis: [0, 1.0, 0], torso: [0.5, 0.4, 0], head: [0, -1.0, 0], uarmR: [0.45, 0, -0.25], farmR: [-0.35, 0, 0], handR: [2.45, 0, 0],
      uarmL: [-0.9, 0.6, 0.6], farmL: [-1.6, 0, 0], thighR: [0.4, 0, 0], shinR: [0.4, 0, 0], thighL: [-0.8, 0, 0], shinL: [0.7, 0, 0], cloak: [1.3, 0, 0], rootY: -0.3 }],
    [0.5, HERO.idle, 'io'],
  ],
};
// cartwheel cut: a smaller forward somersault with the blade wheeling in front (available without rage)
HERO_ACTIONS.WHEEL = {
  ...HERO_ACTIONS.RFLIP, dmg: 30, up: 3,
  keys: HERO_ACTIONS.RFLIP.keys.map(([t, p, e]) => [t, { ...p, rootY: p.rootY > 0.5 ? 0.55 : p.rootY }, e]),
};

// ---- unorthodox moves using the ground ----
// sword planted point-down in front, both hands on the grip
const PLANT = {
  pelvis: [0.1, 0, 0], torso: [0.45, 0, 0], head: [-0.2, 0, 0],
  uarmR: [-1.6, 0, -0.08], farmR: [-0.8, 0, 0], handR: [3.15, 0, 0],
  uarmL: [-1.6, 0, 0.12], farmL: [-0.85, 0, 0],
  thighR: [-0.2, 0, -0.2], shinR: [0.3, 0, 0], thighL: [0.1, 0, 0.2], shinL: [0.2, 0, 0], cloak: [0.5, 0, 0], rootY: 0.0,
};
// planted-sword whirl: grip the grounded blade and swing the whole body around it twice, legs flung out
HERO_ACTIONS.PIVOT = {
  dur: 0.95, active: [0.16, 0.72], chainAt: 0.74, dmg: 26, kb: 10, up: 3, body: 1.9, bodyAll: true, multi: 2, ground: true, sound: 'swingHeavy', type: 'thrust',
  keys: [
    [0, HERO.idle],
    [0.14, { ...PLANT, rootY: 0.0 }, 'out'],
    [0.72, { ...PLANT, torso: [0.6, 0, 0], thighR: [-0.4, 0, -1.2], shinR: [0.2, 0, 0], thighL: [0.0, 0, 1.0], shinL: [0.3, 0, 0], cloak: [1.3, 0, 0.6], rootY: 0.05, rootYaw: 4 * Math.PI }, 'lin'],
    [0.95, { ...HERO.idle, rootYaw: 4 * Math.PI }, 'io'],
  ],
};
// pole vault: plant the blade, vault high over it and come down in an overhead slam
HERO_ACTIONS.VAULT = {
  dur: 1.0, active: [0.62, 0.72], impact: 0.7, chainAt: 0.8, dmg: 48, kb: 10, up: 7, radius: 3.4, heavy: true, ground: true, lunge: [0.1, 0.62, 7], sound: 'swingHeavy', type: 'slam',
  keys: [
    [0, HERO.idle],
    [0.14, { ...PLANT, rootY: -0.05 }, 'out'],
    [0.38, { ...PLANT, uarmR: [-2.4, 0, -0.1], uarmL: [-2.4, 0, 0.1], farmR: [-0.1, 0, 0], handR: [2.9, 0, 0], thighR: [-1.6, 0, 0], shinR: [2.0, 0, 0], thighL: [-1.4, 0, 0], shinL: [1.9, 0, 0], cloak: [0.2, 0, 0], rootY: 1.7, rootPitch: -0.4 }, 'out'],
    [0.55, { pelvis: [0, 0, 0], torso: [-0.4, 0, 0], head: [0.1, 0, 0], uarmR: [-2.9, 0, -0.15], farmR: [-0.6, 0, 0], handR: [0.05, 0, 0],
      uarmL: [-2.7, 0, 0.2], farmL: [-0.7, 0, 0], thighR: [-1.0, 0, 0], shinR: [1.2, 0, 0], thighL: [-0.4, 0, 0], shinL: [0.8, 0, 0], rootY: 1.3 }, 'io'],
    [0.7, { pelvis: [0.2, 0, 0], torso: [0.7, 0, 0], head: [-0.4, 0, 0], uarmR: [-0.75, 0, -0.1], farmR: [-0.15, 0, 0], handR: [0.35, 0, 0],
      uarmL: [-0.85, 0, 0.15], farmL: [-0.3, 0, 0], thighR: [-1.0, 0, 0], shinR: [1.1, 0, 0], thighL: [0.5, 0, 0], shinL: [0.7, 0, 0], cloak: [1.0, 0, 0], rootY: -0.42 }, 'in'],
    [1.0, HERO.idle, 'io'],
  ],
};
// ground drag: sprint with the blade scraping the earth behind, then rip it up in a rising cut
const DRAGPOSE = (s) => ({
  pelvis: [0, 0.15 * s, 0], torso: [0.45, -0.25, 0], head: [-0.25, 0.2, 0],
  uarmR: [0.55, 0, -0.35], farmR: [-0.25, 0, 0], handR: [2.0, 0, 0],
  uarmL: [-0.7 * s, 0, 0.2], farmL: [-0.8, 0, 0],
  thighR: [-0.9 * s - 0.2, 0, 0], thighL: [0.9 * s - 0.2, 0, 0], shinR: [0.5 + 0.6 * Math.max(0, s), 0, 0], shinL: [0.5 + 0.6 * Math.max(0, -s), 0, 0],
  cloak: [1.1, 0, 0], rootY: -0.12,
});
HERO_ACTIONS.DRAG = {
  dur: 0.75, active: [0.38, 0.52], chainAt: 0.54, dmg: 34, kb: 4, up: 8, heavy: true, ground: true, lunge: [0.04, 0.4, 9], sound: 'swingHeavy', type: 'sweep',
  keys: [
    [0, HERO.idle],
    [0.1, DRAGPOSE(1), 'out'],
    [0.22, DRAGPOSE(-1)],
    [0.34, DRAGPOSE(1)],
    [0.52, HERO_ACTIONS.UPPER.keys[2][1], 'out'],
    [0.75, HERO.idle, 'io'],
  ],
};
