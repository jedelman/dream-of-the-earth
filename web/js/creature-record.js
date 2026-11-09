// Your creature, kept in your own Bluesky repo so it follows you to any device: one record
// (org.jason-edelman.dream.creature, rkey "self"), overwritten when you change it. It holds only what grows the
// creature (seed, stats, genes) and when you last changed it. Jason, 11-09: "Yes! Your creature should follow you."
import { parseGenes } from "./creature-graph.js";
import { STATS, statsFrom } from "./stats.js";

export const CREATURE_NSID = "org.jason-edelman.dream.creature";
export const CREATURE_RKEY = "self";

/** The record for a creature { seed, stats, genes } changed at `at` (ms since 1970). */
export function makeCreatureRecord({ seed, stats, genes }, at = Date.now()) {
  const v = { $type: CREATURE_NSID, seed: seed >>> 0, stats: STATS.map((k) => stats[k]), updatedAt: new Date(at).toISOString() };
  const g = parseGenes(genes);
  if (g) v.genes = g;
  return v;
}

/** A creature record, checked: { seed, stats, genes, at (ms) } or null. Bad genes are dropped, not the creature. */
export function parseCreatureRecord(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  if (v.$type !== undefined && v.$type !== CREATURE_NSID) return null;
  if (!Number.isInteger(v.seed) || v.seed < 0 || v.seed > 0xffffffff) return null;
  const stats = statsFrom(v.stats); // five, or the four from before perception
  if (!stats) return null;
  const at = typeof v.updatedAt === "string" && v.updatedAt.length <= 40 ? Date.parse(v.updatedAt) : NaN;
  return { seed: v.seed, stats, genes: parseGenes(v.genes), at: Number.isFinite(at) ? at : 0 };
}

/**
 * Which creature wins when you sign in on a device: "remote" (adopt what's in your repo), "local" (write this
 * device's creature to your repo), or "same". local: { seed, stats, genes, at, chosen } (chosen: you made or changed
 * it here; a creature you only happened to meet always yields); remote: a parsed record or null.
 */
export function reconcile(local, remote) {
  if (!remote) return local ? "local" : "same";
  if (!local) return "remote";
  if (sameCreature(local, remote)) return "same";
  if (!local.chosen) return "remote";
  return remote.at >= local.at ? "remote" : "local";
}

export const sameCreature = (a, b) =>
  a.seed === b.seed && STATS.every((k) => a.stats[k] === b.stats[k]) && JSON.stringify(parseGenes(a.genes)) === JSON.stringify(parseGenes(b.genes));
