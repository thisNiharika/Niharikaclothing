// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
// Frame fetch and decode off the main thread. The page thread only ever draws bitmaps that are already decoded, so a
// scroll never waits on a decode, in any browser: Safari and Firefox decode createImageBitmap(blob) on the calling
// thread, which is this worker and not the one handling the scroll.

export type ToWorker =
  | { t: "init"; urls: string[]; order: number[]; priority: "high" | "low" }
  | { t: "at"; playhead: number; dir: number }
  | { t: "want"; i: number; width: number; ahead: number };
export type FromWorker = { t: "loaded"; i: number; loaded: number } | { t: "frame"; i: number; bmp: ImageBitmap | null } | { t: "done" };

const FETCH_PARALLEL = 8, DECODE_PARALLEL = 4;
let urls: string[] = [];
let blobs: (Blob | null)[] = [];
let playhead = 0, dir = 1, loaded = 0;
const wanted = new Map<number, { width: number; ahead: number }>();
let decoding = 0;
const post = (m: FromWorker, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);

async function fetchAll(order: number[], priority: "high" | "low") {
  const queue = order.slice();
  const workers = Array.from({ length: FETCH_PARALLEL }, async () => {
    while (queue.length) {
      // Nearest to the playhead in the direction of travel goes first, looking a little way down the stride order.
      let best = 0, bestScore = Infinity;
      for (let k = 0; k < Math.min(queue.length, 24); k++) {
        const d = (queue[k]! - playhead) * dir;
        const score = d >= 0 ? d : -d * 3;
        if (score < bestScore) { bestScore = score; best = k; }
      }
      const i = queue.splice(best, 1)[0]!;
      try {
        const res = await fetch(urls[i]!, { priority } as RequestInit);
        if (res.ok) blobs[i] = await res.blob();
      } catch { /* left null: the nearest loaded frame is drawn instead */ }
      loaded++;
      post({ t: "loaded", i, loaded });
      if (wanted.has(i)) pump();
    }
  });
  await Promise.all(workers);
  post({ t: "done" });
}

function pump() {
  while (decoding < DECODE_PARALLEL) {
    // Decode the wanted frame nearest the playhead; drop wants that have fallen far behind the scroll.
    let pick = -1, bestD = Infinity;
    for (const [i, w] of wanted) {
      if (!blobs[i]) continue;
      const d = Math.abs(i - playhead);
      if (d > w.ahead * 2) { wanted.delete(i); post({ t: "frame", i, bmp: null }); continue; }
      if (d < bestD) { bestD = d; pick = i; }
    }
    if (pick < 0) return;
    const w = wanted.get(pick)!;
    wanted.delete(pick);
    decoding++;
    void decode(pick, w.width).finally(() => { decoding--; pump(); });
  }
}

async function decode(i: number, width: number) {
  const blob = blobs[i];
  if (!blob) { post({ t: "frame", i, bmp: null }); return; }
  let bmp: ImageBitmap | null = null;
  try {
    bmp = width > 0 ? await createImageBitmap(blob, { resizeWidth: width, resizeQuality: "medium" }) : await createImageBitmap(blob);
  } catch {
    try { bmp = await createImageBitmap(blob); } catch { bmp = null; }
  }
  post({ t: "frame", i, bmp }, bmp ? [bmp] : []);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.t === "init") { urls = m.urls; blobs = new Array(urls.length).fill(null); void fetchAll(m.order, m.priority); }
  else if (m.t === "at") { playhead = m.playhead; dir = m.dir; }
  else if (m.t === "want") { wanted.set(m.i, { width: m.width, ahead: m.ahead }); pump(); }
};
