# Dream of the Earth

A flock of creatures wandering a real Earth together, by air, over land and under water. SNES-era low poly,
psychedelic, with golden ley highways of light for fast travel. Your mutuals on Bluesky can call you to
wherever they are.

It runs peer to peer over [iroh](https://github.com/n0-computer/iroh) and leaves no trace: there's no world
state on any server. The world is grown on each phone from real elevation, seafloor, climate, soil and canopy
data, and creatures' movements pass directly between players.

**Status:** being built, single-player in the browser first. The design is in
[`docs/design.md`](docs/design.md). It will live at https://dream-of-the-earth.jason-edelman.org.

## Develop
```bash
npm ci
npm run dev     # wrangler dev: the Worker plus web/ on localhost
npm run check   # bundle and validate the Worker without deploying
```
Pushes to `main` deploy through GitHub Actions (`.github/workflows/deploy.yml`), which needs the repo secret
`CLOUDFLARE_API_TOKEN`.

MIT licensed. Third-party data and code credits are listed in the design doc.
