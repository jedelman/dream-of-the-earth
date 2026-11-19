# Inland water

How `web/data/water/` was made (11-14): Natural Earth's rivers and lakes (public domain, naturalearthdata.com, from
naciscdn.org), simplified and cut into 10° tiles for the game to draw. The tiles and `index.json` ship; the inputs don't.
Needs only Python 3.

1. Download and unzip, each into its own folder in, say, `ne/`: `10m/physical/ne_10m_rivers_lake_centerlines` and
   `10m/physical/ne_10m_lakes` (the same as `scripts/basins`, step 2).
2. `python3 -I scripts/water/water.py ne web/data/water`. Prints `rivers 2540 pieces, lakes 1317, tiles 226, 2622 KB`.

Each tile is `{ names, rivers: [[rank, nameIndex, x0, y0, dx, dy, …]], lakes: [[id, name, kind, ring, ring, …]] }`, in
1e-4 degrees; a lake is in every tile its box touches (the game drops the copies by id). `test/inland.test.js` checks the
tiles parse and that the Loire, the Saône, the Rhine, the Amazon, Lago Titicaca and Lake Superior are where they should be.
