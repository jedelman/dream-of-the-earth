// How warm the sea is (Jason, 11-19: "There are really good sea temp datasets out there! Doesn't have to be realtime"):
// NOAA's ERSSTv5, the 1991–2020 mean of each month on a 2° grid, kept as each cell's coldest and warmest month
// (scripts/sst/sst.mjs). 43 KB, fetched once. Pure lookups here, so Node can test them.

/** The packed grid (web/data/sst.json) -> { lat0, lon0, step, nlat, nlon, cold: Float32Array, warm: Float32Array }. */
export function parseSst(j) {
  const bytes = (s) => (typeof Buffer !== "undefined" ? Uint8Array.from(Buffer.from(s, "base64")) : Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  const unpack = (s) => Float32Array.from(bytes(s), (b) => b / 8 - 2);
  if (!j || !j.cold || !j.warm || j.nlat * j.nlon !== bytes(j.cold).length) return null;
  return { lat0: j.lat0, lon0: j.lon0, step: j.step, nlat: j.nlat, nlon: j.nlon, cold: unpack(j.cold), warm: unpack(j.warm) };
}

/** The sea's coldest and warmest monthly means (°C) at (lat, lon), blended between the four nearest cells: { cold, warm }. */
export function warmthAt(g, lat, lon) {
  const y = Math.max(0, Math.min(g.nlat - 1.0001, (lat - g.lat0) / g.step));
  const x = ((((lon - g.lon0) / g.step) % g.nlon) + g.nlon) % g.nlon;
  const j = Math.floor(y), i = Math.floor(x), fy = y - j, fx = x - i, i2 = (i + 1) % g.nlon, j2 = Math.min(g.nlat - 1, j + 1);
  const at = (a) => (a[j * g.nlon + i] * (1 - fx) + a[j * g.nlon + i2] * fx) * (1 - fy) + (a[j2 * g.nlon + i] * (1 - fx) + a[j2 * g.nlon + i2] * fx) * fy;
  return { cold: at(g.cold), warm: at(g.warm) };
}

let grid = null, pending = null;
/** Fetches the grid once; resolves to it (or null if it can't be had: then the game falls back on latitude). */
export function ensureSst(url = "data/sst.json") {
  if (grid || pending) return pending ?? Promise.resolve(grid);
  pending = fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => (grid = parseSst(j))).catch(() => null);
  return pending;
}
/** The sea's warmth at (lat, lon) once the grid is in, else null. */
export const seaWarmth = (lat, lon) => (grid ? warmthAt(grid, lat, lon) : null);
