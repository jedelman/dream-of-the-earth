// Watersheds (Jason, 11-10: "Rivers way, but in reverse; you get the quest when you reach the basin, then clues point
// you to the headwaters"). Where the rain that falls on a place runs to, worked out once offline from the terrain and
// Natural Earth's rivers (scripts/basins/): 72 tiles of 30° at 0.1°, like the Köppen map, each pixel the basin it drains
// to (red the low byte of its id, green the high; 0 the sea or a basin too small to name), and the list of the named
// basins (basins.json). The tiles are fetched as needed and kept. The first time you're in a basin, you know it: that's
// the first stage of three (know, see, enter).

const tiles = new Map(); // "col-row" -> Uint16Array(300*300) | null (missing)
const pending = new Map();
let list = null, listing = null; // basins.json: { v, basins: [...] }, and its fetch
const byId = new Map();

/** Which tile a point is in, and where in it. */
export function basinCell(lat, lon) {
  const l = (((lon + 180) % 360) + 360) % 360;
  const col = Math.min(11, Math.max(0, Math.floor(l / 30))), row = Math.min(5, Math.max(0, Math.floor((90 - lat) / 30)));
  const x = Math.min(299, Math.max(0, Math.floor((l - col * 30) / 0.1))), y = Math.min(299, Math.max(0, Math.floor((90 - lat - row * 30) / 0.1)));
  return { col, row, key: `${col}-${row}`, x, y };
}

/** A pixel's basin id. */
export const basinId = (r, g) => r + 256 * g;

async function loadTile(col, row) {
  const res = await fetch(`./data/basins/${col}-${row}.png`);
  if (!res.ok) throw new Error(`basin tile ${col}-${row}: ${res.status}`);
  // Exact values matter: no colour management, no premultiplying.
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = new OffscreenCanvas(300, 300);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, 300, 300).data;
  const out = new Uint16Array(300 * 300);
  for (let k = 0; k < out.length; k++) out[k] = basinId(px[k * 4], px[k * 4 + 1]);
  return out;
}

/** Make sure the list of basins and the tile under (lat, lon) are loaded. */
export async function ensureBasins(lat, lon) {
  if (!listing) listing = fetch("./data/basins/basins.json").then((r) => (r.ok ? r.json() : null)).then((j) => { useBasins(j); }).catch(() => { listing = null; });
  const { col, row, key } = basinCell(lat, lon);
  if (!tiles.has(key) && !pending.has(key)) pending.set(key, loadTile(col, row).then((t) => tiles.set(key, t)).catch(() => tiles.set(key, null)).finally(() => pending.delete(key)));
  await Promise.all([listing, pending.get(key)]);
}

/** Use a list of basins (basins.json's contents); for tests, too. */
export function useBasins(j) {
  if (!j || !Array.isArray(j.basins)) return;
  list = j;
  byId.clear();
  for (const b of j.basins) byId.set(b.id, b);
}

/** The basin a point drains to ({ id, key, label, kind, river?, lake?, area, mouth, source }), or null (the sea, a basin
 *  too small to name, or its tile or the list not loaded yet). */
export function basinAt(lat, lon) {
  const { key, x, y } = basinCell(lat, lon), t = tiles.get(key);
  return t ? byId.get(t[y * 300 + x]) ?? null : null;
}

/** How many basins are named (0 until the list is loaded). */
export const basinTotal = () => list?.basins.length ?? 0;

/** A basin by its key (as your atlas keeps it), or null. */
export const basinByKey = (key) => list?.basins.find((b) => b.key === key) ?? null;

/** An area in words: "5.9 million km²", "640,000 km²". */
export function areaText(km2) {
  return km2 >= 1e6 ? `${(km2 / 1e6).toFixed(1).replace(/\.0$/, "")} million km²` : `${Math.round(km2 / 1000) * 1000}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " km²";
}

/** Where a basin's water goes, in a few words. */
export function endsText(b) {
  if (b.kind === "lake") return `ends in ${b.lake}`;
  if (b.kind === "hollow") return "never reaches the sea";
  if (b.kind === "coast") return "runs straight to the sea";
  return `reaches the sea at the mouth of the ${b.river}`;
}

/** What the log says the first time you're in a basin. */
export function knowLine(b) {
  const size = areaText(b.area);
  if (b.kind === "river") return `You're in the ${b.label} now (${size}): every drop of rain here runs to the ${b.river}, and on to the sea. Somewhere upstream, it begins. It's in your atlas.`;
  if (b.kind === "lake") return `You're in the ${b.label} now (${size}): rain here never reaches the sea. It runs to ${b.lake}${b.river ? `, down the ${b.river}` : ""}, and stays. Somewhere upstream, it begins. It's in your atlas.`;
  if (b.kind === "hollow") return `You're in the ${b.label} now (${size}): what little rain falls here runs to its lowest place and stays. It's in your atlas.`;
  return `You're in the ${b.label} now (${size}): rain here runs straight to the sea. It's in your atlas.`;
}
