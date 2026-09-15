import {HemisphereLight, DirectionalLight} from "three";
import LIBRARY from "../materials.json" with {type:"json"};
import LIGHTING from "../lighting.json" with {type:"json"};
const MATERIALS=LIBRARY.materials;
export const PRESETS = {
  day: {
    sky: 0xfff6e5,
    ground: 0x929a89,
    ambient: 2,
    sun: 0xfff3dd,
    power: 2,
    emission: 0,
  },
  dawn: {
    sky: 0xe5c7b1,
    ground: 0x706e79,
    ambient: 1.1,
    sun: 0xffad68,
    power: 1.5,
    emission: 1,
  },
  night: {
    sky: 0x8297c7,
    ground: 0x303a52,
    ambient: 0.55,
    sun: 0xaac1ff,
    power: 0.3,
    emission: 2.4,
  },
};
/** Opaque glass keeps the same triangle/draw-call count; no transparency sorting.
 * windowLighting=false disables emission, while preserving pale-blue glazing.
 * Override any shared preset with {day:{windowColor,windowEmission}, ...}.
 */
export function lightScene(scene, { windowLighting = {}, entranceGlow = true, profile = "landmark" } = {}) {
  const ambient = new HemisphereLight(),
    sun = new DirectionalLight();
  sun.position.set(-200, 400, 150);
  scene.add(ambient, sun);
  return (name) => {
    if (!PRESETS[name]) throw Error("Unknown light preset");
    const p = { ...PRESETS[name], ...(profile === "landmark" ? LIGHTING.presets[name].landmarkLight : {}) };
    const glass = { ...LIGHTING.presets[name], windowColor: MATERIALS.window.color, ...(windowLighting?.[name] || {}) };
    ambient.color.set(p.sky);
    ambient.groundColor.set(p.ground);
    ambient.intensity = p.ambient;
    sun.color.set(p.sun);
    sun.intensity = p.power;
    scene.traverse((o) => {
      if (o.isMesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.name === "entrance") {
            m.emissive.set(MATERIALS.entrance.color);
            m.emissiveIntensity = glass.entranceEmission;
          }
          if (m.name === "window") {
            m.color.set(glass.windowColor);
            m.emissive.set(glass.windowColor);
            m.emissiveIntensity = windowLighting === false ? 0 : Math.max(0, glass.windowEmission);
          }
          if (m.name === "entrance-glow") {
            m.uniforms.opacity.value = entranceGlow ? glass.glowOpacity : 0;
            o.visible = m.uniforms.opacity.value > 0;
          }
        }
    });
  };
}
