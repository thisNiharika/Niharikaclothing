// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Generated from spec.json at build time by the factory. Edit spec.json and re-run `render-site`, not this file.
// Licensed by Spatial Sites. See LICENSE.txt.
import spec from "../spec.json";

export interface Interaction { type: string; target: string; palette?: string; max_particles?: number; range_px?: number; mobile?: string; reduced?: string }
export interface ScrollBinding { type: string; section: string; camera?: string; materials?: string[]; values?: string[] }
export interface CameraPreset { preset: string; params?: Record<string, unknown> }
export interface SequenceAsset { id: string; source: string; driver: "scroll" | "hover" | "pointer-x" | "loop"; dir: string; count?: number; fps?: number; focus_x?: number; text_side?: string; sizes?: { name: string; width: number; height: number }[] }
export interface Chapter { id: string; sequence: string; section: string; pin_vh: number; cut?: "dip" | "none"; lens?: string; lens_radius?: number; beats: { from: number; to: number; at?: number; side?: string }[] }
export interface KitConfig {
  kit: { number: number; slug: string; title: string; niche: string; intent: string };
  subject: { placement: string; size_m?: number; rotation_deg?: number[] };
  engine: { primary: string; secondary?: string; fallback_mobile: string };
  camera: { hero: CameraPreset; scroll: CameraPreset };
  interactions: Interaction[];
  scroll_bindings: ScrollBinding[];
  lighting: { preset: string; post?: string[] };
  assets: { model: string | null; poster: string; env?: string | null; layers?: string[]; frames?: string[]; sequences?: SequenceAsset[] };
  chapters?: Chapter[];
  budget: { decoder?: string };
}

export const config = spec as unknown as KitConfig;
