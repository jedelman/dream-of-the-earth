// Pathfinding for tap-to-move: A* over a grid of travel times built from the
// terrain. Land costs the time it takes to run (more on slopes), water the time
// to swim, and cliffs can't be climbed, so a creature that swims slowly walks
// round a lake and a strong swimmer crosses it. Pure, so Node can test it.

const SQRT2 = Math.SQRT2;
export const CLIFF = 0.85; // rise over run: steeper than this can't be climbed on foot

/** A* on a cost grid (seconds per metre, Infinity = impassable). Returns [[i, j], ...] or null. */
export function astar(cost, w, h, start, goal) {
  const idx = (i, j) => j * w + i;
  const minCost = Math.min(...cost.filter((c) => c < Infinity));
  const g = new Float64Array(w * h).fill(Infinity), from = new Int32Array(w * h).fill(-1), closed = new Uint8Array(w * h);
  const heap = []; // binary min-heap of [f, index]
  const push = (f, k) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } }
    return top;
  };
  const hfn = (i, j) => Math.hypot(i - goal[0], j - goal[1]) * minCost;
  const s = idx(...start), t = idx(...goal);
  if (!(cost[s] < Infinity) || !(cost[t] < Infinity)) return null;
  g[s] = 0;
  push(hfn(...start), s);
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    if (k === t) break;
    closed[k] = 1;
    const i = k % w, j = (k - i) / w;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const n = idx(ni, nj);
        if (closed[n] || !(cost[n] < Infinity)) continue;
        // No cutting a corner between two impassable cells.
        if (di && dj && (!(cost[idx(i + di, j)] < Infinity) || !(cost[idx(i, j + dj)] < Infinity))) continue;
        const step = ((cost[k] + cost[n]) / 2) * (di && dj ? SQRT2 : 1);
        if (g[k] + step < g[n]) { g[n] = g[k] + step; from[n] = k; push(g[n] + hfn(ni, nj), n); }
      }
  }
  if (!(g[t] < Infinity)) return null;
  const path = [];
  for (let k = t; k !== -1; k = from[k]) path.push([k % w, (k - (k % w)) / w]);
  return path.reverse();
}

/** Drop waypoints a straight walk can skip: the line must stay on cells that cost about the same and are passable. */
export function simplify(path, cost, w) {
  if (path.length <= 2) return path;
  const clear = (a, b) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    const c0 = cost[a[1] * w + a[0]];
    for (let k = 1; k < n; k++) {
      const i = Math.round(a[0] + ((b[0] - a[0]) * k) / n), j = Math.round(a[1] + ((b[1] - a[1]) * k) / n);
      const c = cost[j * w + i];
      if (!(c < Infinity) || c > c0 * 1.6 || c < c0 / 1.6) return false;
    }
    return true;
  };
  const out = [path[0]];
  let anchor = path[0];
  for (let k = 1; k < path.length - 1; k++) {
    if (!clear(anchor, path[k + 1])) { out.push(path[k]); anchor = path[k]; }
  }
  out.push(path[path.length - 1]);
  return out;
}

/**
 * A route on foot (and by water) from `from` to `to` ({x, z} metres), over terrain
 * heightAt(x, z) (below 0 is water), for a creature with speeds { run, swim }.
 * Returns [{x, z}, ...] ending at `to`, or null if there's no way.
 */
export function planPath(from, to, heightAt, speeds, maxCells = 140) {
  const D = Math.hypot(to.x - from.x, to.z - from.z);
  const margin = Math.max(300, D * 0.35);
  const x0 = Math.min(from.x, to.x) - margin, z0 = Math.min(from.z, to.z) - margin;
  const spanX = Math.abs(to.x - from.x) + 2 * margin, spanZ = Math.abs(to.z - from.z) + 2 * margin;
  const cell = Math.max(12, Math.max(spanX, spanZ) / maxCells);
  const w = Math.ceil(spanX / cell) + 1, h = Math.ceil(spanZ / cell) + 1;
  const heights = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) heights[j * w + i] = heightAt(x0 + i * cell, z0 + j * cell);
  const cost = new Float32Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i, hh = heights[k];
      if (hh < 0) { cost[k] = 1 / speeds.swim; continue; }
      // Slopes are measured on the surface you move over: the water's surface, not the seafloor.
      const nb = (a, b) => Math.max(0, heights[Math.min(h - 1, Math.max(0, b)) * w + Math.min(w - 1, Math.max(0, a))]);
      const slope = Math.max(Math.abs(nb(i + 1, j) - nb(i - 1, j)), Math.abs(nb(i, j + 1) - nb(i, j - 1))) / (2 * cell);
      cost[k] = slope > CLIFF ? Infinity : (1 / speeds.run) * (1 + 3 * slope);
    }
  const cellOf = (p) => [Math.round((p.x - x0) / cell), Math.round((p.z - z0) / cell)];
  const s = cellOf(from), t = cellOf(to);
  const path = astar(cost, w, h, s, t);
  if (!path) return null;
  const pts = simplify(path, cost, w).slice(1, -1).map(([i, j]) => ({ x: x0 + i * cell, z: z0 + j * cell }));
  return [...pts, { x: to.x, z: to.z }];
}
