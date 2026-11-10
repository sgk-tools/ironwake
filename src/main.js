import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { JOINTS, ORDER, HERO, HERO_ACTIONS, heroRun, sampleKeys, smoothPose, lerpPose, gruntPose, bossPose } from './anim.js';

// ======================================================================= setup
const $ = (s) => document.querySelector(s);
const canvas = $('#game');
const isTouch = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.75;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const QUALITY = { ratio: Math.min(window.devicePixelRatio || 1, isTouch ? 2 : 1.5), shadows: true };
renderer.setPixelRatio(QUALITY.ratio);

const scene = new THREE.Scene();
const FOG = new THREE.Color(0x150c0b);
scene.fog = new THREE.FogExp2(FOG, 0.026);
scene.background = FOG;
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 220);

const hemi = new THREE.HemisphereLight(0x8a7e86, 0x2a1a14, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffbf98, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 70;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x9aa6ff, 0.35); rim.position.set(-10, 6, -12); scene.add(rim);
// fill light from behind the camera: the camera looks at the side of everything the sun does not reach
const fill = new THREE.DirectionalLight(0xfff1e6, 1.6); scene.add(fill, fill.target);
const rageLight = new THREE.PointLight(0xff2a10, 0, 9, 1.6); scene.add(rageLight);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 62 : 46;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ======================================================================= assets
const UI = {
  loadBar: $('#load-bar'), loadText: $('#load-text'), title: $('#title'), start: $('#btn-start'),
  hud: $('#hud'), hp: $('#hp-fill'), hpLag: $('#hp-lag'), rage: $('#rage-fill'), rageBtn: $('#btn-rage'),
  ko: $('#ko'), combo: $('#combo'), comboN: $('#combo-n'), wave: $('#wave-banner'), waveLabel: $('#wave-label'),
  bossBar: $('#boss'), bossFill: $('#boss-fill'), result: $('#result'), pause: $('#pause'), hurt: $('#hurt'),
  objective: $('#objective'),
};
const manager = new THREE.LoadingManager();
manager.onProgress = (_u, done, total) => {
  const p = Math.round(done / total * 100);
  UI.loadBar.style.width = p + '%'; UI.loadText.textContent = `装備を整えている… ${p}%`;
};
const gltf = new GLTFLoader(manager);
const texLoader = new THREE.TextureLoader(manager);
// Models ship as glTF JSON whose binary buffer is base64 inside the file. The viewer's security policy
// blocks fetching data: URIs, so decode it here and hand GLTFLoader a GLB built in memory instead.
function jsonToGlb(json) {
  const uri = json.buffers[0].uri;
  const b64 = uri.slice(uri.indexOf(',') + 1);
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  delete json.buffers[0].uri;
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jLen = Math.ceil(enc.length / 4) * 4, bLen = Math.ceil(bin.length / 4) * 4;
  const out = new Uint8Array(12 + 8 + jLen + 8 + bLen);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jLen, true); dv.setUint32(16, 0x4E4F534A, true);
  out.fill(0x20, 20, 20 + jLen); out.set(enc, 20);
  const o = 20 + jLen;
  dv.setUint32(o, bLen, true); dv.setUint32(o + 4, 0x004E4942, true); out.set(bin, o + 8);
  return out.buffer;
}
const loadG = (n) => {
  manager.itemStart(n);
  return fetch(`assets/${n}.gltf.json`)
    .then(r => { if (!r.ok) throw new Error(`${n}: HTTP ${r.status}`); return r.json(); })
    .then(j => new Promise((res, rej) => {
      // GLTFLoader decodes embedded images with fetch(blob:) when createImageBitmap exists; the viewer's
      // policy refuses that, so hide it while the parser is created and it falls back to <img> elements.
      const cib = window.createImageBitmap;
      try { window.createImageBitmap = undefined; gltf.parse(jsonToGlb(j), '', res, rej); }
      finally { window.createImageBitmap = cib; }
    }))
    .finally(() => manager.itemEnd(n));
};
const loadT = (n) => new Promise((res, rej) => texLoader.load(`assets/${n}`, res, undefined, rej));

let A = null;
async function loadAll() {
  const [hero, grunt, boss, sword, weapons, props, skel, gcol, gnrm, grough, sky] = await Promise.all([
    loadG('hero'), loadG('grunt'), loadG('boss'), loadG('sword'), loadG('weapons'), loadG('props'),
    fetch('assets/skeleton.json').then(r => r.json()),
    loadT('ground_col.jpg'), loadT('ground_nrm.jpg'), loadT('ground_rough.jpg'), loadT('sky.jpg'),
  ]);
  const parts = (g) => { const o = {}; g.scene.traverse(c => { if (c.isMesh) o[c.name] = c; }); return o; };
  A = { hero: parts(hero), grunt: parts(grunt), boss: parts(boss), sword: parts(sword), weapons: parts(weapons), props: parts(props), skel, gcol, gnrm, grough, sky };
}

// ======================================================================= rigs
const PIVOT = 0.55; // rotation centre for rolls / falls

function buildRig(partMeshes, skel, opts = {}) {
  const root = new THREE.Group(), inner = new THREE.Group();
  inner.position.y = PIVOT; root.add(inner);
  const j = {};
  for (const n of JOINTS) {
    const def = skel[n]; if (!def) continue;
    const base = n.replace(/[RL]$/, '');
    const src = partMeshes[base]; if (!src) continue;
    const g = new THREE.Group(); g.position.fromArray(def[1]);
    if (ORDER[n]) g.rotation.order = ORDER[n];
    const m = new THREE.Mesh(src.geometry, opts.material || src.material);
    m.castShadow = true; m.receiveShadow = false;
    g.add(m); j[n] = g;
  }
  for (const n of Object.keys(j)) {
    const par = skel[n][0];
    if (par) j[par].add(j[n]); else { j[n].position.y -= PIVOT; inner.add(j[n]); }
  }
  return { root, inner, j };
}

function applyPose(rig, pose) {
  for (const n in rig.j) {
    const r = pose[n];
    if (r) rig.j[n].rotation.set(r[0], r[1], r[2]); else rig.j[n].rotation.set(0, 0, 0);
  }
  rig.inner.position.y = PIVOT + (pose.rootY || 0);
  rig.inner.rotation.set(pose.rootPitch || 0, pose.rootYaw || 0, pose.rootRoll || 0, 'YXZ');
}

