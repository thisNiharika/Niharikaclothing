// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
import { config } from "./config";
import { initScroll } from "./dom/sections";
import { initFallback, prefersReducedMotion, supportsWebGL, isMobile } from "./fallback";

document.body.dataset.placement = config.subject.placement;
// A page with no pinned film has page ground behind its navigation, and page ground is what scrolls under it: on a light
// kit a dark button climbing past a transparent bar lands on top of the wordmark. Pages that do have a film keep the
// soft gradient, because a solid band over a film is worse than the thing it fixes.
if (!document.querySelector("section.chapter")) document.body.dataset.nav = "solid";
// A page that opens on a hover hero before its film has page ground under the navigation until the film arrives, so
// the bar is solid over the hero and goes back to the gradient once the hero has scrolled away.
else if (document.body.dataset.opening === "hover") {
  const hero = document.querySelector("section.hover-hero, section.poster-hero");
  if (hero) {
    document.body.dataset.nav = "solid";
    new IntersectionObserver(([e]) => {
      if (e) document.body.dataset.nav = e.isIntersecting ? "solid" : "";
    }, { rootMargin: "-64px 0px 0px 0px" }).observe(hero);
  }
}

initScroll(config);

// An aisle of products in depth, and the vending machine that sells them. Loaded only on pages that have them.
if (document.querySelector("[data-aisle]")) {
  import("./dom/aisle").then(({ initAisles }) => initAisles()).catch((err) => console.warn("Aisle init failed", err));
}
if (document.querySelector("[data-machine]")) {
  import("./dom/machine").then(({ initMachines }) => initMachines()).catch((err) => console.warn("Machine init failed", err));
}
// Pour: drinks cans built in WebGL that turn as the page pours each flavour in. Loaded only on a page that has it.
if (document.querySelector("[data-pour]")) {
  import("./dom/pour").then(({ initPour }) => initPour()).catch((err) => console.warn("Pour init failed", err));
}
// Storm: a brand's pieces tumbling in 3D round its bags, flavour by flavour. Loaded only on a page that has it.
if (document.querySelector("[data-storm]")) {
  import("./dom/storm").then(({ initStorm }) => initStorm()).catch((err) => console.warn("Storm init failed", err));
}
// Drift: a range floating in a soft space with glass droplets that magnify it. Loaded only on a page that has it.
if (document.querySelector("[data-drift]")) {
  import("./dom/drift").then(({ initDrift }) => initDrift()).catch((err) => console.warn("Drift init failed", err));
}
// Unwrap: cans whose labels peel into flat prints; proofs and the pegboard beside it. Each loaded only where used.
if (document.querySelector("[data-unwrap]")) {
  import("./dom/unwrap").then(({ initUnwrap }) => initUnwrap()).catch((err) => console.warn("Unwrap init failed", err));
}
if (document.querySelector("[data-proofs], [data-pegboard]")) {
  import("./dom/proofs").then(({ initProofs, initPegboard }) => { initProofs(); initPegboard(); }).catch((err) => console.warn("Proofs init failed", err));
}
// Unbox: a subscription box opened by the scroll; the conveyor beside it. Each loaded only where used.
if (document.querySelector("[data-unbox]")) {
  import("./dom/unbox").then(({ initUnbox }) => initUnbox()).catch((err) => console.warn("Unbox init failed", err));
}
if (document.querySelector("[data-conveyor]")) {
  import("./dom/conveyor").then(({ initConveyor }) => initConveyor()).catch((err) => console.warn("Conveyor init failed", err));
}
// Magazine: a lookbook whose pages curl as the page scrolls; the swatch fan beside it. Each loaded only where used.
if (document.querySelector("[data-mailer]")) {
  import("./dom/mailer").then(({ initMailer }) => initMailer()).catch((err) => console.warn("Mailer init failed", err));
}
// Scaffold: a scaffold that goes up on a house front, lift by lift, as the page scrolls. Loaded only where used.
if (document.querySelector("[data-scaffold]")) {
  import("./dom/scaffold").then(({ initScaffold }) => initScaffold()).catch((err) => console.warn("Scaffold init failed", err));
}
// Pot: yoghurt pots built in code that peel, unwind their wraps and stack. Loaded only where used.
if (document.querySelector("[data-pot]")) {
  import("./dom/pot").then(({ initPot }) => initPot()).catch((err) => console.warn("Pot init failed", err));
}
// Sprint: a running kit's range as a race the scroll runs, ending on a photo-finish print. Loaded only where used.
if (document.querySelector("[data-sprint]")) {
  import("./dom/sprint").then(({ initSprint }) => initSprint()).catch((err) => console.warn("Sprint init failed", err));
}
if (document.querySelector("[data-kitwall]")) {
  import("./dom/kitwall").then(({ initKitwall }) => initKitwall()).catch((err) => console.warn("Kitwall init failed", err));
}
// Canopy: a hedge of leaves that parts as the page scrolls, through into a clearing. Loaded only where used.
if (document.querySelector("[data-canopy]")) {
  import("./dom/canopy").then(({ initCanopy }) => initCanopy()).catch((err) => console.warn("Canopy init failed", err));
}
if (document.querySelector("[data-magazine]")) {
  import("./dom/magazine").then(({ initMagazine }) => initMagazine()).catch((err) => console.warn("Magazine init failed", err));
}
if (document.querySelector("[data-swatchfan]")) {
  import("./dom/swatchfan").then(({ initSwatchfan }) => initSwatchfan()).catch((err) => console.warn("Swatchfan init failed", err));
}
// Sundial: a range under window light, the day running as the page scrolls. Loaded only on a page that has it.
if (document.querySelector("[data-sundial]")) {
  import("./dom/sundial").then(({ initSundial }) => initSundial()).catch((err) => console.warn("Sundial init failed", err));
}
// Ferro: a ray-marched pool of ferrofluid that spikes towards the pointer and moves to a beat. Loaded only where used.
if (document.querySelector("[data-ferro]")) {
  import("./dom/ferro").then(({ initFerro }) => initFerro()).catch((err) => console.warn("Ferro init failed", err));
}
// Feature scenes (tap, restock, refill): pinned product shots that play as the page scrolls. Loaded only where present.
if (document.querySelector("[data-scene]")) {
  import("./dom/scenes").then(({ initScenes }) => initScenes()).catch((err) => console.warn("Scenes init failed", err));
}
// A product rail: garments that turn on hover and open on a click. Loaded only on a page that has one.
// One person and the range worn on him, and the jacket that unzips to let the page through.
if (document.querySelector("[data-wear]")) {
  import("./dom/wear").then(({ initWear }) => initWear()).catch((err) => console.warn("Wear init failed", err));
}
if (document.querySelector("[data-unzip]")) {
  import("./dom/unzip").then(({ initUnzip }) => initUnzip()).catch((err) => console.warn("Unzip init failed", err));
}
if (document.querySelector("[data-rail]")) {
  import("./dom/rail").then(({ initRails }) => initRails()).catch((err) => {
    console.warn("Rail init failed, the garments stay side on", err);
  });
}

if (config.assets.sequences?.length) {
  import("./sequence-init").then(({ initSequences }) => initSequences(config)).catch((err) => {
    console.warn("Sequence init failed, poster stays", err);
  });
}
// Plate and prop: a still plate with a rendered object composited on it, turned by the pointer. It owns its own
// canvases rather than the shared stage, so it loads only on the pages that actually have one.
if (config.assets.sequences?.length && document.querySelector("[data-prop]")) {
  import("./prop-hero").then(({ initPropHeroes }) => initPropHeroes(config)).catch((err) => {
    console.warn("Prop hero init failed, the plate stays", err);
  });
}
const useWebGL = !!config.assets.model && supportsWebGL() && !isMobile() && !prefersReducedMotion();
if (useWebGL) {
  import("./webgl/scene").then(({ startScene }) => startScene(config)).catch((err) => {
    console.warn("WebGL scene failed, falling back to poster", err);
    initFallback(config);
  });
} else if (!config.assets.sequences?.length && document.body.dataset.stage !== "none") {
  // Sequence pages own the stage; the poster is only the first paint, so it gets no parallax work.
  initFallback(config);
}
