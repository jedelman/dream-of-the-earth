// Faceted terrain and seafloor from terrarium elevation tiles (AWS Open Data).
// Coarse on purpose: elevation is sampled to big flat-shaded facets, so the
// data's limits read as the look.
import * as THREE from "three";
import { terrariumHeight, lonLatToTile, tileToLonLat, interimTemperature, biomeFor } from "./geo.js";

const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
export const ZOOM = 11; // ~19.6 km tiles at the equator
// Open-ocean tiles at zoom 11 are flat zero (checked 11-07 off Chile: 11/587/1214
// is all 0, while zooms 7-10 there carry the seafloor), so exact zeros are
// filled from the zoom-10 parent.
const FILL_ZOOM = 10;
const SPAN = 3; // 3×3 tiles
const CELLS = 64; // facets across the whole area (~900 m each at the equator)

function decodeTile(px) {
  const out = new Float32Array(256 * 256);
  for (let k = 0; k < out.length; k++) out[k] = terrariumHeight(px[k * 4], px[k * 4 + 1], px[k * 4 + 2]);
  return out;
}

async function loadTile(z, x, y) {
  const n = 2 ** z;
  const xx = ((x % n) + n) % n;
  if (y < 0 || y >= n) return null;
  const res = await fetch(TILE_URL(z, xx, y), { mode: "cors" });
  if (!res.ok) throw new Error(`tile ${z}/${xx}/${y}: ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
}

// The palette: the temperature ladder, pushed toward psychedelia. Land colours
// by biome; the seafloor by depth.
const LAND = {
  ice: [0xf2f0ff, 0xd8e6ff],
  tundra: [0xb6a6d9, 0x8f86b8],
  boreal: [0x1f8a78, 0x146b66],
  temperate: [0x5fd16a, 0x2fae5b],
  subtropical: [0xd6d64a, 0x9ccf3c],
  tropical: [0x22d48a, 0x0fb36f],
};
const SAND = 0xffd98a, ROCK = 0xb05fa8;
const seafloorColor = (depth) => new THREE.Color().setHSL(0.62 + Math.min(depth / 6000, 1) * 0.15, 0.75, 0.42 - Math.min(depth / 6000, 1) * 0.3);

/**
 * Load the area around (lat, lon). Returns { mesh, heightAt(x, z), frame-relative
 * bounds, failed } where heightAt reads the same facets the creature walks on.
 */
export async function buildTerrain(frame, lat, lon) {
  const t = lonLatToTile(lon, lat, ZOOM);
  const x0 = Math.floor(t.x) - 1, y0 = Math.floor(t.y) - 1;
  const size = 256 * SPAN;
  const heights = new Float32Array(size * size);
  let failed = 0;
  await Promise.all(
    Array.from({ length: SPAN * SPAN }, (_, i) => {
      const tx = i % SPAN, ty = Math.floor(i / SPAN);
      return loadTile(ZOOM, x0 + tx, y0 + ty)
        .then((px) => {
          if (!px) return;
          const h = decodeTile(px);
          for (let py = 0; py < 256; py++) heights.set(h.subarray(py * 256, py * 256 + 256), (ty * 256 + py) * size + tx * 256);
        })
        .catch(() => { failed++; });
    }),
  );

  // Fill exact zeros (open ocean, or a tile that failed) from the coarser zoom.
  const parents = new Map();
  const px0 = Math.floor(x0 / 2), py0 = Math.floor(y0 / 2), px1 = Math.floor((x0 + SPAN - 1) / 2), py1 = Math.floor((y0 + SPAN - 1) / 2);
  await Promise.all(
    [...Array((px1 - px0 + 1) * (py1 - py0 + 1)).keys()].map((i) => {
      const tx = px0 + (i % (px1 - px0 + 1)), ty = py0 + Math.floor(i / (px1 - px0 + 1));
      return loadTile(FILL_ZOOM, tx, ty).then((px) => { if (px) parents.set(`${tx},${ty}`, decodeTile(px)); }).catch(() => {});
    }),
  );
  let filled = 0;
  for (let gy = 0; gy < size; gy++)
    for (let gx = 0; gx < size; gx++) {
      const k = gy * size + gx;
      if (heights[k] !== 0) continue;
      const X = (x0 * 256 + gx) / 2, Y = (y0 * 256 + gy) / 2;
      const tile = parents.get(`${Math.floor(X / 256)},${Math.floor(Y / 256)}`);
      if (!tile) continue;
      heights[k] = tile[Math.floor(Y % 256) * 256 + Math.floor(X % 256)];
      filled++;
    }

  // Sample a (CELLS+1)² grid: average a small block around each node.
  const N = CELLS + 1, step = size / CELLS;
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

  // Grid node (i, j) → local position.
  const nodeLL = (i, j) => tileToLonLat(x0 + (i * step) / 256, y0 + (j * step) / 256, ZOOM);
  const pos = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const ll = nodeLL(i, j);
      const p = frame.toLocal(ll.lat, ll.lon);
      pos.set([p.x, grid[j * N + i], p.z], (j * N + i) * 3);
    }

  // Two triangles per cell, each with one flat colour.
  const verts = [], cols = [];
  const c = new THREE.Color();
  const v = (i, j) => { const k = (j * N + i) * 3; return [pos[k], pos[k + 1], pos[k + 2]]; };
  for (let j = 0; j < CELLS; j++)
    for (let i = 0; i < CELLS; i++) {
      const a = v(i, j), b = v(i + 1, j), d = v(i, j + 1), e = v(i + 1, j + 1);
      for (const [p, q, r, alt] of [[a, d, b, 0], [b, d, e, 1]]) {
        verts.push(...p, ...q, ...r);
        const h = (p[1] + q[1] + r[1]) / 3;
        const rise = Math.max(Math.abs(p[1] - q[1]), Math.abs(q[1] - r[1]), Math.abs(r[1] - p[1]));
        const run = Math.hypot(p[0] - r[0], p[2] - r[2]) || 1;
        const ll = nodeLL(i + 0.5, j + 0.5);
        if (h < 0) c.copy(seafloorColor(-h));
        else if (h < 12) c.setHex(SAND);
        else if (rise / run > 0.45) c.setHex(ROCK);
        else c.setHex(LAND[biomeFor(interimTemperature(ll.lat, h))][0]);
        // Subtle, stable per-facet variation (hashed on the global grid, so it
        // doesn't change when the world is regrown around you).
        const gi = Math.round((x0 * 256) / step) + i, gj = Math.round((y0 * 256) / step) + j;
        const n = (((gi * 73856093) ^ (gj * 19349663) ^ (alt * 83492791)) >>> 0) / 4294967296;
        c.offsetHSL(0, 0, (n - 0.5) * 0.06);
        for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));

  // Height of the facet under a local point (planar interpolation on the same
  // triangles the mesh draws). Outside the area: sea level.
  function heightAt(x, z) {
    const ll = frame.toLatLon(x, z);
    const tt = lonLatToTile(ll.lon, ll.lat, ZOOM);
    const gi = ((tt.x - x0) * 256) / step, gj = ((tt.y - y0) * 256) / step;
    if (gi < 0 || gj < 0 || gi >= CELLS || gj >= CELLS) return 0;
    const i = Math.floor(gi), j = Math.floor(gj), fx = gi - i, fy = gj - j;
    const h = (ii, jj) => grid[jj * N + ii];
    // Cell split along the b–d diagonal: [a,d,b] when fx + fy < 1, else [b,d,e].
    if (fx + fy < 1) return h(i, j) + fx * (h(i + 1, j) - h(i, j)) + fy * (h(i, j + 1) - h(i, j));
    return h(i + 1, j + 1) + (1 - fx) * (h(i, j + 1) - h(i + 1, j + 1)) + (1 - fy) * (h(i + 1, j) - h(i + 1, j + 1));
  }

  const lo = v(0, 0), hi = v(CELLS, CELLS);
  return { mesh, heightAt, failed, filled, bounds: { minX: lo[0], maxX: hi[0], minZ: lo[2], maxZ: hi[2] } };
}

/** A wobbling, translucent sea surface at height 0. */
export function buildSea(size) {
  const seg = 40;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2).toNonIndexed();
  const base = geo.attributes.position.array.slice();
  const mat = new THREE.MeshLambertMaterial({ color: 0x3fd6ff, transparent: true, opacity: 0.55, flatShading: true, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  function update(t) {
    const p = geo.attributes.position.array;
    for (let k = 0; k < p.length; k += 3) {
      const x = base[k], z = base[k + 2];
      p[k + 1] = Math.sin(x * 0.0021 + t * 0.9) * 6 + Math.cos(z * 0.0017 - t * 0.7) * 6;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return { mesh, update };
}
