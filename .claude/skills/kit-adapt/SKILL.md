---
name: kit-adapt
description: Shipped inside every Spatial Sites kit. Changes a kit's subject, palette, copy, camera or interactions by editing spec.json and reference/tokens.json and re-rendering, without breaking the layer model. Use when the buyer says "change the colour", "use my logo/name", "swap the car", "different camera", "make it my business".
---

# kit-adapt

Everything in this kit is driven by two files: `spec.json` (structure, copy, camera, interactions) and `reference/tokens.json` (colours, fonts, spacing). The site in `site/` reads both at build time. Edit the files, rebuild, done.

## Recipes

- **Palette:** edit `reference/tokens.json` colours (`bg`, `surface`, `text`, `muted`, `accent`, `scrim`). Keep text contrast 4.5:1 over the scrim. Then in `site/`: `npm run build`. If a `material-swap` binding exists, also update its `values` in `spec.json`.
- **Copy:** edit `spec.sections[*].headline`, `subline`, `cta`, `items`. Set `copy_status` to `real`. Rebuild.
- **Camera:** change `spec.camera.hero.preset` or `spec.camera.scroll.preset` to one of: orbit-slow, turntable-scroll, dolly-in, dolly-out-reveal, crane-down, rack-focus, path-spline, pointer-parallax. For `path-spline`, edit `reference/camera-path.json` keyframes (metres, Y up).
- **Interactions:** edit `spec.interactions` (hover-glow, hover-burst with a palette of petals, sparks, dust, bubbles or ink, tilt-layers, magnetic-cta, drag-orbit, spotlight). Each needs `mobile` and `reduced` values.
- **Subject:** replace `assets/model.glb` with your own GLB (metres, Y up, materials named paint, trim, glass, rubber for swaps). Keep it under the size budget. Replace `assets/poster.webp` with a 2560 by 1440 still that matches the hero camera. Rebuild.
- **Sections:** add or remove entries in `spec.sections`. Types: hero, spec-grid, gallery-strip, configurator-teaser, form, list, slider, floor-plan, feature-scroll, process, work-grid, text.

## After any change

```
cd site && npm run build && npm run check
```

`check` reports JS and GLB against the budgets in `spec.json`. Never hardcode a colour in `styles.css`; add a token instead. Never remove the poster image or the reduced-motion branches.
