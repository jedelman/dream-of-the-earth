# Names for the 128 ley nodes from Natural Earth (public domain). Reads shapefiles with a minimal reader (no libraries).
import struct, json, math, sys
D = sys.argv[1]; NODES = sys.argv[2]

def dbf(path):
    with open(path, 'rb') as f:
        data = f.read()
    n, hlen, rlen = struct.unpack('<xxxxIHH', data[:12])
    fields = []
    for k in range(32, hlen - 1, 32):
        name = data[k:k+11].split(b'\0')[0].decode('latin1')
        typ = chr(data[k+11]); ln = data[k+16]
        fields.append((name, typ, ln))
    rows = []
    for r in range(n):
        off = hlen + r * rlen + 1; rec = {}
        for name, typ, ln in fields:
            raw = data[off:off+ln]; off += ln
            v = raw.decode('utf-8', 'replace').strip()
            rec[name.lower()] = v
        rows.append(rec)
    return rows

def shp(path):
    with open(path, 'rb') as f:
        data = f.read()
    pos = 100; out = []
    while pos < len(data):
        num, clen = struct.unpack('>II', data[pos:pos+8]); pos += 8
        body = data[pos:pos + clen * 2]; pos += clen * 2
        st = struct.unpack('<i', body[:4])[0]
        if st == 1:
            x, y = struct.unpack('<dd', body[4:20]); out.append(('pt', (x, y)))
        elif st in (5, 15):
            nparts, npts = struct.unpack('<ii', body[36:44])
            parts = struct.unpack('<%di' % nparts, body[44:44 + 4 * nparts])
            p0 = 44 + 4 * nparts
            pts = [struct.unpack('<dd', body[p0 + 16 * k:p0 + 16 * k + 16]) for k in range(npts)]
            rings = [pts[parts[j]:(parts[j + 1] if j + 1 < nparts else npts)] for j in range(nparts)]
            bbox = struct.unpack('<dddd', body[4:36])
            out.append(('poly', (bbox, rings)))
        else:
            out.append(('null', None))
    return out

def inside(lon, lat, geom):
    bbox, rings = geom
    if not (bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]): return False
    c = False
    for ring in rings:  # even-odd over all rings handles holes
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]; xj, yj = ring[j]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-300) + xi: c = not c
            j = i
    return c

def km(a, b, c, d):
    p1, p2 = math.radians(a), math.radians(c); dl = math.radians(d - b)
    return 6371 * math.acos(max(-1, min(1, math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl))))

def bearing(a, b, c, d):  # from (a,b) to (c,d), degrees
    p1, p2 = math.radians(a), math.radians(c); dl = math.radians(d - b)
    y = math.sin(dl) * math.cos(p2); x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360

def load(name):
    return list(zip(shp(f'{D}/{name}/{name}.shp'), dbf(f'{D}/{name}/{name}.dbf')))

places = [(g[1], r) for g, r in load('ne_10m_populated_places_simple') if g[0] == 'pt']
marine = [(g[1], r) for g, r in load('ne_10m_geography_marine_polys') if g[0] == 'poly']
regions = [(g[1], r) for g, r in load('ne_10m_geography_regions_polys') if g[0] == 'poly']
countries = [(g[1], r) for g, r in load('ne_50m_admin_0_countries') if g[0] == 'poly']
nodes = json.load(open(NODES))
out = []
for n in nodes:
    lat, lon = n['lat'], n['lon']
    country = next((r.get('name') or r.get('admin') for g, r in countries if inside(lon, lat, g)), None)
    seas = [r for g, r in marine if inside(lon, lat, g)]
    regs = [r for g, r in regions if inside(lon, lat, g)]
    near = sorted(((km(lat, lon, p[1], p[0]), p, r) for p, r in places), key=lambda t: t[0])[:5]
    d0, p0, r0 = near[0]
    rec = { 'i': n['i'], 'lat': round(lat, 4), 'lon': round(lon, 4), 'country': country,
      'seas': [(s.get('name'), s.get('featurecla')) for s in seas], 'regions': [(s.get('name'), s.get('featurecla')) for s in regs],
      'near': [(round(d), r.get('name'), r.get('adm0name'), r.get('featurecla'), r.get('pop_max'), round(bearing(p[1], p[0], lat, lon))) for d, p, r in near[:3]] }
    out.append(rec)
json.dump(out, open(sys.argv[3], 'w'), ensure_ascii=False, indent=0)
for r in out: print(r['i'], r['lat'], r['lon'], '|', r['country'], '|', r['seas'], '|', r['regions'][:2], '|', r['near'][0])
