# Names for the ley nodes

How `web/js/nodenames.js` was made (11-10). The names ship; the data doesn't. Re-run only if the ley data changes.

1. Download Natural Earth (public domain, naturalearthdata.com) into a folder, say `ne/`, and unzip each into its
   own folder there: `10m/cultural/ne_10m_populated_places_simple`, `10m/physical/ne_10m_geography_marine_polys`,
   `10m/physical/ne_10m_geography_regions_polys`, `50m/cultural/ne_50m_admin_0_countries` (from naciscdn.org).
2. Dump the nodes: `node -e 'import("./web/js/ley.js").then(({network})=>console.log(JSON.stringify(network().nodes.map((n,i)=>({i,lat:n.lat,lon:n.lon,classes:[...n.classes]})))))' > nodes.json`
3. `python3 -I scripts/ley-node-names/places.py ne nodes.json node-places.json` finds each node's country, sea, regions
   and nearest towns. It reads the shapefiles itself, with no libraries.
4. `python3 -I scripts/ley-node-names/names.py` (run where `node-places.json` is) turns them into names by the rules in
   the file, plus hand-read overrides, and writes `node-names.json`.
5. `node scripts/ley-node-names/write.mjs node-names.json` writes `web/js/nodenames.js`, keyed the way the game keys.
