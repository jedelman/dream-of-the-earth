// River quests (Jason, 11-10: "Rivers way, but in reverse; you get the quest when you reach the basin, then clues point
// you to the headwaters. The headwaters have a special shrine and unique unlock"). Every basin named for a river or a
// lake has waymarks up its main stem, from near the sea to near the source (scripts/basins/quests.py: 3 to 12, about
// 300 km apart, the same for everyone). Reading one tells you the next: how far, which way, the town by it, what the
// river is called there; touched again, the water carries you up to just below it. Reading the last wakes the spring at
// the source, the headwaters shrine. Drinking from it gives you the river's spring stone (its own colour, and its own
// song: the river's heights from source to sea), draws the whole river on your map, and the water will carry you back
// down to the sea. A river compass, worn, points to the next of them. Pure, so Node can test it; main.js does the rest.

let data = null, loading = null;
const byKey = new Map();

/** Load the quests (quests.json, about 220 KB, once). */
export function ensureQuests() {
  if (!loading) loading = fetch("./data/basins/quests.json").then((r) => (r.ok ? r.json() : null)).then(useQuests).catch(() => { loading = null; });
  return loading;
}
/** Use a quests list (quests.json's contents); for tests, too. */
export function useQuests(j) {
  if (!j || !Array.isArray(j.quests)) return;
  data = j;
  byKey.clear();
  for (const q of j.quests) byKey.set(q.key, q);
}
/** A basin's quest, by the basin's key, or null (a hollow or a dry coast has none; or not loaded yet). */
export const questOf = (key) => byKey.get(key) ?? null;
/** Every quest (for placing waymarks), or none before they're loaded. */
export const allQuests = () => data?.quests ?? [];

/** A waymark's key, as your atlas keeps it: the basin's key and its number from the sea ("seine-river:2"). */
export const wayKey = (q, i) => `${q.key}:${i}`;

