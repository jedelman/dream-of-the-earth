// "Once per period": one rule for every gift the sky gives you once and then holds back until the period turns.
//
// A period is a number that only grows: a lunation (moon.js: the moonseed, finds, the rhizome's shrine waking), a full
// moon's number (the portal), or the moment a shrine's present waking began (shrinelore.js: its gift, its dream).
// The caller works the period out; this module only keeps the rule, so the six latches can't drift apart.
//
// A record is a plain object of marks, { key: mark }, where a mark is the period (or a moment inside it) when the gift
// was last had. The gift is allowed when there's no mark, or the mark is from before this period. Pure: nothing here
// reads the clock or storage.

/** A mark that counts: a number. Anything else (missing, null, a string, NaN) is "never", as is -1 from an old record. */
const markOf = (record, key) => {
  const m = record?.[key];
  return typeof m === "number" && !Number.isNaN(m) ? m : -Infinity;
};

/** Whether the gift under `key` was already had in `period`. */
export const hadIn = (record, period, key) => markOf(record, key) >= period;

/**
 * May the gift under `key` be had in `period`? Returns { allowed, next }: next is the record with the gift marked
 * (stamped with `stamp`, the period itself unless the caller keeps moments, as the shrines do), or the record unchanged
 * when it isn't allowed. The record passed in is never changed.
 */
export function oncePer(record, period, key, stamp = period) {
  if (hadIn(record, period, key)) return { allowed: false, next: record };
  return { allowed: true, next: { ...(record ?? {}), [key]: stamp } };
}

/**
 * A list of keys had in one period ({ period, keys }, the shape finds keep on disk as `took: { lunation, keys }`) as
 * marks: every key marked with that period. A list from another period marks nothing.
 */
export const marksOfList = (list, period) => (list && list.period === period ? Object.fromEntries(list.keys.map((k) => [k, period])) : {});
