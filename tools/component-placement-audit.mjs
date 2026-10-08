export function componentMetadataErrors(asset) {
  const spec = asset.terrainComponents, errors = [];
  if (spec === undefined) return errors;
  if (asset.terrainPlacement) errors.push('terrainComponents cannot be combined with an explicit bridge datum');
  if (!spec || spec.attribute !== '_TERRAIN_COMPONENT' || !Array.isArray(spec.components) || !spec.components.length || spec.components.length > 32)
    return [...errors, 'terrainComponents requires an explicit ownership attribute and 1–32 components'];
  if (!Number.isFinite(spec.maxOffsetM) || spec.maxOffsetM <= 0 || spec.maxOffsetM > 100 ||
      !Number.isFinite(spec.maxFoundationDepthM) || spec.maxFoundationDepthM <= 0 || spec.maxFoundationDepthM > 20)
    errors.push('terrainComponents requires bounded floor offsets and foundation depth');
  const ids = new Set(), values = new Set();
  for (const c of spec.components) {
    if (!c || typeof c.id !== 'string' || !c.id.trim() || ids.has(c.id) || !Number.isInteger(c.value) || c.value < 1 || c.value > 65535 || values.has(c.value)) {
      errors.push('distinct component IDs and positive integer ownership values required'); continue;
    }
    ids.add(c.id); values.add(c.value);
    if (!Array.isArray(c.sampleBlenderM) || c.sampleBlenderM.length !== 2 || !c.sampleBlenderM.every(Number.isFinite)) errors.push(`${c.id}: finite local terrain probe required`);
    else if (asset.boundsBlenderM && c.sampleBlenderM.some((v, i) => v < asset.boundsBlenderM[0][i] || v > asset.boundsBlenderM[1][i])) errors.push(`${c.id}: terrain probe lies outside the model`);
  }
  return errors;
}

/** Every exported triangle keeps one house identity, even at touching walls. */
export function componentOwnershipAudit(raw, spec) {
  if (!spec) return {errors: [], components: []};
  const size = raw.readUInt32LE(12), doc = JSON.parse(raw.subarray(20,20+size)), binary = raw.subarray(28+size);
  const errors = [], counts = new Map(spec.components.map(c => [c.value, {id:c.id, value:c.value, vertices:0, triangles:0}]));
  function scalar(index) {
    const a = doc.accessors[index], view = doc.bufferViews[a.bufferView];
    if (a.type !== 'SCALAR' || a.sparse || a.normalized) throw Error('ownership/index accessor must be an ordinary scalar');
    const methods = {5121:['readUInt8',1],5123:['readUInt16LE',2],5125:['readUInt32LE',4],5126:['readFloatLE',4]};
    const [read, bytes] = methods[a.componentType] ?? [];
    if (!read) throw Error('unsupported scalar component type');
    const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = view.byteStride ?? bytes;
    return Array.from({length:a.count},(_,i)=>binary[read](offset+i*stride));
  }
  for (const mesh of doc.meshes ?? []) for (const p of mesh.primitives) {
    const attribute = p.attributes[spec.attribute];
    if (attribute === undefined) {errors.push('every primitive must export terrain component ownership'); continue;}
    try {
      const owners = scalar(attribute);
      if (owners.length !== doc.accessors[p.attributes.POSITION].count) errors.push('ownership count differs from position count');
      for (const value of owners) {
        const c = counts.get(value); if (!c) errors.push('unknown ownership value'); else c.vertices++;
      }
      const indices = p.indices === undefined ? owners.map((_,i)=>i) : scalar(p.indices);
      for (let i=0;i<indices.length;i+=3) {
        const values = indices.slice(i,i+3).map(j=>owners[j]);
        if (values.length !== 3 || new Set(values).size !== 1) errors.push('triangle crosses terrain components');
        else if (counts.has(values[0])) counts.get(values[0]).triangles++;
      }
    } catch (error) {errors.push(error.message);}
  }
  for (const c of counts.values()) if (!c.vertices || !c.triangles) errors.push(`${c.id}: no exported component geometry`);
  return {errors:[...new Set(errors)],components:[...counts.values()]};
}
