import test from 'node:test';
import assert from 'node:assert/strict';
import { placementMetadataErrors, terrainContactAudit } from '../tools/placement-audit.mjs';

const bridge = () => ({
  bridgeReplacement: { sourceLayer: 'roads', names: ['Golden Gate Bridge', 'Golden Gate Bridge East Sidewalk'], includeUntaggedNamedSegments: true, coverage: .95 },
  terrainPlacement: { datum: 'sea-level', elevationM: 0, contacts: [
    { id: 'south', mode: 'transition', boundsBlenderM: [[-20, -150, 50], [20, -100, 70]], referenceElevationM: 60, maxDeltaM: 3,
      sampleBlenderM: [0, -150], axis: 'y', innerM: -100, outerM: -150 },
    { id: 'north', mode: 'transition', boundsBlenderM: [[-20, 100, 50], [20, 150, 70]], referenceElevationM: 60, maxDeltaM: 3,
      sampleBlenderM: [0, 150], axis: 'y', innerM: 100, outerM: 150 },
  ] },
});

test('ordinary landmarks retain their existing ground-placement contract', () => {
  assert.deepEqual(placementMetadataErrors({}), []);
  assert.deepEqual(terrainContactAudit([], undefined), []);
});
test('bridge contract accepts opposite shore directions and explicit local support skirts', () => {
  const a = bridge();
  a.terrainPlacement.contacts.push({ id: 'pier', mode: 'skirt', boundsBlenderM: [[-10, -10, 0], [10, 10, .05]], referenceElevationM: 0, maxDeltaM: 120 });
  assert.deepEqual(placementMetadataErrors(a), []);
});
test('bridge replacement rejects broad unnamed masks and missing vertical placement', () => {
  for (const mutate of [a => a.bridgeReplacement.names = [], a => a.bridgeReplacement.names.push(a.bridgeReplacement.names[0]),
    a => a.bridgeReplacement.coverage = .5, a => delete a.terrainPlacement]) {
    const a = bridge(); mutate(a); assert(placementMetadataErrors(a).length);
  }
});
test('shore metadata rejects unbounded movement, invalid probes and zero-length transitions', () => {
  for (const mutate of [c => c.maxDeltaM = Infinity, c => c.maxDeltaM = -1, c => c.outerM = c.innerM,
    c => c.sampleBlenderM = [0, 1000], c => c.referenceElevationM = 80, c => c.boundsBlenderM[0][0] = 100]) {
    const a = bridge(); mutate(a.terrainPlacement.contacts[0]); assert(placementMetadataErrors(a).length);
  }
  const a = bridge(); a.terrainPlacement.contacts[1].id = 'south';
  assert.match(placementMetadataErrors(a).join(' '), /distinct contact ID/);
});
test('contact audit converts glTF axes and detects an approach erased by a lightweight LOD', () => {
  const a = bridge(), triangles = [{ points: [[-1, 60, 125], [1, 60, 125], [0, 60, 126]] }];
  assert.deepEqual(terrainContactAudit(triangles, a.terrainPlacement), [{ id: 'south', vertices: 3 }, { id: 'north', vertices: 0 }]);
});
