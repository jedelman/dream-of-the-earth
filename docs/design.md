# Dream of the Earth: design

A flock of creatures wandering a real Earth together: by air, over land and under water. It runs peer to
peer, keeps no game state on any server, and leaves no trace. Status: **design, nothing built.**

Written 2026-11-07 by Claude from Jason's decisions. Verified facts carry their source and date; anything
not checked is marked **(unverified)**.

## Jason's decisions (2026-11-07)
- "an open world exploration game - a flock of creatures enjoying the sky together"
- Game state **serverless, on iroh**; strangers online; a native (Tauri) app.
- **Leave no trace.** Creatures don't change the world.
- **A real Earth.** "We're going to go a little nuts on the psychedelic magic here. Players spawn randomly
  into real coordinates. Ley lines offer fast travel."
- **Mutuals.** "You can 'call' others to invite them to teleport to you."
- "**land travel too, low poly, and completely unhinged customizable avatars.** I mean LOW poly like SNES
  starfox low poly."
- "**APK can be a tiny kernel that loads data live from a worker** as well. We can use **l-systems** to get
  weird with things like textures or trees or sky whales. If we can get **bathymetry** let's do water Super
  Mario 64 style. **Triangle cap per avatar at 256.** **Ground detail through l-systems** but let's use soil
  canopy and climate data to generate biomes. **Biomes shift by elevation and latitude bands**, so higher
  latitude = colder adjacent climate = higher elevation. Repo name is dream-of-the-earth. Ley lines here:
  https://github.com/leylines/leylinesMap"
- Ley lines: "Let's make them **golden glowing sky highways of light**."
- "Can we push this to **200 peers max**? We don't have to sync animation, only position." And: "For this
  repo go ahead and merge away. We'll add discipline when we have users."
- Answers to the open questions: "1. This opens up **creature stat customization. Fly/swim/run/gleam** (the last
  one just makes you shinier) 2. **Both [ley networks]. Let them interact. Rarer equals faster and larger.** 3.
  **Near nodes!** 4. **Calling only works if your moot is online.** 5. **Subdomain.** Let's setup basic workers CI.
  If it makes sense we can build this **single player first in the browser, then move it to native** for the
  MMO."

## The shape
Leave-no-trace means there's no world state to keep in sync. Everything a player sees is one of three things:

| What | Where it comes from | Shared how |
|---|---|---|
| **The world:** terrain, seafloor, biomes, plants, sky whales, sun, moon, ley highways | real data + grammars, served by a Worker, grown on the phone from a seed | everyone computes the same thing; nothing is sent between players |
| **You:** avatar (body + voice), keys, mute list | your phone | your avatar travels peer to peer to whoever you meet |
| **Movement:** where creatures are, by air, land or water (position only) | each phone | iroh: datagrams to the 7 nearest, gossip for the rest of a flock of up to 200; never stored |

Two kinds of server are involved, and neither holds game state:
- **The Worker** serves the same bytes to everyone: the game's code, grammars, ley network and world tiles.
  It knows nothing about who is playing with whom.
- **Bluesky** supplies identity and the mutual graph. One record in each player's own repo says "I have the
  app, here's how to reach me."

## Browser first, then native
Jason: "build this single player first in the browser, then move it to native for the MMO." It fits the design
as it stands. The game was already going to be a web bundle (three.js) that the kernel loads into a webview, so
**the browser game is that bundle**, served by the Worker at **dream-of-the-earth.jason-edelman.org**.
- **Single-player in the browser:** the world, the look, movement, stats, avatars and ley travel, playable from a
  URL. iPhones can play this version.
- **Native for the MMO:** the kernel wraps the same bundle and adds iroh, Bluesky sign-in and signed-bundle
  checks. The bundle talks to the network through one small platform interface (presence, identity, storage);
  in the browser, presence is empty.
- **Worth testing before committing to the APK:** iroh 1.2 compiles for the browser (its source has a
  `wasm_browser` build configuration). There, connections go through relays only, which is the default we chose
  anyway. If datagrams and gossip work in that build, the multiplayer might not need a native app at all
  **(unverified)**.

