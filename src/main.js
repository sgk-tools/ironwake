import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { EXTRA_WEAPONS } from './extra-weapons.js';
import { BUILTIN_WEAPONS, STANDARD_DECO, applyGrowth, pulseWeapon, GROW_TEXT, GROW_MAX } from './weapons.js';
import { JOINTS, ORDER, HERO, HERO_ACTIONS, heroRun, sampleKeys, smoothPose, lerpPose, gruntPose, bossPose, CUT_VARIANTS, DOUBLE_CUTS } from './anim.js';
import { SLASH_LESSONS, SLASH_DIRECTIONS } from './slash-lessons.js';

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
  objective: $('#objective'), statSelect: $('#stat-select'),
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
// cache-busting version (set by the public build) so updated assets are not served from a stale cache
const AV = window.ASSET_V ? `?v=${window.ASSET_V}` : '';
const loadG = (n) => {
  manager.itemStart(n);
  return fetch(`assets/${n}.gltf.json${AV}`)
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
const loadT = (n) => new Promise((res, rej) => texLoader.load(`assets/${n}${AV}`, res, undefined, rej));

let A = null;
async function loadAll() {
  const [hero, grunt, boss, sword, weapons, props, skel, gcol, gnrm, grough, sky] = await Promise.all([
    loadG('hero'), loadG('grunt'), loadG('boss'), loadG('sword'), loadG('weapons'), loadG('props'),
    fetch(`assets/skeleton.json${AV}`).then(r => r.json()),
    loadT('ground_col.jpg'), loadT('ground_nrm.jpg'), loadT('ground_rough.jpg'), loadT('sky.jpg'),
  ]);
  const parts = (g) => { const o = {}; g.scene.traverse(c => { if (c.isMesh) o[c.name] = c; }); return o; };
  A = { hero: parts(hero), grunt: parts(grunt), boss: parts(boss), sword: parts(sword), weapons: parts(weapons), props: parts(props), skel, gcol, gnrm, grough, sky };
  // baked models for the built-in weapons that have one (the others are built in code); a missing file
  // just falls back to the coded shape
  A.wglb = {};
  await Promise.all(BUILTIN_WEAPONS.filter(w => w.glb).map(w => loadG(w.glb).then(g => { A.wglb[w.glb] = parts(g); }).catch(() => {})));
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
    this.wOff = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2, Math.PI / 2, 0));   // edge leads, as for the hero
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
    this.dropMat = new THREE.MeshStandardMaterial({ color: 0x3a0202, roughness: 0.45, metalness: 0, envMapIntensity: 0.25 });
    this.drops = new THREE.InstancedMesh(dg, this.dropMat, this.dropMax);
    this.drops.frustumCulled = false; this.drops.count = 0; scene.add(this.drops);
    this.dp = []; // {x,y,z,vx,vy,vz,life,s}
    // ground decals
    this.decMax = 140;
    const tex = new THREE.CanvasTexture(splatCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    this.decMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, metalness: 0, envMapIntensity: 0.15, color: 0x2a0202, polygonOffset: true, polygonOffsetFactor: -2 });
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
    // hit flashes: additive billboards (star bursts and long slash streaks)
    this.flMax = 80;
    this.flMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: new THREE.CanvasTexture(starCanvas()) });
    this.flashMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.flMat, this.flMax);
    this.flashMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.flMax * 3), 3);
    this.flashMesh.frustumCulled = false; this.flashMesh.count = 0; scene.add(this.flashMesh);
    this.fl = [];
    // blood mist: soft dark-red puffs that swell and fade
    this.miMax = 90;
    this.miMat = new THREE.MeshBasicMaterial({ color: 0x5a0606, transparent: true, depthWrite: false, opacity: 0.55, map: new THREE.CanvasTexture(puffCanvas()) });
    this.mistMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.miMat, this.miMax);
    this.mistMesh.frustumCulled = false; this.mistMesh.count = 0; scene.add(this.mistMesh);
    this.mi = [];
    this._rq = new THREE.Quaternion(); this._fwd = new THREE.Vector3(0, 0, 1);
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
  // bright impact: a star burst plus a long streak across the cut, tinted for kills
  hitFlash(x, y, z, big = false, kill = false) {
    const add = (o) => { if (this.fl.length >= this.flMax) this.fl.shift(); this.fl.push(o); };
    const col = kill ? [1.0, 0.55, 0.3] : [1.0, 0.85, 0.7];
    add({ x, y, z, w: big ? 2.2 : 1.5, h: big ? 2.2 : 1.5, rot: Math.random() * 6, life: 0.14, max: 0.14, col });
    add({ x, y, z, w: big ? 4.2 : 3.0, h: 0.22, rot: Math.random() * 6, life: 0.16, max: 0.16, col: [1.0, 0.95, 0.85] });
    if (kill) add({ x, y, z, w: 3.4, h: 0.16, rot: Math.random() * 6, life: 0.2, max: 0.2, col: [1.0, 0.4, 0.2] });
  }
  mist(x, y, z, dx, dz, n = 3) {
    for (let i = 0; i < n; i++) {
      if (this.mi.length >= this.miMax) this.mi.shift();
      this.mi.push({ x: x + (Math.random() - 0.5) * 0.3, y: y + (Math.random() - 0.5) * 0.3, z: z + (Math.random() - 0.5) * 0.3,
        vx: dx * (1 + Math.random() * 2), vy: 0.3 + Math.random() * 0.6, vz: dz * (1 + Math.random() * 2), life: 0.7, max: 0.7, s: 0.4 + Math.random() * 0.4 });
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
  trailPush(base, tip, on, chargedSpin) {
    this.trailHist.unshift([base.clone(), tip.clone()]);
    if (this.trailHist.length > this.trailN) this.trailHist.pop();
    if (on) this.trailMat.uniforms.color.value.setHex(chargedSpin ? 0xffe6a2 : 0xff9a60);
    const strength = on ? (chargedSpin ? 1.65 : 1) : 0;
    this.trailOn += (strength - this.trailOn) * (on ? 0.6 : 0.25);
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
    // flashes (billboards spun around the view axis)
    n = 0;
    for (let i = this.fl.length - 1; i >= 0; i--) { const f = this.fl[i]; f.life -= dt; if (f.life <= 0) this.fl.splice(i, 1); }
    for (const f of this.fl) {
      const u = f.life / f.max, k = u * u;
      _q.copy(camera.quaternion).multiply(this._rq.setFromAxisAngle(this._fwd, f.rot));
      _m.compose(_v.set(f.x, f.y, f.z), _q, _s.set(f.w * (0.6 + 0.4 * (1 - u)) , f.h * (0.5 + 0.5 * u), 1));
      this.flashMesh.setMatrixAt(n, _m);
      this.flashMesh.instanceColor.setXYZ(n++, f.col[0] * k * 2, f.col[1] * k * 2, f.col[2] * k * 2);
    }
    this.flashMesh.count = n; this.flashMesh.instanceMatrix.needsUpdate = true; this.flashMesh.instanceColor.needsUpdate = true;
    // blood mist
    n = 0;
    for (let i = this.mi.length - 1; i >= 0; i--) { const m = this.mi[i]; m.life -= dt; if (m.life <= 0) { this.mi.splice(i, 1); continue; }
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.vx *= 0.92; m.vz *= 0.92; }
    for (const m of this.mi) {
      const u = 1 - m.life / m.max, sc = m.s * (1 + u * 2.2) * (1 - u * 0.3);
      _m.compose(_v.set(m.x, m.y, m.z), camera.quaternion, _s.set(sc, sc, sc)); this.mistMesh.setMatrixAt(n++, _m);
    }
    this.mistMesh.count = n; this.mistMesh.instanceMatrix.needsUpdate = true;
    this.miMat.opacity = 0.5;
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
    this.fl.length = 0; this.mi.length = 0;
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
function starCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,230,200,0.9)'); gr.addColorStop(0.5, 'rgba(255,140,60,0.25)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[128, 10], [10, 128]]) {
    const lg = g.createLinearGradient(64 - w / 2, 64 - h / 2, 64 + w / 2, 64 + h / 2);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
  return c;
}
function puffCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
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
const DIFFICULTIES = {
  easy: { hp: 1, damage: 1, speed: 1 },
  normal: { hp: 1, damage: 1, speed: 1 },
  hard: { hp: 1.35, damage: 1.4, speed: 1.15 },
};
const G = { substeps: 1, stageIdx: 0, difficulty: 'normal', mode: 'campaign', introT: 0, state: 'loading', time: 0, ko: 0, combo: 0, maxCombo: 0, comboT: 0, hitstop: 0, shake: 0, slowmo: 1, waveIdx: -1, spawnLeft: 0, alive: 0, waveDelay: 0, result: null };
const landscapeTouch = matchMedia('(orientation: landscape) and (pointer: coarse)');
let resumeAfterRotation = false;

function updateOrientationGuard() {
  const blocked = landscapeTouch.matches;
  $('#game-shell').inert = blocked;
  $('#orientation-guard').hidden = !blocked;
  input.clear(); input.resetButtons(); input.resetStick(); input.keys.clear();
  if (hero) hero.pendingActions = {};
  if (blocked) {
    resumeAfterRotation = sfx.ctx?.state === 'running';
    if (resumeAfterRotation) sfx.ctx.suspend();
  } else if (resumeAfterRotation) {
    resumeAfterRotation = false;
    if (G.state !== 'pause') sfx.ctx?.resume();
  }
  if (!blocked && G.state === 'stat-select') renderer.render(scene, camera);
}
landscapeTouch.addEventListener('change', updateOrientationGuard);
updateOrientationGuard();

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
  {
    name: '第四戦場', place: '凍てつく峠',
    // larger boss with a three-hit chain and a leaping slam on top of the basic set
    boss: { name: '鎖斧の巨人', hp: 8200, speed: 1.3, dmg: 1.4, tint: [0.72, 0.86, 0.95], scale: 2.6, enrage: false,
      attacks: ['cleave', 'slam', 'charge', 'combo', 'leap'] },
    env: { fog: 0x3a4652, density: 0.019, sky: 0xc8d6e6, gnd: 0x46525e, hemi: 1.9, sun: 0xe4eeff, sunI: 3.3, ground: 0xd2d8e0, envI: 1.9, rim: 0x80b0ff, fill: 1.8 },
    waves: [
      { label: '第一波', sub: '黒鉄の騎士が峠を塞ぐ', total: 70, max: 30, mix: { grunt: 0.55, lancer: 0.25, knight: 0.2 }, rate: 0.26 },
      { label: '第二波', sub: '騎士と重装の亡者が押し寄せる', total: 95, max: 34, mix: { grunt: 0.35, lancer: 0.25, brute: 0.15, knight: 0.25 }, rate: 0.22 },
      { label: '第三波', sub: '吹雪の中から軍勢が湧き出る', total: 120, max: 40, mix: { grunt: 0.35, lancer: 0.25, brute: 0.15, knight: 0.25 }, rate: 0.18 },
      { label: '決戦', sub: '鎖斧の巨人を討て', total: 9999, max: 14, mix: { grunt: 0.5, knight: 0.3, lancer: 0.2 }, rate: 1.0, boss: true },
    ],
  },
  {
    name: '最終戦場', place: '黒鉄の魔城',
    // final boss: every attack, enrages at half health
    boss: { name: '黒鉄の魔王', hp: 10800, speed: 1.36, dmg: 1.5, tint: [0.52, 0.46, 0.58], scale: 2.85, enrage: true, glow: [0.07, 0.0, 0.03],
      attacks: ['cleave', 'slam', 'charge', 'combo', 'leap', 'sweep'] },
    env: { fog: 0x30223a, density: 0.02, sky: 0xbaa6cc, gnd: 0x3c2e44, hemi: 1.85, sun: 0xffc4a8, sunI: 3.3, ground: 0xb4a8b8, envI: 1.8, rim: 0xff4060, fill: 1.9 },
    waves: [
      { label: '第一波', sub: '魔城の門を守る亡者を斬れ', total: 80, max: 32, mix: { grunt: 0.45, lancer: 0.25, brute: 0.1, knight: 0.2 }, rate: 0.24 },
      { label: '第二波', sub: '近衛の騎士が隊列を組む', total: 105, max: 36, mix: { grunt: 0.3, lancer: 0.25, brute: 0.15, knight: 0.3 }, rate: 0.2 },
      { label: '第三波', sub: '魔城の全軍が押し寄せる', total: 140, max: 42, mix: { grunt: 0.3, lancer: 0.25, brute: 0.2, knight: 0.25 }, rate: 0.16 },
      { label: '決戦', sub: '黒鉄の魔王を討て', total: 9999, max: 16, mix: { grunt: 0.4, knight: 0.35, lancer: 0.25 }, rate: 0.9, boss: true },
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
  // armoured swordsman (stages 4-5): quick, tough, shrugs off light hits like the brute
  knight: { hp: 120, speed: 3.6, dmg: 70, range: 1.95, wind: 0.5, scale: 1.12, radius: 0.48, weapon: 'gsword', armor: true, color: new THREE.Color(0.46, 0.48, 0.56), exp: 4 },
};
ENEMY.grunt.exp = 1;
const enemies = [];

function makeHero() {
  const rig = buildRig(A.hero, A.skel);
  // the hero material is shared by every part; clone it so rage glow does not leak elsewhere
  const mat = A.hero.torso.material.clone();
  // the baked albedo is very dark (black steel, black cape); lift it so the hero reads against the ground
  // blackened iron: dark, low-sheen base; the baked edge wear stays as a dull silver on rims
  mat.color.setRGB(0.78, 0.8, 0.86); mat.envMapIntensity = 0.9; mat.metalness = 0.75;
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor * 1.25 + 0.18, 0.0, 1.0);');
  };
  rig.root.traverse(o => { if (o.isMesh) o.material = mat; });
  const sw = new THREE.Mesh(A.sword.sword.geometry, A.sword.sword.material);
  sw.castShadow = true;
  // grip mount: blade forward from the fist, turned 90 deg about its own length so the edge (not the flat)
  // leads in the swings
  sw.rotation.set(Math.PI / 2, Math.PI / 2, 0); sw.position.set(0, -0.085, 0.0);
  rig.j.handR.add(sw);
  // optional extra weapons (src/extra-weapons.js): mounted in the same grip, shown when selected
  const weapons = { standard: { mesh: sw, blade: STANDARD_BLADE, deco: STANDARD_DECO } };
  // built-in weapon types (src/weapons.js), then any locally registered extras
  for (const w of [...BUILTIN_WEAPONS, ...EXTRA_WEAPONS]) {
    const baked = w.glb && A.wglb[w.glb]?.[w.glb];
    const mesh = baked ? new THREE.Mesh(baked.geometry, baked.material) : w.make();
    if (baked) { mesh.name = 'blade'; mesh.castShadow = true; }
    mesh.position.copy(sw.position); mesh.rotation.copy(sw.rotation); mesh.visible = false;
    rig.j.handR.add(mesh);
    weapons[w.id] = { mesh, blade: w.blade, deco: w.deco };
  }
  scene.add(rig.root);
  return {
    rig, mat, sword: sw, weapons, blade: STANDARD_BLADE,
    x: 0, z: 0, vx: 0, vz: 0, face: 0, hp: 1000, maxHp: 1000, hpLag: 1000,
    rage: 0, rageT: 0, act: null, queued: null, iframe: 0, phase: 0, speedAmt: 0, pose: {}, target: {},
    lastBase: new THREE.Vector3(), lastTip: new THREE.Vector3(), base: new THREE.Vector3(), tip: new THREE.Vector3(),
    attackId: 0, dead: false, level: 1, exp: 0, stats: loadStats(),
    comboIdx: 0, lightCount: 0, lightRecovery: 0, neutralChain: 0, spinLoops: 0, pendingActions: {},
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
  return { rig, axe, mat: bmat, speed: 1, dmgMul: 1, enraged: false, x: 0, z: 30, face: Math.PI, hp: 3200, maxHp: 3200, state: 'roar', t: 0, phase: 0, poise: 0, pose: {}, target: {}, cd: 2, lastHit: -1, dead: false, deadT: 0, hitDone: false, tx: 0, tz: 0, y: 0, scale: 2.3, attacks: new Set(['cleave', 'slam', 'charge']), strikeIn: null, glinted: false, hitN: 0 };
}

