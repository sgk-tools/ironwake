// Optional extra weapons for the title-screen selector. The standard greatsword is always available.
// Each entry: { id, label, make: () => THREE.Object3D (blade along +Y from the grip point, mounted like
// the standard sword), blade: { hilt, trail, tip } as THREE.Vector3 in that local space }.
// The repository ships with no extras; a local build can register its own weapons here.
export const EXTRA_WEAPONS = [];
