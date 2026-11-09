// The dream breathes. Jason, 11-09: "lets make everything breathe. Animals more, plants less, landscapes even less."
// Animals swell and settle about every three and a half seconds (quicker on the move); a tree's crown, every six,
// out of step with its neighbours; the land, a slow swell rolling outward from you every nine, felt on far ridges
// and never under your feet (so nothing you stand on moves).
// How much each breathes; a system set to reduce motion gets less, and still land.
const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const BREATH = reduce ? { animal: 0.5, plant: 0.3, land: 0 } : { animal: 1, plant: 1, land: 1 };
/** Shared by the shaders that breathe: the clock (s) and how much. */
export const breathUniforms = { uBreathT: { value: 0 }, uBreathPlant: { value: BREATH.plant }, uBreathLand: { value: BREATH.land }, uBreathCentre: { value: { x: 0, y: 0, isVector2: true } } };

/**
 * The land breathes: a swell of up to 0.3% of its height (plus half a metre), rolling outward from you, nothing within
 * 300 m of you (where you walk, physics and drawing agree) and full strength past 4 km. Patches a terrain material.
 */
export function breathingLand(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uBreathT = breathUniforms.uBreathT;
    shader.uniforms.uBreathLand = breathUniforms.uBreathLand;
    shader.uniforms.uBreathCentre = breathUniforms.uBreathCentre;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uBreathT; uniform float uBreathLand; uniform vec2 uBreathCentre;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec3 wpB = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float dB = distance(wpB.xz, uBreathCentre);
        transformed.y += uBreathLand * (0.5 + 0.003 * max(wpB.y, 0.0)) * smoothstep(300.0, 4000.0, dB) * sin(uBreathT * 0.7 - dB * 0.0011);`);
    if (prev) prev(shader, renderer);
  };
  return material;
}