// ======================================================================= hero logic
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const STANDARD_BLADE = {
  hilt: new THREE.Vector3(0, 0.45, 0),
  trail: new THREE.Vector3(0, 1.15, 0),
  tip: new THREE.Vector3(0, 2.1, 0),
};

function startAction(name) {
  const h = hero, def = HERO_ACTIONS[name];
  if (name !== 'SPIN_LOOP' && name !== 'SPIN_OUT') { h.pose.rootYaw = wrapAng(h.pose.rootYaw || 0); h.pose.rootPitch = wrapAng(h.pose.rootPitch || 0); }
  h.act = { name, t: 0, def, hitDone: false, swung: false, startT: G.time };
  h.faceBossUntil = 0;
  if (LINK_MOVES.has(name)) noteLink();
  h.attackId++;
  const aim = h.aimNext !== false; h.aimNext = true;
  if (aim && def.type && name !== 'SPIN_LOOP' && name !== 'SPIN_OUT') {
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
    sfx.play('dodge');
  }
}

// Neutral light chains have a pool of moves per step; awakening has its own chain.
function comboChain() {
  const technique = hero.stats.technique;
  if (hero.rageT > 0) {
    return [['L1', 'L1B', 'LOWSWEEP', 'CROSS'], ['RFLIP', 'WHEEL'], ['L2', 'XCUT', 'REVSPIN', 'L2B'], ['RSPIN2', 'SPIN1'], ...(hero.level >= 3 ? [['L4', 'SPIN1', 'REVSPIN']] : []), ...(hero.level >= 5 ? [['RFLIP']] : []), ['RLEAP']];
  }
  // higher technique adds quick / weighty versions and double cuts to the pools, and longer strings
  const t = technique;
  return [['L1', 'L1B', 'VCUT', 'LOWSWEEP', 'CROSS', ...(t >= 5 ? ['L1~F', 'CROSS~F'] : []), ...(t >= 8 ? ['HIGHCUT+LOWSWEEP2'] : [])],
    ['L2', 'XCUT', 'SPIN1', 'REVSPIN', 'BACKCUT', 'L2B', ...(t >= 5 ? ['L2~F', 'L2B~F'] : []), ...(t >= 8 ? ['L2+L1'] : [])],
    ['L3', 'VCUT', 'STAB', 'SHOULDER', 'WHEEL', 'DRAG', ...(t >= 6 ? ['DOWNCUT~H', 'RISECUT~F'] : []), ...(t >= 9 ? ['DOWNCUT+RISECUT'] : [])],
    ...(t >= 2 ? [['L4', 'SPIN1', 'REVSPIN', 'L1B', 'CROSS2', ...(t >= 6 ? ['CROSS2~H', 'LOWSWEEP2~F'] : [])]] : []),
    ...(t >= 3 ? [['L5', 'XCUT', 'LOWSWEEP', 'DRAG', 'L2B', ...(t >= 7 ? ['LOWSWEEP~H', 'CROSS+L1'] : [])]] : []),
    ...(t >= 4 ? [['L6', 'VAULT', ...(t >= 8 ? ['L2B+LOWSWEEP2'] : [])]] : []),
    ...(t >= 6 ? [['STEP_CUT', 'HIGHCUT', 'DOWNCUT']] : []),
    ...(t >= 7 ? [['JUMP_SPIN', 'CROSS2~H', 'RISECUT+CROSS']] : []),
    ...(t >= 9 ? [['RISECUT+CROSS2', 'DOWNCUT~H', 'L2B+DOWNCUT']] : [])];
}
function pickFrom(pool, prev) {
  const opts = pool.filter(n => n !== prev);
  const list = opts.length ? opts : pool;
  return list[Math.floor(Math.random() * list.length)];
}
// Direction of the stick relative to the hero's current facing, read when the attack is pressed
// (before this frame's movement turns the hero). null = no direction.
function readDir() {
  const [mx, my] = input.move();
  if (Math.hypot(mx, my) < 0.3) return null;
  const rel = angLerp(hero.face, Math.atan2(-mx, my), 1) - hero.face;   // < 0: hero's right
  if (Math.abs(rel) < 0.8) return 'fwd';
  if (Math.abs(rel) > 2.3) return 'back';
  return rel < 0 ? 'right' : 'left';
}
// Keep the facing at the start of a chain as the reference for buffered commands.
const CUT_ANGLES = {
  FWD: 0, L45: Math.PI / 4, L90: Math.PI / 2, L135: Math.PI * 3 / 4, BACK: Math.PI,
  R45: -Math.PI / 4, R90: -Math.PI / 2, R135: -Math.PI * 3 / 4,
};
const DIRECTIONAL_CUTS = {
  FWD: { open: 'DASH', light: ['JUMP_FLIP', 'L6', 'JUMP_SPIN', 'L5'], heavy: ['JUMP_FLIP', 'JUMP_SPIN'] },
  L45: { open: 'HIGHCUT', light: ['VCUT', 'VAULT', 'DASH', 'L1B'], heavy: ['VAULT', 'FIN2'] },
  R45: { open: 'HIGHCUT2', light: ['JUMP_SPIN', 'L6', 'DOWNCUT', 'STEP_CUT'], heavy: ['L6', 'L5'] },
  L90: { open: 'CROSS', light: ['SPIN1', 'LOWSWEEP', 'L1', 'HIGHCUT'], heavy: ['L4', 'RSPIN2'] },
  R90: { open: 'CROSS2', light: ['REVSPIN', 'LOWSWEEP2', 'L2', 'HIGHCUT2'], heavy: ['REVSPIN', 'RSPIN2'] },
  L135: { open: 'L1B', light: ['LOWSWEEP', 'RISECUT', 'BACK_LEAP', 'CROSS'], heavy: ['BACK_LEAP', 'DRAG'] },
  R135: { open: 'L2B', light: ['LOWSWEEP2', 'UPPER', 'RETREAT_SWEEP', 'CROSS2'], heavy: ['RETREAT_SWEEP', 'BACK_LEAP'] },
  BACK: { open: 'UPPER', light: ['DOWNCUT', 'BACK_LEAP', 'BACKCUT', 'RISECUT'], heavy: ['FIN2', 'BACK_LEAP'] },
};
const RETREAT_CUTS = new Set(['BACKCUT', 'RETREAT_SWEEP', 'BACK_LEAP']);
const FINISHERS = { 1: ['UPPER', 'DRAG'], 2: ['FIN2'], 3: ['RSPIN2', 'REVSPIN'], 4: ['L5'], 5: ['RLEAP', 'VAULT'] };

// ---- more slash patterns -------------------------------------------------------------------------------
// The first two cuts of a string (and a 3rd cut that repeats the same direction) keep the fixed directional table
// above. From there on, what comes out depends on the direction held, the number of cuts already in the string
// (k), and the cut just before it; a heavy press after 3+ cuts and a dodge out of a string are count-aware too.
// All of these are pure functions of their inputs, so a given situation always gives the same move.
const hashName = (name) => [...String(name || '')].reduce((a, ch) => a + ch.charCodeAt(0), 0);
// light cuts, 3rd cut on (odd pool sizes so that a repeated direction walks through every entry)
const EXT_LIGHT = {
  FWD:  ['L6', 'STEP_CUT', 'JUMP_FLIP', 'L5', 'HIGHCUT~F', 'DOWNCUT~H', 'DOWNCUT+RISECUT', 'CROSS+L1', 'JUMP_SPIN'],
  L45:  ['VCUT', 'L1B', 'DASH', 'HIGHCUT', 'L1B~F', 'CROSS~H', 'RISECUT+CROSS', 'L1B+DOWNCUT', 'LOWSWEEP+HIGHCUT2'],
  R45:  ['DOWNCUT', 'STEP_CUT', 'JUMP_SPIN', 'HIGHCUT2', 'DOWNCUT~F', 'CROSS2~H', 'RISECUT+CROSS2', 'L2B+DOWNCUT', 'LOWSWEEP2+HIGHCUT'],
  L90:  ['SPIN1', 'LOWSWEEP', 'L1', 'HIGHCUT', 'L1~F', 'LOWSWEEP~H', 'HIGHCUT+LOWSWEEP2', 'L1+L2', 'CROSS~F'],
  R90:  ['REVSPIN', 'LOWSWEEP2', 'L2', 'HIGHCUT2', 'L2~F', 'LOWSWEEP2~H', 'HIGHCUT+LOWSWEEP', 'L2+L1', 'CROSS2~F'],
  L135: ['LOWSWEEP', 'RISECUT', 'CROSS', 'L1B', 'LOWSWEEP~F', 'RISECUT~H', 'CROSS+L1', 'HIGHCUT2+DOWNCUT', 'BACK_LEAP'],
  R135: ['LOWSWEEP2', 'UPPER', 'CROSS2', 'L2B', 'LOWSWEEP2~F', 'RISECUT~H', 'CROSS2+L2', 'L2B+LOWSWEEP2', 'RETREAT_SWEEP'],
  BACK: ['DOWNCUT', 'RISECUT', 'BACKCUT', 'BACK_LEAP', 'DOWNCUT~H', 'RISECUT~F', 'DOWNCUT+RISECUT', 'RISECUT+DOWNCUT', 'RETREAT_SWEEP'],
};
function extendedLight(dir, k, step, prev) {
  const pool = EXT_LIGHT[dir];
  const i = (step * 4 + (k - 3) + hashName(prev)) % pool.length;
  return pool[i] === prev ? pool[(i + 1) % pool.length] : pool[i];
}
// heavy pressed after n cuts (n >= 3): one pool per direction and per size of string (3, 4, 5, 6, 7-8, 9+)
const FINISH_EXT = {
  N:    [['RSPIN2', 'REVSPIN'], ['L5', 'DOWNCUT~H'], ['RLEAP', 'VAULT'], ['RLEAP', 'L6', 'DOWNCUT+RISECUT'], ['VAULT', 'RISECUT+DOWNCUT', 'RSPIN2'], ['RLEAP', 'L2B+LOWSWEEP2', 'JUMP_SPIN']],
  FWD:  [['JUMP_SPIN', 'L6'], ['JUMP_FLIP', 'L5'], ['RLEAP', 'JUMP_SPIN'], ['VAULT', 'L6'], ['JUMP_FLIP', 'DOWNCUT+RISECUT'], ['RLEAP', 'JUMP_SPIN', 'VAULT']],
  L45:  [['VAULT', 'FIN2'], ['DOWNCUT~H', 'L1B~H'], ['HIGHCUT+LOWSWEEP2', 'VAULT'], ['L5', 'FIN2'], ['RISECUT+CROSS', 'RLEAP'], ['VAULT', 'HIGHCUT+LOWSWEEP2', 'L6']],
  R45:  [['L6', 'L5'], ['DOWNCUT~H', 'CROSS2~H'], ['L2B+DOWNCUT', 'VAULT'], ['L6', 'FIN2'], ['RISECUT+CROSS2', 'RLEAP'], ['VAULT', 'L2B+DOWNCUT', 'L5']],
  L90:  [['L4', 'RSPIN2'], ['LOWSWEEP~H', 'L1~H'], ['L1+L2', 'RSPIN2'], ['SPIN1', 'L4'], ['HIGHCUT+LOWSWEEP2', 'RSPIN2'], ['L4', 'L1+L2', 'RLEAP']],
  R90:  [['REVSPIN', 'RSPIN2'], ['LOWSWEEP2~H', 'L2~H'], ['L2+L1', 'REVSPIN'], ['RSPIN2', 'REVSPIN'], ['HIGHCUT+LOWSWEEP', 'RSPIN2'], ['REVSPIN', 'L2+L1', 'RLEAP']],
  L135: [['BACK_LEAP', 'DRAG'], ['LOWSWEEP~H', 'RISECUT~H'], ['CROSS+L1', 'BACK_LEAP'], ['DRAG', 'FIN2'], ['HIGHCUT2+DOWNCUT', 'BACK_LEAP'], ['RLEAP', 'CROSS+L1', 'DRAG']],
  R135: [['RETREAT_SWEEP', 'BACK_LEAP'], ['LOWSWEEP2~H', 'RISECUT~H'], ['CROSS2+L2', 'RETREAT_SWEEP'], ['BACK_LEAP', 'FIN2'], ['L2B+LOWSWEEP2', 'RETREAT_SWEEP'], ['RLEAP', 'CROSS2+L2', 'BACK_LEAP']],
  BACK: [['FIN2', 'BACK_LEAP'], ['DOWNCUT~H', 'RETREAT_SWEEP'], ['DOWNCUT+RISECUT', 'BACK_LEAP'], ['FIN2', 'DRAG'], ['RISECUT+DOWNCUT', 'BACK_LEAP'], ['RLEAP', 'FIN2', 'DOWNCUT+RISECUT']],
};
const finishBucket = (n) => n <= 3 ? 0 : n === 4 ? 1 : n === 5 ? 2 : n === 6 ? 3 : n <= 8 ? 4 : 5;
function finisherFor(n, dir, prev) {
  const pool = FINISH_EXT[dir || 'N'][finishBucket(n)];
  const i = (hashName(prev) + n) % pool.length;
  return pool[i] === prev ? pool[(i + 1) % pool.length] : pool[i];
}
// dodge out of a string of n >= 1 cuts, then slash: eight directions x four sizes of string (retreating moves are
// left out: the hero turns toward the stick here)
const DODGE_EXT = {
  N:    ['L1', 'L2', 'L1+L2', 'RSPIN2'],
  FWD:  ['DASH', 'STEP_CUT', 'JUMP_FLIP', 'L6'],
  L45:  ['HIGHCUT', 'VCUT', 'HIGHCUT+LOWSWEEP2', 'DOWNCUT~H'],
  R45:  ['HIGHCUT2', 'DOWNCUT', 'RISECUT+CROSS2', 'CROSS2~H'],
  L90:  ['CROSS', 'LOWSWEEP~F', 'L1+L2', 'SPIN1'],
  R90:  ['CROSS2', 'LOWSWEEP2~F', 'L2+L1', 'REVSPIN'],
  L135: ['L1B', 'RISECUT', 'CROSS+L1', 'L1B~H'],
  R135: ['L2B', 'RISECUT~F', 'CROSS2+L2', 'L2B~H'],
  BACK: ['UPPER', 'DOWNCUT', 'DOWNCUT+RISECUT', 'RISECUT~H'],
};
const dodgeBucket = (n) => n <= 2 ? 0 : n <= 4 ? 1 : n <= 6 ? 2 : 3;
const dodgeCutFor = (n, dir) => DODGE_EXT[dir || 'N'][dodgeBucket(n)];

function cutFacing(action = hero.act) {
  // The arrows shown in a slash lesson follow the screen even after the hero turns.
  return tutorial?.pattern ? 0 : action?.cutFacing ?? hero.face;
}

function readCutDirection(facing = cutFacing()) {
  const [mx, my] = input.move();
  const strength = Math.hypot(mx, my);
  if (strength < 0.2) return null;
  const turn = angLerp(facing, Math.atan2(-mx, my), 1) - facing;
  const expected = tutorial?.pattern?.commands[tutorial.step]?.dir;
  const verticalTolerance = Math.PI * 2 / 9; // 40 degrees from the requested vertical direction
  if (expected === 'FWD' && Math.abs(turn) <= verticalTolerance) return 'FWD';
  if (expected === 'BACK' && Math.PI - Math.abs(turn) <= verticalTolerance) return 'BACK';
  return strength < 0.3 ? null : flowBucket(turn);
}

