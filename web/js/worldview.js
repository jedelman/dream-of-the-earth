// How the world looks under a shrine's spell: one full-screen pass over the finished frame (land, sky, sea, sparkles),
// drawn only while a spell needs it. Colours slide along the rainbow, the picture folds into six mirrors, it melts
// and runs, or it bulges like the inside of a bubble (the fisheye's lens).
import * as THREE from "three";

export function buildWorldview() {
  const rt = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const uniforms = { tFrame: { value: rt.texture }, uTime: { value: 0 }, uHue: { value: 0 }, uKaleido: { value: 0 }, uMelt: { value: 0 }, uBarrel: { value: 0 }, uAspect: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tFrame;
      uniform float uTime, uHue, uKaleido, uMelt, uBarrel, uAspect;
      varying vec2 vUv;
      vec3 hueTurn(vec3 c, float a) {
        // Turn the colour round the YIQ wheel: brightness stays, hue moves.
        float y = dot(c, vec3(0.299, 0.587, 0.114)), i = dot(c, vec3(0.596, -0.274, -0.322)), q = dot(c, vec3(0.211, -0.523, 0.312));
        float cs = cos(a), sn = sin(a), i2 = i * cs - q * sn, q2 = i * sn + q * cs;
        return vec3(y + 0.956 * i2 + 0.621 * q2, y - 0.272 * i2 - 0.647 * q2, y - 1.106 * i2 + 1.703 * q2);
      }
      void main() {
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        // The fisheye: the middle swells, the edges crowd in.
        if (uBarrel > 0.0) p *= mix(1.0, 0.62 + 0.42 * dot(p, p), uBarrel);
        // Six mirrors round the middle, turning slowly.
        if (uKaleido > 0.0) {
          float seg = 6.2831853 / 6.0, a = mod(atan(p.y, p.x) + uTime * 0.12, seg);
          a = abs(a - seg * 0.5);
          p = mix(p, length(p) * vec2(cos(a), sin(a)), uKaleido);
        }
        // Melting: the picture sways and runs downward in ripples.
        if (uMelt > 0.0) {
          p.x += uMelt * 0.016 * sin(p.y * 22.0 + uTime * 2.1);
          p.y += uMelt * (0.018 * sin(p.x * 9.0 + uTime * 1.3) + 0.01 * sin(p.x * 31.0 + uTime * 0.7));
        }
        vec2 q = p / vec2(uAspect, 1.0) + 0.5;
        vec3 c;
        if (uMelt > 0.0) {
          float s = 0.006 * uMelt;
          c = vec3(texture2D(tFrame, q + vec2(s, 0.0)).r, texture2D(tFrame, q).g, texture2D(tFrame, q - vec2(s, 0.0)).b);
        } else c = texture2D(tFrame, q).rgb;
        if (uHue > 0.0) {
          vec3 turned = hueTurn(c, uTime * 0.9);
          float l = dot(turned, vec3(0.299, 0.587, 0.114));
          c = mix(c, max(vec3(0.0), mix(vec3(l), turned, 1.35)), uHue);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();
  const size = new THREE.Vector2();

  return {
    uniforms,
    /** Whether anything needs the pass this frame. */
    get active() { return uniforms.uHue.value > 0 || uniforms.uKaleido.value > 0 || uniforms.uMelt.value > 0 || uniforms.uBarrel.value > 0; },
    /** Where the frame should be drawn instead of the screen, sized to it. */
    target(renderer) {
      renderer.getDrawingBufferSize(size);
      if (rt.width !== size.x || rt.height !== size.y) rt.setSize(size.x, size.y);
      uniforms.uAspect.value = size.x / Math.max(1, size.y);
      return rt;
    },
    /** Draw the frame to the screen through the spell. */
    render(renderer, t) {
      uniforms.uTime.value = t;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
}
