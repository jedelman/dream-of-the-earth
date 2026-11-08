// Places: a global grid of cells about 11 km across, each with a stable URL. An
// artifact's record points at the URL of the cell it stands in, so a backlink
// index (Constellation) can answer "what has been left here?" with one query per
// cell, and nobody has to keep a list. The URL also opens the game at that cell.
// Pure, so Node can test it.

export const PLACE_BASE = "https://dream-of-the-earth.jason-edelman.org/place/1/";
export const BAND_DEG = 0.1; // a band of latitude, ~11.1 km
const BANDS = Math.round(180 / BAND_DEG);
const D2R = Math.PI / 180;
const R = 6371008.8;

/** How many cells across band j: one per ~0.1° of longitude at the equator, fewer toward the poles (~11 km each). */
export function cellsInBand(j) {
  const latMid = -90 + (j + 0.5) * BAND_DEG;
  return Math.max(1, Math.round((360 / BAND_DEG) * Math.cos(latMid * D2R)));
}

/** The cell a point is in: { j, i, url }. */
export function placeOf(lat, lon) {
  const j = Math.min(BANDS - 1, Math.max(0, Math.floor((lat + 90) / BAND_DEG)));
  const n = cellsInBand(j);
  const u = ((((lon + 180) % 360) + 360) % 360) / 360;
  const i = Math.min(n - 1, Math.floor(u * n));
  return { j, i, url: `${PLACE_BASE}${j}/${i}` };
}

/** The middle of cell (j, i): { lat, lon }. */
export function placeCentre(j, i) {
  const n = cellsInBand(j);
  return { lat: -90 + (j + 0.5) * BAND_DEG, lon: -180 + ((i + 0.5) * 360) / n };
}

/** A place URL's cell, { j, i }, or null if it isn't one of ours. */
export function parsePlace(url) {
  if (typeof url !== "string" || !url.startsWith(PLACE_BASE)) return null;
  const m = url.slice(PLACE_BASE.length).match(/^(\d{1,4})\/(\d{1,5})$/);
  if (!m) return null;
  const j = Number(m[1]), i = Number(m[2]);
  return j < BANDS && i < cellsInBand(j) ? { j, i } : null;
}

/** The cells within radiusM of a point (sampled every 3 km, so none is missed), as [{ j, i, url }]. */
export function placesAround(lat, lon, radiusM) {
  const out = new Map(), step = 3000;
  for (let dy = -radiusM; dy <= radiusM; dy += step)
    for (let dx = -radiusM; dx <= radiusM; dx += step) {
      if (dx * dx + dy * dy > radiusM * radiusM) continue;
      const la = Math.max(-89.999, Math.min(89.999, lat + (dy / R) / D2R));
      const lo = lon + (dx / (R * Math.max(0.01, Math.cos(la * D2R)))) / D2R;
      const p = placeOf(la, lo);
      out.set(p.url, p);
    }
  const p = placeOf(lat, lon);
  out.set(p.url, p);
  return [...out.values()];
}
