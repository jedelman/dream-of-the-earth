// How web/data/sst.json was made: NOAA's ERSSTv5 sea surface temperatures (NOAA NCEI; "No constraints on data access or
// use"), the 1991–2020 mean of each calendar month on its 2° grid, fetched as CSV from NOAA CoastWatch's ERDDAP. Kept per
// cell: the coldest month's mean and the warmest month's, which is what decides who lives in the water (coral needs the
// coldest month warm, kelp the warmest month cool). Cells on land (no data) take the mean of the nearest sea cells, so a
// coast looked up just inland still has its sea's warmth.
//
//   node scripts/sst/sst.mjs web/data/sst.json
//
// Plain Node (18+), no dependencies. Each month is one request of 30 years × 89 × 180 values (about 9 MB of CSV).
import fs from "node:fs";

const out = process.argv[2] || "web/data/sst.json";
const BASE = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/nceiErsstv5_LonPM180.csv";
const NLAT = 89, NLON = 180; // -88..88 and -180..178, every 2°

async function get(url) {
  for (let k = 0; k < 6; k++) {
    const r = await fetch(url);
    if (r.ok) return r.text();
    console.error(`  ${r.status}, again in ${10 * (k + 1)} s`);
    await new Promise((res) => setTimeout(res, 10000 * (k + 1)));
  }
  throw new Error(`failed: ${url}`);
}

const sum = Array.from({ length: 12 }, () => new Float64Array(NLAT * NLON)), n = Array.from({ length: 12 }, () => new Uint16Array(NLAT * NLON));
for (let m = 1; m <= 12; m++) {
  const mm = String(m).padStart(2, "0");
  const url = `${BASE}?sst%5B(1991-${mm}-15):12:(2020-${mm}-15)%5D%5B%5D%5B(-88):1:(88)%5D%5B(-180):1:(178)%5D`;
  console.error(`month ${mm}`);
  const lines = (await get(url)).split("\n");
  const head = lines[0].split(","), iLat = head.indexOf("latitude"), iLon = head.indexOf("longitude"), iSst = head.indexOf("sst");
  for (const line of lines.slice(2)) {
    const f = line.split(",");
    if (f.length < head.length) continue;
    const v = Number(f[iSst]);
    if (!Number.isFinite(v)) continue;
    const j = Math.round((Number(f[iLat]) + 88) / 2), i = Math.round((Number(f[iLon]) + 180) / 2);
    if (j < 0 || j >= NLAT || i < 0 || i >= NLON) continue;
    sum[m - 1][j * NLON + i] += v;
    n[m - 1][j * NLON + i]++;
  }
}
const cold = new Float64Array(NLAT * NLON).fill(NaN), warm = new Float64Array(NLAT * NLON).fill(NaN);
for (let c = 0; c < NLAT * NLON; c++) {
  const means = sum.map((s, m) => (n[m][c] ? s[c] / n[m][c] : NaN)).filter(Number.isFinite);
  if (means.length === 12) { cold[c] = Math.min(...means); warm[c] = Math.max(...means); }
}
// Land cells: the mean of the sea cells in the smallest ring round them that has any (the grid wraps east–west).
const fill = (a) => {
  const b = Float64Array.from(a);
  for (let j = 0; j < NLAT; j++)
    for (let i = 0; i < NLON; i++) {
      if (Number.isFinite(a[j * NLON + i])) continue;
      for (let r = 1; r < 30; r++) {
        let s = 0, k = 0;
        for (let dj = -r; dj <= r; dj++)
          for (let di = -r; di <= r; di++) {
            if (Math.max(Math.abs(dj), Math.abs(di)) !== r) continue;
            const jj = j + dj, ii = (((i + di) % NLON) + NLON) % NLON;
            if (jj < 0 || jj >= NLAT || !Number.isFinite(a[jj * NLON + ii])) continue;
            s += a[jj * NLON + ii]; k++;
          }
        if (k) { b[j * NLON + i] = s / k; break; }
      }
    }
  return b;
};
// Packed a byte a cell: (°C + 2) × 8, so −2 °C to 29.9 °C in eighths of a degree; base64.
const pack = (a) => Buffer.from(Array.from(a, (v) => Math.max(0, Math.min(255, Math.round((v + 2) * 8))))).toString("base64");
const seaCells = cold.filter(Number.isFinite).length;
fs.writeFileSync(out, JSON.stringify({ source: "NOAA ERSSTv5, 1991-2020 monthly means (NOAA NCEI)", lat0: -88, lon0: -180, step: 2, nlat: NLAT, nlon: NLON, scale: "byte/8 - 2 (degrees C)", cold: pack(fill(cold)), warm: pack(fill(warm)) }) + "\n");
console.error(`${seaCells} sea cells of ${NLAT * NLON}; wrote ${out} (${fs.statSync(out).size} bytes)`);
