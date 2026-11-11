// Built-in weapon types and the "corruption" growth applied to the chosen weapon as stages are cleared.
// Every weapon follows the convention of sword.glb: grip at the origin, length along +Y, width along X,
// thickness along Z, so it mounts in the hand and animates exactly like the standard greatsword.
// All heads are symmetric about the Y axis (double-edged / blunt): the cuts lead with either edge.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// dark, worn steel: the bright sky reflection would otherwise wash a clean metal out to a flat pale pink
const steel = () => new THREE.MeshStandardMaterial({ color: 0x55585f, metalness: 0.88, roughness: 0.52, envMapIntensity: 0.75 });
const darkIron = () => new THREE.MeshStandardMaterial({ color: 0x2a2b30, metalness: 0.8, roughness: 0.62, envMapIntensity: 0.6 });
const leather = () => new THREE.MeshStandardMaterial({ color: 0x3a2618, metalness: 0.05, roughness: 0.85 });
const wood = () => new THREE.MeshStandardMaterial({ color: 0x2c2019, metalness: 0.1, roughness: 0.8 });

// flat plate from an outline in the XY plane, thin in Z with a wide bevel so the rim reads as a ground edge
function plate(points, depth = 0.02, bevel = 0.045) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.022, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}
const cyl = (r0, r1, y0, y1, seg = 12) => { const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg); g.translate(0, (y0 + y1) / 2, 0); return g; };
function part(group, geo, mat, name) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; if (name) m.name = name; group.add(m); return m;
}
function grip(group, y0, y1, r = 0.034) {
  part(group, cyl(r, r, y0, y1), leather());
  // cord wrap rings
  for (let y = y0 + 0.05; y < y1 - 0.02; y += 0.07) part(group, cyl(r + 0.006, r + 0.006, y, y + 0.022, 10), wood());
  part(group, new THREE.SphereGeometry(r * 1.7, 12, 8).translate(0, y0 - 0.02, 0), darkIron());
}

// crescent axe bit on the +X side (mirrored for the other side); c = centre height
function axeBit(c, reach, half) {
  const pts = [[0.03, c - 0.16], [0.16, c - 0.2]];
  for (let i = 0; i <= 10; i++) { const a = -1.15 + (2.3 * i) / 10; pts.push([reach * (0.62 + 0.38 * Math.cos(a)), c + half * Math.sin(a) / Math.sin(1.15)]); }
  pts.push([0.16, c + 0.2], [0.03, c + 0.16]);
  return pts;
}
const mirrorPts = (pts) => pts.map(([x, y]) => [-x, y]).reverse();

function makeAxe() {
  const g = new THREE.Group();
  part(g, cyl(0.036, 0.03, -0.5, 2.12, 10), wood());
  grip(g, -0.5, 0.42);
  for (const y of [0.55, 1.15]) part(g, cyl(0.045, 0.045, y, y + 0.05, 10), darkIron());
  const bit = axeBit(1.72, 0.62, 0.52);
  const head = part(g, plate(bit, 0.03, 0.06), steel(), 'blade');
  part(g, plate(mirrorPts(bit), 0.03, 0.06), head.material);
  part(g, cyl(0.07, 0.07, 1.5, 1.94, 8), darkIron());                 // socket
  part(g, cyl(0.05, 0.0, 2.1, 2.42, 8), steel());                      // top spike
  return g;
}
function makeLongsword() {
  const g = new THREE.Group();
  grip(g, -0.6, 0.4);
  part(g, new THREE.BoxGeometry(0.62, 0.07, 0.09).translate(0, 0.44, 0), darkIron());      // guard
  for (const s of [-1, 1]) part(g, cyl(0.03, 0.0, 0, 0.14, 6).rotateZ(-s * Math.PI / 2).translate(s * 0.31, 0.44, 0), darkIron());
  part(g, plate([[-0.115, 0.48], [-0.125, 2.2], [-0.07, 2.5], [0, 2.68], [0.07, 2.5], [0.125, 2.2], [0.115, 0.48]], 0.018, 0.05), steel(), 'blade');
  part(g, new THREE.BoxGeometry(0.035, 1.6, 0.05).translate(0, 1.3, 0), darkIron());       // raised spine
  return g;
}
function makeMaul() {
  const g = new THREE.Group();
  part(g, cyl(0.04, 0.034, -0.5, 1.75, 10), wood());
  grip(g, -0.5, 0.45);
  for (const y of [0.6, 1.2]) part(g, cyl(0.05, 0.05, y, y + 0.05, 10), darkIron());
  const head = part(g, new THREE.BoxGeometry(0.72, 0.4, 0.4).translate(0, 1.92, 0), darkIron(), 'blade');
  for (const s of [-1, 1]) {
    part(g, new THREE.BoxGeometry(0.06, 0.46, 0.46).translate(s * 0.33, 1.92, 0), steel());   // striking faces
    for (const [dy, dz] of [[-0.11, -0.11], [-0.11, 0.11], [0.11, -0.11], [0.11, 0.11], [0, 0]]) part(g, cyl(0.045, 0.0, 0, 0.13, 6).rotateZ(-s * Math.PI / 2).translate(s * 0.36, 1.92 + dy, dz), steel());
  }
  part(g, cyl(0.06, 0.0, 2.12, 2.36, 8), steel());
  head.material.roughness = 0.6;
  return g;
}
function makeHalberd() {
  const g = new THREE.Group();
  part(g, cyl(0.032, 0.028, -0.6, 1.95, 10), wood());
  grip(g, -0.6, 0.4);
  part(g, cyl(0.042, 0.042, 1.5, 1.98, 8), darkIron());
  part(g, plate([[-0.07, 1.9], [-0.09, 2.3], [0, 2.82], [0.09, 2.3], [0.07, 1.9]], 0.02, 0.04), steel(), 'blade');   // spear point
  const wing = [[0.03, 1.72], [0.36, 1.6], [0.5, 1.78], [0.44, 2.02], [0.3, 1.9], [0.03, 1.96]];                     // side blades
  part(g, plate(wing, 0.02, 0.04), steel()); part(g, plate(mirrorPts(wing), 0.02, 0.04), steel());
  return g;
}

