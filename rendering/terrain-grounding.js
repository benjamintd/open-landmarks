import {Matrix4, Vector3} from 'three';

const CIRCUMFERENCE = 40075016.68557849;
const CONTACT_TOLERANCE = 0.05;
const BURIAL_M = 0.25;

/** Extend ground-contact vertices into the terrain, like extrusion basements.
 * A landmark's upper structure stays rigid at its anchor elevation. Only its
 * existing ground-level wall ends move: no extra meshes, materials or draw calls.
 * Keep original positions so terrain changes and cache reuse never accumulate
 * offsets. Coordinates are glTF metres: X east, Y up, Z south.
 */
export function createTerrainGrounding(group, anchor) {
  group.updateMatrixWorld(true);
  const rootInverse = new Matrix4().copy(group.matrixWorld).invert();
  const meshes = [];
  group.traverse(mesh => { if (mesh.isMesh && !mesh.isInstancedMesh &&
    mesh.geometry?.attributes.position && mesh.material?.name !== 'entrance-glow') meshes.push(mesh); });
  const counts = new Map();
  for (const mesh of meshes) counts.set(mesh.geometry, (counts.get(mesh.geometry) || 0) + 1);
  const scale = 1 / (CIRCUMFERENCE * Math.cos(anchor[1] * Math.PI / 180));
  const originY = (1 - Math.log(Math.tan(Math.PI / 4 + anchor[1] * Math.PI / 360)) / Math.PI) / 2;
  const samples = new Map(), entries = [], replaced = new Set();
  for (const mesh of meshes) {
    const transform = new Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    const inverse = transform.clone().invert(), position = mesh.geometry.attributes.position;
    const contacts = [];
    for (let i = 0; i < position.count; i++) {
      const original = new Vector3().fromBufferAttribute(position, i);
      const world = original.clone().applyMatrix4(transform);
      if (world.y > CONTACT_TOLERANCE) continue;
      const key = `${world.x.toFixed(4)},${world.z.toFixed(4)}`;
      if (!samples.has(key)) samples.set(key, {coordinates: [
        anchor[0] + world.x * scale * 360,
        Math.atan(Math.sinh(Math.PI * (1 - 2 * (originY + world.z * scale)))) * 180 / Math.PI,
      ]});
      contacts.push({i, original, world, sample: samples.get(key)});
    }
    if (!contacts.length) continue;
    // glTF may instance a geometry at different node transforms. Its foundations
    // then need independent positions, while other nodes retain their geometry.
    if (counts.get(mesh.geometry) > 1) {
      replaced.add(mesh.geometry);
      mesh.geometry = mesh.geometry.clone();
    }
    entries.push({geometry: mesh.geometry, inverse, contacts});
  }
  for (const geometry of replaced) if (!meshes.some(m => m.geometry === geometry)) geometry.dispose();
  const point = new Vector3();
  let minimumY = 0;
  return {
    sampleCount: samples.size,
    get minimumY() { return minimumY; },
    update(map, anchorElevation) {
      minimumY = 0;
      const terrain = !!map.getTerrain();
      for (const sample of samples.values()) {
        const elevation = terrain ? map.queryTerrainElevation(sample.coordinates) : null;
        sample.elevation = Number.isFinite(elevation) ? elevation : null;
      }
      for (const {geometry, inverse, contacts} of entries) {
        const position = geometry.attributes.position;
        let changed = false;
        for (const {i, original, world, sample} of contacts) {
          point.copy(original);
          if (terrain && sample.elevation !== null) {
            point.copy(world);
            point.y = Math.min(world.y, sample.elevation - anchorElevation - BURIAL_M);
            minimumY = Math.min(minimumY, point.y);
            point.applyMatrix4(inverse);
          }
          // Compare after float32 rounding to avoid uploading unchanged buffers.
          const x = Math.fround(point.x), y = Math.fround(point.y), z = Math.fround(point.z);
          if (position.getX(i) === x && position.getY(i) === y && position.getZ(i) === z) continue;
          position.setXYZ(i, x, y, z); changed = true;
        }
        if (changed) {
          position.needsUpdate = true;
          geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        }
      }
    },
  };
}