function reverseCut(previousDirection, direction) {
  if (previousDirection === 'L90' && direction === 'R90') return 'XCUT_REV';
  if (previousDirection === 'R90' && direction === 'L90') return 'XCUT';
  return null;
}

function pickLight(prev, dir = readCutDirection()) {
  if (!prev) {
    hero.comboIdx = 0; hero.lightCount = 1;
    if (!dir) hero.neutralChain++;
    return dir ? DIRECTIONAL_CUTS[dir].open : pickFrom(comboChain()[0], null);
  }
  hero.lightCount = (hero.lightCount || 0) + 1;
  const chain = comboChain();
  hero.comboIdx = (hero.comboIdx + 1) % chain.length;
  if (!dir) {
    if (hero.act?.def.launcher) return 'AIR_SLASH';
    const step = (hero.lightCount - 1) % 6;
    const alternate = (hero.neutralChain + Math.floor((hero.lightCount - 1) / 6)) % 2;
    if (step === 1) {
      const spin = alternate ? 'SPIN1' : 'REVSPIN';
      return spin === prev ? (spin === 'SPIN1' ? 'REVSPIN' : 'SPIN1') : spin;
    }
    if (step === 2) {
      const cut = alternate ? 'JUMP_SPIN' : 'JUMP_FLIP';
      return cut === prev ? (cut === 'JUMP_SPIN' ? 'JUMP_FLIP' : 'JUMP_SPIN') : cut;
    }
    return pickFrom(chain[hero.comboIdx], prev);
  }

  const previous = hero.act;
  const reversal = reverseCut(previous?.cutDir, dir);
  if (reversal) return reversal;
  if (!previous?.cutDir && dir === 'FWD') return 'STEP_CUT';
  if (!previous?.cutDir && dir === 'BACK') return 'BACKCUT';
  const pool = DIRECTIONAL_CUTS[dir].light;
  const step = previous?.cutDir === dir ? previous.cutStep : 0;
  // The 3rd cut repeating the same direction stays on the fixed table (forward x3 = big leap, back x3 = back jump);
  // every other cut from the 3rd on is chosen by the count-aware table.
  if (hero.lightCount >= 4 || (hero.lightCount === 3 && step === 0)) return extendedLight(dir, hero.lightCount, step, prev);
  const name = pool[step % pool.length];
  return name === prev ? pool[(step + 1) % pool.length] : name;
}

function startDirectedCut(name, dir, facing) {
  if (dir) {
    const retreat = RETREAT_CUTS.has(name);
    hero.aimNext = false;
    // Back commands keep the blade facing forward; diagonal retreat moves away from the cut.
    const turn = dir === 'BACK' ? 0 : CUT_ANGLES[dir] - (retreat ? Math.PI : 0);
    hero.face = facing + turn;
  }
  startAction(name);
}

function startLight(prev, dir = readCutDirection(), spin) {
  if (dir) noteLink(); else hero.monoRun = (hero.monoRun || 0) + 1;
  const previous = hero.act;
  const facing = cutFacing(previous);
  const step = prev && previous?.cutDir === dir ? (previous.cutStep || 0) + 1 : prev && dir ? 1 : 0;
  const next = pickLight(prev, dir);
  const followLaunch = prev && previous?.def.launcher && !dir;
  const name = spin || next;
  const target = followLaunch && previous.launchTarget;
  if (target && !target.dead && target.y > 0.25 && Math.hypot(target.x - hero.x, target.z - hero.z) < 6) {
    hero.face = Math.atan2(target.x - hero.x, target.z - hero.z);
    hero.aimNext = false;
  }
  startDirectedCut(name, dir, facing);
  hero.act.light = true;
  hero.act.mono = hero.monoRun;
  hero.act.cutFacing = prev || dir ? facing : hero.face;
  hero.act.cutDir = dir;
  hero.act.cutStep = step;
  recordSlashCommand('light', dir, name, !prev);
}

function pickFinisher(count, dir, action) {
  if (count >= 3) return finisherFor(count, dir, action.name);
  if (!dir) return pickFrom(FINISHERS[count], null);
  const reversal = reverseCut(action.cutDir, dir);
  const pool = DIRECTIONAL_CUTS[dir].heavy;
  const name = reversal || (!action.cutDir && dir === 'FWD' ? 'STEP_CUT'
    : !action.cutDir && dir === 'BACK' ? 'RETREAT_SWEEP'
    : pool[Number(count > 1)]);
  return name === action.name ? pool.find(candidate => candidate !== action.name) || name : name;
}

function startFinisher(action) {
  const h = hero;
  noteLink();
  const count = h.lightCount || 0;
  if (count <= 0) { beginCharge(); startAction('CHARGE'); return; }

  const pressedDir = action.queuedHeavyDir || null;
  const dir = pressedDir || action.cutDir;
  const name = pickFinisher(count, dir, action);
  startDirectedCut(name, dir, cutFacing(action));
  h.lightCount = 0;
  recordSlashCommand('heavy', pressedDir, name);
  if (action.queuedHeavyDir) tutorialSuccess('slash');
}

const STAT_MAX = 10;
const STAT_KEYS = ['health', 'power', 'technique', 'dodge', 'awakening'];
const LEVEL_MAX = 1 + STAT_KEYS.length * (STAT_MAX - 1);
const STAT_BUTTONS = [...UI.statSelect.querySelectorAll('[data-stat]')];
const STAT_BARS = STAT_BUTTONS.map(button => {
  const segments = Array.from({ length: STAT_MAX }, () => document.createElement('span'));
  button.querySelector('.stat-bar').append(...segments);
  return segments;
});
const HEALTH_PER_RANK = 90;
const POWER_PER_RANK = 0.15;
const LIGHT_RECOVERY = 0.22;
const DODGE_IFRAMES = [0.24, 0.27, 0.30, 0.33, 0.36, 0.39, 0.42, 0.44, 0.46, 0.48];
const [, DODGE_MOVE_END, DODGE_MOVE_SPEED] = HERO_ACTIONS.DODGE.lunge;
const DODGE_FACE_HOLD = 0.18;
const dodgeInvulnerability = () => DODGE_IFRAMES[hero.stats.dodge - 1];
const dodgeReaction = () => (STAT_MAX - hero.stats.dodge) * 0.01;
const finishingDodgeCut = action => action?.dodgeTime != null
  && action.dodgeTime < Math.max(DODGE_MOVE_END, dodgeInvulnerability());
const DODGE_CUT = { fwd: 'DASH', back: 'UPPER', left: 'CROSS', right: 'CROSS2' };

const expNeed = (lv) => 14 + lv * 10;
const dmgMul = () => 1 + POWER_PER_RANK * (hero.stats.power - 1);
const maxHealth = () => 1000 + HEALTH_PER_RANK * (hero.stats.health - 1);
// Combo length per technique rank: rank n allows n + 2 cuts (3 ... 11); the top rank used to be unlimited and
// is now 14. Every rank stops at its cap, so a longer string needs heavy / dodge / direction links.
const LIGHT_CAP = Array.from({ length: STAT_MAX + 1 }, (_, n) => n === 0 ? 0 : n === STAT_MAX ? STAT_MAX + 4 : n + 2);
const lightLimit = () => LIGHT_CAP[hero.stats.technique] ?? 3;
// A light cut that follows a direction, a heavy or a dodge is a "link" and restores full damage. Plain slashes
// repeated with no link lose power from the 4th cut on (enemies x0.5, the boss x0.2), and at the cap the
// pause grows from 0.22 s to 0.6 s.
const LINK_MOVES = new Set(['CHARGE', 'DODGE']);
const MONO_FREE = 3, MONO_ENEMY = 0.5, MONO_BOSS = 0.2, MONO_RECOVERY = 0.6;
const noteLink = () => { hero.monoRun = 0; };
const monoFactor = (a, isBoss) => (a?.light && (a.mono || 0) > MONO_FREE) ? (isBoss ? MONO_BOSS : MONO_ENEMY) : 1;
const awakeningDuration = () => 12 + (hero.stats.awakening - 1);

function gainRage(amount) {
  hero.rage = Math.min(100, hero.rage + amount * (1 + 0.1 * (hero.stats.awakening - 1)));
}

function loadStats(saved) {
  return Object.fromEntries(STAT_KEYS.map(key => {
    const rank = saved?.[key];
    return [key, Number.isInteger(rank) ? Math.min(STAT_MAX, Math.max(1, rank)) : 1];
  }));
}

function statPoints() {
  const spent = STAT_KEYS.reduce((total, key) => total + hero.stats[key] - 1, 0);
  return Math.max(0, hero.level - 1 - spent);
}

function gainExp(n) {
  if (G.mode === 'boss') return;
  const h = hero;
  if (h.level >= LEVEL_MAX) return;
  h.exp += n;
  while (h.level < LEVEL_MAX && h.exp >= expNeed(h.level)) {
    h.exp -= expNeed(h.level); h.level++;
    h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.25);
    sfx.play('heal'); fx.ring(h.x, h.z, 3, 0xffd080, 0.6);
  }
  if (h.level >= LEVEL_MAX) h.exp = 0;
}

// Level-up: the screen first holds on "レベルアップ" (the world is frozen), then the stat selection opens.
// A tap or key press skips the wait once the banner has had a moment on screen.
const LEVELUP_HOLD = 1.4, LEVELUP_SKIP_AFTER = 0.5;
function beginLevelUp() {
  G.state = 'levelup'; G.levelUpT = 0;
  UI.hud.inert = true;
  input.clear(); input.resetButtons(); input.keys.clear(); input.resetStick();
  hero.pendingActions = {};
  UI.wave.classList.remove('show'); clearTimeout(bannerTimer);   // the stage / wave banner would sit underneath the level-up text
  $('#lu-lv').textContent = `Lv ${hero.level}`;
  const el = $('#levelup-freeze');
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  sfx.play('heal'); G.shake = 0;
}
function endLevelUp() {
  if (G.state !== 'levelup') return;
  $('#levelup-freeze').hidden = true;
  showStatSelection();
}
function skipLevelUp() { if (G.state === 'levelup' && G.levelUpT >= LEVELUP_SKIP_AFTER) endLevelUp(); }
window.addEventListener('pointerdown', skipLevelUp);
window.addEventListener('keydown', e => { if (G.state === 'levelup') { skipLevelUp(); e.preventDefault(); } });

function showStatSelection() {
  G.state = 'stat-select';
  UI.statSelect.hidden = false;
  UI.hud.inert = true;
  $('#stat-points').textContent = `Lv ${hero.level} ・ 残り ${statPoints()} 回`;
  STAT_BUTTONS.forEach((button, index) => {
    const rank = hero.stats[button.dataset.stat];
    button.disabled = rank >= STAT_MAX;
    button.querySelector('.stat-rank').textContent = `${rank}/${STAT_MAX}`;
    STAT_BARS[index].forEach((segment, step) => segment.classList.toggle('filled', step < rank));
  });
  if (!UI.statSelect.contains(document.activeElement) || document.activeElement.disabled) {
    STAT_BUTTONS.find(button => !button.disabled)?.focus();
  }
  input.clear(); input.resetButtons(); input.keys.clear(); input.resetStick();
  hero.pendingActions = {};
}

function chooseStat(key) {
  if (G.state !== 'stat-select' || !statPoints() || hero.stats[key] >= STAT_MAX) return;
  hero.stats[key]++;
  if (key === 'health') {
    hero.maxHp = maxHealth();
    hero.hp = Math.min(hero.maxHp, hero.hp + HEALTH_PER_RANK);
  }
  sfx.play('ui');
  updateHUD(0);
  if (statPoints() > 0) {
    showStatSelection();
  } else {
    UI.statSelect.hidden = true;
    UI.hud.inert = false;
    input.clear();
    G.state = 'play';
  }
}

function wrapAng(a) { return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }

const AWAKENED_ATTACK_SPEED = 1.35;
function rageMult() { return hero.rageT > 0 ? AWAKENED_ATTACK_SPEED : 1; }

const TURN_AXIS = {
  SPIN: 'rootYaw', SPIN_LOOP: 'rootYaw', L4: 'rootYaw', SPIN1: 'rootYaw',
  REVSPIN: 'rootYaw', RSPIN2: 'rootYaw', SPIN_IN: 'rootYaw',
  RFLIP: 'rootPitch', WHEEL: 'rootPitch', JUMP_FLIP: 'rootPitch', JUMP_SPIN: 'rootYaw',
};
// heavy (charged) spin pushes grunts farther than the spins inside the light combo
const HEAVY_SPIN = new Set(['SPIN_IN', 'SPIN_LOOP']);
const HEAVY_SPIN_KB = 3.0;          // x charge bonus below; aims for ~20-25 m on grunts

// ---- flowing cuts: turning the stick in the middle of a slash redirects the blade
function flowBucket(turn) {
  const a = Math.abs(turn), side = turn > 0 ? 'L' : 'R';
  if (a < 0.4) return 'FWD';
  if (a > 2.75) return 'BACK';
  return side + (a < 1.18 ? '45' : a < 1.97 ? '90' : '135');
}
function queueLateSideSpin(a) {
  if (tutorial?.pattern || !a?.light || a.queued === 'heavy' || a.queuedManual || hero.lightCount >= lightLimit()) return false;
  const dir = readCutDirection();
  const previous = a.sideInput === undefined ? a.cutDir : a.sideInput;
  a.sideInput = dir;
  const [start, end] = a.def.active;
  if (a.t < start + (end - start) * 0.8 || dir === previous || (dir !== 'L90' && dir !== 'R90')) return false;
  a.queued = 'light';
  a.queuedDir = dir;
  a.queuedManual = true;
  a.sideSpin = dir === 'L90' ? 'SPIN1' : 'REVSPIN';
  return true;
}

function startDodgeCut(roll) {
  const h = hero;
  const from = roll.fromCount || 0;
  const dir = readCutDirection();
  const name = from > 0 ? dodgeCutFor(from, dir) : (DODGE_CUT[readDir()] || 'L1');   // from idle: the fixed four-way table
  const rollFacing = h.face;
  const [mx, my] = input.move();
  if (Math.hypot(mx, my) > 0.3) h.face = Math.atan2(-mx, my);
  h.aimNext = false;
  startAction(name);
  h.lightCount = 1; h.comboIdx = 0; h.act.light = true;
  h.act.dodgeTime = roll.t;
  h.act.dodgeFacing = rollFacing;
  tutorialSuccess('dodgeCut');
}

function beginCharge(fromDodge = false) {
  delete hero.pendingActions.heavy;
  hero.charge = 0; hero.chargeLv = 0; hero.heavyUsed = true;
  hero.chargeFromDodge = fromDodge;
}

function advanceCharge(dt) {
  const h = hero;
  h.charge += dt;
  const lv = h.charge >= 2.0 ? 3 : h.charge >= 1.2 ? 2 : h.charge >= 0.5 ? 1 : 0;
  if (lv > h.chargeLv) {
    h.chargeLv = lv; sfx.play('clang', 0.5 + lv * 0.2); fx.ring(h.x, h.z, 1.2 + lv * 0.7, 0xffd080, 0.4);
  }
  if (h.chargeLv > 0 && Math.random() < 0.3 * h.chargeLv) fx.ember(h.x, 0.1, h.z);
  h.mat.emissive.setRGB(0.04 * h.chargeLv * (0.7 + 0.3 * Math.sin(G.time * 30)), 0.012 * h.chargeLv, 0);
}

function releaseCharge() {
  const h = hero;
  h.spinTarget = 1;   // one full turn; charge level raises damage and knockback instead
  h.chargeMul = 1 + 0.25 * h.chargeLv; h.spinLoops = 0;
  if (h.rageT <= 0) h.mat.emissive.setRGB(0, 0, 0);
  startAction('SPIN_IN');
}

