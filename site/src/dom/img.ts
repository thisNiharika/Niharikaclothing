// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// The one way a page loads a picture it will draw into a canvas or hand to WebGL. A live demo runs in a sandbox with
// an opaque origin of its own, so every file it loads is cross-origin: a picture fetched without CORS taints the canvas
// it is drawn on, reading its pixels throws, and WebGL refuses it (a black texture, or a scene that falls back flat).
// Asking for it with crossOrigin "anonymous" uses the Access-Control-Allow-Origin the demo's files are served with, and
// keeps the canvas clean. three's TextureLoader already does this; anything else goes through here.

/** A picture loaded with CORS and decoded, or null if it is missing or broken. */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.src = src;
  return img.decode().then(() => img, () => null);
}
