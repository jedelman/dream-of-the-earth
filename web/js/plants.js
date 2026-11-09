// Plants in the world: one instanced mesh per species shape (and one per
// species far away), placed on the global cell grid by biome, swaying in the
// wind. Trees and shrubs on 40 m cells out to ~3 km; grass and moss on 10 m
// cells close in.
import * as THREE from "three";
import { SPECIES, SPECIES_NAMES, VARIANTS, plantForm, midShape, lodFor, cellsAround, choosePlant, unit } from "./plantforms.js";
import { biomeFor, BIOMES } from "./biome.js";
import { koppenAt } from "./koppen.js";
import { curved } from "./curvature.js";
import { breathUniforms } from "./breath.js";

const LAYERS = [
  { cell: 40, radius: Math.max(...SPECIES_NAMES.map((n) => SPECIES[n].far)), salt: 101, pick: (b) => [b.density, b.plants] },
  { cell: 10, radius: 220, salt: 202, pick: (b) => [b.cover, b.ground] },
];
const REGROW_M = 200; // replant once you've moved this far
const RETIER_M = 60; // re-sort near and far once the camera has moved this far
const SWAY = { ceiba: 0.008, ficus: 0.01, cocos: 0.05, adansonia: 0.004, vachellia: 0.015, carnegiea: 0, quercus: 0.014, cupressus: 0.02, sequoiadendron: 0.006, picea: 0.015, shrub: 0.04, grass: 0.12, moss: 0 };
// Bark, pushed toward the dream: grey-green kapok, pale fig, pink baobab, cinnamon sequoia.
const WOOD = { ceiba: 0x8f9a7a, ficus: 0x9a8a8a, cocos: 0x9a7350, adansonia: 0xc79a9a, vachellia: 0x4a3040, quercus: 0x5a3550, cupressus: 0x5a3a30, sequoiadendron: 0xb0482e, picea: 0x4a3040, default: 0x5a3550 };

// Foliage colour relative to the biome's ground: a hue shift, a saturation and
// a lightness, so every biome keeps its own palette and the plants still read.
const TINT = {
  ceiba: [0.02, 0.7, 0.32], ficus: [-0.03, 0.75, 0.3], cocos: [-0.07, 0.8, 0.42], adansonia: [-0.05, 0.6, 0.38],
  vachellia: [-0.03, 0.55, 0.3], carnegiea: [null, 0.45, 0.38], quercus: [-0.01, 0.65, 0.3], cupressus: [0.03, 0.55, 0.24],
  sequoiadendron: [0.05, 0.55, 0.26], picea: [0.08, 0.6, 0.24], shrub: [0.05, 0.65, 0.33], grass: [-0.03, 0.85, 0.6], moss: [-0.06, 0.65, 0.56],
};
const BLOSSOM_HUES = [0.92, 0.04, 0.13, 0.8, 0.55];
const BLOOMS = new Set(["ceiba", "shrub", "carnegiea", "quercus"]);

/** Orient a triangle to face away from a reference point, and push it. */
function pushTri(out, p, q, r, ref, col, wood) {
  const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const c = [(p[0] + q[0] + r[0]) / 3 - ref[0], (p[1] + q[1] + r[1]) / 3 - ref[1], (p[2] + q[2] + r[2]) / 3 - ref[2]];
  const tri = n[0] * c[0] + n[1] * c[1] + n[2] * c[2] >= 0 ? [p, q, r] : [p, r, q];
  for (const x of tri) { out.pos.push(...x); out.col.push(...col); out.wood.push(wood); }
}

