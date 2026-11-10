# Step 1 of the basins (see README.md): the terrain tiles (zoom 5, Mapzen terrarium on AWS Open Data) resampled to a
# 0.1° latitude/longitude grid (3600 × 1800, the Köppen map's grid), Natural Earth's rivers marked so water follows
# the real channels a coarse grid would miss, and the sea marked (below sea level and joined to a big body of water).
# Writes elev.f32 (metres), sea.u8 (1 = sea), carved.u8 (1 = a Natural Earth river or lake centreline runs through),
# river.u16 (which one: 1 + its record number, the most important where two cross), rivers.json (their names, by
# record), net.u16 (which network of joined rivers) and koppen.u8 (the climate class, from web/data/koppen). Uses numpy
# and Pillow; reads Natural Earth with ne.py.
import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ne
from PIL import Image
TILES, NE_RIVERS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
KOPPEN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../web/data/koppen")
Z, W, H, RES = 5, 3600, 1800, 0.1
N = 2 ** Z
mosaic = np.zeros((N * 256, N * 256), dtype=np.float32)
for x in range(N):
    for y in range(N):
        a = np.asarray(Image.open(f"{TILES}/{x}-{y}.png").convert("RGB"), dtype=np.float32)
        mosaic[y * 256:(y + 1) * 256, x * 256:(x + 1) * 256] = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
# Cell centres to Web Mercator pixels (beyond ±85.05° the nearest edge row: the Arctic Ocean, Antarctica's ice).
lat = 90 - (np.arange(H) + 0.5) * RES
lon = -180 + (np.arange(W) + 0.5) * RES
latc = np.clip(lat, -85.05, 85.05) * np.pi / 180
py = np.clip(((1 - np.log(np.tan(latc) + 1 / np.cos(latc)) / np.pi) / 2 * N * 256).astype(int), 0, N * 256 - 1)
px = np.clip(((lon + 180) / 360 * N * 256).astype(int), 0, N * 256 - 1)
elev = mosaic[py][:, px].copy()
def merc(lo, la):  # a point to its mosaic pixel
    la = min(85.05, max(-85.05, la)) * np.pi / 180
    y = int((1 - np.log(np.tan(la) + 1 / np.cos(la)) / np.pi) / 2 * N * 256)
    return min(N * 256 - 1, max(0, y)), int((lo + 180) / 360 * N * 256) % (N * 256)
# Natural Earth rivers and lake centrelines.
# Rivers Natural Earth draws on along a canal across a divide: the Kovzha runs on past the watershed to Lake Onega along the
# Volga-Baltic waterway, and would take the upper Volga to the Baltic. By Wikidata id.
ACROSS = {"Q2305285"}
def shp_lines(path):
    recs, out = ne.records(path[:-4] + ".dbf"), []
    for k, (kind, geom) in enumerate(ne.shapes(path)):
        if kind != "line": continue
        # Dug, not drained: the White Sea, Moscow, Volga-Don and Panama canals would join basins. Natural Earth files some
        # canals as rivers, so go by the name too (the Casiquiare, a natural channel between the Orinoco and the Amazon,
        # is "Casiquiare canal" in English: the basins have to part somewhere, and this is where they part on the map).
        if recs[k].get("featurecla") == "Canal" or "canal" in (recs[k].get("name", "") + " " + recs[k].get("name_en", "")).lower(): continue
        if recs[k].get("wikidataid") in ACROSS: continue
        out.extend((k, part) for part in geom[1])
    return out, recs
# Where a river runs, its cell's height is the lowest the terrain gets along the line inside it, not the height at the
# cell's centre: in a gorge narrower than a cell (the Congo through the Batéké hills) the centre can stand 400 m above the
# water, and the river would dam itself (see also the running minimum below).
carved = np.zeros((H, W), dtype=bool)
river = np.zeros((H, W), dtype=np.uint16)
low = np.full((H, W), np.inf, dtype=np.float32)
lines, recs = shp_lines(NE_RIVERS)
rank = lambda k: int(recs[k].get("scalerank") or 99) if k < len(recs) else 2  # a renamed part keeps a big river's rank
# One naming slip in Natural Earth (10m rivers, 5.0.0): the record it calls "Paraná River" also covers the Paraguay north
# of their confluence at 27.3° S, which would send the Paraná's main stem up the Paraguay. Those parts get their own name.
FIXES = [("Paraná River", lambda line: min(y for _, y in line) > -27.4, {"name": "Paraguay", "en": "Paraguay"})]
extra, origin = [], {}  # renamed parts: their names, and the record each came from
def name_of(rec, line):
    for en, test, named in FIXES:
        if recs[rec].get("name_en") == en and test(line):
            if named not in extra: extra.append(named)
            k = len(recs) + extra.index(named); origin[k] = rec
            return k
    return rec
