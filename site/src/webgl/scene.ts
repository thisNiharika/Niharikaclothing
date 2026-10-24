// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { gsap, ScrollTrigger } from "../dom/sections";
import type { KitConfig } from "../config";
import { sampleCameraPath, type Keyframe } from "./camera-path";
import { Burst, trackPointer, hasInteraction } from "./interactions";
import cameraPath from "../reference/camera-path.json";

const LIGHTS: Record<string, { key: [number, number, number, number, number]; rim?: [number, number, number, number, number]; fill?: number; env: number; bg: boolean }> = {
  // [x, y, z, intensity, kelvin approximated as hex below]
  "studio-3pt": { key: [3, 4, 3, 12, 0xfff2e0], rim: [-2, 3.5, -3, 8, 0xe8f0ff], fill: 0.4, env: 0.6, bg: false },
  "showroom-dark": { key: [2.5, 3.5, 3.5, 16, 0xfff4e6], rim: [-3, 3, -3, 12, 0xdfe8ff], fill: 0.05, env: 0.15, bg: true },
  "daylight-soft": { key: [5, 8, 5, 4, 0xffffff], fill: 0.8, env: 1.0, bg: false },
  noir: { key: [3, 4, 2, 20, 0xffe3c2], rim: [-2, 2.5, -3, 6, 0xe0e6ff], fill: 0.02, env: 0.05, bg: true },
  clinical: { key: [2, 4, 3, 10, 0xffffff], fill: 1.0, env: 1.2, bg: false },
};

/** Reflections for dark presets without a baked environment: black walls, one large soft key panel, a rim strip and a low fill,
 *  so glass and metal show a single studio highlight instead of a bright room. */
function studioEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial({ color: 0x030304, side: THREE.BackSide })));
  const panel = (w: number, h: number, pos: [number, number, number], lum: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(lum, lum, lum), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(12, 7, [5, 6, 4], 9);
  panel(12, 1, [-6, 4, -6], 6);
  panel(6, 4, [-6, 1.5, 6], 2);
  return env;
}

