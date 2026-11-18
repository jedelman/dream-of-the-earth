// Seeing the river basins you know, on the atlas's map: the second of the watersheds' three stages (Jason, 11-10: "All 3,
// in stages": know, see, enter). Each basin you've stood in is outlined where its rain parts from its neighbours' (the
// divides), and faintly tinted inside, the one you're in brighter. The outlines come from the same 0.1° basin tiles the
// game already reads (basins.js): an edge runs between two pixels that drain to different places, when either is a
// basin you know. Pure, so Node can test it; atlas.js draws what it returns.

/** The basin grid: 0.1° pixels, 3,600 round the Earth, 1,800 from pole to pole. */
export const GRID_RES = 0.1, GRID_W = 3600, GRID_H = 1800;

/**
 * The edges of the known basins, merged into straight runs along the grid's lines.
 * idAt(gx, gy) -> the basin id of a pixel (0 the sea or a basin too small to name), gx wrapping east to west.
 * known: Set of basin ids; here: the id of the basin you're in (or 0).
 * box: { x0, y0, x1, y1 }, the pixels (inclusive) holding every known pixel, so only that much is scanned (basinBox
 * finds it); the whole grid if left out. w, h: the grid's size (GRID_W, GRID_H unless testing).
 * Returns { segs: [[x0, y0, x1, y1, isHere]] } in grid units (x east from 180°W, y south from 90°N); isHere is 1 on an
 * edge of the basin you're in.
 */
export function basinOutline(idAt, known, here = 0, box = null, w = GRID_W, h = GRID_H) {
  const segs = [];
  if (!known.size) return { segs };
  const b = box ?? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 }, whole = b.x1 - b.x0 + 1 >= w;
  const xa = whole ? 0 : b.x0, xb = whole ? w - 1 : b.x1;
  const edge = (p, q) => p !== q && (known.has(p) || known.has(q));
  const isHere = (p, q) => (here && (p === here || q === here) ? 1 : 0);
  // Horizontal edges: between row y-1 and row y (none at the poles).
  for (let y = Math.max(1, b.y0); y <= Math.min(h - 1, b.y1 + 1); y++) {
    let run = -1, runHere = 0;
    for (let x = xa; x <= xb + 1; x++) {
      let on = false, hh = 0;
      if (x <= xb) { const p = idAt(x % w, y - 1), q = idAt(x % w, y); on = edge(p, q); hh = on ? isHere(p, q) : 0; }
      if (run >= 0 && (!on || hh !== runHere)) { segs.push([run, y, x, y, runHere]); run = -1; }
      if (on && run < 0) { run = x; runHere = hh; }
    }
  }
  // Vertical edges: between column x-1 and column x (x = 0 meets column w-1 across the dateline).
  for (let x = xa; x <= (whole ? w - 1 : xb + 1); x++) {
    const xl = (x - 1 + w) % w, xr = x % w;
    let run = -1, runHere = 0;
    for (let y = b.y0; y <= b.y1 + 1; y++) {
      let on = false, hh = 0;
      if (y <= b.y1) { const p = idAt(xl, y), q = idAt(xr, y); on = edge(p, q); hh = on ? isHere(p, q) : 0; }
      if (run >= 0 && (!on || hh !== runHere)) { segs.push([x, run, x, y, runHere]); run = -1; }
      if (on && run < 0) { run = y; runHere = hh; }
    }
  }
  return { segs };
}

/**
 * The box (inclusive pixels) of each of the given basins, from tiles of size ts given as rows[row][col] -> Uint16Array |
 * null: one fast pass over the typed arrays. Returns Map id -> { x0, y0, x1, y1 }. A basin across the dateline gets a box
 * the whole width round.
 */
export function basinBoxes(rows, ids, ts = 300) {
  const out = new Map();
  for (let row = 0; row < rows.length; row++) for (let col = 0; col < rows[row].length; col++) {
    const t = rows[row][col];
    if (!t) continue;
    for (let k = 0; k < t.length; k++) {
      const id = t[k];
      if (!id || !ids.has(id)) continue;
      const x = col * ts + (k % ts), y = row * ts + ((k / ts) | 0), bx = out.get(id);
      if (!bx) out.set(id, { x0: x, y0: y, x1: x, y1: y });
      else { if (x < bx.x0) bx.x0 = x; if (x > bx.x1) bx.x1 = x; if (y < bx.y0) bx.y0 = y; if (y > bx.y1) bx.y1 = y; }
    }
  }
  return out;
}

/**
 * The tint inside the known basins, one RGBA picture per tile of tw × th pixels starting at grid (x0, y0): known
 * pixels a pale water-blue, the basin you're in a little stronger, the rest clear. Returns null if the tile holds no
 * known basin (so nothing need be drawn).
 */
export function basinTint(idAt, known, here, x0, y0, tw, th) {
  let px = null;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const id = idAt(x0 + x, y0 + y);
    if (!id || !known.has(id)) continue;
    px ??= new Uint8ClampedArray(tw * th * 4);
    const k = (y * tw + x) * 4;
    px[k] = 120; px[k + 1] = 200; px[k + 2] = 255; px[k + 3] = id === here ? 110 : 60;
  }
  return px;
}

/** A grid point (x east from 180°W, y south from 90°N) as latitude and longitude. */
export const gridLatLon = (x, y) => ({ lat: 90 - y * GRID_RES, lon: -180 + x * GRID_RES });

// ---- The water's way (still "see"): each known basin's main stem, where you've cleared the cloud, flowing to the sea ----

/**
 * The stretches of a river's main stem that show, each running downstream (from the source toward the mouth).
 * line: the stem from the mouth up, [[lat, lon, km from the mouth]] (quests.json's `line`); clear(lat, lon) -> whether
 * that point is out of the cloud. The stem is walked every step degrees, so a stretch starts and ends close to the edge
 * of the clear, and a stretch needs two points to show. Returns [[[lat, lon]]].
 */
export function stemRuns(line, clear, step = 0.1) {
  const runs = [];
  if (!Array.isArray(line) || line.length < 2) return runs;
  let run = null;
  const add = (lat, lon) => {
    if (clear(lat, lon)) (run ??= []).push([lat, lon]);
    else { if (run?.length >= 2) runs.push(run); run = null; }
  };
  for (let k = line.length - 1; k > 0; k--) {
    const a = line[k], b = line[k - 1];
    let dlon = b[1] - a[1];
    if (dlon > 180) dlon -= 360; else if (dlon < -180) dlon += 360; // across the dateline the short way round
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], dlon) / step));
    for (let j = 0; j < n; j++) add(a[0] + ((b[0] - a[0]) * j) / n, wrap(a[1] + (dlon * j) / n));
  }
  add(line[0][0], line[0][1]);
  if (run?.length >= 2) runs.push(run);
  return runs;
}
const wrap = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * Chevrons along a drawn path, one every `every` pixels, each pointing the way the path runs.
 * pts: [{ x, y }] on screen, in order downstream; a jump wider than `jump` (a copy of the Earth east or west) breaks it.
 * Returns [{ x, y, a }] with a the angle in radians (0 points east, π/2 points down the screen).
 */
export function chevronsAlong(pts, every = 44, jump = Infinity) {
  const out = [];
  let left = every / 2;
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k - 1], q = pts[k], dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
    if (!len) continue;
    if (len > jump) { left = every / 2; continue; }
    let at = left;
    while (at <= len) { out.push({ x: p.x + (dx * at) / len, y: p.y + (dy * at) / len, a: Math.atan2(dy, dx) }); at += every; }
    left = at - len;
  }
  return out;
}