function bufferAction(name, direction = null) {
  const h = hero;
  const remaining = h.act ? h.act.def.dur - h.act.t : 0;
  h.pendingActions[name] = { direction, until: G.time + Math.max(0.35, remaining + 0.2) };
}

function pendingAction(name) {
  const action = hero.pendingActions[name];
  if (action && action.until >= G.time) return action;
  delete hero.pendingActions[name];
  return null;
}

function updateHero(dt) {
  const h = hero;
  if (h.dead) {
    h.act.t += dt;
    sampleKeys(h.act.def.keys, h.act.t, h.target);
    smoothPose(h.pose, h.target, Math.min(1, dt * 14)); applyPose(h.rig, h.pose);
    return;
  }
  h.iframe = Math.max(0, h.iframe - dt);
  h.lightRecovery = Math.max(0, h.lightRecovery - dt);
  if (h.rageT > 0) {
    h.rageT -= dt;
    h.mat.emissive.setRGB(0.1 + 0.05 * Math.sin(G.time * 12), 0.008, 0.0);
    rageLight.intensity = 14 + Math.sin(G.time * 20) * 4;
    if (Math.random() < 0.9) fx.ember(h.x, 0.2, h.z);
    if (h.rageT <= 0) { h.mat.emissive.setRGB(0, 0, 0); rageLight.intensity = 0; }
  }
  // input
  const holdingTurn = false; // light-combo spins flow straight on; the charged spin pauses in SPIN_OUT
  const locked = h.act?.def.clashLocked;
  if (input.consume('rage') && h.rageT <= 0) {
    if (h.rage >= 100) bufferAction('rage');
    else callout('覚醒ゲージ不足', '#ffcc9a');
  }
  if (pendingAction('rage') && !locked && !holdingTurn && h.rage >= 100 && h.rageT <= 0 && h.act?.name !== 'RAGE') {
    delete h.pendingActions.rage;
    h.rage = 0; h.rageT = awakeningDuration(); startAction('RAGE'); sfx.play('rage'); G.shake = 0.8;
  }
  const attackPressed = input.consume('attack');
  if (attackPressed) {
    h.lastSlashPress = G.time;
    h.slashFacing = h.face;
  }
  // one press = one attack: holding the button does nothing more (the heavy keeps its hold-to-charge)
  const wantAttack = attackPressed;
  const heavyPressed = input.consume('heavy');
  if (heavyPressed) { h.heavyUsed = false; bufferAction('heavy', readCutDirection()); }
  if (!input.held.has('heavy') && !heavyPressed) h.heavyUsed = true;
  const wantHeavy = pendingAction('heavy');
  if (input.consume('dodge')) bufferAction('dodge');
  const wantDodge = pendingAction('dodge');
  const act = h.act;
  const sliding = finishingDodgeCut(act);
  const cutDirection = attackPressed ? readCutDirection() : null;
  if (locked) {
    if (act.name === 'CLASH' && attackPressed) {
      const direction = readDir();
      if (direction) act.nextPattern = CLASH_PATTERNS[direction];
    }
  }
  else if (!sliding && !wantDodge && !wantHeavy && !attackPressed && queueLateSideSpin(act)) { /* spin queued at the end of the cut */ }
  else if (wantDodge && !sliding && !holdingTurn && (!act || act.name !== 'DODGE' && act.name !== 'RAGE'
    && (h.stats.dodge >= 5 || act.name === 'HURT' || act.t > (act.def.active?.[1] ?? 0)))) {
    delete h.pendingActions.dodge;
    const fromCount = act?.light ? h.lightCount : 0;
    startAction('DODGE');
    h.act.fromCount = fromCount;   // how many cuts were in the string we dodged out of
  }
  else if (!act) {
    // heavy: a press, or the button still held from a press that could not be used yet (made while
    // hurt, rolling or mid-attack), starts the charge; one charge per press
    if (wantHeavy || (input.held.has('heavy') && !h.heavyUsed)) { beginCharge(); startAction('CHARGE'); }
    else if (wantAttack) {
      if (h.lightRecovery <= 0) startLight(null, cutDirection || readCutDirection());
      else input.pressed.add('attack');   // tapped during the short pause after a full chain: keep it, do not swallow it
    }
  } else if (!act.def.type) {
    // Keep attack presses through stagger and other passive states.
    if (wantAttack && act.name !== 'CHARGE' && act.name !== 'DODGE') input.pressed.add('attack');
  } else if (act.def.type) {
    if (wantAttack && act.queued !== 'heavy' && !act.sideSpin) {
      act.queued = 'light'; act.queuedDir = cutDirection; act.queuedManual = Boolean(cutDirection);
    }
    if (wantHeavy && act.def.chainAt <= act.def.dur) {
      act.queued = 'heavy'; act.queuedHeavyDir = wantHeavy.direction;
    }
  }

  const roll = h.act;
  if (roll?.name === 'DODGE') {
    if (!roll.charging && (wantHeavy || (input.held.has('heavy') && !h.heavyUsed))) {
      beginCharge(true);
      roll.charging = true;
      // The press can be consumed in the same frame that the button was released.
      roll.chargeReleased = !input.held.has('heavy');
    }
    if (!roll.charging && attackPressed) startDodgeCut(roll);
  }

  // action progression
  const [mx, my] = input.move();
  let moving = Math.hypot(mx, my);
  let turnAxis;
  let beginTurnHold = false;
  let finishedDodge = false;
  const poseAction = h.act;
  if (h.act) {
    const a = h.act, d = a.def;
    const speedK = d.clash ? AWAKENED_ATTACK_SPEED : rageMult();
    turnAxis = TURN_AXIS[a.name];
    const rolling = a.name === 'DODGE';
    const dodgeTime = rolling ? a.t : a.dodgeTime;
    a.t += dt * (d.type ? speedK : 1);
    if (a.dodgeTime != null) a.dodgeTime += dt;
    sampleKeys(d.keys, a.t, h.target);
    if (d.clash) clashStep(a);
    if (dodgeTime < DODGE_MOVE_END) {
      const reaction = dodgeReaction();
      const moveTime = Math.min(dodgeTime + dt, DODGE_MOVE_END) - Math.max(dodgeTime, reaction);
      // Keep the full roll distance while changing when movement starts.
      const distance = Math.max(0, moveTime) * DODGE_MOVE_SPEED * DODGE_MOVE_END / (DODGE_MOVE_END - reaction);
      const facing = a.dodgeFacing ?? h.face;
      h.x += Math.sin(facing) * distance;
      h.z += Math.cos(facing) * distance;
    } else if (!rolling && !holdingTurn && !beginTurnHold && d.lunge && a.t >= d.lunge[0] && a.t <= d.lunge[1]) {
      const sp = d.lunge[2];
      h.x += Math.sin(h.face) * sp * dt * (d.type ? speedK : 1);
      h.z += Math.cos(h.face) * sp * dt * (d.type ? speedK : 1);
    }
    if (d.sound && !a.swung && a.t >= d.active[0] - 0.06) { a.swung = true; sfx.play(d.sound); }
    if (d.multi && !a.multiDone && a.t > (d.active[0] + d.active[1]) / 2) { a.multiDone = true; h.attackId++; }
    if (a.name === 'SPIN_LOOP' && !holdingTurn && !beginTurnHold) {
      // steer while spinning
      if (moving > 0.2) { const tf = Math.atan2(-mx, my); h.x += Math.sin(tf) * 3.5 * dt; h.z += Math.cos(tf) * 3.5 * dt; }
    }
    if (holdingTurn || beginTurnHold) {
      // Retain the final turn pose before allowing recovery or a queued attack.
    } else if (a.name === 'DODGE' && a.charging) {
      a.chargeReleased ||= !input.held.has('heavy');
      if (!a.chargeReleased) advanceCharge(dt);
      if (a.t >= d.dur) {
        finishedDodge = true;
        h.heavyUsed = true;
        if (a.chargeReleased) releaseCharge();
        else startAction('CHARGE');
      }
    } else if (a.name === 'CHARGE') {
      advanceCharge(dt);
      if (!input.held.has('heavy') || h.charge > 3.5) releaseCharge();
    } else if (a.name === 'SPIN_IN' && a.t >= d.dur) {
      startAction('SPIN_LOOP');
      if (h.chargeLv > 0) tutorialSuccess(h.chargeFromDodge ? 'dodgeSpin' : 'spin');
    }
    else if (a.name === 'SPIN_LOOP' && a.t >= d.dur) {
      h.pose.rootYaw = h.target.rootYaw = 0;
      h.spinLoops++;
      startAction(h.spinLoops < (h.spinTarget || 1) ? 'SPIN_LOOP' : 'SPIN_OUT');
    } else if (d.type && !finishingDodgeCut(a) && a.t >= Math.max(d.chainAt, d.active[1]) && a.queued
      && (!(d.impact || d.landingFX) || a.hitDone) && (a.queued === 'heavy' || !a.light || h.lightCount < lightLimit())) {
      if (a.queued === 'heavy') {
        delete h.pendingActions.heavy;
        startFinisher(a);
      } else {
        if (!a.light) h.lightCount = 0;
        startLight(a.name, a.queuedDir, a.sideSpin);
      }
    } else if (a.t >= d.dur && !finishingDodgeCut(a)) {
      finishedDodge = rolling || a.dodgeTime != null;
      if (a.light && h.lightCount >= lightLimit()) { h.lightRecovery = (h.monoRun || 0) >= MONO_FREE ? MONO_RECOVERY : LIGHT_RECOVERY; if (a.queued === 'light') input.pressed.add('attack'); }
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
  if (!holdingTurn && !beginTurnHold) pushOut(h, 0.45);
  const r = Math.hypot(h.x, h.z); if (r > ARENA) { h.x *= ARENA / r; h.z *= ARENA / r; }

  if (boss && !boss.dead && boss.state !== 'hidden') {
    if (finishedDodge) h.faceBossUntil = G.time + DODGE_FACE_HOLD;
    if ((finishedDodge || !h.act) && G.time < h.faceBossUntil) {
      const dx = boss.x - h.x, dz = boss.z - h.z;
      if (Math.hypot(dx, dz) > 0.05) h.face = Math.atan2(dx, dz);
    }
  }

  if (h.act && h.act !== poseAction) sampleKeys(h.act.def.keys, h.act.t, h.target);
  if (!holdingTurn) smoothPose(h.pose, h.target, Math.min(1, dt * 30));
  if (turnAxis && h.act === poseAction) h.pose[turnAxis] = h.target[turnAxis] || 0;
  applyPose(h.rig, h.pose);
  h.rig.root.position.set(h.x, 0, h.z);
  h.rig.root.rotation.y = h.face;
  h.rig.root.updateMatrixWorld(true);
  // blade segment in world space
  h.lastBase.copy(h.base); h.lastTip.copy(h.tip);
  h.base.copy(h.blade.hilt); h.sword.localToWorld(h.base);
  h.tip.copy(h.blade.tip); h.sword.localToWorld(h.tip);
  const a = h.act, attacking = !holdingTurn && a && a.def.type && a.t >= a.def.active[0] - 0.05 && a.t <= a.def.active[1] + 0.05;
  const chargedSpin = attacking && HEAVY_SPIN.has(a.name);
  if (chargedSpin) tmpV.copy(h.base);
  else { tmpV.copy(h.blade.trail); h.sword.localToWorld(tmpV); }
  fx.trailPush(tmpV, h.tip, attacking, chargedSpin);
  if (chargedSpin && a.name === 'SPIN_LOOP') {
    if (a.nextSpinSpark == null) {
      const charge = h.chargeLv || 0;
      fx.hitFlash(h.tip.x, h.tip.y, h.tip.z, true);
      fx.ring(h.x, h.z, 3.2 + 0.25 * charge, 0xffedbd, 0.28);
      fx.ring(h.x, h.z, 4.6 + 0.35 * charge, 0xff9838, 0.45);
      G.shake = Math.max(G.shake, 0.22 + 0.05 * charge);
    }
    if (a.t >= (a.nextSpinSpark ?? 0)) {
      fx.spark(h.tip.x, Math.max(0.15, h.tip.y), h.tip.z, 5);
      a.nextSpinSpark = a.t + 0.04;
    }
  }
  if (!holdingTurn && a && a.def.ground && h.tip.y < 0.25 && Math.random() < 0.7) fx.spark(h.tip.x, 0.05, h.tip.z, 3);
  if (!holdingTurn && a && a.def.type && a.t >= a.def.active[0] && a.t <= a.def.active[1]) heroHits(a);
  if (a && a.def.impact && !a.hitDone && a.t >= a.def.impact) { a.hitDone = true; impact(a); }
  if (a?.def.landingFX && !a.hitDone && a.t >= a.def.landingFX) {
    a.hitDone = true;
    slamFX(h.tip.x, h.tip.z, HERO_ACTIONS.L6.radius, false);
  }
  // pickups
  for (let i = fx.orbs.length - 1; i >= 0; i--) {
    const o = fx.orbs[i];
    if (Math.hypot(o.x - h.x, o.z - h.z) < 1.3) {
      h.hp = Math.min(h.maxHp, h.hp + 150); sfx.play('heal'); fx.spark(o.x, 0.6, o.z, 10);
      scene.remove(o.m); fx.orbs.splice(i, 1);
    }
  }
  rageLight.position.set(h.x, 1.4, h.z);
  // corrupted weapon: flickering core/halo, embers off the blade at the last tier
  pulseWeapon(h.weapon, G.time);
  if (h.growTier >= GROW_MAX && Math.random() < 0.25) fx.ember(h.tip.x + (h.base.x - h.tip.x) * Math.random(), Math.max(0.1, h.tip.y - 0.6), h.tip.z + (h.base.z - h.tip.z) * Math.random());
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
  if (a.def.clash) return;
  const d = a.def, h = hero, mult = (h.rageT > 0 ? 1.6 : 1) * dmgMul() * (a.name === 'SPIN_LOOP' ? (h.chargeMul || 1) : 1);
  if (d.clashHit) {
    if (a.hitDone || !boss || boss.dead || a.t < (d.active[0] + d.active[1]) / 2) return;
    a.hitDone = true;
    damageBoss(d.dmg * mult);
    clashCollateral(h, 3.4, false);
    sfx.play('hit');
    return;
  }
  const turn = Boolean(TURN_AXIS[a.name]);
  const knockback = d.kb * dmgMul() * (turn ? 1.6 : 1) * (HEAVY_SPIN.has(a.name) ? HEAVY_SPIN_KB * (1 + 0.05 * (h.chargeLv || 0)) : 1);
  const bonusLift = turn ? 1.5 : 0;
  let any = false;
  const bodyHit = (x, z, r) => {
    if (!d.body) return false;
    const dx = x - h.x, dz = z - h.z, dist = Math.hypot(dx, dz);
    return dist < d.body + r && (d.bodyAll || Math.abs(angLerp(h.face, Math.atan2(dx, dz), 1) - h.face) < 1.1);
  };
  for (const e of enemies) {
    if (e.dead || e.lastHit === h.attackId) continue;
    const def = ENEMY[e.type];
    const hitBody = bodyHit(e.x, e.z, def.radius);
    if (hitBody || bladeTouches(e.x, e.z, def.radius + 0.25 + (d.reach || 0), e.y, e.y + 1.8 * def.scale)) {
      e.lastHit = h.attackId; any = true;
      damageEnemy(e, d.dmg * mult * monoFactor(a, false), knockback, d.up || 0, hitBody || !!d.heavy, undefined, undefined, bonusLift);
      if (d.launcher && !e.dead) a.launchTarget ||= e;
    }
  }
  if (boss && !boss.dead && boss.state !== 'hidden' && (boss.y || 0) < 1.5 && boss.lastHit !== h.attackId && bladeTouches(boss.x, boss.z, bossRadius(), 0, 4)) {
    boss.lastHit = h.attackId; any = true;
    // A staggered or parried boss takes extra damage.
    const open = boss.state === 'parried' || boss.state === 'stagger';
    const stop = d.heavy ? 0.13 : d.multi || turn ? 0.065 : 0.095;
    damageBoss(d.dmg * mult * (open ? 1.5 : 1.0) * monoFactor(a, true), stop);
  }
  if (any) { G.hitstop = Math.max(G.hitstop, (a.name === 'SPIN_LOOP' || a.name === 'RSPIN2' || a.name === 'SPIN1' || a.name === 'L4') ? 0.025 : 0.055); sfx.play('hit'); }
}

function slamFX(x, z, radius, rage) {
  fx.ring(x, z, radius * 1.2, rage ? 0xff3010 : 0xffa060, 0.5);
  fx.spark(x, 0.2, z, 26);
  G.shake = Math.max(G.shake, rage ? 1 : 0.55);
  sfx.play('slam');
}

function impact(a) {
  const d = a.def, h = hero, mult = (h.rageT > 0 ? 1.6 : 1) * dmgMul();
  const cx = a.name === 'RAGE' ? h.x : h.tip.x, cz = a.name === 'RAGE' ? h.z : h.tip.z;
  slamFX(cx, cz, d.radius, a.name === 'RAGE');
  for (const e of enemies) {
    if (e.dead) continue;
    const dist = Math.hypot(e.x - cx, e.z - cz);
    if (dist < d.radius + ENEMY[e.type].radius && e.lastHit !== h.attackId + 0.5) {
      e.lastHit = h.attackId + 0.5;
      damageEnemy(e, d.dmg * mult * (1 - dist / (d.radius * 2)), d.kb * dmgMul(), d.up, true, cx, cz);
    }
  }
  if (boss && !boss.dead && boss.state !== 'hidden' && Math.hypot(boss.x - cx, boss.z - cz) < d.radius + 1.2) damageBoss(d.dmg * mult * 0.8, 0.12);
}

function addCombo() {
  G.combo++; G.comboT = 2.6; G.maxCombo = Math.max(G.maxCombo, G.combo);
  if (hero.rageT <= 0) gainRage(1.4);
}

function damageEnemy(e, dmg, kb, up, heavy, ox, oz, bonusLift = 0) {
  const def = ENEMY[e.type];
  e.hp -= dmg; addCombo();
  const sx = ox ?? hero.x, sz = oz ?? hero.z;
  let dx = e.x - sx, dz = e.z - sz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const k = def.armor && !heavy ? 0.3 : 1;
  const kill = e.hp <= 0;
  // launch: far stronger push, with lift on every clean hit and big air on kills
  const push = kb * k * (kill ? 2.6 : 1.7);
  e.vx += dx * push; e.vz += dz * push;
  const hy = e.y + 1.1 * def.scale, hx = e.x - dx * 0.35, hz = e.z - dz * 0.35;
  fx.hitFlash(hx, hy, hz, heavy, kill);
  fx.blood(hx, hy, hz, dx, dz, kill ? 30 : heavy ? 22 : 14, kill ? 1.6 : 1.2);
  fx.mist(hx, hy, hz, dx, dz, kill ? 5 : 3);
  fx.spark(hx, hy, hz, heavy ? 10 : 5);
  fx.decal(e.x + dx * 0.6, e.z + dz * 0.6, 1.0 + Math.random() * 1.0);
  if (kill) {
    e.dead = true; e.state = 'dead'; e.t = 0;
    e.vy = Math.max(e.vy, 0) + (up || 3) + bonusLift + 4 + Math.random() * 4 * (heavy ? 1.5 : 1);
    e.tumble = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8); e.tumbleA = 0;
    e.spin = (Math.random() - 0.5) * 10; G.ko++; gainExp(def.exp || 1);
    G.shake = Math.max(G.shake, heavy ? 0.35 : 0.2);
    e.face = Math.atan2(-dx, -dz);
    if (Math.random() < (e.type === 'brute' ? 0.4 : 0.06)) fx.orb(e.x, e.z);
  } else if (!def.armor || heavy) {
    e.state = 'hit'; e.t = 0; e.vy = Math.max(e.vy, (up ? up * 0.8 : 0) + bonusLift + (heavy ? 3.5 : 1.8));
  }
}

const SPIN_MOVES = new Set(['SPIN_IN', 'SPIN_LOOP', 'SPIN_OUT', 'L4', 'SPIN1', 'RSPIN2', 'REVSPIN']);
function hurtHero(dmg, fromX, fromZ) {
  const h = hero;
  if (tutorial || h.iframe > 0 || h.dead || G.state !== 'play') return;
  const a = h.act;
  const dodgeTime = a?.name === 'DODGE' ? a.t : a?.dodgeTime;
  if (dodgeTime != null && dodgeTime < dodgeInvulnerability()) return;
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
  if (a?.name === 'CHARGE' || (a?.name === 'DODGE' && a.charging)) { G.shake = Math.max(G.shake, 0.25); return; }
  if (h.rageT <= 0 && (!h.act || h.act.name !== 'RAGE')) startAction('HURT');
}

// ======================================================================= boss parry and disarm
const PARRY_WIN = 0.4, DISARM_WIN = 0.035, GLINT_AT = 0.55;
const NO_PARRY = new Set(['CHARGE', 'HURT', 'DODGE', 'RAGE', 'DEATH']);
const bossScale = () => boss?.scale || 2.3;
const bossRadius = () => 1.2 * bossScale() / 2.3;

// Direction plus a fresh slash selects the next cut pattern.
const CLASH_BEAT = 0.36, CLASH_MIN = 3, CLASH_MAX = 7, CLASH_IMPACT = 0.145;
const CLASH_PATTERNS = {
  fwd: ['DASH', 'L1', 'STAB', 'L2'],
  back: ['UPPER', 'DOWNCUT', 'RISECUT', 'L2'],
  left: ['CROSS', 'L1', 'HIGHCUT', 'CROSS2'],
  right: ['CROSS2', 'L2', 'HIGHCUT2', 'CROSS'],
};
const CLASH_OPENING = { charge: 'fwd', cleave: 'left', combo: 'left', leap: 'back', slam: 'back', sweep: 'right' };
const CLASH_VERTICAL = new Set(['UPPER', 'DOWNCUT', 'RISECUT', 'HIGHCUT', 'HIGHCUT2']);
HERO_ACTIONS.CLASH = {
  keys: [[0, HERO.idle]], type: 'sweep', clash: true, clashLocked: true, chainAt: 99, dmg: 0, kb: 0,
};
HERO_ACTIONS.CLASH_FOLLOWUP = { ...HERO_ACTIONS.L1, clashLocked: true, clashHit: true };
HERO_ACTIONS.CLASH_DISARM = { ...HERO_ACTIONS.L1, clashLocked: true, clashHit: true, dmg: HERO_ACTIONS.L1.dmg * 1.75 };
HERO_ACTIONS.CLASH_RECOIL = { ...HERO_ACTIONS.HURT, clashLocked: true };

function startClashFinish(name) {
  const h = hero;
  h.aimNext = false;
  startAction(name);
  h.iframe = Math.max(h.iframe, h.act.def.dur);
  setBoss('parried');
}

function startClash() {
  const h = hero, b = boss;
  startAction('CLASH');
  h.act.pattern = CLASH_PATTERNS[CLASH_OPENING[b.state] || 'left'];
  h.act.patternStart = 0;
  const count = CLASH_MIN + Math.floor(Math.random() * (CLASH_MAX - CLASH_MIN + 1));
  const end = count * CLASH_BEAT;
  h.act.def = { ...h.act.def, dur: end + 0.3, active: [0, end] };
  h.act.beat = 0;
  h.act.contacts = count;
  h.iframe = h.act.def.dur + 0.3;
  // swing round to face the boss side-on to the camera so both blades stay in view
  h.act.a0 = Math.atan2(h.x - b.x, h.z - b.z);
  h.act.a1 = Math.sin(h.act.a0) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  h.face = Math.atan2(b.x - h.x, b.z - h.z);
  b.face = Math.atan2(h.x - b.x, h.z - b.z);
  setBoss('clash');
}
// keeps both fighters squared up and fires one blade-on-blade impact per beat
function clashCollateral(fighter, reach, vertical) {
  const forwardX = Math.sin(fighter.face), forwardZ = Math.cos(fighter.face);
  for (const enemy of enemies) {
    if (enemy.dead || enemy.y > 2.5) continue;
    const dx = enemy.x - fighter.x, dz = enemy.z - fighter.z;
    const distance = Math.hypot(dx, dz);
    if (distance > reach + ENEMY[enemy.type].radius) continue;
    const forward = dx * forwardX + dz * forwardZ;
    if (forward < distance * (vertical ? 0.45 : -0.15)) continue;
    damageEnemy(enemy, enemy.hp, 5, 3, true, fighter.x, fighter.z);
  }
}

function clashStep(a) {
  const h = hero, b = boss;
  const end = a.def.active[1];
  if (b?.state === 'clashCounter') { a.t = Math.min(a.t, end); return; }
  if (!b || b.dead || b.state !== 'clash') { a.t = Math.max(a.t, end); return; }
  if (a.beat === a.contacts && a.t >= end) {
    const roll = Math.random();
    if (roll < 0.5) {
      startAction('CLASH_RECOIL');
      setBoss('clashRecoil');
    } else if (roll < 0.75) {
      startClashFinish('CLASH_FOLLOWUP');
    } else {
      setBoss('clashCounter');
    }
    return;
  }
  const k = Math.min(a.contacts - 1, Math.floor(a.t / CLASH_BEAT)), u = a.t - k * CLASH_BEAT;
  if (a.nextPattern && a.beat === k) {
    a.pattern = a.nextPattern;
    a.patternStart = k;
    a.nextPattern = null;
  }
  a.cut = a.pattern[(k - a.patternStart) % a.pattern.length];
  const cut = HERO_ACTIONS[a.cut];
  const contact = (cut.active[0] + cut.active[1]) / 2;
  const poseTime = u < CLASH_IMPACT ? contact * u / CLASH_IMPACT
    : contact + (cut.dur - contact) * (u - CLASH_IMPACT) / (CLASH_BEAT - CLASH_IMPACT);
  sampleKeys(cut.keys, poseTime, h.target);
  // lean in on the cut, give ground on the recoil
  const gap = 2.7 * bossScale() / 2.3 + (u < CLASH_IMPACT ? 0.25 - 0.4 * (u / CLASH_IMPACT) : -0.15 + 0.4 * ((u - CLASH_IMPACT) / (CLASH_BEAT - CLASH_IMPACT)));
  const w = Math.min(1, a.t / 0.3), ang = angLerp(a.a0, a.a1, w * w * (3 - 2 * w));
  h.x = b.x + Math.sin(ang) * gap; h.z = b.z + Math.cos(ang) * gap;
  h.face = Math.atan2(b.x - h.x, b.z - h.z); b.face = ang;
  if (a.beat < a.contacts && a.t >= a.beat * CLASH_BEAT + CLASH_IMPACT) {
    const last = a.beat === a.contacts - 1;
    a.beat++;
    // the meeting point: between the hero's blade and the boss, at blade height
    const cx = h.x + Math.sin(h.face) * 1.5, cz = h.z + Math.cos(h.face) * 1.5;
    const cy = CLASH_VERTICAL.has(a.cut) ? 2.3 : 1.55 + 0.25 * (a.beat % 2);
    fx.hitFlash(cx, cy, cz, true, false); fx.spark(cx, cy, cz, last ? 50 : 26);
    if (last) { fx.hitFlash(cx, cy, cz, true, false); fx.ring(cx, cz, 3.4, 0xfff0c0, 0.45); }
    sfx.play(last ? 'parry' : 'clang', last ? 1 : 0.9);
    G.hitstop = Math.max(G.hitstop, last ? 0.14 : 0.06); G.shake = Math.max(G.shake, last ? 0.8 : 0.4);
    const vertical = CLASH_VERTICAL.has(a.cut);
    clashCollateral(h, 3.3, vertical);
    clashCollateral(b, 3.4 * bossScale() / 2.3, vertical);
    G.clashHits = (G.clashHits || 0) + 1;
  }
}

function startDisarm() {
  const h = hero, b = boss;
  const mesh = b.axe.clone();
  b.axe.updateWorldMatrix(true, false);
  b.axe.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
  const angle = Math.hypot(h.x - b.x, h.z - b.z) > 0.3
    ? Math.atan2(h.x - b.x, h.z - b.z) : h.face + Math.PI;
  const side = angle + Math.PI / 2;
  b.droppedAxe = { mesh, vx: Math.sin(side) * 4.6, vz: Math.cos(side) * 4.6, vy: 2.2 };
  b.axe.visible = false;
  scene.add(mesh);
  const { x, y, z } = mesh.position;
  fx.hitFlash(x, y, z, true, true);
  fx.spark(x, y, z, 60);
  fx.ring(x, z, 3.6, 0x78e1ff, 0.5);
  G.hitstop = Math.max(G.hitstop, 0.21);
  const gap = 2.5 * bossScale() / 2.3;
  h.x = b.x + Math.sin(angle) * gap;
  h.z = b.z + Math.cos(angle) * gap;
  h.face = angle + Math.PI;
  b.face = angle;
  startClashFinish('CLASH_DISARM');
}

function updateDroppedAxe(b, dt) {
  const drop = b.droppedAxe;
  if (!drop) return;
  const { mesh } = drop;
  if (mesh.position.y <= 0.32 && drop.vy <= 0) return;
  if (Math.random() < Math.min(1, dt * 24)) {
    fx.spark(mesh.position.x, mesh.position.y, mesh.position.z, 3);
  }
  drop.vy -= 17 * dt;
  mesh.position.x += drop.vx * dt;
  mesh.position.z += drop.vz * dt;
  mesh.position.y = Math.max(0.32, mesh.position.y + drop.vy * dt);
  mesh.rotateX(7 * dt);
  mesh.rotateZ(3 * dt);
  if (mesh.position.y === 0.32) {
    mesh.rotation.set(Math.PI / 2, mesh.rotation.y, 0);
    fx.hitFlash(mesh.position.x, 0.35, mesh.position.z);
    fx.spark(mesh.position.x, 0.35, mesh.position.z, 24);
    fx.ring(mesh.position.x, mesh.position.z, 2.1, 0x78e1ff, 0.38);
    sfx.play('clang', 0.8);
  }
}

function restoreBossAxe(b) {
  if (!b.droppedAxe) return;
  scene.remove(b.droppedAxe.mesh);
  b.droppedAxe = null;
  b.axe.visible = true;
}

function tryParry() {
  const h = hero, a = h.act, b = boss;
  if (!a || !a.def.type || a.def.clashLocked || NO_PARRY.has(a.name) || G.time - a.startT > PARRY_WIN) return false;
  // a landing leap comes down on top of the hero: judge facing against where it jumped from
  const ox = b.state === 'leap' ? b.lx : b.x, oz = b.state === 'leap' ? b.lz : b.z;
  const toB = Math.atan2(ox - h.x, oz - h.z);
  const precise = G.time - (h.lastSlashPress ?? -Infinity) <= DISARM_WIN;
  // A direction held with the precise press may turn the slash away from its original facing.
  const facesBoss = face => Math.abs(angLerp(face, toB, 1) - face) <= 1.3;
  if (Math.hypot(ox - h.x, oz - h.z) > 0.3 && !facesBoss(h.face)
      && !(precise && facesBoss(h.slashFacing))) return false;
  const cx = (b.x + h.x) / 2, cz = (b.z + h.z) / 2;
  fx.hitFlash(cx, 1.9, cz, true, false); fx.hitFlash(cx, 1.9, cz, true, false);
  fx.spark(cx, 1.9, cz, 44); fx.ring(cx, cz, 3.2, 0xfff0c0, 0.4); fx.ring(b.x, b.z, 5, 0xffd080, 0.6);
  sfx.play('parry');
  G.hitstop = Math.max(G.hitstop, 0.16); G.slowmo = Math.min(G.slowmo, 0.35); G.shake = Math.max(G.shake, 0.75);
  gainRage(12); h.iframe = Math.max(h.iframe, 0.25);
  b.tele = false; b.poise = 0; b.y = 0;
  G.parries = (G.parries || 0) + 1;
  if (precise) startDisarm();
  else startClash();
  const kind = precise ? 'disarm' : 'clash';
  if (tutorial && tutorial.lesson.boss && tutorial.lesson.id !== kind && tutorial.count < TUTORIAL_REPS) {
    $('#tutorial-status').textContent = precise ? '打ち落としになった。次は少し早く押そう。' : '打ち合いになった。次はもう少し引きつけよう。';
  }
  tutorialSuccess(kind);
  return true;
}
// every boss strike goes through here: a parry cancels it, otherwise it hurts if it connects
function bossStrike(dmg, connects, sx, sz) {
  boss.glinted = false;
  if (connects && tryParry()) return true;
  if (tutorial && tutorial.count < TUTORIAL_REPS) {
    $('#tutorial-status').textContent = connects ? 'タイミングを合わせて、もう一度。' : 'ボスの正面で、もう一度。';
  }
  if (connects) hurtHero(dmg, sx, sz);
  return false;
}

let calloutTimer = 0;
function callout(text, color) {
  const el = $('#callout'); if (!el) return;
  el.textContent = text; el.style.color = color || '';
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(calloutTimer); calloutTimer = setTimeout(() => el.classList.remove('show'), 900);
}

// ======================================================================= enemy logic
function spawnEnemy(type) {
  const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 8;
  let x = hero.x + Math.cos(a) * d, z = hero.z + Math.sin(a) * d;
  const r = Math.hypot(x, z); if (r > ARENA - 1) { x *= (ARENA - 1) / r; z *= (ARENA - 1) / r; }
  const def = ENEMY[type];
  const hp = Math.round(def.hp * DIFFICULTIES[G.difficulty].hp);
  enemies.push({ type, x, z, y: 0, vx: 0, vz: 0, vy: 0, face: Math.atan2(hero.x - x, hero.z - z), hp, state: 'walk', t: 0, cd: 1 + Math.random() * 2, phase: Math.random() * 6, dead: false, lastHit: -1, pose: {}, spin: 0, slot: Math.random() * Math.PI * 2 });
}

const _rootM = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _eu = new THREE.Euler();
function updateEnemies(dt) {
  const rules = DIFFICULTIES[G.difficulty];
  let attackers = 0;
  for (const e of enemies) if (!e.dead && (e.state === 'windup' || e.state === 'strike')) attackers++;
  crowd.begin();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], def = ENEMY[e.type];
    e.t += dt;
    const dx = hero.x - e.x, dz = hero.z - e.z, dist = Math.hypot(dx, dz);
    if (e.dead) {
      e.vy -= 22 * dt; e.y = Math.max(0, e.y + e.vy * dt);
      if (e.y <= 0) {
        if (e.vy < -6 && !e.bounced) { e.bounced = true; e.vy = -e.vy * 0.35; fx.mist(e.x, 0.2, e.z, 0, 0, 2); fx.decal(e.x, e.z, 1.4); }
        else { e.vy = 0; e.spin *= 0.8; e.tumble = 0; }
      }
      e.face += e.spin * dt;
      e.tumbleA = (e.tumbleA || 0) + (e.tumble || 0) * dt;
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
          const sp = (dist > want ? def.speed : (attackers >= 5 ? def.speed * 0.35 : 0)) * rules.speed;
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
            if (dist < def.range + 0.35 && ang < 1.0) hurtHero(def.dmg * rules.damage, e.x, e.z);
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
    // airborne corpses tumble end over end
    const rp = e.dead && e.y > 0.05 && e.tumbleA ? { ...e.pose, rootPitch: (e.pose.rootPitch || 0) + e.tumbleA } : e.pose;
    crowd.add(_rootM, rp, def.weapon, def.color);
  }
  crowd.end();
}

