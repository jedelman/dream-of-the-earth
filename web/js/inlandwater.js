// Inland water, drawn (11-14): rivers as ribbons laid on the land, lakes as flat water at their shore's height. Where
// they come from and the rules are in inland.js; this file fetches the tiles and builds the meshes. One shader for both,
// the sea's palette in hard bands, with ripples, a glint and the sky at grazing angles. Since 11-16 rivers run downhill:
// each is turned to flow the way its ground falls, and pale streaks drift down it.
import * as THREE from "three";
import { CURVE_GLSL, curveUniform } from "./curvature.js";
import { lakeTideShare } from "./tides.js";
import { NEAR_M, FAR_M, BIG_RANK, waterTilesNear, parseWaterTile, riverWidth, flowSign, flowSpeed, bearingOf, densify, ribbon, lakeLevel, lakePolygons, subdivide, distToLine, inRing, signedArea } from "./inland.js";

let listed = null, listing = null;
const tiles = new Map(); // key -> parsed tile (or an empty one if it failed)
const pending = new Map();

async function loadIndex() {
  if (listed) return listed;
  listing ??= fetch("./data/water/index.json").then((r) => (r.ok ? r.json() : { tiles: [] })).then((j) => (listed = new Set(Array.isArray(j.tiles) ? j.tiles : []))).catch(() => (listed = new Set()));
  return listing;
}