// Crowd: every enemy part is one InstancedMesh, matrices computed by hand.
class Crowd {
  constructor(partMeshes, skel, weaponMeshes, cap) {
    this.cap = cap;
    this.joints = JOINTS.filter(n => skel[n] && partMeshes[n.replace(/[RL]$/, '')]);
    this.offsets = this.joints.map(n => new THREE.Vector3().fromArray(skel[n][1]));
    this.parent = this.joints.map(n => this.joints.indexOf(skel[n][0]));
    this.meshes = this.joints.map(n => {
      const src = partMeshes[n.replace(/[RL]$/, '')];
      const im = new THREE.InstancedMesh(src.geometry, src.material, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true; im.frustumCulled = false; im.count = 0;
      scene.add(im); return im;
    });
    this.weapons = {};
    for (const [k, src] of Object.entries(weaponMeshes)) {
      const im = new THREE.InstancedMesh(src.geometry, src.material, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true; im.frustumCulled = false; im.count = 0;
      scene.add(im); this.weapons[k] = im;
    }
    this.tint = new THREE.Color();
    this.world = this.joints.map(() => new THREE.Matrix4());
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3();
    this.wOff = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    this.wOff.setPosition(0, -0.085, 0.0);
    this.handR = this.joints.indexOf('handR');
  }
  begin() { this.n = 0; this.wn = {}; for (const k in this.weapons) this.wn[k] = 0; }
  add(rootMatrix, pose, weapon, color) {
    const i = this.n++;
    const { _m, _q, _e, _p, _s } = this;
    const inner = _m.compose(_p.set(0, PIVOT + (pose.rootY || 0), 0),
      _q.setFromEuler(_e.set(pose.rootPitch || 0, pose.rootYaw || 0, 0, 'YXZ')), _s);
    const innerW = new THREE.Matrix4().multiplyMatrices(rootMatrix, inner);
    for (let k = 0; k < this.joints.length; k++) {
      const n = this.joints[k], r = pose[n];
      _e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0, ORDER[n] || 'XYZ');
      const off = this.offsets[k];
      _p.copy(off); if (this.parent[k] < 0) _p.y -= PIVOT;
      _m.compose(_p, _q.setFromEuler(_e), _s);
      this.world[k].multiplyMatrices(this.parent[k] < 0 ? innerW : this.world[this.parent[k]], _m);
      this.meshes[k].setMatrixAt(i, this.world[k]);
      if (color) this.meshes[k].setColorAt(i, color);
    }
    if (weapon && this.weapons[weapon]) {
      const w = this.weapons[weapon], wi = this.wn[weapon]++;
      _m.multiplyMatrices(this.world[this.handR], this.wOff);
      w.setMatrixAt(wi, _m);
      if (color) w.setColorAt(wi, color);
    }
  }
  end() {
    for (const m of this.meshes) {
      m.count = this.n; m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    for (const k in this.weapons) {
      const w = this.weapons[k]; w.count = this.wn[k]; w.instanceMatrix.needsUpdate = true;
      if (w.instanceColor) w.instanceColor.needsUpdate = true;
    }
  }
}

// ======================================================================= world
const ARENA = 46;
let groundMat = null;
const colliders = []; // {x,z,r}
function buildWorld() {
  for (const t of [A.gcol, A.gnrm, A.grough]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(26, 26);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  A.gcol.colorSpace = THREE.SRGBColorSpace;
  const gmat = groundMat = new THREE.MeshStandardMaterial({ map: A.gcol, normalMap: A.gnrm, roughnessMap: A.grough, roughness: 1, metalness: 0, color: 0xb4aaa6, normalScale: new THREE.Vector2(1.4, 1.4) });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), gmat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  A.sky.mapping = THREE.EquirectangularReflectionMapping; A.sky.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(A.sky).texture;
  scene.environmentIntensity = 1.6;
  pm.dispose();

  // scatter props with instancing: ring of rocks/trees at the arena edge, debris inside
  const rnd = mulberry(42);
  const place = (name, list) => {
    const src = A.props[name]; if (!src) return;
    const im = new THREE.InstancedMesh(src.geometry, src.material, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((p, i) => {
      e.set(p.rx || 0, p.ry || 0, p.rz || 0);
      m.compose(new THREE.Vector3(p.x, p.y || 0, p.z), q.setFromEuler(e), new THREE.Vector3(p.s, p.s, p.s));
      im.setMatrixAt(i, m);
      if (p.col) colliders.push({ x: p.x, z: p.z, r: p.col * p.s });
    });
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
  };
  const ring = (n, r0, r1, f) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.3, r = r0 + rnd() * (r1 - r0);
    return f(Math.cos(a) * r, Math.sin(a) * r, rnd);
  });
  const inside = (n, f) => Array.from({ length: n }, () => {
    let x, z; do { x = (rnd() * 2 - 1) * ARENA * 0.9; z = (rnd() * 2 - 1) * ARENA * 0.9; } while (Math.hypot(x, z) < 8 || Math.hypot(x, z) > ARENA * 0.92);
    return f(x, z, rnd);
  });
  place('rock3', ring(26, ARENA + 1, ARENA + 6, (x, z, r) => ({ x, z, s: 1.2 + r() * 1.3, ry: r() * 6, col: 1.8 })));
  place('rock1', [...ring(30, ARENA + 3, ARENA + 14, (x, z, r) => ({ x, z, s: 1 + r() * 1.5, ry: r() * 6 })),
    ...inside(10, (x, z, r) => ({ x, z, s: 0.7 + r() * 0.7, ry: r() * 6, col: 1.1 }))]);
  place('rock2', inside(26, (x, z, r) => ({ x, z, s: 0.4 + r() * 0.6, ry: r() * 6 })));
  place('tree4', ring(12, ARENA + 2, ARENA + 12, (x, z, r) => ({ x, z, s: 1 + r() * 0.6, ry: r() * 6, rz: (r() - 0.5) * 0.2 })));
  place('tree9', [...ring(12, ARENA + 4, ARENA + 16, (x, z, r) => ({ x, z, s: 1 + r() * 0.7, ry: r() * 6 })),
    ...inside(4, (x, z, r) => ({ x, z, s: 0.9 + r() * 0.3, ry: r() * 6, col: 0.4 }))]);
  place('spear', inside(70, (x, z, r) => ({ x, z, s: 1, ry: r() * 6, rx: (r() - 0.5) * 0.9, rz: (r() - 0.5) * 0.9, y: -0.3 })));
  place('banner', inside(9, (x, z, r) => ({ x, z, s: 1, ry: r() * 6, rz: (r() - 0.5) * 0.25, y: -0.2 })));
  place('pillar', inside(7, (x, z, r) => ({ x, z, s: 1 + r() * 0.3, ry: r() * 6, rz: (r() - 0.5) * 0.1, col: 0.6 })));
  // distant ridge silhouettes beyond the arena
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x120a09, roughness: 1 });
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.ConeGeometry(14 + rnd() * 10, 12 + rnd() * 14, 5), ridgeMat);
    m.position.set(Math.cos(a) * 85, 3, Math.sin(a) * 85); m.rotation.y = rnd() * 6; scene.add(m);
  }
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ======================================================================= FX
class FX {
  constructor() {
    // blood droplets
    this.dropMax = 360;
    const dg = new THREE.IcosahedronGeometry(0.045, 0);
    this.dropMat = new THREE.MeshStandardMaterial({ color: 0x5a0303, roughness: 0.45, metalness: 0, envMapIntensity: 0.25 });
    this.drops = new THREE.InstancedMesh(dg, this.dropMat, this.dropMax);
    this.drops.frustumCulled = false; this.drops.count = 0; scene.add(this.drops);
    this.dp = []; // {x,y,z,vx,vy,vz,life,s}
    // ground decals
    this.decMax = 140;
    const tex = new THREE.CanvasTexture(splatCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    this.decMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, metalness: 0, envMapIntensity: 0.2, color: 0x5a0505, polygonOffset: true, polygonOffsetFactor: -2 });
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    this.decals = new THREE.InstancedMesh(pg, this.decMat, this.decMax);
    this.decals.frustumCulled = false; this.decals.count = 0; this.decals.receiveShadow = true; scene.add(this.decals);
    this.dec = []; this.decI = 0;
    // sparks / embers (additive)
    this.sparkMax = 220;
    const sg = new THREE.PlaneGeometry(0.12, 0.12);
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: new THREE.CanvasTexture(dotCanvas()) });
    this.sparks = new THREE.InstancedMesh(sg, this.sparkMat, this.sparkMax);
    this.sparks.frustumCulled = false; this.sparks.count = 0; scene.add(this.sparks);
    this.sp = [];
    // shockwave rings
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 48); this.ringGeo.rotateX(-Math.PI / 2);
    // sword trail
    this.trailN = 14;
    this.trailGeo = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(this.trailN * 2 * 3);
    this.trailA = new Float32Array(this.trailN * 2);
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trailGeo.setAttribute('alpha', new THREE.BufferAttribute(this.trailA, 1));
    const idx = [];
    for (let i = 0; i < this.trailN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.trailGeo.setIndex(idx);
    this.trailMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(0xff9a60) } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color * vA, vA); }',
    });
    this.trail = new THREE.Mesh(this.trailGeo, this.trailMat); this.trail.frustumCulled = false; scene.add(this.trail);
    this.trailHist = []; this.trailOn = 0;
    // telegraph discs
    this.teleMat = new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    this.tele = [];
    // pickups
    this.orbs = [];
    this.orbGeo = new THREE.SphereGeometry(0.22, 16, 10);
    this.orbMat = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff3020, emissiveIntensity: 2.2, roughness: 0.2 });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  blood(x, y, z, dx, dz, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
      if (this.dp.length >= this.dropMax) this.dp.shift();
      const sp = (2 + Math.random() * 4) * power;
      this.dp.push({ x, y, z, vx: dx * sp + (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 4 * power, vz: dz * sp + (Math.random() - 0.5) * 3, life: 1.2, s: 0.6 + Math.random() * 1.4 });
    }
  }
  decal(x, z, s) {
    const i = this.decI++ % this.decMax;
    this.dec[i] = { x, z, s, r: Math.random() * 6, life: 22 };
  }
  spark(x, y, z, n = 8, col) {
    for (let i = 0; i < n; i++) {
      if (this.sp.length >= this.sparkMax) this.sp.shift();
      this.sp.push({ x, y, z, vx: (Math.random() - 0.5) * 9, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 9, life: 0.35 + Math.random() * 0.3, max: 0.6 });
    }
  }
  ember(x, y, z) {
    if (this.sp.length >= this.sparkMax) this.sp.shift();
    this.sp.push({ x: x + (Math.random() - 0.5) * 0.8, y: y + Math.random() * 1.6, z: z + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5), vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5), life: 0.8, max: 0.8, g: -1 });
  }
  ring(x, z, r, color = 0xff8040, life = 0.45) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, 0.05, z); scene.add(m);
    this.rings.push({ m, r, t: 0, life });
  }
  telegraph(x, z, r, dur) {
    const g = new THREE.CircleGeometry(1, 40); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, this.teleMat.clone()); m.position.set(x, 0.04, z); m.scale.setScalar(r); scene.add(m);
    const inner = new THREE.Mesh(g, this.teleMat.clone()); inner.position.set(x, 0.05, z); inner.scale.setScalar(0.01); scene.add(inner);
    this.tele.push({ m, inner, r, t: 0, dur });
  }
  orb(x, z) {
    const m = new THREE.Mesh(this.orbGeo, this.orbMat); m.position.set(x, 0.5, z); scene.add(m);
    this.orbs.push({ m, x, z, t: 0 });
  }
  trailPush(base, tip, on) {
    this.trailHist.unshift([base.clone(), tip.clone()]);
    if (this.trailHist.length > this.trailN) this.trailHist.pop();
    this.trailOn += ((on ? 1 : 0) - this.trailOn) * (on ? 0.6 : 0.25);
  }
  update(dt) {
    const { _m, _q, _v, _s } = this;
    // droplets
    let n = 0;
    for (let i = this.dp.length - 1; i >= 0; i--) {
      const p = this.dp[i];
      p.vy -= 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
      if (p.y <= 0.02) { if (Math.random() < 0.35) this.decal(p.x, p.z, 0.3 + Math.random() * 0.6 * p.s); this.dp.splice(i, 1); continue; }
      if (p.life <= 0) { this.dp.splice(i, 1); continue; }
    }
    for (const p of this.dp) {
      _s.set(p.s, p.s * (1 + Math.abs(p.vy) * 0.15), p.s);
      _m.compose(_v.set(p.x, p.y, p.z), _q.identity(), _s); this.drops.setMatrixAt(n++, _m);
    }
    this.drops.count = n; this.drops.instanceMatrix.needsUpdate = true;
    // decals
    n = 0;
    for (const d of this.dec) {
      if (!d || d.life <= 0) continue;
      d.life -= dt;
      const s = d.s * Math.min(1, d.life / 3);
      _m.compose(_v.set(d.x, 0.012 + (n % 7) * 0.0015, d.z), _q.setFromAxisAngle(UP, d.r), _s.set(s, 1, s));
      this.decals.setMatrixAt(n++, _m);
    }
    this.decals.count = n; this.decals.instanceMatrix.needsUpdate = true;
    // sparks billboarded to the camera
    n = 0;
    for (let i = this.sp.length - 1; i >= 0; i--) {
      const p = this.sp[i];
      p.life -= dt; if (p.life <= 0) { this.sp.splice(i, 1); continue; }
      p.vy -= (p.g ?? 14) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (const p of this.sp) {
      const s = Math.max(0.05, p.life / p.max) * (p.g ? 0.8 : 1.2);
      _m.compose(_v.set(p.x, p.y, p.z), camera.quaternion, _s.set(s, s, s)); this.sparks.setMatrixAt(n++, _m);
    }
    this.sparks.count = n; this.sparks.instanceMatrix.needsUpdate = true;
    // rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt;
      const u = r.t / r.life;
      r.m.scale.setScalar(0.3 + r.r * Math.sqrt(u)); r.m.material.opacity = 1 - u;
      if (u >= 1) { scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    // telegraphs
    for (let i = this.tele.length - 1; i >= 0; i--) {
      const t = this.tele[i]; t.t += dt;
      const u = Math.min(1, t.t / t.dur);
      t.inner.scale.setScalar(Math.max(0.01, t.r * u));
      t.m.material.opacity = 0.18 + 0.12 * Math.sin(t.t * 20);
      if (t.t >= t.dur) { scene.remove(t.m, t.inner); t.m.material.dispose(); t.inner.material.dispose(); this.tele.splice(i, 1); }
    }
    // orbs bob
    for (const o of this.orbs) { o.t += dt; o.m.position.y = 0.45 + Math.sin(o.t * 4) * 0.12; }
    // trail
    const h = this.trailHist;
    for (let i = 0; i < this.trailN; i++) {
      const e = h[Math.min(i, h.length - 1)];
      if (!e) break;
      this.trailPos.set([e[0].x, e[0].y, e[0].z], i * 6);
      this.trailPos.set([e[1].x, e[1].y, e[1].z], i * 6 + 3);
      const a = Math.pow(1 - i / this.trailN, 1.6) * this.trailOn;
      this.trailA[i * 2] = 0.0; this.trailA[i * 2 + 1] = a * 0.55;
    }
    this.trailGeo.attributes.position.needsUpdate = true; this.trailGeo.attributes.alpha.needsUpdate = true;
    this.trail.visible = this.trailOn > 0.02;
  }
  clear() {
    this.dp.length = 0; this.dec.length = 0; this.sp.length = 0; this.trailHist.length = 0;
    for (const r of this.rings) scene.remove(r.m); this.rings.length = 0;
    for (const t of this.tele) scene.remove(t.m, t.inner); this.tele.length = 0;
    for (const o of this.orbs) scene.remove(o.m); this.orbs.length = 0;
  }
}
const UP = new THREE.Vector3(0, 1, 0);

function splatCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = mulberry(7);
  g.fillStyle = '#fff';
  for (let i = 0; i < 26; i++) {
    const a = r() * 6.28, d = r() * (i < 6 ? 10 : 46), s = i < 6 ? 22 + r() * 18 : 2 + r() * 8;
    g.globalAlpha = 0.7 + r() * 0.3;
    g.beginPath(); g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, s, s * (0.6 + r() * 0.4), a, 0, 6.28); g.fill();
  }
  return c;
}
function dotCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,200,140,0.6)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return c;
}

