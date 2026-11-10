// Where you've been, for the atlas's map (Jason, 11-10: "For the atlas, let's offer it as a map only - but anything not
// visited is fogged/clouded over"). The Earth in cells of a quarter degree (about 28 km); a cell you've stood in is
// seen, and the map clears the clouds round it. Kept in your atlas record, as cell numbers. Also the map's view: where
// it's centred and how near, and the sums that place things on it. Pure, so Node can test it.

/** Cells of a quarter degree: 1,440 round the Earth, 720 from pole to pole. */
export const SEEN_RES = 0.25, SEEN_W = 360 / SEEN_RES, SEEN_H = 180 / SEEN_RES;
/** Most cells a record keeps (about 8 bytes each, so 80 KB at most: some 7.8 million km² walked). */
export const SEEN_MAX = 10000;
/** How far the clouds clear round a seen cell, in cells (about 45 km). */
export const CLEAR_R = 1.6;

const wrapLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** The cell a point is in. */
export function cellOf(lat, lon) {
  const col = Math.min(SEEN_W - 1, Math.floor((wrapLon(lon) + 180) / SEEN_RES));
  const row = Math.min(SEEN_H - 1, Math.max(0, Math.floor((90 - lat) / SEEN_RES)));
  return row * SEEN_W + col;
}

/** A cell's middle. */
export function cellMiddle(id) {
  const row = Math.floor(id / SEEN_W), col = id % SEEN_W;
  return { lat: 90 - (row + 0.5) * SEEN_RES, lon: -180 + (col + 0.5) * SEEN_RES };
}

/** Whether a number is a cell. */
export const isCell = (v) => Number.isInteger(v) && v >= 0 && v < SEEN_W * SEEN_H;

/** Whether a point lies in the clear: within CLEAR_R cells of a seen cell, or of one of the spots given ([{ lat, lon }]). */
export function cleared(lat, lon, seen, spots = []) {
  const r = Math.ceil(CLEAR_R), row0 = Math.floor((90 - lat) / SEEN_RES), col0 = Math.floor((wrapLon(lon) + 180) / SEEN_RES);
  const fr = (90 - lat) / SEEN_RES, fc = (wrapLon(lon) + 180) / SEEN_RES;
  for (let dr = -r; dr <= r; dr++) for (let dc = -r; dc <= r; dc++) {
    const row = row0 + dr; if (row < 0 || row >= SEEN_H) continue;
    const col = (((col0 + dc) % SEEN_W) + SEEN_W) % SEEN_W;
    if (!seen.has(row * SEEN_W + col)) continue;
    if (Math.hypot(row + 0.5 - fr, col0 + dc + 0.5 - fc) <= CLEAR_R) return true;
  }
  return spots.some((s) => Math.hypot((s.lat - lat) / SEEN_RES, wrapLon(s.lon - lon) / SEEN_RES) <= CLEAR_R);
}

// ---- The map's view: { lat, lon } at the middle, ppd pixels to a degree, on a w × h canvas (plate carrée) ----
/** Nearest it zooms: a cell 16 px across. */
export const PPD_MAX = 64;

/** The view kept sensible: no farther out than the whole Earth across, no nearer than PPD_MAX, the poles not passed. */
export function clampView(v, w, h) {
  const ppd = Math.min(PPD_MAX, Math.max(w / 360, v.ppd));
  const half = h / 2 / ppd, lat = half >= 90 ? 0 : Math.min(90 - half, Math.max(-90 + half, v.lat));
  return { lat, lon: wrapLon(v.lon), ppd };
}

/** Where a point is drawn, the copy of it (east or west round the Earth) nearest the middle. */
export function project(lat, lon, v, w, h) {
  return { x: w / 2 + wrapLon(lon - v.lon) * v.ppd, y: h / 2 - (lat - v.lat) * v.ppd };
}

/** The point under a pixel. */
export function unproject(x, y, v, w, h) {
  return { lat: v.lat - (y - h / 2) / v.ppd, lon: wrapLon(v.lon + (x - w / 2) / v.ppd) };
}

/** Nearer (f > 1) or farther, keeping the point under (x, y) where it is. */
export function zoomAbout(v, f, x, y, w, h) {
  const at = unproject(x, y, v, w, h), next = clampView({ ...v, ppd: v.ppd * f }, w, h);
  const moved = { ...next, lat: at.lat + (y - h / 2) / next.ppd, lon: at.lon - (x - w / 2) / next.ppd };
  return clampView(moved, w, h);
}

/** Dragged by (dx, dy) pixels. */
export const panBy = (v, dx, dy, w, h) => clampView({ ...v, lon: v.lon - dx / v.ppd, lat: v.lat + dy / v.ppd }, w, h);
