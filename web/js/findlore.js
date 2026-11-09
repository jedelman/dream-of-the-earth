// Finds: things lying out in the world for you to pick up (Jason, 11-09: "lock the other behind an item", "dive depth
// is the unlock", "give people reasons to collaborate"). Computed like everything else: the same find in the same
// place on every phone, by the same cell hash. Taking one changes nothing: each spot gives each player its thing once
// a moon (the inventory keeps which, for the moon that's running). Where they lie is what matters:
//   tidefins on the seabed, 20 m down and more: easy for the sea-born, out of reach of a swim that sleeps (3 m);
//   mossfeet in meadows inland: easy for the land-born, a long crawl for the sea-born;
//   on beaches, now and then, one or the other, washed up: how anyone gets one alone;
//   owl's eyes on high summits, for climbers;
//   far feathers, now and then, wherever something flying very high would drop one: a summit, a beach, a meadow.
// So each kind of creature finds easily what the other needs. Pure, so Node can test it.
import { cellsAround, unit, hash2 } from "./plantforms.js";

export const FIND = {
  shore: { cell: 1100, radius: 4000, salt: 1201, chance: 0.3, max: 16 },
  seabed: { cell: 650, radius: 3000, salt: 1213, chance: 0.45, max: 24 },
  meadow: { cell: 850, radius: 3500, salt: 1229, chance: 0.3, max: 24 },
  summit: { cell: 2600, radius: 9000, salt: 1237, chance: 0.75, max: 10 },
};
/** The seabed finds lie at least this deep (m), past a sleeping swim's 3 m. */
export const SEABED_MIN = 20;
/** And summits are at least this high (m), and the top of their hill. */
export const SUMMIT_MIN = 700;

/** Of finds on summits, beaches and meadows, this share are far feathers instead. */
export const FEATHER_SHARE = { summit: 1 / 3, shore: 1 / 6, meadow: 1 / 5 };

const STEP8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** Where a beach crosses near (x, z): the first land point (0.5 to 6 m up) beside the sea along eight bearings, or null. */
function beachNear(x, z, height, turn) {
  for (let b = 0; b < 8; b++) {
    const a = turn + (b * Math.PI) / 4, dx = Math.cos(a), dz = Math.sin(a);
    let prev = height(x, z), px = x, pz = z;
    for (let d = 50; d <= 550; d += 50) {
      const qx = x + dx * d, qz = z + dz * d, h = height(qx, qz);
      if (prev >= 0.5 && prev <= 6 && h < 0) return { x: px, z: pz, y: prev };
      if (h >= 0.5 && h <= 6 && prev < 0) return { x: qx, z: qz, y: h };
      prev = h; px = qx; pz = qz;
    }
  }
  return null;
}

/** The top of the hill from (x, z), climbing in 120 m steps, then 30 m; null if it's still rising when the steps run out. */
function summitFrom(x, z, height) {
  let h = height(x, z), top = false;
  for (const [step, n] of [[120, 40], [30, 12]]) {
    top = false;
    for (let k = 0; k < n; k++) {
      let best = null;
      for (const [sx, sz] of STEP8) {
        const L = Math.hypot(sx, sz), qx = x + (sx / L) * step, qz = z + (sz / L) * step, q = height(qx, qz);
        if (q > h && (!best || q > best.h)) best = { x: qx, z: qz, h: q };
      }
      if (!best) { top = true; break; }
      ({ x, z, h } = best);
    }
  }
  return top ? { x, z, y: h } : null;
}

/**
 * Finds near a point: [{ key, place, holds, x, y, z, seed }]. place: "shore" | "seabed" | "meadow" | "summit"; holds: the
 * item kind. toLocal(lat, lon) -> { x, z }; height(x, z) -> metres (below 0, the seabed).
 */
export function findsAround(lat, lon, { toLocal, height }) {
  const out = [];
  for (const [place, F] of Object.entries(FIND)) {
    let n = 0;
    for (const c of cellsAround(lat, lon, F.radius, F.cell, F.salt)) {
      if (n >= F.max) break;
      if (unit(c.h) >= F.chance) continue;
      const p = toLocal(c.lat, c.lon), g = hash2(c.h, 7), seed = unit(g, 3);
      let at = null, holds = null;
      if (place === "shore") { at = beachNear(p.x, p.z, height, seed * Math.PI * 2); holds = g & 1 ? "tidefin" : "mossfoot"; }
      else if (place === "seabed") { const h = height(p.x, p.z); if (h <= -SEABED_MIN) at = { x: p.x, z: p.z, y: h }; holds = "tidefin"; }
      else if (place === "meadow") { const h = height(p.x, p.z); if (h >= 3 && h < 3000) at = { x: p.x, z: p.z, y: h }; holds = "mossfoot"; }
      else {
        const top = summitFrom(p.x, p.z, height);
        // Two cells' climbs can reach the same peak: it holds one eye.
        if (top && top.y >= SUMMIT_MIN && !out.some((f) => f.place === "summit" && Math.hypot(f.x - top.x, f.z - top.z) < 150)) at = top;
        holds = "owleye";
      }
      if (!at) continue;
      if (FEATHER_SHARE[place] && unit(g, 11) < FEATHER_SHARE[place]) holds = "farfeather";
      out.push({ key: `${place}${c.h}`, place, holds, x: at.x, y: at.y, z: at.z, seed });
      n++;
    }
  }
  return out;
}
