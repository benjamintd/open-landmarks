import {Color, DataTexture, HalfFloatType, RGBAFormat, LinearSRGBColorSpace,
  EquirectangularReflectionMapping, DataUtils, PMREMGenerator} from 'three';
import LIGHTING from '../lighting.json' with {type:'json'};

// A smooth outdoor lighting field, not a capture of nearby map geometry.
// 256×128 input -> 64px cube faces -> 336×256 RGBA16F PMREM (672 KiB).
export function skyTexture(preset) {
  const spec=LIGHTING.presets[preset]?.environment;
  if(!spec)throw Error(`Unknown environment preset: ${preset}`);
  const width=256,height=128,data=new Uint16Array(width*height*4);
  const sky=new Color(spec.sky),horizon=new Color(spec.horizon),ground=new Color(spec.ground);
  for(let y=0;y<height;y++) {
    // DataTexture row zero is the bottom: v=1 is the zenith in Three.js.
    const altitude=Math.sin(((y+.5)/height-.5)*Math.PI);
    const color=horizon.clone().lerp(altitude>=0?sky:ground,Math.pow(Math.abs(altitude),.45));
    for(let x=0;x<width;x++) {
      const i=(y*width+x)*4;
      data[i]=DataUtils.toHalfFloat(color.r);data[i+1]=DataUtils.toHalfFloat(color.g);
      data[i+2]=DataUtils.toHalfFloat(color.b);data[i+3]=DataUtils.toHalfFloat(1);
    }
  }
  const texture=new DataTexture(data,width,height,RGBAFormat,HalfFloatType);
  texture.mapping=EquirectangularReflectionMapping;texture.colorSpace=LinearSRGBColorSpace;
  texture.needsUpdate=true;
  return texture;
}

/** One retained texture per scene. Call update only where this renderer owns GL
 * state (inside MapLibre's custom render callback). Repeated frames are free.
 * Input textures and filtering scratch targets are released after generation.
 */
export function createSkyEnvironment(scene) {
  let current,target,disposed=false;
  return {
    update(renderer,preset) {
      if(disposed)throw Error('Environment has been disposed');
      if(current===preset)return;
      const input=skyTexture(preset),generator=new PMREMGenerator(renderer);
      const previousTarget=renderer.getRenderTarget();
      const face=renderer.getActiveCubeFace(),level=renderer.getActiveMipmapLevel();
      const autoClear=renderer.autoClear,xr=renderer.xr.enabled;
      let next;
      try {
        renderer.autoClear=true;
        next=generator.fromEquirectangular(input);
      } finally {
        input.dispose();generator.dispose();
        renderer.autoClear=autoClear;renderer.xr.enabled=xr;
        renderer.setRenderTarget(previousTarget,face,level);
      }
      const old=target;
      target=next;current=preset;
      scene.environment=target.texture;
      scene.environmentIntensity=LIGHTING.presets[preset].environment.intensity;
      old?.dispose();
    },
    dispose() {
      if(disposed)return;
      disposed=true;
      if(scene.environment===target?.texture)scene.environment=null;
      target?.dispose();target=null;
    },
  };
}
