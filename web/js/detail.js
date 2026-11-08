// The detail governor: each device finds how far its forests can reach. Every
// couple of seconds it looks at the median frame time and shortens the far
// reach when frames run slow, or lengthens it when there's headroom. It changes
// only what's drawn, never the world. Pure, so Node can test it.

export const DETAIL_MIN = 0.25, DETAIL_MAX = 1;
export const SLOW_MS = 25, VERY_SLOW_MS = 40, EASY_MS = 18; // under 40 fps, under 25, over 55

/** The next detail scale, given the current one and a median frame time in ms. */
export function governDetail(scale, medianMs) {
  if (medianMs > VERY_SLOW_MS) return Math.max(DETAIL_MIN, scale * 0.6);
  if (medianMs > SLOW_MS) return Math.max(DETAIL_MIN, scale * 0.8);
  if (medianMs < EASY_MS) return Math.min(DETAIL_MAX, scale * 1.1);
  return scale;
}

/** The median of a list of numbers (frame times), robust to the odd hitch. */
export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
