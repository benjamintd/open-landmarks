import { materialLibrary } from './material-audit.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const signedArea=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2;
// Subtract a convex triangle by partitioning at each edge. This tests the whole
// panel area, including holes that corner/centre ray samples would miss.
function subtractTriangle(polygon,triangle) {
  if(signedArea(triangle)<0)triangle=[...triangle].reverse();
  let inside=polygon;const outside=[];
  for(let i=0;i<3 && inside.length;i++) {
    const a=triangle[i],b=triangle[(i+1)%3];
    const side=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
    const yes=[],no=[];
    for(let j=0;j<inside.length;j++) {
      const p=inside[j],q=inside[(j+1)%inside.length],sp=side(p),sq=side(q);
      (sp>=0?yes:no).push(p);
      if((sp>=0)!==(sq>=0)) {
        const t=sp/(sp-sq),hit=p.map((v,k)=>v+t*(q[k]-v));yes.push(hit);no.push(hit);
      }
    }
    if(no.length>=3 && Math.abs(signedArea(no))>1e-10)outside.push(no);
    inside=yes;
  }
  return outside;
}
export function windowSupportAudit(triangles, tolerance=materialLibrary.wallSupportToleranceM) {
  const support=new Set(['stone','trim','roof','metal','recess','copper','patina']);
  const walls=triangles.filter(t=>support.has(t.material)).map(t=>{
    const n=cross(sub(t.points[1],t.points[0]),sub(t.points[2],t.points[0]));const len=Math.hypot(...n);
    return {...t,n:n.map(v=>v/len)};
  }).filter(t=>Math.abs(t.n[1])<.01);
  const failures=[];let checked=0;
  for(const [index,t] of triangles.entries()) {
    if(t.material!=='window')continue;
    checked++;
    let n=cross(sub(t.points[1],t.points[0]),sub(t.points[2],t.points[0]));const length=Math.hypot(...n);n=n.map(v=>v/length);
    if(!length || Math.abs(n[1])>.01) {failures.push({triangle:index,reason:'Window must be a vertical wall panel; use glass for structural glazing'});continue;}
    const tangent=[n[2],0,-n[0]],origin=t.points[0];
    const project=p=>[dot(sub(p,origin),tangent),p[1]-origin[1]];
    let remaining=[t.points.map(project)];const area=Math.abs(signedArea(remaining[0]));
    for(const wall of walls) {
      if(Math.abs(dot(n,wall.n))<.9999 || t.points.some(p=>Math.abs(dot(sub(p,wall.points[0]),wall.n))>tolerance))continue;
      remaining=remaining.flatMap(p=>subtractTriangle(p,wall.points.map(project)));
      if(!remaining.length)break;
    }
    const uncovered=remaining.reduce((s,p)=>s+Math.abs(signedArea(p)),0);
    if(uncovered>Math.max(1e-5,area*1e-5))failures.push({triangle:index,unsupportedAreaM2:uncovered});
  }
  return {checked,unsupported:failures.length,failures};
}
export function glbTriangles(raw) {
  const size=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+size)),binary=raw.subarray(28+size);
  if(doc.nodes?.some(n=>n.matrix||n.rotation||n.translation||n.scale||n.children?.length))throw Error('Window audit requires baked transforms and flat nodes');
  const read=id=>{
    const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=a.type==='VEC3'?3:1;
    const bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType],method={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
    return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>binary[method]((v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??n*bytes)+j*bytes)));
  };
  const result=[];
  const nodes=doc.scenes?.[doc.scene??0]?.nodes??[];
  for(const node of nodes) {
    const mesh=doc.meshes?.[doc.nodes[node]?.mesh];
    if(!mesh)continue;
    for(const p of mesh.primitives) {
    const positions=read(p.attributes.POSITION),indices=p.indices===undefined?positions.map((_,i)=>i):read(p.indices).flat();
    for(let i=0;i<indices.length;i+=3)result.push({material:doc.materials[p.material]?.name,points:indices.slice(i,i+3).map(j=>positions[j])});
  }
  }
  return result;
}