/** The geometry of one plant shape (unit height), with an aWood attribute. */
export function formGeometry(form, woodHex) {
  const out = { pos: [], col: [], wood: [] };
  const wc = new THREE.Color(woodHex), woodCol = [wc.r, wc.g, wc.b], leaf = [1, 1, 1];
  for (const s of form.segments) {
    const ax = s.b.map((x, i) => x - s.a[i]), len = Math.hypot(...ax) || 1, n = ax.map((x) => x / len);
    const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
    const ul = Math.hypot(...u); u = u.map((x) => x / ul);
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const n_ = s.sides || 3;
    const ring = (p, r) => Array.from({ length: n_ }, (_, k) => { const t = (k / n_) * Math.PI * 2; return [0, 1, 2].map((i) => p[i] + r * (Math.cos(t) * u[i] + Math.sin(t) * v[i])); });
    const ra = ring(s.a, Math.max(0.008, s.r0)), rb = ring(s.b, Math.max(0.006, s.r1));
    const mid = s.a.map((x, i) => (x + s.b[i]) / 2);
    const col = s.wood ? woodCol : leaf, w = s.wood ? 1 : 0;
    for (let k = 0; k < n_; k++) {
      const k2 = (k + 1) % n_;
      pushTri(out, ra[k], rb[k], ra[k2], mid, col, w);
      pushTri(out, ra[k2], rb[k], rb[k2], mid, col, w);
    }
  }
  for (const l of form.leaves) {
    // A flat diamond along the segment: two triangles, seen from both sides.
    const ax = l.b.map((x, i) => x - l.a[i]);
    const side = [ax[2], 0, -ax[0]], sl = Math.hypot(...side) || 1;
    const half = (l.w * Math.hypot(...ax)) / sl;
    const m = l.a.map((x, i) => x + ax[i] * 0.45);
    const e1 = m.map((x, i) => x + side[i] * half), e2 = m.map((x, i) => x - side[i] * half);
    for (const p of [l.a, e1, l.b, l.a, l.b, e2]) { out.pos.push(...p); out.col.push(0.95, 1.05, 0.95); out.wood.push(0); }
  }
  // Crowns: n-sided bipyramids (4 sides is an octahedron), squashed by sy.
  form.bulbs.forEach((b, bi) => {
    const n_ = b.sides || 4, yaw = bi * 0.7;
    const shade = 0.9 + 0.12 * ((bi * 37) % 5) / 4, sh = [shade, shade, shade];
    const ring = Array.from({ length: n_ }, (_, k) => { const t = yaw + (k / n_) * Math.PI * 2; return [b.p[0] + Math.cos(t) * b.r, b.p[1], b.p[2] + Math.sin(t) * b.r]; });
    const topV = [b.p[0], b.p[1] + b.r * b.sy, b.p[2]], botV = [b.p[0], b.p[1] - b.r * b.sy, b.p[2]];
    const start = out.pos.length / 3;
    for (let k = 0; k < n_; k++) {
      const q = ring[k], r = ring[(k + 1) % n_];
      pushTri(out, q, r, topV, b.p, sh, 0);
      pushTri(out, q, r, botV, b.p, sh, 0);
    }
    // Sunlit on top, darker underneath: the yellow-green highlights of a real canopy.
    for (let k = start; k < out.pos.length / 3; k++) {
      const y = out.pos[k * 3 + 1];
      const f = y === topV[1] ? 1.22 : y === botV[1] ? 0.72 : 1;
      if (f !== 1) out.col.splice(k * 3, 3, shade * f, shade * f, shade * (f > 1 ? 0.95 * f : f));
    }
  });
  for (const c of form.cones) {
    const n_ = c.sides || 5, cx = c.cx || 0, cz = c.cz || 0;
    const ring = Array.from({ length: n_ }, (_, k) => { const t = (k / n_) * Math.PI * 2 + c.y0 * 3; return [cx + Math.cos(t) * c.r, c.y0, cz + Math.sin(t) * c.r]; });
    const apex = [cx, c.y1, cz], centre = [cx, c.y0, cz], inside = [cx, (c.y0 + c.y1) / 2 - (c.y1 - c.y0) * 0.2, cz];
    for (let k = 0; k < n_; k++) {
      const k2 = (k + 1) % n_;
      pushTri(out, ring[k], ring[k2], apex, inside, leaf, 0);
      pushTri(out, ring[k], ring[k2], centre, [cx, c.y1, cz], [0.75, 0.75, 0.75], 0);
    }
  }
  // Buttress fins: thin wooden walls from the trunk to the ground, front and back.
  for (const f of form.fins) {
    for (const tri of [[f.a, f.b, f.c], [f.a, f.c, f.b]]) for (const p of tri) { out.pos.push(...p); out.col.push(...woodCol); out.wood.push(1); }
  }
  for (const b of form.blades) {
    const dir = [b.tip[0] - b.base[0], 0, b.tip[2] - b.base[2]], dl = Math.hypot(dir[0], dir[2]) || 1;
    const side = [-dir[2] / dl * b.w, 0, dir[0] / dl * b.w];
    // Front and back, so a blade can be lit like the ground it grows from.
    const l = [b.base[0] + side[0], 0, b.base[2] + side[2]], r = [b.base[0] - side[0], 0, b.base[2] - side[2]];
    out.pos.push(...l, ...r, ...b.tip, ...r, ...l, ...b.tip);
    for (let k = 0; k < 2; k++) out.col.push(0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 1.25, 1.25, 1.15);
    out.wood.push(0, 0, 0, 0, 0, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(out.col, 3));
  geo.setAttribute("aWood", new THREE.Float32BufferAttribute(out.wood, 1));
  geo.computeVertexNormals();
  if (form.blades.length) {
    // Grass faces the sky: lit like the ground, not like a wall.
    const n = geo.attributes.normal;
    for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
  }
  return geo;
}

/** The far shape: six triangles, crown above and tapering to the trunk's foot. */
export function midGeometry(form, woodHex) {
  const { ringY, r, top, cx, cz, bottom, sides } = midShape(form);
  const out = { pos: [], col: [], wood: [] };
  const wc = new THREE.Color(woodHex), hasWood = form.segments.some((s) => s.wood);
  const ring = Array.from({ length: sides }, (_, k) => { const t = (k / sides) * Math.PI * 2 + 0.5; return [cx + Math.cos(t) * r, ringY, cz + Math.sin(t) * r]; });
  // A spindle's foot is the trunk's base on the ground; a dome's is the crown's underside.
  const apex = [cx, top, cz], foot = bottom > 0 ? [cx, bottom, cz] : [0, 0, 0], mid = [cx, ringY, cz];
  const lit = [1.15, 1.15, 1.05], side = [0.95, 0.95, 0.95], under = [0.8, 0.8, 0.8];
  for (let k = 0; k < sides; k++) {
    const a = ring[k], b = ring[(k + 1) % sides];
    pushTri(out, a, b, apex, mid, side, 0);
    pushTri(out, a, b, foot, mid, side, 0);
  }
  // Sunlit tops; a spindle's foot takes the trunk colour, so its lower faces fade from leaves to wood.
  for (let k = 0; k < out.pos.length / 3; k++) {
    const y = out.pos[k * 3 + 1];
    if (y === top) out.col.splice(k * 3, 3, ...lit);
    else if (y === foot[1] && out.pos[k * 3] === foot[0] && out.pos[k * 3 + 2] === foot[2]) {
      if (bottom === 0 && hasWood) { out.col.splice(k * 3, 3, wc.r, wc.g, wc.b); out.wood[k] = 1; }
      else out.col.splice(k * 3, 3, ...under);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(out.col, 3));
  geo.setAttribute("aWood", new THREE.Float32BufferAttribute(out.wood, 1));
  geo.computeVertexNormals();
  // Far off, a crown's underside facing the ground read as a black triangle
  // floating in the haze. Light the lower faces mostly from above instead.
  const nrm = geo.attributes.normal;
  for (let k = 0; k < nrm.count; k++) {
    if (nrm.getY(k) >= 0) continue;
    const v = new THREE.Vector3(nrm.getX(k) * 0.35, 1, nrm.getZ(k) * 0.35).normalize();
    nrm.setXYZ(k, v.x, v.y, v.z);
  }
  return geo;
}

/** A plant material: Lambert, flat, curved with the Earth, swaying from the top. */
// One tree at a time can be shaken: where (frame x, z), when (time), and how hard.
const shake = { value: new THREE.Vector4(0, 0, -100, 0) };

function plantMaterial(species, form, time, far = false) {
  const twoSided = form.leaves.length > 0, grass = form.blades.length > 0;
  // Grass and far shapes carry their own normals; everything else is faceted.
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !grass && !far, side: twoSided ? THREE.DoubleSide : THREE.FrontSide });
  const sway = { value: SWAY[species] };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uSway = sway;
    shader.uniforms.uShake = shake;
    shader.uniforms.uBreathPlant = breathUniforms.uBreathPlant;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aWood;\nuniform float uTime;\nuniform float uSway;\nuniform vec4 uShake;\nuniform float uBreathPlant;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = dot(instanceMatrix[3].xz, vec2(0.013, 0.017));
        #else
          float ph = 0.0;
        #endif
        // Plants breathe, slower and less than animals: the crown swells and settles, out of step with its neighbours.
        float br = sin(uTime * 1.05 + ph * 5.0) * uBreathPlant, crown = smoothstep(0.25, 1.0, position.y);
        transformed.xz *= 1.0 + 0.03 * br * crown;
        transformed.y *= 1.0 + 0.012 * br;
        // The wind bends a plant more the higher up you go.
        float bend = position.y * position.y * uSway;
        transformed.x += bend * (sin(uTime * 1.1 + ph) + 0.4 * sin(uTime * 2.7 + ph * 1.9));
        transformed.z += bend * 0.6 * cos(uTime * 0.9 + ph * 1.3);
        #ifdef USE_INSTANCING
          // A shaken tree: a quick, dying wobble, strongest at the top.
          float age = uTime - uShake.z;
          if (age > 0.0 && age < 3.0 && distance(instanceMatrix[3].xz, uShake.xy) < 1.5) {
            float k = uShake.w * exp(-age * 2.0) * sin(age * 24.0) * position.y;
            transformed.x += k;
            transformed.z += k * 0.7 * cos(age * 17.0);
          }
        #endif`)
      .replace("#include <color_vertex>", `#include <color_vertex>
        // Wood keeps its own colour; leaves take the plant's.
        #ifdef USE_COLOR
          vColor.rgb = mix(vColor.rgb, color.rgb, aWood);
        #endif`);
  };
  return curved(mat, `-plant${twoSided ? "2" : grass ? "g" : far ? "f" : "1"}`);
}