// ======================================================================= game state
const input = new Input($('#stick-zone'), { attack: $('#btn-attack'), heavy: $('#btn-heavy'), dodge: $('#btn-dodge'), rage: $('#btn-rage') });
const sfx = new Sfx();
let fx, crowd, hero, boss;
const G = { substeps: 1, stageIdx: 0, introT: 0, state: 'loading', time: 0, ko: 0, combo: 0, maxCombo: 0, comboT: 0, hitstop: 0, shake: 0, slowmo: 1, waveIdx: -1, spawnLeft: 0, alive: 0, waveDelay: 0, result: null };

// Each stage: its waves (mix = spawn weights per enemy type), its boss and its lighting.
const STAGES = [
  {
    name: '第一戦場', place: '亡者の荒野',
    boss: { name: '角の魔騎士', hp: 3200, speed: 1.0, dmg: 1.0, tint: [1, 1, 1], enrage: false },
    env: { fog: 0x3a2a26, density: 0.018, sky: 0xb8aab0, gnd: 0x4a3a30, hemi: 1.7, sun: 0xffc8a6, sunI: 3.4, ground: 0xc4bab4, envI: 2.0, rim: 0x9aa6ff, fill: 1.6 },
    waves: [
      { label: '第一波', sub: '亡者の群れを斬り払え', total: 40, max: 22, mix: { grunt: 1 }, rate: 0.35 },
      { label: '第二波', sub: '重装の亡者が混じっている', total: 60, max: 28, mix: { grunt: 0.86, brute: 0.14 }, rate: 0.28 },
      { label: '第三波', sub: '戦場が亡者で埋め尽くされる', total: 80, max: 34, mix: { grunt: 0.78, brute: 0.22 }, rate: 0.22 },
      { label: '決戦', sub: '角の魔騎士を討て', total: 9999, max: 12, mix: { grunt: 0.8, brute: 0.2 }, rate: 1.2, boss: true },
    ],
  },
  {
    name: '第二戦場', place: '灰の城塞跡',
    boss: { name: '灰の処刑人', hp: 4600, speed: 1.22, dmg: 1.15, tint: [0.62, 0.7, 0.85], enrage: false },
    env: { fog: 0x283240, density: 0.02, sky: 0xaab8d4, gnd: 0x343a46, hemi: 1.8, sun: 0xbfcfff, sunI: 3.0, ground: 0xa6aebc, envI: 1.7, rim: 0xffb080, fill: 1.8 },
    waves: [
      { label: '第一波', sub: '槍を構えた亡者が駆けてくる', total: 55, max: 26, mix: { grunt: 0.6, lancer: 0.4 }, rate: 0.3 },
      { label: '第二波', sub: '重装の亡者が隊列を組む', total: 75, max: 30, mix: { grunt: 0.45, lancer: 0.3, brute: 0.25 }, rate: 0.25 },
      { label: '第三波', sub: '城塞の残兵がすべて押し寄せる', total: 95, max: 36, mix: { grunt: 0.4, lancer: 0.35, brute: 0.25 }, rate: 0.2 },
      { label: '決戦', sub: '灰の処刑人を討て', total: 9999, max: 14, mix: { grunt: 0.5, lancer: 0.5 }, rate: 1.0, boss: true },
    ],
  },
  {
    name: '第三戦場', place: '血の沼地',
    boss: { name: '双角の魔将', hp: 6200, speed: 1.3, dmg: 1.3, tint: [1.0, 0.5, 0.45], enrage: true },
    env: { fog: 0x4a1a16, density: 0.021, sky: 0xc89490, gnd: 0x4a2420, hemi: 1.8, sun: 0xff9a7e, sunI: 3.2, ground: 0xb08a82, envI: 1.8, rim: 0xff5030, fill: 1.8 },
    waves: [
      { label: '第一波', sub: '沼から亡者が這い上がる', total: 70, max: 30, mix: { grunt: 0.55, lancer: 0.3, brute: 0.15 }, rate: 0.26 },
      { label: '第二波', sub: '重装の亡者が群れをなす', total: 90, max: 34, mix: { grunt: 0.35, lancer: 0.3, brute: 0.35 }, rate: 0.22 },
      { label: '第三波', sub: '最後の軍勢が押し寄せる', total: 120, max: 40, mix: { grunt: 0.4, lancer: 0.35, brute: 0.25 }, rate: 0.18 },
      { label: '決戦', sub: '双角の魔将を討て', total: 9999, max: 16, mix: { grunt: 0.4, lancer: 0.4, brute: 0.2 }, rate: 0.9, boss: true },
    ],
  },
];
const stage = () => STAGES[G.stageIdx];
const waveDef = () => stage().waves[G.waveIdx];
function pickType(mix) {
  let r = Math.random(), last = 'grunt';
  for (const [k, w] of Object.entries(mix)) { last = k; if ((r -= w) <= 0) return k; }
  return last;
}

const ENEMY = {
  grunt: { hp: 40, speed: 3.1, dmg: 45, range: 1.65, wind: 0.62, scale: 0.97, radius: 0.42, weapon: 'gsword', armor: false, color: new THREE.Color(1, 1, 1) },
  brute: { hp: 190, speed: 2.3, dmg: 85, range: 2.2, wind: 0.9, scale: 1.38, radius: 0.6, weapon: 'club', armor: true, color: new THREE.Color(0.72, 0.62, 0.58), exp: 5 },
  // fast spear-carrier that lunges forward when it strikes
  lancer: { hp: 32, speed: 4.3, dmg: 55, range: 2.7, wind: 0.5, scale: 0.95, radius: 0.42, weapon: 'spear', armor: false, color: new THREE.Color(0.74, 0.8, 0.92), lunge: 7, exp: 2 },
};
ENEMY.grunt.exp = 1;
const enemies = [];

function makeHero() {
  const rig = buildRig(A.hero, A.skel);
  // the hero material is shared by every part; clone it so rage glow does not leak elsewhere
  const mat = A.hero.torso.material.clone();
  // the baked albedo is very dark (black steel, black cape); lift it so the hero reads against the ground
  mat.color.setScalar(2.2); mat.envMapIntensity = 1.6;
  rig.root.traverse(o => { if (o.isMesh) o.material = mat; });
  const sw = new THREE.Mesh(A.sword.sword.geometry, A.sword.sword.material);
  sw.castShadow = true;
  sw.rotation.x = Math.PI / 2; sw.position.set(0, -0.085, 0.0);
  rig.j.handR.add(sw);
  scene.add(rig.root);
  return {
    rig, mat, sword: sw, x: 0, z: 0, vx: 0, vz: 0, face: 0, hp: 1000, maxHp: 1000, hpLag: 1000,
    rage: 0, rageT: 0, act: null, queued: null, iframe: 0, phase: 0, speedAmt: 0, pose: {}, target: {},
    lastBase: new THREE.Vector3(), lastTip: new THREE.Vector3(), base: new THREE.Vector3(), tip: new THREE.Vector3(),
    attackId: 0, dead: false, level: 1, exp: 0, comboIdx: 0, spinLoops: 0,
  };
}

function makeBoss() {
  const bmat = A.boss.torso.material.clone();
  bmat.envMapIntensity = 1.5;
  const rig = buildRig(A.boss, A.skel, { material: bmat });
  const axe = new THREE.Mesh(A.weapons.bossaxe.geometry, A.weapons.bossaxe.material);
  axe.castShadow = true; axe.rotation.x = Math.PI / 2; axe.position.set(0, -0.085, 0);
  rig.j.handR.add(axe);
  rig.root.scale.setScalar(2.3);
  scene.add(rig.root);
  return { rig, axe, mat: bmat, speed: 1, dmgMul: 1, enraged: false, x: 0, z: 30, face: Math.PI, hp: 3200, maxHp: 3200, state: 'roar', t: 0, phase: 0, poise: 0, pose: {}, target: {}, cd: 2, lastHit: -1, dead: false, deadT: 0, hitDone: false, tx: 0, tz: 0 };
}

// ======================================================================= hero logic
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const SWORD_HILT = new THREE.Vector3(0, 0.45, 0), SWORD_BASE = new THREE.Vector3(0, 1.15, 0), SWORD_TIP = new THREE.Vector3(0, 2.1, 0);