/** Make sure the water tiles round (lat, lon) are loaded (a few, of 226, each under 70 KB). */
export async function ensureWater(lat, lon) {
  const have = await loadIndex();
  await Promise.all(waterTilesNear(lat, lon, FAR_M + 20000, have).map((key) => {
    if (tiles.has(key)) return null;
    if (!pending.has(key)) pending.set(key, fetch(`./data/water/${key}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => tiles.set(key, parseWaterTile(j))).catch(() => tiles.set(key, parseWaterTile(null))).finally(() => pending.delete(key)));
    return pending.get(key);
  }));
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  ${CURVE_GLSL}
  attribute vec2 flow; // a river's streak speed (m/s, 0 still) and width (m); a lake's (0, how much of the tide it feels)
  uniform float uTide; // the sea's rise above its mean here, m
  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec2 vFlow;
  void main() {
    vUv = uv;
    vFlow = flow;
    vec4 w = modelMatrix * vec4(position, 1.0);
    // Lifted a little off the land, more with distance, so the facets don't show through.
    w.y += 1.2 + 0.0004 * length(w.xz - cameraPosition.xz);
    if (flow.x <= 0.0) w.y += uTide * flow.y; // a lake's tide
    vWorld = w.xyz;
    vec4 mvPosition = viewMatrix * curveWorld(w);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime, uDay;
  uniform vec3 uSunDir, uSunColor, uSky, uDeep, uShallow;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec2 vFlow;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = vWorld.xz;
    float far = smoothstep(800.0, 6000.0, length(p - cameraPosition.xz));
    // Ripples: two small wave trains, faded out with distance before they can shimmer.
    vec2 g = (1.0 - far) * (0.18 * cos(dot(p, vec2(0.21, 0.13)) - uTime * 1.7) * vec2(0.21, 0.13) + 0.12 * cos(dot(p, vec2(-0.09, 0.31)) + uTime * 1.3) * vec2(-0.09, 0.31));
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 v = normalize(cameraPosition - vWorld);
    float diffuse = clamp(dot(n, uSunDir), 0.0, 1.0);
    diffuse = floor(diffuse * 4.0 + 0.5) / 4.0;
    vec3 col = mix(uDeep, uShallow, 0.35 + 0.65 * diffuse * uDay);
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
    col = mix(col, uSky, clamp(fres * 1.2, 0.0, 0.4)); // less than the sea: a thin river all sky would read as a road
    // A river's banks: a pale band of shallows along each edge (lakes carry 0.5 across, so none).
    col = mix(col, vec3(0.75, 0.95, 1.0), step(0.4, abs(vUv.y - 0.5)) * 0.35);
    // The current (11-16): pale streaks in lanes across the river, drifting downstream (uv.x is metres downstream), each
    // lane at its own phase and pace, spaced by the river's width so a great river's read from above as a small one's do.
    if (vFlow.x > 0.0) {
      float lanes = 9.0, across = vUv.y * lanes + 0.35 * sin(vUv.x * 0.031); // lanes that meander a little, not painted lines
      float lane = floor(across);
      float hsh = fract(sin(lane * 12.9898 + 4.1) * 43758.5453);
      float period = clamp(vFlow.y * 0.45, 12.0, 140.0) * (0.7 + 0.6 * hsh);
      float ph = fract((vUv.x - uTime * vFlow.x * (0.75 + 0.5 * hsh)) / period + hsh);
      float inLane = step(0.4, fract(across)) * step(fract(across), 0.6) * step(abs(vUv.y - 0.5), 0.36);
      col = mix(col, min(col * 1.25 + 0.06, vec3(1.0)), step(0.9, ph) * inLane * (1.0 - far));
    }
    vec3 r = reflect(-uSunDir, n);
    col += uSunColor * step(0.4, pow(clamp(dot(r, v), 0.0, 1.0), 90.0)) * uDay * (1.0 - far);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }`;

const uniforms = THREE.UniformsUtils.merge([
  THREE.UniformsLib.fog,
  {
    uTime: { value: 0 }, uDay: { value: 1 }, uTide: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(0xfff1c8) },
    uSky: { value: new THREE.Color(0xff9ec7) }, uDeep: { value: new THREE.Color(0x184f96) }, uShallow: { value: new THREE.Color(0x52e2ff) },
  },
]);
uniforms.uCurve = curveUniform; // shared, not cloned
const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true, side: THREE.DoubleSide });

/** Each frame, with the sea's: t seconds, sunDir a local unit vector, day 0..1, sky the horizon colour. */
export function updateInland(t, sunDir, day, sky, tide = 0) {
  uniforms.uTide.value = tide;
  uniforms.uTime.value = t;
  uniforms.uSunDir.value.set(sunDir.x, Math.max(-0.2, sunDir.y), sunDir.z).normalize();
  uniforms.uDay.value = day;
  uniforms.uSky.value.copy(sky);
}

const boxOf = (m) => ({ minX: -m, maxX: m, minZ: -m, maxZ: m });
const inBox = (p, b) => p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minZ && p[1] <= b.maxZ;

/** The runs of a polyline that lie in a box (a segment with either end inside is kept whole). */
function clipRuns(pts, b) {
  const runs = [];
  let run = [];
  for (let k = 0; k < pts.length; k++) {
    const inside = inBox(pts[k], b) || (k > 0 && inBox(pts[k - 1], b)) || (k + 1 < pts.length && inBox(pts[k + 1], b));
    if (inside) run.push(pts[k]);
    else if (run.length) { if (run.length > 1) runs.push(run); run = []; }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/**
 * The rivers and lakes round a world's middle, from the loaded tiles: { group, wadingAt(x, z, y), stats }. wadingAt says
 * which water a creature at local (x, z), its feet at y, is standing in: { kind: "river" | "lake", name, reservoir }.
 */
export function buildInland(frame, terrain) {
  const near = boxOf(NEAR_M), far = boxOf(FAR_M);
  const local = (ll) => { const p = frame.toLocal(ll[1], ll[0]); return [p.x, p.z]; };
  const center = frame.toLatLon(0, 0);
  const keys = listed ? waterTilesNear(center.lat, center.lon, FAR_M + 20000, listed) : [];
  const pos = [], uv = [], idx = [], flow = [];
  // Appended a value at a time: a great lake (Victoria) has more vertices than push(...spread) can take as arguments.
  const append = (to, from) => { for (let k = 0; k < from.length; k++) to.push(from[k]); };
  const add = (m) => { const base = pos.length / 3; append(pos, m.pos); append(uv, m.uv); if (m.flow) append(flow, m.flow); else for (let k = 0; k < m.uv.length; k++) flow.push(0); for (const i of m.idx) idx.push(base + i); };
  const rivers = [], lakes = [], seen = new Set();
  const cover = boxOf(FAR_M + 300000); // inside the terrain's rings (±470 km), where heightAt knows the ground
  let riverCount = 0, flowing = 0, still = 0;

  for (const key of keys) {
    const t = tiles.get(key);
    if (!t) continue;
    for (const r of t.rivers) {
      const b = r.rank <= BIG_RANK ? far : near;
      let pts = r.pts.map(local);
      if (!clipRuns(pts, b).length) continue;
      const width = riverWidth(r.rank);
      // Which way it runs: the ground along the whole line (where the terrain reaches), then turned so it runs as drawn.
      const inside = pts.filter((p) => inBox(p, cover));
      let len = 0;
      for (let k = 1; k < inside.length; k++) len += Math.hypot(inside[k][0] - inside[k - 1][0], inside[k][1] - inside[k - 1][1]);
      const sample = inside.length > 1 ? densify(inside, Math.max(500, len / 600)) : inside; // at most ~600 heights a river
      const sign = sample.length > 1 ? flowSign(sample.map((p) => terrain.heightAt(p[0], p[1]))) : 0;
      if (sign < 0) pts = pts.slice().reverse();
      const speed = sign ? flowSpeed(r.rank) : 0;
      for (const run of clipRuns(pts, b)) {
        const line = densify(run, Math.max(120, width));
        const m = ribbon(line, width, terrain.heightAt, 1, speed);
        if (!m.idx.length) continue;
        add(m);
        riverCount++;
        if (speed) flowing++; else still++;
        if (run.some((p) => inBox(p, near))) rivers.push({ name: r.name, rank: r.rank, width, line, flows: !!sign, speed });
      }
    }
    for (const l of t.lakes) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      for (const poly of lakePolygons(l.rings)) {
        const outer = poly.outer.map(local), holes = poly.holes.map((h) => h.map(local));
        const xs = outer.map((p) => p[0]), zs = outer.map((p) => p[1]);
        if (Math.max(...xs) < far.minX || Math.min(...xs) > far.maxX || Math.max(...zs) < far.minZ || Math.min(...zs) > far.maxZ) continue;
        // The water's height: low round the shore, from the shore points near enough to have terrain under them.
        const shore = densify([...outer, outer[0]], 400).filter((p) => inBox(p, boxOf(FAR_M + 30000)));
        const level = lakeLevel(shore.map((p) => terrain.heightAt(p[0], p[1])));
        if (level === null || level <= 1) continue; // at the sea's height, the sea already covers it
        const tri = THREE.ShapeUtils.triangulateShape(outer.map((p) => new THREE.Vector2(p[0], p[1])), holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1]))));
        const all = [outer, ...holes].flat();
        const parts = subdivide(tri.map(([a, b, c]) => [all[a], all[b], all[c]]), 6000, far);
        if (!parts.length) continue;
        const share = lakeTideShare(Math.abs(signedArea(outer)) / 1e6 - holes.reduce((s, h) => s + Math.abs(signedArea(h)) / 1e6, 0));
        const m = { pos: [], uv: [], idx: [], flow: [] };
        for (const t3 of parts) for (const p of t3) { m.idx.push(m.pos.length / 3); m.pos.push(p[0], level, p[1]); m.uv.push(0, 0.5); m.flow.push(0, share); }
        add(m);
        const xs2 = outer.map((p) => p[0]), zs2 = outer.map((p) => p[1]);
        lakes.push({ name: l.name, reservoir: l.kind === 1, level, share, outer, holes, box: { minX: Math.min(...xs2), maxX: Math.max(...xs2), minZ: Math.min(...zs2), maxZ: Math.max(...zs2) } });
      }
    }
  }

  const group = new THREE.Group();
  if (idx.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("flow", new THREE.Float32BufferAttribute(flow, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false; // curvature moves vertices after culling would have run
    mesh.userData.sharedMaterial = true;
    group.add(mesh);
  }

  // The near rivers' segments, bucketed by kilometre square, so asking "is this wet?" for every plant stays cheap.
  const buckets = new Map(), B = 1000;
  for (const r of rivers)
    for (let k = 1; k < r.line.length; k++) {
      const a = r.line[k - 1], b = r.line[k], pad = r.width / 2 + 4, seg = { r, pts: [a, b] };
      for (let i = Math.floor((Math.min(a[0], b[0]) - pad) / B); i <= Math.floor((Math.max(a[0], b[0]) + pad) / B); i++)
        for (let j = Math.floor((Math.min(a[1], b[1]) - pad) / B); j <= Math.floor((Math.max(a[1], b[1]) + pad) / B); j++) {
          const key = i * 100000 + j;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(seg);
        }
    }
  const lakeAt = (x, z) => lakes.find((l) => x >= l.box.minX && x <= l.box.maxX && z >= l.box.minZ && z <= l.box.maxZ && inRing(x, z, l.outer) && !l.holes.some((h) => inRing(x, z, h))) ?? null;
  const segAt = (x, z, margin) => (buckets.get(Math.floor(x / B) * 100000 + Math.floor(z / B)) ?? []).find((s) => distToLine(x, z, s.pts) < s.r.width / 2 + margin) ?? null;
  const riverAt = (x, z, margin) => segAt(x, z, margin)?.r ?? null;

  function wadingAt(x, z, y) {
    const l = lakeAt(x, z);
    if (l && y < l.level + 4) return { kind: "lake", name: l.name, reservoir: l.reservoir, level: l.level, share: l.share };
    const s = segAt(x, z, 3);
    if (!s) return null;
    const [a, b] = s.pts; // downstream, a to b, where the river flows
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { kind: "river", name: s.r.name, toward: s.r.flows ? Math.round(bearingOf(b[0] - a[0], b[1] - a[1])) : null, flow: s.r.flows ? { x: (b[0] - a[0]) / L, z: (b[1] - a[1]) / L, speed: s.r.speed } : null };
  }
  /** Whether the ground at (x, z) is under a river or a lake (so nothing grows there). */
  function wet(x, z) {
    const l = lakeAt(x, z);
    if (l && terrain.heightAt(x, z) < l.level + 2) return true;
    return !!riverAt(x, z, 2);
  }
  /** The river you're in, to ride: { r (its name, rank, width, line downstream), k, t (segment k, t metres in) } or null. */
  function rideFrom(x, z, margin = 3) {
    const s = segAt(x, z, margin);
    if (!s || !s.r.flows) return null;
    const L = s.r.line, a = s.pts[0], k = L.indexOf(a);
    if (k < 0) return null;
    return { r: s.r, k, t: Math.min(Math.hypot(x - a[0], z - a[1]), Math.hypot(s.pts[1][0] - a[0], s.pts[1][1] - a[1])) };
  }
  /** The river a ride flows on into from (x, z), the end of the last: a flowing line starting within 400 m, the same name first. */
  function riverOnFrom(x, z, name, not) {
    let best = null, bestD = 400;
    for (const r of rivers) {
      if (r === not || !r.flows) continue;
      const d = Math.hypot(r.line[0][0] - x, r.line[0][1] - z) - (r.name === name ? 150 : 0);
      if (d < bestD) { best = r; bestD = d; }
    }
    return best;
  }
  return { group, wadingAt, wet, lakeAt, rideFrom, riverOnFrom, stats: { rivers: riverCount, flowing, still, lakes: lakes.length, triangles: idx.length / 3 } };
}