// ======================================================================= boss
function updateBoss(dt) {
  const b = boss; if (!b || b.state === 'hidden') return;
  updateDroppedAxe(b, dt);
  dt *= b.speed;
  b.t += dt;
  const dx = hero.x - b.x, dz = hero.z - b.z, dist = Math.hypot(dx, dz), toHero = Math.atan2(dx, dz);
  const turn = (k) => { b.face = angLerp(b.face, toHero, Math.min(1, dt * k)); };
  const sk = bossScale() / 2.3;
  b.strikeIn = strikeEta(b, dist);
  // the weapon glints just before each strike: the parry cue
  if (b.strikeIn != null && b.strikeIn <= GLINT_AT && b.strikeIn > 0 && !b.glinted) {
    b.glinted = true; b.axe.getWorldPosition(tmpV2);
    fx.hitFlash(tmpV2.x, tmpV2.y + 0.6, tmpV2.z, true, false); fx.ring(b.x, b.z, 2.2 * sk, 0xfff4d0, 0.35); sfx.play('glint');
  }
  switch (b.state) {
    case 'roar': if (b.t > 2.2) setBoss('walk'); break;
    case 'walk':
      turn(3);
      if (dist > 4.2) { b.x += Math.sin(b.face) * 3.4 * dt; b.z += Math.cos(b.face) * 3.4 * dt; }
      b.phase += dt * 5; b.cd -= dt;
      if (b.cd <= 0) {
        // stages 1-3 keep the original three attacks; later bosses mix in their extra moves
        const has = (k) => b.attacks.has(k);
        const extraNear = ['combo', 'sweep'].filter(has), extraMid = ['leap'].filter(has);
        const any = (l) => l[Math.floor(Math.random() * l.length)];
        if (dist < 6) setBoss(extraNear.length && Math.random() < 0.45 ? any(extraNear) + 'Wind' : Math.random() < 0.6 ? 'cleaveWind' : 'slamWind');
        else if (dist > 10) setBoss(extraMid.length && Math.random() < 0.5 ? 'leapWind' : 'chargeWind');
        else if (Math.random() < 0.5) setBoss(extraMid.length && Math.random() < 0.4 ? 'leapWind' : 'slamWind');
      }
      break;
    case 'cleaveWind': turn(2.5); if (b.t > 0.85) setBoss('cleave'); break;
    case 'clashCounter':
    case 'cleave': {
      const counter = b.state === 'clashCounter';
      if (!b.hitDone && b.t > (counter ? 0.24 : 0.12)) {
        b.hitDone = true; sfx.play('swingHeavy');
        const damage = 160 * b.dmgMul;
        if (counter) {
          hero.iframe = 0;
          hurtHero(damage, b.x, b.z);
          clashCollateral(b, 3.4 * sk, false);
          if (hero.act?.name === 'CLASH') startAction('HURT');
        } else {
          const ang = Math.abs(angLerp(b.face, toHero, 1) - b.face);
          if (bossStrike(damage, dist < 6.2 * sk && ang < 1.4, b.x, b.z)) break;
        }
      }
      if (b.t > 1.0) setBoss('walk', 0.8 + Math.random());
      break;
    }
    // three quick alternating cleaves, each one can be parried or evaded
    case 'comboWind': turn(3); if (b.t > 0.5) { setBoss('combo'); b.hitN = 0; } break;
    case 'combo': {
      const k = Math.min(2, Math.floor(b.t / 0.5)), u = b.t - k * 0.5;
      if (u < 0.3) { turn(4); if (dist > 3.4 * sk) { b.x += Math.sin(b.face) * 3 * dt; b.z += Math.cos(b.face) * 3 * dt; } }
      if (b.hitN === k && u >= 0.32) {
        b.hitN++; sfx.play('swingHeavy');
        const ang = Math.abs(angLerp(b.face, toHero, 1) - b.face);
        if (bossStrike(120 * b.dmgMul, dist < 6.0 * sk && ang < 1.4, b.x, b.z)) break;
      }
      if (b.t > 1.85) setBoss('walk', 1.0 + Math.random());
      break;
    }
    // crouch, leap onto the hero's position, crash down with a shockwave
    case 'leapWind':
      turn(5);
      if (!b.tele) { b.tele = true; b.tx = hero.x; b.tz = hero.z; fx.telegraph(b.tx, b.tz, 4.3, (0.6 + 0.9) / b.speed); }
      if (b.t > 0.6) { setBoss('leap'); b.lx = b.x; b.lz = b.z; sfx.play('roar', 0.4); }
      break;
    case 'leap': {
      const u = Math.min(1, b.t / 0.9);
      b.x = b.lx + (b.tx - b.lx) * u; b.z = b.lz + (b.tz - b.lz) * u; b.y = 4 * 5.5 * u * (1 - u);
      b.face = angLerp(b.face, Math.atan2(b.tx - b.lx, b.tz - b.lz), Math.min(1, dt * 6));
      if (u >= 1 && !b.hitDone) {
        b.hitDone = true; b.tele = false; b.y = 0; sfx.play('slam'); G.shake = 1;
        fx.ring(b.tx, b.tz, 5.6, 0xff5020, 0.6); fx.spark(b.tx, 0.3, b.tz, 36);
        for (const e of enemies) if (!e.dead && Math.hypot(e.x - b.tx, e.z - b.tz) < 4) { e.vx += (e.x - b.tx) * 3; e.vz += (e.z - b.tz) * 3; }
        if (bossStrike(240 * b.dmgMul, Math.hypot(hero.x - b.tx, hero.z - b.tz) < 4.3, b.tx, b.tz)) break;
        setBoss('leapLand');
      }
      break;
    }
    case 'leapLand': if (b.t > 1.1) setBoss('walk', 1 + Math.random()); break;
    // full-circle sweep around the boss
    case 'sweepWind':
      turn(2);
      if (!b.tele) { b.tele = true; fx.telegraph(b.x, b.z, 5.6, 0.9 / b.speed); }
      if (b.t > 0.9) { setBoss('sweep'); b.face0 = b.face; }
      break;
    case 'sweep':
      b.face = b.face0 + Math.min(1, b.t / 0.55) * Math.PI * 2;
      if (!b.hitDone && b.t > 0.28) {
        b.hitDone = true; b.tele = false; sfx.play('swingHeavy'); sfx.play('slam', 0.4);
        fx.ring(b.x, b.z, 6, 0xffa040, 0.45);
        if (bossStrike(190 * b.dmgMul, dist < 5.6, b.x, b.z)) break;
      }
      if (b.t > 1.1) { b.face = wrapAng(b.face); setBoss('walk', 1 + Math.random()); }
      break;
    case 'clash':
      // driven by the hero's CLASH action; bail out if that was cut short
      if (!hero.act || hero.act.name !== 'CLASH') setBoss('parried');
      break;
    case 'clashRecoil':
      if (b.t >= HERO_ACTIONS.HURT.dur * b.speed) setBoss('walk', 0.5);
      break;
    case 'parried':
      // knocked off balance: slides back, open to punishment (extra damage) for a moment
      if (b.t < 0.3) { b.x -= Math.sin(b.face) * 5 * dt; b.z -= Math.cos(b.face) * 5 * dt; }
      if (b.t > 1.9) setBoss('walk', 0.5);
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
        if (bossStrike(220 * b.dmgMul, Math.hypot(hero.x - b.tx, hero.z - b.tz) < 4.1, b.tx, b.tz)) break;
      }
      if (b.t > 1.2) setBoss('walk', 1 + Math.random());
      break;
    case 'chargeWind': turn(5); if (b.t > 0.7) { setBoss('charge'); sfx.play('roar', 0.5); } break;
    case 'charge':
      b.x += Math.sin(b.face) * 15 * dt; b.z += Math.cos(b.face) * 15 * dt; b.phase += dt * 12;
      if (!b.hitDone && dist < 2.3 * sk) { b.hitDone = true; if (bossStrike(140 * b.dmgMul, true, b.x, b.z)) break; }
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
    const minD = 1.6 * sk;
    if (b.y < 1.5 && d2 < minD && d2 > 1e-3) { hero.x = b.x + (hero.x - b.x) / d2 * minD; hero.z = b.z + (hero.z - b.z) / d2 * minD; }
  }
  // new attacks reuse the base poses: combo = repeated cleave, leap = raised axe then slam, sweep = cleave + spin
  let ps = b.state, tt;
  if (ps === 'combo') { const k = Math.min(2, Math.floor(b.t / 0.5)), u = b.t - k * 0.5; if (u < 0.32 && b.t < 1.5) { ps = 'cleaveWind'; tt = u / 0.3; } else { ps = 'cleave'; tt = (u - 0.32) / 0.2; } }
  else if (ps === 'comboWind' || ps === 'sweepWind') { ps = 'cleaveWind'; tt = b.t / (b.state === 'comboWind' ? 0.5 : 0.9); }
  else if (ps === 'sweep') { ps = 'cleave'; tt = b.t / 0.3; }
  else if (ps === 'leapWind') { ps = 'chargeWind'; tt = b.t / 0.6; }
  else if (ps === 'leap') { const u = b.t / 0.9; if (u < 0.7) { ps = 'slamWind'; tt = u / 0.5; } else { ps = 'slam'; tt = (u - 0.7) / 0.3; } }
  else if (ps === 'leapLand') { ps = 'slam'; tt = 1; }
  else if (ps === 'parried') { ps = 'stagger'; tt = b.t / 1.9; }
  else if (ps === 'clashRecoil') { ps = 'stagger'; tt = b.t / (HERO_ACTIONS.HURT.dur * b.speed); }
  else if (ps === 'clashCounter') {
    if (b.t < 0.12) { ps = 'cleaveWind'; tt = 0.6 + b.t / 0.3; }
    else { ps = 'cleave'; tt = (b.t - 0.12) / 0.3; }
  }
  else if (ps === 'clash') {
    const at = hero.act?.name === 'CLASH' ? hero.act.t : 0, k = Math.floor(at / CLASH_BEAT), u = at - k * CLASH_BEAT;
    const vertical = CLASH_VERTICAL.has(hero.act?.cut);
    const wind = CLASH_IMPACT - 0.04;
    if (u < wind) {
      ps = vertical ? 'slamWind' : 'cleaveWind'; tt = 0.55 + 0.45 * u / wind;
    } else {
      ps = vertical ? 'slam' : 'cleave'; tt = 0.35 + 0.65 * (u - wind) / (CLASH_BEAT - wind);
    }
  }
  else tt = { cleaveWind: b.t / 0.85, cleave: b.t / 0.3, slamWind: b.t / 0.9, slam: b.t / 0.18, chargeWind: b.t / 0.6, roar: b.t / 2.2, stagger: b.t / 1.6, dead: b.t / 1.4 }[b.state] ?? b.t;
  bossPose(ps, tt, b.phase, b.target);
  smoothPose(b.pose, b.target, Math.min(1, dt * (b.state === 'clash' ? 34 : ps === 'cleave' || ps === 'slam' ? 30 : 12)));
  applyPose(b.rig, b.pose);
  b.rig.root.position.set(b.x, b.y || 0, b.z); b.rig.root.rotation.y = b.face;
  if (b.state === 'roar' && Math.random() < 0.5) fx.ember(b.x, 1.5, b.z);
}

