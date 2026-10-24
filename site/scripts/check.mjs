// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Budget check for buyers and the factory: gzip JS size and console errors on the built site.
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const dist = path.resolve("dist");
if (!existsSync(dist)) { console.error("Run `npm run build` first."); process.exit(1); }
const spec = JSON.parse(readFileSync(path.resolve("spec.json"), "utf8"));
let js = 0;
for (const f of readdirSync(path.join(dist, "assets"))) if (f.endsWith(".js")) js += gzipSync(readFileSync(path.join(dist, "assets", f))).length;
const jsKb = js / 1024;
const glb = spec.assets.model ? statSync(path.join(dist, spec.assets.model)).size / 1048576 : 0;
const okJs = jsKb <= spec.budget.js_max_kb;
const okGlb = glb <= spec.budget.glb_max_mb;
console.log(`JS (gzip): ${jsKb.toFixed(0)} KB / ${spec.budget.js_max_kb} KB ${okJs ? "ok" : "OVER"}`);
console.log(`GLB: ${glb.toFixed(2)} MB / ${spec.budget.glb_max_mb} MB ${okGlb ? "ok" : "OVER"}`);
process.exit(okJs && okGlb ? 0 : 1);
