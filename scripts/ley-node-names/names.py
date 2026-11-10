import json  # run where node-places.json is; writes node-names.json
recs = json.load(open('node-places.json'))
DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
d8 = lambda b: DIRS[round(b / 45) % 8]
cl = lambda s: (s or '').replace('\x00', '').strip()
SHORT = {'United States of America': 'USA', 'United Kingdom': 'Scotland', 'Dem. Rep. Congo': 'DR Congo', 'Congo (Kinshasa)': 'DR Congo', 'The Bahamas': 'the Bahamas'}
def ll(lat, lon):
    a = '0°' if abs(lat) < 0.5 else f"{abs(round(lat))}°{'N' if lat > 0 else 'S'}"
    o = '180°' if abs(abs(lon) - 180) < 0.5 else ('0°' if abs(lon) < 0.5 else f"{abs(round(lon))}°{'E' if lon > 0 else 'W'}")
    return f"{a} {o}"
def ocean_of(lat, lon, given):
    if given:
        g = cl(given).title().replace('Indian Ocean', 'Indian Ocean')
        return {'South Pacific Ocean': 'Pacific', 'North Pacific Ocean': 'Pacific', 'South Atlantic Ocean': 'Atlantic', 'North Atlantic Ocean': 'Atlantic', 'Indian Ocean': 'Indian Ocean', 'Southern Ocean': 'Southern Ocean', 'Arctic Ocean': 'Arctic Ocean'}.get(g, g)
    if lat > 66: return 'Arctic Ocean'
    if lat < -60: return 'Southern Ocean'
    return 'Pacific'
# Names read off the data by hand where the rules come out clumsy (the data's own words; see node-places.json).
OVERRIDE = {
  53: "the Kirthar Range, Pakistan", 66: "the Pacific, 0° 157°E", 23: "the Pacific, W of the Chatham Islands", 15: "the Pacific, S of Fiji", 117: "the Atlantic, SW of Greenville, Liberia", 110: "the Indian Ocean, N of Victoria, Seychelles", 104: "the Indian Ocean, S of Galle, Sri Lanka", 113: "the Atlantic, N of Natal, Brazil", 26: "N of Egvekinot, Russia", 121: "the Bering Sea, NW of Atka",
  0: 'the Congo Basin, DR Congo', 2: 'the Line Islands, Pacific', 6: 'Borneo, Indonesia', 10: 'S of Koktokay, China',
  16: 'Wausau, USA', 17: 'the Sahara, NNW of Tessalit', 22: 'East Antarctica, SW of Mirny Station', 24: 'the Canadian Shield, Canada',
  38: 'Null Island (0° 0°)', 41: 'off Santa Cruz, Galápagos', 42: 'the Sahara, NE of Chegga', 43: 'NW of Inverness, Scotland',
  45: 'the Mediterranean, off Damietta, Egypt', 47: 'SE of Makokou, Gabon', 57: 'the Gulf of Thailand, off Koh Kong', 63: 'the Bering Sea, by the Aleutians',
  78: 'the Ungava Peninsula, Canada', 79: 'the Guiana Shield, SE of Caracaraí', 81: 'the Pacific, W of the Galápagos', 89: 'N of Peterborough, Australia',
  92: 'the Pacific, W of the Kermadec Islands', 109: 'the Guiana Shield, N of Oriximiná', 124: 'the Polar Plateau, Antarctica', 126: 'SE of Scott Base, Antarctica',
}
REGION_OK = {'Desert', 'Basin', 'Plateau', 'Range/mtn', 'Pen/cape', 'Wetlands', 'Delta', 'Plain', 'Tundra'}
def tidy(s):
    s = cl(s)
    return ' '.join(w.capitalize() if (len(w) > 2 or i == 0) else w.lower() for i, w in enumerate(s.split())) if s.isupper() else s
out = {}
for r in recs:
    i, lat, lon = r['i'], r['lat'], r['lon']
    d0, town, cty, cla, pop, brg = r['near'][0]
    town, cty = cl(town), SHORT.get(cl(cty), cl(cty))
    seas = [(cl(n), c) for n, c in r['seas'] if cl(n)]
    named_sea = next((n for n, c in seas if c != 'ocean'), None)
    ocean = next((n for n, c in seas if c == 'ocean'), None)
    regions = [tidy(n) for n, c in r['regions'] if cl(n) and c in REGION_OK]
    country = SHORT.get(cl(r['country']), cl(r['country'])) if r['country'] else None
    if i in OVERRIDE: name = OVERRIDE[i]
    elif abs(lat) > 89.9: name = 'the North Pole' if lat > 0 else 'the South Pole'
    elif country and not seas:
        if d0 <= 70: name = f"{town}, {country}"
        elif regions: name = f"the {regions[0]}, {country}"
        else: name = f"{d8(brg)} of {town}, {country}"
    elif named_sea:
        sea = tidy(named_sea).replace('Mediterranean Sea', 'Mediterranean')
        name = f"the {sea}" + (f", off {town}" if d0 <= 200 and not sea.startswith('Gulf of') and 'Sea' not in sea else '')
    else:
        oc = ocean_of(lat, lon, ocean)
        if d0 <= 250: name = f"off {town}, {cty}"
        elif d0 <= 800: name = f"the {oc}, {d8(brg)} of {town}"
        else: name = f"the open {oc}, {ll(lat, lon)}"
    out[i] = name
    print(i, f"{lat:.2f},{lon:.2f}", '→', name)
dups = {}
for k, n in out.items(): dups.setdefault(n, []).append(k)
print('DUPLICATES:', {n: v for n, v in dups.items() if len(v) > 1})
print('keys', len(out), 'of', len(recs))
json.dump(out, open('node-names.json', 'w'), ensure_ascii=False, indent=0)
