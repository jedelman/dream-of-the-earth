// Inland water (11-14): rivers and lakes, drawn as water instead of land. The lines and shores are Natural Earth's
// (public domain), simplified offline into 10° tiles by scripts/water/water.py; the water's height comes from the
// terrain the game already draws, so a lake sits on its own shore wherever you are. Pure, so Node can test it;
// inlandwater.js builds the meshes.

export const TILE_DEG = 10;
export const Q = 10000; // the tiles' coordinates are in 1e-4 degrees
/** Every river is drawn within this many metres of a world's middle; the big ones, and lakes, out to FAR_M. */
export const NEAR_M = 32000, FAR_M = 120000;
/** Rivers of this Natural Earth rank or lower (0 is the greatest) reach FAR_M. */
export const BIG_RANK = 4;
const MAX_PTS = 20000, MAX_ITEMS = 4000, MAX_NAME = 80;

/** The 10° tile a point is in, "col-row" from 180°W and the North Pole (as water.py writes them). */
export function waterTileKey(lat, lon) {
  const col = Math.min(35, Math.max(0, Math.floor(((((lon + 180) % 360) + 360) % 360) / TILE_DEG)));
  const row = Math.min(17, Math.max(0, Math.floor((90 - lat) / TILE_DEG)));
  return `${col}-${row}`;
}

/** The tiles that a box of ±m metres round (lat, lon) touches, of those the index lists. */
export function waterTilesNear(lat, lon, m, listed) {
  const dLat = m / 111195, dLon = m / (111195 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const out = new Set();
  for (let la = lat - dLat; ; la = Math.min(la + TILE_DEG / 2, lat + dLat)) {
    for (let lo = lon - dLon; ; lo = Math.min(lo + TILE_DEG / 2, lon + dLon)) {
      const k = waterTileKey(Math.max(-89.99, Math.min(89.99, la)), lo);
      if (!listed || listed.has(k)) out.add(k);
      if (lo >= lon + dLon) break;
    }
    if (la >= lat + dLat) break;
  }
  return [...out];
}

/** [x0, y0, dx, dy, …] from offset `from` in 1e-4 degrees, to [[lon, lat], …]; null if malformed. */
export function unpackLine(a, from = 0) {
  if (!Array.isArray(a) || (a.length - from) % 2 || a.length - from < 4 || (a.length - from) / 2 > MAX_PTS) return null;
  const out = [];
  let x = 0, y = 0;
  for (let k = from; k < a.length; k += 2) {
    if (!Number.isInteger(a[k]) || !Number.isInteger(a[k + 1])) return null;
    x += a[k]; y += a[k + 1];
    out.push([x / Q, y / Q]);
  }
  return out;
}

/** A tile's JSON, checked: { rivers: [{ rank, name, pts }], lakes: [{ id, name, kind, rings }] }. Bad items are dropped. */
export function parseWaterTile(j) {
  const out = { rivers: [], lakes: [] };
  if (!j || typeof j !== "object") return out;
  const names = Array.isArray(j.names) ? j.names.map((n) => (typeof n === "string" ? n.slice(0, MAX_NAME) : "")) : [];
  for (const r of (Array.isArray(j.rivers) ? j.rivers : []).slice(0, MAX_ITEMS)) {
    if (!Array.isArray(r) || !Number.isInteger(r[0]) || !Number.isInteger(r[1])) continue;
    const pts = unpackLine(r, 2);
    if (pts) out.rivers.push({ rank: Math.min(12, Math.max(0, r[0])), name: names[r[1]] || "", pts });
  }
  for (const l of (Array.isArray(j.lakes) ? j.lakes : []).slice(0, MAX_ITEMS)) {
    if (!Array.isArray(l) || !Number.isInteger(l[0]) || typeof l[1] !== "string") continue;
    const rings = l.slice(3).map((r) => unpackLine(r)).filter((r) => r && r.length >= 3);
    if (rings.length) out.lakes.push({ id: l[0], name: l[1].slice(0, MAX_NAME), kind: [0, 1, 2].includes(l[2]) ? l[2] : 0, rings });
  }
  return out;
}

/**
 * How wide a river is drawn, in metres, from its Natural Earth rank: the Amazon, the Nile and the Yangtze (rank 1) about a
 * kilometre, the Danube 600 m, the Rhine and the Seine 240 m, the Loire 150 m, the Thames 90 m, the least 30 m.
 */
export const riverWidth = (rank) => Math.max(30, Math.round(1600 * 0.62 ** rank));

/** A polyline (local [x, z]) with no step longer than `step` metres. */
export function densify(pts, step) {
  const out = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k], n = Math.ceil(Math.hypot(bx - ax, bz - az) / step);
    for (let s = 1; s <= n; s++) out.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n]);
  }
  return out;
}

