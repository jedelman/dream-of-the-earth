// Finding artifacts on the network, no sign-in needed. Which records point at the
// places around you comes from Constellation (a public backlink index); whether
// their makers are your mutuals comes from Bluesky's public AppView; each record
// is then read from its maker's own PDS, so one deleted there is gone here.
// Nothing in this file writes. Everything fetched is untrusted: ids are checked,
// replies are size-capped, and records go through parseArtifact.
import { placesAround } from "./places.js";
import { NSID, WORLD_URL, parseArtifact, fadeOf } from "./artifacts.js";
import { INTENT_NSID, INTENT_RKEY, parseIntent, allowed } from "./intents.js";

export const CONSTELLATION = "https://constellation.microcosm.blue";
export const APPVIEW = "https://public.api.bsky.app";
const PLC = "https://plc.directory";
export const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.%-]{1,253})$/;
const RKEY_RE = /^[A-Za-z0-9._:~-]{1,512}$/;
const PER_MAKER = 24; // at most this many artifacts from one person in view

/** GET a JSON reply, with a timeout and a size cap. */
async function getJson(url, { timeout = 8000, maxBytes = 256 * 1024 } = {}) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
    const text = await r.text();
    if (text.length > maxBytes) throw new Error(`reply too large from ${new URL(url).host}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

const pdsCache = new Map(); // did -> Promise<"https://...">
/** A DID's PDS, from its DID document (plc.directory, or did:web's well-known file). */
export function pdsOf(did) {
  if (!DID_RE.test(did)) return Promise.reject(new Error("not a DID"));
  if (!pdsCache.has(did)) {
    pdsCache.set(did, (async () => {
      const doc = did.startsWith("did:plc:") ? await getJson(`${PLC}/${did}`) : await getJson(`https://${decodeURIComponent(did.slice(8))}/.well-known/did.json`);
      const s = (doc.service || []).find((x) => x && (x.id === "#atproto_pds" || x.id === `${did}#atproto_pds`));
      if (!s || typeof s.serviceEndpoint !== "string" || !/^https:\/\/[^/?#]+\/?$/.test(s.serviceEndpoint)) throw new Error("no PDS");
      return s.serviceEndpoint.replace(/\/$/, "");
    })().catch((e) => { pdsCache.delete(did); throw e; }));
  }
  return pdsCache.get(did);
}

/** The records that point at a URL from one field: [{ did, rkey }], newest first, at most pages × 100. */
export async function linksTo(url, field = "place", pages = 3, nsid = NSID) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < pages; page++) {
    const q = new URLSearchParams({ subject: url, source: `${nsid}:${field}`, limit: "100" });
    if (cursor) q.set("cursor", cursor);
    const r = await getJson(`${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinks?${q}`);
    for (const x of r.records || []) if (x && x.collection === nsid && DID_RE.test(x.did) && RKEY_RE.test(x.rkey)) out.push({ did: x.did, rkey: x.rkey });
    cursor = typeof r.cursor === "string" ? r.cursor : null;
    if (!cursor) break;
  }
  return out;
}

// ---- Whose things we show (see allowed() in intents.js): mutuals, no blocks, served, not hidden, not muted ----
const FRESH_S = 600; // relationships and profiles are re-read after 10 minutes, so a new block takes effect
const rels = new Map(); // "viewer did" -> { rel, at }
const profiles = new Map(); // did -> { p (profile, or null if Bluesky doesn't serve it), at }
let muted = new Set();
/** The viewer's own mutes (from their signed-in session); nothing when just looking. */
export function setMuted(dids) { muted = new Set(dids); }
const fresh = (e) => e && Date.now() / 1000 - e.at < FRESH_S;
async function loadProfiles(dids) {
  const ask = [...new Set(dids)].filter((d) => !fresh(profiles.get(d)));
  for (let k = 0; k < ask.length; k += 25) {
    const chunk = ask.slice(k, k + 25), q = new URLSearchParams();
    for (const d of chunk) q.append("actors", d);
    const r = await getJson(`${APPVIEW}/xrpc/app.bsky.actor.getProfiles?${q}`);
    const got = new Map((r.profiles || []).filter((p) => p && DID_RE.test(p.did)).map((p) => [p.did, p]));
    for (const d of chunk) profiles.set(d, { p: got.get(d) || null, at: Date.now() / 1000 });
  }
}
/** Which of these DIDs the viewer may see things from (the viewer always sees their own). */
export async function visibleAmong(viewer, dids) {
  const others = [...new Set(dids)].filter((d) => d !== viewer);
  const ask = others.filter((d) => !fresh(rels.get(`${viewer} ${d}`)));
  for (let k = 0; k < ask.length; k += 30) {
    const chunk = ask.slice(k, k + 30), q = new URLSearchParams({ actor: viewer });
    for (const d of chunk) q.append("others", d);
    const r = await getJson(`${APPVIEW}/xrpc/app.bsky.graph.getRelationships?${q}`);
    const got = new Map((r.relationships || []).filter((x) => x && DID_RE.test(x.did)).map((x) => [x.did, x]));
    for (const d of chunk) rels.set(`${viewer} ${d}`, { rel: got.get(d) || null, at: Date.now() / 1000 });
  }
  await loadProfiles(others.filter((d) => rels.get(`${viewer} ${d}`)?.rel?.following && rels.get(`${viewer} ${d}`)?.rel?.followedBy));
  return new Set(dids.filter((d) => d === viewer || allowed(rels.get(`${viewer} ${d}`)?.rel, profiles.get(d)?.p, muted.has(d))));
}
/** Whether an account labels itself a bot (Bluesky's "bot" self-label), from the profiles already read. */
export const isBot = (did) => !!profiles.get(did)?.p?.labels?.some((l) => l && l.val === "bot");
/** Handles for DIDs: Map(did -> "name.bsky.social"). Unknown ones are left out. */
export async function handlesOf(dids) {
  try { await loadProfiles(dids); } catch { /* names are a nicety */ }
  const out = new Map();
  for (const d of dids) { const h = profiles.get(d)?.p?.handle; if (typeof h === "string" && /^[a-z0-9.-]{1,253}$/i.test(h)) out.set(d, h); }
  return out;
}

