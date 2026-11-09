# Dream of the Earth

A flock of creatures wandering a real Earth together, by air, over land and under water. SNES-era low poly,
psychedelic, with golden ley highways of light for fast travel. Your mutuals on Bluesky can call you to
wherever they are.

It runs peer to peer over [iroh](https://github.com/n0-computer/iroh) and leaves no trace: there's no world
state on any server. The world is grown on each phone from real elevation, seafloor, climate, soil and canopy
data, and creatures' movements pass directly between players.

**Status:** single-player in the browser: **https://dream-of-the-earth.jason-edelman.org**. You spawn near a
random ley node on the real Earth as a random creature with random stats. Terrain and seafloor come from real
elevation data and run out to the real, curved horizon, under that place's real sun, with golden ley highways
in the sky. Fly, run and swim with WASD/arrows, Space (up) and Shift (down); on touch, drag and use the ▲▼
buttons. Tap or click anything to go to it: flyers fly straight over, walkers find a way round lakes and
cliffs. When you get there it answers: trees shake and drop things, your creature squeaks, butterflies chirp,
sky beings hum, and highways take you aboard, all told in a little log. M mutes the sounds. The camera
frames what you're doing: low on the ground, banking in the air, a crane down when you arrive somewhere, a low
angle on a tree you shook, and a slow orbit when you sit still. The design is in
[`docs/design.md`](docs/design.md).

**Zoom:** the mouse wheel, +/−, or a pinch takes the camera from just behind you out to the whole planet: hills,
ranges, coastlines, then a low-poly globe wrapped in the golden ley grid, with you as a sparkle on it.

**Sky and sea:** shader waves with foam and a sparkling sun glint. The sky is one shader: volumetric cumulus that
tower into storms with rain shafts beneath them, cirrus streaks, a banded sun and stars, ray-marched over the
curved Earth, with sólstafir (shafts of sunlight through the gaps) and cloud shadows on the land. The weather
rides real-ish prevailing winds on the real clock and feels the land: clouds bank up on windward slopes and
rain shadows stretch downwind of mountains. Everyone shares the same sky.

**Landmarks:** the menu at the top right carries you to a place in every biome (and a few sky views), at a
moment with good light.

**Biomes:** the land is coloured by its real climate (the Köppen-Geiger map), and ground that rises above its
surroundings turns colder, one step per 900 m. Ten charismatic trees, each its own genus and body plan, grow
where they belong, the same on every phone: kapok and banyan over the rainforest, baobab and umbrella thorn on
the savanna, saguaro in the desert, spreading oaks, cypress flames, giant sequoias and spruce spires. Butterflies of four triangles fly by day, and
fireflies blink at night.

**Sky beings:** sparkling eldritch things grown from L-systems drift slowly along every ley line, and everyone
sees the same one in the same place at the same moment.

**Ley highways:** fly along a gold highway (inside its glow, heading roughly the same way) and it carries you
into ley-space at absurd speed, 200 km/s on the commonest lines up to 1,600 km/s on the rarest, to the node at
its end. Shift or S steps off anywhere. Where two highways cross, A/D hops onto the other one. Every node has a
ring of standing stones under its pillar of light: step in and press E, and the light lifts you, wings or not, to
choose a lane (A/D, then E or W; Space or Shift lets go).

**On a phone,** ☰ holds the menus, ▲▼ appear when they'd do something (and say what), and the HUD keeps quiet
while you move. Tilt to steer is in ☰: tip the phone to turn, away to go; a shake squeaks.

**A controller** works too (any pad in the browser's standard mapping): the left stick moves, A jumps, B crouches,
X touches what glints, Y takes a picture, and the D-pad walks the menus (A presses, B closes).

URL parameters make any spawn reproducible: `?seed=42` (creature, stats and spawn), `&stats=6,2,2,2`
(climb, swim, run, gleam, perception; 12 points, 0–6 each; the old four still read), `&lat=…&lon=…` (spawn somewhere specific), `&heading=` (degrees from north), `&alt=` (metres up), `&zoom=` (camera distance in
metres, up to 40,000,000), `&ride=N` (start out riding highway N, 0–723), and `&detail=` (0.25–1: pin how far
forests reach; otherwise each device finds its own, and the HUD shows its FPS). There's no time parameter: the clock is
always the real one, so the sun, the Moon and the planets are where they really are (the game's astrological clock).

## Develop
```bash
npm ci
npm run dev     # wrangler dev: the Worker plus web/ on localhost
npm test        # unit tests for the pure modules (ley geometry, sun, creatures, stats, biomes, plants)
npm run check   # bundle and validate the Worker without deploying
```
No build step: `web/` is plain ES modules with three.js vendored in `web/vendor/`. CI (`.github/workflows/ci.yml`)
runs the check and the tests on every PR and push. Deploys are Cloudflare Workers Builds, connected to this
repo: every push to `main` runs `npm run deploy` (set 2026-11-07), and `/healthz` reports the deployed commit
(`WORKERS_CI_COMMIT_SHA`).

MIT licensed. Third-party data and code credits are listed in the design doc.