/**
 * A river as a ribbon on the ground: positions (x, y, z), uvs (metres along, 0..1 across) and triangle indices. Points
 * where the ground is at or below `seaY` (the sea has the river by then) are left out, which can cut it in pieces.
 */
export function ribbon(pts, width, heightAt, seaY = 1) {
  const pos = [], uv = [], idx = [];
  const half = width / 2;
  let along = 0, prevOk = false;
  for (let k = 0; k < pts.length; k++) {
    const [x, z] = pts[k];
    if (k) along += Math.hypot(x - pts[k - 1][0], z - pts[k - 1][1]);
    // The ribbon's direction here: the mean of the segments on either side (a mitre, capped so sharp bends don't spike).
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const nx = -dz * half, nz = dx * half;
    const h = heightAt(x, z), hl = heightAt(x + nx, z + nz), hr = heightAt(x - nx, z - nz);
    const ok = h > seaY;
    if (ok) {
      const v = pos.length / 3;
      pos.push(x + nx, Math.max(hl, seaY), z + nz, x - nx, Math.max(hr, seaY), z - nz);
      uv.push(along, 0, along, 1);
      if (prevOk) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
    }
    prevOk = ok;
  }
  return { pos, uv, idx };
}

/** A lake's water level from heights round its shore: low, but not the lowest (a shore sample can fall in a gully). */
export function lakeLevel(heights) {
  const h = heights.filter(Number.isFinite).sort((a, b) => a - b);
  if (!h.length) return null;
  return h[Math.floor((h.length - 1) * 0.15)];
}

/** Signed area of a ring of [x, y] (positive anticlockwise, with y up). */
export function signedArea(r) {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return s / 2;
}

/** Whether (x, y) is inside a ring (even-odd). */
export function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * A shapefile polygon's rings (lon, lat) as polygons: outer rings run clockwise there and holes (islands) anticlockwise;
 * each hole goes to the outer ring round it. Returns [{ outer, holes }].
 */
export function lakePolygons(rings) {
  const outers = [], holes = [];
  for (const r of rings) (signedArea(r) <= 0 ? outers : holes).push(r);
  const polys = outers.map((outer) => ({ outer, holes: [] }));
  for (const h of holes) {
    const p = polys.find((q) => inRing(h[0][0], h[0][1], q.outer));
    if (p) p.holes.push(h);
  }
  return polys;
}

/**
 * Triangles ([[x, z] × 3]) split until no edge is longer than maxEdge (so the Earth's curve, applied per vertex, stays
 * true across a big lake), dropping any that fall wholly outside the box { minX, maxX, minZ, maxZ }.
 */
export function subdivide(tris, maxEdge, box, maxOut = 60000) {
  const out = [], stack = [...tris];
  const outside = (t) => t.every((p) => p[0] < box.minX) || t.every((p) => p[0] > box.maxX) || t.every((p) => p[1] < box.minZ) || t.every((p) => p[1] > box.maxZ);
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  while (stack.length && out.length < maxOut) {
    const t = stack.pop();
    if (outside(t)) continue;
    const [a, b, c] = t;
    const e = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
    if (e <= maxEdge) { out.push(t); continue; }
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    stack.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
  }
  return out;
}

/** Distance from (x, z) to a polyline of [x, z]. */
export function distToLine(x, z, pts) {
  let best = Infinity;
  for (let k = 1; k < pts.length; k++) {
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}

/** What a player wading in says: "You wade into the Loire. …" / "You wade into Lake Titicaca. …" / "…into a river. …". */
export function wadeLine(w) {
  if (!w) return "";
  if (w.kind === "lake") {
    const tail = w.reservoir ? "Somewhere down the valley, a dam holds it back." : "Its water is still, and cold round your feet.";
    return `You wade into ${w.name || (w.reservoir ? "a reservoir" : "a lake")}. ${tail}`;
  }
  return `You wade into ${w.name ? `the ${w.name}` : "a river"}. It tugs at your feet on its way downhill.`;
}
