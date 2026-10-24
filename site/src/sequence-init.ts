// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
import { ScrollTrigger, gsap } from "./dom/sections";
import { SequencePlayer, type SequenceSpec } from "./sequence";
import type { KitConfig } from "./config";
import { isMobile, prefersReducedMotion } from "./fallback";

/** On phones the film takes this fraction of the viewport, from the top; the copy sits below it. Matches styles.css. */
const MOBILE_BAND = 0.58;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a))); return t * t * (3 - 2 * t); };
const pad = (n: number) => String(n).padStart(2, "0");

export async function initSequences(cfg: KitConfig) {
  const mobile = isMobile();
  const reduced = prefersReducedMotion();
  // ?record=1: the factory's recorder sets scroll positions frame by frame, so the scrub must follow at once.
  const recording = new URLSearchParams(location.search).has("record");
  const specs = new Map<string, SequenceSpec>();
  for (const s of cfg.assets.sequences ?? []) {
    if (!s.count || !s.sizes) continue;
    specs.set(s.id, { id: s.id, dir: s.dir, count: s.count, fps: s.fps ?? 24, focus_x: s.focus_x ?? 0.5, sizes: s.sizes });
  }

  // Scroll-driven chapters share the fixed stage canvas.
  const stage = document.getElementById("seq") as HTMLCanvasElement | null;
  const players = new Map<string, SequencePlayer>();
  let active: SequencePlayer | null = null;
  const chapters = cfg.chapters ?? [];
  (window as unknown as { __seq?: unknown }).__seq = players;
  // A page that opens on a hover hero and scrolls into the film: the hero's film loads first and the chapters after it,
  // and the hero keeps its own tone until the first chapter takes over.
  const openingHover = document.body.dataset.opening === "hover";
  const openingTone = document.body.dataset.tone ?? "";
  let releaseOpening: () => void = () => {};
  const openingLoaded = new Promise<void>((resolve) => { releaseOpening = resolve; });
  const counter = document.getElementById("chapters");
  const dip = document.getElementById("dip");
  let lastDip = 0;
  // Switching chapters: the previous player releases its decoded frames, the counter and tone update, a short dip covers the cut.
  // A chapter whose clip starts on the frame the previous one ended on cuts clean (cut: "none") instead of dipping.
  const activate = (p: SequencePlayer, index: number, tone: string | undefined, withDip = true) => {
    const previous = active;
    active = p;
    for (const other of players.values()) other.active = other === p;
    if (counter) counter.textContent = `${pad(index + 1)} / ${pad(chapters.length)}`;
    if (tone) document.body.dataset.tone = tone;
    if (previous && previous !== p) {
      previous.idle();
      const now = performance.now();
      if (dip && withDip && !reduced && now - lastDip > 700) {
        lastDip = now;
        gsap.fromTo(dip, { opacity: 0.92 }, { opacity: 0, duration: 0.42, ease: "power2.out", overwrite: true });
      }
    }
    p.draw(true);
  };
  // A page can be film-led without a pinned chapter: a film deck owns its clips and draws them on its own canvases.
  // The fixed stage then has nothing to paint, so it must not leave its poster sitting behind the whole page.
  if (stage && !chapters.length) stage.style.display = "none";
  if (stage && chapters.length) {
    chapters.forEach((ch, index) => {
      const spec = specs.get(ch.sequence);
      if (!spec) return;
      const p = players.get(ch.sequence) ?? new SequencePlayer(spec, stage, { mobile, band: mobile ? MOBILE_BAND : 0, ground: getComputedStyle(document.body).backgroundColor || "#000" });
      p.active = index === 0;
      players.set(ch.sequence, p);
      const section = document.getElementById(ch.section);
      if (!section) return;
      section.style.setProperty("--pin", `${mobile ? Math.max(160, ch.pin_vh * 0.6) : ch.pin_vh}vh`);
      const tone = section.dataset.tone;
      const beats = [...section.querySelectorAll<HTMLElement>(".beat")];
      // Chapter modes. scrub: the film follows the scroll. loop: the film plays on its own and the scroll only moves the
      // copy. mask: the film shows through the first headline's letters and opens to the full frame after that beat.
      // window: the film starts as a window in the page and grows to full bleed over the first part of the chapter.
      const mode = (ch as { mode?: string }).mode ?? "scrub";
      const cs = getComputedStyle(document.body);
      // Canvas font shorthand rejects generic names like system-ui, so only the first family is passed, with a plain fallback.
      const family = (cs.getPropertyValue("--f-display").split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "") || "sans-serif";
      const maskFont = `${cs.getPropertyValue("--f-display-weight").trim() || "600"} SIZE "${family}", sans-serif`;
      const maskStroke = cs.getPropertyValue("--c-text").trim() || "#fff";
      const maskLines = ((ch as { mask_text?: string }).mask_text ?? "").split("|").map((l) => l.trim()).filter(Boolean);
      const firstTo = ((ch.beats ?? [])[0] as { to?: number } | undefined)?.to ?? 0.14;
      const windowTo = Math.min(1, ((ch as { window_to?: number }).window_to ?? firstTo + 0.16));
      const windowRect = (k: number) => {
        const cw = stage.clientWidth || innerWidth, chh = stage.clientHeight || innerHeight;
        const insetW = mobile ? 0.84 : 0.4;
        const insetH = Math.min(mobile ? MOBILE_BAND - 0.1 : 0.5, (insetW * cw * 9 / 16) / chh);
        // Desktop: the window sits in the lower half under the copy. Phone: inside the top band, copy below the band.
        const from = { x: (1 - insetW) / 2, y: mobile ? Math.max(0.04, (MOBILE_BAND - insetH) / 2) : 0.7 - insetH / 2, w: insetW, h: insetH };
        const to = mobile ? { x: 0, y: 0, w: 1, h: MOBILE_BAND } : { x: 0, y: 0, w: 1, h: 1 };
        return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k };
      };
      // Once the mask is fully open or the window has grown to full bleed, the state is cleared: the player goes back to
      // one drawImage a frame instead of compositing a mask or filling a ground it no longer needs.
      const applyMode = (progress: number) => {
        if (mode === "window") {
          const k = smooth(0, windowTo, progress);
          p.setWindow(k >= 0.999 ? null : windowRect(k));
        } else if (mode === "mask" && maskLines.length) {
          const open = smooth(firstTo, Math.min(1, firstTo + 0.14), progress);
          p.setMask(open >= 0.999 ? null : { lines: maskLines, font: maskFont, stroke: maskStroke, open });
        }
      };
      if (mode === "window" || mode === "mask") applyMode(0);
      // Loop mode plays the film by itself, forward then back so there is no cut, while the chapter is on screen.
      let loopRaf = 0, loopLast = 0, loopDir = 1;
      const loopStep = (t: number) => {
        const dt = loopLast ? (t - loopLast) / 1000 : 0; loopLast = t;
        let next = p.playhead + loopDir * dt * spec.fps;
        if (next >= spec.count - 1) { next = spec.count - 1; loopDir = -1; } else if (next <= 0) { next = 0; loopDir = 1; }
        p.seek(next);
        loopRaf = requestAnimationFrame(loopStep);
      };
      const loopRun = (on: boolean) => {
        if (mode !== "loop" || recording || reduced) return;
        if (on && !loopRaf) { loopLast = 0; loopRaf = requestAnimationFrame(loopStep); }
        if (!on && loopRaf) { cancelAnimationFrame(loopRaf); loopRaf = 0; }
      };
      document.addEventListener("visibilitychange", () => { if (document.hidden) loopRun(false); else if (active === p) loopRun(true); });
      // The lens: a second film laid over this chapter's own and shown only inside a circle that follows the pointer,
      // so moving across the frame uncovers the same shot in a different state. It has its own canvas, so the two never
      // fight over the stage, and its own clock, forward then back, so what shows through never cuts. The film beneath
      // stays tied to the scroll. Pointer-less devices never see it: the CSS hides it and the player is never built.
      const lensId = (ch as { lens?: string }).lens;
      const lensSpec = lensId ? specs.get(lensId) : undefined;
      const lensCanvas = document.getElementById("lens") as HTMLCanvasElement | null;
      const lensRing = document.getElementById("lens-ring")?.firstElementChild as HTMLElement | null;
      let lensRun = (_on: boolean) => {};
      if (lensSpec && lensCanvas && !mobile && matchMedia("(hover: hover)").matches) {
        // Same band, ground and fit as the film underneath, so the two frames land on exactly the same pixels.
        const lp = new SequencePlayer(lensSpec, lensCanvas, { mobile, band: mobile ? MOBILE_BAND : 0, ground: getComputedStyle(document.body).backgroundColor || "#000" });
        document.body.classList.add("lens-ready");
        const radius = () => Math.max(96, Math.min(innerWidth, innerHeight) * ((ch as { lens_radius?: number }).lens_radius ?? 0.16));
        let lx = innerWidth * 0.5, ly = innerHeight * 0.52, shown = false, loadedOnce = false;
        const place = () => {
          const r = radius();
          lensCanvas.style.clipPath = `circle(${r}px at ${lx}px ${ly}px)`;
          if (lensRing) { lensRing.style.width = `${r * 2}px`; lensRing.style.height = `${r * 2}px`; lensRing.style.transform = `translate(${lx - r}px, ${ly - r}px)`; }
        };
        place();
        const show = (on: boolean) => { if (on === shown) return; shown = on; document.body.classList.toggle("lens-on", on); };
        section.addEventListener("pointermove", (e) => {
          if ((e as PointerEvent).pointerType === "touch") return;
          lx = (e as PointerEvent).clientX; ly = (e as PointerEvent).clientY;
          place();
          if (active === p) { if (!loadedOnce) { loadedOnce = true; void lp.preload(); } show(true); }
        });
        section.addEventListener("pointerleave", () => show(false));
        addEventListener("resize", place);
        let lensRaf = 0, lensLast = 0, lensDir = 1;
        const lensStep = (time: number) => {
          const dt = lensLast ? (time - lensLast) / 1000 : 0; lensLast = time;
          let next = lp.playhead + lensDir * dt * lensSpec.fps;
          if (next >= lensSpec.count - 1) { next = lensSpec.count - 1; lensDir = -1; } else if (next <= 0) { next = 0; lensDir = 1; }
          lp.seek(next);
          lensRaf = requestAnimationFrame(lensStep);
        };
        lensRun = (on: boolean) => {
          if (recording || reduced) return;
          if (on && !lensRaf) { lensLast = 0; lensRaf = requestAnimationFrame(lensStep); }
          if (!on && lensRaf) { cancelAnimationFrame(lensRaf); lensRaf = 0; show(false); }
        };
        document.addEventListener("visibilitychange", () => { if (document.hidden) lensRun(false); else if (active === p) lensRun(true); });
      }
      // Beats with `at` slow the film to a crawl around that frame while their copy shows: across the beat's scroll span
      // the clip advances only `span` (default 0.06), so the moment needs more scrolling but never stops, and scroll
      // between beats plays the frames in between at an even pace. The map is a piecewise line through those points.
      const holds = ((ch.beats ?? []) as { from: number; to: number; at?: number; span?: number }[])
        .filter((b) => typeof b.at === "number")
        .map((b) => ({ from: b.from, to: b.to, at: b.at as number, span: b.span ?? 0.06 }))
        .sort((a, b) => a.from - b.from);
      const points: [number, number][] = [[0, 0]];
      let floor = 0;
      for (const h of holds) {
        const a = Math.max(floor, h.from <= 0.001 ? 0 : h.at - h.span / 2);
        const b = Math.min(1, h.to >= 0.999 ? 1 : Math.max(a, h.at + h.span / 2));
        points.push([h.from, a]); points.push([h.to, b]);
        floor = b;
      }
      points.push([1, 1]);
      const toClip = (progress: number) => {
        if (!holds.length) return progress;
        for (let i = 1; i < points.length; i++) {
          const [x0, y0] = points[i - 1]!, [x1, y1] = points[i]!;
          if (progress <= x1) return x1 === x0 ? y1 : y0 + ((progress - x0) / (x1 - x0)) * (y1 - y0);
        }
        return 1;
      };
      const fadeBeats = (progress: number) => {
        beats.forEach((b) => {
          const from = Number(b.dataset.from), to = Number(b.dataset.to);
          // The copy reaches full opacity quickly and holds: a quarter of the span fades it in, a fifth fades it out.
          const w = Math.min(0.05, (to - from) / 4);
          const fadeIn = from <= 0 ? 1 : smooth(from, from + w, progress);
          const o = fadeIn * (1 - smooth(to - w, to, progress));
          b.style.opacity = String(o);
          b.style.transform = `translateY(${(1 - o) * 16}px)`;
          if (o < 0.01) b.setAttribute("data-off", ""); else b.removeAttribute("data-off");
        });
      };
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: recording ? true : 0.3,
        onEnter: () => { activate(p, index, tone, ch.cut !== "none"); loopRun(true); lensRun(true); },
        onEnterBack: () => { activate(p, index, tone, ch.cut !== "none"); loopRun(true); lensRun(true); },
        // A chapter that has scrolled out settles on its end state so nothing is left mid-fade.
        onLeave: () => { fadeBeats(1); loopRun(false); lensRun(false); applyMode(1); if (active === p && mode !== "loop") p.seekProgress(1); },
        onLeaveBack: () => { fadeBeats(0); loopRun(false); lensRun(false); applyMode(0); if (active === p && mode !== "loop") p.seekProgress(0); if (openingHover && index === 0) document.body.dataset.tone = openingTone; },
        onUpdate: (st) => {
          // Only the chapter in view (or the one that just left, while its scrub settles) may draw on the shared canvas.
          const own = st.isActive || active === p || (st.progress === 0 && index === 0);
          if (!own) return;
          if (st.isActive) active = p;
          if (active === p) {
            if (mode === "loop") { if (recording || reduced) { const k = st.progress * 2; p.seekProgress(k <= 1 ? k : 2 - k); } }
            else p.seekProgress(toClip(st.progress));
            applyMode(st.progress);
          }
          fadeBeats(st.progress);
        },
      });
    });
    // Chapters set their own pin length above, which changes the height of the page. Every trigger created before that
    // (the reveals, the word reveal, the iris, the strips) measured the old layout, so they are all recalculated once.
    ScrollTrigger.refresh();
    // First chapter drives the initial paint; the poster fades once frame 0 is drawn. Later chapters fetch after it.
    const first = players.get(chapters[0]!.sequence);
    if (first) {
      active = first;
      first.priority = "high";
      if (chapters[0]?.section && !openingHover) document.body.dataset.tone = document.getElementById(chapters[0].section)?.dataset.tone ?? "";
      // A hairline under the nav fills as the first chapter's frames arrive, then goes; the film is smooth once it is full.
      const root = document.documentElement;
      const loadFirst = async () => {
        await first.preload((n, total) => root.style.setProperty("--load", (n / total).toFixed(3)));
        first.draw(true);
        document.body.classList.add("canvas-ready");
        void first.ready.then(async () => {
          document.body.classList.add("frames-ready");
          for (const [id, p] of players) if (id !== chapters[0]!.sequence) await p.preload();
        });
      };
      // Behind an opening hover hero the film is out of sight, so it waits for the hero's frames rather than racing them.
      if (openingHover) void openingLoaded.then(loadFirst);
      else await loadFirst();
    }
    window.addEventListener("resize", () => active?.draw(true));
  }

  // Inline cards: hover play or pointer follow, loaded when they come into view.
  const cardPlayers = new Map<HTMLElement, SequencePlayer>();
  document.querySelectorAll<HTMLElement>(".seq-card").forEach((card) => {
    const spec = specs.get(card.dataset.sequence ?? "");
    const canvas = card.querySelector("canvas");
    if (!spec || !canvas) return;
    // A poster hero fills the tile, and on a phone it fills a band across the top with the page beneath it.
    const fit = card.dataset.fit === "contain" ? "contain" : "cover";
    const bandRaw = card.dataset.bandMobile ?? "";
    const bandM: number | "auto" = bandRaw === "auto" ? "auto" : Number(bandRaw) || 0;
    const p = new SequencePlayer(spec, canvas, {
      mobile,
      fit,
      band: mobile ? bandM : 0,
      transparent: card.dataset.transparent === "1" || fit === "contain",
      ground: getComputedStyle(card).backgroundColor || "#000",
    });
    cardPlayers.set(card, p);
    // Cards wait for the first chapter's frames so they never compete with the film for the connection, except the
    // opening hover hero, which is what the visitor sees first: it loads at once and the chapters wait for it.
    const opening = openingHover && Boolean(card.closest("section.hover-hero, section.poster-hero"));
    const gate = opening ? Promise.resolve() : active ? active.ready : Promise.resolve();
    if (opening) {
      p.priority = "high";
      // The chapters start once the hero's film is in, or after a few seconds whatever happens, so a slow or failed
      // hero can never leave the film below it unloaded.
      void Promise.race([p.preload().then(() => p.ready), new Promise((r) => setTimeout(r, 6000))]).then(releaseOpening, releaseOpening);
    }
    // An auto band tells the section where the film ends, so the page colour below it starts on the same line.
    if (bandM === "auto") {
      const section = card.closest<HTMLElement>("section");
      const sync = () => section?.style.setProperty("--ph-band", `${(p.bandFraction * 100).toFixed(2)}%`);
      void p.preload().then(() => { p.draw(true); sync(); });
      window.addEventListener("resize", () => { p.draw(true); sync(); }, { passive: true });
      sync();
    }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void gate.then(() => p.preload()).then(() => p.draw(true));
    }, { rootMargin: "200px" });
    io.observe(card);
    if (recording) { io.disconnect(); void p.preload().then(() => p.draw(true)); }
    // A card lens: a second sequence drawn over this tile and clipped to a circle that follows the pointer inside it.
    // It runs on its own clock, forward and back, so what shows through never cuts, and it is only built where there
    // is a pointer to follow.
    const lensId = card.dataset.lens;
    const lensSpec = lensId ? specs.get(lensId) : undefined;
    const lensCanvas = card.querySelector<HTMLCanvasElement>(".seq-lens");
    const lensRing = card.querySelector<HTMLElement>(".seq-lens-ring");
    if (!reduced && lensSpec && lensCanvas && !mobile && matchMedia("(hover: hover)").matches) {
      const lp = new SequencePlayer(lensSpec, lensCanvas, { mobile, fit, band: 0, ground: getComputedStyle(card).backgroundColor || "#000" });
      document.body.classList.add("lens-ready");
      let lx = 0, ly = 0, shown = false, raf = 0, last = 0, dir = 1;
      const radius = () => Math.max(64, card.clientWidth * (Number(card.dataset.lensRadius) || 0.28));
      const place = () => {
        const r = radius();
        lensCanvas.style.clipPath = `circle(${r}px at ${lx}px ${ly}px)`;
        if (lensRing) { lensRing.style.width = `${r * 2}px`; lensRing.style.height = `${r * 2}px`; lensRing.style.transform = `translate(${lx - r}px, ${ly - r}px)`; }
      };
      const step = (time: number) => {
        const dt = last ? (time - last) / 1000 : 0; last = time;
        let next = lp.playhead + dir * dt * lensSpec.fps;
        if (next >= lensSpec.count - 1) { next = lensSpec.count - 1; dir = -1; } else if (next <= 0) { next = 0; dir = 1; }
        lp.seek(next);
        raf = requestAnimationFrame(step);
      };
      const show = (on: boolean) => {
        if (on === shown) return;
        shown = on;
        card.classList.toggle("lens-on", on);
        if (on) { last = 0; raf = requestAnimationFrame(step); } else cancelAnimationFrame(raf);
      };
      card.addEventListener("pointerenter", () => { void lp.preload().then(() => lp.draw(true)); show(true); });
      card.addEventListener("pointerleave", () => show(false));
      card.addEventListener("pointermove", (e) => {
        const box = card.getBoundingClientRect();
        lx = e.clientX - box.left; ly = e.clientY - box.top;
        place();
      }, { passive: true });
      window.addEventListener("resize", place, { passive: true });
      place();
    }
    if (reduced) return;
    const driver = card.dataset.driver;
    if (driver === "pointer-x") p.attachPointerX(card);
    else if (driver === "loop") {
      let raf = 0, last = 0;
      const step = (t: number) => { const dt = last ? (t - last) / 1000 : 0; last = t; p.seek((p.playhead + dt * spec.fps) % (spec.count - 1)); raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
      document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(step); });
    } else p.attachHover(card, Number(card.dataset.reverse) || 2);
  });
  if (!openingHover || !document.querySelector("section.hover-hero .seq-card, section.poster-hero .seq-card")) releaseOpening();
  // A film held beside a taxonomy runs on its own clock rather than on the scroll: the kinds are what the reader is
  // moving through, and a river that stopped whenever they stopped would stop being the constant the section is built
  // on. One player, drawn only once the section has been anywhere near the screen.
  document.querySelectorAll<HTMLCanvasElement>(".split-canvas").forEach((canvas) => {
    const spec = specs.get(canvas.dataset.film ?? "");
    const pane = canvas.closest<HTMLElement>(".split-film");
    if (!spec || !pane) return;
    const p = new SequencePlayer(spec, canvas, { mobile, band: 0, ground: getComputedStyle(canvas).backgroundColor || "#000" });
    const start = () => {
      void p.preload().then(() => {
        p.draw(true);
        if (reduced || recording) return;
        let raf = 0;
        let last = 0;
        const step = (t: number) => {
          const dt = last ? (t - last) / 1000 : 0;
          last = t;
          // The scale sets the speed: the driver writes --rate on the pane and the clock reads it back, so the same
          // water runs slow at the bottom of the scale and quick at the top without a second clip existing.
          const rate = Number(getComputedStyle(pane).getPropertyValue("--rate")) || 1;
          p.seek((p.playhead + dt * spec.fps * rate) % (spec.count - 1));
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) cancelAnimationFrame(raf);
          else { last = 0; raf = requestAnimationFrame(step); }
        });
      });
    };
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      start();
    }, { rootMargin: "300px" });
    io.observe(canvas);
    if (recording) { io.disconnect(); start(); }
  });

  // Film decks: each card owns a canvas and its own player, and the film scrubs while that card is the top of the
  // deck. The deal itself is laid out in sections.ts, which writes --t on every card; here the same value is read
  // back and turned into a frame, so one scroll position drives both the film and the card leaving.
  const deckCards = [...document.querySelectorAll<HTMLElement>(".deck-card")];
  const deckPlayers = new Map<HTMLElement, SequencePlayer>();
  for (const card of deckCards) {
    const spec = specs.get(card.dataset.film ?? "");
    const canvas = card.querySelector<HTMLCanvasElement>(".deck-canvas");
    if (!spec || !canvas) continue;
    const dp = new SequencePlayer(spec, canvas, { mobile, band: 0, ground: getComputedStyle(card).backgroundColor || "#000" });
    deckPlayers.set(card, dp);
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void dp.preload().then(() => dp.draw(true));
    }, { rootMargin: "300px" });
    io.observe(card);
    if (recording) { io.disconnect(); void dp.preload().then(() => dp.draw(true)); }
  }
  if (deckPlayers.size) {
    // The film runs over the part of the card's turn before it is dealt, so it has finished by the time it leaves.
    let deckRaf = 0;
    const paint = () => {
      deckRaf = 0;
      for (const [card, dp] of deckPlayers) {
        const t = Number(card.style.getPropertyValue("--t")) || 0;
        dp.seekProgress(Math.max(0, Math.min(1, t / 0.78)));
      }
    };
    const onDeckScroll = () => { if (!deckRaf) deckRaf = requestAnimationFrame(paint); };
    window.addEventListener("scroll", onDeckScroll, { passive: true });
    window.addEventListener("resize", onDeckScroll, { passive: true });
    onDeckScroll();
  }

  // Every player is listed for the recorder and the QA scripts, cards included.
  (window as unknown as { __seq?: unknown }).__seq = new Map<string, SequencePlayer>([...players, ...[...cardPlayers.values()].map((p, n) => [`card-${n}`, p] as [string, SequencePlayer])]);
  if (recording) {
    const hero = document.querySelector<HTMLElement>(".hover-hero .seq-card, .poster-hero .seq-card");
    const player = hero && cardPlayers.get(hero);
    if (hero && player) installHoverDemo(hero, player);
  }
}

