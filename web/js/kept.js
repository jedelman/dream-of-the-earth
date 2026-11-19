// One save-to-repo machine (issue #61). Your creature, your pouch, your atlas and your intent are each one record in
// your own repo, overwritten. This device keeps its own copy (localStorage, written at once, as before); the machine
// only decides when the repo gets it, and what happens when the repo doesn't answer.
//
//   unsynced → (pull: read, reconcile) → clean ⇄ dirty → settling → writing → saved | failed → (backoff) → writing …
//
// - **unsynced:** signed in, but this device and the repo haven't been brought into step yet. Nothing is written
//   until a pull has worked, so a read that fails can't let this device's copy overwrite the repo's unseen.
// - **dirty / settling:** the record differs from what the repo last got; it waits `settleS` after the last change
//   (a burst of changes is one write) and `gapS` after the last write started.
// - **writing:** one read or write at a time per record.
// - **failed:** retried after 2 s, 5 s, 15 s … up to 5 minutes; the first failure of a streak, and the recovery, are
//   said (`say`). A refusal for scope (a sign-in from before the record existed) switches the record off until the
//   next sign-in, said as "off".
// - Signing in or out (`reset`) starts a new generation: anything still in flight from before lands nowhere.
//
// main.js supplies what to read, write and compare; nothing here touches the network, the DOM or the clock itself.

/** Seconds to wait after the 1st, 2nd, 3rd … failure in a row (the last repeats). */
export const RETRY_S = [2, 5, 15, 30, 60, 120, 300];

/** A refusal that retrying won't fix: this sign-in doesn't cover the record. */
export const isScopeError = (e) => /scope|forbidden|403/i.test(String(e?.message ?? e ?? ""));

/**
 * Which copy wins when a device and the repo disagree: "local", "remote" or "same".
 * The newest one *chosen* wins; a copy this device only started (never chosen here: a creature you happened to meet,
 * a pouch you were given on arrival) always yields to the repo's. Nothing in the repo: this device's copy goes there.
 * @param {{ at: number } | null} local
 * @param {{ at: number } | null} remote
 * @param {(a, b) => boolean} same  whether two copies hold the same thing (ignoring when)
 * @param {(local) => boolean} chosen  whether this device's copy was chosen here
 */
export function newestChosen(local, remote, same, chosen) {
  if (!remote) return local ? "local" : "same";
  if (!local) return "remote";
  if (same(local, remote)) return "same";
  if (!chosen(local)) return "remote";
  return remote.at >= local.at ? "remote" : "local";
}

/**
 * A machine for one record.
 * @param {object} o
 * @param {string} o.name  for logs
 * @param {() => number} o.now  seconds
 * @param {() => string} o.key  what the record holds now, as a string to compare
 * @param {() => Promise<void>} o.push  write the record to the repo
 * @param {(() => Promise<void>) | null} [o.pull]  read the repo's copy and reconcile (adopt it, merge it, or push);
 *   null for a record that's only ever written (the intent)
 * @param {() => number} [o.changedAt]  when the record last changed here (s); settling counts from it
 * @param {() => boolean} [o.ready]  whether writing makes sense right now (e.g. you're looking as yourself)
 * @param {(k) => boolean} [o.due]  replaces "differs from the repo, and settled" (the intent decides for itself)
 * @param {number} [o.settleS]  quiet time after a change before writing
 * @param {number} [o.gapS]  least time between the starts of two writes
 * @param {number[]} [o.retryS]
 * @param {(event: "failed" | "recovered" | "off", error?: Error) => void} [o.say]
 */
