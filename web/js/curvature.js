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
 * Patch a built-in material (Lambert, Basic, Phong, Points...) so its vertices
 * curve. The drop is applied in world space at the projection step, after any
 * instancing, so rotated, scaled and instanced meshes all curve correctly.
 */
export function curved(material, extraKey = "") {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uCurve = curveUniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${CURVE_GLSL}`)
      .replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_BATCHING
          mvPosition = batchingMatrix * mvPosition;
        #endif
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition = viewMatrix * curveWorld( modelMatrix * mvPosition );
        gl_Position = projectionMatrix * mvPosition;`,
      );
    if (prev) prev(shader, renderer);
  };
  material.customProgramCacheKey = () => `curved${extraKey}`;
  return material;
}
