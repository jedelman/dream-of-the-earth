# CLAUDE.md: dream-of-the-earth

Jason's open-world game: a flock of creatures on a real Earth, peer to peer over iroh. **Read
`docs/design.md` before changing anything.** It holds Jason's decisions verbatim and the reasoning behind
each part. (First draft, written 2026-11-07 by Claude; Jason sets the rules here.)

## Session start
Load the memory substrate:
```bash
git clone https://github.com/jedelman/claude-memory.git /tmp/claude-memory 2>/dev/null \
  || git -C /tmp/claude-memory pull
```
Then read `/tmp/claude-memory/context/user.md`, `context/projects.md` (the "Dream of the Earth" entry) and
the latest file in `conversations/`.

## Principles that constrain the code
- **Leave no trace.** No world state on any server, and nothing a player does changes the world. If a feature
  seems to need stored shared state, stop and ask Jason.
- **The world is computed.** The same data plus the same seed gives the same world on every phone. Nothing
  random without a place-derived seed, and no `Math.random` in world generation.
- **Untrusted peers.** Avatars, voices and datagrams from other players are parsed against hard caps (256
  triangles per avatar) and rejected if over.
- **No location permission, ever.** Creature coordinates are never the player's.
- **Signed bundles.** The kernel runs only code signed with the bundle key. Never weaken that check.

## Data and credit discipline
- Every dataset and every vendored piece of code goes in the credits table in `docs/design.md`, with its
  license confirmed on the source's own site. Not WorldClim (non-commercial, no redistribution).
- Don't run third-party code fetched from the internet without Jason's approval. Read it instead.
- Mark anything not verified in the current session as **(unverified)**.

## Builds
- Release builds by default; debug only for a real debugger session (the atproto-iroh experience: debug
  Android builds fill a sandbox's disk).
- A Claude cloud sandbox can't reach iroh's relays. Test networking on loopback there, and on real networks
  only on Jason's machines.

## Git
Claude Code Remote's global git config carries Claude's signed identity. Don't set a repo-local
`user.email`/`user.name`.

**Merge authority (Jason, 2026-11-07):** "For this repo go ahead and merge away. We'll add discipline when we
have users." Claude may merge its own PRs to `main` without waiting. Keep work on a branch with a PR, so the
history explains itself. Revisit this once there are users.