// The shapes and materials are the same everywhere: build them once.
let kit = null;
export function plantKit() {
  if (kit) return kit;
  const time = { value: 0 };
  const shapes = [];
  for (const species of SPECIES_NAMES) {
    const wood = WOOD[species] ?? WOOD.default;
    for (let v = 0; v < VARIANTS; v++) {
      const form = plantForm(species, v);
      shapes.push({ key: `${species}:${v}`, species, form, geo: formGeometry(form, wood), mat: plantMaterial(species, form, time) });
    }
    const sp = SPECIES[species];
    if (sp.blades || sp.mounds) continue; // grass and moss have no far shape
    const form = plantForm(species, 0);
    shapes.push({ key: `${species}:mid`, species, form, geo: midGeometry(form, wood), mat: plantMaterial(species, { blades: [], leaves: [] }, time, true) });
  }
  kit = { time, shapes };
  return kit;
}

/** Sets the foliage colour of one plant; returns BLOSSOM when it is in flower. */
const BLOSSOM = "blossom";
function foliage(c, biome, species, h) {
  const g = new THREE.Color(BIOMES[biome].color).getHSL({});
  if (BLOOMS.has(species) && BIOMES[biome].fireflies && unit(h, 3) < 0.03) {
    c.setHSL(BLOSSOM_HUES[h % BLOSSOM_HUES.length], 0.85, 0.62);
    return BLOSSOM;
  }
  const [dh, s, l] = TINT[species];
  const hue = dh === null ? 0.4 : g.h + dh;
  // Many greens: each tree its own shade, from deep to yellow-green.
  return c.setHSL((hue + (unit(h, 5) - 0.5) * 0.11 + 1) % 1, Math.min(1, s * (0.85 + 0.3 * unit(h, 7))), l + (unit(h, 11) - 0.5) * 0.13);
}

