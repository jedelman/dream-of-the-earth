#!/usr/bin/env node
// Builds web/vendor/ from the exact npm versions in package-lock.json:
//   oauth-client-browser.js  BrowserOAuthClient (loaded only when someone signs in)
//   LICENSES.txt             notices for every package in the bundle
// Same approach as jason-edelman.org's scripts/vendor-library.
// Usage: cd scripts/vendor-atproto && npm ci && npm run build

import { build } from "esbuild";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../web/vendor");
mkdirSync(OUT, { recursive: true });

const result = await build({
  stdin: { contents: `export { BrowserOAuthClient } from "@atproto/oauth-client-browser"`, resolveDir: HERE, sourcefile: "oauth.entry.js" },
  absWorkingDir: HERE,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none", // collected into LICENSES.txt instead
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "// oauth-client-browser: bundled from npm by scripts/vendor-atproto. Licenses: LICENSES.txt" },
  outfile: join(OUT, "oauth-client-browser.js"),
  metafile: true,
  logLevel: "warning",
});

const packages = new Map();
for (const f of Object.keys(result.metafile.inputs)) {
  const m = f.match(/^(.*node_modules\/((?:@[^/]+\/)?[^/]+))\//);
  if (m) packages.set(m[2], join(HERE, m[1]));
}
const sections = [...packages.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, dir]) => {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
  const text = file ? readFileSync(join(dir, file), "utf8").trim() : `(No license file in the package. package.json says: ${pkg.license ?? "nothing"}.)`;
  return `== ${name} ${pkg.version} (${pkg.license ?? "unknown"}) ==\n\n${text}\n`;
});
writeFileSync(join(OUT, "LICENSES.txt"), `Third-party code in web/vendor/oauth-client-browser.js, bundled from npm by scripts/vendor-atproto.\n${packages.size} packages.\n\n${sections.join("\n")}`);
for (const f of ["oauth-client-browser.js", "LICENSES.txt"]) console.log(`${f.padEnd(26)} ${readFileSync(join(OUT, f)).length.toLocaleString()} bytes`);
