// The Earth curves away. Every world-space vertex drops by d²/2R, where d is its
// horizontal distance from the camera, so the land meets the sky at the real
// horizon (about 67 km away at 350 m up, 195 km at 3 km).
import * as THREE from "three";

export const TWO_R = 2 * 6371008.8;
/** Shared by every curved material: the camera position, updated each frame. */
export const curveUniform = { value: new THREE.Vector3() };

/** GLSL: drop a world-space position by the curvature relative to the camera. */
export const CURVE_GLSL = /* glsl */ `
  uniform vec3 uCurve;
  vec4 curveWorld(vec4 w) { vec2 d = w.xz - uCurve.xz; w.y -= dot(d, d) / ${TWO_R.toFixed(1)}; return w; }
`;

/**
 * Patch a built-in material (Lambert, Basic, Phong...) so its vertices curve.
 * Assumes the mesh has no rotation or scale (geometry is rotated instead), so
 * a world-space drop equals a local-space drop.
 */
export function curved(material, extraKey = "") {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uCurve = curveUniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uCurve;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        { vec4 cw = modelMatrix * vec4(transformed, 1.0); vec2 cd = cw.xz - uCurve.xz; transformed.y -= dot(cd, cd) / ${TWO_R.toFixed(1)}; }`,
      );
    if (prev) prev(shader, renderer);
  };
  material.customProgramCacheKey = () => `curved${extraKey}`;
  return material;
}
