// Step 2 of the basins: from the grid (grid.py), where every bit of land drains. A priority flood from the sea (Barnes
// et al., "Priority-Flood", 2014: the lowest unvisited cell next, every cell draining to the one that reached it) gives
// each cell a downstream neighbour and an outlet, so flats and the coarse grid's false pits route themselves. Natural
// Earth's rivers are cut a trench for the flood (see trench), so water follows the real channels the 0.1° grid blurs.
// (Letting rivers run on at their mouth's level instead crossed divides wherever two rivers' lines meet: the Orinoco
// took the Amazon through the Casiquiare.) The lakes with no outlet (terminals.py) are outlets of their
// own: their basins drain nowhere, as they do. Then the area each cell drains, the basins big enough to name, and each
// one's main stem: from the mouth, up the biggest branch, to its headwaters.
// Writes basins.u16 (basin id per cell, 0 = the sea or a small coastal basin) and basins-raw.json.
import fs from "node:fs";
const [dir] = process.argv.slice(2);
const W = 3600, H = 1800, RES = 0.1, R = 6371.0088;
const elev = new Float32Array(fs.readFileSync(`${dir}/elev.f32`).buffer.slice(0));
const sea = new Uint8Array(fs.readFileSync(`${dir}/sea.u8`));
const carved = new Uint8Array(fs.readFileSync(`${dir}/carved.u8`));
const terminals = JSON.parse(fs.readFileSync(`${dir}/terminals.json`, "utf8"));
const river = new Uint16Array(fs.readFileSync(`${dir}/river.u16`).buffer.slice(0));
const rivers = JSON.parse(fs.readFileSync(`${dir}/rivers.json`, "utf8"));
const koppen = new Uint8Array(fs.readFileSync(`${dir}/koppen.u8`));
const net = new Uint16Array(fs.readFileSync(`${dir}/net.u16`).buffer.slice(0));
const plain = (n) => (n || "").replace(/ River$/, "") || null; // "Paraná River" and "Paraná" are one river
const riverName = (i) => { const r = river[i] ? rivers[river[i] - 1] : null; return r ? plain(r.en || r.name) : null; };
const riverRank = (i) => (river[i] ? rivers[river[i] - 1].rank : 99);
// A river's trench: half its height, at most 200 m, or 300 m for a big river and 500 m for the greatest (Natural Earth's
// scalerank 1-3: the Amazon, the Mekong, the Congo...). In the lowlands a river keeps its slope (a flat trench there let
// whichever mouth's flood came first take a whole lowland: the Orinoco took the Amazon); in mountains a gorge opens,
// as deep as the grid needs: at 0.1° the Mekong's gorges in Laos read 300-500 m above its water.
const trench = (i) => { const h = elev[i], cut = riverRank(i) <= 3 ? 500 : riverRank(i) <= 6 ? 300 : 200; return h > 0 ? h - Math.min(cut, 0.5 * h) : h; };
// How much of a cell's rain reaches a river, roughly, by its climate: deserts (BW) almost none, steppes (BS) some, the
// ice sheets (EF) next to none. Used to choose a basin's main stem, so a dry Saharan wadi doesn't outrank the Chari.
const ARID = new Set([4, 5]), STEPPE = new Set([6, 7]), ICE = 30;
const wet = (i) => (ARID.has(koppen[i]) ? 0.02 : STEPPE.has(koppen[i]) ? 0.3 : koppen[i] === ICE ? 0.02 : 1);
const N = W * H;
const latOf = (i) => 90 - (Math.floor(i / W) + 0.5) * RES, lonOf = (i) => -180 + ((i % W) + 0.5) * RES;
const area = (i) => R * R * (RES * Math.PI / 180) ** 2 * Math.cos((latOf(i) * Math.PI) / 180); // km²
function* around(i) {
  const r = Math.floor(i / W), c = i % W;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr; if (rr < 0 || rr >= H) continue;
    yield rr * W + ((c + dc + W) % W);
  }
}
// A binary heap on (priority, sequence): equal heights come out in the order they went in, so flats spread evenly.
class Heap {
  constructor(n) { this.p = new Float64Array(n); this.s = new Float64Array(n); this.v = new Int32Array(n); this.n = 0; this.seq = 0; }
  push(v, p) { let k = this.n++; this.p[k] = p; this.s[k] = this.seq++; this.v[k] = v; while (k > 0) { const q = (k - 1) >> 1; if (this.less(q, k)) break; this.swap(q, k); k = q; } }
  less(a, b) { return this.p[a] < this.p[b] || (this.p[a] === this.p[b] && this.s[a] < this.s[b]); }
  swap(a, b) { [this.p[a], this.p[b]] = [this.p[b], this.p[a]]; [this.s[a], this.s[b]] = [this.s[b], this.s[a]]; [this.v[a], this.v[b]] = [this.v[b], this.v[a]]; }
  pop() { const top = this.v[0]; this.n--; if (this.n > 0) { this.p[0] = this.p[this.n]; this.s[0] = this.s[this.n]; this.v[0] = this.v[this.n]; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < this.n && this.less(l, m)) m = l; if (r < this.n && this.less(r, m)) m = r; if (m === k) break; this.swap(k, m); k = m; } } return top; }
}
function flood(extraOutlets = []) {
  const parent = new Int32Array(N).fill(-2), outlet = new Int32Array(N).fill(-1), filled = new Float32Array(N), order = new Int32Array(N);
  const heap = new Heap(N + 16); let m = 0;
  for (let i = 0; i < N; i++) if (sea[i]) parent[i] = -3; // the sea: never visited
  // Every land cell touching the sea is a mouth; so is each closed hollow's lowest cell.
  for (let i = 0; i < N; i++) {
    if (sea[i]) continue;
    for (const j of around(i)) if (sea[j]) { parent[i] = -1; outlet[i] = i; filled[i] = elev[i]; heap.push(i, elev[i]); break; }
  }
  for (const i of extraOutlets) if (parent[i] === -2) { parent[i] = -1; outlet[i] = i; filled[i] = elev[i]; heap.push(i, elev[i]); }
  while (heap.n) {
    const c = heap.pop(); order[m++] = c;
    for (const j of around(c)) {
      if (parent[j] !== -2) continue;
      // Into a river's trench from the hillside or along its own network; from another network, over the bank.
      const cut = carved[j] && (!carved[c] || net[c] === net[j]);
      parent[j] = c; outlet[j] = outlet[c]; filled[j] = Math.max(cut ? trench(j) : elev[j], filled[c]);
      heap.push(j, filled[j]);
    }
  }
  return { parent, outlet, filled, order, m };
}
// First pass: the lakes with no outlet are the only ends inland.
const first0 = flood(terminals.map((t) => t.cell));
// The desert's hollows. A closed hollow in a dry climate (BW or BS) holds its water: the Sahara, Arabia, the Iranian
// plateau and the Australian interior are patchworks of basins that never reach the sea, and filling them up until they
// spill (as a pit in a humid place would) sent central Iran to the Caspian through the Karakum. So a hollow at least 20 m
// deep and 20 cells wide, mostly arid, that no Natural Earth river runs through (a river crossing a desert, the Nile,
// keeps its way), ends at its lowest cell, unnamed.
const base = (i) => (carved[i] ? trench(i) : elev[i]);
const seen = new Uint8Array(N), sinks = [];
for (let i0 = 0; i0 < N; i0++) {
  if (seen[i0] || sea[i0] || first0.filled[i0] - base(i0) < 0.5) continue;
  const stack = [i0]; seen[i0] = 1;
  let size = 0, arid = 0, drawn = 0, deep = 0, low = i0;
  while (stack.length) {
    const c = stack.pop(); size++;
    if (ARID.has(koppen[c]) || STEPPE.has(koppen[c])) arid++;
    if (carved[c]) drawn++;
    deep = Math.max(deep, first0.filled[c] - base(c));
    if (base(c) < base(low)) low = c;
    for (const j of around(c)) if (!seen[j] && !sea[j] && first0.filled[j] - base(j) >= 0.5) { seen[j] = 1; stack.push(j); }
  }
  if (!drawn && deep >= 20 && size >= 20 && arid >= size / 2) sinks.push(low);
}
const f = flood([...terminals.map((t) => t.cell), ...sinks]);
const terminalName = new Map(terminals.map((t) => [t.cell, t.name]));
const closed = new Set([...terminals.map((t) => t.cell), ...sinks]);
// Area drained by each cell (upstream first), and the water it carries (area weighed by climate).
const acc = new Float64Array(N), flow = new Float64Array(N), ice = new Float64Array(N);
for (let k = 0; k < f.m; k++) { const c = f.order[k]; acc[c] = area(c); flow[c] = acc[c] * wet(c); ice[c] = koppen[c] === ICE ? acc[c] : 0; }
for (let k = f.m - 1; k >= 0; k--) { const c = f.order[k], p = f.parent[c]; if (p >= 0) { acc[p] += acc[c]; flow[p] += flow[c]; ice[p] += ice[c]; } }
// The basins big enough to name: outlets draining at least 50,000 km², and not mostly ice sheet (Antarctica's and
// Greenland's ice drains too, but by glaciers, with no river to follow).
const MIN = 50000;
const outs = [];
for (let k = 0; k < f.m; k++) { const c = f.order[k]; if (f.parent[c] === -1 && acc[c] >= MIN && ice[c] < acc[c] / 2) outs.push(c); }
outs.sort((a, b) => acc[b] - acc[a]);
const idOf = new Map(outs.map((o, k) => [o, k + 1]));
const basin = new Uint16Array(N);
for (let i = 0; i < N; i++) if (f.outlet[i] >= 0) basin[i] = idOf.get(f.outlet[i]) ?? 0;
// Children, for walking upstream.
const first = new Int32Array(N).fill(-1), nextSib = new Int32Array(N).fill(-1);
for (let i = 0; i < N; i++) { const p = f.parent[i]; if (p >= 0) { nextSib[i] = first[p]; first[p] = i; } }