// blade = segment used for hit detection and the trail (local Y); deco = where corruption spikes grow;
// glb = baked Blender model (assets/<glb>.glb, mesh of the same name) used instead of make() when present
export const BUILTIN_WEAPONS = [
  { id: 'axe', label: '両刃の大斧', glb: 'axe', make: makeAxe, blade: { hilt: V(0, 0.7, 0), trail: V(0, 1.3, 0), tip: V(0, 2.3, 0) }, deco: { x: 0.05, y0: 0.6, y1: 1.4 } },
  { id: 'longsword', label: '細身の長大剣', make: makeLongsword, blade: { hilt: V(0, 0.48, 0), trail: V(0, 1.4, 0), tip: V(0, 2.65, 0) }, deco: { x: 0.13, y0: 0.7, y1: 2.2 } },
  { id: 'maul', label: '棘の鉄槌', make: makeMaul, blade: { hilt: V(0, 0.8, 0), trail: V(0, 1.4, 0), tip: V(0, 2.25, 0) }, deco: { x: 0.05, y0: 0.6, y1: 1.6 } },
  { id: 'halberd', label: '十文字戟', make: makeHalberd, blade: { hilt: V(0, 0.8, 0), trail: V(0, 1.6, 0), tip: V(0, 2.8, 0) }, deco: { x: 0.045, y0: 0.5, y1: 1.4 } },
];
export const STANDARD_DECO = { x: 0.2, y0: 0.7, y1: 1.9 };

// ---------------------------------------------------------------------------------------------------
// Corruption: each cleared stage (tier 0-4) makes the weapon larger, darker and more sinister:
// tier 1 a faint red glow, tier 2 barbs along the blade, tier 3 a pulsing core by the guard and a
// blood-red halo, tier 4 more barbs, a stronger halo and embers (the embers are emitted by the game).
export const GROW_MAX = 4;
export const growScale = (tier) => ({ x: 1 + 0.06 * tier, y: 1 + 0.075 * tier, z: 1 + 0.12 * tier });

function eachMesh(root, fn) { root.traverse(o => { if (o.isMesh && !o.userData.corruption) fn(o); }); }