function startAction(name) {
  const h = hero, def = HERO_ACTIONS[name];
  if (name !== 'SPIN_LOOP' && name !== 'SPIN_OUT') { h.pose.rootYaw = wrapAng(h.pose.rootYaw || 0); h.pose.rootPitch = wrapAng(h.pose.rootPitch || 0); }
  h.act = { name, t: 0, def, hitDone: false, swung: false };
  h.attackId++;
  if (def.type && name !== 'SPIN_LOOP' && name !== 'SPIN_OUT') {
    // aim: stick direction, else nearest enemy in front-ish range
    const [mx, my] = input.move();
    if (Math.hypot(mx, my) > 0.2) h.face = Math.atan2(-mx, my);
    else {
      let best = null, bd = 6;
      for (const e of enemies) if (!e.dead) { const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < bd) { bd = d; best = e; } }
      if (boss && !boss.dead && boss.state !== 'hidden') { const d = Math.hypot(boss.x - h.x, boss.z - h.z); if (d < 7 && d < bd + 2) best = boss; }
      if (best) h.face = Math.atan2(best.x - h.x, best.z - h.z);
    }
  }
  if (name === 'DODGE') {
    const [mx, my] = input.move();
    if (Math.hypot(mx, my) > 0.2) h.face = Math.atan2(-mx, my);
    h.iframe = def.iframes[1]; sfx.play('dodge');
  }
}

