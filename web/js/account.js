// Signing in with Bluesky, to leave cairns, to keep your creature with you, and to let mutuals see it. The
// OAuth client (web/vendor, ~210 KB) loads only when someone signs in or comes back
// signed in; its scope reaches six collections of your own (below) and reading your own mute list. Seeing what
// mutuals left needs none of this.
// Writes go through the session's own fetch handler (DPoP-bound tokens), to the
// player's own PDS.
import { NSID } from "./artifacts.js";
import { INTENT_NSID, INTENT_RKEY } from "./intents.js";
import { CREATURE_NSID, CREATURE_RKEY } from "./creature-record.js";
import { INVENTORY_NSID, INVENTORY_RKEY } from "./inventory.js";
import { ATLAS_NSID, ATLAS_RKEY } from "./atlas-record.js";
import { PIGEON_NSID } from "./pigeons.js";
export { PIGEON_NSID };

// Six collections in your repo (the cairns you leave, your creature, what you carry, your atlas, the pigeons you send,
// your one current intent), and reading your own mute list so muted accounts stay out of your world. Nothing else.
const MUTES = "rpc:app.bsky.graph.getMutes?aud=did:web:api.bsky.app%23bsky_appview";
// Sharing a screenshot (11-09, Jason: "Can we add a 'share screenshot to bluesky' button?"): create posts only (never
// edit or delete them) and upload images.
export const POST_SCOPE = "repo:app.bsky.feed.post?action=create", IMAGE_SCOPE = "blob:image/*";
export const SCOPE = `atproto repo:${NSID} repo:${CREATURE_NSID} repo:${INVENTORY_NSID} repo:${ATLAS_NSID} repo:${PIGEON_NSID} repo:${INTENT_NSID} ${POST_SCOPE} ${IMAGE_SCOPE} ${MUTES}`;
const HANDLE_RESOLVER = "https://bsky.social";
const KEY = "dream.did", RETURN = "dream.return";

let client = null, session = null;
const listeners = new Set();
const store = {
  get: (k, s = localStorage) => { try { return s.getItem(k); } catch { return null; } },
  set: (k, v, s = localStorage) => { try { v == null ? s.removeItem(k) : s.setItem(k, v); } catch { /* private mode */ } },
};