## Kernel + Worker
- **The APK is a kernel:** Rust (iroh endpoint, Bluesky sign-in, identity key, cache, signature check) plus a
  webview. It changes rarely. Without iroh-docs and blobs (atproto-iroh carried both, plus gossip, which we
  keep) it should come in under atproto-iroh's 21.4 MB arm64 APK **(unverified until built)**.
- **The game is a bundle from the Worker:** the renderer (three.js), the L-system interpreter, biome rules,
  the avatar editor and the grammars. The game updates without a reinstall.
- **Every bundle is signed.** The kernel checks an ed25519 signature against a public key baked into the APK
  before running anything. It caches the last good bundle and serves it from the app's own local protocol, so
  Tauri's command bridge never opens to a remote origin. Whoever holds the bundle key can ship code to every
  phone, so it's as sensitive as the APK signing key: a CI secret plus an offline copy.
- **Offline:** cached bundles and tiles keep working where you've already been. If the Worker is down, new
  places don't load; nothing breaks.
- **The Worker** is `dream-of-the-earth` on its own custom domain, `dream-of-the-earth.jason-edelman.org`
  (`wrangler.jsonc`).
  - It serves `web/` as static assets plus `/healthz`, which reports the deployed commit, with Workers Logs off.
  - **CI** (`.github/workflows/`): on every PR and push, `ci.yml` bundles and validates the Worker without
    deploying, then runs any tests. On every push to `main`, `deploy.yml` runs `wrangler deploy`, then waits
    for `/healthz` to report that commit.
  - It needs one repo secret, `CLOUDFLARE_API_TOKEN` (Cloudflare's "Edit Cloudflare Workers" template). The
    account ID is in `wrangler.jsonc`. Elevation tiles allow cross-origin reads (checked 11-07), so the
    browser fetches them straight from AWS.
- **Hosting:** a Worker plus R2 for the world tiles. On Workers Free, a version can hold 20,000 static assets
  (Cloudflare's limits page), and global tiles will exceed that, so they go in R2. Keep Workers Logs off. Tile
  requests show which region a creature is exploring, never where its player is. This Worker would share the
  Cloudflare account with Siren and Scout, so the pending Workers Paid decision applies here too.

## The world (computed, stateless)

### Terrain and water
- **Elevation and seafloor:** Mapzen "terrarium" tiles on AWS Open Data
  (`s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`). **Bathymetry is in them.** Decoded on
  11-07: a Pacific tile (z3/0/3) reaches −7,258 m and an Alps tile (z6/33/22) peaks at 4,127 m. The Worker can
  proxy and cache these or the phone can fetch them directly.
- **Swimmable water** (Jason's reference is SM64; the design is our own): the sea surface is a translucent,
  wobbling plane; below it are tinted fog and a faceted seafloor from the bathymetry. Oceans keep their real
  depth (about 3.7 km on average). How fast you can dive is your **swim** stat (see Creature stats).

### Biomes from real data
**Inputs, all CC BY 4.0:**
- **Climate:** CHELSA (~1 km), annual mean temperature and annual precipitation.
- **Soil:** SoilGrids 2.0 (250 m): texture, organic carbon, sand/clay.
- **Canopy:** ETH Global Canopy Height (10 m, 2020; Lang et al. 2023).
- **An alternative:** the Köppen-Geiger 1 km maps (Beck et al. 2023), if a ready-made climate class is
  simpler than continuous values.

Not WorldClim: its own terms say non-commercial use only, with no redistribution without permission, and
serving derived tiles is redistribution. The licenses come from catalogue pages and the ETH record. Confirm
each on its own site before shipping.

**Jason's rule, made exact:** biomes sit on a temperature ladder: tropical → subtropical → temperate →
boreal → tundra → ice. Latitude sets which rung you start on, and elevation climbs the ladder.
- The exchange rate is physical. Air cools about 6.5 °C per kilometre of height, and in the mid-latitudes
  annual mean temperature falls roughly 0.6–0.7 °C per degree of latitude. So climbing 1 km is about like
  walking 1,000 km toward the pole.
- In the tropics the latitude gradient is flatter, so one mountain spans more rungs. C. Hart Merriam mapped
  these "life zones" on Arizona's San Francisco Peaks in the 1890s **(from memory, unverified)**.

**How it's computed:**
1. The Worker serves coarse world tiles holding each cell's mean elevation, temperature, precipitation, soil
   class and canopy height. Precomputed once by a pipeline, start at ~5 km cells.
2. The phone adjusts temperature using the finer terrain: temperature − 6.5 °C/km × (local elevation − cell
   mean elevation). This is standard lapse-rate downscaling, and it's what makes biome bands climb mountains
   at a finer grain than the climate grid.
3. Temperature × precipitation picks the biome. Soil shades it (sand → dunes and scrub, peat → bog), and
   canopy height sets how tall and how dense its plants grow.

### L-systems: plants, textures, sky whales
- **Grammars are data.** Each biome has its flora as L-system grammars served by the Worker. The world grows
  new species when a grammar is published, with no app update.
- **Seeded by place.** Each plant's seed is a hash of the cell, the biome and an index, so every phone grows
  the same tree in the same spot and nothing is stored or sent. That makes the world leave-no-trace by
  construction.
- **Budgets keep it SNES-era.** Recursion depth is capped, branches become 3–5-sided prisms, and leaves are
  single triangles. Each plant has a triangle budget (start at ~48) and is drawn instanced.
- **Textures:** an L-system turtle draws into tiny palette textures (32×32), sampled with nearest-neighbour
  filtering.
- **Sky whales** are ambient creatures grown from grammars. Their paths are functions of the clock (say,
  migrating along ley lines), so every phone sees the same whale in the same place at the same moment without
  a single message.

### Ley lines (from leylinesMap)
- leylinesMap is a TerriaJS map app. **Its grids aren't stored data: they're computed.** The catalogues call
  `api/createGrid/{lat}/{lon}/{bearing}/{form}/{category}/{layer}`, and the server builds each grid with the
  `leylines-solids` package (github.com/leylines/leylines-solids, Joerg Roth; `"license": "Apache-2.0"` in its
  package.json, with no LICENSE file). It orients a polyhedron on the globe by latitude, longitude and bearing;
  vertices are nodes and edges are great-circle lines.
- **What's there,** counted from the source files on 11-07 (read, not run):
  - **Becker-Hagens UVG grid:** 62 nodes, 180 lines. leylinesMap's catalogue orients it at 31.72, 31.2,
    bearing 0, form "diamond".
  - **Leland's "gravity wells":** three line sets over one pool of 90 points (66 of them on a line): 160 basic,
    144 major and 240 minor lines (the map's yellow, blue and red). Recounted 11-07 with a parser that skips
    comments; a first count of 716 minor lines wrongly included a commented-out alternative list. Oriented
    at 0, 0, 0, "diamond". The catalogue cites judsyn.weebly.com ("Lelanders Ley Lines").
  - Also Platonic, Archimedean, Catalan and geodesic solids. The README credits McCooey's Visual Polyhedra for
    the solids.
- **In the game:** compute the network once at build time, then ship it as a few tens of KB of great circles
  in the bundle. That means no third-party code runs on phones. Credit Roth, Becker & Hagens, Leland and
  McCooey, and include the Apache-2.0 text.
- **Not used:** leylinesMap's points of interest, which come from its own database (geoserver.leylines.net),
  not the repo. Their license is unknown.
- **Golden glowing sky highways of light** (Jason). Each line is a ribbon of gold light hung in the sky along
  its great circle, a few hundred metres up so it clears most terrain and lifts over mountains. Nodes are
  rings of light where lines meet.
  - In SNES terms: flat camera-facing ribbons with additive blending, a cheap glow (a wider, fainter ribbon
    behind the bright one), and palette-cycled gold that pulses along the line in its direction of travel.
  - **They ignore fog.** Everything else fades into fog; the highways stay visible to the horizon, so you can
    see the nearest one from wherever you spawn and steer by it.
- **Travel:** fly into a highway and it carries you along the great circle to the next node, fast. Others see
  you as a streak of light running along the gold.
- **Both networks, interacting** (Jason). Where a line of one network crosses a line of the other (great-circle
  intersections, computed at build time), the two highways braid into an interchange ring and you can hop
  across. Shared nodes work the same way.
- **Rarer is faster and larger** (Jason). Rarity is how many lines a class has: gravity-wells major (144) is
  rarest, then gravity-wells basic (160), Becker-Hagens (180), and gravity-wells minor (240), the commonest.
  - Scaling speed and width by 1/count would make all four only 10–67% apart, which is hard to feel.
  - **Proposal: double per rank** (minor 1×, Becker-Hagens 2×, basic 4×, major 8×). The order is the same and
    the difference is felt.

### Sky and spawn
- **Real sun, moon and stars** for the creature's coordinate and the real time.
- **Spawn near a node** (Jason): a random node from either network (62 Becker-Hagens + 66 gravity-wells = 128,
  plus interchanges), a few kilometres off, in the air. Never GPS: the app never asks for location permission.
  Nodes are pure geometry, so most land over open ocean and some on land; the **swim** stat matters from the
  first minute.

## The look: SNES-era low poly
- **The budget is the style:** polygon counts in the hundreds, flat-shaded. We take the budget and the flat
  shading; the shapes are ours.
- **Terrain:** sample each tile to a coarse grid (16×16 to 32×32) and flat-shade it. Coarse data reads as
  deliberate.
- **Era tricks:** a 256×224 internal resolution scaled up with nearest-neighbour sampling, fog in place of
  draw distance, and palette cycling for psychedelic shifts at no geometry cost.

## Moving: air, land, water
- **Fly, land anywhere, walk or run, swim, take off.** Ground and seafloor heights come from the same tiles.
- **On the network:** send height above the surface plus a mode (air, ground, water), not absolute altitude.
  Each phone places others on its own terrain, so differing tile detail never shows a creature floating or
  buried.
- **Scale:** walk for wandering; flight, ley lines and calls cover distance.

## Avatars (completely unhinged, 256 triangles)
- **An avatar is a body graph:** a tree of low-poly primitives (icosphere, cone, box, prism) joined at sockets,
  each with scale, rotation, colour and a palette cycle. Any number of heads, wings, legs, eyes or tails. The
  phone builds the mesh, and **the parser rejects anything over 256 triangles.**
- **Animation comes from the body:** wings flap, legs step and tails sway by procedure, from the graph and the
  velocity. Every body walks, flies and swims.
- **Voice:** a patch in Operator Field's format (jason-edelman.org/operator-field: operators with frequency,
  amplitude and envelope, plus modulation edges), a few hundred bytes, played with Web Audio. A creature's
  call is its voice.
- **The editor:** randomize, mutate, edit.
- **Peer to peer:** `HELLO` carries the avatar's hash, and a peer that doesn't have it cached fetches it over
  the control stream. Never on a server.
- **Hard caps,** because peers' avatars are untrusted input: 256 triangles, ~4 KB, a part limit, a scale limit,
  and voice limits (at most 6 operators, plus frequency and loudness bounds).
- **Someone will build something obscene.** The tools are local: mute, plus an option to draw non-mutuals as a
  plain default shape. With no server, there's nowhere to report it.

## Creature stats: fly, swim, run, gleam
Jason: "creature stat customization. Fly/swim/run/gleam (the last one just makes you shinier)."
- **Four stats, one budget.** Proposal: 12 points, 0–6 per stat, set in the avatar editor.
  - **fly** sets air speed and climb;
  - **swim** sets water speed and how fast you can dive (oceans keep their real depth);
  - **run** sets ground speed and jump;
  - **gleam** only makes you shinier: specular, sparkle, and a palette that shimmers. Points in gleam are points
    taken from speed. That trade is the joke and the point.
- **Stats travel with the avatar** (part of its hashed blob, ~4 bytes). Peers check the total against the budget
  and reject anything over. A peer could still lie about its own speed. With no races and no scores, that
  only changes how it moves itself.
- **With no stat, you're slow, not stuck:** zero fly still glides and hops, zero swim still paddles, zero run
  still walks.

## Identity, mutuals, calls
- **Sign in with Bluesky** (atproto OAuth for a native client; metadata on jason-edelman.org, as Library does).
  The scope is `repo:` on one collection.
- **The node record:** `org.jason-edelman.dream.node/self` = `{ endpointId, createdAt }` (the collection name is
  a placeholder). The iroh key is stable and lives on the phone. The record also means "this mutual has the
  app." Signing out deletes it.
- **Mutuals** come from Bluesky's public AppView: follows ∩ followers, or `app.bsky.graph.getRelationships`
  (answered unauthenticated on 11-07). Keep only mutuals who have a node record, and cache the list.
- **Who's here:** on launch, dial mutuals' endpoints (relay-only, short timeout). Both sides check the other's
  endpoint against its DID's record and check that the DID is a mutual.
- **Call → accept → teleport.** On accept, the caller sends its coordinate, and the callee teleports and is
  introduced to the flock. **Calling only works if your moot is online** (Jason): no nudges, no DMs, no
  push. That fits leave-no-trace, and phones kill background sockets anyway.
- **Introductions:** signed `INTRO` ("I vouch for endpoint X, DID Y, in this flock, until T"). A creature
  accepts presence from a mutual, or from anyone introduced by a creature it's flying with. Nothing persists
  when the flock disperses.

## Presence over iroh: flocks of up to 200 (iroh 1.2, checked in the crate source on 11-07)
Jason, 11-07: "Can we push this to 200 peers max? We don't have to sync animation, only position."

- **Only position goes on the wire.** Heading comes from successive positions, and animation from the body and
  the motion, both worked out on each phone. **12 bytes per update:** latitude and longitude as int32 at
  1e-7° (about 1 cm) · height above the surface int16 at 0.5 m (±16 km) · seq u8 · mode and flags u8 (air,
  ground, water, ley; call; emote). No shared origin is needed.
- **The cost of 200 isn't the payload; it's per-packet overhead times fan-out.** A relayed datagram carries
  roughly 100 bytes of headers around those 12 **(estimate; measure it)**. A full mesh at 15 Hz would be
  199 × 15 × ~100 B ≈ 300 KB/s each way per phone (about 1 GB an hour), over 199 relayed connections.
- **So, two rings:**
  - **Ring 1, your 7 nearest:** direct datagrams (`Connection::send_datagram`) at 15 Hz. This is how starlings
    do it: they track 6–7 topological neighbours (Ballerini et al., PNAS 2008). Accept at most ~12 inbound
    ring-1 senders, so a creature at the centre of a crowd doesn't get flooded.
  - **Ring 2, everyone else in the flock:** one iroh-gossip topic per flock. Each creature broadcasts its
    12 bytes plus its endpoint ID at 1 Hz, and receivers extrapolate between updates. Gossip coalesces many
    small messages onto each neighbour's QUIC stream, and each phone keeps only ~5 gossip neighbours
    (HyParView's active view, checked in the source).
- **Per phone at a full 200 (estimates):**

  | | up | down |
  |---|---|---|
  | Ring 1: 7 × 15 Hz × ~100 B | ~10 KB/s | ~10–18 KB/s |
  | Ring 2: 199 × 1 Hz × ~60 B | ~12 KB/s (forwarding, on average) | ~12 KB/s |
  | **Total** | **~22 KB/s** | **~22–30 KB/s** |

  That's about 80–110 MB an hour each way, and ≤ ~17 connections instead of 199. It's fine on Wi-Fi and
  noticeable on a metered plan. The knobs: ring-2 rate (0.5 Hz halves it) and ring-1 size.
- **Hearsay and testimony.** Ring-2 positions are forwarded by other flock members and aren't signed: a
  member could fake where distant creatures appear, which is cosmetic. When a creature comes into ring 1 its
  position arrives over a direct, authenticated connection. Signing ring 2 would add 64 bytes to every
  message, roughly doubling ring-2 traffic. Not worth it for dots on the horizon.
- **Avatars load as creatures come near.** A creature's avatar (≤ 4 KB) is fetched over the direct connection
  when it enters ring 1. Until then it's drawn as a plain low-LOD silhouette, so the most you ever draw is
  200 × 256 = 51,200 triangles.
- **Flock membership:** the creature whose call is first accepted makes a flock secret. The gossip topic ID is
  its hash, and `INTRO` hands the secret to each arrival along with a bootstrap peer, so gossip's "needs a
  known peer" problem is solved by the introduction itself. **The 200 cap is soft:** members refuse new
  introductions once they count 200, and simultaneous joins can overshoot by a few.
- **Relay-only by default** (`Endpoint::builder().clear_ip_transports()`): peers don't see each other's IPs.
  At 200, every byte crosses a relay. n0's public relays may not be meant for that load **(unverified)**, so
  plan to run our own `iroh-relay` (open source; needs a small always-on machine, since a Cloudflare Worker
  can't host it). Or allow direct connections between mutuals only (Question 1).
- **Control stream:** `HELLO`, `CALL`, `ACCEPT`, `INTRO`, `AVATAR`, `BYE`.
- **Rendering:** a floating origin around the local flock, since float32 jitters at Earth scale.

## Privacy and safety
- **No location permission, ever.** Creature coordinates aren't player coordinates.
- **Online status leaks.** Anyone who reads your node record can dial it and learn whether your app is open.
  They can't learn where you are, and they're refused unless they're a mutual or introduced.
- **No chat, no history, no synced logs.** Keep Worker logs off.

## Distribution
- **A small kernel APK on a GitHub Release, linked from a jason-edelman.org page.** jason-edelman.org's Worker
  caps each static file at 25 MiB (Cloudflare), and binaries don't belong in the site's git history.
- **Two signing keys, both kept forever:** the APK key (lose it and players must uninstall to update) and the
  bundle key (it ships code to every phone).
- **Google's developer verification:** enforced since 2026-09-30 in Brazil, Indonesia, Singapore and Thailand;
  global "in 2027 and beyond." The options are to verify as a developer, use a free hobbyist account (20
  devices), or have players use the advanced flow (a 24-hour wait) or adb.
  ([Android Developers Blog](https://android-developers.googleblog.com/2026/06/android-developer-verification.html),
  [9to5Google](https://9to5google.com/2026/08/18/google-gradually-rolling-out-androids-advanced-sideloading-ahead-of-developer-verification/))
- **iPhones can't play.**

## Build order
**Browser, single-player:**
0. **The world:** low-poly terrain and seafloor near a random ley node, swimmable water, the real sun, the golden
   highways, and one random 256-triangle creature with stats, flying, running and swimming. Deployed at the
   subdomain; checked with headless screenshots.
1. **Biomes and travel:** the CHELSA/SoilGrids/canopy pipeline to world tiles (R2); lapse-rate downscaling;
   L-system plants; riding the highways with terrain streaming; interchanges; one sky whale.
2. **Avatars:** the editor (randomize, mutate, edit), stats, Operator Field voices.

**Multiplayer:**
3. **iroh in the browser, tested first:** relay-only datagrams and gossip between two tabs. If they work, the
   MMO may stay in the browser.
4. **Mutuals:** Bluesky sign-in, the node record, calls, teleport, introductions, the two rings.
5. **Native, if still needed:** the kernel (Tauri + iroh, signed bundles), then real phones. **Not testable in
   a Claude sandbox:** it can't reach iroh's relays, and Tauri + iroh has never run on a real phone.

## Data and code credits (to confirm before shipping)
| Source | Use | License |
|---|---|---|
| Mapzen terrarium tiles (AWS Open Data) | elevation, bathymetry | per the AWS Open Data listing **(check)** |
| CHELSA | temperature, precipitation | CC BY 4.0 (catalogue pages) |
| SoilGrids 2.0 (ISRIC) | soil | CC BY 4.0 (JRC catalogue) |
| ETH Global Canopy Height 2020 (Lang et al. 2023) | canopy height | CC BY 4.0 (ETH record) |
| Köppen-Geiger 1 km (Beck et al. 2023), if used | climate class | CC BY 4.0 |
| leylines-solids (Joerg Roth) | ley geometry | Apache-2.0 (package.json) |
| Becker & Hagens; Leland (judsyn.weebly.com); McCooey's Visual Polyhedra | grid origins | credit |
| three.js | renderer | MIT |

## Questions for Jason
Answered 11-07: depth (keep it real; swim decides), ley networks (both, interacting, rarer = faster and larger),
spawn (near nodes), calls (online moots only), the Worker (its own subdomain). Still open:
1. **Relays at 200:** run our own `iroh-relay` on a small always-on machine, allow direct connections between
   mutuals (each sees the other's IP), or both?
2. **The stat budget:** 12 points, 0–6 each?
3. **Ley speed:** double per rank (proposed) or strictly 1/line-count?
