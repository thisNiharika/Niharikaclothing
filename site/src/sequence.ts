// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
// Frame sequence player: scroll scrub, hover play with reverse, pointer follow.
// Frames are fetched and decoded in a worker (sequence-worker.ts) and arrive here as transferred bitmaps, so the
// thread that handles the scroll only ever draws. Only a window around the playhead is kept decoded, biased in the
// direction of travel, so memory stays flat. Without workers the same work runs here, as it used to.

export interface SequenceSpec { id: string; dir: string; count: number; fps: number; focus_x: number; sizes: { name: string; width: number; height: number }[] }

/** Where frames come from: a worker, or this thread when workers or transferable bitmaps are missing. */
interface FrameSource {
  start(order: number[], priority: "high" | "low"): void;
  want(i: number, width: number, ahead: number): void;
  at(playhead: number, dir: number): void;
}

const DECODE_PARALLEL = 4;

class WorkerSource implements FrameSource {
  private w: Worker;
  constructor(private urls: string[], private onLoaded: (i: number, loaded: number) => void, private onFrame: (i: number, bmp: ImageBitmap | null) => void, onFail: () => void) {
    this.w = new Worker(new URL("./sequence-worker.ts", import.meta.url), { type: "module" });
    this.w.onmessage = (e: MessageEvent<{ t: string; i?: number; loaded?: number; bmp?: ImageBitmap | null }>) => {
      const m = e.data;
      if (m.t === "loaded") this.onLoaded(m.i!, m.loaded!);
      else if (m.t === "frame") this.onFrame(m.i!, m.bmp ?? null);
    };
    this.w.onerror = () => { this.w.terminate(); onFail(); };
  }
  start(order: number[], priority: "high" | "low") { this.w.postMessage({ t: "init", urls: this.urls, order, priority }); }
  want(i: number, width: number, ahead: number) { this.w.postMessage({ t: "want", i, width, ahead }); }
  at(playhead: number, dir: number) { this.w.postMessage({ t: "at", playhead, dir }); }
}

class LocalSource implements FrameSource {
  private blobs: (Blob | null)[];
  private wanted = new Map<number, number>();
  private decoding = 0;
  private playhead = 0;
  private dir = 1;
  constructor(private urls: string[], private onLoaded: (i: number, loaded: number) => void, private onFrame: (i: number, bmp: ImageBitmap | null) => void) {
    this.blobs = new Array(urls.length).fill(null);
  }
  start(order: number[]) {
    const queue = order.slice();
    let loaded = 0;
    for (let n = 0; n < 8; n++) void (async () => {
      while (queue.length) {
        let best = 0, bestScore = Infinity;
        for (let k = 0; k < Math.min(queue.length, 24); k++) {
          const d = (queue[k]! - this.playhead) * this.dir;
          const score = d >= 0 ? d : -d * 3;
          if (score < bestScore) { bestScore = score; best = k; }
        }
        const i = queue.splice(best, 1)[0]!;
        try { const res = await fetch(this.urls[i]!); if (res.ok) this.blobs[i] = await res.blob(); } catch { /* skipped */ }
        loaded++;
        this.onLoaded(i, loaded);
        if (this.wanted.has(i)) this.pump();
      }
    })();
  }
  want(i: number, width: number) { this.wanted.set(i, width); this.pump(); }
  at(playhead: number, dir: number) { this.playhead = playhead; this.dir = dir; }
  private pump() {
    while (this.decoding < DECODE_PARALLEL) {
      let pick = -1, bestD = Infinity;
      for (const i of this.wanted.keys()) { if (!this.blobs[i]) continue; const d = Math.abs(i - this.playhead); if (d < bestD) { bestD = d; pick = i; } }
      if (pick < 0) return;
      const width = this.wanted.get(pick)!;
      this.wanted.delete(pick);
      this.decoding++;
      const blob = this.blobs[pick]!;
      void (width > 0 ? createImageBitmap(blob, { resizeWidth: width, resizeQuality: "medium" }).catch(() => createImageBitmap(blob)) : createImageBitmap(blob))
        .then((b) => this.onFrame(pick, b), () => this.onFrame(pick, null))
        .finally(() => { this.decoding--; this.pump(); });
    }
  }
}

