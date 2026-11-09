// The sky as one shader. The opaque world is drawn into a texture first; then a
// full-screen pass draws the sky behind it and marches each pixel's ray through
// volumetric clouds on the curved Earth, up to whatever the world put in the way:
// cumulus that tower into storms, rain shafts beneath them, cirrus streaks high
// above, cloud shadows on the ground, sólstafir (shafts of sunlight through the
// gaps, in a second pass), the sun with a banded halo, and stars. The weather is weather.js's,
// riding the prevailing winds on the real clock, so everyone shares one sky.
// Then the transparent things (sea, highways, sparkles) are drawn on top,
// depth-tested against the clouds.
//
// Written for this game from published techniques (Beer-Lambert extinction,
// Henyey-Greenstein scattering, billowy Worley noise eroded by a coverage map),
// not adapted from any one shader.
import * as THREE from "three";
import { makeNoise3 } from "./skynoise.js";
import { weatherField, windKm, makeOrography, WEATHER_SIZE, WEATHER_KM, CLOUD_BASE, KM_PER_DEG, UPWIND_M, OROGRAPHY_M } from "./weather.js";
import { R_EARTH } from "./geo.js";

export const TRANSPARENT_LAYER = 1;

const lerpColor = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t)));

/** Zenith and horizon colours for a sun altitude in degrees (the dream's palette). */
export function skyColors(alt) {
  if (alt > 12) return { zenith: new THREE.Color(0x3d3fd6), horizon: new THREE.Color(0xff9ec7) };
  if (alt > -2) { // golden hour into sunset
    const t = (alt + 2) / 14;
    return { zenith: lerpColor(0x2a1a6e, 0x3d3fd6, t), horizon: lerpColor(0xff6a3d, 0xff9ec7, t) };
  }
  if (alt > -12) { // twilight
    const t = (alt + 12) / 10;
    return { zenith: lerpColor(0x070418, 0x2a1a6e, t), horizon: lerpColor(0x1e0f45, 0xff6a3d, t) };
  }
  return { zenith: new THREE.Color(0x070418), horizon: new THREE.Color(0x1e0f45) };
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const fragmentShader = /* glsl */ `
  precision highp sampler3D;
  uniform sampler2D tScene;
  uniform sampler2D tDepth;
  uniform sampler2D tWeather;
  uniform sampler3D tNoise;
  uniform mat4 uInvProj;
  uniform mat4 uCamWorld;
  uniform vec3 uCam;
  uniform float uLogFar;
  uniform float uLat0, uLon0, uKx, uKz, uWindKm;
  uniform vec3 uSunDir, uSunCol, uAmbTop, uAmbBot, uZenith, uHorizon, uHalo, uSunDisc, uFogCol;
  uniform float uFogNear, uFogFar, uStars, uSunUp, uClouds, uUnder, uSteps, uTime;
  uniform vec3 uMoonDir; uniform float uMoonUp;
  uniform vec4 uPlanets[8]; uniform vec3 uPlanetCols[8]; uniform float uPlanetDay;
  uniform float uShadow;
  varying vec2 vUv;

  #define TWO_R ${(2 * R_EARTH).toFixed(1)}
  uniform sampler2D tOro; // the land around: height and broad height
  uniform vec4 uOro;       // its west and north edges (frame x, z), its width (m), whether it's loaded
  uniform vec2 uSlab;      // the lowest cloud base and highest top anywhere in it
  #define BASE0 ${CLOUD_BASE.toFixed(1)}
  #define SIGMA 0.03
  #define SIGMA_RAIN 0.0004
  #define PI 3.14159265

  vec3 rd;      // this pixel's ray, in the world frame
  float cosF;   // how far along the view axis it points

  vec3 toDisplay(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  float cloudiness(float lat) { float a = abs(lat); return a < 12.0 ? 0.55 : a < 35.0 ? 0.18 : a < 65.0 ? 0.45 : 0.3; }
  float windSign(float lat) { float a = abs(lat); return (a < 30.0 || a >= 60.0) ? -1.0 : 1.0; }

  // Where a point sits in the drifting air (km), and its latitude.
  vec2 airKm(vec3 pos, out float lat) {
    lat = uLat0 - pos.z / uKz;
    float lon = uLon0 + pos.x / uKx;
    return vec2(lon * ${KM_PER_DEG} * cos(radians(lat)) - windSign(lat) * uWindKm, lat * ${KM_PER_DEG});
  }
  // The same weather as weather.js.
  // The land at a frame point: (height, broad height) in metres; sea level outside the texture.
  vec2 land(vec2 xz) {
    if (uOro.w < 0.5) return vec2(0.0);
    vec2 uv = (xz - uOro.xy) / uOro.z;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(0.0);
    return texture(tOro, uv).rg * ${OROGRAPHY_M.toFixed(1)};
  }
  void weather(vec2 q, float lat, vec2 xz, out float cover, out float storm, out float base) {
    float n = 0.65 * texture(tWeather, q / ${WEATHER_KM[0].toFixed(1)}).r + 0.35 * texture(tWeather, q / ${WEATHER_KM[1].toFixed(1)} + 0.37).r;
    float c = cloudiness(lat);
    cover = smoothstep(1.0 - c - 0.1, 1.0 - c + 0.3, n);
    float tropic = 1.0 - smoothstep(12.0, 25.0, abs(lat));
    storm = smoothstep(0.7, 0.88, n) * tropic * 0.9 + smoothstep(0.8, 0.95, n) * (1.0 - tropic) * 0.5;
    if (storm > 0.0) storm *= smoothstep(0.45, 0.75, texture(tWeather, q / 37.0 + 0.71).r); // storms come in cells ~10 km across
    // Orography (as weather.js): windward slopes cloud up and rain, lee sides dry out.
    float here = land(xz).g, w = windSign(lat);
    float up12 = land(xz - vec2(w * ${UPWIND_M[0].toFixed(1)}, 0.0)).g;
    float up40 = land(xz - vec2(w * ${UPWIND_M[1].toFixed(1)}, 0.0)).g;
    float up70 = land(xz - vec2(w * ${UPWIND_M[2].toFixed(1)}, 0.0)).g;
    float up100 = land(xz - vec2(w * ${UPWIND_M[3].toFixed(1)}, 0.0)).g;
    float local = here - up12;
    float lift = local < 0.0 ? local : max(local, 0.6 * (here - up40));
    float barrier = max(max(up12, up40), max(up70, up100)) - here;
    cover = min(1.0, cover + 0.5 * smoothstep(100.0, 1200.0, lift));
    cover *= 1.0 - 0.85 * smoothstep(100.0, 1200.0, -lift);
    cover *= 1.0 - 0.6 * smoothstep(600.0, 2000.0, barrier);
    storm = min(1.0, storm + 0.7 * smoothstep(500.0, 1800.0, lift) * cover) * (1.0 - smoothstep(600.0, 2000.0, barrier));
    base = BASE0 + here; // the base rides the broad land; peaks poke up into it
  }
  // Cloud density, 0..1: billows eroded by the coverage, rounded at the top, towering in storms.
  float cloud(vec2 q, float alt, float cover, float storm, float far, float base) {
    float top = base + 1200.0 + 2800.0 * cover + 6000.0 * storm;
    if (alt < base || alt > top || cover < 0.01) return 0.0;
    float hf = (alt - base) / (top - base);
    float prof = smoothstep(0.0, 0.06, hf) * (1.0 - smoothstep(0.4, 1.0, hf));
    vec3 p = vec3(q.x, alt * 0.001, q.y) / 12.0; // the detail repeats every 12 km: cumulus ~3 km across
    // Far away the fine octave would only alias: let it fade to its mean.
    float fine = far < 0.99 ? texture(tNoise, p * 3.1 + 0.31).r : 0.5;
    float b = texture(tNoise, p).r * 0.62 + mix(fine, 0.5, far) * 0.38;
    return clamp((b * prof - (1.0 - cover)) / max(cover, 0.05) * 1.6, 0.0, 1.0);
  }
  // Rain beneath a storm: streaks, falling.
  float rain(vec2 q, float alt, float storm, float base) {
    if (storm < 0.25 || alt < 0.0 || alt > base) return 0.0;
    float s = texture(tNoise, vec3(q.x * 2.0, alt * 0.0001 + uTime * 0.04, q.y * 2.0)).r;
    return smoothstep(0.25, 0.6, storm) * smoothstep(0.3, 0.75, s);
  }
  float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); } // ×4π: 1 when isotropic

  // The first stretch of the ray (t >= 0) where true altitude (over the curved Earth) is within [A, B].
  // alt(t) = a t² + b t + c: a parabola, because the ground falls away by d²/2R.
  bool roots(float A, out float r0, out float r1) {
    float a = dot(rd.xz, rd.xz) / TWO_R, b = rd.y, c = uCam.y - A;
    float disc = b * b - 4.0 * a * c;
    if (disc < 0.0) return false;
    float s = sqrt(disc), qq = -0.5 * (b + (b >= 0.0 ? s : -s));
    float x0 = qq / max(a, 1e-12), x1 = c / qq;
    r0 = min(x0, x1); r1 = max(x0, x1);
    return true;
  }
  bool slab(float A, float B, out float t0, out float t1) {
    float a0, a1, b0, b1;
    bool hitA = roots(A, a0, a1), hitB = roots(B, b0, b1);
    float h = uCam.y;
    if (h < A) { if (!hitA || !hitB) return false; t0 = a1; t1 = b1; }
    else if (h <= B) { t0 = 0.0; t1 = (hitA && a0 > 0.0) ? a0 : (hitB ? b1 : 1e9); }
    else { if (!hitB || b0 < 0.0) return false; t0 = b0; t1 = (hitA && a0 > b0) ? a0 : b1; }
    return t1 > t0;
  }
  float bayer4(vec2 p) {
    ivec2 i = ivec2(mod(p, 4.0));
    float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
    return (m[i.x + i.y * 4] + 0.5) / 16.0;
  }
  // Clouds melt into the haze a little sooner than the ground does.
  float fogAt(float t) { return smoothstep(uFogNear * 0.7, uFogFar * 0.95, t * cosF); }

  // March [t0, t1] front to back, adding light into C and using up transmittance T.
  void march(float t0, float t1, int n, bool isRain, inout vec3 C, inout float T, inout float tHalf) {
    // Steps grow geometrically: fine where the ray enters, coarse in the distance. Looking down
    // on the clouds from above, they sit at the far end of the stretch, so step evenly instead.
    float K = uCam.y > uSlab.y ? 1.0 : 5.0;
    float L = t1 - t0, j = bayer4(gl_FragCoord.xy), norm = L / (exp2(K) - 1.0);
    float cosT = dot(rd, uSunDir);
    float phase = mix(hg(cosT, -0.25), hg(cosT, 0.6), 0.6);
    vec2 sunQ = vec2(uSunDir.x, -uSunDir.z) * 0.001; // km of air per metre toward the sun
    for (int i = 0; i < 64; i++) {
      if (i >= n || T < 0.03) break;
      float u = (float(i) + j) / float(n);
      float t = t0 + norm * (exp2(K * u) - 1.0);
      float dt = norm * K * 0.6931 * exp2(K * u) / float(n);
      vec3 pos = uCam + rd * t;
      vec2 dxz = pos.xz - uCam.xz;
      float alt = pos.y + dot(dxz, dxz) / TWO_R;
      float lat; vec2 q = airKm(pos, lat);
      float cover, storm, base; weather(q, lat, pos.xz, cover, storm, base);
      float fog = fogAt(t);
      if (isRain) {
        float r = rain(q, alt, storm, base);
        if (r <= 0.0) continue;
        float a = 1.0 - exp(-SIGMA_RAIN * r * dt);
        vec3 col = mix(uAmbBot, uAmbTop, 0.35) * 0.8;
        C += T * a * mix(col, uFogCol, fog);
        T *= 1.0 - a;
      } else {
        float far = smoothstep(6000.0, 25000.0, t);
        float d = cloud(q, alt, cover, storm, far, base);
        if (d <= 0.0) continue;
        // Light: a short march toward the sun through the same cloud (skipped far away).
        float lit = 0.6;
        if (far < 0.99) {
          float od = 0.0;
          for (int k = 0; k < 2; k++) {
            float s = 150.0 * pow(3.5, float(k));
            od += cloud(q + sunQ * s, alt + uSunDir.y * s, cover, storm, 1.0, base) * s * 0.6;
          }
          lit = mix(exp(-SIGMA * 0.25 * od), 0.6, far);
        }
        float powder = 1.0 - exp(-d * 6.0);
        float top = (alt - base) / (1200.0 + 2800.0 * cover + 6000.0 * storm);
        vec3 col = uSunCol * lit * min(phase, 2.5) * mix(0.7, 1.5, powder) + mix(uAmbBot, uAmbTop, clamp(top, 0.0, 1.0)) * (0.8 - 0.3 * storm);
        col = 1.0 - exp(-1.6 * col); // soft shoulder: sunlit tops stay white without clipping flat
        float a = 1.0 - exp(-SIGMA * d * dt);
        C += T * a * mix(col, uFogCol, fog);
        T *= 1.0 - a;
      }
      if (tHalf < 0.0 && T < 0.5) tHalf = t;
    }
  }

  // How much cloud stands between a point and the sun, 0 (clear) to 1: where the sun's ray
  // crosses the middle of the cloud layer. Cheap, so the ground and the air can both ask.
  float cloudShadow(vec3 pos, float alt) {
    float h = BASE0 + land(pos.xz).g + 900.0;
    if (uSunDir.y < 0.02 || alt > h) return 0.0;
    vec3 p = pos + uSunDir * ((h - alt) / uSunDir.y);
    float lat; vec2 q = airKm(p, lat);
    float cover, storm, base; weather(q, lat, p.xz, cover, storm, base);
    return smoothstep(0.0, 0.3, cloud(q, max(h, base + 600.0), cover, storm, 1.0, base));
  }

  vec3 skyColor(vec3 d) {
    float h = clamp(d.y, 0.0, 1.0);
    float band = floor(pow(h, 0.45) * 7.0) / 7.0; // banded, like an old palette
    vec3 c = mix(uHorizon, uZenith, band);
    float cs = dot(d, uSunDir);
    float halo = floor(pow(max(cs, 0.0), 14.0) * 4.0) / 4.0;
    c = mix(c, uHalo, halo * 0.6 * uSunUp);
    if (uSunUp > 0.0 && cs > 0.99897) c = uSunDisc; // a big stylized sun, ~2.6° across
    if (uStars > 0.0 && d.y > 0.0) {
      vec3 cell = floor(d * 160.0);
      float hs = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      if (hs > 0.9975) c = mix(c, vec3(1.0, 0.97, 0.88), uStars * (0.6 + 0.4 * sin(uTime * 2.0 + hs * 100.0)));
    }
    // The planets, where they really are, as discs 5° across (the dream exaggerates them), behind the Moon.
    for (int i = 0; i < 8; i++) {
      vec4 P = uPlanets[i];
      float cp = dot(d, P.xyz);
      if (P.w <= 0.0 || cp < 0.99905) continue; // 2.5° radius
      vec3 off = d - P.xyz * cp;
      float r = length(off) / 0.043619;
      vec3 u = normalize(cross(P.xyz, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0)), v = cross(u, P.xyz);
      vec2 q = vec2(dot(off, u), dot(off, v)) / 0.043619; // -1..1 across the disc
      float ball = i == 4 ? 0.58 : 1.0; // Saturn's ball is smaller, to fit its ring inside the 5°
      vec3 col = uPlanetCols[i];
      if (i == 3) col *= 0.82 + 0.18 * step(0.0, sin(q.y * 15.0)); // Jupiter's bands
      float a = 0.0;
      if (r < ball) {
        float rr = r / ball;
        vec3 n = -P.xyz * sqrt(max(0.0, 1.0 - rr * rr)) + normalize(off + 1e-6) * rr;
        col *= 0.55 + 0.6 * max(0.0, dot(n, uSunDir));
        a = smoothstep(1.0, 0.86, rr);
      }
      if (i == 4) { // Saturn's ring: a tilted ellipse, in front of the ball below its middle
        float e = length(vec2(q.x, q.y / 0.36));
        if (e > 0.72 && e < 0.98 && (r >= ball || q.y < 0.0)) { col = uPlanetCols[i] * vec3(0.95, 0.88, 0.7); a = 0.85; }
      }
      c = mix(c, col, a * P.w);
    }
    // The Moon, about 8° across, lit on the side toward the sun (its real phase), the rest faint with earthshine.
    float cm = dot(d, uMoonDir);
    if (uMoonUp > 0.0 && cm > 0.99756) {
      vec3 off = d - uMoonDir * cm;
      float r = length(off) / 0.069756;
      vec3 n = -uMoonDir * sqrt(max(0.0, 1.0 - r * r)) + normalize(off + 1e-6) * r;
      float lit = smoothstep(-0.04, 0.06, dot(n, uSunDir));
      float mare = step(0.62, fract(sin(dot(floor(n * 5.0), vec3(7.1, 3.7, 9.3))) * 4375.85)) * 0.12; // a few darker seas
      vec3 mc = mix(vec3(0.16, 0.14, 0.27), vec3(0.97, 0.95, 1.0) * (1.0 - mare), lit);
      c = mix(c, mc, smoothstep(1.0, 0.95, r) * uMoonUp);
    }
    return c;
  }

  void main() {
    vec4 scene = texture(tScene, vUv);
    float depth = texture(tDepth, vUv).r;
    gl_FragDepth = depth;
    if (uUnder > 0.5) { gl_FragColor = vec4(toDisplay(scene.rgb), 1.0); return; }
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 pv = uInvProj * vec4(ndc, 1.0, 1.0);
    rd = normalize((uCamWorld * vec4(normalize(pv.xyz / pv.w), 0.0)).xyz);
    vec3 fwd = normalize((uCamWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
    cosF = max(dot(rd, fwd), 1e-4);
    bool open = depth >= 0.9999999;
    float tScene = open ? 1e12 : (exp2(depth * uLogFar) - 1.0) / cosF;
    vec3 bg = open ? skyColor(rd) : toDisplay(scene.rgb);
    // Where open sky shows close around the sun: the source the sólstafir pass streaks outward.
    float cs0 = dot(rd, uSunDir);
    float sunMask = open ? uSunUp * (0.55 * smoothstep(0.95, 0.999, cs0) + 0.45 * step(0.99897, cs0)) : 0.0;
    // Cloud shadows on the ground.
    if (!open && uClouds > 0.5 && uShadow > 0.0 && fogAt(tScene) < 0.95) {
      vec3 sp = uCam + rd * tScene;
      vec2 sxz = sp.xz - uCam.xz;
      bg *= 1.0 - 0.42 * uShadow * cloudShadow(sp, sp.y + dot(sxz, sxz) / TWO_R);
    }

    if (uClouds > 0.5) {
      float t0, t1;
      // Cirrus: thin streaks on a shell 9 km up, stretched along the wind.
      if (slab(9000.0, 9001.0, t0, t1) && t0 < tScene && t0 * cosF < uFogFar * 4.0) {
        vec3 pc = uCam + rd * t0;
        float lat; vec2 qc = airKm(pc, lat);
        float n = texture(tWeather, vec2(qc.x / 95.0, qc.y / 300.0) + 0.61).r;
        float cov = smoothstep(0.6, 0.9, n) * (0.35 + cloudiness(lat));
        float f = smoothstep(uFogNear, uFogFar * 4.0, t0 * cosF);
        bg = mix(bg, mix(mix(uAmbTop, uSunCol, 0.55), uFogCol, f), cov * 0.5 * (1.0 - f));
      }
      vec3 C = vec3(0.0); float T = 1.0, tHalf = -1.0;
      float c0 = -1.0, c1 = -1.0, r0 = -1.0, r1 = -1.0;
      bool hasC = slab(uSlab.x, uSlab.y, c0, c1), hasR = slab(0.0, uSlab.x, r0, r1);
      if (hasC) { c1 = min(min(c1, c0 + 90000.0), tScene); hasC = c1 > c0 && c0 * cosF < uFogFar; }
      if (hasR) { r1 = min(min(r1, r0 + 40000.0), tScene); hasR = r1 > r0 && r0 * cosF < uFogFar; }
      int steps = int(uSteps);
      // Nearest stretch first.
      if (hasR && (!hasC || r0 < c0)) { march(r0, r1, 10, true, C, T, tHalf); if (hasC) march(c0, c1, steps, false, C, T, tHalf); }
      else { if (hasC) march(c0, c1, steps, false, C, T, tHalf); if (hasR) march(r0, r1, 10, true, C, T, tHalf); }
      bg = C + T * bg;
      sunMask *= T; // clouds hide the sun from the rays pass
      // Where a cloud hides what's behind it, the transparent things drawn next should be hidden too.
      if (tHalf > 0.0) gl_FragDepth = min(depth, log2(1.0 + tHalf * cosF) / uLogFar);
    }
    gl_FragColor = vec4(bg, sunMask);
  }`;

// Sólstafir: shafts of sunlight through every gap the clouds and the land leave.
// The classic screen-space way (light scattering as a post-process): march from
// each pixel toward the sun's place on screen, gathering the open-sky mask,
// fading with each step, and add what's gathered as golden light.
const raysShader = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uSunUV;
  uniform vec3 uSunCol;
  uniform float uRays;
  uniform float uLinearOut;
  varying vec2 vUv;
  void main() {
    vec4 c = texture(tColor, vUv);
    gl_FragDepth = texture(tDepth, vUv).r;
    vec3 col = c.rgb;
    if (uRays > 0.0) {
      vec2 step = (vUv - uSunUV) * (0.92 / 32.0);
      vec2 uv = vUv;
      float fall = 1.0, sum = 0.0;
      for (int i = 0; i < 32; i++) {
        uv -= step;
        sum += texture(tColor, clamp(uv, 0.0, 1.0)).a * fall;
        fall *= 0.962;
      }
      col += uSunCol * uRays * sum / 12.0;
    }
    // Drawn into a spell's (sRGB) target rather than the screen, it hands over linear colour like everything else.
    if (uLinearOut > 0.5) col = mix(col / 12.92, pow((col + 0.055) / 1.055, vec3(2.4)), step(0.04045, col));
    gl_FragColor = vec4(col, 1.0);
  }`;

/** The sky pass. update() once a frame, then render() in place of renderer.render(scene, camera). */
export function buildSkyShader() {
  const noise = new THREE.Data3DTexture(makeNoise3(32), 32, 32, 32);
  noise.format = THREE.RedFormat;
  noise.type = THREE.UnsignedByteType;
  noise.minFilter = noise.magFilter = THREE.LinearFilter;
  noise.wrapS = noise.wrapT = noise.wrapR = THREE.RepeatWrapping;
  noise.unpackAlignment = 1;
  noise.needsUpdate = true;
  const weather = new THREE.DataTexture(weatherField(), WEATHER_SIZE, WEATHER_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
  weather.minFilter = weather.magFilter = THREE.LinearFilter;
  weather.wrapS = weather.wrapT = THREE.RepeatWrapping;
  weather.unpackAlignment = 1;
  weather.needsUpdate = true;

  // The opaque world goes here first: colour (sRGB-encoded storage, linear values) and depth.
  const rt = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1), colorSpace: THREE.SRGBColorSpace, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const U = (value) => ({ value });
  const uniforms = {
    tScene: U(rt.texture), tDepth: U(rt.depthTexture), tWeather: U(weather), tNoise: U(noise),
    uInvProj: U(new THREE.Matrix4()), uCamWorld: U(new THREE.Matrix4()), uCam: U(new THREE.Vector3()), uLogFar: U(1),
    uLat0: U(0), uLon0: U(0), uKx: U(1), uKz: U(1), uWindKm: U(0),
    uSunDir: U(new THREE.Vector3(0, 1, 0)), uSunCol: U(new THREE.Color()), uAmbTop: U(new THREE.Color()), uAmbBot: U(new THREE.Color()),
    uZenith: U(new THREE.Color()), uHorizon: U(new THREE.Color()), uHalo: U(new THREE.Color(1, 0.86, 0.62)), uSunDisc: U(new THREE.Color(1, 0.945, 0.659)), uFogCol: U(new THREE.Color()),
    uFogNear: U(1), uFogFar: U(2), uStars: U(0), uSunUp: U(1), uClouds: U(1), uUnder: U(0), uSteps: U(48), uTime: U(0), uShadow: U(0),
    uMoonDir: U(new THREE.Vector3(0, -1, 0)), uMoonUp: U(0), uPlanetDay: U(0),
    uPlanets: U(Array.from({ length: 8 }, () => new THREE.Vector4(0, -1, 0, 0))),
    // Mercury quicksilver, Venus pale gold, Mars red, Jupiter tan, Saturn butter, Uranus cyan, Neptune deep blue, Pluto dusky rose.
    uPlanetCols: U([0xb9b4d6, 0xfff1c4, 0xff5a3c, 0xe8b886, 0xf3dc8a, 0x8ff3ff, 0x4f6dff, 0xc98bb3].map((h) => new THREE.Color(h))),
    tOro: U(null), uOro: U(new THREE.Vector4(0, 0, 1, 0)), uSlab: U(new THREE.Vector2(CLOUD_BASE, CLOUD_BASE + 8500)),
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const pass = new THREE.Scene();
  pass.add(quad);
  // The sky pass draws here (its alpha is the open-sky mask), then the rays pass draws it to the screen.
  const rt2 = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1), minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const raysUniforms = { tColor: U(rt2.texture), tDepth: U(rt2.depthTexture), uSunUV: U(new THREE.Vector2(0.5, 2)), uSunCol: uniforms.uSunCol, uRays: U(0), uLinearOut: U(0) };
  const raysQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: raysUniforms, vertexShader, fragmentShader: raysShader, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth }));
  raysQuad.frustumCulled = false;
  const raysPass = new THREE.Scene();
  raysPass.add(raysQuad);
  const sunPoint = new THREE.Vector3();
  const passCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new THREE.Vector2();
  const DEG = Math.PI / 180;

  return {
    /**
     * frame: the world frame; sun: { altitude, dir }; day 0..1; fog: { near, far, color (linear) };
     * clouds: whether to draw them; steps: march steps (the detail governor's).
     */
    update({ frame, camera, unix, sun, day, fog, clouds, underwater, steps, sky = null }) {
      // The Moon and the planets (astro.js, through main): directions, and how much they show (faint by day).
      if (sky) {
        uniforms.uMoonDir.value.copy(sky.moon);
        uniforms.uMoonUp.value = sky.moon.y > -0.07 ? 1 : 0;
        sky.planets.forEach((p, i) => uniforms.uPlanets.value[i].set(p.x, p.y, p.z, p.y > -0.05 ? 0.4 + 0.6 * (1 - day) : 0));
      }
      const { zenith, horizon } = skyColors(sun.altitude);
      uniforms.uZenith.value.copy(zenith); // the dream's palette, shown as-is
      uniforms.uHorizon.value.copy(horizon);
      uniforms.uFogCol.value.copy(fog.color).convertLinearToSRGB();
      uniforms.uFogNear.value = fog.near;
      uniforms.uFogFar.value = fog.far;
      uniforms.uSunDir.value.copy(sun.dir);
      uniforms.uSunUp.value = sun.altitude > -3 ? 1 : 0;
      uniforms.uStars.value = Math.min(1, Math.max(0, (-sun.altitude - 4) / 8));
      // Cloud light: white by day, gold at the ends of it, dim violet at night.
      const gold = 1 - Math.min(1, Math.max(0, (sun.altitude - 2) / 14));
      uniforms.uSunCol.value.setRGB(1, 0.97 - 0.35 * gold, 0.95 - 0.55 * gold).multiplyScalar(0.12 + 0.95 * day);
      // Sólstafir are strongest when the sun is low and golden; shadows only while it's up.
      const up = Math.min(1, Math.max(0, (sun.altitude + 1) / 4));
      uniforms.uShadow.value = up * day;
      // Where the sun sits on screen; the rays fade as it leaves the frame or goes behind you.
      camera.updateMatrixWorld();
      sunPoint.copy(sun.dir).multiplyScalar(1e5).add(camera.position).project(camera);
      const behind = sunPoint.z > 1 || sunPoint.z < -1;
      const off = Math.max(0, Math.abs(sunPoint.x) - 1, Math.abs(sunPoint.y) - 1);
      raysUniforms.uSunUV.value.set(sunPoint.x * 0.5 + 0.5, sunPoint.y * 0.5 + 0.5);
      raysUniforms.uRays.value = behind || underwater ? 0 : up * (0.5 + 0.55 * gold) * (1 - Math.min(1, off / 0.8));
      // Skylight on the clouds, in the dream's colours: lavender tops, pink-violet undersides.
      const fogDisp = fog.color.clone().convertLinearToSRGB();
      uniforms.uAmbTop.value.setRGB(0.86, 0.84, 1).lerp(zenith, 0.2).multiplyScalar(0.3 + 0.6 * day);
      uniforms.uAmbBot.value.copy(fogDisp).lerp(new THREE.Color(0.62, 0.55, 0.9), 0.5).multiplyScalar(0.3 + 0.5 * day);
      uniforms.uLat0.value = frame.lat0;
      uniforms.uLon0.value = frame.lon0;
      uniforms.uKz.value = R_EARTH * DEG;
      uniforms.uKx.value = R_EARTH * Math.cos(frame.lat0 * DEG) * DEG;
      uniforms.uWindKm.value = windKm(unix);
      uniforms.uTime.value = unix % 3600;
      uniforms.uClouds.value = clouds ? 1 : 0;
      uniforms.uUnder.value = underwater ? 1 : 0;
      uniforms.uSteps.value = Math.max(8, Math.min(64, Math.round(steps)));
      camera.updateMatrixWorld();
      uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
      uniforms.uCamWorld.value.copy(camera.matrixWorld);
      uniforms.uCam.value.copy(camera.position);
      uniforms.uLogFar.value = Math.log2(camera.far + 1);
      return horizon;
    },
    /** A new world: give the sky the land around it (±240 km), for orographic clouds and their bases. */
    setWorld(terrain) {
      const SPAN = 480000, SIZE = 128, x0 = -SPAN / 2, z0 = -SPAN / 2;
      const o = makeOrography(terrain.heightAt, x0, z0, SPAN, SIZE);
      const tex = new THREE.DataTexture(o.data, SIZE, SIZE, THREE.RGFormat, THREE.UnsignedByteType);
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.unpackAlignment = 1;
      tex.needsUpdate = true;
      uniforms.tOro.value?.dispose();
      uniforms.tOro.value = tex;
      uniforms.uOro.value.set(x0, z0, SPAN, 1);
      uniforms.uSlab.value.set(CLOUD_BASE + o.min, CLOUD_BASE + o.max + 8500);
    },
    /** Opaque world into the texture; sky and clouds to the screen; then the transparent things. */
    /** out: where the finished frame goes (null: the screen; a target when a spell redraws it). */
    render(renderer, scene, camera, out = null) {
      renderer.getDrawingBufferSize(size);
      if (rt.width !== size.x || rt.height !== size.y) { rt.setSize(size.x, size.y); rt2.setSize(size.x, size.y); }
      camera.layers.set(0);
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(rt2);
      renderer.render(pass, passCam);
      raysUniforms.uLinearOut.value = out ? 1 : 0;
      renderer.setRenderTarget(out);
      renderer.render(raysPass, passCam);
      // three.js clears for a colour background even with autoClear off, so lift it for this pass.
      camera.layers.set(TRANSPARENT_LAYER);
      const ac = renderer.autoClear, bg = scene.background;
      renderer.autoClear = false;
      scene.background = null;
      renderer.render(scene, camera);
      scene.background = bg;
      renderer.autoClear = ac;
      camera.layers.set(0);
    },
  };
}

/** Put every transparent thing under root on the transparent layer (drawn after the sky). */
export function layerTransparent(root) {
  root.traverse((o) => {
    const m = o.material;
    if (m && (Array.isArray(m) ? m.some((x) => x.transparent) : m.transparent)) o.layers.set(TRANSPARENT_LAYER);
  });
}
