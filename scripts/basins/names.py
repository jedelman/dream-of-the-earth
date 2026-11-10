# Step 3 of the basins: names, and the files the game reads. Each basin is named for the river its main stem follows
# from the mouth, or for the lake it ends in; a basin with neither (a desert hollow, a dry coast) for the Natural Earth
# region it mostly lies in and the town nearest its lowest point. Two rivers with one name get their country added.
# Writes web/data/basins/basins.json (the list) and web/data/basins/{col}-{row}.png: 72 tiles of 30° at 0.1°, like the
# Köppen tiles, each pixel's basin id as red (low byte) and green (high byte), 0 for none.
import os, re, sys, json, unicodedata, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ne
from PIL import Image, ImageDraw
OUT, NE_DIR, WEB = sys.argv[1], sys.argv[2], sys.argv[3]
W, H, RES = 3600, 1800, 0.1
raw = json.load(open(f"{OUT}/basins-raw.json"))
basin = np.fromfile(f"{OUT}/basins.u16", dtype="<u2").reshape(H, W)
river = np.fromfile(f"{OUT}/river.u16", dtype="<u2").reshape(H, W)
rivers = json.load(open(f"{OUT}/rivers.json"))

# Natural Earth drops some accented letters ("Mlzes" for the Rivière aux Mélèzes).
FIX = {"Mlzes": "Mélèzes"}
# Names that are a river already, so "River" isn't added.
RIVER_WORDS = {"Rio", "Río", "Rivière", "River", "He", "Jiang", "Darya", "Gol"}
# Two great rivers sharing one mouth: the basin is named for both.
JOINED = [("Ganges", "Brahmaputra"), ("Tigris", "Euphrates")]
# A lake Natural Earth draws in parts: the basin is the whole lake's.
LAKE = {"Lake Eyre North": "Lake Eyre", "South Aral Sea": "Aral Sea"}

def river_label(i):
    """A river's name for a label, from its record: English, unless the local name is the English one with "Rio" before it."""
    r = rivers[i]; en, local = r["en"], r["name"]
    name = local if en and local.endswith(en) and local[:-len(en)].strip() in ("Rio", "Río") else (en or local)
    name = FIX.get(name, name)
    if name.endswith(" River"): name = name[:-6]
    return name

def plain(r):  # as basins.mjs names a river
    n = r["en"] or r["name"]
    return n[:-6] if n.endswith(" River") else n

def with_river(name):
    return name if RIVER_WORDS & set(name.split()) else f"{name} River"

# Natural Earth's regions (deserts, basins, plateaus...), rasterised onto the grid, the larger first so a smaller one
# inside (an erg in the Sahara) wins its own cells.
# (Not peninsulas: "the Indian subcontinent" and "the horn of Africa" are too big to place you.) A hollow takes any of
# these; a dry coast only a desert's name, as a coast between two rivers in hills is better placed by its town.
REGION_KINDS = {"Desert", "Basin", "Plateau", "Range/mtn", "Wetlands", "Delta", "Plain", "Tundra"}
regions = ne.records(f"{NE_DIR}/ne_10m_geography_regions_polys/ne_10m_geography_regions_polys.dbf")
rshapes = ne.shapes(f"{NE_DIR}/ne_10m_geography_regions_polys/ne_10m_geography_regions_polys.shp")
def tidy(s):
    return " ".join(w.capitalize() if (len(w) > 2 or i == 0) else w.lower() for i, w in enumerate(s.split())) if s.isupper() else s
order = sorted((k for k, r in enumerate(regions) if r["featurecla"] in REGION_KINDS and rshapes[k][0] == "poly" and (r.get("name_en") or r["name"])),
               key=lambda k: -(rshapes[k][1][0][2] - rshapes[k][1][0][0]) * (rshapes[k][1][0][3] - rshapes[k][1][0][1]))
canvas = Image.new("I", (W, H), 0); draw = ImageDraw.Draw(canvas)
for k in order:
    for ring in rshapes[k][1][1]:
        if len(ring) > 2: draw.polygon([((x + 180) / RES, (90 - y) / RES) for x, y in ring], fill=k + 1)
region = np.asarray(canvas, dtype=np.int64)
region_name = lambda k: tidy(regions[k].get("name_en") or regions[k]["name"])
SHORT = {"United States of America": "USA", "United Kingdom": "UK", "Dem. Rep. Congo": "DR Congo", "Congo (Kinshasa)": "DR Congo"}

places = ne.records(f"{NE_DIR}/ne_10m_populated_places_simple/ne_10m_populated_places_simple.dbf")
ppts = np.array([g for _, g in ne.shapes(f"{NE_DIR}/ne_10m_populated_places_simple/ne_10m_populated_places_simple.shp")])
def nearest_place(lat, lon):
    p1, l1 = np.radians(lat), np.radians(lon); p2, l2 = np.radians(ppts[:, 1]), np.radians(ppts[:, 0])
    d = np.arccos(np.clip(np.sin(p1) * np.sin(p2) + np.cos(p1) * np.cos(p2) * np.cos(l2 - l1), -1, 1))
    k = int(np.argmin(d)); return places[k]["name"], SHORT.get(places[k]["adm0name"], places[k]["adm0name"]), places[k]["adm1name"]