/**
 * The gallery card for a hover hero is a small film of the interaction itself: a pointer arrives on the tile, the film
 * plays, the pointer leaves and the film rewinds faster. The recorder drives it by time through window.__hoverDemo(t)
 * so every frame is exact; visitors never see the drawn pointer.
 */
function installHoverDemo(card: HTMLElement, p: SequencePlayer) {
  const cursor = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  cursor.id = "rec-cursor";
  cursor.setAttribute("viewBox", "0 0 22 30");
  cursor.innerHTML = '<path d="M2 2l16 13.5-7 .8 4.2 8.6-3.4 1.6-4.2-8.7L2 22.4z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>';
  document.body.appendChild(cursor);
  // The rewind runs at the tile's own rate, so the card shows the interaction a visitor gets.
  const REVERSE = Number(card.dataset.reverse) || 2.5;
  const ARRIVE = 0.9, SETTLE = 0.8;
  const LEAVE = Math.min(6.3, ARRIVE + p.spec.count / p.spec.fps);
  const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const look = card.dataset.driver === "pointer-x";
  const demo = (t: number) => {
    document.body.classList.add("rec-hover");
    const r = card.getBoundingClientRect();
    if (look) {
      // A portrait that follows the pointer: arrive at the left of the tile, sweep to the right, come back past centre, leave.
      const L = r.left + r.width * 0.12, R = r.left + r.width * 0.88, y0 = r.top + r.height * 0.55;
      const from = { x: r.left - Math.min(160, r.left * 0.6), y: r.bottom + 40 };
      let x: number, y = y0;
      if (t < ARRIVE) { const k = ease(t / ARRIVE); x = lerp(from.x, L, k); y = lerp(from.y, y0, k); }
      else if (t < ARRIVE + 2.6) x = lerp(L, R, ease((t - ARRIVE) / 2.6));
      else if (t < ARRIVE + 4.8) x = lerp(R, r.left + r.width * 0.4, ease((t - ARRIVE - 2.6) / 2.2));
      else { const k = ease((t - ARRIVE - 4.8) / SETTLE); x = lerp(r.left + r.width * 0.4, r.left + r.width * 0.4, k); y = lerp(y0, y0 + 30 * k, 1); }
      cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const frac = Math.max(0, Math.min(1, (x - r.left) / r.width));
      p.seek(frac * (p.spec.count - 1));
      p.draw(true);
      return;
    }
    const from = { x: r.left - Math.min(160, r.left * 0.6), y: r.bottom + 40 };
    const inside = { x: r.left + r.width * 0.5, y: r.top + r.height * 0.42 };
    const out = { x: r.left - Math.min(120, r.left * 0.5), y: r.top + r.height * 0.2 };
    let x: number, y: number, frame: number;
    const fps = p.spec.fps;
    const fLeave = (LEAVE - ARRIVE) * fps;
    if (t < ARRIVE) { const k = ease(t / ARRIVE); x = lerp(from.x, inside.x, k); y = lerp(from.y, inside.y, k); frame = 0; }
    else if (t < LEAVE) { const u = (t - ARRIVE) / (LEAVE - ARRIVE); x = inside.x + Math.sin(u * Math.PI * 2) * r.width * 0.05; y = inside.y + u * r.height * 0.1; frame = (t - ARRIVE) * fps; }
    else { const k = ease((t - LEAVE) / SETTLE); x = lerp(inside.x, out.x, k); y = lerp(inside.y + r.height * 0.1, out.y, k); frame = Math.max(0, fLeave - (t - LEAVE) * fps * REVERSE); }
    cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    p.seek(Math.min(p.spec.count - 1, frame));
    p.draw(true);
  };
  // Long enough for the rewind to land on frame 0 and rest there.
  (demo as unknown as { seconds: number }).seconds = look ? ARRIVE + 4.8 + SETTLE + 0.6 : LEAVE + ((LEAVE - ARRIVE) / REVERSE) + 0.9;
  (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
}
