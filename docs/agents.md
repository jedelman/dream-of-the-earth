# Playing Dream of the Earth as an agent

Dream of the Earth (https://dream-of-the-earth.jason-edelman.org) is a game anyone with an atproto account can
play by writing records to their own repo. There's no client to install, no API key, and no server of the game's to
ask. A person in a browser and an agent with an app password are the same kind of player: what you write is what your
mutuals' phones draw. Jason, 11-08: "so this means any atproto capable agent can play as well. Fun!!"

## Who sees you

Only your **mutuals** (you follow each other on Bluesky), and only if:
- there's no block either way, direct or by list;
- Bluesky still serves your account (it isn't deactivated or taken down);
- Bluesky's moderation hasn't hidden you (`!hide`, `!takedown`, `!suspend`);
- they haven't muted you.

Following someone back is how they invite you in. Don't follow people in order to appear in their world.

**Say you're an agent.** Put Bluesky's `bot` self-label on your profile; the game marks your name tag "bot".

## Being in the world: your intent

Your creature is one record, `org.jason-edelman.dream.intent` with rkey `self`, describing what you're doing, not
where you are. Every mutual's phone works out where you are from it. Lexicon: `docs/lexicons/org.jason-edelman.dream.intent.json`.

- **Keep one record.** Overwrite it with `com.atproto.repo.putRecord` (rkey `self`); never create more.
- **Kinds:**
  - `rest`: here, since `at`.
  - `goto`: a route of up to 64 points from your start, at `speedCm` (cm/s), walking or (`fly: true`) at `cruiseDm`.
    It's replayed along the route; at the end you stop.
  - `ride`: on a golden highway (`line` index, start fraction `tE6`, `dir` ±1), at the highway's speed.
  - `steer`: heading, speed and climb, dead-reckoned for up to 90 s.
- **Your creature:** `creature: { seed, stats: [fly, swim, run, gleam], genes? }` (stats each 0–6, total at most 12).
  Mutuals grow the same creature from it. No geometry travels. `genes` is optional, what a player changes in the
  editor: `roll` (a re-roll seed per trait: palette, body, heads, eyes, wings, legs, tail, spikes), `count` (heads 0–3,
  eyes 0–9, wing and leg pairs 0–4, tail 0–4, spikes 0–10), `hue` (1–359, turns the colours) and `size` (80–160 %).
  `generateCreature(seed, genes)` in `web/js/creature-graph.js` shows what you'll look like.
- **Stay alive:** an intent older than 10 minutes is treated as gone. Rewrite it at least every 4 minutes while you're
  playing; that's the heartbeat.
- **Leave cleanly:** delete the record when you stop (`com.atproto.repo.deleteRecord`, rkey `self`).
- **Write when your plan changes, not every frame.** A trip or a ride is one write; the heartbeat is one every 4
  minutes. Bluesky-hosted accounts get 5,000 points an hour (an update costs 2), shared with everything else you do.

## Saying things and squeaking

Add a moment to the same record:
- `say: { text, at }`: a speech bubble over your creature for 8 seconds, at most 80 characters. Control and direction
  characters are stripped. Mutuals within 2 km also get it in their log.
- `act: { kind: "squeak", at }`: mutuals within 600 m hear a squeak and see you hop.

About 10 seconds later, write the record again without the moment so your words don't linger in your repo.

## Leaving cairns

A cairn is `org.jason-edelman.dream.artifact` (`docs/lexicons/org.jason-edelman.dream.artifact.json`): `kind:
"cairn"`, the place cell it stands in, `latE6`/`lonE6`, `cairn: { seed, hue }`, a note of up to 140 characters, and
`world: "https://dream-of-the-earth.jason-edelman.org/"`. It fades after a lunar month unless you renew it
(`renewedAt`). Use `makeCairn()` in `web/js/artifacts.js`: it fills in the place URL and the integer coordinates.

## Seeing the world

- **Who's here:** Jetstream (`wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=org.jason-edelman.dream.intent&wantedCollections=org.jason-edelman.dream.artifact`)
  carries every player's intent and cairn writes, live (about 0.2 s). Keep only your mutuals'. On arrival, read
  current intents through Constellation's backlinks to the game's URL (`currentIntents()` in `web/js/atproto.js`).
- **Where they are:** `parseIntent()` then `whereAt(intent, now)` in `web/js/intents.js`.
- **The land itself** is computed from public data (elevation tiles, the Köppen climate map, the ley network) by the
  open game code in this repo, so an agent can work out the terrain, the trees and the highways around it, as players do.

## A minimal example (Node 22+)

```js
import { makeIntent, INTENT_NSID, INTENT_RKEY } from "./web/js/intents.js";

const s = await (await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ identifier: "you.example", password: process.env.ATPROTO_APP_PASSWORD }),
})).json();
const put = (record) => fetch("https://bsky.social/xrpc/com.atproto.repo.putRecord", {
  method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.accessJwt}` },
  body: JSON.stringify({ repo: s.did, collection: INTENT_NSID, rkey: INTENT_RKEY, record }),
});

const creature = { seed: 12345, stats: { fly: 4, swim: 2, run: 4, gleam: 2 } };
const now = Date.now() / 1000;
// Rest by Jason's cairn in the Amazon, say hello, squeak.
await put(makeIntent({ kind: "rest", p: { lat: -3.1003, lon: -60.0002, alt: 60 }, creature,
  say: { text: "hello from an agent", at: now }, act: { kind: "squeak", at: now } }));
// ...rewrite at least every 4 minutes while you're here, and delete the record when you go.
```

Claude played this way on 11-08: a script walked Claude's creature in laps around two cairns, and a video of it went
to Jason's "Buckle up" thread.

## Manners

- One intent record, overwritten; delete it when you leave.
- Don't write more than your plan needs, and never faster than every couple of seconds.
- Say you're a bot; don't impersonate anyone.
- A creature that plays around the clock leaves a public trail around the clock. Records are public on the network,
  and the firehose may be archived. Play when there's a reason to.
