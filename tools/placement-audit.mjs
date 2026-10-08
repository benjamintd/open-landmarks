const vector = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
const box = b => Array.isArray(b) && b.length === 2 && b.every(v => vector(v, 3)) && b[0].every((v, i) => v <= b[1][i]);
const inside = (p, b, tolerance = .001) => p.every((v, i) => v >= b[0][i] - tolerance && v <= b[1][i] + tolerance);

/** Optional bridge contracts are explicit: ordinary ground placement is unchanged. */
export function placementMetadataErrors(asset) {
  const errors = [], replacement = asset.bridgeReplacement, placement = asset.terrainPlacement;
  if (replacement !== undefined) {
    if (!replacement || typeof replacement !== 'object') return ['invalid bridgeReplacement'];
    if (typeof replacement.sourceLayer !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(replacement.sourceLayer)) errors.push('bridgeReplacement requires a sourceLayer');
    if (!Array.isArray(replacement.names) || !replacement.names.length || replacement.names.length > 8 ||
      replacement.names.some(n => typeof n !== 'string' || !n.trim() || n.length > 100) || new Set(replacement.names).size !== replacement.names.length)
      errors.push('bridgeReplacement requires distinct exact feature names');
    if (replacement.includeUntaggedNamedSegments !== undefined && typeof replacement.includeUntaggedNamedSegments !== 'boolean') errors.push('invalid includeUntaggedNamedSegments');
    if (!Number.isFinite(replacement.coverage) || replacement.coverage < .95 || replacement.coverage > 1) errors.push('bridgeReplacement coverage must be between .95 and 1');
    if (!placement) errors.push('bridgeReplacement requires explicit terrainPlacement');
  }
  if (placement === undefined) return errors;
  if (!placement || typeof placement !== 'object') return [...errors, 'invalid terrainPlacement'];
  if (placement.datum !== 'sea-level' || !Number.isFinite(placement.elevationM)) errors.push('terrainPlacement requires a finite sea-level datum');
  if (!Array.isArray(placement.contacts) || !placement.contacts.length || placement.contacts.length > 32) return [...errors, 'terrainPlacement requires 1–32 contact zones'];
  const ids = new Set();
  for (const c of placement.contacts) {
    if (!c || typeof c !== 'object') { errors.push('invalid terrain contact'); continue; }
    const label = c.id || 'unnamed contact';
    if (typeof c.id !== 'string' || !c.id.trim() || ids.has(c.id)) errors.push(`${label}: distinct contact ID required`);
    ids.add(c.id);
    if (!['transition', 'skirt'].includes(c.mode)) errors.push(`${label}: unknown contact mode`);
    if (!box(c.boundsBlenderM)) { errors.push(`${label}: invalid contact bounds`); continue; }
    if (!Number.isFinite(c.referenceElevationM) || c.referenceElevationM < c.boundsBlenderM[0][2] - .1 || c.referenceElevationM > c.boundsBlenderM[1][2] + .1) errors.push(`${label}: reference elevation must lie in its declared zone`);
    if (!Number.isFinite(c.maxDeltaM) || c.maxDeltaM <= 0 || c.maxDeltaM > 500) errors.push(`${label}: bounded positive maxDeltaM required`);
    if (c.mode === 'transition') {
      const axis = c.axis === 'x' ? 0 : c.axis === 'y' ? 1 : -1;
      if (axis < 0 || !Number.isFinite(c.innerM) || !Number.isFinite(c.outerM) || c.innerM === c.outerM ||
        Math.min(c.innerM, c.outerM) < c.boundsBlenderM[0][axis] - .1 || Math.max(c.innerM, c.outerM) > c.boundsBlenderM[1][axis] + .1)
        errors.push(`${label}: transition must have distinct inner/outer stations inside its axis bounds`);
      if (!vector(c.sampleBlenderM, 2) || !inside(c.sampleBlenderM, c.boundsBlenderM)) errors.push(`${label}: terminal terrain probe must lie within the contact zone`);
    }
  }
  return errors;
}

/** Inspect exported geometry, not the recipe: each declared zone must exist in both LODs. */
export function terrainContactAudit(triangles, placement) {
  if (!placement) return [];
  return placement.contacts.map(contact => {
    const vertices = new Set();
    for (const triangle of triangles) for (const [east, up, south] of triangle.points) {
      const point = [east, -south, up];
      if (inside(point, contact.boundsBlenderM)) vertices.add(point.join(','));
    }
    return { id: contact.id, vertices: vertices.size };
  });
}