// Upstream from a cell, following a river called `name`: the branch along which the name carries on furthest (the
// Mississippi past the Missouri, to Lake Itasca; the Lena past the Vitim), counting its cells among the next 25 river
// cells up each branch (a confluence is often drawn a cell or two off, and a reservoir can break the name). Else the wettest branch Natural Earth
// draws, else the wettest. A branch under a fifth of the wettest doesn't keep the name.
function nameRun(ch, name) {
  let count = 0; const todo = [ch], depth = [0];
  while (todo.length) {
    const x = todo.pop(), d = depth.pop();
    if (riverName(x) === name) count++;
    if (d < 25) for (let g = first[x]; g >= 0; g = nextSib[g]) if (carved[g]) { todo.push(g); depth.push(d + 1); }
  }
  return count;
}
function upstream(c, name) {
  let big = -1;
  for (let ch = first[c]; ch >= 0; ch = nextSib[ch]) if (big < 0 || flow[ch] > flow[big]) big = ch;
  if (big < 0) return [-1, name];
  let same = -1, run = 0, drawn = -1;
  for (let ch = first[c]; ch >= 0; ch = nextSib[ch]) {
    if (flow[ch] < flow[big] * 0.2) continue;
    const n = name ? nameRun(ch, name) : 0;
    if (n > run || (n === run && n > 0 && flow[ch] > flow[same])) { same = ch; run = n; }
    if (carved[ch] && (drawn < 0 || flow[ch] > flow[drawn])) drawn = ch;
  }
  if (same >= 0) return [same, name];
  const up = drawn >= 0 ? drawn : big;
  return [up, riverName(up) || name];
}
const raw = outs.map((o, k) => {
  // The main stem: upstream until the branch is small.
  const stem = [o]; let c = o, name = riverName(o);
  for (;;) {
    const [up, next] = upstream(c, name);
    if (up < 0 || acc[up] < 200 || flow[up] < flow[o] * 0.0005) break;
    stem.push(up); c = up; name = next;
  }
  // Its name: the most important river of the first 40 named cells from the mouth, and of those the longest (the
  // Nile, not its Rosetta branch; the Rhine, not the Lek).
  const tally = new Map(); let n = 0;
  for (const i of stem) { const r = riverName(i); if (!r) continue; const t = tally.get(r) || { rank: 99, cells: 0 }; t.rank = Math.min(t.rank, riverRank(i)); t.cells++; tally.set(r, t); if (++n >= 40) break; }
  const riverAt = [...tally].sort((a, b) => a[1].rank - b[1].rank || b[1].cells - a[1].cells)[0]?.[0] ?? null;
  return {
    id: k + 1, areaKm2: Math.round(acc[o]), closed: closed.has(o), endsIn: terminalName.get(o) || null, river: riverAt,
    mouth: [latOf(o), lonOf(o)], source: [latOf(c), lonOf(c)], sourceElev: Math.round(elev[c]),
    stem: stem.map((i) => [+latOf(i).toFixed(2), +lonOf(i).toFixed(2), Math.round(acc[i]), river[i] ? plain(rivers[river[i] - 1].name || rivers[river[i] - 1].en) : ""]),
  };
});
console.log("desert hollows:", sinks.length);
if (process.env.TRACE) { // where a drop from TRACE="lat,lon" goes, every 25 cells
  const [la, lo] = process.env.TRACE.split(",").map(Number);
  let i = Math.floor((90 - la) / RES) * W + Math.floor((lo + 180) / RES), k = 0;
  while (i >= 0) { if (process.env.TRACE_ALL || k++ % 25 === 0 || f.parent[i] < 0) console.log("trace", latOf(i).toFixed(2), lonOf(i).toFixed(2), "elev", Math.round(elev[i]), "filled", Math.round(f.filled[i]), carved[i] ? "river " + net[i] + " " + riverName(i) : "", f.parent[i] < 0 ? "OUTLET" : ""); i = f.parent[i]; }
}
fs.writeFileSync(`${dir}/basins.u16`, Buffer.from(basin.buffer));
fs.writeFileSync(`${dir}/basins-raw.json`, JSON.stringify(raw));
console.log("basins:", raw.length, "| largest:", raw.slice(0, 8).map((b) => `${b.mouth.map((v) => v.toFixed(1))} ${Math.round(b.areaKm2 / 1000)}k`).join("; "));