const R = 6371008.8, rad = Math.PI / 180;
/** Metres between two points. */
export function metres(a, b) {
  const s = Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
/** The bearing from a to b, degrees clockwise from north. */
export function bearing(a, b) {
  const p1 = a[0] * rad, p2 = b[0] * rad, dl = (b[1] - a[1]) * rad;
  return ((Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / rad) + 360) % 360;
}
const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
/** A bearing in words: "north-west". */
export const compassWords = (deg) => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
/** An arrow for a direction relative to the way you face (0 straight ahead, clockwise). */
export const arrow = (rel) => "↑↗→↘↓↙←↖"[Math.round((((rel % 360) + 360) % 360) / 45) % 8];
/** A distance in words: "1.4 km", "378 km". */
export const kmText = (m) => (m < 9500 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000).toLocaleString("en")} km`);

/** Which of a quest's waymarks you've read (numbers, from the sea up). ways: { [wayKey]: at }. */
export const readOf = (q, ways) => q.ways.map((_, i) => i).filter((i) => ways[wayKey(q, i)] != null);
/** Whether the spring at the source is awake for you: you've read the last waymark (or drunk from it already). */
export const springAwake = (q, ways, springs) => springs[q.key] != null || ways[wayKey(q, q.ways.length - 1)] != null;

/**
 * Where the river compass points: { kind: "way", i, at } (a waymark), { kind: "spring", at }, or null (the river is
 * yours). Before you've read any, the nearest waymark; after, the one above the highest you've read; after the last, the
 * spring. here: [lat, lon].
 */
export function target(q, ways, springs, here) {
  if (springs[q.key] != null) return null;
  const read = readOf(q, ways);
  if (read.length) {
    const top = Math.max(...read);
    return top >= q.ways.length - 1 ? { kind: "spring", at: q.source.at } : { kind: "way", i: top + 1, at: q.ways[top + 1].at };
  }
  let best = 0;
  q.ways.forEach((w, i) => { if (metres(here, w.at) < metres(here, q.ways[best].at)) best = i; });
  return { kind: "way", i: best, at: q.ways[best].at };
}

const by = (w) => (w.town ? (w.townKm <= 15 ? `by ${w.town}` : `near ${w.town}`) : null);
const riverName = (n) => (n ? `the ${n}` : "the river");
/**
 * What a waymark says, read: where it is, and where the next one (or the spring) is. label: the basin's label ("Seine
 * River basin"), river: its river's name for the text ("Seine River").
 */
export function clueLine(q, i, { label, river } = {}) {
  const w = q.ways[i], K = q.ways.length, last = i === K - 1, here = by(w);
  const name = river ? `the ${river}` : `the ${label}`;
  const own = w.river && !(river || label || "").startsWith(w.river); // "on the Ucayali", but not "the Seine River, on the Seine"
  const head = `Waymark ${i + 1} of ${K} of ${name}${own ? `, on ${riverName(w.river)}` : ""}${here ? `, ${here}` : ""}${last ? ": the last" : ""}.`;
  const next = last ? q.source : q.ways[i + 1], d = kmText(metres(w.at, next.at)), dir = compassWords(bearing(w.at, next.at)), at = by(next);
  if (last) return `${head} Upstream, ${d} ${dir}${at ? `, ${at}` : ""}, the river begins, and its spring wakes for you. Touch the waymark again, and the water carries you up to it.`;
  const same = next.river && next.river === w.river;
  return `${head} Upstream, ${d} ${dir}${at ? `, ${at}` : ""}, ${next.river ? (same ? `the river is still ${riverName(next.river)}` : `the river is called ${riverName(next.river)}`) : "the next waymark stands by the water"}. Touch the waymark again, and the water carries you there.`;
}

/** The point on the stem s km from the sea (interpolated along the simplified line): [lat, lon]. */
export function alongStem(q, s) {
  const L = q.line;
  if (s <= L[0][2]) return [L[0][0], L[0][1]];
  for (let k = 1; k < L.length; k++) {
    if (s <= L[k][2]) { const t = (s - L[k - 1][2]) / Math.max(1e-9, L[k][2] - L[k - 1][2]); return [L[k - 1][0] + (L[k][0] - L[k - 1][0]) * t, L[k - 1][1] + (L[k][1] - L[k - 1][1]) * t]; }
  }
  const e = L[L.length - 1];
  return [e[0], e[1]];
}
/** How far from the sea a target stands (km along the stem): a waymark's s, or the whole length for the spring. */
const sOf = (q, t) => (t.kind === "spring" ? q.len : q.ways[t.i].s);

/** The point d metres from p on a bearing (short distances: flat is fine). */
export function offset(p, deg, d) {
  const a = deg * rad;
  return [p[0] + (d * Math.cos(a)) / 111320, p[1] + (d * Math.sin(a)) / (111320 * Math.max(0.05, Math.cos(p[0] * rad)))];
}
/**
 * Where the water sets you down for a target: 1.5 km downstream of where it stands (the river's way there, from the
 * stem), facing it. { lat, lon, heading (degrees) }. (Not a point on the stem itself: a waymark stands on the river's own
 * line, which can lie kilometres off the stem's coarse cells and its simplified line.)
 */
export function landing(q, t) {
  const s = sOf(q, t), up = bearing(alongStem(q, Math.max(0, s - 8)), alongStem(q, Math.min(q.len, s + (t.kind === "spring" ? 0 : 8))));
  const p = offset(t.at, up + 180, 1500);
  return { lat: p[0], lon: p[1], heading: bearing(p, t.at) };
}

/** The stem's points between two distances from the sea, the ends included: [[lat, lon]], for the clouds to clear along. */
export function stretch(q, s0, s1) {
  const out = [alongStem(q, s0)];
  for (const p of q.line) if (p[2] > s0 && p[2] < s1) out.push([p[0], p[1]]);
  out.push(alongStem(q, s1));
  return out;
}

/** Points every step degrees along a path (to turn it into cells). */
export function densify(path, step = 0.1) {
  const out = [];
  for (let k = 1; k < path.length; k++) {
    const [a, b] = [path[k - 1], path[k]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < n; j++) out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
  }
  if (path.length) out.push(path[path.length - 1]);
  return out;
}

const hash = (s) => { let x = 2166136261; for (let k = 0; k < s.length; k++) x = Math.imul(x ^ s.charCodeAt(k), 16777619); return x >>> 0; };
/** A river's spring stone: { hue (0..1), facets (5..9), tall (1..1.8) }, its own, from its key. */
export function stoneOf(q) {
  const h = hash(q.key);
  return { hue: (h % 3600) / 3600, facets: 5 + ((h >>> 12) % 5), tall: 1 + ((h >>> 16) % 9) / 10 };
}
/** The river's song: its heights from source to sea (quests.json's song, a digit a note) on a pentatonic scale, Hz. */
export function songOf(q) {
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  return [...q.song].map((d) => 330 * 2 ** (scale[Number(d)] / 12));
}
