// The Köppen-Geiger map in the browser: 72 tiles of 30° (0.1° pixels, values
// 1-30 = classes, 0 = sea or no data), fetched as needed and kept.
const tiles = new Map(); // "col-row" -> Uint8Array(300*300) | null (missing)
const pending = new Map();

const tileKey = (lat, lon) => {
  const col = Math.min(11, Math.max(0, Math.floor((((lon + 180) % 360) + 360) % 360 / 30)));
  const row = Math.min(5, Math.max(0, Math.floor((90 - lat) / 30)));
  return { col, row, key: `${col}-${row}` };
};

async function loadTile(col, row) {
  const res = await fetch(`./data/koppen/${col}-${row}.png`);
  if (!res.ok) throw new Error(`koppen tile ${col}-${row}: ${res.status}`);
  // Exact values matter: no colour management, no premultiplying.
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = new OffscreenCanvas(300, 300);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, 300, 300).data;
  const out = new Uint8Array(300 * 300);
  for (let k = 0; k < out.length; k++) out[k] = px[k * 4];
  return out;
}

/** Make sure the tiles within radiusDeg of (lat, lon) are loaded. */
export async function ensureKoppen(lat, lon, radiusDeg = 6) {
  const wanted = new Set();
  for (let dy = -radiusDeg; dy <= radiusDeg; dy += Math.min(radiusDeg, 10))
    for (let dx = -radiusDeg; dx <= radiusDeg; dx += Math.min(radiusDeg, 10)) {
      const la = Math.max(-89.9, Math.min(89.9, lat + dy));
      wanted.add(tileKey(la, lon + dx / Math.max(0.2, Math.cos((lat * Math.PI) / 180))).key);
    }
  await Promise.all([...wanted].map((key) => {
    if (tiles.has(key)) return null;
    if (!pending.has(key)) {
      const [col, row] = key.split("-").map(Number);
      pending.set(key, loadTile(col, row).then((t) => tiles.set(key, t)).catch(() => tiles.set(key, null)).finally(() => pending.delete(key)));
    }
    return pending.get(key);
  }));
}

/** Whether the tile under a point is loaded (so a 0 from koppenAt means sea or no data, not "not yet"). */
export const koppenLoaded = (lat, lon) => !!tiles.get(tileKey(lat, lon).key);

/** The Köppen class at a point (0 if sea, no data, or its tile isn't loaded). */
export function koppenAt(lat, lon) {
  const { col, row, key } = tileKey(lat, lon);
  const t = tiles.get(key);
  if (!t) return 0;
  const x = Math.min(299, Math.max(0, Math.floor(((((lon + 180) % 360) + 360) % 360 - col * 30) / 0.1)));
  const y = Math.min(299, Math.max(0, Math.floor((90 - lat - row * 30) / 0.1)));
  return t[y * 300 + x];
}