// entry: { mesh, blade, deco? }. Safe to call repeatedly with any tier.
export function applyGrowth(entry, tier) {
  tier = Math.max(0, Math.min(GROW_MAX, tier | 0));
  const root = entry.mesh;
  const s = growScale(tier);
  root.scale.set(s.x, s.y, s.z);
  // own materials (never touch the shared source material), darkened and glowing with the tier
  eachMesh(root, (m) => {
    if (!m.userData.baseMat) { m.userData.baseMat = m.material; m.material = m.material.clone(); m.userData.baseColor = m.material.color.clone(); }
    const mat = m.material;
    mat.color.copy(m.userData.baseColor).multiplyScalar(1 - 0.1 * tier);
    if (mat.emissive) { mat.emissive.setRGB(0.5, 0.03, 0.02); mat.emissiveIntensity = 0.007 * tier; }   // the scene is exposed brightly: keep this faint
  });
  // rebuild the decorations for this tier
  if (entry.corruption) { root.remove(entry.corruption); entry.corruption.traverse(o => { if (o.isMesh) { if (!o.userData.sharedGeo) o.geometry.dispose(); o.material.dispose(); } }); }
  const c = new THREE.Group(); c.userData.corruption = true; entry.corruption = c; entry.tier = tier; entry.core = null; entry.halo = null;
  const deco = entry.deco || { x: 0.2, y0: entry.blade.hilt.y + 0.25, y1: entry.blade.tip.y - 0.2 };
  const mark = (m) => { m.userData.corruption = true; m.castShadow = false; return m; };
  if (tier >= 2) {
    // barbs: hooked thorns growing out of both edges, more of them (and longer) at higher tiers
    const n = tier === 2 ? 3 : tier === 3 ? 5 : 7;
    const barbMat = new THREE.MeshStandardMaterial({ color: 0x1c1416, metalness: 0.7, roughness: 0.5, emissive: 0x700808, emissiveIntensity: 0.08 * (tier - 1) });
    for (let i = 0; i < n; i++) {
      const y = deco.y0 + (deco.y1 - deco.y0) * (i + 0.5) / n, len = 0.1 + 0.03 * tier + 0.03 * ((i * 7) % 3);
      for (const sd of [-1, 1]) {
        const g = new THREE.ConeGeometry(0.03 + 0.004 * tier, len, 5); g.translate(0, len / 2, 0);
        const m = mark(new THREE.Mesh(g, barbMat));
        m.position.set(sd * deco.x, y, 0); m.rotation.z = -sd * (0.95 + 0.12 * (i % 2));   // swept toward the tip
        c.add(m);
      }
    }
  }
  if (tier >= 3) {
    // pulsing core set into the weapon just above the grip
    const core = mark(new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshStandardMaterial({ color: 0x200404, emissive: 0xff2010, emissiveIntensity: 0.6, roughness: 0.3 })));
    core.position.set(0, deco.y0 - 0.12, 0); core.scale.set(1, 1.5, 1.2); c.add(core); entry.core = core;
    // halo: an additive red shell around the blade part
    let blade = null; eachMesh(root, (m) => { if (!blade && (m.name === 'blade' || root.isMesh)) blade = m; });
    if (blade) {
      // additive shell, cut off below the blade so the grip does not glow
      const halo = mark(new THREE.Mesh(blade.geometry, new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 0.05 + 0.03 * (tier - 3) }, uY0: { value: deco.y0 - 0.1 } },
        vertexShader: 'varying float vY; void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uOpacity; uniform float uY0; varying float vY; void main() { if (vY < uY0) discard; gl_FragColor = vec4(vec3(1.0, 0.14, 0.03) * uOpacity * smoothstep(uY0, uY0 + 0.25, vY), 1.0); }',
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      // thin blades get a fat shell; a thick head (the maul) only a slight one
      blade.geometry.computeBoundingBox(); const bb = blade.geometry.boundingBox, thick = bb.max.z - bb.min.z;
      halo.userData.sharedGeo = true; halo.scale.set(1.12, 1.01, thick > 0.2 ? 1.15 : 3.2);
      c.add(halo); entry.halo = halo;
    }
  }
  root.add(c);
  return tier;
}
// per-frame flicker of the core and halo
export function pulseWeapon(entry, time) {
  if (!entry || !entry.tier) return;
  const p = 0.5 + 0.5 * Math.sin(time * 5.2);
  if (entry.core) entry.core.material.emissiveIntensity = 0.35 + 0.5 * p;
  if (entry.halo) entry.halo.material.uniforms.uOpacity.value = (0.05 + 0.03 * (entry.tier - 3)) * (0.7 + 0.6 * p);
}
export const GROW_TEXT = [null, '武器が血を吸い、微かに赤く脈打ち始めた', '武器から棘が生え、ひと回り大きくなった', '赤い核が宿り、刃が瘴気を帯びた', '鉄塊は禍々しい魔の武器と化した'];
