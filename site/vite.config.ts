// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

/** Preloads the self-hosted font files so the first paint already uses them (no late font swap moving LCP). */
function preloadFonts(): Plugin {
  const fonts: string[] = [];
  return {
    name: "preload-fonts",
    generateBundle(_o, bundle) {
      // Upright faces are preloaded; italics load on demand.
      for (const f of Object.keys(bundle)) if (f.endsWith(".woff2") && /latin-(wght|standard|\d{3})-normal/.test(f)) fonts.push(f);
    },
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const tags = fonts.map((f) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="./${f}">`).join("\n    ");
        return html.replace("<!-- FONT_PRELOADS -->", tags);
      },
    },
  };
}

// The factory's checks and card recordings serve the built page the way a live demo is served: in a sandbox with an
// opaque origin and its files allowed cross-origin (src/lib/demo-sandbox.ts in the storefront; tests keep the two the
// same). A page that works unsandboxed and breaks live, a tainted canvas or storage that throws, shows up here instead.
// Off unless KIT_SANDBOX=1, so `npm run preview` behaves as it always has.
const SANDBOX =
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-modals allow-downloads allow-presentation";
const sandboxed = process.env.KIT_SANDBOX === "1";

export default defineConfig({
  base: "./",
  preview: sandboxed ? { headers: { "Content-Security-Policy": SANDBOX, "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" } } : {},
  plugins: [preloadFonts()],
  build: {
    target: "es2022",
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: Object.fromEntries(["index", "privacy", "terms"].map((n) => [n, fileURLToPath(new URL(`./${n}.html`, import.meta.url))]).filter(([, f]) => existsSync(f as string))),
      output: { manualChunks: { three: ["three"], gsap: ["gsap"] } },
    },
  },
});
