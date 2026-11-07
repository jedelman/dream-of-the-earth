// Seeded randomness. World generation never uses Math.random: the same seed
// gives the same thing on every device.

/** mulberry32: a small, fast 32-bit PRNG. Returns a function giving [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string to a 32-bit unsigned integer. */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
export const range = (rand, lo, hi) => lo + rand() * (hi - lo);
export const int = (rand, lo, hi) => Math.floor(range(rand, lo, hi + 1));
