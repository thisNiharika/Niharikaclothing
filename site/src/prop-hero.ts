// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
// Plate and prop: a photographic still is the background, a rendered object is composited on top of it, and the
// pointer decides which frame of that object you see. Nothing is generated at runtime, so the prop can be raytraced
// and photoreal while the page stays light. Three parts, and a kit uses one, two or all three:
//
//   turntable  the prop at 36 to 48 yaw angles, or under 24 lighting directions, as one sequence. Dragging across
//              the hero picks the frame, so the object follows the pointer with no WebGL and no runtime cost.
//   open       a second, shorter sequence of the prop opening. A click plays it forward, a click plays it back. It
//              gets its own canvas so its frames are only fetched when somebody actually opens the thing.
//   hotspots   positions exported from Blender for every frame, so a real HTML button can sit on a part of the
//              object and move with it as it turns. This is what lets a hero become the navigation.
//
// The plate is an <img> behind the canvases, not a frame of either sequence: it never changes, so it should cost one
// cached image rather than a place in every rendered frame.
import { SequencePlayer, type SequenceSpec } from "./sequence";
import type { KitConfig } from "./config";
import { isMobile, prefersReducedMotion } from "./fallback";

/** One [x, y] in the render's own pixel space per frame, or null on frames where the part is behind the object. */
type Track = ([number, number] | null)[];
interface HotspotFile { size: [number, number]; hotspots: Record<string, Track> }

/** Where the frame lands inside the canvas under `fit: "contain"`, in CSS pixels, so a hotspot can be put on it. */
function contain(cw: number, ch: number, fw: number, fh: number) {
  const scale = Math.min(cw / fw, ch / fh);
  const w = fw * scale, h = fh * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, scale };
}

