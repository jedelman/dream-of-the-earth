// Faceted terrain and seafloor from terrarium elevation tiles (AWS Open Data),
// out to the horizon. Three nested rings: zoom 11 around you, zoom 9 beyond,
// zoom 7 to the edge of sight. Coarse on purpose: elevation is cut into big
// flat-shaded facets, so the data's limits read as the look.
import * as THREE from "three";
import { terrariumHeight, lonLatToTile, tileToLonLat } from "./geo.js";
import { curved } from "./curvature.js";
import { biomeFor, BIOMES } from "./biome.js";
import { koppenAt, ensureKoppen } from "./koppen.js";

const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
export const ZOOM = 11; // the near ring: ~19.6 km tiles at the equator
const SPAN = 3; // 3×3 tiles per ring

// Rings, near to far. Open-ocean tiles at zoom 11 are flat zero (checked 11-07
// off Chile: 11/587/1214 is all 0, while zooms 7-10 there carry the seafloor),
// so every ring fills exact zeros from the zoom below it.
const RINGS = [
  { zoom: 11, cells: 64, smooth: 4 }, // ±29 km, ~900 m facets; relief against ~4 km around
  { zoom: 9, cells: 48, smooth: 1 }, // ±117 km, ~5 km facets
  { zoom: 7, cells: 48, smooth: 0 }, // ±470 km, ~20 km facets
];

// Decoded tiles, kept so regrowing every 15 km doesn't redo the far rings.
const tileCache = new Map();
const CACHE_MAX = 160;

