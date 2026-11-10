# River basins

How `web/data/basins/` was made (11-10): where the rain on every part of the land runs to, the basins big enough to
name, and their names. The tiles and the list ship; the inputs don't. Re-run only to change the method or the data.
Needs Python 3 with numpy and Pillow, and Node. Each step prints a line to check against the one given here.

1. **The terrain**, zoom 5 of the Terrain Tiles the game already uses (AWS Open Data, terrarium encoding), into a
   folder, say `tiles/`, as `{x}-{y}.png` (1,024 tiles, about 60 MB):
   `for x in $(seq 0 31); do for y in $(seq 0 31); do curl -sS -o tiles/$x-$y.png https://s3.amazonaws.com/elevation-tiles-prod/terrarium/5/$x/$y.png; done; done`
2. **Natural Earth** (public domain, naturalearthdata.com, from naciscdn.org), each unzipped into its own folder in, say,
   `ne/`: `10m/physical/ne_10m_rivers_lake_centerlines`, `10m/physical/ne_10m_lakes`,
   `10m/physical/ne_10m_geography_regions_polys`, `10m/cultural/ne_10m_populated_places_simple`.
3. `python3 -I scripts/basins/grid.py tiles ne/ne_10m_rivers_lake_centerlines/ne_10m_rivers_lake_centerlines.shp out`
   resamples the terrain to a 0.1° grid (3,600 × 1,800, the Köppen map's), marks the sea, the rivers (and which river,
   and which rivers join into one network) and the climate (from `web/data/koppen`), into `out/`.
   Prints `networks 496 grid 3600 1800 sea cells 4565370 carved land cells 77284 …`.
4. `python3 -I scripts/basins/terminals.py ne/ne_10m_lakes/ne_10m_lakes out` finds the lakes with no outlet (Natural
   Earth's "Alkaline Lake"s, a few fresh ones, and Lop Nur). Prints `64 terminal lakes: …`.
5. `node scripts/basins/basins.mjs out` floods the land from the sea and those lakes (a priority flood), so every cell
   drains somewhere, and finds each basin's main stem. Prints `desert hollows: 202` and `basins: 321 | largest:
   -0.3,-51.0 5923k; …`. With `TRACE=lat,lon` it prints where a drop from there goes.
6. `python3 -I scripts/basins/names.py out ne web/data/basins` names them and writes the tiles and `basins.json`.
   Prints `321 basins: 194 rivers, 23 lakes, 71 hollows, 33 coasts`.

`npm test` (`test/basins.test.js`) checks the result: the tiles and the list agree, fifteen places whose river everyone
knows are in its basin, and four main stems end where those rivers are said to begin.

## Why the flood is shaped the way it is

A 0.1° grid (about 11 km) can't see most river channels, so a plain flood sends water wherever the grid's coarse hills
happen to be lowest. Each rule below fixed a real misrouting, found by tracing a drop from a town on the river:

- **Natural Earth's rivers are cut a trench** (half the cell's height, at most 200 m, 300 m for a big river, 500 m for
  the greatest), so water follows the real channels. Letting rivers run level instead let whichever mouth flooded first
  take a whole lowland: the Orinoco took the Amazon.
- **A river's cell is as low as the terrain gets along its line** in the cell, and **along each line the height only
  falls** (each line turned so its higher end comes first): the coarse terrain reads gorges hundreds of metres too high,
  and the Congo, the Mekong, the Yukon and the upper Yenisei each dammed themselves and spilled into the next basin.
- **A river only flows into another river's trench if Natural Earth joins their lines** (ends within about 2 km): two
  rivers either side of a divide can lie in neighbouring cells.
- **Canals are left out**, and so is the Kovzha, which Natural Earth draws on across the divide along the Volga–Baltic
  waterway (it took the upper Volga to the Baltic). One Natural Earth record named "Paraná River" also covers the
  Paraguay north of their confluence; those parts are renamed.
- **Lakes with no outlet are ends of their own** (Chad, the Aral, Eyre, the Great Salt Lake, the Dead Sea…), and so is
  **every deep hollow in a dry climate** that no river runs through: filling desert hollows until they spill sent central
  Iran to the Caspian.
- **A main stem** climbs from the mouth by the branch that keeps the river's name the longest (the Mississippi past the
  Missouri to Lake Itasca; the Lena past the Vitim), else the wettest branch, water weighed by climate so a dry wadi
  doesn't outrank a river.
- **Ice sheets aren't named**: Antarctica's and Greenland's ice drains by glaciers, with no river to follow.

## What it gets wrong

At 0.1°, a basin's edge can be a cell or two off, a delta's channels can go to the wrong mouth, and a basin under
50,000 km² (the Thames, the Hudson) has no name. Areas come out close to the published ones (the Amazon 5.9 million km²,
the Congo 3.8, the Nile 3.2, the Mississippi 3.2, the Volga 1.34, the Neva 0.29), but a few run over or under, where the
grid can't tell a desert's closed hollows from its rivers' basins (the Indus comes out at 0.74 million km², the Salween at
0.47). Names come from Natural Earth's lines, so a basin can be named for a river most people would call by another name.