function setBoss(s, cd) {
  if (s !== 'parried' && s !== 'dead') restoreBossAxe(boss);
  boss.state = s; boss.t = 0; boss.hitDone = false; if (cd !== undefined) boss.cd = cd;
  if (s.endsWith('Wind')) boss.glinted = false;
  if (s !== 'leap') boss.y = 0;
}
// seconds (game time) until the boss's next strike lands, or null when no strike is coming
function strikeEta(b, dist) {
  const v = b.speed, sk = bossScale() / 2.3;
  switch (b.state) {
    case 'cleaveWind': return (0.85 - b.t + 0.12) / v;
    case 'cleave': return b.hitDone ? null : (0.12 - b.t) / v;
    case 'slamWind': return (1.15 - b.t + 0.14) / v;
    case 'slam': return b.hitDone ? null : (0.14 - b.t) / v;
    case 'chargeWind': return (0.7 - b.t) / v + Math.max(0, dist - 2.3 * sk) / (15 * v);
    case 'charge': return b.hitDone ? null : Math.max(0, dist - 2.3 * sk) / (15 * v);
    case 'comboWind': return (0.5 - b.t + 0.32) / v;
    case 'combo': return b.hitN > 2 ? null : (b.hitN * 0.5 + 0.32 - b.t) / v;
    case 'leapWind': return (0.6 - b.t + 0.9) / v;
    case 'leap': return b.hitDone ? null : (0.9 - b.t) / v;
    case 'sweepWind': return (0.9 - b.t + 0.28) / v;
    case 'sweep': return b.hitDone ? null : (0.28 - b.t) / v;
    default: return null;
  }
}

