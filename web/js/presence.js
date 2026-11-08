// Listening for what mutuals do, live: one WebSocket to Bluesky's Jetstream,
// filtered to this game's collections (intents and artifacts), so it carries only
// game records, a few hundred bytes each. Commits arrive within about a second of
// being written (183 ms measured on 11-08). The caller decides whose to show.
import { DID_RE } from "./atproto.js";

const HOSTS = ["jetstream2.us-east.bsky.network", "jetstream1.us-east.bsky.network", "jetstream2.us-west.bsky.network", "jetstream1.us-west.bsky.network"];
const MAX_MESSAGE = 32 * 1024;

/**
 * Listen for commits to these collections: onCommit({ did, time_us, commit: { operation, collection, rkey, record } }).
 * Reconnects with backoff, trying the next public instance each time. Returns { close() }.
 */
export function listen({ collections, onCommit, onOpen = () => {} }) {
  let ws = null, host = 0, delay = 1000, closed = false, timer = null;
  const q = collections.map((c) => `wantedCollections=${encodeURIComponent(c)}`).join("&") + `&maxMessageSizeBytes=${MAX_MESSAGE}`;
  function open() {
    if (closed) return;
    ws = new WebSocket(`wss://${HOSTS[host % HOSTS.length]}/subscribe?${q}`);
    ws.onopen = () => { delay = 1000; onOpen(); };
    ws.onmessage = (m) => {
      if (typeof m.data !== "string" || m.data.length > MAX_MESSAGE) return;
      let e;
      try { e = JSON.parse(m.data); } catch { return; }
      if (e && e.kind === "commit" && e.commit && DID_RE.test(e.did) && collections.includes(e.commit.collection)) onCommit(e);
    };
    ws.onclose = () => {
      if (closed) return;
      host++;
      timer = setTimeout(open, delay);
      delay = Math.min(30000, delay * 2);
    };
  }
  open();
  return { close() { closed = true; clearTimeout(timer); ws?.close(); } };
}
