# Inland water for the game (11-14): Natural Earth's rivers and lakes, simplified, cut into 10° tiles the game fetches
# only where you are. Usage: python3 -I scripts/water/water.py NE_DIR web/data/water
# NE_DIR holds ne_10m_rivers_lake_centerlines/ and ne_10m_lakes/, each unzipped into its own folder (scripts/basins'
# README, step 2). Prints a line to check: `rivers 1212 pieces … lakes 1355 … tiles … KB`.
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "basins"))
import ne

TILE = 10          # degrees per tile
Q = 10000          # coordinates in 1e-4 degrees (about 11 m)
EPS = 0.002        # Douglas-Peucker tolerance in degrees (about 200 m; the near terrain's facets are about 900 m)
MIN_LAKE = 2e-4    # lake rings smaller than this many square degrees (about 2 km²) are left out
FIX = {"Sane": "Saône"}  # Natural Earth's own spelling drops the ô
KINDS = {"Lake": 0, "Reservoir": 1, "Alkaline Lake": 2}

def simplify(pts, eps):
    """Douglas-Peucker, iterative, keeping both ends."""
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); ax, ay = pts[a]; bx, by = pts[b]; dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-12
        best, at = 0, -1
        for i in range(a + 1, b):
            px, py = pts[i]; d = abs(dy * (px - ax) - dx * (py - ay)) / L if L > 1e-12 else math.hypot(px - ax, py - ay)
            if d > best: best, at = d, i
        if best > eps: keep[at] = True; stack += [(a, at), (at, b)]
    return [p for p, k in zip(pts, keep) if k]

def tile_of(lon, lat):
    return (min(35, max(0, int((lon + 180) // TILE))), min(17, max(0, int((90 - lat) // TILE))))

def packed(pts):
    """[x0, y0, dx, dy, …] in 1e-4 degrees, so the numbers stay short."""
    out, px, py = [], 0, 0
    for k, (x, y) in enumerate(pts):
        qx, qy = round(x * Q), round(y * Q)
        out += [qx, qy] if k == 0 else [qx - px, qy - py]; px, py = qx, qy
    return out

def area(ring):
    return abs(sum(ring[i][0] * ring[i - 1][1] - ring[i - 1][0] * ring[i][1] for i in range(len(ring)))) / 2

def main(nedir, out):
    tiles = {}
    def put(t, kind, item): tiles.setdefault(t, {"names": [], "rivers": [], "lakes": []})[kind].append(item)
    def name_in(t, name):
        """A river's name as an index into its tile's list (names repeat along a river), -1 for none."""
        if not name: return -1
        name = FIX.get(name, name)
        names = tiles.setdefault(t, {"names": [], "rivers": [], "lakes": []})["names"]
        if name not in names: names.append(name)
        return names.index(name)

    # Rivers (and intermittent ones), not the lines Natural Earth runs through lakes or the two canals. Each line is cut
    # where it crosses into another tile, the crossing point kept in both pieces so they meet.
    base = os.path.join(nedir, "ne_10m_rivers_lake_centerlines", "ne_10m_rivers_lake_centerlines")
    pieces = 0
    for rec, (kind, shape) in zip(ne.records(base + ".dbf"), ne.shapes(base + ".shp")):
        if kind != "line" or not rec["featurecla"].startswith("River"): continue
        rank, name = int(rec["scalerank"] or 9), rec["name_en"] or rec["name"]
        for part in shape[1]:
            pts = simplify(part, EPS)
            run, t0 = [pts[0]], tile_of(*pts[0])
            for p in pts[1:]:
                t = tile_of(*p); run.append(p)
                if t != t0:
                    if len(run) >= 2: put(t0, "rivers", [rank, name_in(t0, name)] + packed(run)); pieces += 1
                    run, t0 = [run[-2], p], t
            if len(run) >= 2: put(t0, "rivers", [rank, name_in(t0, name)] + packed(run)); pieces += 1

    # Lakes, in every tile their box touches (the game drops the copies by id). Holes (islands) are kept.
    base = os.path.join(nedir, "ne_10m_lakes", "ne_10m_lakes")
    lakes = 0
    for i, (rec, (kind, shape)) in enumerate(zip(ne.records(base + ".dbf"), ne.shapes(base + ".shp"))):
        if kind != "poly": continue
        rings = [simplify(r, EPS) for r in shape[1]]
        rings = [r[:-1] if r[0] == r[-1] else r for r in rings]
        rings = [r for r in rings if len(r) >= 3 and area(r) >= MIN_LAKE]
        if not rings: continue
        lakes += 1
        (x0, y0, x1, y1) = shape[0]
        item = [i, rec["name"] or rec["name_en"] or "", KINDS.get(rec["featurecla"], 0)] + [packed(r) for r in rings]
        a, b = tile_of(x0, y1), tile_of(x1, y0)
        for tx in range(a[0], b[0] + 1):
            for ty in range(a[1], b[1] + 1): put((tx, ty), "lakes", item)

    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".json"): os.remove(os.path.join(out, f))
    total = 0
    for (tx, ty), data in sorted(tiles.items()):
        s = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
        open(os.path.join(out, f"{tx}-{ty}.json"), "w", encoding="utf-8").write(s); total += len(s.encode())
    idx = json.dumps({"tile": TILE, "q": Q, "tiles": sorted(f"{tx}-{ty}" for tx, ty in tiles)}, separators=(",", ":"))
    open(os.path.join(out, "index.json"), "w").write(idx)
    print(f"rivers {pieces} pieces, lakes {lakes}, tiles {len(tiles)}, {round(total / 1024)} KB")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
