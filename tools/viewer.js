import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
const q = new URLSearchParams(location.search);
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(innerWidth, innerHeight);
r.toneMapping = THREE.ACESFilmicToneMapping; document.body.appendChild(r.domElement);
const s = new THREE.Scene(); s.background = new THREE.Color(0x30302f);
s.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
const d = new THREE.DirectionalLight(0xffeedd, 2.5); d.position.set(2, 4, 3); s.add(d);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);
new GLTFLoader().load('../assets/' + q.get('f') + '.glb', async g => {
  let root = g.scene; let x = 0;
  if (q.get('rig')) {
    const sk = await (await fetch('../assets/skeleton.json')).json();
    const parts = {}; g.scene.children.forEach(c => parts[c.name] = c);
    const nodes = {}; root = new THREE.Group();
    for (const [n, [par, off]] of Object.entries(sk)) {
      const base = n.replace(/[RL]$/, ''); if (!parts[base]) continue;
      const j = new THREE.Group(); j.position.fromArray(off); nodes[n] = j;
      const m = parts[base].clone(); m.position.set(0,0,0); j.add(m);
    }
    for (const [n, [par]] of Object.entries(sk)) if (nodes[n]) (par ? nodes[par] : root).add(nodes[n]);
    nodes.uarmR.rotation.z = -0.15; nodes.uarmL.rotation.z = 0.15;
  } else root.children.slice().forEach(c => { c.position.set(x, 0, 0); x += +(q.get('sp') || 0.8); });
  s.add(root);
  const b = new THREE.Box3().setFromObject(root), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3()).length();
  const ry = +(q.get('ry') || 0.5);
  cam.position.set(c.x + Math.sin(ry) * sz * 1.4, c.y + sz * 0.15, c.z + Math.cos(ry) * sz * 1.4); cam.lookAt(c);
  r.render(s, cam); document.title = 'ready';
});
