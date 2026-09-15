import {Scene, Box3, Vector3, PerspectiveCamera, NeutralToneMapping} from 'three';
import {lightScene} from './lighting.js';
import {createSkyEnvironment} from './environment.js';

// Used by interactive previews and the thumbnail renderer. glTF axes are
// east/up/south; optional directions use the same axes.
export function createModelView(model, renderer, {aspect=1,direction=[1.3,.85,1.6]}={}) {
  renderer.toneMapping=NeutralToneMapping;
  const scene=new Scene();scene.add(model);
  const box=new Box3().setFromObject(model),center=box.getCenter(new Vector3());
  const size=Math.max(...box.getSize(new Vector3()).toArray());
  const camera=new PerspectiveCamera(36,aspect,size/100,size*30);
  if(direction.length!==3||!direction.every(Number.isFinite)||direction[1]<=0)throw Error('Preview direction must be a finite view above the model');
  camera.position.copy(center).add(new Vector3(...direction).normalize().multiplyScalar(size*Math.hypot(1.3,.85,1.6)));
  camera.lookAt(center);
  const lights=lightScene(scene),environment=createSkyEnvironment(scene);
  let preset='day';
  return {
    scene,camera,center,size,
    setPreset(name) { lights(name);preset=name; },
    render() { environment.update(renderer,preset);renderer.render(scene,camera); },
    dispose() { environment.dispose(); },
  };
}
