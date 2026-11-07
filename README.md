# Dream of the Earth

A flock of creatures wandering a real Earth together, by air, over land and under water. SNES-era low poly,
psychedelic, with golden ley highways of light for fast travel. Your mutuals on Bluesky can call you to
wherever they are.

It runs peer to peer over [iroh](https://github.com/n0-computer/iroh) and leaves no trace: there's no world
state on any server. The world is grown on each phone from real elevation, seafloor, climate, soil and canopy
data, and creatures' movements pass directly between players.

**Status:** step 0, single-player in the browser: **https://dream-of-the-earth.jason-edelman.org**.
You spawn near a random ley node on the real Earth (faceted terrain and seafloor from real elevation data,
that place's real sun, golden ley highways in the sky), as a random creature with random stats. Fly, run and
swim with WASD/arrows, Space (up) and Shift (down); on touch, drag and use the ▲▼ buttons. The design is in
[`docs/design.md`](docs/design.md).

URL parameters make any spawn reproducible: `?seed=42` (creature, stats and spawn), `&stats=6,2,2,2`
(fly, swim, run, gleam; 12 points, 0–6 each), `&t=2026-11-07T15:00:00Z` (a fixed moment for the sun), and
`&lat=…&lon=…` (spawn somewhere specific).

## Develop
```bash
npm ci
npm run dev     # wrangler dev: the Worker plus web/ on localhost
npm test        # unit tests for the pure modules (ley geometry, sun, creatures, stats)
npm run check   # bundle and validate the Worker without deploying
```
No build step: `web/` is plain ES modules with three.js vendored in `web/vendor/`. CI (`.github/workflows/ci.yml`)
runs the check and the tests on every PR and push. Deploys are Cloudflare Workers Builds, connected to this
repo: every push to `main` runs `npm run deploy` (set 2026-11-07), and `/healthz` reports the deployed commit
(`WORKERS_CI_COMMIT_SHA`).

MIT licensed. Third-party data and code credits are listed in the design doc.