function clientId() {
  // Local development: atproto's loopback client needs no hosted metadata.
  if (["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)) {
    const host = location.hostname === "localhost" ? "127.0.0.1" : location.hostname;
    const redirect = `http://${host}:${location.port}/`;
    return `http://localhost?redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(SCOPE)}`;
  }
  return `${location.origin}/client-metadata.json`;
}
async function load() {
  if (client) return client;
  const { BrowserOAuthClient } = await import("../vendor/oauth-client-browser.js");
  client = await BrowserOAuthClient.load({ clientId: clientId(), handleResolver: HANDLE_RESOLVER, onSessionDeleted: () => set(null) });
  return client;
}
function set(s) {
  session = s;
  store.set(KEY, s ? s.did : null);
  for (const fn of listeners) fn(session ? session.did : null);
}
/** Coming back from the sign-in page: the reply rides in the URL fragment or query. */
export const isReturning = () => /[#?&]state=/.test(location.hash + location.search) && /[#?&](code|error)=/.test(location.hash + location.search);
/** Where you were before signing in (a query string for the game's own URL parameters), once. */
export function takeReturn() {
  const q = store.get(RETURN, sessionStorage);
  store.set(RETURN, null, sessionStorage);
  return q;
}

async function xrpc(method, body) {
  if (!session) throw new Error("not signed in");
  const r = await session.fetchHandler(`/xrpc/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `${r.status}`);
  return j;
}

async function covers(scope) {
  if (!session) return false;
  try { const info = await session.getTokenInfo(false); return String(info.scope || "").split(" ").includes(scope); } catch { return false; }
}

export const account = {
  get did() { return session ? session.did : null; },
  /** Whether this sign-in covers sharing your intent (a sign-in from before intents existed doesn't). */
  canShare: () => covers(`repo:${INTENT_NSID}`),
  /** Whether this sign-in covers keeping your creature in your repo (one from before 11-09 doesn't). */
  canKeep: () => covers(`repo:${CREATURE_NSID}`),
  /** Whether this sign-in covers what you carry (one from before moonseeds doesn't). */
  canCarry: () => covers(`repo:${INVENTORY_NSID}`),
  /** Whether this sign-in covers your atlas (one from before 11-09's second evening doesn't). */
  canMap: () => covers(`repo:${ATLAS_NSID}`),
  /** One of your own records, or null if there isn't one. */
  async getOwn(collection, rkey) {
    if (!session) return null;
    const q = `repo=${encodeURIComponent(session.did)}&collection=${collection}&rkey=${rkey}`;
    const r = await session.fetchHandler(`/xrpc/com.atproto.repo.getRecord?${q}`, { headers: { accept: "application/json" } });
    if (r.status === 400 || r.status === 404) return null; // none yet
    if (!r.ok) throw new Error(`${r.status}`);
    return (await r.json()).value ?? null;
  },
  /** One of your own records, overwritten. */
  putOwn: (collection, rkey, record) => xrpc("com.atproto.repo.putRecord", { repo: session.did, collection, rkey, record }),
  /** Your creature's record, or null if there isn't one (or it can't be read). */
  getCreature: () => account.getOwn(CREATURE_NSID, CREATURE_RKEY),
  /** Your creature, overwritten. */
  putCreature: (record) => account.putOwn(CREATURE_NSID, CREATURE_RKEY, record),
  getInventory: () => account.getOwn(INVENTORY_NSID, INVENTORY_RKEY),
  putInventory: (record) => account.putOwn(INVENTORY_NSID, INVENTORY_RKEY, record),
  /** Whether this sign-in covers posting a screenshot (one from before sharing doesn't). */
  canPost: async () => (await covers(POST_SCOPE)) && (await covers(IMAGE_SCOPE)),
  /** An image up to your PDS: its blob ref, for a post to embed. */
  async uploadImage(blob) {
    if (!session) throw new Error("not signed in");
    const r = await session.fetchHandler("/xrpc/com.atproto.repo.uploadBlob", { method: "POST", headers: { "content-type": blob.type }, body: blob });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.error || `${r.status}`);
    return j.blob;
  },
  /** A Bluesky post from you: { uri, cid }. */
  post: (record) => xrpc("com.atproto.repo.createRecord", { repo: session.did, collection: "app.bsky.feed.post", record }),
  /** Whether this sign-in covers sending pigeons (one from before moonseeds doesn't). */
  canFly: () => covers(`repo:${PIGEON_NSID}`),
  /** A pigeon off to a mutual: a new record in your repo. */
  sendPigeon: (record) => xrpc("com.atproto.repo.createRecord", { repo: session.did, collection: PIGEON_NSID, record }),
  /** Your own pigeons: [{ rkey, value }] (up to 300). */
  async ownPigeons() {
    if (!session) return [];
    const out = [];
    let cursor = "";
    for (let page = 0; page < 3; page++) {
      const q = `repo=${encodeURIComponent(session.did)}&collection=${PIGEON_NSID}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const r = await session.fetchHandler(`/xrpc/com.atproto.repo.listRecords?${q}`, { headers: { accept: "application/json" } });
      if (!r.ok) break;
      const j = await r.json();
      for (const x of j.records || []) if (x && typeof x.uri === "string") out.push({ rkey: x.uri.split("/").pop(), value: x.value });
      if (!j.cursor) break;
      cursor = j.cursor;
    }
    return out;
  },
  /** One of your own pigeons cleared away. */
  async clearPigeon(rkey) {
    try { await xrpc("com.atproto.repo.deleteRecord", { repo: session.did, collection: PIGEON_NSID, rkey }); } catch { /* gone already */ }
  },
  getAtlas: () => account.getOwn(ATLAS_NSID, ATLAS_RKEY),
  putAtlas: (record) => account.putOwn(ATLAS_NSID, ATLAS_RKEY, record),
  /** Your one current intent, overwritten. */
  putIntent: (record) => xrpc("com.atproto.repo.putRecord", { repo: session.did, collection: INTENT_NSID, rkey: INTENT_RKEY, record }),
  /** Gone from your repo (it's fine if it already was). */
  async clearIntent() {
    if (!session) return;
    try { await xrpc("com.atproto.repo.deleteRecord", { repo: session.did, collection: INTENT_NSID, rkey: INTENT_RKEY }); } catch { /* not there, or offline */ }
  },
  /** The DIDs you've muted on Bluesky (up to 1,000), through your PDS to Bluesky's AppView; [] if not allowed. */
  async mutes() {
    if (!session) return [];
    const out = [];
    let cursor = "";
    try {
      for (let page = 0; page < 10; page++) {
        const r = await session.fetchHandler(`/xrpc/app.bsky.graph.getMutes?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: { "atproto-proxy": "did:web:api.bsky.app#bsky_appview" } });
        if (!r.ok) break;
        const j = await r.json();
        for (const m of j.mutes || []) if (m && typeof m.did === "string") out.push(m.did);
        if (!j.cursor) break;
        cursor = j.cursor;
      }
    } catch { /* mutes are a courtesy; carry on without */ }
    return out;
  },
  /** fn(did | null) whenever someone signs in or out. */
  onChange(fn) { listeners.add(fn); },
  /** At boot: pick the session back up, or finish a sign-in. Loads the client only if there may be one. */
  async resume() {
    if (!store.get(KEY) && !isReturning()) return null;
    try {
      const r = await (await load()).init();
      set(r?.session ?? null);
    } catch (e) {
      console.warn("sign-in:", e.message);
      set(null);
    }
    return account.did;
  },
  /** Off to the sign-in page. here: the game's URL parameters to come back to. */
  async signIn(handle, here = "") {
    const h = String(handle).trim().replace(/^@/, "");
    if (!h) return;
    store.set(RETURN, here, sessionStorage);
    await (await load()).signIn(h, { scope: SCOPE }); // redirects away
  },
  async signOut() {
    const s = session;
    set(null);
    try { await s?.signOut(); } catch { /* the session may already be gone */ }
  },
  create: (record) => xrpc("com.atproto.repo.createRecord", { repo: session.did, collection: NSID, record }),
  put: (rkey, record) => xrpc("com.atproto.repo.putRecord", { repo: session.did, collection: NSID, rkey, record }),
  remove: (rkey) => xrpc("com.atproto.repo.deleteRecord", { repo: session.did, collection: NSID, rkey }),
};