// light attack choice: running start -> thrust; during a combo the stick direction relative to
// the hero picks a variation (back = rising launcher, side = diagonal cut); rage has its own chain
// The combo grows with level: Lv2 adds a turning backhand, Lv4 a double thrust, Lv6 a leaping slam.
// The combo grows with level (Lv2 turning backhand, Lv4 double thrust, Lv6 leaping slam). Each step is a
// pool of moves; one is picked at random so strings of attacks vary, never repeating the previous move.
function comboChain() {
  const lv = hero.level;
  if (hero.rageT > 0) {
    return [['L1', 'L1B', 'LOWSWEEP'], ['RFLIP', 'WHEEL'], ['L2', 'XCUT', 'REVSPIN'], ['RSPIN2', 'PIVOT'], ...(lv >= 3 ? [['L4', 'SPIN1', 'REVSPIN']] : []), ...(lv >= 5 ? [['RFLIP']] : []), ['RLEAP']];
  }
  return [['L1', 'L1B', 'VCUT', 'LOWSWEEP'], ['L2', 'XCUT', 'SPIN1', 'REVSPIN', 'BACKCUT'], ['L3', 'VCUT', 'STAB', 'SHOULDER', 'WHEEL', 'DRAG'],
    ...(lv >= 2 ? [['L4', 'SPIN1', 'REVSPIN', 'PIVOT']] : []), ...(lv >= 4 ? [['L5', 'XCUT', 'LOWSWEEP', 'DRAG']] : []), ...(lv >= 6 ? [['L6', 'VAULT']] : [])];
}
function pickFrom(pool, prev) {
  const opts = pool.filter(n => n !== prev);
  const list = opts.length ? opts : pool;
  return list[Math.floor(Math.random() * list.length)];
}
function pickLight(prev) {
  const [mx, my] = input.move();
  const moving = Math.hypot(mx, my) > 0.3;
  if (!prev) { hero.comboIdx = 0; hero.lightCount = 1; return moving ? 'DASH' : pickFrom(comboChain()[0], null); }
  hero.lightCount = (hero.lightCount || 0) + 1;
  if (moving) {
    const rel = Math.abs(angLerp(hero.face, Math.atan2(-mx, my), 1) - hero.face);
    if (rel > 2.3) return 'UPPER';
    if (rel > 0.8) return 'CROSS';
  }
  const chain = comboChain();
  hero.comboIdx = (hero.comboIdx + 1) % chain.length;
  return pickFrom(chain[hero.comboIdx], prev);
}
// heavy after N light hits (N = 1..5): launcher, crushing slam, double whirl, thrust barrage, leaping slam
const FINISHERS = { 1: ['UPPER', 'DRAG'], 2: ['FIN2'], 3: ['RSPIN2', 'PIVOT'], 4: ['L5'], 5: ['RLEAP', 'VAULT'] };
const LEVEL_MAX = 10;
const expNeed = (lv) => 14 + lv * 10;
const dmgMul = () => 1 + 0.07 * (hero.level - 1);
const LEVEL_PERKS = {
  2: '連撃が4段に（回転返し斬り）',
  3: '覚醒連撃に回転返し斬りが加わる',
  4: '連撃が5段に（二段突き）',
  5: '覚醒連撃に縦回転斬りがもう一度加わる',
  6: '連撃が6段に（大跳躍叩きつけ）',
};
function gainExp(n) {
  const h = hero;
  if (h.level >= LEVEL_MAX) return;
  h.exp += n;
  while (h.level < LEVEL_MAX && h.exp >= expNeed(h.level)) {
    h.exp -= expNeed(h.level); h.level++;
    h.maxHp += 90; h.hp = Math.min(h.maxHp, h.hp + 90 + h.maxHp * 0.25);
    const perk = LEVEL_PERKS[h.level] || '攻撃力と体力が上がった・回転斬りの回転数が増えた';
    showLevelUp(h.level, perk);
    sfx.play('heal'); fx.ring(h.x, h.z, 3, 0xffd080, 0.6);
  }
  if (h.level >= LEVEL_MAX) h.exp = 0;
}
let lvTimer = 0;
function showLevelUp(lv, perk) {
  const el = $('#levelup');
  $('#lu-lv').textContent = `Lv ${lv}`; $('#lu-perk').textContent = perk;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(lvTimer); lvTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function wrapAng(a) { return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }

function rageMult() { return hero.rageT > 0 ? 1.35 : 1; }

function updateHero(dt) {
  const h = hero;
  if (h.dead) {
    h.act.t += dt;
    sampleKeys(h.act.def.keys, h.act.t, h.target);
    smoothPose(h.pose, h.target, Math.min(1, dt * 14)); applyPose(h.rig, h.pose);
    return;
  }
  h.iframe = Math.max(0, h.iframe - dt);
  if (h.rageT > 0) {
    h.rageT -= dt;
    h.mat.emissive.setRGB(0.1 + 0.05 * Math.sin(G.time * 12), 0.008, 0.0);
    rageLight.intensity = 14 + Math.sin(G.time * 20) * 4;
    if (Math.random() < 0.9) fx.ember(h.x, 0.2, h.z);
    if (h.rageT <= 0) { h.mat.emissive.setRGB(0, 0, 0); rageLight.intensity = 0; }
  }
  // input
  if (input.consume('rage') && h.rage >= 100 && h.rageT <= 0 && (!h.act || h.act.name !== 'RAGE')) {
    h.rage = 0; h.rageT = 12; startAction('RAGE'); sfx.play('rage'); G.shake = 0.8;
  }
  const wantAttack = input.consume('attack') || (input.held.has('attack') && !h.act);
  const wantHeavy = input.consume('heavy');
  const wantDodge = input.consume('dodge');
  const act = h.act;
  if (wantDodge && (!act || act.name !== 'DODGE' && act.name !== 'RAGE' && (act.name === 'HURT' || act.t > (act.def.active?.[1] ?? 0)))) startAction('DODGE');
  else if (!act) {
    if (wantHeavy) { h.charge = 0; h.chargeLv = 0; startAction('CHARGE'); }
    else if (wantAttack) startAction(pickLight(null));
  } else if (act.name === 'DODGE') {
    if (wantAttack) act.queued = 'counter';  // attack during a roll: turning counter-cut on recovery
  } else if (act.def.type) {
    if (wantAttack) act.queued = 'light';
    if (wantHeavy) act.queued = 'heavy';
    if (input.held.has('attack') && !act.queued && act.t > act.def.active[1]) act.queued = 'light';
  }

  // action progression
  const speedK = rageMult();
  const [mx, my] = input.move();
  let moving = Math.hypot(mx, my);
  if (h.act) {
    const a = h.act, d = a.def;
    a.t += dt * (d.type ? speedK : 1);
    sampleKeys(d.keys, a.t, h.target);
    if (d.lunge && a.t >= d.lunge[0] && a.t <= d.lunge[1]) {
      const sp = d.lunge[2];
      h.x += Math.sin(h.face) * sp * dt * (d.type ? speedK : 1);
      h.z += Math.cos(h.face) * sp * dt * (d.type ? speedK : 1);
    }
    if (d.sound && !a.swung && a.t >= d.active[0] - 0.06) { a.swung = true; sfx.play(d.sound); }
    if (d.multi && !a.multiDone && a.t > (d.active[0] + d.active[1]) / 2) { a.multiDone = true; h.attackId++; }
    if (a.name === 'SPIN_LOOP') {
      // steer while spinning
      if (moving > 0.2) { const tf = Math.atan2(-mx, my); h.x += Math.sin(tf) * 3.5 * dt; h.z += Math.cos(tf) * 3.5 * dt; }
    }
    if (a.name === 'CHARGE') {
      // hold to build up to 3 charge levels, release to spin; more turns and damage per level
      h.charge += dt;
      const lv = h.charge >= 2.0 ? 3 : h.charge >= 1.2 ? 2 : h.charge >= 0.5 ? 1 : 0;
      if (lv > h.chargeLv) {
        h.chargeLv = lv; sfx.play('clang', 0.5 + lv * 0.2); fx.ring(h.x, h.z, 1.2 + lv * 0.7, lv === 3 ? 0xff4020 : 0xffb070, 0.4);
        fx.spark(h.tip.x, h.tip.y, h.tip.z, 6 + lv * 4);
      }
      if (h.chargeLv > 0 && Math.random() < 0.3 * h.chargeLv) fx.ember(h.x, 0.1, h.z);
      h.mat.emissive.setRGB(0.04 * h.chargeLv * (0.7 + 0.3 * Math.sin(G.time * 30)), 0.012 * h.chargeLv, 0);
      if (!input.held.has('heavy') || h.charge > 3.5) {
        h.spinTarget = [1, 2, 3, 4][h.chargeLv] + (h.rageT > 0 ? 2 : 0) + Math.floor((h.level - 1) / 3);
        h.chargeMul = 1 + 0.25 * h.chargeLv; h.spinLoops = 0;
        if (h.rageT <= 0) h.mat.emissive.setRGB(0, 0, 0);
        startAction('SPIN_IN');
      }
    } else if (a.name === 'SPIN_IN' && a.t >= d.dur) startAction('SPIN_LOOP');
    else if (a.name === 'SPIN_LOOP' && a.t >= d.dur) {
      // one rotation per loop; the number of turns was fixed when the charge was released
      h.pose.rootYaw -= Math.PI * 2;
      h.spinLoops = (h.spinLoops || 0) + 1;
      if (h.spinLoops < (h.spinTarget || 1)) startAction('SPIN_LOOP');
      else startAction('SPIN_OUT');
    } else if (d.type && a.t >= d.chainAt && a.queued) {
      if (a.queued === 'heavy') {
        // heavy mid-combo: a finisher that depends on how many light hits came before
        const n = h.lightCount || 0;
        if (n <= 0) { h.charge = 0; h.chargeLv = 0; startAction('CHARGE'); }
        else { startAction(pickFrom(FINISHERS[Math.min(n, 5)], null)); h.lightCount = 0; }
      } else startAction(pickLight(a.name));
    } else if (a.t >= d.dur && a.queued === 'counter') {
      h.lightCount = 1; startAction('L4');
    } else if (a.t >= d.dur) {
      h.act = null;
      // full turns (rolls, spins, flips) end where they started: drop the extra 2*pi so the
      // smoothing does not unwind them backwards
      h.pose.rootYaw = wrapAng(h.pose.rootYaw || 0); h.pose.rootPitch = wrapAng(h.pose.rootPitch || 0);
    }
  }
  if (!h.act) {
    // locomotion
    if (moving > 0.05) {
      const tf = Math.atan2(-mx, my);
      h.face = angLerp(h.face, tf, Math.min(1, dt * 14));
      const sp = 7.0 * moving * (h.rageT > 0 ? 1.2 : 1);
      h.x += Math.sin(tf) * sp * dt; h.z += Math.cos(tf) * sp * dt;
    }
    h.speedAmt += ((moving > 0.05 ? 1 : 0) - h.speedAmt) * Math.min(1, dt * 10);
    h.phase += dt * (6 + 5 * moving);
    heroRun(h.phase, h.speedAmt, h.target);
    // idle breathing
    if (h.speedAmt < 0.5) { h.target.torso[0] += Math.sin(G.time * 2) * 0.02; }
  }
  // collisions
  pushOut(h, 0.45);
  const r = Math.hypot(h.x, h.z); if (r > ARENA) { h.x *= ARENA / r; h.z *= ARENA / r; }

  smoothPose(h.pose, h.target, Math.min(1, dt * 30));
  applyPose(h.rig, h.pose);
  h.rig.root.position.set(h.x, 0, h.z);
  h.rig.root.rotation.y = h.face;
  h.rig.root.updateMatrixWorld(true);
  // blade segment in world space
  h.lastBase.copy(h.base); h.lastTip.copy(h.tip);
  h.base.copy(SWORD_HILT); h.sword.localToWorld(h.base);
  h.tip.copy(SWORD_TIP); h.sword.localToWorld(h.tip);
  const a = h.act, attacking = a && a.def.type && a.t >= a.def.active[0] - 0.05 && a.t <= a.def.active[1] + 0.05;
  tmpV.copy(SWORD_BASE); h.sword.localToWorld(tmpV);
  fx.trailPush(tmpV, h.tip, attacking);
  if (a && a.def.ground && h.tip.y < 0.25 && Math.random() < 0.7) fx.spark(h.tip.x, 0.05, h.tip.z, 3);
  if (a && a.def.type && a.t >= a.def.active[0] && a.t <= a.def.active[1]) heroHits(a);
  if (a && a.def.impact && !a.hitDone && a.t >= a.def.impact) { a.hitDone = true; impact(a); }
  // pickups
  for (let i = fx.orbs.length - 1; i >= 0; i--) {
    const o = fx.orbs[i];
    if (Math.hypot(o.x - h.x, o.z - h.z) < 1.3) {
      h.hp = Math.min(h.maxHp, h.hp + 150); sfx.play('heal'); fx.spark(o.x, 0.6, o.z, 10);
      scene.remove(o.m); fx.orbs.splice(i, 1);
    }
  }
  rageLight.position.set(h.x, 1.4, h.z);
}

function angLerp(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }

function pushOut(o, rad) {
  for (const c of colliders) {
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = c.r + rad;
    if (d < m && d > 1e-4) { o.x = c.x + dx / d * m; o.z = c.z + dz / d * m; }
  }
}

// distance from point to segment in xz
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz;
  let t = l ? ((px - ax) * vx + (pz - az) * vz) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

function bladeTouches(x, z, r, y0 = 0, y1 = 2) {
  const h = hero;
  for (let s = 0; s <= 4; s++) {
    const u = s / 4;
    const ax = h.lastBase.x + (h.base.x - h.lastBase.x) * u, az = h.lastBase.z + (h.base.z - h.lastBase.z) * u;
    const bx = h.lastTip.x + (h.tip.x - h.lastTip.x) * u, bz = h.lastTip.z + (h.tip.z - h.lastTip.z) * u;
    const by = h.lastTip.y + (h.tip.y - h.lastTip.y) * u, ay = h.lastBase.y + (h.base.y - h.lastBase.y) * u;
    if (Math.max(ay, by) < y0 - 0.4 || Math.min(ay, by) > y1 + 0.4) continue;
    if (segDist(x, z, ax, az, bx, bz) < r) return true;
  }
  return false;
}

function heroHits(a) {
  const d = a.def, h = hero, mult = (h.rageT > 0 ? 1.6 : 1) * dmgMul() * (a.name === 'SPIN_LOOP' ? (h.chargeMul || 1) : 1);
  let any = false;
  const bodyHit = (x, z, r) => {
    if (!d.body) return false;
    const dx = x - h.x, dz = z - h.z, dist = Math.hypot(dx, dz);
    return dist < d.body + r && (d.bodyAll || Math.abs(angLerp(h.face, Math.atan2(dx, dz), 1) - h.face) < 1.1);
  };
  for (const e of enemies) {
    if (e.dead || e.lastHit === h.attackId) continue;
    const def = ENEMY[e.type];
    if (bodyHit(e.x, e.z, def.radius)) { e.lastHit = h.attackId; any = true; damageEnemy(e, d.dmg * mult, d.kb, d.up || 0, true); continue; }
    if (bladeTouches(e.x, e.z, def.radius + 0.25 + (d.reach || 0), e.y, e.y + 1.8 * def.scale)) {
      e.lastHit = h.attackId; any = true;
      damageEnemy(e, d.dmg * mult, d.kb, d.up || 0, !!d.heavy);
    }
  }
  if (boss && !boss.dead && boss.state !== 'hidden' && boss.lastHit !== h.attackId && bladeTouches(boss.x, boss.z, 1.2, 0, 4)) {
    boss.lastHit = h.attackId; any = true; damageBoss(d.dmg * mult * 1.0);
  }
  if (any) { G.hitstop = Math.max(G.hitstop, (a.name === 'SPIN_LOOP' || a.name === 'RSPIN2' || a.name === 'SPIN1' || a.name === 'L4') ? 0.025 : 0.055); sfx.play('hit'); }
}

function impact(a) {
  const d = a.def, h = hero, mult = (h.rageT > 0 ? 1.6 : 1) * dmgMul();
  const cx = a.name === 'RAGE' ? h.x : h.tip.x, cz = a.name === 'RAGE' ? h.z : h.tip.z;
  fx.ring(cx, cz, d.radius * 1.2, a.name === 'RAGE' ? 0xff3010 : 0xffa060, 0.5);
  fx.spark(cx, 0.2, cz, 26);
  G.shake = Math.max(G.shake, a.name === 'RAGE' ? 1 : 0.55);
  sfx.play('slam');
  for (const e of enemies) {
    if (e.dead) continue;
    const dist = Math.hypot(e.x - cx, e.z - cz);
    if (dist < d.radius + ENEMY[e.type].radius && e.lastHit !== h.attackId + 0.5) {
      e.lastHit = h.attackId + 0.5;
      damageEnemy(e, d.dmg * mult * (1 - dist / (d.radius * 2)), d.kb, d.up, true, cx, cz);
    }
  }
  if (boss && !boss.dead && boss.state !== 'hidden' && Math.hypot(boss.x - cx, boss.z - cz) < d.radius + 1.2) damageBoss(d.dmg * mult * 0.8);
}

function addCombo() {
  G.combo++; G.comboT = 2.6; G.maxCombo = Math.max(G.maxCombo, G.combo);
  if (hero.rageT <= 0) hero.rage = Math.min(100, hero.rage + 1.4);
}

function damageEnemy(e, dmg, kb, up, heavy, ox, oz) {
  const def = ENEMY[e.type];
  e.hp -= dmg; addCombo();
  const sx = ox ?? hero.x, sz = oz ?? hero.z;
  let dx = e.x - sx, dz = e.z - sz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const k = def.armor && !heavy ? 0.25 : 1;
  e.vx += dx * kb * k; e.vz += dz * kb * k;
  fx.blood(e.x, e.y + 1.1 * def.scale, e.z, dx, dz, heavy ? 18 : 11);
  fx.decal(e.x + dx * 0.6, e.z + dz * 0.6, 0.9 + Math.random() * 0.8);
  if (e.hp <= 0) {
    e.dead = true; e.state = 'dead'; e.t = 0; e.vy = (up || 2) * (0.6 + Math.random() * 0.6);
    e.spin = (Math.random() - 0.5) * 6; G.ko++; gainExp(def.exp || 1);
    e.face = Math.atan2(-dx, -dz);
    if (Math.random() < (e.type === 'brute' ? 0.4 : 0.06)) fx.orb(e.x, e.z);
  } else if (!def.armor || heavy) {
    e.state = 'hit'; e.t = 0; e.vy = up ? up * 0.7 : e.vy;
  }
}

const SPIN_MOVES = new Set(['SPIN_IN', 'SPIN_LOOP', 'SPIN_OUT', 'L4', 'SPIN1', 'RSPIN2', 'REVSPIN', 'PIVOT']);
function hurtHero(dmg, fromX, fromZ) {
  const h = hero;
  if (h.iframe > 0 || h.dead || G.state !== 'play') return;
  // spinning attacks are invulnerable (charged spin and the spins inside combos)
  if (h.act && SPIN_MOVES.has(h.act.name)) return;
  h.hp -= dmg * (h.rageT > 0 ? 0.6 : 1);
  h.iframe = 0.6;
  sfx.play('hurt'); G.shake = Math.max(G.shake, 0.35);
  UI.hurt.classList.remove('on'); void UI.hurt.offsetWidth; UI.hurt.classList.add('on');
  const dx = h.x - fromX, dz = h.z - fromZ, l = Math.hypot(dx, dz) || 1;
  fx.blood(h.x, 1.2, h.z, dx / l, dz / l, 8, 0.7);
  if (h.hp <= 0) {
    h.hp = 0; h.dead = true; h.act = { name: 'DEATH', t: 0, def: HERO_ACTIONS.DEATH };
    G.slowmo = 0.35; setTimeout(() => endGame(false), 1800);
    return;
  }
  // charging the spin has super armour: damage is taken but the wind-up keeps going
  if (h.act && h.act.name === 'CHARGE') { G.shake = Math.max(G.shake, 0.25); return; }
  if (h.rageT <= 0 && (!h.act || h.act.name !== 'RAGE')) startAction('HURT');
}

// ======================================================================= enemy logic
function spawnEnemy(type) {
  const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 8;
  let x = hero.x + Math.cos(a) * d, z = hero.z + Math.sin(a) * d;
  const r = Math.hypot(x, z); if (r > ARENA - 1) { x *= (ARENA - 1) / r; z *= (ARENA - 1) / r; }
  const def = ENEMY[type];
  enemies.push({ type, x, z, y: 0, vx: 0, vz: 0, vy: 0, face: Math.atan2(hero.x - x, hero.z - z), hp: def.hp, state: 'walk', t: 0, cd: 1 + Math.random() * 2, phase: Math.random() * 6, dead: false, lastHit: -1, pose: {}, spin: 0, slot: Math.random() * Math.PI * 2 });
}

const _rootM = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _eu = new THREE.Euler();
function updateEnemies(dt) {
  let attackers = 0;
  for (const e of enemies) if (!e.dead && (e.state === 'windup' || e.state === 'strike')) attackers++;
  crowd.begin();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], def = ENEMY[e.type];
    e.t += dt;
    const dx = hero.x - e.x, dz = hero.z - e.z, dist = Math.hypot(dx, dz);
    if (e.dead) {
      e.vy -= 22 * dt; e.y = Math.max(0, e.y + e.vy * dt);
      if (e.y <= 0) { e.vy = 0; e.spin *= 0.8; }
      e.face += e.spin * dt;
      if (e.t > 2.2) e.y -= (e.t - 2.2) * 0.8 * dt * 4;
      if (e.t > 3.2) { enemies.splice(i, 1); continue; }
    } else {
      e.y = Math.max(0, e.y + e.vy * dt); e.vy = e.y > 0 ? e.vy - 22 * dt : 0;
      switch (e.state) {
        case 'walk': {
          // approach, or orbit at a distance when enough enemies are already attacking
          const want = attackers < 5 || e.type === 'brute' ? def.range * 0.85 : 3.2 + (e.slot % 1.5);
          let tx = dx, tz = dz;
          if (dist < want + 0.4 && attackers >= 5) { const s = Math.sign(Math.sin(e.slot)) || 1; tx = -dz * s; tz = dx * s; }
          const tl = Math.hypot(tx, tz) || 1;
          const sp = dist > want ? def.speed : (attackers >= 5 ? def.speed * 0.35 : 0);
          e.x += tx / tl * sp * dt; e.z += tz / tl * sp * dt;
          e.face = angLerp(e.face, Math.atan2(dx, dz), Math.min(1, dt * 6));
          e.phase += dt * (sp > 0.1 ? 8 * (def.speed / 3) : 2);
          e.cd -= dt;
          if (dist < def.range && e.cd <= 0 && attackers < 5 && !hero.dead) { e.state = 'windup'; e.t = 0; attackers++; }
          break;
        }
        case 'windup':
          e.face = angLerp(e.face, Math.atan2(dx, dz), Math.min(1, dt * 4));
          if (e.t >= def.wind) { e.state = 'strike'; e.t = 0; e.struck = false; }
          break;
        case 'strike':
          if (def.lunge && e.t < 0.22) { e.x += Math.sin(e.face) * def.lunge * dt; e.z += Math.cos(e.face) * def.lunge * dt; }
          if (!e.struck && e.t > 0.06) {
            e.struck = true;
            const ang = Math.abs(angLerp(e.face, Math.atan2(dx, dz), 1) - e.face);
            if (dist < def.range + 0.35 && ang < 1.0) hurtHero(def.dmg, e.x, e.z);
          }
          if (e.t > 0.55) { e.state = 'walk'; e.t = 0; e.cd = 1.2 + Math.random() * 2.2; }
          break;
        case 'hit':
          if (e.t > 0.42 && e.y <= 0) { e.state = 'walk'; e.t = 0; e.cd = 0.6 + Math.random(); }
          break;
      }
    }
    // knockback integration + separation
    e.x += e.vx * dt; e.z += e.vz * dt;
    const fr = Math.exp(-dt * (e.y > 0 ? 1 : 7)); e.vx *= fr; e.vz *= fr;
    if (!e.dead) {
      const minD = def.radius + 0.5;
      if (dist < minD && dist > 1e-3) { e.x = hero.x - dx / dist * minD; e.z = hero.z - dz / dist * minD; }
      pushOut(e, def.radius);
      const r = Math.hypot(e.x, e.z); if (r > ARENA + 2) { e.x *= (ARENA + 2) / r; e.z *= (ARENA + 2) / r; }
    }
  }
  // separation (cheap O(n^2), n <= ~40)
  for (let a = 0; a < enemies.length; a++) {
    const ea = enemies[a]; if (ea.dead) continue;
    const ra = ENEMY[ea.type].radius;
    for (let b = a + 1; b < enemies.length; b++) {
      const eb = enemies[b]; if (eb.dead) continue;
      const m = ra + ENEMY[eb.type].radius;
      const dx = eb.x - ea.x, dz = eb.z - ea.z, d2 = dx * dx + dz * dz;
      if (d2 < m * m && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (m - d) * 0.5;
        ea.x -= dx / d * push; ea.z -= dz / d * push; eb.x += dx / d * push; eb.z += dz / d * push;
      }
    }
  }
  // build instance matrices
  for (const e of enemies) {
    const def = ENEMY[e.type];
    const st = e.state, tt = st === 'windup' ? e.t / def.wind : st === 'strike' ? e.t / 0.18 : st === 'hit' ? e.t / 0.42 : st === 'dead' ? e.t / 0.5 : e.t;
    const target = gruntPose(st, tt, e.phase, e.target || (e.target = {}));
    smoothPose(e.pose, target, Math.min(1, dt * (st === 'strike' ? 40 : 16)));
    const s = def.scale;
    _rootM.compose(_p.set(e.x, e.y, e.z), _q.setFromAxisAngle(UP, e.face), _s.set(s, s, s));
    crowd.add(_rootM, e.pose, def.weapon, def.color);
  }
  crowd.end();
}