export async function fetchDecoded(z, x, y) {
  const n = 2 ** z;
  const xx = ((x % n) + n) % n;
  if (y < 0 || y >= n) return null;
  const key = `${z}/${xx}/${y}`;
  if (tileCache.has(key)) {
    const hit = tileCache.get(key);
    tileCache.delete(key);
    tileCache.set(key, hit); // most recently used last
    return hit;
  }
  const res = await fetch(TILE_URL(z, xx, y), { mode: "cors" });
  if (!res.ok) throw new Error(`tile ${key}: ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const out = new Float32Array(256 * 256);
  for (let k = 0; k < out.length; k++) out[k] = terrariumHeight(px[k * 4], px[k * 4 + 1], px[k * 4 + 2]);
  tileCache.set(key, out);
  while (tileCache.size > CACHE_MAX) tileCache.delete(tileCache.keys().next().value);
  return out;
}

// The palette: the temperature ladder, pushed toward psychedelia. Land colours
// by biome; the seafloor by depth.
const SAND = 0xffd98a, ROCK = 0xb05fa8;
const seafloorColor = (c, depth) => c.setHSL(0.62 + Math.min(depth / 6000, 1) * 0.15, 0.75, 0.42 - Math.min(depth / 6000, 1) * 0.3);

/**
 * The ground's colour: seafloor by depth, beaches, bare rock where steep, and
 * otherwise the biome (Köppen class, climbed by relief). Shared with the globe.
 */
export function groundColor(c, lat, lon, h, reliefM = 0, steep = false) {
  if (h < 0) return seafloorColor(c, -h);
  const biome = biomeFor(koppenAt(lat, lon), reliefM, lat, h);
  if (h < 12 && biome !== "ice") return c.setHex(SAND);
  if (steep && biome !== "ice") return c.setHex(ROCK);
  return c.setHex(BIOMES[biome].color);
}

/** One ring: its height grid, its mesh (minus a hole for the ring inside it), and a heightAt. */
async function buildRing(frame, lat, lon, { zoom, cells, smooth }, hole) {
  const t = lonLatToTile(lon, lat, zoom);
  const x0 = Math.floor(t.x) - 1, y0 = Math.floor(t.y) - 1;
  const size = 256 * SPAN;
  const heights = new Float32Array(size * size);
  let failed = 0;
  await Promise.all(
    Array.from({ length: SPAN * SPAN }, (_, i) => {
      const tx = i % SPAN, ty = Math.floor(i / SPAN);
      return fetchDecoded(zoom, x0 + tx, y0 + ty)
        .then((h) => {
          if (!h) return;
          for (let py = 0; py < 256; py++) heights.set(h.subarray(py * 256, py * 256 + 256), (ty * 256 + py) * size + tx * 256);
        })
        .catch(() => { failed++; });
    }),
  );

  // Fill exact zeros (open ocean, or a tile that failed) from the zoom below.
  const parents = new Map();
  const px0 = Math.floor(x0 / 2), py0 = Math.floor(y0 / 2), px1 = Math.floor((x0 + SPAN - 1) / 2), py1 = Math.floor((y0 + SPAN - 1) / 2);
  await Promise.all(
    [...Array((px1 - px0 + 1) * (py1 - py0 + 1)).keys()].map((i) => {
      const tx = px0 + (i % (px1 - px0 + 1)), ty = py0 + Math.floor(i / (px1 - px0 + 1));
      return fetchDecoded(zoom - 1, tx, ty).then((h) => { if (h) parents.set(`${tx},${ty}`, h); }).catch(() => {});
    }),
  );
  for (let gy = 0; gy < size; gy++)
    for (let gx = 0; gx < size; gx++) {
      const k = gy * size + gx;
      if (heights[k] !== 0) continue;
      const X = (x0 * 256 + gx) / 2, Y = (y0 * 256 + gy) / 2;
      const tile = parents.get(`${Math.floor(X / 256)},${Math.floor(Y / 256)}`);
      if (tile) heights[k] = tile[Math.floor(Y % 256) * 256 + Math.floor(X % 256)];
    }

  // Sample a (cells+1)² grid: average a small block around each node.
  const N = cells + 1, step = size / cells;
  const grid = new Float32Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const cx = Math.min(size - 1, Math.round(i * step)), cy = Math.min(size - 1, Math.round(j * step));
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = cx + dx, yy = cy + dy;
          if (xx >= 0 && yy >= 0 && xx < size && yy < size) { s += heights[yy * size + xx]; n++; }
        }
      grid[j * N + i] = s / n;
    }

  // A smoothed copy of the grid: relief is how far ground stands above it.
  const smoothGrid = new Float32Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      let s = 0, n = 0;
      for (let dj = -smooth; dj <= smooth; dj++)
        for (let di = -smooth; di <= smooth; di++) {
          const ii = i + di, jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < N && jj < N) { s += grid[jj * N + ii]; n++; }
        }
      smoothGrid[j * N + i] = s / n;
    }

  const nodeLL = (i, j) => tileToLonLat(x0 + (i * step) / 256, y0 + (j * step) / 256, zoom);
  const pos = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const ll = nodeLL(i, j);
      const p = frame.toLocal(ll.lat, ll.lon);
      pos.set([p.x, grid[j * N + i], p.z], (j * N + i) * 3);
    }
  const v = (i, j) => { const k = (j * N + i) * 3; return [pos[k], pos[k + 1], pos[k + 2]]; };

  // Inside the hole (the inner ring's area) cells are skipped; near its edge
  // this ring sinks a little, so where the two overlap the inner one wins.
  const inside = (p, b, m = 0) => b && p[0] > b.minX + m && p[0] < b.maxX - m && p[2] > b.minZ + m && p[2] < b.maxZ - m;
  const cellSize = Math.abs(v(1, 0)[0] - v(0, 0)[0]) || 1;
  const sink = (p) => (hole && inside(p, hole, -cellSize * 1.5) ? [p[0], p[1] - 30, p[2]] : p);

  const verts = [], cols = [];
  const c = new THREE.Color();
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      const a = v(i, j), b = v(i + 1, j), d = v(i, j + 1), e = v(i + 1, j + 1);
      if (hole && [a, b, d, e].every((p) => inside(p, hole, cellSize * 0.25))) continue;
      for (const [p, q, r, alt] of [[a, d, b, 0], [b, d, e, 1]]) {
        const h = (p[1] + q[1] + r[1]) / 3;
        verts.push(...sink(p), ...sink(q), ...sink(r));
        const rise = Math.max(Math.abs(p[1] - q[1]), Math.abs(q[1] - r[1]), Math.abs(r[1] - p[1]));
        const run = Math.hypot(p[0] - r[0], p[2] - r[2]) || 1;
        const ll = nodeLL(i + 0.5, j + 0.5);
        const sm = (smoothGrid[j * N + i] + smoothGrid[j * N + i + 1] + smoothGrid[(j + 1) * N + i] + smoothGrid[(j + 1) * N + i + 1]) / 4;
        groundColor(c, ll.lat, ll.lon, h, h - sm, rise / run > 0.45);
        // Subtle, stable per-facet variation, hashed on the global grid.
        const gi = Math.round((x0 * 256) / step) + i, gj = Math.round((y0 * 256) / step) + j;
        const n = (((gi * 73856093) ^ (gj * 19349663) ^ (alt * 83492791) ^ (zoom * 2654435761)) >>> 0) / 4294967296;
        c.offsetHSL(0, 0, (n - 0.5) * 0.06);
        for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, curved(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  mesh.frustumCulled = false; // curvature moves vertices after culling would have run

  // Height of the facet under a local point (planar interpolation on the same
  // triangles the mesh draws), or null outside this ring.
  function heightAt(x, z) {
    const ll = frame.toLatLon(x, z);
    const tt = lonLatToTile(ll.lon, ll.lat, zoom);
    const gi = ((tt.x - x0) * 256) / step, gj = ((tt.y - y0) * 256) / step;
    if (!(gi >= 0 && gj >= 0 && gi < cells && gj < cells)) return null;
    const i = Math.floor(gi), j = Math.floor(gj), fx = gi - i, fy = gj - j;
    const h = (ii, jj) => grid[jj * N + ii];
    if (fx + fy < 1) return h(i, j) + fx * (h(i + 1, j) - h(i, j)) + fy * (h(i, j + 1) - h(i, j));
    return h(i + 1, j + 1) + (1 - fx) * (h(i, j + 1) - h(i + 1, j + 1)) + (1 - fy) * (h(i + 1, j) - h(i + 1, j + 1));
  }

  // The smoothed surroundings under a point (for relief), or null outside.
  function smoothAt(x, z) {
    const ll = frame.toLatLon(x, z);
    const tt = lonLatToTile(ll.lon, ll.lat, zoom);
    const gi = ((tt.x - x0) * 256) / step, gj = ((tt.y - y0) * 256) / step;
    if (!(gi >= 0 && gj >= 0 && gi < cells && gj < cells)) return null;
    const i = Math.floor(gi), j = Math.floor(gj), fx = gi - i, fy = gj - j;
    const h = (ii, jj) => smoothGrid[jj * N + ii];
    return (h(i, j) * (1 - fx) + h(i + 1, j) * fx) * (1 - fy) + (h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx) * fy;
  }

  const lo = v(0, 0), hi = v(cells, cells);
  return { mesh, heightAt, smoothAt, failed, bounds: { minX: lo[0], maxX: hi[0], minZ: lo[2], maxZ: hi[2] } };
}

/** A ring's local bounds, known before any tile is fetched. */
function ringBounds(frame, lat, lon, zoom) {
  const t = lonLatToTile(lon, lat, zoom);
  const x0 = Math.floor(t.x) - 1, y0 = Math.floor(t.y) - 1;
  const a = tileToLonLat(x0, y0, zoom), b = tileToLonLat(x0 + SPAN, y0 + SPAN, zoom);
  const p = frame.toLocal(a.lat, a.lon), q = frame.toLocal(b.lat, b.lon);
  return { minX: p.x, maxX: q.x, minZ: p.z, maxZ: q.z };
}

/**
 * The terrain around (lat, lon), out to the horizon. All rings load at once;
 * heightAt reads the finest ring that covers a point (sea level beyond them all).
 */
export async function buildTerrain(frame, lat, lon) {
  await ensureKoppen(lat, lon, 6); // the climate map under all three rings
  const rings = await Promise.all(
    RINGS.map((spec, k) => buildRing(frame, lat, lon, spec, k ? ringBounds(frame, lat, lon, RINGS[k - 1].zoom) : null)),
  );
  const mesh = new THREE.Group();
  for (const r of rings) mesh.add(r.mesh);
  function heightAt(x, z) {
    for (const r of rings) {
      const h = r.heightAt(x, z);
      if (h !== null) return h;
    }
    return 0;
  }
  /** Metres a point stands above its smoothed surroundings (for climbing the biome ladder). */
  function reliefAt(x, z) {
    for (const r of rings) {
      const sm = r.smoothAt(x, z);
      if (sm !== null) return r.heightAt(x, z) - sm;
    }
    return 0;
  }
  return { mesh, heightAt, reliefAt, failed: rings[0].failed, bounds: rings[0].bounds };
}
