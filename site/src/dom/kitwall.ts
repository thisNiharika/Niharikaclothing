// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Kitwall: hover or focus turns a card to the piece's back (CSS does that); a tap or a press turns it and leaves it
// turned, so a touch screen can see the back too.

export function initKitwall() {
  document.querySelectorAll<HTMLButtonElement>("[data-kitwall] .kw-turn").forEach((b) => {
    b.addEventListener("click", () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true"));
  });
}