function damageBoss(dmg, stop = 0.095) {
  if (tutorial) return;
  const b = boss;
  b.hp -= dmg; b.poise += dmg; addCombo();
  const dx = b.x - hero.x, dz = b.z - hero.z, l = Math.hypot(dx, dz) || 1;
  const x = b.x - dx / l * 0.95, z = b.z - dz / l * 0.95;
  const y = b.y + 2.2 * bossScale() / 2.3;
  fx.blood(x, y, z, -dx / l, -dz / l, 16, 1.2);
  fx.hitFlash(x, y, z, true, b.hp <= 0);
  fx.spark(x, y, z, stop >= 0.12 ? 25 : 15);
  G.hitstop = Math.max(G.hitstop, stop);
  G.shake = Math.max(G.shake, stop >= 0.12 ? 0.6 : 0.35);
  if (b.hp <= 0 && !b.dead) {
    b.hp = 0; b.dead = true; setBoss('dead'); b.deadT = 0; G.slowmo = 0.25; G.ko++; G.shake = 1; gainExp(40);
    sfx.play('roar', 0.8);
    for (const e of enemies) if (!e.dead) { e.hp = 0; damageEnemy(e, 1, 8, 4, true, b.x, b.z); }
    return;
  }
  if (b.poise > 420 && b.state !== 'stagger' && b.state !== 'parried' && b.state !== 'leap') { b.poise = 0; setBoss('stagger'); sfx.play('clang'); }
  // enraged phase below half health: faster, plus a ring of reinforcements
  if (b.enrageOn && !b.enraged && b.hp < b.maxHp * 0.5) {
    b.enraged = true; b.speed *= 1.25; b.dmgMul *= 1.15;
    b.mat.emissive.setRGB(0.25, 0.02, 0.0);
    showBanner('激昂', `${stage().boss.name}が怒り狂う`); sfx.play('roar'); G.shake = 0.8;
    if (G.mode !== 'boss') for (let i = 0; i < 8; i++) spawnEnemy(i % 2 ? 'lancer' : 'grunt');
  }
}

// ======================================================================= waves
function nextWave() {
  G.waveIdx++;
  const w = waveDef();
  G.spawnLeft = w.total; G.spawnT = 1.5;
  showBanner(w.label, w.sub);
  sfx.play('wave');
  if (w.boss) spawnBoss();
}

function spawnBoss() {
  boss = boss || makeBoss();
  const bc = stage().boss;
  const rules = G.mode === 'boss' && G.difficulty === 'easy'
    ? { hp: 0.75, damage: 0.75, speed: 0.9 }
    : DIFFICULTIES[G.difficulty];
  boss.maxHp = boss.hp = Math.round(bc.hp * rules.hp);
  boss.speed = bc.speed * rules.speed; boss.dmgMul = bc.dmg * rules.damage;
  boss.enrageOn = bc.enrage; boss.enraged = false;
  boss.dead = false; boss.poise = 0; boss.mat.color.setRGB(...bc.tint).multiplyScalar(2.0); boss.mat.emissive.setRGB(...(bc.glow || [0, 0, 0]));
  boss.scale = bc.scale || 2.3; boss.rig.root.scale.setScalar(boss.scale); boss.y = 0; boss.tele = false;
  boss.attacks = new Set(bc.attacks || ['cleave', 'slam', 'charge']);
  $('#boss .name').textContent = bc.name;
  // enter from the top of the screen (camera looks toward +Z), kept inside the arena
  boss.x = hero.x * 0.6; boss.z = hero.z + 14;
  const br = Math.hypot(boss.x, boss.z); if (br > ARENA - 4) { boss.x *= (ARENA - 4) / br; boss.z *= (ARENA - 4) / br; }
  if (Math.hypot(boss.x - hero.x, boss.z - hero.z) < 9) { boss.x = hero.x * 0.3; boss.z = hero.z * 0.3 - Math.sign(hero.z || 1) * 6; }
  boss.face = Math.atan2(hero.x - boss.x, hero.z - boss.z);
  setBoss('roar'); boss.cd = 2; boss.rig.root.visible = true;
  if (tutorial) return;
  setTimeout(() => sfx.play('roar'), 400);
  UI.bossBar.hidden = false;
  { const k = window.matchMedia?.('(pointer: fine)').matches ? 'J' : '斬'; showTip(`武器が光ったら ${k} で弾く ／ 命中寸前の${k}で武器を落とす ／ 打ち合い中は方向＋${k} で派生`); }
}

function updateWaves(dt) {
  if (tutorial) { updateTutorial(); return; }
  if (G.mode === 'boss') {
    if (G.waveIdx < 0 && (G.introT -= dt) <= 0) {
      G.waveIdx = stage().waves.length - 1;
      spawnBoss();
    }
    return;
  }
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

let tipTimer = 0;
function showTip(text) {
  const el = $('#tip'); if (!el) return;
  el.textContent = text; el.classList.add('show');
  clearTimeout(tipTimer); tipTimer = setTimeout(() => el.classList.remove('show'), 6000);
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

// Keep the original save for NORMAL and one separate checkpoint for each other mode.
const SAVE_KEY = 'ironwake-save-v1';
const selectedDifficulty = () => $('input[name="difficulty"]:checked').value;
const saveKey = difficulty => difficulty === 'normal' ? SAVE_KEY : SAVE_KEY + '-' + difficulty;
function loadSave(difficulty) {
  try { return JSON.parse(localStorage.getItem(saveKey(difficulty)) || 'null'); } catch (e) { return null; }
}
function writeSave(data) {
  try {
    localStorage.setItem(saveKey(G.difficulty), JSON.stringify({ ...data, difficulty: G.difficulty }));
  } catch (e) { /* storage unavailable */ }
}
function refreshContinue() {
  const sv = loadSave(selectedDifficulty()), btn = $('#btn-continue');
  if (sv && STAGES[sv.stage]) { btn.hidden = false; btn.textContent = `続きから（${STAGES[sv.stage].name}・Lv${sv.level}）`; }
  else btn.hidden = true;
}

const TUTORIAL_REPS = 3;
const TUTORIAL_LESSONS = [
  { id: 'slash', name: '斬撃', hint: (slash, heavy) => `${slash}で斬り、斬っている間に方向を入れながら${heavy}を押す。` },
  { id: 'spin', name: '重回転', hint: (_slash, heavy) => `${heavy}を光るまで長押ししてから離す。` },
  { id: 'dodgeCut', name: '回避からの斬撃', hint: (slash, _heavy, dodge) => `${dodge}を押し、転がっている間に${slash}を押す。` },
  { id: 'dodgeSpin', name: '回避からの重回転', hint: (_slash, heavy, dodge) => `${dodge}を押し、転がっている間に${heavy}を長押し。光ったら離す。` },
  { id: 'disarm', name: '打ち落とし', boss: true, hint: slash => `命中直前、白線が右端の緑に入ったら${slash}。` },
  { id: 'clash', name: '打ち合い', boss: true, hint: slash => `武器が光った後、白線が緑に入ったら${slash}。` },
];
let tutorial = null;
let selectedSlash = null;

function tutorialKeys() {
  return matchMedia('(pointer: coarse)').matches ? ['「斬」', '「重」', '「避」'] : ['J', 'K', 'Space'];
}

function buildSlashSteps(commands) {
  const [slash, heavy] = tutorialKeys();
  const touch = matchMedia('(pointer: coarse)').matches;
  const steps = commands.map(step => {
    const item = document.createElement('li');
    const full = document.createElement('span'), compact = document.createElement('span');
    const direction = SLASH_DIRECTIONS[step.dir];
    const button = step.kind === 'heavy' ? heavy : slash;
    full.className = 'step-full';
    full.textContent = direction
      ? (touch ? `${direction.stick}にスティックを倒したまま${button}` : `${direction.keys}を押しながら ${button}`)
      : (touch ? `スティックから指を離して${button}` : `方向キーを離して ${button}`);
    compact.className = 'step-compact';
    compact.textContent = direction
      ? `${touch ? direction.stick : direction.keys} ＋ ${button}`
      : `${touch ? 'スティックを離す' : '方向キーを離す'} → ${button}`;
    item.append(full, compact);
    return item;
  });
  $('#tutorial-steps').replaceChildren(...steps);
  markSlashStep();
}

function markSlashStep() {
  for (const [index, item] of Array.from($('#tutorial-steps').children).entries()) {
    if (!tutorial.resetSlash && index === tutorial.step) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  }
}

function recordSlashCommand(kind, dir, move, opening = false) {
  if (!tutorial?.pattern || tutorial.resetSlash || tutorial.count >= TUTORIAL_REPS) return;
  if (opening) tutorial.step = 0;
  const step = tutorial.pattern.commands[tutorial.step];
  if (step.kind !== kind || step.dir !== dir || step.move !== move) {
    tutorial.resetSlash = true;
    $('#tutorial-status').textContent = '動作が終わったら、最初の手順から。';
  } else if (++tutorial.step === tutorial.pattern.commands.length) {
    tutorial.resetSlash = true;
    tutorialSuccess('pattern');
  } else {
    $('#tutorial-status').textContent = '';
  }
  markSlashStep();
}

function drawTutorialProgress() {
  $('#tutorial-progress').textContent = `${tutorial.count} / ${TUTORIAL_REPS} 回`;
}

function setTutorialLesson(index, pattern = null) {
  const lesson = pattern ? { id: 'pattern', name: pattern.name } : TUTORIAL_LESSONS[index];
  tutorial = { index, lesson, pattern, step: 0, resetSlash: false, count: 0, advanceAt: Infinity, awaitingNext: false, nextStrikeAt: G.time + 0.8 };
  $('#tutorial-name').textContent = pattern ? lesson.name : `${index + 1} / ${TUTORIAL_LESSONS.length}　${lesson.name}`;
  $('#btn-tutorial-next').hidden = true;
  $('#tutorial-steps').hidden = !pattern;
  if (pattern) {
    $('#tutorial-hint').textContent = pattern.commands.length > 1 ? '2手目以降は、前の斬撃中に入力。' : '';
    buildSlashSteps(pattern.commands);
  } else {
    $('#tutorial-hint').textContent = lesson.hint(...tutorialKeys());
  }
  $('#tutorial-status').textContent = '';
  const timing = $('#tutorial-timing');
  timing.hidden = !lesson.boss;
  timing.style.setProperty('--timing-start', `${100 * (1 - (lesson.id === 'disarm' ? DISARM_WIN : PARRY_WIN) / GLINT_AT)}%`);
  timing.style.setProperty('--timing-end', lesson.id === 'disarm' ? '0%' : `${100 * DISARM_WIN / GLINT_AT}%`);
  drawTutorialProgress();

  if (lesson.boss) {
    if (!boss || boss.state === 'hidden') {
      G.waveIdx = stage().waves.length - 1;
      spawnBoss();
    }
    setBoss('walk', Infinity);
    Object.assign(boss, { x: 0, z: 4, face: Math.PI, strikeIn: null });
    Object.assign(hero, { x: 0, z: 0, face: 0 });
  }
}

function tutorialSuccess(id) {
  if (tutorial?.lesson.id !== id || tutorial.count >= TUTORIAL_REPS) return;
  tutorial.count++;
  drawTutorialProgress();
  const complete = tutorial.count === TUTORIAL_REPS;
  $('#tutorial-status').textContent = complete ? '3回成功。課題クリア！' : `成功 ${tutorial.count}回目`;
  if (complete) {
    tutorial.advanceAt = G.time + (id === 'spin' || id === 'dodgeSpin' ? 0.95 : 0.65);
    tutorial.completedAction = hero.act;
  }
}

function updateTutorial() {
  const { pattern } = tutorial;
  if (G.time >= tutorial.advanceAt && hero.act !== tutorial.completedAction && (pattern ? !hero.act : !hero.act?.def.clashLocked)) {
    const next = tutorial.index + 1;
    if (!pattern && next < TUTORIAL_LESSONS.length) {
      tutorial.awaitingNext = true;
      $('#tutorial-hint').textContent = '';
      $('#tutorial-timing').hidden = true;
      const button = $('#btn-tutorial-next');
      button.textContent = `次の練習へ → ${TUTORIAL_LESSONS[next].name}`;
      button.hidden = false;
      button.focus({ preventScroll: true });
    } else {
      G.state = 'tutorial-complete';
      sfx.stopMusic();
      UI.hud.hidden = true;
      $('#tutorial-summary').textContent = pattern ? `${pattern.name}を${TUTORIAL_REPS}回成功した。` : `全${TUTORIAL_LESSONS.length}課題を${TUTORIAL_REPS}回ずつ成功した。`;
      $('#btn-other-slash').hidden = !pattern;
      $('#tutorial-complete').hidden = false;
      $('#btn-tutorial-title').focus();
    }
    return;
  }
  if (pattern) {
    if (!hero.act && (tutorial.resetSlash || tutorial.step > 0)) {
      Object.assign(hero, { face: 0, neutralChain: 0, lightRecovery: 0 });
      tutorial.step = 0;
      tutorial.resetSlash = false;
      markSlashStep();
    }
    return;
  }
  if (!tutorial.lesson.boss) return;
  if (tutorial.count < TUTORIAL_REPS && boss.state === 'walk' && G.time >= tutorial.nextStrikeAt) {
    Object.assign(boss, { x: 0, z: 4, face: Math.PI, strikeIn: null });
    Object.assign(hero, { x: 0, z: 0, face: 0 });
    setBoss('cleaveWind', Infinity);
    tutorial.nextStrikeAt = G.time + 2.4;
  }
  const remaining = Math.max(0, Math.min(GLINT_AT, boss.strikeIn ?? GLINT_AT));
  const marker = $('#tutorial-timing i');
  marker.style.left = `${99 * (1 - remaining / GLINT_AT)}%`;
}

function resetGame(keepLevel = false) {
  for (const e of enemies) e.dead = true;
  enemies.length = 0; fx.clear(); crowd.begin(); crowd.end();
  if (!keepLevel) { hero.level = 1; hero.exp = 0; hero.stats = loadStats(); }
  hero.maxHp = maxHealth(); hero.comboIdx = 0; hero.lightCount = 0; hero.lightRecovery = 0;
  hero.neutralChain = 0; hero.pendingActions = {};
  hero.lastSlashPress = null; hero.monoRun = 0;
  UI.statSelect.hidden = true; UI.hud.inert = false;
  hero.x = 0; hero.z = 0; hero.face = 0; hero.hp = hero.maxHp; hero.hpLag = hero.maxHp; hero.rage = 0; hero.rageT = 0;
  hero.act = null; hero.dead = false; hero.iframe = 0; hero.faceBossUntil = 0; hero.mat.emissive.setRGB(0, 0, 0); rageLight.intensity = 0;
  if (boss) { restoreBossAxe(boss); boss.rig.root.visible = false; boss.state = 'hidden'; boss.hp = boss.maxHp; boss.dead = false; boss.poise = 0; }
  Object.assign(G, { time: 0, ko: 0, combo: 0, maxCombo: 0, comboT: 0, hitstop: 0, shake: 0, slowmo: 1, waveIdx: -1, spawnLeft: 0, waveDelay: 0, result: null, playTime: 0 });
  UI.bossBar.hidden = true; UI.combo.hidden = true;
  tutorial = null;
  $('#tutorial-guide').hidden = true;
  $('#tutorial-complete').hidden = true;
  document.body.classList.remove('raging', 'rage-ready');
  for (const k in hudCache) delete hudCache[k];
}

function startGame(stageIdx = 0, level = 1, exp = 0, stats, difficulty = 'normal', mode = 'campaign', pattern = null) {
  G.mode = mode;
  G.difficulty = difficulty === 'easy' || difficulty === 'hard' ? difficulty : 'normal';
  const bossOnly = G.mode === 'boss';
  const maxed = G.difficulty === 'easy' && !bossOnly;
  const pick = hero.weapons[$('#weapon-select').value] || hero.weapons.standard;
  for (const w of Object.values(hero.weapons)) w.mesh.visible = w === pick;
  hero.sword = pick.mesh;
  hero.blade = pick.blade;
  // the weapon grows more sinister with every stage already cleared
  hero.weapon = pick; hero.growTier = applyGrowth(pick, G.difficulty === 'easy' ? GROW_MAX : Math.min(GROW_MAX, stageIdx));
  sfx.unlock(); sfx.play('ui'); sfx.startMusic();
  hero.level = maxed ? LEVEL_MAX : Number.isInteger(level) ? Math.min(LEVEL_MAX, Math.max(1, level)) : 1;
  hero.exp = bossOnly || maxed ? 0 : exp;
  if (bossOnly || maxed) {
    const points = hero.level - 1;
    hero.stats = Object.fromEntries(STAT_KEYS.map((key, index) =>
      [key, 1 + Math.floor(points / STAT_KEYS.length) + Number(index < points % STAT_KEYS.length)]));
  } else {
    hero.stats = loadStats(stats);
  }
  resetGame(true);
  G.stageIdx = stageIdx; applyEnv(stage().env);
  UI.title.hidden = true; UI.result.hidden = true; UI.pause.hidden = true; UI.hud.hidden = false;
  G.state = 'play'; input.clear();
  if (mode === 'tutorial') {
    clearTimeout(bannerTimer);
    clearTimeout(tipTimer);
    UI.wave.classList.remove('show');
    $('#tip').classList.remove('show');
    UI.objective.textContent = '';
    UI.bossBar.hidden = true;
    input.resetButtons(); input.resetStick(); input.keys.clear();
    $('#tutorial-guide').hidden = false;
    setTutorialLesson(0, pattern);
  } else if (bossOnly) {
    showBanner(stage().boss.name, '決戦');
    G.introT = 0.9;
    UI.objective.textContent = stage().boss.name + 'を討て';
  } else {
    showBanner(stage().name, stage().place);
    G.introT = 2.6;
    UI.objective.textContent = '';
  }
  if (statPoints() > 0) showStatSelection();
}

function endGame(win) {
  if (G.result) return;
  G.result = win ? 'win' : 'lose';
  G.state = 'over';
  sfx.stopMusic();
  const t = G.playTime;
  const score = G.ko * 100 + G.maxCombo * 40 + (win ? 20000 : 0) - Math.floor(t) * 10;
  const rank = !win ? '—' : score > 38000 ? 'S' : score > 32000 ? 'A' : score > 26000 ? 'B' : 'C';
  const bossOnly = G.mode === 'boss';
  const st = stage(), next = bossOnly ? null : STAGES[G.stageIdx + 1];
  const last = win && !next && !bossOnly;
  $('#result-title').textContent = win
    ? (bossOnly ? 'ボス討伐' : last ? '全戦場制覇' : st.name + ' 突破')
    : '力尽きた';
  $('#result-sub').textContent = win ? `${st.boss.name}は鉄塊の前に倒れた` : `${st.name}・${waveDef()?.label ?? ''}で倒れた`;
  if (win && next && G.difficulty !== 'easy' && GROW_TEXT[G.stageIdx + 1]) $('#result-sub').textContent += `。${GROW_TEXT[G.stageIdx + 1]}`;
  $('#r-lv').textContent = hero.level;
  const nb = $('#btn-next');
  nb.hidden = !win || !next;
  if (win && next) { nb.textContent = `次の戦場へ（${next.name}）`; writeSave({ stage: G.stageIdx + 1, level: hero.level, exp: hero.exp, stats: hero.stats }); }
  if (last) writeSave({ stage: G.stageIdx, level: hero.level, exp: hero.exp, stats: hero.stats, cleared: true });
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
  hero.pendingActions = {};
  input.clear();
}

// ======================================================================= main loop
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsCheck = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (landscapeTouch.matches) return;
  if (G.state === 'stat-select') return;
  if (G.state === 'levelup') { G.levelUpT += dt; if (G.levelUpT >= LEVELUP_HOLD) endLevelUp(); return; }   // frozen on the banner
  // adaptive quality: drop resolution / shadows if frames are slow
  fpsAcc += dt; fpsN++; fpsCheck += dt;
  if (fpsCheck > 2.5 && G.state === 'play') {
    const avg = fpsAcc / fpsN; fpsAcc = 0; fpsN = 0; fpsCheck = 0;
    if (avg > 1 / 45 && QUALITY.ratio > 1) { QUALITY.ratio = Math.max(1, QUALITY.ratio - 0.25); renderer.setPixelRatio(QUALITY.ratio); resize(); }
    else if (avg > 1 / 40 && QUALITY.shadows) { QUALITY.shadows = false; sun.castShadow = false; }
  }
  if (G.state === 'play' || G.state === 'over') {
    if (input.consume('pause') && G.state === 'play') { setPaused(true); }
    else if (!tutorial?.awaitingNext) {
      if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.08; }
      if (tutorial?.lesson.boss && (boss?.state === 'cleaveWind' || boss?.state === 'cleave')) dt *= 0.65;
      G.slowmo += (1 - G.slowmo) * Math.min(1, dt * 0.8);
      dt *= G.slowmo;
      // substeps > 1 only in automated tests (software GL renders far below real time)
      for (let i = 0; i < (G.substeps || 1); i++) {
        G.time += dt; if (G.state === 'play') G.playTime += dt;
        updateHero(dt); updateEnemies(dt); updateBoss(dt);
        if (G.state === 'play') updateWaves(dt);
        fx.update(dt);
        if (tutorial?.awaitingNext) break;
        if (G.state === 'play' && !hero.dead && statPoints() > 0) {
          beginLevelUp();
          break;
        }
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
  if (G.state === 'debug' || G.state === 'stat-select') return;
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

function setupWeaponPicker() {
  const select = $('#weapon-select');
  const trigger = $('#weapon-btn');
  const picker = $('#weapon-picker');
  const titleContent = $('.title-inner');
  const close = $('#weapon-picker-close');
  for (const weapon of [...BUILTIN_WEAPONS, ...EXTRA_WEAPONS]) {
    select.add(new Option(weapon.label, weapon.id));
  }
  const buttons = [...select.options].map(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.text;
    button.addEventListener('click', () => {
      select.value = option.value;
      select.dispatchEvent(new Event('change'));
      setOpen(false);
      sfx.unlock(); sfx.play('ui');
    });
    return button;
  });
  picker.querySelector('.weapon-options').append(...buttons);

  function setOpen(open) {
    picker.hidden = !open;
    titleContent.inert = open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) (buttons[select.selectedIndex] || buttons[0]).focus();
    else trigger.focus();
  }

  function showSelection() {
    trigger.textContent = select.selectedOptions[0]?.text || select.options[0].text;
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === select.selectedIndex)));
  }

  trigger.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => setOpen(false));
  picker.addEventListener('click', event => {
    if (event.target === picker) setOpen(false);
  });
  picker.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Tab') {
      const first = buttons[0];
      if (document.activeElement === (event.shiftKey ? first : close)) {
        event.preventDefault();
        (event.shiftKey ? close : first).focus();
      }
    }
  });
  select.addEventListener('change', showSelection);
  showSelection();
  $('.weapon-choice').hidden = false;
}

