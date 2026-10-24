// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Copies the Draco and Basis decoders from three into public/decoders so the kit works offline and without CDNs,
// and mirrors the kit's assets/ folder into public/assets when the site is run from a kit zip.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
const threeDir = path.resolve("node_modules/three");
const out = path.resolve("public/decoders");
mkdirSync(out, { recursive: true });
for (const [src, dst] of [["examples/jsm/libs/draco/gltf", "draco"], ["examples/jsm/libs/basis", "basis"]]) {
  const from = path.join(threeDir, src);
  if (existsSync(from)) cpSync(from, path.join(out, dst), { recursive: true });
  else console.warn(`decoders not found at ${from}`);
}

// Kit layout: <kit>/assets next to <kit>/site. The site serves them from public/assets.
const kitAssets = path.resolve("../assets");
const publicAssets = path.resolve("public/assets");
if (existsSync(kitAssets) && !existsSync(publicAssets)) cpSync(kitAssets, publicAssets, { recursive: true });
