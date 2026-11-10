# Step 1b of the basins: where water that never reaches the sea ends. Natural Earth marks its lakes with no outlet
# "Alkaline Lake" (the Great Salt Lake, Lake Eyre, Turkana, the Dead Sea, Van, Issyk-Kul, Poopó...); to them add the
# freshwater lakes that also have none (Chad, the two Aral seas, Balkhash, Ebinur), and the Tarim's end at Lop Nur, a dry
# bed Natural Earth doesn't draw (its lowest cell within a degree of 40.3° N, 90.5° E). Each becomes an outlet at its
# lowest grid cell (lagoons and marshes the sea runs through are left out; see below). Writes terminals.json: [{ name, cell }].
import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ne
NE_LAKES, OUT = sys.argv[1], sys.argv[2]
W, H, RES = 3600, 1800, 0.1
elev = np.fromfile(f"{OUT}/elev.f32", dtype="<f4").reshape(H, W)
sea = np.fromfile(f"{OUT}/sea.u8", dtype=np.uint8).reshape(H, W)
FRESH_TERMINAL = {"Lake Chad", "North Aral Sea", "South Aral Sea", "Lake Balkhash", "Ebinur Hu"}
# "Alkaline" in Natural Earth also covers some lagoons and marshes the sea or a river runs through: Lake Hammar would take
# the Euphrates, the Great Bitter Lake is the Suez Canal, Syvash is a lagoon of the Sea of Azov (its lowest cell is too far
# from the open water for the test below), and Lake Razazah is a reservoir the Euphrates fills by canal. Those go, and so
# does any lake within 3 cells (~30 km) of the sea (IJsselmeer, the Vistula Lagoon, Laguna Madre, Lagoa Mirim): its water
# reaches the sea anyway.
NOT_TERMINAL = {"Lake Hammar", "Great Bitter Lake", "Syvash", "Lake Razazah"}
def near_sea(row, c, k=3):
    return bool(sea[max(0, row - k):row + k + 1, [(c + d) % W for d in range(-k, k + 1)]].any())
rows, geoms = ne.records(NE_LAKES + ".dbf"), [g if k == "poly" else None for k, g in ne.shapes(NE_LAKES + ".shp")]
out = []
for r, g in zip(rows, geoms):
    if g is None or not (r.get("featurecla") == "Alkaline Lake" or r.get("name") in FRESH_TERMINAL) or r.get("name") in NOT_TERMINAL: continue
    (x0, y0, x1, y1), rings = g
    best = None
    for row in range(max(0, int((90 - y1) / RES)), min(H, int((90 - y0) / RES) + 1)):
        for col in range(int((x0 + 180) / RES), int((x1 + 180) / RES) + 1):
            c = col % W; lon = -180 + (col + 0.5) * RES; lat = 90 - (row + 0.5) * RES
            if sea[row, c] or not ne.inside(lon, lat, rings): continue
            if best is None or elev[row, c] < elev[best[0], best[1]]: best = (row, c)
    if best is None:  # smaller than a cell: the cell under its middle
        row, c = int((90 - (y0 + y1) / 2) / RES), int(((x0 + x1) / 2 + 180) / RES) % W
        if sea[row, c]: continue
        best = (row, c)
    if near_sea(*best): continue
    name, cell = r.get("name") or "", int(best[0] * W + best[1])
    twin = next((o for o in out if name and o["name"] == name), None)  # a lake drawn in pieces (the Dead Sea): its lowest
    if twin is None: out.append({"name": name, "cell": cell})
    elif elev.flat[cell] < elev.flat[twin["cell"]]: twin["cell"] = cell
# Lop Nur: the Tarim's end.
r0, c0 = int((90 - 40.3) / RES), int((90.5 + 180) / RES)
box = elev[r0 - 10:r0 + 11, c0 - 10:c0 + 11]
dr, dc = np.unravel_index(np.argmin(box), box.shape)
out.append({"name": "Lop Nur", "cell": int((r0 - 10 + dr) * W + (c0 - 10 + dc))})
json.dump(out, open(f"{OUT}/terminals.json", "w"))
print(len(out), "terminal lakes:", ", ".join(o["name"] for o in out))