// ======================================================================= boss
function updateBoss(dt) {
  const b = boss; if (!b || b.state === 'hidden') return;
  dt *= b.speed;
  b.t += dt;
  const dx = hero.x - b.x, dz = hero.z - b.z, dist = Math.hypot(dx, dz), toHero = Math.atan2(dx, dz);
  const turn = (k) => { b.face = angLerp(b.face, toHero, Math.min(1, dt * k)); };
  switch (b.state) {
    case 'roar': if (b.t > 2.2) setBoss('walk'); break;
    case 'walk':
      turn(3);
      if (dist > 4.2) { b.x += Math.sin(b.face) * 3.4 * dt; b.z += Math.cos(b.face) * 3.4 * dt; }
      b.phase += dt * 5; b.cd -= dt;
      if (b.cd <= 0) {
        if (dist < 6) setBoss(Math.random() < 0.6 ? 'cleaveWind' : 'slamWind');
        else if (dist > 10) setBoss('chargeWind');
        else if (Math.random() < 0.5) setBoss('slamWind');
      }
      break;
    case 'cleaveWind': turn(2.5); if (b.t > 0.85) setBoss('cleave'); break;
    case 'cleave':
      if (!b.hitDone && b.t > 0.12) {
        b.hitDone = true; sfx.play('swingHeavy');
        const ang = Math.abs(angLerp(b.face, toHero, 1) - b.face);
        if (dist < 6.2 && ang < 1.4) hurtHero(160 * b.dmgMul, b.x, b.z);
      }
      if (b.t > 1.0) setBoss('walk', 0.8 + Math.random());
      break;
    case 'slamWind':
      if (b.t < 0.05 && !b.tele) { b.tele = true; b.tx = hero.x; b.tz = hero.z; fx.telegraph(b.tx, b.tz, 4, 1.15); }
      b.face = angLerp(b.face, Math.atan2(b.tx - b.x, b.tz - b.z), Math.min(1, dt * 4));
      { const dd = Math.hypot(b.tx - b.x, b.tz - b.z); if (dd > 3.2) { b.x += Math.sin(b.face) * 4.5 * dt; b.z += Math.cos(b.face) * 4.5 * dt; } }
      if (b.t > 1.15) setBoss('slam');
      break;
    case 'slam':
      if (!b.hitDone && b.t > 0.14) {
        b.hitDone = true; b.tele = false; sfx.play('slam'); G.shake = 0.9;
        fx.ring(b.tx, b.tz, 5.2, 0xff5020, 0.6); fx.spark(b.tx, 0.3, b.tz, 30);
        if (Math.hypot(hero.x - b.tx, hero.z - b.tz) < 4.1) hurtHero(220 * b.dmgMul, b.tx, b.tz);
      }
      if (b.t > 1.2) setBoss('walk', 1 + Math.random());
      break;
    case 'chargeWind': turn(5); if (b.t > 0.7) { setBoss('charge'); sfx.play('roar', 0.5); } break;
    case 'charge':
      b.x += Math.sin(b.face) * 15 * dt; b.z += Math.cos(b.face) * 15 * dt; b.phase += dt * 12;
      if (!b.hitDone && dist < 2.3) { b.hitDone = true; hurtHero(140 * b.dmgMul, b.x, b.z); }
      for (const e of enemies) if (!e.dead && Math.hypot(e.x - b.x, e.z - b.z) < 2) { e.vx += Math.sin(b.face) * 6; e.vz += Math.cos(b.face) * 6; }
      if (b.t > 0.95 || Math.hypot(b.x, b.z) > ARENA) setBoss('walk', 1.2);
      break;
    case 'stagger': if (b.t > 1.6) setBoss('walk', 0.4); break;
    case 'dead':
      b.deadT += dt;
      if (b.deadT > 3.2 && !G.result) endGame(true);
      break;
  }
  if (b.state !== 'dead') {
    pushOut(b, 1.0);
    const r = Math.hypot(b.x, b.z); if (r > ARENA) { b.x *= ARENA / r; b.z *= ARENA / r; }
    // hero cannot walk through the boss
    const d2 = Math.hypot(hero.x - b.x, hero.z - b.z);
    if (d2 < 1.6 && d2 > 1e-3) { hero.x = b.x + (hero.x - b.x) / d2 * 1.6; hero.z = b.z + (hero.z - b.z) / d2 * 1.6; }
  }
  const tt = { cleaveWind: b.t / 0.85, cleave: b.t / 0.3, slamWind: b.t / 0.9, slam: b.t / 0.18, chargeWind: b.t / 0.6, roar: b.t / 2.2, stagger: b.t / 1.6, dead: b.t / 1.4 }[b.state] ?? b.t;
  bossPose(b.state, tt, b.phase, b.target);
  smoothPose(b.pose, b.target, Math.min(1, dt * (b.state === 'cleave' || b.state === 'slam' ? 30 : 12)));
  applyPose(b.rig, b.pose);
  b.rig.root.position.set(b.x, 0, b.z); b.rig.root.rotation.y = b.face;
  if (b.state === 'roar' && Math.random() < 0.5) fx.ember(b.x, 1.5, b.z);
}

