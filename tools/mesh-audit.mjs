export function meshAudit(raw) {
  const size=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+size));
  const binary=raw.subarray(28+size);
  const read=(id)=>{
    const a=doc.accessors[id],v=doc.bufferViews[a.bufferView];
    const n={SCALAR:1,VEC3:3}[a.type],bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType];
    const method={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
    return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>binary[method]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*bytes)+j*bytes)));
  };
  const result=[];
  for (const mesh of doc.meshes) for (const prim of mesh.primitives) {
    const p=read(prim.attributes.POSITION),normals=prim.attributes.NORMAL===undefined?null:read(prim.attributes.NORMAL);
    const idx=prim.indices===undefined?p.map((_,i)=>i):read(prim.indices).flat();
    const edges=new Map(),faces=new Set();let degenerate=0,duplicate=0,opposedNormals=0;
    const key=v=>v.map(x=>Math.round(x*10000)).join(','); // weld only 0.1 mm export noise
    for(let i=0;i<idx.length;i+=3) {
      const ids=idx.slice(i,i+3),[a,b,c]=ids.map(j=>p[j]);
      const u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]);
      const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const area=Math.hypot(...cross)/2;
      if(area<1e-10)degenerate++;
      if(normals && area>=1e-10) {
        const avg=[0,1,2].map(j=>ids.reduce((s,id)=>s+normals[id][j],0)/3);
        if(cross.reduce((s,x,j)=>s+x*avg[j],0)<-area*.001)opposedNormals++;
      }
      const keys=[a,b,c].map(key),face=[...keys].sort().join('|');
      if(faces.has(face))duplicate++;faces.add(face);
      for(let j=0;j<3;j++) {const e=[keys[j],keys[(j+1)%3]].sort().join('|');edges.set(e,(edges.get(e)||0)+1);}
    }
    result.push({material:doc.materials[prim.material]?.name,triangles:idx.length/3,degenerate,duplicate,opposedNormals,
      boundaryEdges:[...edges.values()].filter(n=>n===1).length,nonManifoldEdges:[...edges.values()].filter(n=>n>2).length});
  }
  return result;
}
