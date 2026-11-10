# Step 4 of the basins: the river quests (Jason, 11-10: "Rivers way, but in reverse; you get the quest when you reach the
# basin, then clues point you to the headwaters. The headwaters have a special shrine and unique unlock"). For each
# basin named for a river or a lake: waymarks up its main stem from the mouth (3 to 12, about 300 km apart), each set on
# Natural Earth's line of the river where one runs, with what a clue says of it (the river's local name there, the town
# nearest), the source (the stem's top: the headwaters shrine), the stem itself simplified (for the map, and for the
# clouds to clear along it as the water carries you), and a song: the river's heights from source to sea as notes.
# Writes web/data/basins/quests.json. Run after names.py: python3 -I scripts/basins/quests.py out ne web/data/basins
import os, sys, json, math, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ne
OUT, NE_DIR, WEB = sys.argv[1], sys.argv[2], sys.argv[3]
W, H, RES = 3600, 1800, 0.1
raw = {b["id"]: b for b in json.load(open(f"{OUT}/basins-raw.json"))}
named = json.load(open(f"{WEB}/basins.json"))["basins"]
basin = np.fromfile(f"{OUT}/basins.u16", dtype="<u2").reshape(H, W)
river = np.fromfile(f"{OUT}/river.u16", dtype="<u2").reshape(H, W)
elev = np.fromfile(f"{OUT}/elev.f32", dtype="<f4").reshape(H, W)
rivers = json.load(open(f"{OUT}/rivers.json"))
SPACING_KM, FEWEST, MOST = 300, 3, 12
cell = lambda lat, lon: (min(H - 1, max(0, int((90 - lat) / RES))), int(((lon + 180) % 360) / RES) % W)

def km(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0]); dl = math.radians(b[1] - a[1])
    return 6371.0088 * math.acos(max(-1, min(1, math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl))))

# Natural Earth's river lines, by record, for setting a waymark on the water rather than a cell's middle.
shapes = ne.shapes(f"{NE_DIR}/ne_10m_rivers_lake_centerlines/ne_10m_rivers_lake_centerlines.shp")
def on_line(lat, lon, rec, reach_km=12):
    """The nearest point of record rec's lines to (lat, lon), within reach_km, or None."""
    if rec < 0 or rec >= len(shapes) or shapes[rec][0] != "line": return None
    best, bd = None, reach_km
    sx = math.cos(math.radians(lat))
    for part in shapes[rec][1][1]:
        for (x0, y0), (x1, y1) in zip(part, part[1:]):
            dx, dy = (x1 - x0) * sx, y1 - y0
            t = 0 if dx == dy == 0 else max(0, min(1, (((lon - x0) * sx) * dx + (lat - y0) * dy) / (dx * dx + dy * dy)))
            p = (y0 + (y1 - y0) * t, x0 + (x1 - x0) * t)
            d = km((lat, lon), p)
            if d < bd: best, bd = p, d
    return best

places = ne.records(f"{NE_DIR}/ne_10m_populated_places_simple/ne_10m_populated_places_simple.dbf")
ppts = np.array([g for _, g in ne.shapes(f"{NE_DIR}/ne_10m_populated_places_simple/ne_10m_populated_places_simple.shp")])
def town(lat, lon, within=150):
    p1, l1 = np.radians(lat), np.radians(lon); p2, l2 = np.radians(ppts[:, 1]), np.radians(ppts[:, 0])
    d = 6371.0088 * np.arccos(np.clip(np.sin(p1) * np.sin(p2) + np.cos(p1) * np.cos(p2) * np.cos(l2 - l1), -1, 1))
    k = int(np.argmin(d))
    return (places[k]["name"], int(round(d[k]))) if d[k] <= within else (None, None)

def local_name(stem, k, span=8):
    """The river's own name at stem point k (Natural Earth's local name): the commonest within span points, so a
    confluence's cell (often drawn as the tributary) doesn't name the river; else the nearest named point within 3 span."""
    near = [stem[j][3] for j in range(max(0, k - span), min(len(stem), k + span + 1)) if stem[j][3]]
    if near: return max(set(near), key=lambda n: (near.count(n), -min(abs(j - k) for j in range(len(stem)) if stem[j][3] == n)))
    for d in range(span, 3 * span + 1):
        for j in (k - d, k + d):
            if 0 <= j < len(stem) and stem[j][3]: return stem[j][3]
    return None