/**
 * The plants of a world frame. update(x, z, t, camera) replants around the
 * creature when it has moved far enough (remembering cells it has already
 * worked out), re-sorts near and far shapes as the camera moves, and sways
 * them all.
 */
export function buildPlants(frame, terrain) {
  const { time, shapes } = plantKit();
  const group = new THREE.Group();
  const meshes = new Map(); // "species:v" or "species:mid" -> InstancedMesh
  const makeMesh = (s, cap) => {
    const m = new THREE.InstancedMesh(s.geo, s.mat, cap);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.count = 0;
    m.frustumCulled = false; // spread over kilometres, and curved after culling
    m.userData.sharedGeometry = true;
    m.userData.shape = s;
    return m;
  };
  for (const s of shapes) { const m = makeMesh(s, 256); meshes.set(s.key, m); group.add(m); }
  // Room for n instances, doubling as needed.
  const room = (key, n) => {
    const m = meshes.get(key);
    if (n <= m.instanceMatrix.count) return m;
    let cap = m.instanceMatrix.count;
    while (cap < n) cap *= 2;
    const next = makeMesh(m.userData.shape, cap);
    group.remove(m); m.dispose(); group.add(next); meshes.set(key, next);
    return next;
  };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let cells = new Map(); // "salt:i:j" -> a plant, or null
  let live = []; // the plants in range: { x, y, z, species, variant, m: Float32Array(16), c: [r, g, b], d }
  let centre = null, eye = null, placed = 0;

  // What grows on one cell, worked out once per world.
  function grow(cell, layer) {
    const p = frame.toLocal(cell.lat, cell.lon);
    const h = terrain.heightAt(p.x, p.z);
    if (h < 3) return null; // the sea, and the tideline
    const biome = biomeFor(koppenAt(cell.lat, cell.lon), terrain.reliefAt(p.x, p.z), cell.lat, h);
    const [density, table] = layer.pick(BIOMES[biome]);
    const c = choosePlant(cell.h, density, table);
    if (!c) return null;
    // Nothing grows on the bare-rock faces.
    const slope = Math.max(Math.abs(terrain.heightAt(p.x + 6, p.z) - terrain.heightAt(p.x - 6, p.z)), Math.abs(terrain.heightAt(p.x, p.z + 6) - terrain.heightAt(p.x, p.z - 6))) / 12;
    if (slope > 0.45) return null;
    const y = h - c.height * 0.03;
    pos.set(p.x, y, p.z);
    q.setFromAxisAngle(up, c.yaw);
    scl.set(c.height * c.squash, c.height, c.height * (2 - c.squash));
    const blossom = foliage(col, biome, c.species, cell.h) === BLOSSOM;
    return { x: p.x, y, z: p.z, species: c.species, variant: c.variant, height: c.height, seed: cell.h, blossom, m: Float32Array.from(m4.compose(pos, q, scl).elements), c: [col.r, col.g, col.b], d: 0 };
  }

  function plant(x, z) {
    const ll = frame.toLatLon(x, z);
    const next = new Map();
    live = [];
    for (const layer of LAYERS) {
      for (const cell of cellsAround(ll.lat, ll.lon, layer.radius, layer.cell, layer.salt)) {
        const key = `${layer.salt}:${cell.i}:${cell.j}`;
        let rec = cells.get(key);
        if (rec === undefined) rec = grow(cell, layer);
        next.set(key, rec);
        if (!rec) continue;
        rec.d = Math.hypot(rec.x - x, rec.z - z);
        if (rec.d <= SPECIES[rec.species].far) live.push(rec);
      }
    }
    cells = next; // forget what's out of range
    centre = { x, z };
  }

  // Sort the plants in range into near and far shapes by distance from the camera.
  function tier(cam, scale) {
    const lists = new Map(), camHeight = cam.y - Math.max(0, terrain.heightAt(cam.x, cam.z));
    for (const rec of live) {
      const lod = lodFor(rec.species, rec.d, Math.hypot(rec.x - cam.x, rec.y - cam.y, rec.z - cam.z), scale, rec.height, camHeight);
      if (!lod) continue;
      const key = lod === "mid" ? `${rec.species}:mid` : `${rec.species}:${rec.variant}`;
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key).push(rec);
    }
    placed = 0;
    for (const key of [...meshes.keys()]) {
      const list = lists.get(key) || [];
      const m = room(key, list.length);
      list.forEach((rec, k) => { m.instanceMatrix.array.set(rec.m, k * 16); m.instanceColor.array.set(rec.c, k * 3); });
      m.count = list.length;
      m.instanceMatrix.needsUpdate = true;
      m.userData.recs = list; // instance k is list[k], for picking
      m.boundingSphere = null; // the instances moved: let three.js recompute it
      m.instanceColor.needsUpdate = true;
      placed += list.length;
    }
    eye = { x: cam.x, y: cam.y, z: cam.z, scale };
  }

  return {
    group,
    /** cam: the camera position; scale: the detail governor's reach (0..1). */
    update(x, z, t, cam, scale = 1) {
      time.value = t;
      let moved = false;
      if (!centre || Math.hypot(x - centre.x, z - centre.z) > REGROW_M) { plant(x, z); moved = true; }
      if (moved || !eye || eye.scale !== scale || Math.hypot(cam.x - eye.x, cam.y - eye.y, cam.z - eye.z) > RETIER_M) tier(cam, scale);
      return placed;
    },
    get count() { return placed; },
    /** The plants (not grass or moss) within r metres of (x, z), as records. */
    near(x, z, r) {
      const out = [];
      for (const rec of live) if (rec.species !== "grass" && rec.species !== "moss" && Math.abs(rec.x - x) < r && Math.abs(rec.z - z) < r && Math.hypot(rec.x - x, rec.z - z) < r) out.push(rec);
      return out;
    },
    /** The plant a ray hits first: { distance, rec } or null. */
    pick(raycaster) {
      const hits = raycaster.intersectObjects([...meshes.values()].filter((m) => m.count > 0), false);
      for (const h of hits) {
        const rec = h.object.userData.recs?.[h.instanceId];
        if (rec && rec.species !== "grass" && rec.species !== "moss") return { distance: h.distance, rec }; // a tap on grass means "go there"
      }
      return null;
    },
    /** Shake the plant at a record; t is the plants' clock (the one update() is given). */
    shake(rec, t, strength = 0.06) { shake.value.set(rec.x, rec.z, t, strength); },
    /** Triangles drawn, near and far. */
    triangles() {
      let near = 0, far = 0;
      for (const [key, m] of meshes) { const n = m.count * m.geometry.attributes.position.count / 3; if (key.endsWith(":mid")) far += n; else near += n; }
      return { near, far };
    },
  };
}