export async function startScene(cfg: KitConfig) {
  const canvas = document.getElementById("webgl") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  const dpr = Math.min(window.devicePixelRatio, matchMedia("(max-width: 767px)").matches ? 1.0 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 200);
  const heroParams = (cfg.camera.hero.params ?? {}) as { position?: number[]; target?: number[]; fov?: number; speed?: number; tilt_deg?: number };
  const heroPos = new THREE.Vector3(...((heroParams.position as [number, number, number]) ?? [3, 1, 4.5]));
  const heroTarget = new THREE.Vector3(...((heroParams.target as [number, number, number]) ?? [0, 0.4, 0]));
  camera.fov = heroParams.fov ?? 32;
  camera.position.copy(heroPos);
  camera.lookAt(heroTarget);

  // Lights from preset
  const L = LIGHTS[cfg.lighting.preset] ?? LIGHTS["studio-3pt"]!;
  const key = new THREE.SpotLight(L.key[4], L.key[3], 0, Math.PI / 5, 0.6, 1.2);
  key.position.set(L.key[0], L.key[1], L.key[2]);
  // Dark presets ground the subject with a real shadow from the key light; light presets keep the flat look.
  key.castShadow = L.bg;
  if (L.bg) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
  }
  scene.add(key);
  if (L.rim) {
    const rim = new THREE.SpotLight(L.rim[4], L.rim[3], 0, Math.PI / 5, 0.7, 1.2);
    rim.position.set(L.rim[0], L.rim[1], L.rim[2]);
    scene.add(rim);
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202024, L.fill ?? 0.3));

  // Environment: HDR if shipped, else a neutral room.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envOk = cfg.assets.env ? await fetch(cfg.assets.env, { method: "HEAD" }).then((r) => r.ok && /octet-stream|hdr|radiance/i.test(r.headers.get("content-type") ?? "octet-stream")).catch(() => false) : false;
  if (cfg.assets.env && envOk) {
    try {
      const hdr = await new RGBELoader().loadAsync(cfg.assets.env);
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
    } catch {
      scene.environment = pmrem.fromScene(L.bg ? studioEnvironment() : new RoomEnvironment(), 0.04).texture;
    }
  } else {
    scene.environment = pmrem.fromScene(L.bg ? studioEnvironment() : new RoomEnvironment(), 0.04).texture;
  }
  scene.environmentIntensity = L.env;

  // Model
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("./decoders/draco/");
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const ktx2 = new KTX2Loader().setTranscoderPath("./decoders/basis/").detectSupport(renderer);
  loader.setKTX2Loader(ktx2);

  const gltf = await loader.loadAsync(cfg.assets.model!);
  const root = gltf.scene;
  const rot = cfg.subject.rotation_deg ?? [0, 0, 0];
  root.rotation.set(THREE.MathUtils.degToRad(rot[0] ?? 0), THREE.MathUtils.degToRad(rot[1] ?? 0), THREE.MathUtils.degToRad(rot[2] ?? 0));
  scene.add(root);

  const materials = new Map<string, THREE.MeshStandardMaterial[]>();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const m = o as THREE.Mesh;
      meshes.push(m);
      // Everything receives; glass does not cast, since a transmissive element would throw an opaque shadow.
      m.receiveShadow = true;
      const first = Array.isArray(m.material) ? m.material[0] : m.material;
      m.castShadow = !((first as THREE.MeshPhysicalMaterial).transmission > 0) && !/^ENV_/.test(m.name);
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const name = (mat.name || "").toLowerCase();
        // Coated optical glass: a thin film gives the magenta and green sheen of a real lens coating.
        const phys = mat as THREE.MeshPhysicalMaterial;
        if (name.includes("coated") && phys.transmission > 0) { phys.iridescence = 0.7; phys.iridescenceIOR = 1.32; phys.iridescenceThicknessRange = [220, 420]; }
        if (!materials.has(name)) materials.set(name, []);
        materials.get(name)!.push(mat as THREE.MeshStandardMaterial);
      }
    }
  });

  // Material swap from swatches
  window.addEventListener("kit:material", (e) => {
    const { material, color } = (e as CustomEvent<{ material: string; color: string }>).detail;
    const targets = materials.get(material) ?? [];
    for (const m of targets) {
      const c = new THREE.Color(color);
      gsap.to(m.color, { r: c.r, g: c.g, b: c.b, duration: 0.6, ease: "power2.out" });
    }
  });

  // Exploded view parts
  const parts = meshes.filter((m) => /^part_/.test(m.name)).map((m) => ({ mesh: m, base: m.position.clone(), vec: new THREE.Vector3(...(((m.userData.explode_vector as number[]) ?? [0, 0.2, 0]) as [number, number, number])) }));
  // Parts with a scrub_vector move along it during the pinned hero scroll (iris blades opening, doors, lids).
  const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a))); return t * t * (3 - 2 * t); };
  const scrubParts = meshes.filter((m) => Array.isArray(m.userData.scrub_vector)).map((m) => ({ mesh: m, base: m.position.clone(), vec: new THREE.Vector3(...((m.userData.scrub_vector as number[]) as [number, number, number])), range: ((m.userData.scrub_range as number[] | undefined) ?? [0.4, 0.7]) as [number, number] }));
  // Parts with a scrub_spin [axis x, y, z, degrees] turn about that local axis over the same progress (iris blades pivoting, a dial turning).
  const spinQ = new THREE.Quaternion();
  const spinParts = meshes.filter((m) => Array.isArray(m.userData.scrub_spin)).map((m) => {
    const [x, y, z, deg] = m.userData.scrub_spin as number[];
    return { mesh: m, base: m.quaternion.clone(), axis: new THREE.Vector3(x, y, z).normalize(), rad: THREE.MathUtils.degToRad(deg ?? 0), range: ((m.userData.scrub_range as number[] | undefined) ?? [0.4, 0.7]) as [number, number] };
  });

  // Scroll camera scrub
  const kfs = (cameraPath as unknown as { keyframes: Keyframe[]; easing?: string }).keyframes;
  const easing = (cameraPath as { easing?: string }).easing ?? "smoothstep";
  const pin = cfg.scroll_bindings.find((b) => b.type === "pin-and-scrub");
  const scrubPos = heroPos.clone();
  const scrubTarget = heroTarget.clone();
  let scrollP = 0;
  const heroEl = document.querySelector<HTMLElement>("section.hero");
  // Recording steps the scroll one frame at a time, so the camera follows the path exactly instead of easing towards it.
  const recording = new URLSearchParams(location.search).has("record");
  const follow = recording ? 1 : 0.12;
  if (pin && heroEl) {
    const vh = Number((cfg.camera.scroll.params ?? {}).pin_vh ?? 200);
    heroEl.style.minHeight = `${vh}vh`;
    ScrollTrigger.create({ trigger: heroEl, start: "top top", end: "bottom bottom", scrub: recording ? true : 0.4, onUpdate: (s) => (scrollP = s.progress) });
    // The hero grew after the page's own triggers measured it (the beats fade by its height), so measure everything again.
    ScrollTrigger.refresh();
  }
  const swap = cfg.scroll_bindings.find((b) => b.type === "material-swap");
  if (swap?.values?.length && swap.materials?.length) {
    const target = document.getElementById(swap.section);
    if (target) {
      ScrollTrigger.create({
        trigger: target, start: "top 70%", end: "bottom 30%", scrub: true,
        onUpdate: (s) => {
          const idx = Math.min(swap.values!.length - 1, Math.floor(s.progress * swap.values!.length));
          const c = new THREE.Color(swap.values![idx]!);
          for (const name of swap.materials!) for (const m of materials.get(name) ?? []) m.color.lerp(c, 0.2);
        },
      });
    }
  }
  const explode = cfg.scroll_bindings.find((b) => b.type === "exploded-view");
  if (explode && parts.length) {
    const target = document.getElementById(explode.section);
    if (target) ScrollTrigger.create({ trigger: target, start: "top 80%", end: "bottom 40%", scrub: 0.5, onUpdate: (s) => parts.forEach((p) => p.mesh.position.copy(p.base).addScaledVector(p.vec, s.progress)) });
  }

  // Pointer interactions
  const pointer = trackPointer(document.body);
  const ray = new THREE.Raycaster();
  const burstCfg = hasInteraction(cfg, "hover-burst");
  const burst = burstCfg ? new Burst(scene, Math.min(burstCfg.max_particles ?? 400, matchMedia("(max-width: 767px)").matches ? 120 : 400), burstCfg.palette ?? "dust") : null;
  const glow = hasInteraction(cfg, "hover-glow");
  const drag = hasInteraction(cfg, "drag-orbit");
  const parallax = hasInteraction(cfg, "pointer-parallax") || cfg.camera.hero.preset === "pointer-parallax";
  // hover-spin-zoom: the whole subject, or every object whose name starts with the target prefix (a shelf of cans).
  const spinCfg = hasInteraction(cfg, "hover-spin-zoom");
  const spinTargets = spinCfg
    ? (spinCfg.target === "subject" || !spinCfg.target ? [root as THREE.Object3D] : meshes.filter((m) => m.name.startsWith(spinCfg.target)))
        .map((o) => ({ obj: o, baseY: o.rotation.y, baseScale: o.scale.clone(), amount: 0 }))
    : [];
  const spinMeshes = spinCfg && spinTargets[0]?.obj !== root ? (spinTargets.map((t) => t.obj) as THREE.Mesh[]) : meshes;
  let dragAngle = 0, dragVel = 0, lastEmit = 0;
  const speed = heroParams.speed ?? 0.05;

  const clock = new THREE.Clock();
  const tmpPos = new THREE.Vector3(), tmpTarget = new THREE.Vector3();
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    // Camera: hero orbit blended into scroll path
    if (scrollP <= 0.001) {
      if (cfg.camera.hero.preset === "orbit-slow" && !pointer.down) {
        const a = t * speed;
        tmpPos.set(heroPos.x * Math.cos(a) - heroPos.z * Math.sin(a), heroPos.y, heroPos.x * Math.sin(a) + heroPos.z * Math.cos(a));
      } else tmpPos.copy(heroPos);
      tmpTarget.copy(heroTarget);
      if (parallax && pointer.active) { tmpPos.x += pointer.ndc.x * 0.15; tmpPos.y += pointer.ndc.y * 0.08; }
      camera.fov += ((heroParams.fov ?? 32) - camera.fov) * 0.1;
    } else {
      const fov = sampleCameraPath(kfs, scrollP, easing, tmpPos, tmpTarget);
      camera.fov += (fov - camera.fov) * (recording ? 1 : 0.1);
    }
    camera.position.lerp(tmpPos, follow);
    for (const p of scrubParts) p.mesh.position.copy(p.base).addScaledVector(p.vec, smoothstep(p.range[0], p.range[1], scrollP));
    for (const p of spinParts) p.mesh.quaternion.copy(p.base).multiply(spinQ.setFromAxisAngle(p.axis, p.rad * smoothstep(p.range[0], p.range[1], scrollP)));
    scrubPos.copy(camera.position);
    scrubTarget.lerp(tmpTarget, follow);
    camera.lookAt(scrubTarget);
    camera.updateProjectionMatrix();

    if (drag) {
      if (pointer.down) { dragVel = pointer.dx * 0.004; pointer.dx = 0; }
      dragVel *= 0.92;
      dragAngle += dragVel;
      root.rotation.y = THREE.MathUtils.degToRad(rot[1] ?? 0) + dragAngle;
    }

    let hit: THREE.Intersection | null = null;
    if ((burst || glow || spinTargets.length) && pointer.active) {
      ray.setFromCamera(pointer.ndc, camera);
      const hits = ray.intersectObjects(spinTargets.length && !(burst || glow) ? spinMeshes : meshes, false);
      hit = hits[0] ?? null;
      if (hit) {
        const h = hit;
        if (burst && t - lastEmit > 0.05) { burst.emit(h.point, h.face?.normal.clone().transformDirection(h.object.matrixWorld) ?? new THREE.Vector3(0, 1, 0), 12, (cfg.subject.size_m ?? 2) / 3); lastEmit = t; }
        if (glow) for (const m of meshes) { const mat = m.material as THREE.MeshStandardMaterial; if (mat.emissive) mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity ?? 0, m === h.object ? 0.25 : 0, 0.15); }
      }
    }
    if (spinTargets.length) {
      // A quarter turn and a small scale-up while hovered, eased both ways. Drag orbit owns the root's rotation when both are on.
      const k = 1 - Math.exp(-dt * 7);
      for (const sp of spinTargets) {
        const hovered = !!hit && (sp.obj === root || hit.object === sp.obj);
        sp.amount += ((hovered ? 1 : 0) - sp.amount) * k;
        if (!(drag && sp.obj === root)) sp.obj.rotation.y = sp.baseY + sp.amount * Math.PI * 0.5;
        sp.obj.scale.copy(sp.baseScale).multiplyScalar(1 + 0.12 * sp.amount);
      }
    }
    burst?.update(dt);
    renderer.render(scene, camera);
    if (!recording) requestAnimationFrame(frame);
  }
  window.addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });
  document.addEventListener("visibilitychange", () => (document.hidden ? clock.stop() : clock.start()));

  renderer.render(scene, camera);
  document.body.classList.add("canvas-ready");
  // Recording draws on demand: the recorder sets the scroll, lets the scroll driver tick, then asks for exactly one frame.
  // Software GL on a runner takes seconds per draw, so a free-running loop would draw several times per captured frame.
  if (recording) (window as unknown as { __render: () => void }).__render = frame;
  frame();
  (window as unknown as { __kit: unknown }).__kit = { renderer, scene, camera, drawCalls: () => renderer.info.render.calls, triangles: () => renderer.info.render.triangles };
}
