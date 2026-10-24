// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// A drinks can in scene units, shared by the kits that build one (pour, unwrap): radius 1, the label wrapping once
// round, so its height follows from its 2.6 to 1 shape, drawn a little taller (1.12) towards a real can's proportions.

import * as THREE from "three";

export const R = 1;
export const BAND = ((2 * Math.PI * R) / 2.6) * 1.12;
export const FOOT = 0.24;
export const TOP = FOOT + BAND;
export const HEIGHT = TOP + 0.46;

/** The aluminium: the foot and dome below the label, and the shoulder, neck, rim and recessed lid above it. */
export function makeShell() {
  const pts: [number, number][] = [
    [0, 0.12], [0.36, 0.1], [0.62, 0.035], [0.72, 0], [0.82, 0.0], [0.9, 0.04], [0.97, 0.13], [R, FOOT],
  ];
  const top: [number, number][] = [
    [R, TOP], [0.995, TOP + 0.08], [0.95, TOP + 0.2], [0.88, TOP + 0.3], [0.845, TOP + 0.36], [0.85, TOP + 0.4],
    [0.865, TOP + 0.44], [0.85, TOP + 0.46], [0.82, TOP + 0.45], [0.8, TOP + 0.41], [0.78, TOP + 0.4], [0.5, TOP + 0.395], [0, TOP + 0.4],
  ];
  // Two lathes rather than one merged shape, so each keeps the lathe's own smooth normals.
  return {
    lower: new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 96),
    upper: new THREE.LatheGeometry(top.map(([x, y]) => new THREE.Vector2(x, y)), 96),
  };
}

/** The ring pull: a flat rounded tab with a finger hole and a rivet hole, lying on the lid. */
export function makeTab() {
  const s = new THREE.Shape();
  const w = 0.2, l = 0.52, r = 0.2;
  s.moveTo(-w, -l / 2 + r);
  s.absarc(0, -l / 2 + r, w, Math.PI, 0, false);
  s.lineTo(w, l / 2 - r);
  s.absarc(0, l / 2 - r, w, 0, Math.PI, false);
  s.lineTo(-w, -l / 2 + r);
  const finger = new THREE.Path();
  finger.absellipse(0, 0.07, 0.12, 0.1, 0, Math.PI * 2, true, 0);
  const rivet = new THREE.Path();
  rivet.absarc(0, -0.16, 0.04, 0, Math.PI * 2, true);
  s.holes.push(finger, rivet);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 24 });
  g.rotateX(-Math.PI / 2);
  return g;
}