out = []
for b in raw:
    cells = basin == b["id"]
    names_in = {river_label(int(i) - 1) for i in np.unique(river[cells & (river > 0)])}
    town, country, province = nearest_place(*b["mouth"])
    stem_river = joined = None
    if b["river"]:  # basins.mjs names the stem by English name; find a record of it on the stem for the label
        for la, lo, _, _ in b["stem"]:
            k = int(river[int((90 - la) / RES), int((lo + 180) / RES)]) - 1
            if k >= 0 and plain(rivers[k]) == b["river"]: stem_river = river_label(k); break
        joined = next(((a, c) for a, c in JOINED if stem_river in (a, c) and a in names_in and c in names_in), None)
    if b["endsIn"]:
        kind, label = "lake", f"{LAKE.get(b['endsIn'], b['endsIn'])} basin"
    elif joined:
        kind, label = "river", f"{joined[0]}–{joined[1]} basin"
    elif stem_river:
        kind, label = "river", f"{with_river(stem_river)} basin"
    else:
        ids, counts = np.unique(region[cells], return_counts=True)
        best = max(((c, k) for k, c in zip(ids, counts) if k > 0), default=(0, 0))
        named = region_name(best[1] - 1) if best[0] >= 0.3 * cells.sum() else None
        kind = "hollow" if b["closed"] else "coast"
        if kind == "coast" and named and regions[best[1] - 1]["featurecla"] != "Desert": named = None
        label = f"{named} {kind if kind == 'hollow' else 'basin'} by {town}" if named else f"{kind if kind == 'hollow' else 'basin'} by {town}"
    rr, cc = np.nonzero(cells)
    middle = nearest_place(90 - (rr.mean() + 0.5) * RES, -180 + (cc.mean() + 0.5) * RES)[0]
    shown = f"{joined[0]} and {joined[1]}" if joined else with_river(stem_river) if stem_river else None  # "the Yellow River"
    out.append({"id": b["id"], "label": label, "kind": kind, "river": shown, "lake": LAKE.get(b["endsIn"], b["endsIn"]),
                "area": int(round(b["areaKm2"], -3)), "mouth": [round(v, 2) for v in b["mouth"]], "source": [round(v, 2) for v in b["source"]],
                "_country": country, "_province": province, "_middle": middle})
# One name, two basins: a river's gets its country ("Colorado River basin (Argentina)"), or its province if both are in
# one country (the two Churchills); an unnamed one, already "by" the town at its mouth, is named instead by the town
# nearest its middle. Any still alike are told apart by where their mouths lie (east, west...).
def dups():
    seen = {}
    for o in out: seen.setdefault(o["label"], []).append(o)
    return [same for same in seen.values() if len(same) > 1]
for same in dups():
    for o in same:
        if o["kind"] in ("river", "lake"):
            o["label"] += f" ({o['_province'] if len({x['_country'] for x in same}) == 1 else o['_country']})"
        else:
            o["label"] = o["label"].rsplit(" by ", 1)[0] + f" by {o['_middle']}"
for same in dups():
    lat = [o["mouth"][0] for o in same]; lon = [o["mouth"][1] for o in same]
    axis, words = (1, ("west", "east")) if max(lon) - min(lon) > max(lat) - min(lat) else (0, ("south", "north"))
    same.sort(key=lambda o: o["mouth"][axis])
    for k, o in enumerate(same): o["label"] += f" ({words[0] if k == 0 else words[1]})" if len(same) == 2 else f" ({k + 1})"
# A key for each, from its name, for your atlas to keep (names outlast ids, which follow size and would shift if the
# basins were worked out again).
def slug(t):
    t = unicodedata.normalize("NFKD", t.replace("–", " ")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t.replace(" basin", "")).strip("-")[:64]
for o in out:
    o["key"] = slug(o["label"])
assert len({o["key"] for o in out}) == len(out), "two basins with one key"
for o in out:
    del o["_country"], o["_province"], o["_middle"]
    if not o["river"]: del o["river"]
    if not o["lake"]: del o["lake"]
os.makedirs(WEB, exist_ok=True)
json.dump({"v": 1, "basins": out}, open(f"{WEB}/basins.json", "w"), ensure_ascii=False, separators=(",", ":"))
for col in range(12):
    for row in range(6):
        t = basin[row * 300:(row + 1) * 300, col * 300:(col + 1) * 300]
        rgb = np.stack([t & 255, t >> 8, np.zeros_like(t)], axis=-1).astype(np.uint8)
        Image.fromarray(rgb, "RGB").save(f"{WEB}/{col}-{row}.png", optimize=True)
print(len(out), "basins:", sum(o["kind"] == "river" for o in out), "rivers,", sum(o["kind"] == "lake" for o in out), "lakes,",
      sum(o["kind"] == "hollow" for o in out), "hollows,", sum(o["kind"] == "coast" for o in out), "coasts")