def record_named(stem, k, name, span=8):
    """A river record named name, from the stem points within span of k (for setting the waymark on that river's line)."""
    for d in range(span + 1):
        for j in (k - d, k + d):
            if 0 <= j < len(stem) and stem[j][3] == name:
                r = int(river[cell(stem[j][0], stem[j][1])]) - 1
                if r >= 0: return r
    return -1

def simplify(pts, tol):
    """Douglas-Peucker on [lat, lon] (degrees, flat): keeps the bends that matter at the map's scale."""
    if len(pts) < 3: return pts
    a, b = np.array(pts[0]), np.array(pts[-1]); ab = b - a; L = np.hypot(*ab)
    cross = lambda u, v: u[0] * v[1] - u[1] * v[0]
    d = [abs(cross(ab, np.array(p) - a)) / L if L else np.hypot(*(np.array(p) - a)) for p in pts[1:-1]]
    i = int(np.argmax(d)) + 1
    if d[i - 1] <= tol: return [pts[0], pts[-1]]
    return simplify(pts[:i + 1], tol)[:-1] + simplify(pts[i:], tol)

NOTES = "0123456789"
out = []
for b in named:
    if b["kind"] not in ("river", "lake"): continue
    r = raw[b["id"]]; stem = r["stem"]
    s = [0.0]
    for p, q in zip(stem, stem[1:]): s.append(s[-1] + km(p, q))
    L = s[-1]
    K = max(FEWEST, min(MOST, round(L / SPACING_KM)))
    ways = []
    for i in range(K):
        want = L * (0.04 + 0.92 * i / K)
        k = int(np.searchsorted(s, want)); k = min(k, len(stem) - 1)
        lat, lon = stem[k][0], stem[k][1]
        name_here = local_name(stem, k)
        rec = record_named(stem, k, name_here) if name_here else int(river[cell(lat, lon)]) - 1
        snapped = on_line(lat, lon, rec)
        if snapped and basin[cell(*snapped)] == b["id"]: lat, lon = snapped  # on the water, if that's still this basin
        name, dist = town(lat, lon)
        ways.append({"at": [round(lat, 4), round(lon, 4)], "s": int(round(want)), "river": name_here, "town": name, "townKm": dist})
    src = stem[-1]
    sname, sdist = town(src[0], src[1], 250)
    # The stem for the map: mouth to source, simplified to about 6 km, with how far along each point is.
    pts = [[p[0], p[1]] for p in stem]
    keep = simplify(pts, 0.06)
    idx, j = [], 0
    for p in keep:
        while pts[j] != p: j += 1
        idx.append(j)
    line = [[round(pts[j][0], 2), round(pts[j][1], 2), int(round(s[j]))] for j in idx]
    # The song: the river's height at 12 points from source to sea, as degrees of a pentatonic scale (0 the sea).
    hs = [max(0.0, float(elev[cell(*stem[min(len(stem) - 1, int(round((len(stem) - 1) * (1 - t / 11))))][:2])])) for t in range(12)]
    top = max(hs) or 1
    song = "".join(NOTES[min(9, int(round(9 * (h / top) ** 0.6)))] for h in hs)
    out.append({"key": b["key"], "id": b["id"], "len": int(round(L)), "ways": ways,
                "source": {"at": [round(src[0], 4), round(src[1], 4)], "river": local_name(stem, len(stem) - 1), "town": sname, "townKm": sdist},
                "line": line, "song": song})
json.dump({"v": 1, "quests": out}, open(f"{WEB}/quests.json", "w"), ensure_ascii=False, separators=(",", ":"))
n = sum(len(q["ways"]) for q in out)
print(len(out), "quests,", n, "waymarks,", sum(len(q["line"]) for q in out), "stem points;", os.path.getsize(f"{WEB}/quests.json") // 1024, "KB")
