# Natural Earth shapefiles read with no library (struct only): a .dbf's rows and a .shp's shapes. Shared by the basin
# scripts; each adds this folder to its path so `python3 -I` still finds it.
import struct

def records(path):
    """The .dbf's rows in record order, as dicts of lower-case field name to stripped text."""
    data = open(path, "rb").read(); n, hlen, rlen = struct.unpack("<xxxxIHH", data[:12]); fields = []
    for k in range(32, hlen - 1, 32): fields.append((data[k:k + 11].split(b"\0")[0].decode("latin1").lower(), data[k + 16]))
    out = []
    for r in range(n):
        off = hlen + r * rlen + 1; rec = {}
        for name, ln in fields: rec[name] = data[off:off + ln].decode("utf-8", "replace").replace("\0", "").strip(); off += ln
        out.append(rec)
    return out

def shapes(path):
    """The .shp's shapes in record order: ("point", (x, y)), ("line" | "poly", (bbox, parts)) or (None, None)."""
    data = open(path, "rb").read(); pos = 100; out = []
    while pos < len(data):
        _, clen = struct.unpack(">II", data[pos:pos + 8]); pos += 8
        body = data[pos:pos + clen * 2]; pos += clen * 2
        kind = struct.unpack("<i", body[:4])[0]
        if kind in (1, 11): out.append(("point", struct.unpack("<dd", body[4:20]))); continue
        if kind not in (3, 13, 5, 15): out.append((None, None)); continue
        nparts, npts = struct.unpack("<ii", body[36:44])
        parts = list(struct.unpack("<%di" % nparts, body[44:44 + 4 * nparts])) + [npts]
        p0 = 44 + 4 * nparts
        pts = [struct.unpack("<dd", body[p0 + 16 * i:p0 + 16 * i + 16]) for i in range(npts)]
        out.append(("line" if kind in (3, 13) else "poly", (struct.unpack("<dddd", body[4:36]), [pts[parts[j]:parts[j + 1]] for j in range(nparts)])))
    return out

def inside(x, y, rings):
    """Whether (x, y) is inside a polygon's rings (even-odd, so holes work)."""
    c = False
    for ring in rings:
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]; xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-300) + xi: c = not c
            j = i
    return c
