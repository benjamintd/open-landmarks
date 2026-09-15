import test from 'node:test';
import assert from 'node:assert/strict';
import {Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3} from 'three';
import {createTerrainGrounding} from '../rendering/terrain-grounding.js';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const anchor = [2.33585, 48.86102];
const box = () => new BoxGeometry(20, 30, 20).translate(0, 15, 0);
function fixture() {
  const group = new Group(), mesh = new Mesh(box(), new MeshStandardMaterial({name:'stone'}));
  group.add(mesh);
  return {group, mesh};
}

test('a Louvre-sized height gap is filled only at ground contacts; roof and topology stay fixed', () => {
  const {group, mesh} = fixture(), p = mesh.geometry.attributes.position;
  const original = p.array.slice(), index = mesh.geometry.index.array.slice();
  const grounding = createTerrainGrounding(group, anchor);
  const coordinates = [];
  const map = {getTerrain:()=>({}), queryTerrainElevation:point=>{coordinates.push(point);return point[0]<anchor[0]?30.9:40;}};
  grounding.update(map, 46.7);
  assert.equal(grounding.sampleCount, 4, 'Shared wall corners are sampled once');
  assert.equal(coordinates.length, 4);
  for(let i=0;i<p.count;i++) {
    assert.equal(p.getX(i), original[3*i]); assert.equal(p.getZ(i), original[3*i+2]);
    if(original[3*i+1]>0) assert.equal(p.getY(i), original[3*i+1]);
    else assert(Math.abs(p.getY(i) - (p.getX(i)<0?-16.05:-6.95)) < 1e-5);
  }
  assert.deepEqual(mesh.geometry.index.array,index);
  assert.equal(group.children.length,1,'No extra draw calls');
  assert(mesh.geometry.boundingBox.min.y < -16, 'Bounds include the foundation');
  assert(Math.abs(grounding.minimumY+16.05)<1e-5,'Visibility bounds include the foundation');
  const version=p.version;
  grounding.update(map,46.7);assert.equal(p.version,version,'Stable terrain does not upload again');
  grounding.update({getTerrain:()=>null},0);assert.deepEqual(p.array,original,'Disabling terrain restores the authored mesh');
  assert.equal(grounding.minimumY,0);
});

test('terrain changes do not accumulate offsets, raise contacts, or propagate missing samples', () => {
  const {group,mesh}=fixture(), original=mesh.geometry.attributes.position.array.slice();
  const grounding=createTerrainGrounding(group,anchor);
  let elevation=10;
  const map={getTerrain:()=>({}),queryTerrainElevation:()=>elevation};
  grounding.update(map,30);
  elevation=20;grounding.update(map,30);
  assert(Math.abs(mesh.geometry.boundingBox.min.y+10.25)<1e-6);
  for(const value of [50,null,NaN,Infinity]) {
    elevation=value;grounding.update(map,30);
    assert.deepEqual(mesh.geometry.attributes.position.array,original);
  }
});

test('node transforms and shared glTF geometry get independent ground contacts', () => {
  const group=new Group(), geometry=box(), material=new MeshStandardMaterial({name:'stone'});
  const west=new Mesh(geometry,material), east=new Mesh(geometry,material);
  west.position.x=-100; east.position.x=100; west.rotation.y=.3; east.scale.set(2,2,2);
  group.add(west,east);
  const grounding=createTerrainGrounding(group,anchor);
  grounding.update({getTerrain:()=>({}),queryTerrainElevation:p=>p[0]<anchor[0]?20:25},30);
  assert.notEqual(west.geometry,east.geometry);
  group.updateMatrixWorld(true);
  for(const [mesh,expected] of [[west,-10.25],[east,-5.25]]) {
    const p=mesh.geometry.attributes.position;
    const min=Math.min(...Array.from({length:p.count},(_,i)=>new Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).y));
    assert(Math.abs(min-expected)<1e-5);
  }
  grounding.update({getTerrain:()=>null},0);
  assert.deepEqual(west.geometry.attributes.position.array,box().attributes.position.array);
  assert.deepEqual(east.geometry.attributes.position.array,box().attributes.position.array);
});

test('the actual Louvre model reaches lower terrain without altering upper geometry', async () => {
  const bytes=await readFile(new URL('../collection/louvre/detail.glb',import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  const before=[];
  scene.traverse(mesh=>{if(mesh.isMesh) before.push({mesh,positions:mesh.geometry.attributes.position.array.slice()});});
  const grounding=createTerrainGrounding(scene,anchor);
  assert(grounding.sampleCount>0 && grounding.sampleCount<2000,'Ground sampling is bounded by deduplicated contacts');
  grounding.update({getTerrain:()=>({}),queryTerrainElevation:()=>30.9},46.7);
  let extended=0;
  for(const {mesh,positions} of before) {
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const original=new Vector3().fromArray(positions,i*3).applyMatrix4(mesh.matrixWorld);
      const current=new Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
      if(original.y>0.05) assert(current.distanceTo(original)<1e-6,'Roof, windows and upper walls stay fixed');
      else {assert(current.y<=-16.04,'Contact reaches the lower terrain');extended++;}
    }
  }
  assert(extended>0);
});
