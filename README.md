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
buttons. Tap or click the ground to go there: flyers fly straight over, walkers find a way round lakes and
cliffs. The design is in
[`docs/design.md`](docs/design.md).

**Zoom:** the mouse wheel, +/−, or a pinch takes the camera from just behind you out to the whole planet: hills,
ranges, coastlines, then a low-poly globe wrapped in the golden ley grid, with you as a sparkle on it.

**Sky and sea:** shader waves with foam and a sparkling sun glint. The sky is one shader: volumetric cumulus that
tower into storms with rain shafts beneath them, cirrus streaks, a banded sun and stars, ray-marched over the
curved Earth, with sólstafir (shafts of sunlight through the gaps) and cloud shadows on the land. The weather
rides real-ish prevailing winds on the real clock, so everyone shares the same sky.

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
pillar of light that lifts any creature up to the network, wings or not.

URL parameters make any spawn reproducible: `?seed=42` (creature, stats and spawn), `&stats=6,2,2,2`
(fly, swim, run, gleam; 12 points, 0–6 each), `&t=2026-11-07T15:00:00Z` (start the clock at a moment), `&lat=…&lon=…` (spawn somewhere specific), `&heading=` (degrees from north), `&alt=` (metres up), `&zoom=` (camera distance in
metres, up to 40,000,000), `&ride=N` (start out riding highway N, 0–723), and `&detail=` (0.25–1: pin how far
forests reach; otherwise each device finds its own, and the HUD shows its FPS).

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