for rec0, line in lines:
    rec = name_of(rec0, line)
    samples = []  # (row, col, terrain) every RES/6 along the line
    for (x0, y0), (x1, y1) in zip(line, line[1:]):
        n = int(max(abs(x1 - x0), abs(y1 - y0)) / (RES / 6)) + 1
        for k in range(n):
            t = k / n; lo = x0 + (x1 - x0) * t; la = y0 + (y1 - y0) * t
            yy, xx = merc(lo, la)
            samples.append((min(H - 1, max(0, int((90 - la) / RES))), int(((lo + 180) % 360) / RES) % W, mosaic[yy, xx]))
    # A river only runs downhill, so along its line the water is never higher than anywhere upstream of it: a gorge or
    # a hill beside the channel that the coarse terrain reads high is cut down to the level above it (the Mekong in
    # Laos, the Yukon by Russian Mission). Natural Earth's lines aren't all drawn source to mouth, so each is turned so
    # its higher end comes first; a line whose ends are within 20 m of each other is left as it is.
    if len(samples) > 1:
        a = max(v for _, _, v in samples[:4]); b = max(v for _, _, v in samples[-4:])
        if abs(a - b) > 20:
            if b > a: samples.reverse()
            run = np.inf
            for k, (r, c, v) in enumerate(samples): run = min(run, v); samples[k] = (r, c, run)
    for r, c, v in samples:
        carved[r, c] = True
        low[r, c] = min(low[r, c], v)
        if river[r, c] == 0 or rank(rec) < rank(river[r, c] - 1): river[r, c] = rec + 1
del mosaic
# Which rivers join: Natural Earth's lines meet end to vertex where one flows into another, so lines whose ends touch
# (within ~1 km) are one network. A river may only flow into another river's trench if they're one network: two rivers
# on either side of a divide can lie in neighbouring cells (the Chulym beside the Yenisei, the Yom beside the Mekong).
parent_net = list(range(len(recs)))
def find(a):
    while parent_net[a] != a: parent_net[a] = parent_net[parent_net[a]]; a = parent_net[a]
    return a
key = lambda x, y: (round(x * 50), round(y * 50))  # 0.02° buckets
verts = {}
for rec, line in lines:
    for x, y in line: verts.setdefault(key(x, y), set()).add(rec)
for rec, line in lines:
    for x, y in (line[0], line[-1]):
        kx, ky = key(x, y)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other in verts.get((kx + dx, ky + dy), ()): parent_net[find(rec)] = find(other)
net = np.zeros((H, W), dtype=np.uint16)
roots = {}
nz = np.nonzero(river)
for r, c in zip(*nz): k = int(river[r, c]) - 1; net[r, c] = roots.setdefault(find(origin.get(k, k)), len(roots) + 1)
land_carve = carved & (elev > 0)
elev = np.where(land_carve, np.minimum(elev, np.maximum(low, 1)), elev)  # the flood (basins.mjs) runs along these without rising: a gorge the grid can't see won't dam a river
# The sea: below sea level and part of a body of water of at least 500 cells (the oceans, the Black Sea, the Caspian).
below = elev <= 0
labels = np.zeros((H, W), dtype=np.int32); sizes = [0]; nid = 0
for r0 in range(H):
    for c0 in np.nonzero(below[r0] & (labels[r0] == 0))[0]:
        nid += 1; stack = [(r0, c0)]; labels[r0, c0] = nid; size = 0
        while stack:
            r, c = stack.pop(); size += 1
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    rr, cc = r + dr, (c + dc) % W
                    if 0 <= rr < H and below[rr, cc] and labels[rr, cc] == 0 and not carved[rr, cc]:
                        labels[rr, cc] = nid; stack.append((rr, cc))
        sizes.append(size)
sizes = np.array(sizes)
sea = (labels > 0) & (sizes[labels] >= 500)
elev[sea] = np.minimum(elev[sea], 0)
elev.astype("<f4").tofile(f"{OUT}/elev.f32")
land_carve.astype(np.uint8).tofile(f"{OUT}/carved.u8")
# The climate, from the game's own Köppen tiles (same grid): basins.mjs weighs how much water a cell gives by it.
koppen = np.zeros((H, W), dtype=np.uint8)
for col in range(12):
    for row in range(6):
        a = np.asarray(Image.open(f"{KOPPEN}/{col}-{row}.png"))
        koppen[row * 300:(row + 1) * 300, col * 300:(col + 1) * 300] = a[..., 0] if a.ndim == 3 else a
koppen.tofile(f"{OUT}/koppen.u8")
np.where(land_carve, river, 0).astype("<u2").tofile(f"{OUT}/river.u16")
np.where(land_carve, net, 0).astype("<u2").tofile(f"{OUT}/net.u16")
json.dump([{"name": r.get("name", ""), "en": r.get("name_en", ""), "rank": rank(k)} for k, r in enumerate(recs)] + [dict(e, rank=2) for e in extra], open(f"{OUT}/rivers.json", "w"), ensure_ascii=False)
sea.astype(np.uint8).tofile(f"{OUT}/sea.u8")
print("networks", len(roots), "grid", W, H, "sea cells", int(sea.sum()), "carved land cells", int(land_carve.sum()), "water bodies", nid, "kept as sea", int((sizes >= 500).sum()))
