// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// The machine: the aisles' products on coils behind glass. Key a letter and a number, or press a pack on the glass,
// and that coil turns, the pack tips off the front and drops into the tray, the display names it, and half a second
// later the aisle's close look opens on that pack (the aisle listens for "aisle:open"), where it turns round to its
// label and the rest of its aisle sits beneath it. The tray opens it again. The coil is restocked behind it, so the
// machine never runs empty.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function initMachines() {
  for (const root of document.querySelectorAll<HTMLElement>("[data-machine]")) setup(root);
}

function setup(root: HTMLElement) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const slots = new Map([...root.querySelectorAll<HTMLButtonElement>(".mc-slot")].map((b) => [b.dataset.code!, b]));
  const d1 = root.querySelector<HTMLElement>(".mc-d1");
  const d2 = root.querySelector<HTMLElement>(".mc-d2");
  const tray = root.querySelector<HTMLButtonElement>(".mc-tray")!;
  const drop = root.querySelector<HTMLImageElement>(".mc-drop")!;
  const idle = { d1: d1?.textContent ?? "", d2: d2?.textContent ?? "" };
  let entry = "";
  let busy = false;
  let collected: string | null = null;

  const show = (a: string, b: string) => {
    if (d1) d1.textContent = a;
    if (d2) d2.textContent = b;
    root.querySelector(".mc-display")?.classList.remove("blink");
    void root.querySelector<HTMLElement>(".mc-display")?.offsetWidth;
    root.querySelector(".mc-display")?.classList.add("blink");
  };

  const vend = async (code: string) => {
    const slot = slots.get(code);
    if (!slot || busy) return;
    busy = true;
    entry = "";
    const name = slot.dataset.name ?? code;
    show(code, "Vending");
    slot.classList.add("turning");
    const img = slot.querySelector("img")!;
    // The coil turns once; the pack rides it forward to the lip, then falls.
    await wait(reduced.matches ? 0 : 900);
    const a = img.getBoundingClientRect();
    const t = tray.getBoundingClientRect();
    const ghost = img.cloneNode() as HTMLImageElement;
    ghost.className = "mc-ghost";
    Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.appendChild(ghost);
    img.style.opacity = "0";
    const fall = reduced.matches ? 1 : 620;
    const dx = t.left + t.width / 2 - (a.left + a.width / 2);
    const dy = t.top + t.height * 0.55 - (a.top + a.height / 2);
    const spin = (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 16);
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const tick = (now: number) => {
        const k = clamp((now - t0) / fall, 0, 1);
        const g = k * k; // gravity: slow off the lip, fast at the bottom
        ghost.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * g).toFixed(1)}px) rotate(${(spin * k).toFixed(1)}deg) scale(${(1 - 0.18 * k).toFixed(3)})`;
        if (k < 1) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    ghost.remove();
    drop.src = img.currentSrc || img.src;
    drop.alt = name;
    tray.classList.remove("landed");
    void tray.offsetWidth;
    tray.classList.add("landed", "full");
    tray.disabled = false;
    collected = code;
    show(code, name);
    // Half a second in the tray, then it opens: the pack comes out to be looked at, front and back.
    setTimeout(() => {
      if (collected === code) document.dispatchEvent(new CustomEvent("aisle:open", { detail: { code } }));
    }, reduced.matches ? 0 : 500);
    // Restocked from behind, the way a real coil feeds the next pack forward.
    slot.classList.remove("turning");
    await wait(reduced.matches ? 0 : 500);
    img.style.opacity = "";
    slot.classList.add("restocked");
    setTimeout(() => slot.classList.remove("restocked"), 700);
    busy = false;
  };

  root.querySelectorAll<HTMLButtonElement>(".mc-key").forEach((k) =>
    k.addEventListener("click", () => {
      if (busy) return;
      const key = k.dataset.key ?? "";
      if (key === "clear") { entry = ""; show(idle.d1, idle.d2); return; }
      if (/^[A-Z]$/.test(key)) { entry = key; show(`${key}_`, "Now a number"); return; }
      if (!entry) { show(idle.d1, "Letter first"); return; }
      const code = `${entry}${key}`;
      if (!slots.has(code)) { entry = ""; show(code, "Not in this machine"); return; }
      void vend(code);
    }),
  );
  slots.forEach((b, code) => b.addEventListener("click", () => void vend(code)));
  // The pack stays in the tray until the next one drops, so it can be opened again from there.
  tray.addEventListener("click", () => {
    if (collected) document.dispatchEvent(new CustomEvent("aisle:open", { detail: { code: collected } }));
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