/** A handle's DID, or null. */
export async function didOf(handle) {
  const h = String(handle).trim().replace(/^@/, "").toLowerCase();
  if (DID_RE.test(h)) return h;
  if (!/^[a-z0-9.-]{1,253}$/.test(h)) return null;
  try { const r = await getJson(`${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(h)}`); return DID_RE.test(r.did) ? r.did : null; } catch { return null; }
}

/** One record's value, read from its maker's PDS (small: 16 KB at most). */
export async function getRecord(did, rkey, nsid = NSID) {
  const base = await pdsOf(did);
  const q = new URLSearchParams({ repo: did, collection: nsid, rkey });
  const r = await getJson(`${base}/xrpc/com.atproto.repo.getRecord?${q}`, { maxBytes: 16 * 1024 });
  return r.value;
}

/** Run jobs a few at a time. */
async function pool(items, n, job) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const k = next++; try { out[k] = await job(items[k]); } catch { out[k] = null; } }
  }));
  return out;
}

/** Read, check and name the wanted records: the artifacts that are still standing. */
async function gather(viewer, byMaker, nowS) {
  const ok = await visibleAmong(viewer, [...byMaker.keys()]);
  const wanted = [];
  for (const [did, rkeys] of byMaker) if (ok.has(did)) for (const rkey of [...rkeys].sort().reverse().slice(0, PER_MAKER)) wanted.push({ did, rkey });
  const values = await pool(wanted, 6, (w) => getRecord(w.did, w.rkey));
  const names = await handlesOf([...new Set(wanted.map((w) => w.did))]);
  const out = [];
  wanted.forEach((w, k) => {
    const a = parseArtifact(values[k], nowS);
    if (!a || fadeOf(a.since, nowS) <= 0) return;
    out.push({ ...a, did: w.did, rkey: w.rkey, uri: `at://${w.did}/${NSID}/${w.rkey}`, handle: names.get(w.did) || null, own: w.did === viewer });
  });
  return out;
}
const group = (links) => {
  const byMaker = new Map();
  for (const l of links) { if (!byMaker.has(l.did)) byMaker.set(l.did, new Set()); byMaker.get(l.did).add(l.rkey); }
  return byMaker;
};

/** Everything the viewer's mutuals (and the viewer) have left anywhere in the dream, still standing. */
export async function discoverWorld({ viewer, nowS = Date.now() / 1000 }) {
  if (!DID_RE.test(viewer)) return [];
  return gather(viewer, group(await linksTo(WORLD_URL, "world", 10)), nowS);
}

/**
 * What the viewer's mutuals (and the viewer) have left around a point: [{ uri, did, rkey, handle, own, ...artifact }].
 * Faded ones are left out. Places that fail to answer are skipped, not fatal.
 */
export async function discover({ viewer, lat, lon, radiusM = 16000, nowS = Date.now() / 1000 }) {
  if (!DID_RE.test(viewer)) return [];
  const cells = placesAround(lat, lon, radiusM);
  const found = (await pool(cells, 6, (c) => linksTo(c.url))).flatMap((x) => x || []);
  return gather(viewer, group(found), nowS);
}

/** The mutuals in the dream right now: [{ did, handle, intent }], from each one's current intent record. */
export async function currentIntents({ viewer, nowS = Date.now() / 1000 }) {
  if (!DID_RE.test(viewer)) return [];
  const dids = [...new Set((await linksTo(WORLD_URL, "world", 3, INTENT_NSID)).map((l) => l.did))].filter((d) => d !== viewer);
  const ok = [...(await visibleAmong(viewer, dids))].filter((d) => d !== viewer);
  const values = await pool(ok, 6, (d) => getRecord(d, INTENT_RKEY, INTENT_NSID));
  const names = await handlesOf(ok);
  const out = [];
  ok.forEach((did, k) => { const it = parseIntent(values[k], nowS); if (it) out.push({ did, handle: names.get(did) || null, intent: it }); });
  return out;
}