function setBoss(s, cd) { boss.state = s; boss.t = 0; boss.hitDone = false; if (cd !== undefined) boss.cd = cd; }

function damageBoss(dmg) {
  const b = boss;
  b.hp -= dmg; b.poise += dmg; addCombo();
  const dx = b.x - hero.x, dz = b.z - hero.z, l = Math.hypot(dx, dz) || 1;
  fx.blood(b.x - dx / l * 0.8, 2.4, b.z - dz / l * 0.8, -dx / l, -dz / l, 16, 1.2);
  fx.spark(b.x - dx / l, 2.2, b.z - dz / l, 6);
  if (b.hp <= 0 && !b.dead) {
    b.hp = 0; b.dead = true; setBoss('dead'); b.deadT = 0; G.slowmo = 0.25; G.ko++; G.shake = 1; gainExp(40);
    sfx.play('roar', 0.8);
    for (const e of enemies) if (!e.dead) { e.hp = 0; damageEnemy(e, 1, 8, 4, true, b.x, b.z); }
    return;
  }
  if (b.poise > 420 && b.state !== 'stagger') { b.poise = 0; setBoss('stagger'); sfx.play('clang'); }
  // enraged phase below half health: faster, plus a ring of reinforcements
  if (b.enrageOn && !b.enraged && b.hp < b.maxHp * 0.5) {
    b.enraged = true; b.speed *= 1.25; b.dmgMul *= 1.15;
    b.mat.emissive.setRGB(0.25, 0.02, 0.0);
    showBanner('激昂', `${stage().boss.name}が怒り狂う`); sfx.play('roar'); G.shake = 0.8;
    for (let i = 0; i < 8; i++) spawnEnemy(i % 2 ? 'lancer' : 'grunt');
  }
}

// ======================================================================= waves
function nextWave() {
  G.waveIdx++;
  const w = waveDef();
  G.spawnLeft = w.total; G.spawnT = 1.5;
  showBanner(w.label, w.sub);
  sfx.play('wave');
  if (w.boss) {
    boss = boss || makeBoss();
    const bc = stage().boss;
    boss.maxHp = boss.hp = bc.hp; boss.speed = bc.speed; boss.dmgMul = bc.dmg; boss.enrageOn = bc.enrage; boss.enraged = false;
    boss.dead = false; boss.poise = 0; boss.mat.color.setRGB(...bc.tint).multiplyScalar(2.0); boss.mat.emissive.setRGB(0, 0, 0);
    $('#boss .name').textContent = bc.name;
    // enter from the top of the screen (camera looks toward +Z), kept inside the arena
    boss.x = hero.x * 0.6; boss.z = hero.z + 14;
    const br = Math.hypot(boss.x, boss.z); if (br > ARENA - 4) { boss.x *= (ARENA - 4) / br; boss.z *= (ARENA - 4) / br; }
    if (Math.hypot(boss.x - hero.x, boss.z - hero.z) < 9) { boss.x = hero.x * 0.3; boss.z = hero.z * 0.3 - Math.sign(hero.z || 1) * 6; }
    boss.face = Math.atan2(hero.x - boss.x, hero.z - boss.z);
    setBoss('roar'); boss.cd = 2; boss.rig.root.visible = true;
    setTimeout(() => sfx.play('roar'), 400);
    UI.bossBar.hidden = false;
  }
}

function updateWaves(dt) {
  if (G.waveIdx < 0) { G.introT -= dt; if (G.introT <= 0) nextWave(); return; }
  const w = waveDef(); if (!w) return;
  const alive = enemies.filter(e => !e.dead).length;
  G.spawnT -= dt;
  if (G.spawnLeft > 0 && alive < w.max && G.spawnT <= 0) {
    if (!w.boss || boss.state !== 'roar') {
      spawnEnemy(pickType(w.mix));
      G.spawnLeft--;
    }
    G.spawnT = w.rate * (alive < 6 ? 0.3 : 1);
  }
  if (!w.boss && G.spawnLeft <= 0 && alive === 0) {
    G.waveDelay += dt;
    if (G.waveDelay > 1.4) { G.waveDelay = 0; nextWave(); }
  }
  UI.objective.textContent = w.boss ? `${stage().boss.name}を討て` : `残り ${G.spawnLeft + alive} 体`;
}

let bannerTimer = 0;
function showBanner(label, sub) {
  UI.waveLabel.textContent = label; $('#wave-sub').textContent = sub;
  UI.wave.classList.remove('show'); void UI.wave.offsetWidth; UI.wave.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => UI.wave.classList.remove('show'), 2600);
}

// ======================================================================= camera + HUD
const camPos = new THREE.Vector3(0, 9, -10), camLook = new THREE.Vector3();
function updateCamera(dt) {
  const portrait = window.innerWidth < window.innerHeight;
  const dist = portrait ? 11 : 8.6, height = portrait ? 9.6 : 7.0;
  let fx_ = hero.x, fz = hero.z;
  if (boss && !boss.dead && boss.state !== 'hidden' && waveDef()?.boss) {
    const d = Math.hypot(boss.x - hero.x, boss.z - hero.z);
    if (d < 16) { fx_ += (boss.x - hero.x) * 0.25; fz += (boss.z - hero.z) * 0.25; }
  }
  const tx = fx_, tz = fz - dist;
  const k = 1 - Math.exp(-dt * 6);
  camPos.x += (tx - camPos.x) * k; camPos.z += (tz - camPos.z) * k; camPos.y += (height - camPos.y) * k;
  camLook.set(camPos.x, 1.1, camPos.z + dist + 1.6);
  camera.position.copy(camPos);
  if (G.shake > 0) {
    const s = G.shake * G.shake * 0.35;
    camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s;
    G.shake = Math.max(0, G.shake - dt * 2.2);
  }
  camera.lookAt(camLook);
  sun.position.set(hero.x + 14, 20, hero.z + 22);
  sun.target.position.set(hero.x, 0, hero.z);
  fill.position.set(camera.position.x - 3, camera.position.y + 6, camera.position.z - 4); fill.target.position.set(hero.x, 0.8, hero.z);
}

const hudCache = {};
function setStyle(el, key, v) { if (hudCache[key] !== v) { hudCache[key] = v; el.style.transform = v; } }
function setText(el, key, v) { if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; } }
function updateHUD(dt) {
  const h = hero;
  h.hpLag += (h.hp - h.hpLag) * Math.min(1, dt * 3);
  setStyle(UI.hp, 'hp', `scaleX(${(h.hp / h.maxHp).toFixed(3)})`);
  setStyle(UI.hpLag, 'hpl', `scaleX(${(h.hpLag / h.maxHp).toFixed(3)})`);
  const rg = h.rageT > 0 ? h.rageT / 12 : h.rage / 100;
  setStyle(UI.rage, 'rg', `scaleX(${rg.toFixed(3)})`);
  const ready = h.rage >= 100 && h.rageT <= 0;
  if (hudCache.ready !== ready) { hudCache.ready = ready; UI.rageBtn.classList.toggle('ready', ready); document.body.classList.toggle('rage-ready', ready); }
  const raging = h.rageT > 0;
  if (hudCache.raging !== raging) { hudCache.raging = raging; document.body.classList.toggle('raging', raging); }
  setText(UI.ko, 'ko', String(G.ko));
  setText($('#lv'), 'lv', `Lv${h.level}`);
  setStyle($('#exp-fill'), 'exp', `scaleX(${h.level >= LEVEL_MAX ? 1 : (h.exp / expNeed(h.level)).toFixed(3)})`);
  if (G.comboT > 0) {
    G.comboT -= dt;
    setText(UI.comboN, 'cn', String(G.combo));
    if (hudCache.combo !== G.combo) { hudCache.combo = G.combo; UI.combo.classList.remove('pop'); void UI.combo.offsetWidth; UI.combo.classList.add('pop'); }
    UI.combo.hidden = G.combo < 2;
    if (G.comboT <= 0) { G.combo = 0; UI.combo.hidden = true; }
  }
  if (boss && !UI.bossBar.hidden) setStyle(UI.bossFill, 'boss', `scaleX(${(boss.hp / boss.maxHp).toFixed(3)})`);
}

// ======================================================================= flow
function applyEnv(env) {
  scene.fog.color.setHex(env.fog); scene.fog.density = env.density; scene.background = scene.fog.color;
  hemi.color.setHex(env.sky); hemi.groundColor.setHex(env.gnd); hemi.intensity = env.hemi;
  sun.color.setHex(env.sun); sun.intensity = env.sunI; rim.color.setHex(env.rim); fill.intensity = env.fill ?? 1.6;
  if (groundMat) groundMat.color.setHex(env.ground);
  scene.environmentIntensity = env.envI;
}

// progress (stage reached, level) kept per viewer; the game works without it
const SAVE_KEY = 'ironwake-save-v1';
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } }
function writeSave(d) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) { /* storage unavailable */ } }
function refreshContinue() {
  const sv = loadSave(), btn = $('#btn-continue');
  if (sv && STAGES[sv.stage]) { btn.hidden = false; btn.textContent = `続きから（${STAGES[sv.stage].name}・Lv${sv.level}）`; }
  else btn.hidden = true;
}

