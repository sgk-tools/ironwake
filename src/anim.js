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
const sweepArm = (swing, torsoYaw, lean = 0.15) => ({
  pelvis: [0, torsoYaw * 0.4, 0], torso: [lean, torsoYaw * 0.6, 0], head: [0, -torsoYaw * 0.5, 0],
  uarmR: [-0.1, swing, -1.25], farmR: [-0.15, 0, 0], handR: [1.45, 0, 0],
  uarmL: [-0.4, swing * 0.6, 0.6], farmL: [-0.9, 0, 0],
  thighR: [-0.35, 0, -0.15], shinR: [0.4, 0, 0], thighL: [0.15, 0, 0.15], shinL: [0.25, 0, 0],
  cloak: [0.5, 0, -torsoYaw * 0.2], rootY: -0.15,
});

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
    dur: 0.7, active: [0.28, 0.36], impact: 0.34, chainAt: 0.5, dmg: 42, kb: 7, up: 6, radius: 2.6, lunge: [0.1, 0.32, 6], sound: 'swingHeavy', type: 'slam',
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