export function initPropHeroes(cfg: KitConfig) {
  const mobile = isMobile();
  const reduced = prefersReducedMotion();
  const recording = new URLSearchParams(location.search).has("record");
  const specs = new Map<string, SequenceSpec>();
  for (const s of cfg.assets.sequences ?? []) {
    if (!s.count || !s.sizes) continue;
    specs.set(s.id, { id: s.id, dir: s.dir, count: s.count, fps: s.fps ?? 24, focus_x: s.focus_x ?? 0.5, sizes: s.sizes });
  }

  document.querySelectorAll<HTMLElement>("[data-prop]").forEach((stage) => {
    const turnSpec = specs.get(stage.dataset.turntable ?? "");
    const turnCanvas = stage.querySelector<HTMLCanvasElement>(".pp-canvas");
    if (!turnSpec || !turnCanvas) return;
    const ground = getComputedStyle(stage).backgroundColor || "transparent";
    // Transparent and contained: the prop is rendered on transparent film so the plate behind shows through, and
    // nothing of the prop is ever cropped away by the shape of the viewport.
    const turn = new SequencePlayer(turnSpec, turnCanvas, { mobile, fit: "contain", band: 0, transparent: true, ground });

    const openSpec = specs.get(stage.dataset.open ?? "");
    const openCanvas = stage.querySelector<HTMLCanvasElement>(".pp-canvas-open");
    const open = openSpec && openCanvas
      ? new SequencePlayer(openSpec, openCanvas, { mobile, fit: "contain", band: 0, transparent: true, ground })
      : null;
    // Only one of the two paints at a time. The open sequence starts inactive so it cannot draw over the turntable
    // while its frames arrive.
    if (open) open.active = false;

    // A prop may have one frame that matters: the dial on its number, the telescope on the constellation. Until the
    // turntable rests there the open sequence is refused, so the verb has an answer rather than just a range.
    const unlockFrame = stage.dataset.unlockFrame ? Number(stage.dataset.unlockFrame) : null;
    const unlockWithin = Number(stage.dataset.unlockWithin || 1.5);
    let unlocked = unlockFrame === null;

    // Which sequence the hotspots should be read from, and where its playhead is.
    let opened = false;
    const showing = () => (opened && open ? { player: open, spec: openSpec! } : { player: turn, spec: turnSpec });

    // ---- hotspots -------------------------------------------------------------------------------------------
    const spots = [...stage.querySelectorAll<HTMLElement>(".pp-spot")];
    const tracks = new Map<string, { turn?: Track; open?: Track }>();
    let hotspotSize: [number, number] = [turnSpec.sizes[0]?.width ?? 1600, turnSpec.sizes[0]?.height ?? 900];
    const placeSpots = () => {
      if (!spots.length || !tracks.size) return;
      const { player, spec } = showing();
      const frame = Math.round(player.playhead);
      const box = player.canvas.getBoundingClientRect();
      const fit = contain(box.width, box.height, hotspotSize[0], hotspotSize[1]);
      for (const el of spots) {
        const t = tracks.get(el.dataset.spot ?? "");
        const track = (spec === openSpec ? t?.open : t?.turn) ?? t?.turn;
        const at = track?.[Math.max(0, Math.min((track?.length ?? 1) - 1, frame))];
        if (!at) { el.setAttribute("data-behind", ""); continue; }
        el.removeAttribute("data-behind");
        el.style.transform = `translate(${(fit.x + at[0] * fit.scale).toFixed(1)}px, ${(fit.y + at[1] * fit.scale).toFixed(1)}px)`;
      }
    };
    const hotspotSrc = stage.dataset.hotspots;
    if (hotspotSrc && spots.length) {
      void fetch(hotspotSrc).then((r) => (r.ok ? r.json() : null)).then((data: HotspotFile | null) => {
        if (!data?.hotspots) return;
        hotspotSize = data.size ?? hotspotSize;
        for (const [name, track] of Object.entries(data.hotspots)) {
          const cur = tracks.get(name) ?? {};
          cur.turn = track;
          tracks.set(name, cur);
        }
        stage.classList.add("spots-ready");
        placeSpots();
      }).catch(() => { /* the hero still turns without its buttons */ });
    }
    const openHotspotSrc = stage.dataset.hotspotsOpen;
    if (openHotspotSrc && spots.length) {
      void fetch(openHotspotSrc).then((r) => (r.ok ? r.json() : null)).then((data: HotspotFile | null) => {
        if (!data?.hotspots) return;
        for (const [name, track] of Object.entries(data.hotspots)) {
          const cur = tracks.get(name) ?? {};
          cur.open = track;
          tracks.set(name, cur);
        }
      }).catch(() => { /* the open state falls back to the turntable's positions */ });
    }

    // Every seek repaints the buttons, so they stay on the part they belong to rather than drifting behind the film.
    let placeRaf = 0;
    const sync = () => { if (!placeRaf) placeRaf = requestAnimationFrame(() => { placeRaf = 0; placeSpots(); checkUnlock(); }); };

    // ---- the verb -------------------------------------------------------------------------------------------
    // "drag": the prop turns with the pointer held down, which is the right verb for a dial or anything with a
    // detent. "point": it follows the pointer across the hero with no click, for a prop that is being aimed.
    const verb = stage.dataset.verb ?? "drag";
    const lastFrame = () => turnSpec.count - 1;
    let target = turn.playhead;
    let raf = 0;
    const ease = () => {
      const next = turn.playhead + (target - turn.playhead) * 0.18;
      turn.seek(Math.abs(target - turn.playhead) < 0.02 ? target : next);
      sync();
      raf = Math.abs(target - turn.playhead) > 0.02 ? requestAnimationFrame(ease) : 0;
    };
    const drive = (frame: number) => {
      target = Math.max(0, Math.min(lastFrame(), frame));
      if (!raf) raf = requestAnimationFrame(ease);
    };
    // The dial is on its number when the playhead is within a frame or so of it, measured the short way round so a
    // number at the top of the sequence can be reached from either direction.
    const checkUnlock = () => {
      if (unlockFrame === null) return;
      const span = turnSpec.count;
      const d = Math.abs(((turn.playhead - unlockFrame) % span + span + span / 2) % span - span / 2);
      const now = d <= unlockWithin;
      if (now === unlocked) return;
      unlocked = now;
      stage.classList.toggle("unlocked", now);
      const btn = stage.parentElement?.querySelector<HTMLButtonElement>(".pp-open-btn") ?? null;
      if (btn) btn.disabled = !now;
    };

    if (!reduced && !recording) {
      if (verb === "point") {
        const set = (x: number) => {
          const r = stage.getBoundingClientRect();
          drive(Math.max(0, Math.min(1, (x - r.left) / r.width)) * lastFrame());
        };
        stage.addEventListener("pointermove", (e) => set(e.clientX), { passive: true });
      } else {
        // A full drag across the hero turns the prop once all the way round, and it keeps turning past the ends so a
        // dial can be spun rather than swept.
        let down = false, startX = 0, startFrame = 0;
        const wrap = (f: number) => ((f % turnSpec.count) + turnSpec.count) % turnSpec.count;
        stage.addEventListener("pointerdown", (e) => {
          down = true; startX = e.clientX; startFrame = turn.playhead;
          stage.setPointerCapture(e.pointerId);
          stage.classList.add("dragging");
        });
        stage.addEventListener("pointermove", (e) => {
          if (!down) return;
          const r = stage.getBoundingClientRect();
          const delta = ((e.clientX - startX) / Math.max(1, r.width)) * turnSpec.count;
          target = wrap(startFrame + delta);
          turn.seek(target);
          sync();
        });
        const up = (e: PointerEvent) => {
          if (!down) return;
          down = false;
          stage.classList.remove("dragging");
          if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
        };
        stage.addEventListener("pointerup", up);
        stage.addEventListener("pointercancel", up);
      }
    }

    // ---- the baked open -------------------------------------------------------------------------------------
    const toggle = stage.querySelector<HTMLElement>(".pp-open-btn");
    if (open && openSpec && toggle) {
      let openRaf = 0, last = 0, dir = 1, loading: Promise<void> | null = null;
      const step = (t: number) => {
        const dt = last ? (t - last) / 1000 : 0;
        last = t;
        const next = open.playhead + dir * dt * openSpec.fps;
        open.seek(next);
        sync();
        const done = (dir > 0 && open.playhead >= openSpec.count - 1) || (dir < 0 && open.playhead <= 0);
        if (!done) openRaf = requestAnimationFrame(step);
        else {
          openRaf = 0; last = 0;
          // Closed again: hand the canvas back to the turntable so dragging keeps working.
          if (dir < 0) { opened = false; open.active = false; turn.active = true; stage.classList.remove("open"); turn.draw(true); sync(); }
        }
      };
      const run = (d: number) => { dir = d; last = 0; if (!openRaf) openRaf = requestAnimationFrame(step); };
      toggle.addEventListener("click", () => {
        // Closing is always allowed; opening waits until the prop is on its number.
        if (!opened && !unlocked) return;
        if (reduced) { // No animation: the two states still swap, they just do it at once.
          opened = !opened;
          open.active = opened; turn.active = !opened;
          open.seek(opened ? openSpec.count - 1 : 0);
          stage.classList.toggle("open", opened);
          (opened ? open : turn).draw(true);
          sync();
          toggle.setAttribute("aria-expanded", String(opened));
          return;
        }
        if (!opened) {
          opened = true;
          stage.classList.add("open");
          toggle.setAttribute("aria-expanded", "true");
          loading = loading ?? open.preload().then(() => { /* frames in memory */ });
          void loading.then(() => { turn.active = false; open.active = true; open.draw(true); run(1); });
        } else {
          toggle.setAttribute("aria-expanded", "false");
          run(-1);
        }
      });
    }

    // ---- first paint ----------------------------------------------------------------------------------------
    void turn.preload().then(() => {
      turn.draw(true);
      stage.classList.add("prop-ready");
      document.body.classList.add("canvas-ready");
      sync();
    });
    window.addEventListener("resize", () => { turn.draw(true); if (opened) open?.draw(true); sync(); }, { passive: true });

    // The recorder drives the hero by time so the gallery card shows the verb rather than a still: the prop turns
    // most of the way round, and opens at the end if the kit has an open sequence.
    if (recording) {
      const seconds = open ? 7.2 : 5.4;
      const seek = (t: number) => {
        document.body.classList.add("rec-hover");
        const turnFor = open ? 4.4 : seconds;
        if (t <= turnFor) {
          turn.active = true;
          if (open) open.active = false;
          opened = false;
          turn.seek(Math.min(lastFrame(), (t / turnFor) * lastFrame()));
        } else if (open && openSpec) {
          opened = true;
          turn.active = false;
          open.active = true;
          stage.classList.add("open");
          open.seek(Math.min(openSpec.count - 1, ((t - turnFor) / 1.6) * (openSpec.count - 1)));
        }
        (opened && open ? open : turn).draw(true);
        placeSpots();
      };
      (seek as unknown as { seconds: number }).seconds = seconds;
      (seek as unknown as { acts: number }).acts = open ? 2 : 1;
      (window as unknown as { __seek?: unknown }).__seek = seek;
      void turn.preload().then(() => open?.preload()).then(() => { seek(0); document.body.classList.add("canvas-ready"); });
    }
  });
}
