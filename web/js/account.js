// Signing in with Bluesky, only to leave things. The OAuth client (web/vendor,
// ~210 KB) loads only when someone signs in or comes back signed in, and its scope
// reaches one collection: our artifacts. Seeing what mutuals left needs none of this.
// Writes go through the session's own fetch handler (DPoP-bound tokens), to the
// player's own PDS.
import { NSID } from "./artifacts.js";

export const SCOPE = `atproto repo:${NSID}`;
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

export const account = {
  get did() { return session ? session.did : null; },
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
