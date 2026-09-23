import test from 'node:test';
import assert from 'node:assert/strict';
import {DataUtils,LinearSRGBColorSpace,MeshStandardMaterial,Mesh,BoxGeometry,Scene} from 'three';
import {skyTexture} from '../rendering/environment.js';
import {lightScene} from '../rendering/lighting.js';
import lighting from '../lighting.json' with {type:'json'};
import {materialLibrary,materialAudit,linearColor} from '../tools/material-audit.mjs';

test('sky reflection maps are small, linear, seamless, and brighter above the horizon',()=>{
  for(const preset of ['day','dawn','night']) {
    const texture=skyTexture(preset),{data,width,height}=texture.image;
    assert.equal(width,256);assert.equal(height,128);
    assert.equal(data.byteLength,256*128*8);
    assert.equal(texture.colorSpace,LinearSRGBColorSpace);
    const luminance=y=>[.2126,.7152,.0722].reduce((n,w,i)=>n+w*DataUtils.fromHalfFloat(data[y*width*4+i]),0);
    assert(luminance(height-1)>luminance(0),'sky/ground orientation inverted');
    assert(luminance(height/2)>luminance(height-1),'bright horizon missing');
    for(let y=0;y<height;y++)assert.deepEqual(data.slice(y*width*4,y*width*4+4),data.slice((y*width+width-1)*4,(y*width+width)*4));
    texture.dispose();
  }
  assert.throws(()=>skyTexture('unknown'));
});

test('architectural glass is non-metallic and lit by reflections, not window emission',()=>{
  assert.equal(materialLibrary.materials.glass.metalness,0);
  const glass=new MeshStandardMaterial({name:'glass',color:materialLibrary.materials.glass.color});
  const scene=new Scene();scene.add(new Mesh(new BoxGeometry(),glass));
  const set=lightScene(scene);
  for(const preset of ['day','dawn','night']) {set(preset);assert.equal(glass.emissive.getHex(),0);assert.equal(glass.color.getHexString(),'a4c4d9');}
  const doc={materials:[{name:'glass',pbrMetallicRoughness:{baseColorFactor:[...linearColor('#a4c4d9'),1],roughnessFactor:.24,metallicFactor:.3}}]};
  assert(materialAudit(doc).some(e=>e.includes('surface properties')),'old metallic glass must fail validation');
});

test('Clair window lighting stays subtle and increases through dusk',()=>{
  const levels=['day','dawn','night'].map(p=>lighting.presets[p].windowEmission);
  assert(levels[0]>0 && levels[0]<levels[1] && levels[1]<levels[2] && levels[2]<=0.5);
  assert.equal(materialLibrary.materials.stone.color,'#efe4d3');
  assert(materialLibrary.windowSupportMaterials.includes('terracotta'));
});
