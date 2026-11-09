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
- **Artifacts (11-08):** "Next up, big lift. I know we said leave no trace but let's use **atproto back links to
  host artifacts for mutuals to discover**." Asked what an artifact is, Jason picked **all four: a cairn with a
  note, a postcard, an echo of your creature, and a sound**; **mutuals only** see them; and they **fade with the
  moon** (gone from the game a lunar month after they're made or renewed). See "Artifacts" below.

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
  app, here's how to reach me." Artifacts (11-08) are more records in players' own repos, found through a public
  backlink index; this game's server still holds none of them.

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
  - **CI and deploys:** `ci.yml` bundles and validates the Worker and runs the unit tests on every PR and
    push. **Cloudflare Workers Builds** (Jason connected it on 11-07) deploys every push to `main` with
    `npm run deploy` (Jason set it 11-07), so `/healthz` reports the commit (`WORKERS_CI_COMMIT_SHA`). Elevation
    tiles allow cross-origin reads (checked 11-07), so the browser fetches them straight from AWS.
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
  simpler than continuous values. **This is what the first pass uses (built 11-08):** the 1991–2020 map at
  0.1° (~11 km), cut into 72 PNG tiles of 30° (388 KB in all) by `scripts/koppen-tiles.py`. See the build order.

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
- **Budgets keep it SNES-era.** Recursion depth is capped, branches become 3-sided prisms, crowns become
  squashed octahedra, palm fronds flat diamonds, and grass blades single triangles (front and back). Each plant
  has a budget of 64 triangles, spent trunk first, then foliage, then the finer branches the foliage hides, and
  is drawn instanced. (Built 11-08; the grammars live in `web/js/plantforms.js` for now, not on the Worker.)
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
- **Tap to move (built 11-08, Jason: "pathfinding and tap-to-move-to would be a huge control upgrade"):** a quick
  tap or click that doesn't drag finds the ground (or sea surface) under it by marching the ray against the
  terrain as drawn, curvature included, and sets a target, marked with a turning gold ring and a dotted route.
  - **Anything with wings** (fly > 0) flies straight there, cruising 70 m over the ground ahead, then settles
    onto the spot.
  - **Anything without** finds a way: A* over a grid (up to ~140 cells a side, cells of 12 m or more) of travel
    times, where land costs 1/run (more on slopes), water costs 1/swim, and slopes steeper than 0.85 rise over
    run can't be climbed; the path is then simplified to straight legs (`web/js/pathfind.js`). So a poor swimmer
    walks round a lake and a strong one crosses it. No way there: it says so.
  - **Any key, drag or ▲▼ takes the controls back.** Boarding a highway or picking a landmark clears the target.
    Waypoints are kept as lat/lon, so a world regrow mid-trip doesn't lose them.
  - **Not yet:** flyers don't path around storms.
- **Flying keeps clear of the land (11-08, Jason: "Nyo seems to be getting tired and sitting down on long
  flights"):** height used to be held above sea level, so flying toward rising land brought the ground up to meet
  you; the clamp then put you in ground mode, wings folded, trudging uphill. Now, with hands off the climb, a flyer
  keeps the clearance it let go at (4 to 30 m) over the land up to 1.2 s ahead, climbing as fast as its climb plus
  0.3 × its speed. Above 30 m it keeps its altitude until the land comes within 30 m. Landing is on purpose: hold
  down. A slope too steep to out-climb is skimmed, still flying. Tap-to-move flyers settle all the way down at the
  end of a trip (giving up after 6 s, say over a pillar of light that holds them up).
- **Trips follow what moves (11-08, Jason: "I'm trying to get to the sky being! Nyo keeps stopping
  unexpectedly"):** sky beings drift along their lines at 25 m/s, so a 25 km trip used to arrive where the being
  had been ~10 km earlier, hum at nothing, and stop. A trip to a sky being now steers for where it is (through
  world regrows too); a walker who arrives and finds it gone sets off again. Highways don't snatch you while
  you're on a tap-to-move trip (tapping a highway still boards it): chasing a being along its line put you above
  that line, in line with it and sometimes within capture height.
- **Touching things (built 11-08, Jason: "Tap to move, but also when within range, maybe trees shake, creatures
  squeak, and you get on the highway? Maybe also a little text to describe the results - a light on screen log a
  la world of warcraft or minecraft"):** a tap now finds the nearest thing along its ray: your own creature, a
  butterfly (found on screen from the same figure-eight the shader flies), a sky being, a tree (instanced meshes
  raycast to their records), a highway's glow (the ray marched against `linesNear` at highway height), or the
  ground. In range, it answers at once; otherwise you go there by tap-to-move and it answers when you arrive.
  - **Trees** (within 20 m plus 40% of their height) shake: a dying wobble in the plant shader for that one
    instance, a rustle, and what falls: leaves in the tree's own colour, kapok fluff that drifts like snow, a
    coconut or acorns or cones that thud, petals from a tree in flower. A saguaro doesn't shake (ouch); a giant
    sequoia barely notices. Grass and moss don't answer: a tap on them means "go there".
  - **Your creature** squeaks (higher for smaller creatures), hops, and sparkles; it has a name now, grown from
    its seed like everything else (seed 7 is Nyo).
  - **Butterflies** chirp and sparkle in their own colour. **Sky beings** (within 3 km) hum back, two low voices
    slightly apart. **Highways** (within 170 m) take you aboard, any creature, wings or not, in the direction
    closest to your heading.
  - **Sounds** are synthesized with WebAudio (no files), start on the first tap or key, and M mutes (remembered).
  - **The log:** a few lines bottom-left that fade after 7 s, coloured by kind (trees green, creatures pink,
    highways gold, sky lavender). It also tells you about boarding and leaving highways, arriving at nodes,
    and landmark trips. Lines vary by hash, so the same tree says the same thing to everyone, and shaking it
    again can say something new.
  - **What's in reach glints, and E touches it (built 11-08, Jason: "lightly highlight interactibles within range
    as well as a default interact button - think FF7 sparkle or Bloodborne's '(X) talk'"):** every 0.15 s the
    game lists what's in reach by the same ranges a tap uses. Up to five things get a small four-point star (a
    point shader drawn over everything, 5 to 9 pixels in the 224-line picture). The stars twinkle out of step and
    now and then turn 45°. The likeliest thing gets a bigger, golder, steadier star and the prompt, bottom
    right: "(E) Shake the baobab", "Hug the saguaro", "Greet the violet butterfly", "Hum to the sky being",
    "Board the highway", and "Step off" while riding. Likeliest means close for its range, in front of you, and
    small before big: the tree beside you comes before the highway overhead or a sky being 2 km off. The focus
    holds unless something clearly better comes along, so it doesn't flicker between two trees. E (or tapping the
    prompt; a ✦ stands in for the key on touch screens) does it; with nothing in reach, E squeaks. On a phone the
    prompt sits above ▲▼, under the right thumb. It stays bottom right on a computer too: centred, it covered
    the creature and collided with the log. Highway glints sit 30 m along each line the way you face, so at a
    node they fan out along the roads instead of stacking on the node.

## The camera: a director (built 11-08, Jason: "let's make the camera a little more semantic and cinematic")
`web/js/director.js`, with the maths in `web/js/camerawork.js` (tested).
- **Relative to the creature:** the camera's offset and aim are kept relative to your creature, so a world
  regrow or boarding a highway (both move your coordinates) never makes it jump.
- **Semantic base framing:** on the ground, low and close, looking at head height; in the air, behind and above,
  looking further ahead the faster you go, a wider field of view at speed (62° → 72°), and banking into turns
  (up to 12°); in water, low by the surface; on a highway, wide (74-80°) with a slow sway. On the way to
  something you tapped, it glances toward it. Moving fast, it trails a beat behind. Zoomed out, it frames
  straight as the zoom asks.
- **Idle:** after 10 s without input it drifts into a slow orbit (a little wider and higher, 55°), and slows
  further while facing a low, golden sun.
- **Event shots** blend over the base and back: a low angle on a shaken tree with you and its crown in frame
  (4 s); a three-quarter close-up when you squeak; you and a butterfly from the side; looking up past you at a
  sky being; a crane down from high and wide when you arrive anywhere (startup, a landmark, a node); and a lurch
  of field of view (to 92°) when you step onto a highway.
- **Movement:** critically damped springs (no overshoot, frame-rate independent): position ~0.3-0.5 s, aim
  0.22 s, field of view 0.6 s, roll 0.45 s. The camera won't sink into hills between you and it: it rises
  over them.
- **Through its eyes (11-08, Jason: "make Nyo translucent at a certain zoom level so we can look through her
  eyes"):** as the zoom closes from 34 m to 17 m the camera glides to the creature's eyes (just in front of its
  eye parts, or its head, from the creature graph) and looks where it's heading, with springs tight enough to
  lock it to the head and a 72° field of view; the creature fades to 15% so you see past it. While translucent it
  draws after the sky (otherwise the sky pass paints over it where there's sky behind), and its gleam sparkles
  hide (from inside its head they'd fill the view). Back to solid on a highway.

## Speech, squeaks and agents (built 11-08, PR #28)
Jason: "Whoa, so this means any atproto capable agent can play as well. Fun!!" → "Hahahah yes! Let's flesh out player
interactions as well (mostly just speech bubbles) and then work on avatar customization."
- **Speech bubbles** ride on the intent: `say: { text, at }`, at most 80 characters, cleaned like cairn notes (control
  and direction characters out). They show over the creature for 8 s to mutuals in label range (600 m), and in the
  log within 2 km. Speak with Enter (or SAY, top right, when signed in and showing yourself). About 10 s later the game
  rewrites your intent without the words, so they don't linger in your repo.
- **Squeaks are shared:** `act: { kind: "squeak", at }`. Mutuals within 600 m hear it and see your creature hop.
- **Bad moments are dropped, not fatal:** a malformed say or act is ignored and the creature still shows.
- **Agents:** `docs/agents.md` is the guide for any atproto agent that wants to play (records, limits, heartbeat,
  cleanup, speech, cairns, seeing the world, a minimal example, manners). Accounts with Bluesky's `bot` self-label get
  a small "bot" on their name tag. Scout-Two and Jason are mutuals and Scout is bot-labelled (checked 11-08), so Scout
  could join by writing one record.
- **Checked 11-08:** looking as Jason, Claude (from a script) said "Jason! It's me, in your dream. The kapok really
  does snow." and squeaked: the bubble showed over Claude's creature, the name tag read "@claude.jason-edelman.org"
  with the bot mark, the log had the line and "squeaks!", and Claude hopped. **Not yet seen:** your own words sent from
  the game (it needs a sign-in with the intent scope).

## Filming (11-08)
`?film=30` (frames per second) is for recording. After `__dream.filmStart()` the game stops its own loop, and
`__dream.filmStep(n)` renders n frames exactly 1/30 s apart in game time (and on the clock intents and cairns use),
however slowly a headless browser renders them; one screenshot per step, then ffmpeg, gives a smooth video. Playwright's
fake clock deadlocks its screenshots, so this lives in the game. First used for the reply to Jason's "Buckle up" thread.

## Your creature, customized (built 11-08)
Jason: "Let's flesh out player interactions as well (mostly just speech bubbles) and then work on avatar
customization." The design's editor verbs were randomize, mutate, edit; all three are in.
- **A creature is a seed plus optional genes.** With no genes it's exactly what its seed always made: Nyo (seed 7)
  is still Nyo, checked against a snapshot of 45 creatures taken before the change (`test/fixtures`).
- **Each trait grows from its own stretch of the seed's stream.** The generator records where each trait's random
  numbers began; with genes, an untouched trait starts its own stream there (`mulberry32At`), so changing one trait
  doesn't reshuffle the others. A re-rolled trait gets a stream of its own. A new body keeps the same wings and legs,
  moved to fit it; a new palette keeps every shape; one more eye leaves the others where they were.
- **Genes:** `roll` (a re-roll seed for each of colours, body, heads, eyes, wings, legs, tail, spikes), `count`
  (heads 0–3, eyes 0–9, wing and leg pairs 0–4, tail 0–4, spikes 0–10), `hue` (turns the palette round the wheel)
  and `size` (80–160 %). Integers only, a few dozen bytes. The 256-triangle cap still holds: past it, parts aren't
  built. `parseGenes` drops anything out of range, so a bad gene from another player costs only that gene.
- **The editor** opens from your creature's name (top right). Each row re-rolls a trait or steps a count; sliders
  turn the colours and set the size; the four stats spend the 12-point budget. Mutate re-rolls two traits (and now
  and then the colours); "A whole new creature" is a new seed, so a new name. Undo, and Start over (the seed as it
  came). Every change shows at once, with a puff of the creature's colours and a squeak in its new voice.
- **The camera turns to face it:** a portrait shot, three-quarters front, swinging gently. It stands where the fewest
  trees are in the way (a rainforest had parked it behind a kapok trunk). The creature sits left of the sheet on a
  wide screen, above it on a phone (the sheet runs along the bottom there). Nothing else asks for you while editing:
  no glints, no prompt.
- **Your creature is yours:** kept on the device (`dream.creature`), and in your repo when you're signed in (below). The first creature you meet is kept. A `?seed`
  in the URL shows that creature instead, with your changes if it's the one you keep; after an edit the URL follows.
  Your own creature lands somewhere new each visit (a seed in the URL still sets the spawn, so links reproduce).
- **Mutuals see it:** genes ride in the intent (`creature.genes`), so a mutual's phone grows the same creature. A new
  look waits until you've stopped changing things for 3 seconds before it's written, so a burst of re-rolls is one
  write.
- **It follows you (11-09, Jason: "Yes! Your creature should follow you."):** signed in, your creature is also one
  record in your repo, `org.jason-edelman.dream.creature/self` (seed, stats, genes, `updatedAt`), overwritten when
  you change it (after 3 s settled, like the intent). On signing in, and when you come back to the tab, the game
  brings the device and your repo into step: the newest creature you *chose* wins, and a creature you only happened
  to meet on a new device always gives way, so a new phone never overwrites Nyo with a stranger. With nothing in your
  repo yet, the creature this device keeps becomes yours. A creature from a link (`?seed=`) isn't yours until you
  change it or press "Make this one mine". The record is read only from your own repo (mutuals see your creature
  through your intent), so nothing indexes it. Needs a sign-in from 11-09 on; older ones are offered a fresh sign-in.
- **Not yet:** voices (Operator Field patches), part-by-part editing beyond counts, and the plain-shape option for
  non-mutuals' creatures (only mutuals are shown, so it isn't needed yet).

## Shrines (11-09)
Jason: "let's make the game more psychedelic by scattering shrines that temporarily alter your shape, camera, or
worldview!"
- **Computed, like everything else** (`shrinelore.js`, tested): on land only, one cell in ~2.5 of a 1.4 km grid, so
  six or seven within 3.6 km of you. The same shrine in the same place on every phone, holding the same spell. A spell
  is yours alone and changes nothing, so leave-no-trace holds.
- **What one looks like** (`shrines.js`, about 70 triangles): a stepped plinth, an arch about 9 m tall (nearly twice
  your height), a crystal turning inside it, and a column of light 180 m tall you can see from kilometres away. The
  colour says what it does: pink, your shape; cyan, the camera; gold, the world.
- **Touch one** ("(E) Touch the shrine of giants", or tap it and walk there): a shimmer of sound and sparkles, a line
  in the log, and a spell for a minute. It eases in and out over 2.5 s; the HUD counts it down; Escape lifts every
  spell. One of each kind at once, so a giant can see the world in six mirrors with the sky underfoot. Touching the
  same shrine again renews it; another of its kind replaces it.
- **The eleven spells:**
  - Shape: **giant** (×6: the kapoks come up to your chest), **tiny** (×¼: the grass is a forest), **taffy** (stretched
    3.2× tall and thin), **mask** (another creature's body, a different one each touch, the same sequence for
    everyone). The camera pulls back or comes in to suit. Shape spells are only on your screen; mutuals still see you.
  - Camera: **the upturned sky** (rolls the view upside down), **fisheye** (a 118° view with a bulging lens),
    **turning** (four slow turns of the horizon, back level at the end).
  - World: **colours** (every colour slides round the rainbow, a little more saturated), **kaleidoscope** (six
    mirrors round the middle, turning), **melting** (the picture sways and runs, with the colours split), **spinning
    days** (the sun races a whole day round the sky in a minute, then it's now again; only the sun, so clouds and
    sky beings keep the shared clock).
- **The world spells (and the fisheye's lens) are one extra full-screen pass** (`worldview.js`) over the finished frame,
  sea and sparkles included, drawn only while one holds. The sky pass hands it linear colour; without that the first
  try came out washed out, encoded twice.

## A smaller you, and a breathing world (11-09)
Jason: "lets make everything bigger relative to the player by shrinking the player. Two, lets make everything
breathe. Animals more, plants less, landscapes even less."
- **Every creature shrank** (`CREATURE_M` = 0.4 metres per body unit, in `creature-graph.js`): Nyo went from about
  13 m long to about 5, so a kapok stands ten times its height. Yours and your mutuals' shrink together; the graph
  (and so every gene, and the snapshot test) is unchanged, only how big a body unit is.
- **The camera came with it:** the home zoom is 34 m (was 85), the closest 6 m (was 15), and the eye view starts at 14 m
  (was 34). Close-ups, the editor's portrait, name tags, hops and puffs all use the creature's size in metres.
- **On its feet:** a creature now stands on its lowest point (legs and all) instead of its middle, which had left
  bodies half in the ground; in water it floats as before.
- **Ground speeds shrank too** (11-09, Jason: "Yes let's shrink ground speed… Should be a power law"): see "Creature
  stats" for the formula. Running, jumping and swimming went down by √0.4 ≈ 0.63; flying didn't.
- **Small creatures shrank less** (0.6×), so a bunny comes up to about half of you.
- **Breathing** (`breath.js`): animals the most, plants less, land least.
  - Creatures, yours and your mutuals': 5% up and down, 2.5% around, about every 3.6 s at rest and 1.4 s at full speed.
  - Bunnies (6%, quick), frogs (9%, slow), birds (6%, quickest); sky beings, vast and slow (4%, every 8 s).
  - Plants: a crown swells 3% (and 1.2% in height) about every 6 s, each tree out of step with its neighbours.
  - Land: a swell of 0.3% of its height plus half a metre, rolling outward from you every 9 s; nothing within 300 m
    of you (where you walk, drawing and physics agree), full strength past 4 km. Mountains far off rise and settle by
    a few metres, and coastlines with them.
  - A system set to reduce motion gets half the animal breath, a third of the plants', and still land.

## Small creatures: bunnies, frogs and little birds (built 11-09)
Jason: "Maybe we could add small creatures? Bunnies and frogs and little birds".
- **Where they live:** homes on the global cell grid, by biome (`critterlife.js`, tested). Bunnies like open country
  (steppe, grassland, oceanic and continental fields; snow hares in tundra and taiga, jackrabbits in deserts and
  savanna; none in rainforest). Frogs like it wet (bright tree frogs in rainforest and subtropics; frogs and toads in
  temperate places; none in deserts, on ice, or above 1,200 m). Little birds live wherever plants do, bright in the
  tropics, brown, grey, blue and black elsewhere, a snow bird in the tundra. Nothing at sea or on ice.
- **Dream-sized,** like the butterflies. First 3.5–5 m bunnies beside a 13 m Nyo (at real-ish sizes, 1–2 m, a bunny
  was a speck); since creatures shrank (11-09), bunnies 2.1–3 m, frogs 1.4–2 m, birds 1.3–1.8 m beside a 5 m Nyo.
- **Low poly:** a bunny is 26 triangles (a loaf with high haunches, head on its chest, leaf ears, a cotton tail), a frog
  20 (eyes on top, legs splayed), a bird 13 (wings that flap in the shader, folded along its back at rest). One
  instanced mesh per kind; each creature's two colours ride as instance attributes.
- **Their day is on the shared clock,** so everyone sees the same bunny in the same place: a bunny sits and nibbles,
  then hops (three bounds) somewhere new within 14 m of home; a frog sits and breathes, then crouches and leaps; a
  little bird pecks about, flies to another spot, and about a third of the time up into the tallest tree within 30 m
  of home, to sit on its crown (in the Amazon, kapoks up to 60 m). Birds roost at night.
- **What they do about you is local** (like a shaken tree): rush within reach of one faster than 10 m/s and it runs. A
  bunny bolts 40 m and freezes, a frog leaps twice, a bird bursts up, circles and comes down; then each eases back to
  its day. What you're walking up to (tapped) doesn't run, and one you've touched trusts you for 20 s. The first time
  one runs, the log says how: "Too fast for the bunny: it bolts. Tap one to walk up gently."
- **Touching them:** in reach they glint like everything else. "(E) Pet the snow hare" (it sniffs; sometimes a binky,
  the twisting jump of a happy rabbit), "Boop the blue tree frog" (its throat puffs: a croak), "Whistle to the little
  red bird" (it flutters and sings back). The camera takes the butterfly shot: you and it, from the side.
- **Sounds:** sniffs, croaks (bigger frogs lower) and songs, synthesized like the rest. Now and then a frog croaks
  nearby at dusk and through the night, and a bird sings by day.
- **Next, maybe:** frogs by inland water once rivers and lakes exist; ducks; birds that follow you a little way.

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

## The astrological clock (11-09)
Jason: "Oh we should totally show the moon in the sky and exaggerated planets (5 degrees of orb) in their positions.
Let's drop the time of day in url and pin to actual clock time so we can use an astrological clock for the game."
- **The clock is always the real one.** `?t=` is gone (old links' `t` is ignored) and landmarks have no moments of
  their own: you see each place at whatever hour it is there. The spinning-days spell still races the sky for you,
  for a minute, and now the Moon and the planets race with the sun.
- **Positions** (`astro.js`, tested against JPL Horizons at two dates five years apart, every body within 0.08°):
  planets from JPL's "Approximate Positions of the Planets", Table 1 (Keplerian elements, J2000, valid 1800–2050;
  Pluto from the older JPL row, as the current table dropped it); the Moon from the Astronomical Almanac's
  low-precision series. Tropical zodiac (ecliptic of date), retrograde when a body's longitude falls over a day.
- **In the sky** (drawn in the sky shader, so clouds pass in front): the Moon about 8° across, lit on the side toward
  the sun, so its phase is the real one (earthshine on the rest); the planets as discs 5° across, Jupiter banded,
  Saturn ringed (its ball smaller so the ring fits the 5°), each in its own colour (Mercury quicksilver, Venus pale
  gold, Mars red, Jupiter tan, Saturn butter, Uranus cyan, Neptune deep blue, Pluto dusky rose). Faint by day, full at
  night; hidden below the horizon. Each wears its glyph (☽ ☿ ♀ ♂ ♃ ♄ ⛢ ♆ ♇) just beneath.
- **The HUD's clock line:** every body's sign and degree, ℞ for retrograde, and the Moon's phase, e.g.
  "☉♏17 ☽♏20 ☿♏6℞ ♀♎23℞ ♂♌22 ♃♌25 ♄♈8℞ ⛢♊4℞ ♆♈1℞ ♇♒3 · NEW MOON" (9 November 2026). The respec windows
  already follow the new moon; more of the game can key to this clock.

## Becoming a game (11-09)
Jason: "Now let's make this more like a game. For starters: inventory and equipment (psychedelic of course);
perception stat that expands what you can see - ley lines are invisible without the correct item, sky beings invisible
without the correct stat; infinite zoom out should be tied to a shrine or an item; shrines need to recharge; compass
items and goal sequences to unlock areas; fast travel only available to places you've been to; portal items (everyone
starts with one) to travel to friends; item exchange between repos - via pigeon; respecs only during a new moon."
His calls on the open questions: **items live in your repo** (one inventory record); **perception joins a budget that
stays 12, starting at 0** (sky beings vanish until you move points at a new moon); **places you've been = ley nodes
you've touched**; and the areas: "Regions of the earth, I was thinking watersheds? We should swap the fly stat for a
climb stat and make terrain above a certain slope impassible. Fly stat unlocks after a dream quest.... Oh yeah, dream
realms are a great idea, reachable by shrines."
- **The plan, one step at a time:** (1) grounded stats, below; (2) inventory and equipment in your repo, the starting
  portal and pigeon, the Prism Lens for ley lines; (3) dream realms through shrines, the first one the quest that
  unlocks flight; (4) shrine recharge, the zoom cap and a high-view shrine, the atlas of touched ley nodes, portals;
  (5) pigeons; (6) watersheds as regions, with compasses and goal sequences.
- **Honour system:** with no server to referee, anyone could write any item or stat into their own repo. With no
  scores or races, that only spoils their own fun.

### Moonseeds: respecs you carry (built 11-09)
Jason: "Let's grant respecs at the new moon but have them be an item so they can be spent or saved."
- **The inventory** (`inventory.js`): what you carry, kept on the device and, signed in, in your repo (one record,
  `org.jason-edelman.dream.inventory/self`: counts by kind and the last new moon that gave you a seed), brought into
  step on sign-in and when you come back, like your creature (a pouch a device only started always yields). The sign-in
  scope adds it, and pigeons' collection ahead of time, so one more sign-in covers both. A BAG button opens your pouch.
- **The moonseed** is the first thing to carry. One falls for you in each new moon's window (a day either side), once
  per moon (the moon's number is kept, so two devices or two visits don't make two); a new creature starts with one;
  thirteen fit (a year of moons). Eat one (from the BAG, or the editor) and your stats loosen until you close the
  editor; change nothing and you keep it. Stats change only that way now; looks, any time.

### Grounded stats (built 11-09)
- **Five stats, one budget of 12:** climb, swim, run, gleam, perception. Creatures from before keep their points, fly
  becoming climb, with perception 0. Old four-number stats (links, kept creatures, records, intents) still read.
- **Climb** sets the steepest slope you can climb on foot: 18° with none, 4.5° more a point, 45° at six. Nothing
  climbs past 45°. On this terrain's resolution (30 m baselines) the big ranges run 17–27° at the median and 35–39° at
  the 90th percentile, peaking near 50–55°; lowlands stay under 5°. So climb 0 keeps you to valleys and foothills, and
  about 1–3% of the high ranges is closed to everyone on foot. Near your limit you slow; past it you stop ("Too steep
  for Nyo"). Routes you tap for respect it too (the pathfinder's cliff is your limit).
- **Flight, for now,** runs on climb (the old fly points), until the dream quest gives it its own stat. Locking it
  before the quest exists would strand everyone.
- **Perception:** how far you see is √((1 + perception) / 4) of before (half with none, 1.3× at six), through the
  fog. Sky beings appear from perception 3; below it they're not there for you (no glint, no hum).
- **Respecs at the new moon** (`moon.js`; since superseded by moonseeds, above): stats change only within a day of a new moon, by the mean synodic month
  from 6 January 2000 18:14 UTC (the true new moon can be some hours off, so a day either side). Looks change any time.
  The first window: 9–10 November 2026, around 21:57 UTC on the 9th.

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
- **The formula (11-09): a power law in each stat, `v = v0 · (1 + stat)^√3`** (`speeds()` in `stats.js`). Jason first
  asked for a power law ("What's the formula that translate run and fly to speed? Should be a power law"), then for
  the exponent: "Let's aim for p=√3". Every point multiplies your speed, and the later ones add the most metres a
  second: a maxed stat is 7^√3 ≈ 29× none. It replaced straight lines (run `8 + 10·run`, fly `30 + 28·fly`).
- **Pinned at the middle:** a creature with 3 points in a stat (the average) moves as it did before p changed; fewer is
  slower, more is much faster. (Pinning stat 0 instead would have sent a maxed runner to 146 m/s; pinning stat 6
  would have left a creature with none crawling at 1.5.)

  | stat | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
  |---|---|---|---|---|---|---|---|
  | run (m/s, typical size) | 2.1 | 6.9 | 14 | 23 | 34 | 46 | 61 |
  | swim | 1.2 | 3.9 | 7.8 | 12.8 | 19 | 26 | 34 |
  | fly | 10 | 35 | 70 | 115 | 169 | 232 | 303 |
  | jump (launch; height at g = 18) | 0.9 (2 cm) | 3.1 | 6.2 | 10.2 | 15 | 20.5 | 26.8 (20 m) |

  Dive follows swim, climb follows fly (1.9 → 54 m/s). Nyo (fly 1, swim 5, run 4) now flies at 35 m/s (was 59) and
  runs at 39 (with its size).
- **Body-powered movement scales with size** as the square root of leg length (the same Froude number, v²/gL, keeps
  the same gait): running, jumping, swimming and diving multiply by √(scale / 1.2). So the editor's size gene matters
  a little (the smallest creature is about 0.82× typical, the biggest 1.15×), and shape spells matter a lot: a giant
  strides √6 ≈ 2.4× faster, a tiny creature goes at half speed, taffy's long legs give 1.8×. Flying doesn't scale:
  the wings are the dream's.

## Artifacts: things left for mutuals (built 11-08, PR #22)
Jason: "let's use atproto back links to host artifacts for mutuals to discover." The first kind is the **cairn**;
postcards, echoes and sounds use the same record and discovery, and come next.

- **The record** (`docs/lexicons/org.jason-edelman.dream.artifact.json`) lives in its maker's own repo:
  `{ kind, place, latE6, lonE6, cairn: { seed, hue }, note, createdAt, renewedAt? }`. atproto records can't hold
  floats, so coordinates are integer microdegrees. A cairn is only a seed and a hue: no geometry travels, so a
  stranger can't send triangles.
- **Places** (`places.js`): a global grid of ~11 km cells (0.1° bands, longitude cells widened by 1/cos), each with
  a URL, `https://dream-of-the-earth.jason-edelman.org/place/1/{band}/{cell}`. A record's `place` is the cell it
  stands in. The URL is real: the Worker redirects it to the game at that cell.
- **Discovery** (`atproto.js`), no sign-in needed:
  1. Constellation (constellation.microcosm.blue, a public backlink index over the whole firehose; CORS `*`)
     answers `getBacklinks?subject=<place URL>&source=org.jason-edelman.dream.artifact:place` for each cell
     within 16 km, when the world grows and every 90 s.
  2. Bluesky's public AppView answers `app.bsky.graph.getRelationships` (no sign-in, 30 at a time): only makers
     who are mutuals of the viewer (or the viewer) are kept.
  3. Each record is read from its maker's own PDS (DID document from plc.directory, or did:web's well-known file),
     so a deleted record is gone here too. Replies are size-capped; ids are checked; `parseArtifact` checks every
     field, and a record must say it stands in the cell it's indexed under.
  - **Measured 11-08:** Claude's test cairn was indexed ~100 s after it was written (Library measured 0.5–9 s the
    day before), so your own new cairn shows at once from local state. Discovery as Jason found it in 1.9 s; as a
    non-mutual (bsky.app), nothing.
- **Fading with the moon:** whole for most of a synodic month (29.53 d) after `createdAt`/`renewedAt`, thinning
  over the last week, then gone from the game. Renewing (`putRecord` with `renewedAt`) starts another moon. Fading
  runs on the real clock, not `?t=`.
- **In the world** (`cairns.js`): 3–6 stacked stones and a crystal in the maker's hue, ≤ 96 triangles, about
  4–15 m tall (beside 50 m kapoks and a creature Nyo's size). On land they stand; at sea they float. A dot of
  their hue a few pixels across marks each one from kilometres away. In reach (30 m) they glint, and E reads one:
  the log shows its note, its maker's handle and its age. Your own says "Tend your cairn" (renew, or take it down).
  Reading or tending holds a side-on camera shot on you and the cairn.
- **Leaving one** (Bluesky ▾ → Leave a cairn here): re-roll the shape, pick the crystal's colour, write up to 140
  characters. A ghost of it stands 12 m ahead-left while you choose, and the camera holds on it. It goes in your
  repo with `createRecord`.
- **Sign-in** (`account.js`): atproto OAuth (PAR, PKCE, DPoP) with `@atproto/oauth-client-browser` 0.5.10, vendored
  by `scripts/vendor-atproto` (esbuild; notices in `web/vendor/LICENSES.txt`), loaded only when someone signs in.
  Scope: `atproto repo:org.jason-edelman.dream.artifact` (that one collection). Client metadata:
  `web/client-metadata.json`. The redirect lands on the bare page, so the game saves where you were (seed, stats,
  place, heading, zoom) and puts you back. **Just look** reads as any handle without signing in: everything it
  shows is public anyway.
  - **Checked 11-08:** in headless Chromium, Sign in loaded the client, bsky.social accepted the scope at PAR, and
    the browser landed on Bluesky's authorize page. **The token exchange works:** Jason's phone screenshot (11-08)
    shows him signed in (the button reads "@jason-edelman.org ▾", not "(LOOKING)"). **Not yet seen:** a cairn
    written through the OAuth session (`createRecord` via its fetch handler); his first cairn is that test.
  - "How do I add a Cairn?" (Jason, 11-08): the CAIRNS list now has "Leave one here" too, not only the Bluesky menu.
- **What mutuals-only means:** what the game *shows*. atproto records are public, so anyone who looks can read
  every artifact; the sheet says so. The trust boundary is that a stranger can't put anything in your world.
- **Trade-offs:** Constellation is a third-party dependency (if it's down, nobody sees new artifacts; nothing
  breaks). There's no cap on how many cairns a player leaves yet; the game shows at most 24 per maker.
- **Cairns to visit (11-08, Jason: "Can we make a list of artifacts for you to travel to? Maybe even a map....")**:
  every record also carries `world: "https://dream-of-the-earth.jason-edelman.org/"`, a second backlink target,
  so one Constellation query lists every artifact in the dream; the same mutual check keeps your mutuals' (and
  yours). The CAIRNS button opens them nearest first (colour, maker, note, distance, age) with Go: you arrive 30 m
  south and 20 m west of the cairn, facing north, so it stands ahead and to the right. **The map is the globe:**
  zoomed out past 400 km, each cairn is a dot of its maker's colour on the side of the planet facing you; tap one
  to go there. Refreshed every 3 minutes and when the list opens. Claude's first cairn was updated (same record,
  same age) to carry the world link; records without it still parse and still show by place.
- **Next kinds:** postcards (an image blob, so `blob:image/*` joins the scope), echoes (your avatar, parsed against
  the 256-triangle cap), sounds (an Operator Field patch).

## Multiplayer over atproto: what fits (measured 11-08)
Jason: "I'm wondering how much multiplayer we can do on atproto." Measured and read this session:
- **Delivery is fast.** Jetstream (Bluesky's filtered firehose; public instances at `jetstreamN.us-{east,west}.bsky.network`)
  takes `wantedCollections` (up to 100, prefixes allowed) and `wantedDids` (up to 10,000), per its original README
  (`bluesky-social/jetstream-legacy`). Subscribed in a browser to `org.jason-edelman.dream.artifact` from Claude's DID,
  an update Claude wrote arrived **183 ms after the write returned**, and nothing else came through the filter.
  Constellation is the slow part (~100 s to index), so anything live should ride Jetstream, not the backlink index.
- **Writes are budgeted.** Bluesky-hosted accounts get 5,000 points an hour and 35,000 a day (create 3, update 2,
  delete 1), shared with everything else the person does on Bluesky (`bsky-docs`, rate-limits page, read 11-08). One
  overwritten record every 5 s is 1,440 points an hour (about 29% of the hourly budget, sustainable all day); every
  2 s is 3,600 an hour (about 10 hours a day). The relay limits a *new* self-hosted PDS to 2,600 events an hour across
  all its accounts, so players on small PDSs can't beacon often.
- **What that allows:**
  1. **Asynchronous, a good fit:** artifacts (built); echoes (a recorded flight that mutuals can watch as a ghost);
     visits (a record pointing at a cairn's at-uri, so its maker sees who stopped by, through backlinks); gatherings (a
     place and a time on the globe); **calls** ("come find me": a record naming the mutual, seen at once over Jetstream
     if they're online, matching Jason's "Calling only works if your moot is online", and deleted after).
  2. **Live-ish presence, possible with costs:** one record per player, overwritten every few seconds and delivered
     over Jetstream in well under a second, interpolated on the other side, would put every online mutual's creature
     in the world and on the globe, from the browser, today. The costs: it's a public broadcast, not mutuals-only
     (anyone can subscribe to the collection); Jetstream now describes itself as a full-network archive with replay,
     so a trail of where your creature was and when you played may be kept, which cuts against leave-no-trace; it
     spends the player's write budget; and small PDSs can't keep up. Deleting the record when you leave removes it from
     your repo, not from anything that already saw it.
  3. **Real time, not atproto:** 15 Hz positions in a flock, avatars, voice. That stays iroh (identity and the node
     record on atproto, as designed).
- **Decided (Jason, 11-08):** "We might need an intents model" → "Yep! And we only keep current intent in the repo,
  just overwrite; and we only ever show data from mutuals. Let's respect Bluesky mod and block norms. Should keep
  everything light." Built as below.

## Presence by intents (built 11-08, PR #26)
- **The record** (`org.jason-edelman.dream.intent`, rkey `self`; `docs/lexicons/`): what the creature is doing, not
  where it is: `rest`, `goto` (route of up to 64 points, speed, flying or not, cruise height), `ride` (highway, start
  fraction, direction) or `steer` (heading, speed, climb), with a start time and place, and the creature's seed and
  stats so mutuals grow the same creature. About 300 bytes, integers only. Always overwritten (`putRecord`), never
  accumulated.
- **Where they are** (`whereAt` in `intents.js`): a trip is replayed along its route at its speed, a ride is a pure
  function of time, steering is dead-reckoned (up to 90 s). Rest stays put.
- **When yours is written:** checked once a second; written when what you're doing changes (at most every 1.5 s),
  when you've drifted over 60 m from what mutuals compute (at most every 6 s), and every 4 minutes as a heartbeat.
  Deleted when the tab hides, on sign-out, and when you switch it off (Bluesky ▾). Readers drop any intent older
  than 10 minutes, so a closed tab leaves no ghost.
- **Hearing mutuals:** one Jetstream WebSocket, filtered to this game's two collections (intents and cairns, so new
  cairns arrive live too, without the index lag), reconnecting with backoff across the four public instances; plus,
  on arrival and every 3 minutes, a fetch of current intents (Constellation's `world` backlinks for intent records,
  then each mutual's `intent/self`).
- **Whose things we show** (`allowed()`), for cairns and creatures alike: mutuals (both follow), no block either way
  (direct or by list, from the public `getRelationships`), an account Bluesky still serves (a profile comes back),
  no `!hide`/`!takedown`/`!suspend` label from Bluesky's moderation, and not muted by you (your mute list, read
  through your PDS with the narrow `rpc:app.bsky.graph.getMutes` permission). Relationships and profiles are re-read
  after 10 minutes, so a new block takes effect.
- **In the game:** mutuals' creatures where their intents put them, eased so a new intent glides; a small @handle
  over each within 600 m; pale cyan dots on the globe (tap to go); "In the dream now" in the CAIRNS list (distance,
  what they're doing, Go); E near one squeaks at them (just you and the sound; nothing is sent).
- **Sign-in scope** grew to `atproto repo:…artifact repo:…intent rpc:app.bsky.graph.getMutes?aud=…#bsky_appview`
  (bsky.social accepted it at PAR, 11-08). A sign-in from before this doesn't cover intents: the menu says "Sign in
  again to show yourself to mutuals."
- **Checked 11-08:** Claude walked laps around the two Amazon cairns from a script (one intent per ~98 s lap); looking
  as Jason, the game found Claude within 2 s, labelled and listed it ("110 m · on the move"), and drew Claude's
  creature walking between the cairns. **Not yet seen:** your own intent written by the game through an OAuth
  session (it needs the new scope, so Jason's next sign-in).
- **Costs, unchanged by lightness:** intents are public records on the firehose and may be archived; destinations are
  public before you arrive; phone clocks a second or two apart put a creature tens of metres out.

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
0. **The world (built 11-07):** faceted terrain and seafloor near a random ley node, swimmable water, the real
   sun and sky, the golden highways (additive glow; over a bright sky it can burn to white, and Jason: "Blowout
   is okay, it's retro"), and one random creature with stats, flying, running and swimming. Live at the subdomain. What building it found:
   - **Open-ocean tiles at zoom 11 are flat zero** (11/587/1214 off Chile is a 757-byte all-zero tile, while
     zooms 7–10 there carry the seafloor). The terrain fills exact zeros from the zoom-10 parent, so seas
     have their real depth (seed 7: 4,089 m).
   - **Map tiles stop near ±85°.** Two gravity-wells nodes sit on the poles, so nodes beyond ±80° aren't spawn
     points until there's polar ground data.
   - **The interim temperature model is latitude-only.** It's too cold for maritime climates (the Scottish
     Highlands read as tundra) and has no rainfall (the Sahara reads as subtropical green). CHELSA fixes both
     in step 1.
   - Daytime blowout was briefly "fixed" with normal blending by day, then reverted at Jason's word: it's retro.
   - **Underwater, the sky and highways are hidden.** They ignore fog by design and showed through the sea.
1. **Travel (built 11-07):** riding the highways.
   - Board by flying inside a highway's glow within 60° of its direction, so you can cross one without being
     snatched.
   - A ride is ley-space: the ground falls away and there's only the line, streaks, sky and sea. Speed is 200 km/s
     × 2 per rank, with ease in and out, to the node at the end of the line. The world regrows where you get off.
   - Shift/S steps off anywhere, and A/D hops lines at a crossing.
   - Every node has a pillar of light that lifts any creature to the ring.
   - Lines are long (median 3,527 km for Becker-Hagens, 8,262 km for gravity-wells major and basic, 10,008 km
     for minor), which is why the speeds are absurd: a typical full ride takes 5–50 s.
   - Highways fade within ~700 m of the camera, so one you're inside, or a node where many meet, reads as light
     ahead. In ley-space there's no fade.
   - **To the horizon (11-08, Jason: "reduce fog and render landscape to the horizon for real immersion"):**
     - **Three terrain rings:** zoom 11 near (±29 km, ~900 m facets), zoom 9 (±117 km, ~5 km facets), zoom 7
       (±470 km, ~20 km facets). Each outer ring skips the cells under the ring inside it and sinks 30 m near
       the seam, so the inner ring wins where they overlap.
     - **Real Earth curvature:** every world vertex drops by d²/2R from the camera, in the vertex shaders, so the
       land meets the sky at the true horizon (~67 km from 350 m up, ~195 km from 3 km).
     - **Logarithmic depth:** for a creature 3 m away and land 400 km off.
     - **Fog as aerial perspective:** it starts at 25% of the horizon distance and ends just past it, receding
       as you climb.
     - **A 1,200 km sea** that waves on the GPU, and the sky pushed out to 900 km.
     - **A decoded-tile cache** (160 tiles), so regrowing every 15 km doesn't redo the far rings.
     - Highways draw out to 320 km.
     - In ley-space the beam under you is now steady, with pulses streaming back past you. In the world, the
       pulse made the stretch near you flash every ~2 s.
     - Headless: 60 fps (the vsync cap) in both views, same as before.
   - **Sky beings (11-08, Jason: "Eldritch monstrosities made of l-systems are cute as long as they sparkle and
     move slowly and gently"):**
     - **Bodies:** each grows from a seeded stochastic L-system (`lsystem.js`: a string-rewriting grammar and a 3D
       turtle) in one of four plans: hanging lanterns (jellyfish-like), floating coral crowns, phyllotaxis
       spirals of eyes, and many-armed blooms. Limbs are three-sided prisms, eyes and lanterns octahedra, ≤ 1,600
       triangles, 350–1,100 m in radius.
     - **Motion:** tips sway slowly in the vertex shader; glow pulses travel outward along the limbs; sparkles
       twinkle around the bulbs; the whole body bobs and turns gently.
     - **The schedule:** they drift along every ley line at 25 m/s, 240 km apart, flowing alternately one way or
       the other. Position is a pure function of unix time, so every player sees the same being in the same place
       with no network and no stored state. Each one floats 500–1,600 m above its highway, and they're drawn
       within 220 km.
     - `&heading=` and `&alt=` make views reproducible (used to photograph them).
   - **Clouds and waves (11-08, Jason: "clouds and waves going as shaders (we can use l systems for them too) -
     need a sense of depth and distance"):**
     - **The sea:** a camera-centred mesh of rings (15 m apart near you, growing ×1.16 out to 700 km) carrying six
       directional waves (4.6–420 m wavelengths, deep-water speeds). Each pixel re-evaluates the waves for
       lighting: posterized diffuse bands, banded crests and foam near you, a sparkling sun glint, sky
       reflection at grazing angles, and fog. Waves smaller than a pixel fade out and are skipped, so the pattern
       shrinks cleanly into the distance, which is the depth cue. From below the sea is a fogged, rippling
       ceiling.
     - **A high deck** at 8 km: fbm noise stretched along the wind, posterized into a lit and a shaded tone,
       tinted by the real sun and the sky.
     - **Cumulus** at ~1.2–1.9 km, raised over high ground: flat-shaded instanced puffs arranged by a small
       L-system. They share a base altitude, so they form a floor receding to the horizon. Distant clouds keep 8
       or 4 puffs.
     - **The sky is shared:** cells fixed in drifting air. Prevailing winds by band (trades blowing west under
       30°, westerlies to 60°, polar easterlies) at 8 m/s on the real clock. Cloudiness follows the circulation
       cells: 0.55 in the doldrums, 0.18 under the subtropical highs, 0.45 in the mid-latitudes. Same sky for
       everyone, nothing stored.
     - **Curvature moved to the projection step,** so instanced and rotated meshes curve correctly.
     - **Superseded 11-08 for the sky and clouds** by the sky shader (below); the sea stays.
   - **The sky as one shader (11-08, Jason: "Let's rethink clouds and sky, actually. Can we do the whole thing as
     a shader? There's some really cool stuff up on shadertoy for that"):** `web/js/skyshader.js`.
     - **Three passes:** the opaque world is drawn into a texture with its depth; one full-screen pass draws the
       sky and marches each pixel's ray through the clouds up to whatever the world put in the way; then the
       transparent things (sea, highways, sparkles, fireflies) are drawn on top. Where a cloud is more than half
       opaque the pass writes its depth, so a highway behind a cloud is hidden and one in front isn't.
     - **Clouds:** volumetric, on the curved Earth (true altitude is the ray's height plus d²/2R). Cumulus from
       1.5 km, ~3 km across, from billowy noise (inverted Worley plus value noise, a tileable 32³ texture made on
       the phone from a fixed seed) eroded by the weather's coverage, rounded on top. The strongest cells in
       the tropics tower to ~10 km as storms, ~10 km across, with rain shafts falling in streaks beneath. Cirrus
       streaks on a shell 9 km up. Light: Beer-Lambert extinction, a two-step march toward the sun, a
       two-lobe Henyey-Greenstein phase, a powder term, and skylight in the dream's lavender and pink.
       Steps grow geometrically (fine where the ray enters a cloud, coarse far off), the fine noise octave fades
       with distance, a 4×4 Bayer dither hides banding, and clouds melt into the haze a little before the ground.
     - **The weather** (`web/js/weather.js`, the same model in JS for tests): a tileable 256² field riding the
       prevailing winds (unchanged: 8 m/s, trades west, westerlies east), thresholded by each latitude's
       cloudiness (unchanged), with storms where it peaks in the tropics. A function of place and unix time
       only, so everyone shares one sky; the wind offset wraps every 40,000 km (~58 days).
     - **Sky:** the same banded palette as before, plus a banded halo around the sun, the big stylized sun, and
       hashed stars at night.
     - **Cost:** march steps follow the detail governor (20 + 44 × its scale, so 31–64). Headless software
       rendering, governed: ~15 fps in the Amazon (was ~20 with the old clouds). Unverified on a phone.
     - **Not copied from Shadertoy.** Its terms page refused an automated read; secondary sources consistently
       report that shaders with no stated licence default to CC BY-NC-SA 3.0 **(unverified first-hand)**, and
       non-commercial plus share-alike doesn't fit this MIT repo. So this is written from the published
       techniques, not adapted from any one shader. A Shadertoy shader whose author states MIT or CC0 could be
       used with credit.
     - **Seen, not fixed:** storm tops from above are a little flat; the farthest clouds still stipple slightly
       near the horizon; storms are only in the tropics and the mid-latitude storm tracks, not monsoons.
   - **Sólstafir and cloud shadows (11-08, Jason: "can we add Solstafir next?"):**
     - **Sólstafir,** shafts of sunlight through the gaps: the sky pass now draws into a second texture whose
       alpha marks open sky close around the sun (clouds, land and trees all hide it). A last full-screen
       pass marches 32 steps from each pixel toward the sun's place on screen, gathering that mask with a
       falloff, and adds it as sunlight: the classic light-scattering-as-a-post-process technique (Mitchell,
       GPU Gems 3, 2007, **from memory, unverified**). Beams radiate through cloud gaps and through the canopy,
       strongest when the sun is low and golden, and fade as the sun leaves the frame.
     - **Tried first and dropped:** a volumetric version (marching the air under the clouds and testing each
       point's view of the sun). Looking toward the sun the shadow samples line up with the view ray, so
       shafts only showed off to the side, and with a phone's sample budget they came out as noise.
     - **Cloud shadows on the ground:** for each pixel of land, follow the sun's ray up to the middle of the
       cloud layer and darken by what's there (up to 42%).
     - **The cloud base follows the ground:** 1.5 km above the smoothed terrain around you (it was 1.5 km above
       sea level, which left the 2.4 km Ethiopian plateau permanently inside the clouds).
   - **Orographic weather (11-08, Jason: "for the weather model we should incorporate orographic effect if we
     don't already"; we didn't):**
     - **The land in the shader:** each world hands the sky a 128² texture of the terrain ±240 km around it
       (two bytes a texel: height and a ~15 km blur of it, in 30 m steps; `makeOrography` in weather.js).
     - **Along the prevailing wind** (the same bands as before: trades blow west, westerlies east), each cloud
       sample compares the broad land here with the land 12, 40, 70 and 100 km upwind:
       - **windward lift** (rising into the wind over 12 km, or the broad slope over 40 km unless it's going
         downhill right here) adds cover, up to +0.5, and on big slopes rain;
       - **lee descent** clears (down to 15% of the cover);
       - **a barrier upwind** (the highest land 12-100 km upwind standing 0.6-2 km above here) leaves a rain
         shadow far downwind: cover down to 40%, no storms.
     - **The cloud base rides the broad land** (1.5 km above the 15 km blur), so peaks poke up into their own
       cap clouds; this replaces the camera-local base from earlier the same day.
     - **The same in JS** (`weatherAt(lat, lon, unix, broad)`), tested on a synthetic ridge: the west face is
       cloudier and rainier under the westerlies, the east face in the trades, the lee clears, and the shadow
       reaches ~55 km downwind.
     - **Seen on real terrain:** Patagonia, cumulus banked against the Andes from the Chilean side, clear over
       Bariloche; the Sierra Nevada, a cloud band on the western slopes with the Owens Valley clear; Hawaii's
       Big Island, cumulus on the windward east under the trades, Kona clear.
     - **Also:** clouds now march 90 km past where a ray enters them (was 45), with steps growing faster, so
       a mountain's cloud wall shows from across a valley; looking down from above the clouds the steps are
       even. Clouds melt into the haze a little later than before.
     - **Not modelled:** winds other than the zonal bands (so no monsoons, sea breezes or valley winds);
       lenticular clouds in the lee waves.
   - **Landmarks menu (11-08, Jason: "drop down menu in HUD with the landmarks you gave me for the biome
     check"):** a select at the top right lists the biome check places plus a few sky views
     (`web/js/landmarks.js`). Choosing one regrows the world there, at that landmark's altitude, heading,
     zoom and moment, and rewrites the URL so the view can be shared. The clock now runs on from `?t=`
     (or a landmark's moment) instead of freezing the sun there. (Since 11-09 there's no `?t=` and landmarks
     have no moments: the clock is always the real one. See "The astrological clock".)
     - **Headless (CPU-rendered) frame rate fell from 60 to ~30–34 fps,** mostly the sea shader. Real GPUs should
       be well above that at 400×224 internal pixels **(unverified on a phone)**.
   - **Zoom for scale (11-08, Jason: "zoom way out of your creature to get a sense of scale"):**
     - **Controls:** the wheel, +/− or PageUp/PageDown, or a pinch zooms from 15 m (6 m since creatures shrank, 11-09) to 40,000 km (`&zoom=`
       metres).
     - **In the world (to 400 km):** the camera pulls back and tilts down, from 18° to 70°. Past ~6 km up the
       highways also draw as thin gold lines, since the ribbons go sub-pixel, and a sparkle marks you. Fog is
       capped inside the outer terrain ring, so its edge melts into haze.
     - **Past 400 km, the globe:** a faceted icosphere (20,480 facets, ~240 km each) coloured and lifted by real
       zoom-2 elevation (relief ×25), with oceans coloured as water. The whole ley grid wraps it in gold, each
       class its own lines; from far out only the two rarest show. There's an atmosphere rim, stars, the real
       sun on the day side via the subsolar point, and you as a sparkle. Riding while zoomed out shows you
       crossing the planet.
     - **Found while building it:** in three.js 0.186, an icosphere's `detail` subdivides linearly ((d+1)² per face),
       not recursively; detail 5 gave only 720 facets.
2. **Biomes and life:**
   - **First pass (11-08, Jason: "Let's do biomes next! Plants first but if we can get insects that would
     rule. Even if the insects are like 4 triangles"):**
     - **Climate from Köppen-Geiger** (Beck et al. 2023, 1991–2020, 0.1°). Each of the 30 classes becomes a
       moisture regime (wet, seasonal, arid) and a rung on a temperature ladder of seven, from ice to the
       warmest. Each regime has its own ladder: wet runs tundra, taiga, continental, oceanic, subtropical,
       rainforest; seasonal ends in highland, mediterranean, savanna; arid in cold desert, cold steppe, steppe,
       desert. Where the map has no data (small islands, coastal edges), latitude and the lapse rate decide.
     - **Jason's rule:** ground that stands above its smoothed surroundings (a ~4 km blur of the near terrain)
       climbs one rung per 900 m, since air cools ~6.5 °C per km and a rung is ~6 °C. So a desert mountain
       standing 2 km above its plain turns cold steppe. The land, the seafloor and the globe are all
       coloured by biome; steep faces stay bare rock.
     - **Plants:** ten species from small L-systems or procedures: broadleaf, rainforest emergents, palms,
       acacias, shrubs, saguaro-ish cacti, conifers, cypresses, grass and moss. Three shapes each, picked per
       plant. Trees and shrubs stand on a global 40 m lat/lon grid out to ~1 km; grass and moss on a 10 m
       grid out to 220 m. Each cell's hash decides whether anything grows there (by the biome's density),
       what, how tall, which way it faces, and its colour, a shift from the biome's own. So every phone grows
       the same forest and nothing is stored. Some warm-biome trees and shrubs blossom; everything sways from
       the top. Replanting after 200 m of travel takes ~10 ms.
     - **Insects:** butterflies of exactly 4 triangles by day, flying figure-eights around hashed homes on the
       shared clock (dream-sized, 3–5 m wingspans, so they read from the camera), and blinking fireflies at
       night where the biome has them. Both cost almost nothing: the flight is in the vertex shader.
     - **Cost:** in the rainforest, headless (CPU-rendered) frame rate falls from ~30 to ~17 fps with plants,
       or from ~34 to ~19 at the default 350 m. Cutting plant triangles by 38% didn't change it, so it's
       fragment overdraw in software rendering. A phone GPU at 400×224 should not notice **(unverified on a
       phone)**.
   - **Ten trees, ten genera (11-08, Jason: "more radical body form differentiation on trees and more of a
     complete canopy ... spread the 10 across genera and choose charismatic species for each biome - mega
     conifers, ficus, spreading oaks, baobab"):** each a seeded procedure with its own body plan, up to 128
     triangles up close:
     - **Ceiba** (kapok): a 45–60 m rainforest emergent on buttress fins, with near-level limbs and a crown of clumps.
     - **Ficus** (banyan): a short massive trunk, limbs flung wide, prop roots dropping like pillars, a broccoli
       dome twice as wide as it is tall.
     - **Cocos** (coconut palm): a leaning curved trunk and ten drooping fronds.
     - **Adansonia** (baobab): a swollen bottle of a trunk and stubby root-like limbs, mostly bare.
     - **Vachellia** (umbrella thorn): a thin forked trunk under a flat pancake crown.
     - **Carnegiea** (saguaro): a ribbed green column with one to three arms.
     - **Quercus** (spreading oak): a short thick trunk, great low limbs, a lumpy crown 1.7× as wide as tall.
     - **Cupressus** (Italian cypress): a dark green flame.
     - **Sequoiadendron** (giant sequoia): the mega conifer, 55–85 m, a flared cinnamon column bare for half
       its height under a lumpy spire.
     - **Picea** (spruce): a narrow spire of drooping tiers.
     - Shrubs, grass and moss grow underneath. **By biome:** rainforest banyan, kapok and palm (density 0.95,
       for a closed canopy); savanna umbrella thorn and baobab; desert saguaro; mediterranean oak and cypress;
       subtropical banyan, oak and palm; highland sequoia, spruce and oak; oceanic oak; continental oak and
       spruce; taiga spruce. Bark is pushed toward the dream: pink baobab, cinnamon sequoia, grey-green kapok.
     - **After Jason's references (two photos of the Amazon canopy, 11-08):** crowns are rounder heaps of
       clumps, sunlit yellow-green on top and dark beneath; every tree gets its own shade of green; blossoms
       are rarer (3%); far away a broadleaf crown is a five-sided dome in the air (10 triangles), while
       conifers and cacti stay spindles to the ground.
     - **Cost at full detail, rainforest:** ~16k near + ~110k far plant triangles. The governor cuts back on
       devices that can't hold 40 fps.
   - **Distance tiers (11-08, Jason: "poly reduction at distance for the zoom"):**
     - **Near:** within 250 m of the camera a plant is its full shape (up to 64 triangles). Grass and moss
       draw within 400 m of the camera and have no far shape.
     - **Far:** beyond that, trees and shrubs become one six-triangle spindle grown from the same shape
       (crown ring at the crown's middle, top at its top, foot at the trunk's base, fading from leaves to
       wood). They reach 2.5–3 km for the big trees.
     - **Zoomed out:** tiers go by distance from the camera, so pulling back sheds detail smoothly. Past
       6 km of zoom plants stop drawing, and the ground itself darkens by tree density (up to 22% in the
       rainforest), so forests still read from orbit.
     - **Cell cache:** each grid cell's plant is worked out once per world and kept while in range;
       re-sorting tiers as the camera moves just copies precomputed matrices.
   - **The detail governor (11-08):** every 1.5 s it reads the median frame time. Under 40 fps it shortens
     the far reach (×0.8, or ×0.6 under 25 fps), down to 25%; over 55 fps it lengthens it again (×1.1). It
     changes only what's drawn, never the world. `&detail=0.25–1` pins it. The HUD shows FPS, and
     "FORESTS n%" when it has cut back.
     - **Why:** in headless SwiftShader, forests to 2.5 km cost 20 → 6.6 fps; to 900 m, 16 fps. Neither a
       reversed depth buffer nor front-to-back ordering helped (5–7 fps). The cost there scales with how
       many far plants are drawn, and a phone's GPU is a different machine, so each device finds its own
       reach. Headless settles at 25% and 19–25 fps, on par with the build before tiers.
   - **A low camera draws the far forest only so far (11-08, Jason: "I'm starting to hit the forests% debug -
     oddly it's when I'm closer to the ground"):** the far reach is capped at 800 m + 14 m per metre of camera
     height (about 1 km from 15 m up, the full reach by ~150 m), and giants keep 45 × their height, so kapok
     and sequoia emergents still break the skyline. Rainforest floor: 11.5k plants drawn → 4.8k, far triangles
     110k → 43k, with no visible change at the horizon (screenshots compared). **Why (a hypothesis, not
     measured on the phone):** headless SwiftShader costs the same low or high, so it can't show this. From a
     low camera you look along the forest, so the far shapes (1–2 px specks past a kilometre) stack dozens
     deep behind each horizon pixel. The log depth buffer writes `gl_FragDepth`, which turns off early depth
     testing and Apple's hidden-surface removal, so every layer is shaded. The camera director's ground framing
     (about 16 m above you, against 26 m before) made those views flatter. If FORESTS still shows near the ground,
     the next suspect is the log depth buffer itself.
   - **Considered: a raytracing renderer (11-08, Jason asked).** Not adopted, Claude's recommendation:
     raytracing costs more per pixel than rasterizing (each pixel walks a tree of the scene); plant sway,
     butterfly flight and the Earth's curve all happen in vertex shaders, which a raytracer would need
     rebuilt every frame; and it buys shadows and reflections rather than the SNES look. Ray-marching for
     particular effects (volumetric clouds, sky-being glow, light under water) on top of the raster scene
     could fit later.
   - **Later:** CHELSA for continuous temperature and precipitation, SoilGrids, canopy height; braided
     interchange rings where networks cross; inland water (rivers and lakes are drawn as land today, sand
     where under 12 m).
3. **Avatars:** the editor (randomize, mutate, edit) and stats are in (11-08, "Your creature, customized"); Operator Field voices next.

**Multiplayer:**
4. **iroh in the browser, tested first:** relay-only datagrams and gossip between two tabs. If they work, the
   MMO may stay in the browser.
5. **Mutuals:** Bluesky sign-in, the node record, calls, teleport, introductions, the two rings.
6. **Native, if still needed:** the kernel (Tauri + iroh, signed bundles), then real phones. **Not testable in
   a Claude sandbox:** it can't reach iroh's relays, and Tauri + iroh has never run on a real phone.

## Data and code credits (to confirm before shipping)
| Source | Use | License |
|---|---|---|
| Mapzen terrarium tiles (AWS Open Data) | elevation, bathymetry | per the AWS Open Data listing **(check)** |
| CHELSA | temperature, precipitation | CC BY 4.0 (catalogue pages) |
| SoilGrids 2.0 (ISRIC) | soil | CC BY 4.0 (JRC catalogue) |
| ETH Global Canopy Height 2020 (Lang et al. 2023) | canopy height | CC BY 4.0 (ETH record) |
| Köppen-Geiger (Beck et al. 2023, Scientific Data 10:724), 1991–2020 at 0.1°, from figshare 10.6084/m9.figshare.21937571 | climate class (biomes) | CC0 on the figshare record (its API, checked 11-08); an earlier session's search found the maps' page saying CC BY 4.0 **(not rechecked)**, so credit them either way |
| leylines-solids (Joerg Roth) | ley geometry | Apache-2.0 (package.json) |
| Becker & Hagens; Leland (judsyn.weebly.com); McCooey's Visual Polyhedra | grid origins | credit |
| three.js | renderer | MIT |
| @atproto/oauth-client-browser 0.5.10 and 18 dependencies (npm, bundled by scripts/vendor-atproto) | Bluesky sign-in | MIT (ISC for lru-cache, Apache-2.0 OR MIT for multiformats), per each package's own license file and package.json (`web/vendor/LICENSES.txt`) |
| Constellation (microcosm, constellation.microcosm.blue) | finding artifacts: a public backlink index | a public service: "You're welcome to use this public instance!" (its home page, 11-08); credit it |
| Bluesky public AppView, plc.directory | mutuals, handles, DID documents | public APIs |

## Questions for Jason
Answered 11-07: depth (keep it real; swim decides), ley networks (both, interacting, rarer = faster and larger),
spawn (near nodes), calls (online moots only), the Worker (its own subdomain). Still open:
1. **Relays at 200:** run our own `iroh-relay` on a small always-on machine, allow direct connections between
   mutuals (each sees the other's IP), or both?
2. **The stat budget:** 12 points, 0–6 each?
3. **Ley speed:** double per rank (proposed) or strictly 1/line-count?