export class SequencePlayer {
  private bitmaps: (ImageBitmap | null)[];
  private have: boolean[];
  private pending = new Set<number>();
  private source: FrameSource | null = null;
  private ctx: CanvasRenderingContext2D;
  private size: { width: number; height: number };
  private variant: string;
  private lastDrawn = -1;
  private lastKey = -1;
  private lastPlayhead = 0;
  private dir = 1;
  private behind: number;
  private ahead: number;
  private cssW = 0;
  private cssH = 0;
  private decodeWidth = 0;
  private dirty = true;
  private raf = 0;
  private toldAt = -1;
  private firstDrawn: (() => void) | null = null;
  private allLoaded: (() => void) | null = null;
  /** Resolves when every frame blob is in memory. */
  ready: Promise<void> = Promise.resolve();
  loaded = 0;
  playhead = 0; // frame index, fractional allowed
  /** Only the active player may paint. Chapters share one canvas, so a chapter that is still loading must not overwrite the one on screen. */
  active = true;
  /** Network priority for the frames: the first chapter is high, everything else waits behind it. */
  priority: "high" | "low" = "low";
  /** Index of the frame on the canvas, for QA scripts. */
  get frame() { return this.lastDrawn; }
  /** The fraction of the canvas the film occupies from the top, 0 when it fills. */
  get bandFraction() { return this.band; }
  /** On phones the stage draws the film into a band across the top of the canvas (this fraction of its height) and
   *  paints the page ground below it, so a landscape frame is not cover-cropped to a sliver and copy sits under the film. */
  private band = 0;
  private ground = "#000";
  /** Window mode: the frame is drawn into this fraction of the canvas (x, y, w, h in 0..1) instead of filling it. */
  private window: { x: number; y: number; w: number; h: number } | null = null;
  /** Mask mode: the frame shows through these lines of display type; `open` is how much of the frame outside the letters shows. */
  private mask: { lines: string[]; font: string; open: number; stroke?: string } | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;
  private stateKey = "";
  /** contain: the whole frame is drawn inside the canvas with the page ground around it, so nothing is cropped. */
  private fit: "cover" | "contain" = "cover";
  private transparent = false;
  private autoBand = false;
  constructor(public spec: SequenceSpec, public canvas: HTMLCanvasElement, opts: { mobile?: boolean; band?: number | "auto"; ground?: string; fit?: "cover" | "contain"; transparent?: boolean } = {}) {
    this.bitmaps = new Array(spec.count).fill(null);
    this.have = new Array(spec.count).fill(false);
    this.fit = opts.fit ?? "cover";
    // A transparent canvas lets the section's own background show wherever the film does not reach: the ground under a
    // band on a phone, or the margins of a contained frame. Opaque is cheaper, so it stays the default.
    this.transparent = opts.transparent ?? this.fit === "contain";
    this.ctx = canvas.getContext("2d", { alpha: this.transparent })!;
    this.autoBand = opts.band === "auto";
    this.band = typeof opts.band === "number" ? opts.band : 0;
    this.ground = opts.ground ?? "#000";
    this.variant = opts.mobile && spec.sizes.some((s) => s.name === "mobile") ? "mobile" : "desktop";
    this.size = spec.sizes.find((s) => s.name === this.variant) ?? spec.sizes[0]!;
    this.behind = opts.mobile ? 6 : 10;
    this.ahead = opts.mobile ? 18 : 30;
    window.addEventListener("resize", () => { this.dirty = true; });
  }
  private url(i: number) {
    return `${this.spec.dir}/${this.variant}/${String(i).padStart(4, "0")}.webp`;
  }
  private makeSource(): FrameSource {
    // Absolute URLs: a worker resolves relative ones against its own script, not the page.
    const urls = Array.from({ length: this.spec.count }, (_, i) => new URL(this.url(i), document.baseURI).href);
    const onLoaded = (i: number, loaded: number) => this.onLoaded(i, loaded);
    const onFrame = (i: number, bmp: ImageBitmap | null) => this.onFrame(i, bmp);
    if (typeof Worker !== "undefined" && typeof createImageBitmap !== "undefined") {
      try {
        return new WorkerSource(urls, onLoaded, onFrame, () => {
          // The worker died (an old browser without transferable bitmaps): carry on here with what is still needed.
          const local = new LocalSource(urls, onLoaded, onFrame);
          this.source = local;
          this.pending.clear();
          local.start(this.order().filter((i) => !this.have[i]));
          this.pump();
        });
      } catch { /* fall through */ }
    }
    return new LocalSource(urls, onLoaded, onFrame);
  }
  private order() {
    // Every 8th frame first so any scroll position has something, then the gaps fill in.
    const order: number[] = [];
    const seen = new Set<number>();
    for (const stride of [8, 4, 2, 1]) for (let i = 0; i < this.spec.count; i += stride) if (!seen.has(i)) { seen.add(i); order.push(i); }
    return order;
  }
  /** Starts the fetch. Returns when frame 0 is drawn; `ready` resolves when every frame is in memory. */
  preload(onProgress?: (loaded: number, total: number) => void) {
    if (this.source) return Promise.resolve();
    this.onProgress = onProgress ?? null;
    this.ready = new Promise<void>((res) => { this.allLoaded = res; });
    const first = new Promise<void>((res) => { this.firstDrawn = res; });
    this.source = this.makeSource();
    this.source.start(this.order(), this.priority);
    this.resize();
    this.pump();
    return first;
  }
  private onProgress: ((loaded: number, total: number) => void) | null = null;
  private onLoaded(i: number, loaded: number) {
    this.have[i] = true;
    this.loaded = loaded;
    this.onProgress?.(loaded, this.spec.count);
    if (loaded >= this.spec.count) { this.allLoaded?.(); this.allLoaded = null; }
    if (this.inWindow(i, 1) && !this.bitmaps[i] && !this.pending.has(i)) { this.pending.add(i); this.source!.want(i, this.decodeWidth, this.ahead); }
  }
  private onFrame(i: number, bmp: ImageBitmap | null) {
    this.pending.delete(i);
    if (!bmp) return;
    if (!this.inWindow(i, 2) && this.lastDrawn >= 0) { bmp.close(); return; }
    this.bitmaps[i]?.close();
    this.bitmaps[i] = bmp;
    if (this.firstDrawn) { this.draw(true); this.firstDrawn(); this.firstDrawn = null; }
    else if (Math.abs(i - this.playhead) < 1) this.draw(true);
    this.pump();
  }
  private inWindow(i: number, slack = 1) {
    const d = (i - this.playhead) * this.dir;
    return d >= -this.behind * slack && d <= this.ahead * slack;
  }
  /** Asks for decodes toward the playhead, evicts what is far behind. Cheap to call often. */
  private pump() {
    if (!this.source) return;
    const centre = Math.round(this.playhead);
    for (let i = 0; i < this.spec.count; i++) {
      const b = this.bitmaps[i];
      if (b && !this.inWindow(i, 2)) { b.close(); this.bitmaps[i] = null; }
    }
    // Nearest first, in the direction of travel.
    for (let d = 0; d <= this.ahead; d++) {
      for (const i of [centre + d * this.dir, centre - d * this.dir]) {
        if (i < 0 || i >= this.spec.count || !this.inWindow(i)) continue;
        if (this.have[i] && !this.bitmaps[i] && !this.pending.has(i)) { this.pending.add(i); this.source.want(i, this.decodeWidth, this.ahead); }
      }
    }
  }
  /** Drops decoded frames except the current one. Call on chapters that scrolled away. */
  idle() {
    const keep = this.nearest(this.playhead);
    this.bitmaps.forEach((b, i) => { if (b && i !== keep) { b.close(); this.bitmaps[i] = null; } });
  }
  private nearest(i: number) {
    const target = Math.max(0, Math.min(this.spec.count - 1, Math.round(i)));
    if (this.bitmaps[target]) return target;
    for (let d = 1; d < this.spec.count; d++) {
      if (this.bitmaps[target - d]) return target - d;
      if (this.bitmaps[target + d]) return target + d;
    }
    return -1;
  }
  private resize() {
    if (!this.dirty) return;
    this.dirty = false;
    this.cssW = this.canvas.clientWidth || innerWidth;
    this.cssH = this.canvas.clientHeight || innerHeight;
    // band "auto": as tall as the film needs at this width, so cover fills it exactly and crops nothing.
    if (this.autoBand) this.band = Math.min(0.7, Math.max(0.3, this.cssW / (this.size.width / this.size.height) / Math.max(1, this.cssH)));
    // The backing store never exceeds the frame's own pixel density. What matters is how much of the frame survives the
    // fit: a film already being enlarged to fill the box gains nothing from a denser canvas and costs fill rate for it.
    const boxW = this.cssW, boxH = this.band > 0 ? this.cssH * this.band : this.cssH;
    const scale = this.fit === "contain"
      ? Math.min(boxW / this.size.width, boxH / this.size.height)
      : Math.max(boxW / this.size.width, boxH / this.size.height);
    const dpr = Math.min(devicePixelRatio || 1, 2, Math.max(1, 1 / Math.max(0.0001, scale)));
    const w = Math.round(this.cssW * dpr), h = Math.round(this.cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.lastDrawn = -1; this.lastKey = -1; }
    // Frames much wider than the canvas are decoded down to it: less memory and less to upload per draw.
    const need = this.fit === "contain"
      ? Math.round(Math.min(this.canvas.width, this.canvas.height * this.size.width / this.size.height))
      : this.band > 0 ? Math.round(this.canvas.height * this.band * this.size.width / this.size.height) : this.canvas.width;
    this.decodeWidth = need < this.size.width * 0.8 ? Math.max(need, this.canvas.width) : 0;
  }
  /** Window mode: the frame is drawn into a rectangle (fractions of the canvas), the page ground around it. null fills. */
  setWindow(rect: { x: number; y: number; w: number; h: number } | null) {
    const key = rect ? `w${rect.x.toFixed(3)},${rect.y.toFixed(3)},${rect.w.toFixed(3)},${rect.h.toFixed(3)}` : "";
    if (key === (this.window ? `w${this.window.x.toFixed(3)},${this.window.y.toFixed(3)},${this.window.w.toFixed(3)},${this.window.h.toFixed(3)}` : "")) return;
    this.window = rect;
    this.draw(true);
  }
  /** Mask mode: the frame shows through lines of type; open 0 shows only the letters, 1 the whole frame. */
  setMask(mask: { lines: string[]; font: string; open: number; stroke?: string } | null) {
    const key = mask ? `m${mask.open.toFixed(3)}:${mask.lines.join("|")}` : "";
    if (key === this.stateKey) return;
    this.stateKey = key;
    this.mask = mask;
    this.draw(true);
  }
  seek(frame: number) {
    const next = Math.max(0, Math.min(this.spec.count - 1, frame));
    if (next !== this.playhead) this.dir = next > this.playhead ? 1 : -1;
    this.playhead = next;
    if (this.source && Math.abs(next - this.toldAt) >= 1) { this.toldAt = next; this.source.at(next, this.dir); }
    this.pump();
    this.draw();
  }
  seekProgress(p: number) {
    this.seek(p * (this.spec.count - 1));
  }
  draw(force = false) {
    if (!this.active) return;
    // A slowed beat moves the film a frame every few dozen pixels of scroll. Blending the two frames either side of a
    // fractional playhead turns those steps into motion, at the cost of one extra drawImage.
    // Blending only pays while the film crawls (a slowed beat, a hover at rest): a scroll that moves a frame or more
    // per draw gets one drawImage of the nearest frame, half the upload and fill of two.
    const lo = Math.floor(this.playhead), hi = Math.ceil(this.playhead);
    const t = this.playhead - lo;
    const slow = Math.abs(this.playhead - this.lastPlayhead) < 0.6;
    const blend = slow && hi !== lo && t > 0.04 && t < 0.96 && this.bitmaps[lo] && this.bitmaps[hi] ? this.bitmaps[hi]! : null;
    const i = blend ? lo : this.nearest(this.playhead);
    if (i < 0) return;
    const key = blend ? lo + Math.round(t * 20) / 20 : i;
    this.lastPlayhead = this.playhead;
    if (key === this.lastKey && !force) return;
    this.resize();
    const img = this.bitmaps[i]!;
    const cw = this.canvas.width, ch = this.canvas.height;
    // The frame fills the canvas, or a band across the top on phones, or a window that the chapter moves and grows.
    const rect = this.window
      ? { x: Math.round(cw * this.window.x), y: Math.round(ch * this.window.y), w: Math.round(cw * this.window.w), h: Math.round(ch * this.window.h) }
      : { x: 0, y: 0, w: cw, h: this.band > 0 ? Math.round(ch * this.band) : ch };
    const contain = this.fit === "contain";
    // Contain never fills the canvas, so the ground is always painted under it.
    const full = !contain && rect.x === 0 && rect.y === 0 && rect.w === cw && rect.h === ch;
    const scale = contain ? Math.min(rect.w / img.width, rect.h / img.height) : Math.max(rect.w / img.width, rect.h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    // Cover crops toward the subject (focus_x); contain centres the whole frame.
    const dx = contain ? rect.x + (rect.w - dw) / 2 : rect.x - (dw - rect.w) * this.spec.focus_x;
    const dy = rect.y - (dh - rect.h) * 0.5;
    const paint = (c: CanvasRenderingContext2D) => {
      c.globalAlpha = 1;
      c.drawImage(img, dx, dy, dw, dh);
      if (blend) { c.globalAlpha = t; c.drawImage(blend, dx, dy, dw, dh); c.globalAlpha = 1; }
    };
    this.ctx.globalAlpha = 1;
    if (this.mask) {
      // Letters first: the frame drawn into an offscreen canvas and kept only where the type is, then the rest of the
      // frame underneath at the mask's openness, so the letters never dim as the frame comes through.
      this.ctx.fillStyle = this.ground;
      this.ctx.fillRect(0, 0, cw, ch);
      if (this.mask.open > 0.001) {
        this.ctx.globalAlpha = Math.min(1, this.mask.open);
        this.ctx.save(); this.ctx.beginPath(); this.ctx.rect(rect.x, rect.y, rect.w, rect.h); this.ctx.clip(); paint(this.ctx); this.ctx.restore();
        this.ctx.globalAlpha = 1;
      }
      if (this.mask.open < 0.999) {
        // The type goes down first, then the frame is drawn through it with source-in. One composite covers every
        // line; a destination-in per line would keep only where the lines overlap, which is nowhere.
        const off = this.maskCanvas ?? (this.maskCanvas = document.createElement("canvas"));
        if (off.width !== cw || off.height !== ch) { off.width = cw; off.height = ch; }
        const oc = off.getContext("2d")!;
        oc.globalCompositeOperation = "source-over";
        oc.clearRect(0, 0, cw, ch);
        oc.fillStyle = "#000";
        oc.textAlign = "center";
        oc.textBaseline = "middle";
        const lines = this.mask.lines;
        // Size the type to the width: the longest line takes 88% of the canvas, capped at a third of its height per line.
        let size = Math.min(ch * 0.34, cw * 0.3);
        oc.font = `${this.mask.font.replace("SIZE", `${size}px`)}`;
        const widest = Math.max(...lines.map((l) => oc.measureText(l).width));
        size = Math.floor(size * Math.min(1, (cw * 0.88) / Math.max(1, widest)));
        oc.font = `${this.mask.font.replace("SIZE", `${size}px`)}`;
        const lineH = size * 0.94;
        // Letters sit a little above centre on a full frame, leaving the foot of the screen for the beat copy.
        const top = rect.y + rect.h * (this.band > 0 ? 0.5 : 0.4) - ((lines.length - 1) * lineH) / 2;
        lines.forEach((l, n) => oc.fillText(l, rect.x + rect.w / 2, top + n * lineH));
        oc.globalCompositeOperation = "source-in";
        paint(oc);
        oc.globalCompositeOperation = "source-over";
        this.ctx.drawImage(off, 0, 0);
        // A hairline in the text colour keeps the word legible where the frame is as dark as the page ground.
        if (this.mask.stroke) {
          this.ctx.save();
          this.ctx.globalAlpha = 0.34 * (1 - this.mask.open);
          this.ctx.strokeStyle = this.mask.stroke;
          this.ctx.lineWidth = Math.max(1, size * 0.006);
          this.ctx.lineJoin = "round";
          this.ctx.font = oc.font;
          this.ctx.textAlign = "center";
          this.ctx.textBaseline = "middle";
          lines.forEach((l, n) => this.ctx.strokeText(l, rect.x + rect.w / 2, top + n * lineH));
          this.ctx.restore();
        }
      }
    } else {
      if (!full) {
        if (this.transparent) this.ctx.clearRect(0, 0, cw, ch);
        else { this.ctx.fillStyle = this.ground; this.ctx.fillRect(0, 0, cw, ch); }
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(rect.x, rect.y, rect.w, rect.h);
        this.ctx.clip();
      }
      paint(this.ctx);
      if (!full) this.ctx.restore();
      // Contain leaves bands of empty canvas on two sides. Stretching the frame's own edge column or row across them
      // continues the film's background exactly, whatever colour or gradient it is, for two more drawImage calls.
      if (contain) {
        const c = this.ctx;
        c.globalAlpha = 1;
        if (dx > 0.5) {
          c.drawImage(img, 0, 0, 1, img.height, 0, dy, Math.ceil(dx), dh);
          c.drawImage(img, img.width - 1, 0, 1, img.height, Math.floor(dx + dw), dy, Math.ceil(cw - dx - dw), dh);
        }
        if (dy > 0.5) {
          c.drawImage(img, 0, 0, img.width, 1, dx, 0, dw, Math.ceil(dy));
          c.drawImage(img, 0, img.height - 1, img.width, 1, dx, Math.floor(dy + dh), dw, Math.ceil(ch - dy - dh));
        }
      }
    }
    this.lastDrawn = i;
    this.lastKey = key;
  }
  /** Hover driver: forward at 1x on enter, backward at `reverseRate`x on leave. */
  attachHover(el: HTMLElement, reverseRate = 2) {
    let dir = 0, last = 0;
    const step = (t: number) => {
      const dt = last ? (t - last) / 1000 : 0;
      last = t;
      this.seek(this.playhead + dir * this.spec.fps * dt * (dir < 0 ? reverseRate : 1));
      const done = (dir > 0 && this.playhead >= this.spec.count - 1) || (dir < 0 && this.playhead <= 0);
      if (!done) this.raf = requestAnimationFrame(step); else { this.raf = 0; last = 0; }
    };
    const go = (d: number) => { dir = d; last = 0; if (!this.raf) this.raf = requestAnimationFrame(step); };
    el.addEventListener("pointerenter", () => go(1));
    el.addEventListener("pointerleave", () => go(-1));
    el.addEventListener("click", () => go(dir >= 0 && this.playhead >= this.spec.count - 1 ? -1 : 1)); // touch: tap toggles
  }
  /** Pointer driver: playhead follows the pointer's x across the element, eased. */
  attachPointerX(el: HTMLElement) {
    let target = 0;
    const tick = () => {
      this.seek(this.playhead + (target - this.playhead) * 0.12);
      if (Math.abs(target - this.playhead) > 0.05) this.raf = requestAnimationFrame(tick); else this.raf = 0;
    };
    const set = (x: number) => {
      const r = el.getBoundingClientRect();
      target = Math.max(0, Math.min(1, (x - r.left) / r.width)) * (this.spec.count - 1);
      if (!this.raf) this.raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", (e) => set(e.clientX), { passive: true });
    window.addEventListener("touchmove", (e) => set(e.touches[0]?.clientX ?? 0), { passive: true });
  }
}