export function createKept(o) {
  const retryS = o.retryS ?? RETRY_S;
  const k = {
    name: o.name,
    can: false, // this sign-in covers the record
    off: false, // refused for scope: stays off until the next sign-in
    gen: 0,
    synced: null, // the key the repo last got (or was found holding); null until a pull has worked
    busy: null, // "pull" | "push" | "clear" | null
    flight: null, // the promise in flight
    fails: 0,
    retryAt: -Infinity,
    lastPushAt: -Infinity,
    wrote: false, // a write has worked this generation (so clean reads as "saved")
    lastError: null,

    /** Signed in or out: a new generation. can: whether this sign-in covers the record. */
    reset(can = false) {
      k.gen++;
      k.can = !!can; k.off = false;
      k.synced = o.pull ? null : "";
      k.busy = null; k.flight = null;
      k.fails = 0; k.retryAt = -Infinity; k.lastPushAt = -Infinity; k.wrote = false; k.lastError = null;
    },

    /** Where the machine is: off, unsynced, clean, saved, dirty, settling, writing, failed. */
    phase() {
      if (!k.can || k.off) return "off";
      if (k.busy) return "writing";
      if (k.fails > 0 && o.now() < k.retryAt) return "failed";
      if (k.synced === null) return "unsynced";
      const due = o.due ? o.due(k) : o.key() !== k.synced;
      if (!due) return k.wrote ? "saved" : "clean";
      if (o.due) return "dirty";
      const t = o.now(), since = t - (o.changedAt ? o.changedAt() : -Infinity);
      if (since < (o.settleS ?? 0) || t - k.lastPushAt < (o.gapS ?? 0)) return "settling";
      return "dirty";
    },

    /** Once a second or so: pull if not yet in step, push if dirty. Returns the promise of what it started, or null. */
    tick() {
      if (k.can && !k.off && !k.busy && k.synced === null && !(k.fails > 0 && o.now() < k.retryAt)) return k.pullNow(); // reading your own repo is fine whatever you're doing
      if (o.ready && !o.ready()) return null;
      const p = k.phase();
      if (p === "dirty") return run("push", async () => { const key = o.key(); await o.push(); return key; });
      return null;
    },

    /** Bring this device and the repo into step now (on sign-in, or back to the tab), unless something's in flight. */
    pullNow() {
      if (!o.pull || !k.can || k.off || k.busy) return null;
      return run("pull", async () => { await o.pull(); return o.key(); });
    },

    /** Delete the record (the intent, on leaving): after anything in flight lands, so a late write can't undo it.
     *  The record's state starts over; a failure here isn't retried (readers let a stale intent go). */
    async clear(del) {
      const gen = ++k.gen, wait = k.flight;
      k.busy = "clear";
      try { await wait; } catch { /* its failure was handled where it ran */ }
      try { await del(); } catch (e) { k.lastError = e; }
      if (gen === k.gen) { k.busy = null; k.flight = null; k.synced = o.pull ? null : ""; k.fails = 0; k.retryAt = -Infinity; k.lastPushAt = -Infinity; }
    },
  };

  function run(kind, fn) {
    const gen = k.gen;
    k.busy = kind;
    if (kind === "push") k.lastPushAt = o.now();
    const p = (async () => {
      try {
        const key = await fn();
        if (gen !== k.gen) return { stale: true };
        const recovered = k.fails > 0;
        k.synced = key; k.fails = 0; k.retryAt = -Infinity; k.lastError = null;
        if (kind === "push") k.wrote = true;
        if (recovered) o.say?.("recovered");
        return { ok: true, recovered };
      } catch (e) {
        if (gen !== k.gen) return { stale: true };
        k.lastError = e;
        if (isScopeError(e)) { k.off = true; o.say?.("off", e); return { ok: false, scope: true }; }
        k.fails++;
        k.retryAt = o.now() + retryS[Math.min(k.fails, retryS.length) - 1];
        if (k.fails === 1) o.say?.("failed", e);
        return { ok: false, fails: k.fails };
      } finally {
        if (gen === k.gen) { k.busy = null; k.flight = null; }
      }
    })();
    k.flight = p;
    return p;
  }

  k.reset(false);
  k.gen = 0;
  return k;
}