function setupBossBattle() {
  const trigger = $('#btn-boss-mode');
  const modal = $('#boss-setup');
  const titleContent = $('.title-inner');
  const level = $('#boss-level');
  const list = $('#boss-options');
  let selectedBoss = 0;
  level.max = LEVEL_MAX;
  $('#boss-level-range').textContent = `Lv${level.min}〜${LEVEL_MAX}`;

  function normalizeLevel() {
    const rank = Math.max(Number(level.min), Math.min(LEVEL_MAX, Math.round(level.valueAsNumber || 1)));
    level.value = rank;
    return rank;
  }
  level.addEventListener('input', () => {
    if (level.valueAsNumber > LEVEL_MAX) level.value = LEVEL_MAX;
  });
  level.addEventListener('blur', normalizeLevel);

  const choices = STAGES.map(({ boss: opponent }, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = opponent.name;
    button.addEventListener('click', () => {
      selectedBoss = index;
      choices.forEach((item, choice) => item.setAttribute('aria-pressed', String(choice === selectedBoss)));
    });
    button.setAttribute('aria-pressed', String(index === selectedBoss));
    return button;
  });
  list.append(...choices);

  function setOpen(open) {
    modal.hidden = !open;
    titleContent.inert = open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) choices[selectedBoss].focus();
    else trigger.focus();
  }
  trigger.addEventListener('click', () => setOpen(true));
  $('#btn-boss-close').addEventListener('click', () => setOpen(false));
  modal.addEventListener('click', event => { if (event.target === modal) setOpen(false); });
  modal.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    if (event.key === 'Tab') {
      const first = choices[0], last = $('#btn-boss-close');
      if (document.activeElement === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  });
  $('#btn-boss-start').addEventListener('click', () => {
    const rank = normalizeLevel();
    const difficulty = $('input[name="boss-difficulty"]:checked').value;
    setOpen(false);
    startGame(selectedBoss, rank, 0, undefined, difficulty, 'boss');
  });
}

function setupControlsGuide() {
  const trigger = $('#btn-controls-guide'), modal = $('#controls-guide');
  const close = $('#btn-controls-close'), titleContent = $('.title-inner');
  function show(open) {
    modal.hidden = !open;
    titleContent.inert = open;
    trigger.setAttribute('aria-expanded', String(open));
    (open ? close : trigger).focus({ preventScroll: true });
  }
  trigger.addEventListener('click', () => show(true));
  close.addEventListener('click', () => show(false));
  modal.addEventListener('click', event => { if (event.target === modal) show(false); });
  modal.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Tab') event.preventDefault();
    if (event.key === 'Escape') { event.preventDefault(); show(false); }
  });
  matchMedia('(orientation: landscape)').addEventListener('change', () => {
    if (!UI.title.hidden) UI.title.scrollTop = 0;
  });
}

function setupSlashTraining() {
  const trigger = $('#btn-slash-tutorial'), modal = $('#slash-setup'), list = $('#slash-options');
  const close = $('#btn-slash-close'), titleContent = $('.title-inner');
  function setOpen(open) {
    modal.hidden = !open;
    titleContent.inert = open;
    trigger.setAttribute('aria-expanded', String(open));
    (open ? close : trigger).focus();
  }
  trigger.addEventListener('click', () => {
    if (!list.children.length) {
      for (const lesson of SLASH_LESSONS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = lesson.name;
        button.dataset.slash = lesson.move;
        button.addEventListener('click', () => { setOpen(false); startTutorial(lesson); });
        list.append(button);
      }
    }
    setOpen(true);
  });
  close.addEventListener('click', () => setOpen(false));
  modal.addEventListener('click', event => { if (event.target === modal) setOpen(false); });
  modal.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    if (event.key === 'Tab') {
      const focusable = [...modal.querySelectorAll('button')];
      const next = event.shiftKey ? focusable.at(-1) : focusable[0];
      if (document.activeElement === (event.shiftKey ? focusable[0] : focusable.at(-1))) {
        event.preventDefault();
        next.focus();
      }
    }
  });
}

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
  setupWeaponPicker();
  setupBossBattle();
  setupSlashTraining();
  setupControlsGuide();
  G.state = 'title'; applyEnv(STAGES[0].env); refreshContinue();
  $('#loading').hidden = true; UI.title.hidden = false;
  window.__game = { G, hero: () => hero, enemies, boss: () => boss, input, startGame, QUALITY, renderer, debugPose, gainExp, STAGES, hurtHero, startAction, comboChain, FINISHERS, pickLight, HERO_ACTIONS, setBoss, PARRY_WIN, flowBucket, applyGrowth, monoFactor, LIGHT_CAP, MONO_FREE, EXT_LIGHT, FINISH_EXT, DODGE_EXT, extendedLight, finisherFor, dodgeCutFor, CUT_VARIANTS, DOUBLE_CUTS, DIRECTIONAL_CUTS, DODGE_CUT, RETREAT_CUTS, SLASH_LESSONS };
}

$('.difficulty-choice').addEventListener('change', refreshContinue);
UI.start.addEventListener('click', () => startGame(0, 1, 0, undefined, selectedDifficulty()));
function startTutorial(pattern = null) {
  selectedSlash = pattern;
  startGame(0, 1, 0, undefined, 'normal', 'tutorial', pattern);
}
$('#btn-tutorial').addEventListener('click', () => startTutorial());
$('#btn-tutorial-retry').addEventListener('click', () => startTutorial(selectedSlash));
$('#btn-tutorial-next').addEventListener('click', () => {
  if (G.state !== 'play' || !tutorial?.awaitingNext) return;
  input.clear(); input.resetButtons(); input.resetStick(); input.keys.clear();
  hero.pendingActions = {};
  setTutorialLesson(tutorial.index + 1);
});
$('#btn-other-slash').addEventListener('click', () => {
  returnToTitle();
  $('#btn-slash-tutorial').click();
});
$('#btn-tutorial-title').addEventListener('click', () => {
  returnToTitle();
  $(selectedSlash ? '#btn-slash-tutorial' : '#btn-tutorial').focus();
});
$('#btn-continue').addEventListener('click', () => {
  const difficulty = selectedDifficulty();
  const sv = loadSave(difficulty);
  if (sv) startGame(sv.stage, sv.level, sv.exp || 0, sv.stats, difficulty);
});
// retry keeps the level reached on this battlefield
$('#btn-retry').addEventListener('click', () => startGame(G.stageIdx, hero.level, hero.exp, hero.stats, G.difficulty, G.mode));
$('#btn-next').addEventListener('click', () => startGame(G.stageIdx + 1, hero.level, hero.exp, hero.stats, G.difficulty));
$('#btn-title').addEventListener('click', returnToTitle);
$('#btn-pause').addEventListener('click', () => setPaused(true));
$('#btn-resume').addEventListener('click', () => setPaused(false));
function returnToTitle() {
  setPaused(false); G.state = 'title'; sfx.stopMusic(); resetGame();
  UI.result.hidden = true; UI.pause.hidden = true; UI.hud.hidden = true; UI.title.hidden = false;
  UI.title.scrollTop = 0;
  refreshContinue();
}
$('#btn-quit').addEventListener('click', returnToTitle);
$('#btn-sound').addEventListener('click', (e) => { sfx.unlock(); sfx.setMuted(!sfx.muted); e.currentTarget.classList.toggle('off', sfx.muted); e.currentTarget.setAttribute('aria-pressed', String(sfx.muted)); });
for (const button of STAT_BUTTONS) button.addEventListener('click', () => chooseStat(button.dataset.stat));
UI.statSelect.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key !== 'Tab') return;
  const available = STAT_BUTTONS.filter(button => !button.disabled);
  const first = available[0], last = available[available.length - 1];
  if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
});
// Resize redraws the frozen battlefield once without advancing it.
window.addEventListener('resize', () => { if (!landscapeTouch.matches && G.state === 'stat-select') renderer.render(scene, camera); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') setPaused(true); });

requestAnimationFrame(frame);
boot();