function resetGame(keepLevel = false) {
  for (const e of enemies) e.dead = true;
  enemies.length = 0; fx.clear(); crowd.begin(); crowd.end();
  if (!keepLevel) { hero.level = 1; hero.exp = 0; }
  hero.maxHp = 1000 + 90 * (hero.level - 1); hero.comboIdx = 0;
  hero.x = 0; hero.z = 0; hero.face = 0; hero.hp = hero.maxHp; hero.hpLag = hero.maxHp; hero.rage = 0; hero.rageT = 0;
  hero.act = null; hero.dead = false; hero.iframe = 0; hero.mat.emissive.setRGB(0, 0, 0); rageLight.intensity = 0;
  if (boss) { boss.rig.root.visible = false; boss.state = 'hidden'; boss.hp = boss.maxHp; boss.dead = false; boss.poise = 0; }
  Object.assign(G, { time: 0, ko: 0, combo: 0, maxCombo: 0, comboT: 0, hitstop: 0, shake: 0, slowmo: 1, waveIdx: -1, spawnLeft: 0, waveDelay: 0, result: null, playTime: 0 });
  UI.bossBar.hidden = true; UI.combo.hidden = true;
  document.body.classList.remove('raging', 'rage-ready');
  for (const k in hudCache) delete hudCache[k];
}

function startGame(stageIdx = 0, level = 1, exp = 0) {
  sfx.unlock(); sfx.play('ui'); sfx.startMusic();
  hero.level = level; hero.exp = exp;
  resetGame(true);
  G.stageIdx = stageIdx; applyEnv(stage().env);
  UI.title.hidden = true; UI.result.hidden = true; UI.pause.hidden = true; UI.hud.hidden = false;
  G.state = 'play'; input.clear();
  // stage title card, then the first wave
  showBanner(stage().name, stage().place); G.introT = 2.6;
}

function endGame(win) {
  if (G.result) return;
  G.result = win ? 'win' : 'lose';
  G.state = 'over';
  sfx.stopMusic();
  const t = G.playTime;
  const score = G.ko * 100 + G.maxCombo * 40 + (win ? 20000 : 0) - Math.floor(t) * 10;
  const rank = !win ? '—' : score > 38000 ? 'S' : score > 32000 ? 'A' : score > 26000 ? 'B' : 'C';
  const st = stage(), next = STAGES[G.stageIdx + 1];
  const last = win && !next;
  $('#result-title').textContent = last ? '全戦場制覇' : win ? `${st.name} 突破` : '力尽きた';
  $('#result-sub').textContent = win ? `${st.boss.name}は鉄塊の前に倒れた` : `${st.name}・${waveDef()?.label ?? ''}で倒れた`;
  $('#r-lv').textContent = hero.level;
  const nb = $('#btn-next');
  nb.hidden = !win || !next;
  if (win && next) { nb.textContent = `次の戦場へ（${next.name}）`; writeSave({ stage: G.stageIdx + 1, level: hero.level, exp: hero.exp }); }
  if (last) writeSave({ stage: G.stageIdx, level: hero.level, exp: hero.exp, cleared: true });
  $('#r-ko').textContent = G.ko; $('#r-combo').textContent = G.maxCombo;
  $('#r-time').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  $('#r-rank').textContent = rank;
  UI.result.classList.toggle('win', win);
  setTimeout(() => { UI.result.hidden = false; UI.hud.hidden = true; }, win ? 200 : 600);
}

function setPaused(p) {
  if (G.state !== 'play' && G.state !== 'pause') return;
  G.state = p ? 'pause' : 'play';
  UI.pause.hidden = !p;
  if (sfx.ctx) p ? sfx.ctx.suspend() : sfx.ctx.resume();
  input.clear();
}

// ======================================================================= main loop
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsCheck = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  // adaptive quality: drop resolution / shadows if frames are slow
  fpsAcc += dt; fpsN++; fpsCheck += dt;
  if (fpsCheck > 2.5 && G.state === 'play') {
    const avg = fpsAcc / fpsN; fpsAcc = 0; fpsN = 0; fpsCheck = 0;
    if (avg > 1 / 45 && QUALITY.ratio > 1) { QUALITY.ratio = Math.max(1, QUALITY.ratio - 0.25); renderer.setPixelRatio(QUALITY.ratio); resize(); }
    else if (avg > 1 / 40 && QUALITY.shadows) { QUALITY.shadows = false; sun.castShadow = false; }
  }
  if (G.state === 'play' || G.state === 'over') {
    if (input.consume('pause') && G.state === 'play') { setPaused(true); }
    else {
      if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.08; }
      G.slowmo += (1 - G.slowmo) * Math.min(1, dt * 0.8);
      dt *= G.slowmo;
      // substeps > 1 only in automated tests (software GL renders far below real time)
      for (let i = 0; i < (G.substeps || 1); i++) {
        G.time += dt; if (G.state === 'play') G.playTime += dt;
        updateHero(dt); updateEnemies(dt); updateBoss(dt);
        if (G.state === 'play') updateWaves(dt);
        fx.update(dt);
      }
      updateHUD(dt);
    }
  } else if (G.state === 'pause') {
    if (input.consume('pause')) setPaused(false);
  } else if (G.state === 'title' && hero) {
    // idle hero on the title backdrop
    G.time += dt; heroRun(G.time * 2, 0, hero.target); smoothPose(hero.pose, hero.target, 0.2); applyPose(hero.rig, hero.pose);
    hero.face = Math.PI + Math.sin(G.time * 0.3) * 0.25; hero.rig.root.rotation.y = hero.face;
    fx.update(dt);
  }
  if (G.state === 'debug') return;
  if (hero) updateCamera(dt);
  renderer.render(scene, camera);
}

// ======================================================================= debug (pose inspection for automated tests)
function debugPose(name, t, yaw = 0.6, dist = 5, who = 'hero') {
  G.state = 'debug'; UI.title.hidden = true; UI.hud.hidden = true;
  const tgt = {};
  if (who === 'hero') {
    if (typeof name === 'object') Object.assign(tgt, name);
    else if (name === 'idle') heroRun(0, 0, tgt); else if (name === 'run') heroRun(t, 1, tgt);
    else sampleKeys(HERO_ACTIONS[name].keys, t, tgt);
    hero.pose = tgt; applyPose(hero.rig, tgt); hero.x = 0; hero.z = 0; hero.face = 0;
    hero.rig.root.position.set(0, 0, 0); hero.rig.root.rotation.y = 0;
  } else if (who === 'boss') {
    boss.rig.root.visible = true; boss.state = name; bossPose(name, t, t * 6, tgt); applyPose(boss.rig, tgt);
    boss.rig.root.position.set(0, 0, 0); boss.rig.root.rotation.y = 0; hero.rig.root.position.set(50, 0, 50);
  } else {
    enemies.length = 0; enemies.push({ type: who, x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, face: 0, hp: 1, state: name, t, phase: t * 6, dead: false, pose: gruntPose(name, t, t * 6, {}) });
    hero.rig.root.position.set(50, 0, 50);
    crowd.begin();
    const def = ENEMY[who]; const s = def.scale;
    _rootM.compose(_p.set(0, 0, 0), _q.identity(), _s.set(s, s, s)); crowd.add(_rootM, enemies[0].pose, def.weapon, def.color); crowd.end();
  }
  const h = who === 'boss' ? 2.3 : 1;
  camera.position.set(Math.sin(yaw) * dist * h, 1.4 * h, Math.cos(yaw) * dist * h); camera.lookAt(0, 1.0 * h, 0);
  sun.position.set(14, 20, 22); sun.target.position.set(0, 0, 0);
  renderer.render(scene, camera);
}

// ======================================================================= boot
// surface any uncaught failure on the loading screen instead of hanging silently
function showBootError(msg) {
  if (G.state !== 'loading') return;
  UI.loadText.textContent = `起動に失敗した（${msg}）。この表示を伝えてほしい。`;
}
window.addEventListener('error', e => showBootError(e.message || 'error'));
window.addEventListener('unhandledrejection', e => showBootError((e.reason && e.reason.message) || String(e.reason)));
setTimeout(() => showBootError('60秒以内に起動しなかった'), 60000);

async function boot() {
  try {
    await loadAll();
  } catch (err) {
    UI.loadText.textContent = `データの読み込みに失敗した（${err && err.message || err}）。再読み込みしてほしい。`;
    console.error(err); return;
  }
  try {
    buildWorld();
    fx = new FX();
    for (const m of [A.grunt.torso.material, A.weapons.gsword.material]) { m.color.setScalar(1.6); m.envMapIntensity = 1.4; }
  crowd = new Crowd(A.grunt, A.skel, { gsword: A.weapons.gsword, club: A.weapons.club, spear: A.props.spear }, 72);
    hero = makeHero();
    boss = makeBoss(); boss.rig.root.visible = false; boss.state = 'hidden';
    // warm up shaders so the first fight frame does not stall
    renderer.compile(scene, camera);
  } catch (err) {
    UI.loadText.textContent = `起動に失敗した（${err && err.message || err}）。この表示を伝えてほしい。`;
    console.error(err); return;
  }
  G.state = 'title'; applyEnv(STAGES[0].env); refreshContinue();
  $('#loading').hidden = true; UI.title.hidden = false;
  window.__game = { G, hero: () => hero, enemies, boss: () => boss, input, startGame, QUALITY, renderer, debugPose, gainExp, STAGES, hurtHero, startAction };
}

UI.start.addEventListener('click', () => startGame(0, 1, 0));
$('#btn-continue').addEventListener('click', () => { const sv = loadSave(); if (sv) startGame(sv.stage, sv.level, sv.exp || 0); });
// retry keeps the level reached on this battlefield
$('#btn-retry').addEventListener('click', () => startGame(G.stageIdx, hero.level, hero.exp));
$('#btn-next').addEventListener('click', () => startGame(G.stageIdx + 1, hero.level, hero.exp));
$('#btn-title').addEventListener('click', () => { UI.result.hidden = true; UI.title.hidden = false; resetGame(); G.state = 'title'; refreshContinue(); });
$('#btn-pause').addEventListener('click', () => setPaused(true));
$('#btn-resume').addEventListener('click', () => setPaused(false));
$('#btn-quit').addEventListener('click', () => { setPaused(false); G.state = 'title'; sfx.stopMusic(); resetGame(); UI.pause.hidden = true; UI.hud.hidden = true; UI.title.hidden = false; refreshContinue(); });
$('#btn-sound').addEventListener('click', (e) => { sfx.unlock(); sfx.setMuted(!sfx.muted); e.currentTarget.classList.toggle('off', sfx.muted); e.currentTarget.setAttribute('aria-pressed', String(sfx.muted)); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') setPaused(true); });

requestAnimationFrame(frame);
boot();
