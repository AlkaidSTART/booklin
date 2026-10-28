import { Suspense, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { ContactShadows, Environment, useTexture } from '@react-three/drei';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import {
  CloudSoulPanel,
  PhoneScanner,
  QrCoverMark,
  ShelfBooks,
  ShelfSelection,
  shelfPresence,
  useShelfPick,
} from './ShelfStage';
import type { ShelfPick } from './ShelfStage';

export type StageInteractionState = {
  activeNode: string | null;
  activeEdition: 'standard' | 'pro' | 'enterprise';
};

type Vec3 = readonly [number, number, number];

type BookKey = {
  position: Vec3;
  rotation: Vec3;
  /** Page-block openness: 0 closed, 1 lying flat on the desk. */
  open: number;
};

type CameraKey = {
  position: Vec3;
  target: Vec3;
  mobileTargetX: number;
  mobileTargetY: number;
  fov?: number;
};

type PointerRef = MutableRefObject<{ x: number; y: number }>;
type InteractionRef = MutableRefObject<StageInteractionState>;

// Deployment slipcase. The case is 160 x 220 x 38 mm with an open front; the
// book boards are 148 x 210 x 30 mm, so the fit is half a millimetre per side
// once the liner is counted. The stow therefore happens in the case's own
// frame: the book turns square first, then travels along the case's front axis
// onto the tray. Blending position and yaw at the same time scrapes the walls.
const SLIPCASE_POSITION: Vec3 = [-0.128, 0.763, -0.008];
const SLIPCASE_ROTATION: Vec3 = [0.02, -0.32, 0.006];
const SLIPCASE_X: Record<StageInteractionState['activeEdition'], number> = {
  standard: -0.155,
  pro: -0.128,
  enterprise: -0.14,
};
// Case-local anchors in metres (full-size case). The tray floor is 4.5 mm above
// the case base and the front face is at z = +19 mm; the book's board adds
// 15 mm, so the mouth anchor leaves 6 mm of air in front of the opening.
const SLIPCASE_TRAY_SEAT: Vec3 = [0, 0.0045, 0];
const SLIPCASE_TRAY_MOUTH: Vec3 = [0, 0.0045, 0.04];
// Front flap hinge: its bottom edge, mid-thickness, in the asset's millimetres.
// Opening it forward onto the desk keeps the whole panel outside the book's
// path (the seated cover sits 4 mm behind the closed flap).
const SLIPCASE_FLAP_HINGE_Z = 19.75;

// Stow beats in phase units (phase 8 = deployment section pinned).
const STOW_START = 7.3;
const STOW_ALIGN_END = 7.62;
const STOW_SLIDE_START = 7.7;
const STOW_SEAT_END = 7.9;
const SLIPCASE_IN_START = 7.52;
const SLIPCASE_IN_END = 7.68;
const SLIPCASE_FLAP_CLOSE_START = 7.9;
const SLIPCASE_FLAP_CLOSE_END = 8;

// Unified desk coordinate space across all 9 sections (prologue -> epilogue B)
// so the object never teleports off the oak desk.
const BOOK_KEYS: BookKey[] = [
  // Prologue — closed, standing on the oak desk, turned toward the reader.
  {
    position: [0, 0.765, 0],
    rotation: [0.035, -0.28, 0.012],
    open: 0,
  },
  // 00 Shelf — closed, sleeping on the shelf (asset C1 pending: staged on the desk, single-book framing).
  {
    position: [0, 0.765, 0],
    rotation: [0.05, -0.34, 0.01],
    open: 0,
  },
  // 01 Carry — closed, carried home with a slight lift.
  {
    position: [0, 0.772, 0.01],
    rotation: [0.03, -0.18, 0.006],
    open: 0,
  },
  // 02 Interaction — laid 180° flat on the desk, ribbon sweeping onto Page 042.
  {
    position: [0, 0.772, 0.015],
    rotation: [-Math.PI / 2, 0.06, 0],
    open: 1,
  },
  // 03 Binding — flat on the desk, lifted slightly as the Page 042 hologram rises above it.
  {
    position: [0.01, 0.785, 0.01],
    rotation: [-Math.PI / 2, 0.14, 0],
    open: 1,
  },
  // 04 Loop — flat on the night desk, reading posture (asset C4 pending).
  {
    position: [0, 0.778, 0.012],
    rotation: [-Math.PI / 2, 0.09, 0],
    open: 1,
  },
  // 05 Return — closed, back on the shelf; mirrors the 00 shelf composition (ring closure).
  {
    position: [0, 0.765, 0],
    rotation: [0.05, -0.34, 0.01],
    open: 0,
  },
  // Epilogue A Benchmark — closed, seated on the pedestal's felt pad at a 45° hero angle.
  {
    position: [0.01, 0.8385, 0],
    rotation: [0.04, 0.58, 0.01],
    open: 0,
  },
  // Epilogue B Deployment — square to the slipcase at its mouth. The stow
  // itself (mouth -> tray -> seated) is driven in the case's own frame by
  // BookRig, so this key only anchors the end of the generic timeline.
  {
    position: [-0.1406, 0.7676, 0.03],
    rotation: SLIPCASE_ROTATION,
    open: 0,
  },
];

const CAMERA_KEYS: CameraKey[] = [
  // Prologue
  {
    position: [-0.38, 1.05, 0.72],
    target: [-0.18, 0.86, 0],
    mobileTargetX: 0,
    mobileTargetY: 0.76,
  },
  // 00 Shelf — level with the case, close enough that both tiers fill the
  //   frame; the oak desk stays a foreground strip instead of the subject.
  {
    position: [-0.24, 1.32, 0.95],
    target: [-0.08, 1.22, -0.5],
    mobileTargetX: 0,
    mobileTargetY: 1.08,
    fov: 44,
  },
  // 01 Carry — wider, following the book home
  {
    position: [-0.4, 1.07, 0.78],
    target: [-0.19, 0.87, 0],
    mobileTargetX: 0,
    mobileTargetY: 0.77,
  },
  // 02 Interaction — higher top-down angle to showcase the 180° spread & ribbon arc
  {
    position: [-0.36, 1.32, 0.55],
    target: [-0.21, 0.79, 0.01],
    mobileTargetX: -0.1,
    mobileTargetY: 0.71,
  },
  // 03 Binding — framed to show both the open Page 042 and the 3D node constellation above it
  {
    position: [-0.32, 1.12, 0.68],
    target: [-0.17, 0.88, 0],
    mobileTargetX: -0.05,
    mobileTargetY: 0.8,
  },
  // 04 Loop — closer, intimate night framing
  {
    position: [-0.34, 1.2, 0.6],
    target: [-0.2, 0.82, 0.005],
    mobileTargetX: -0.08,
    mobileTargetY: 0.72,
  },
  // 05 Return — mirrors the 00 shelf framing (ring closure)
  {
    position: [-0.3, 1.0, 0.6],
    target: [-0.14, 0.85, 0],
    mobileTargetX: 0,
    mobileTargetY: 0.75,
  },
  // Epilogue A Benchmark — framed for the wide comparison table on the left and pedestal on the right
  {
    position: [-0.34, 1.08, 0.78],
    target: [-0.2, 0.88, 0],
    mobileTargetX: 0,
    mobileTargetY: 0.78,
  },
  // Epilogue B Deployment — framed on the desk slipcase & book assembly
  {
    position: [-0.36, 1.04, 0.76],
    target: [-0.19, 0.86, 0],
    mobileTargetX: -0.02,
    mobileTargetY: 0.76,
  },
];

const PHASE_COUNT = BOOK_KEYS.length - 1;

// Display pedestal: 120 mm tall at 0.62 scale, seated on the desk at 0.761 m.
// The benchmark book rests on its top, so the deployment beat retracts the
// whole plinth by exactly this height and leaves the book on the desk.
const PEDESTAL_HEIGHT = 0.0744;

type GraphNodeSpec = {
  id: string;
  type: string;
  pos: Vec3;
  color: string;
  size: number;
};

// 3D coordinates above the open book (Page 042 sits around [0.035, 0.785, 0.02])
const GRAPH_NODES_3D: GraphNodeSpec[] = [
  { id: 'page', type: 'page', pos: [0.032, 0.845, 0.025], color: '#e8dcc4', size: 0.011 },
  { id: 'concept', type: 'concept', pos: [0.105, 0.935, -0.035], color: '#c8a96d', size: 0.0095 },
  { id: 'citation', type: 'citation', pos: [0.165, 0.895, 0.02], color: '#d27c65', size: 0.0075 },
  { id: 'lecture', type: 'video', pos: [0.115, 0.855, 0.095], color: '#e0b872', size: 0.009 },
  { id: 'discussion', type: 'discussion', pos: [0.03, 0.83, 0.125], color: '#b9af9e', size: 0.0075 },
  { id: 'glossary', type: 'glossary', pos: [-0.055, 0.86, 0.09], color: '#a78750', size: 0.0072 },
  { id: 'author', type: 'author', pos: [-0.105, 0.9, 0.015], color: '#f3ead8', size: 0.0075 },
  { id: 'related', type: 'chapter', pos: [-0.055, 0.94, -0.045], color: '#c8a96d', size: 0.008 },
  { id: 'ai', type: 'ai', pos: [0.032, 0.985, -0.02], color: '#d27c65', size: 0.01 },
];

const GRAPH_LINKS_3D: Array<readonly [string, string]> = [
  ['page', 'concept'],
  ['page', 'lecture'],
  ['page', 'discussion'],
  ['page', 'glossary'],
  ['page', 'author'],
  ['page', 'related'],
  ['page', 'ai'],
  ['concept', 'citation'],
  ['concept', 'related'],
  ['lecture', 'ai'],
  ['discussion', 'glossary'],
];

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function timeline(progress: number) {
  const phase = clamp01(progress) * PHASE_COUNT;
  const index = Math.min(PHASE_COUNT - 1, Math.floor(phase));
  const local = phase - index;
  // Smooth narrative pacing: 42% dwell for reading, 58% continuous transition
  const t = smoothstep((local - 0.42) / 0.58);
  return { phase, index, local, t };
}

function band(value: number, center: number, halfWidth: number) {
  return clamp01(1 - Math.abs(value - center) / halfWidth);
}

/**
 * Scroll-linked light envelope: rises over [inStart, inEnd], holds, then falls
 * over [outStart, outEnd]. Both shoulders ease with smoothstep, so the value
 * and its derivative are continuous at every boundary — a light can never
 * "switch" on a threshold.
 */
function lightEnvelope(
  value: number,
  inStart: number,
  inEnd: number,
  outStart: number,
  outEnd: number,
) {
  const rise = smoothstep((value - inStart) / Math.max(0.001, inEnd - inStart));
  const fall = 1 - smoothstep((value - outStart) / Math.max(0.001, outEnd - outStart));
  return Math.min(rise, fall);
}

/* ------------------------------------------------------------------
   Chapter 00 — shelf take-down / scan / uplink beat
   ------------------------------------------------------------------ */

const SHELF_RETURN_START = 0.5;
const SHELF_RETURN_END = 0.82;
const SHELF_SLIDE_END = 1.3;
const SHELF_PICK_END = 1.56;
const SHELF_BEAT_END = 2.3;

type ShelfCameraPose = {
  position: Vec3;
  target: Vec3;
  fov: number;
};

type BookPose = {
  position: Vec3;
  rotation: Vec3;
};

function mixVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Writes a case-local anchor into world space, expanded by the case scale. */
function readCaseAnchor(
  out: THREE.Vector3,
  caseGroup: THREE.Object3D,
  caseScale: number,
  local: Vec3,
) {
  return out
    .set(local[0] * caseScale, local[1] * caseScale, local[2] * caseScale)
    .applyQuaternion(caseGroup.quaternion)
    .add(caseGroup.position);
}

function mixCameraPose(a: ShelfCameraPose, b: ShelfCameraPose, t: number): ShelfCameraPose {
  return {
    position: mixVec3(a.position, b.position, t),
    target: mixVec3(a.target, b.target, t),
    fov: lerp(a.fov, b.fov, t),
  };
}

function mixBookPose(a: BookPose, b: BookPose, t: number): BookPose {
  return {
    position: mixVec3(a.position, b.position, t),
    rotation: mixVec3(a.rotation, b.rotation, t),
  };
}

function keyBookPose(index: number, t: number): BookPose {
  const a = BOOK_KEYS[index];
  const b = BOOK_KEYS[Math.min(index + 1, BOOK_KEYS.length - 1)];
  return {
    position: mixVec3(a.position, b.position, t),
    rotation: mixVec3(a.rotation, b.rotation, t),
  };
}

function genericBookPose(phase: number): BookPose {
  // `phase` is already in timeline units (0…PHASE_COUNT); timeline expects
  // normalised progress and does its own scaling.
  const { index, t } = timeline(phase / PHASE_COUNT);
  return keyBookPose(index, t);
}

function cameraKeyPose(index: number, t: number, mobile: boolean): ShelfCameraPose {
  const a = CAMERA_KEYS[index];
  const b = CAMERA_KEYS[Math.min(index + 1, CAMERA_KEYS.length - 1)];
  const target: Vec3 = mobile
    ? [lerp(a.mobileTargetX, b.mobileTargetX, t), lerp(a.mobileTargetY, b.mobileTargetY, t), lerp(a.target[2], b.target[2], t)]
    : mixVec3(a.target, b.target, t);
  return {
    position: mixVec3(a.position, b.position, t),
    target,
    fov: lerp(a.fov ?? 32, b.fov ?? 32, t),
  };
}

function genericCameraPose(phase: number, mobile: boolean): ShelfCameraPose {
  const { index, t } = timeline(phase / PHASE_COUNT);
  return cameraKeyPose(index, t, mobile);
}

const SHELF_WIDE_CAMERA: ShelfCameraPose = {
  position: [-0.24, 1.32, 0.95],
  target: [-0.08, 1.22, -0.5],
  fov: 44,
};

const PRESENT_CAMERA: ShelfCameraPose = {
  position: [-0.34, 1.03, 0.72],
  target: [-0.16, 0.865, 0.02],
  fov: 34,
};

const QR_CAMERA: ShelfCameraPose = {
  position: [-0.23, 0.93, 0.51],
  target: [-0.035, 0.865, 0.03],
  fov: 31,
};

const SCAN_CAMERA: ShelfCameraPose = {
  position: [-0.12, 0.97, 0.84],
  target: [0.09, 0.925, 0.05],
  fov: 40,
};

function shelfCameraPose(phase: number, mobile: boolean): ShelfCameraPose | null {
  if (phase < 0.34 || phase >= SHELF_BEAT_END) return null;

  if (phase < 0.88) {
    const k = smoothstep((phase - 0.34) / (0.88 - 0.34));
    return mixCameraPose(cameraKeyPose(0, 0, mobile), SHELF_WIDE_CAMERA, k);
  }

  if (phase < 1.12) return SHELF_WIDE_CAMERA;

  if (phase < SHELF_PICK_END) {
    const t = smoothstep((phase - 1.12) / (SHELF_PICK_END - 1.12));
    return mixCameraPose(SHELF_WIDE_CAMERA, PRESENT_CAMERA, t);
  }

  if (phase < 1.72) {
    const t = smoothstep((phase - SHELF_PICK_END) / (1.72 - SHELF_PICK_END));
    return mixCameraPose(PRESENT_CAMERA, QR_CAMERA, t);
  }

  if (phase < 1.9) {
    const t = smoothstep((phase - 1.72) / 0.18);
    return mixCameraPose(QR_CAMERA, SCAN_CAMERA, t);
  }

  if (phase < 2.12) return SCAN_CAMERA;

  const finalPose = cameraKeyPose(2, 0, false);
  const t = smoothstep((phase - 2.12) / (SHELF_BEAT_END - 2.12));
  return mixCameraPose(SCAN_CAMERA, finalPose, t);
}

function shelfBookPose(phase: number, pick: ShelfPick): BookPose | null {
  if (phase < SHELF_RETURN_START || phase >= SHELF_BEAT_END) return null;

  const shelfPose: BookPose = {
    position: [pick.x, 0.824, -1.064],
    rotation: [0.012, Math.PI / 2, 0.008],
  };

  if (phase < SHELF_RETURN_END) {
    const k = smoothstep((phase - SHELF_RETURN_START) / (SHELF_RETURN_END - SHELF_RETURN_START));
    const from = genericBookPose(SHELF_RETURN_START);
    const turn = smoothstep((k - 0.62) / 0.26);
    return {
      position: [
        lerp(from.position[0], shelfPose.position[0], k),
        lerp(from.position[1], shelfPose.position[1], k) + Math.sin(Math.PI * k) * 0.12,
        lerp(from.position[2], shelfPose.position[2], k),
      ],
      rotation: mixVec3(from.rotation, shelfPose.rotation, turn),
    };
  }

  if (phase < 1.12) return shelfPose;

  const pulledPose: BookPose = {
    position: [pick.x * 0.72, 0.846, -0.46],
    rotation: [0.055, Math.PI / 2 - 0.42, 0.012],
  };

  if (phase < SHELF_SLIDE_END) {
    const k = smoothstep((phase - 1.12) / (SHELF_SLIDE_END - 1.12));
    const pose = mixBookPose(shelfPose, pulledPose, k);
    return {
      position: [pose.position[0], pose.position[1] + Math.sin(Math.PI * k) * 0.006, pose.position[2]],
      rotation: pose.rotation,
    };
  }

  const finalPose = keyBookPose(2, 0);
  if (phase < SHELF_PICK_END) {
    const k = smoothstep((phase - SHELF_SLIDE_END) / (SHELF_PICK_END - SHELF_SLIDE_END));
    const pose = mixBookPose(pulledPose, finalPose, k);
    return {
      position: [pose.position[0], pose.position[1] + Math.sin(Math.PI * k) * 0.035, pose.position[2]],
      rotation: pose.rotation,
    };
  }

  return finalPose;
}

const loaderCache = new WeakMap<THREE.WebGLRenderer, GLTFLoader>();

function getAssetLoader(gl: THREE.WebGLRenderer) {
  const cached = loaderCache.get(gl);
  if (cached) return cached;

  const gltfLoader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('/decoders/draco/');
  gltfLoader.setDRACOLoader(dracoLoader);

  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath('/decoders/basis/');
  ktx2Loader.detectSupport(gl);
  gltfLoader.setKTX2Loader(ktx2Loader);

  loaderCache.set(gl, gltfLoader);
  return gltfLoader;
}

function useAssetGLTF(url: string) {
  const gl = useThree((state) => state.gl);
  const loader = useMemo(() => getAssetLoader(gl), [gl]);

  return useLoader(loader as never, url) as unknown as {
    scene: THREE.Group;
    scenes: THREE.Group[];
  };
}

function useSceneMaterials(scene: THREE.Object3D) {
  return useMemo(() => {
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        if (material) materials.add(material);
      }
    });
    return [...materials];
  }, [scene]);
}

type MaterialPreset = {
  color?: string;
  roughness?: number;
  metalness?: number;
  envMapIntensity?: number;
  /** Uniform XY normal scale. */
  normalScale?: number;
  emissive?: string;
  emissiveIntensity?: number;
  /** Override only the basecolor slot (used for the current cover atlas). */
  map?: THREE.Texture;
  /** Tile every texture map on the material (used by the oak desk). */
  repeat?: readonly [number, number];
};

/**
 * Applies a declarative material preset to a list of materials.
 * Only keys defined in the preset are written, so nothing is overwritten by accident.
 */
function applyPreset(materials: THREE.Material[], preset: MaterialPreset): void {
  for (const material of materials) {
    const m = material as THREE.MeshStandardMaterial;
    if (!m.isMeshStandardMaterial) continue;

    if (preset.map !== undefined) m.map = preset.map;
    if (preset.color !== undefined) m.color.set(preset.color);
    if (preset.roughness !== undefined) m.roughness = preset.roughness;
    if (preset.metalness !== undefined) m.metalness = preset.metalness;
    if (preset.envMapIntensity !== undefined) m.envMapIntensity = preset.envMapIntensity;
    if (preset.normalScale !== undefined) m.normalScale.set(preset.normalScale, preset.normalScale);
    if (preset.emissive !== undefined) m.emissive.set(preset.emissive);
    if (preset.emissiveIntensity !== undefined) m.emissiveIntensity = preset.emissiveIntensity;
    if (preset.repeat) {
      const maps = [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap];
      for (const texture of maps) {
        if (!texture) continue;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(preset.repeat[0], preset.repeat[1]);
        texture.needsUpdate = true;
      }
    }
    m.needsUpdate = true;
  }
}

function applyNamedPresets(
  materials: THREE.Material[],
  presets: Record<string, MaterialPreset>,
  fallback?: MaterialPreset,
): void {
  for (const material of materials) {
    const preset = presets[material.name] ?? fallback;
    if (preset) applyPreset([material], preset);
  }
}

function useMorphMesh(scene: THREE.Object3D) {
  return useMemo(() => {
    let morphMesh: THREE.Mesh | null = null;
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && Array.isArray(mesh.morphTargetInfluences)) {
        morphMesh = mesh;
      }
    });
    return morphMesh;
  }, [scene]);
}

/* ------------------------------------------------------------------
   Hinge-based page turn

   The GLB ships three morph targets: closed, half-open (~48° fan) and
   flat (180°). Blending them linearly drags every page along a chord,
   so a page freezes mid-air as a rigid board. Instead we rotate the
   moving vertices ourselves around the spine.

   Every leaf hinges on the spine line and sweeps up and over. Leaves
   are ordered front-to-back and fan apart mid-turn, then nest together
   again as the book comes fully flat — the 180° sweep inverts the
   stack, so the last leaf turned always lands on top.

   Only the front half of the block turns. The back half stays where it
   is, so the flat spread shows pages on both sides of the spine
   instead of the whole block flipped onto the left board.
   ------------------------------------------------------------------ */

const PAGE_SPINE_X = -74; // hinge line in the book's local space
const PAGE_FAN = 0.86; // radians the deepest leaf trails at mid-turn
const PAGE_CURL = 0.3; // radians of bend at the free edge, mid-turn
const PAGE_BOUNCE = 0.05; // free-edge lift as the paper settles
const PAGE_TURN_SPLIT = 0.5; // front half of the block turns onto the left board
const PAGE_LEAF_HALF = 2; // half the thickness of one page leaf (mm)
const PAGE_HINGE_RADIUS = 2; // spine fold stays with the board underneath

type PageTurnRig = {
  position: THREE.BufferAttribute;
  normal: THREE.BufferAttribute;
  basePositions: Float32Array;
  baseNormals: Float32Array;
  radius: Float32Array;
  lag: Float32Array;
  bend: Float32Array;
  maxRadius: number;
  lastOpenness: number;
};

function buildPageTurnRig(mesh: THREE.Mesh): PageTurnRig | null {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!position || !normal) return null;

  const positionArray = position.array;
  const normalArray = normal.array;
  if (!(positionArray instanceof Float32Array) || !(normalArray instanceof Float32Array)) {
    return null;
  }

  const count = position.count;
  const radius = new Float32Array(count);
  const lag = new Float32Array(count).fill(-1);
  const bend = new Float32Array(count);
  let maxRadius = 1;
  let frontDepth = -Infinity;
  let backDepth = Infinity;

  for (let i = 0; i < count; i += 1) {
    const x = positionArray[i * 3] - PAGE_SPINE_X;
    const z = positionArray[i * 3 + 2];
    const r = Math.hypot(x, z);
    radius[i] = r;
    if (r > maxRadius) maxRadius = r;
    if (r < PAGE_HINGE_RADIUS) continue;

    if (z > frontDepth) frontDepth = z;
    if (z < backDepth) backDepth = z;
  }

  if (!Number.isFinite(frontDepth) || !Number.isFinite(backDepth)) return null;

  const span = Math.max(1, frontDepth - backDepth);
  for (let i = 0; i < count; i += 1) {
    if (radius[i] < PAGE_HINGE_RADIUS) continue;
    const z = positionArray[i * 3 + 2];
    const nz = normalArray[i * 3 + 2];
    // Both faces of a leaf must land on the same side of the split, so rank
    // each face by its leaf centre instead of its own plane: a +Z face sits
    // on top of its leaf, a -Z face underneath it. Edge faces (normals in
    // the page plane) join the leaf above.
    const nudge = Math.abs(nz) > 0.5 ? -Math.sign(nz) * PAGE_LEAF_HALF : PAGE_LEAF_HALF;
    const depth = clamp01((frontDepth - z - nudge) / span);
    // The spread splits at the middle of the block: the front half (front
    // cover and its leaves) turns over onto the left board while the back
    // half stays put, so both sides of the open book carry pages.
    if (depth >= PAGE_TURN_SPLIT) continue;
    // 0 = front cover (leads the turn), 1 = middle leaf (trails it).
    lag[i] = depth / PAGE_TURN_SPLIT;
    // The cloth board stays stiff; paper curls more the deeper it sits.
    bend[i] = lag[i];
  }

  return {
    position,
    normal,
    basePositions: new Float32Array(positionArray),
    baseNormals: new Float32Array(normalArray),
    radius,
    lag,
    bend,
    maxRadius,
    lastOpenness: -1,
  };
}

function applyPageTurn(rig: PageTurnRig, openness: number) {
  if (Math.abs(openness - rig.lastOpenness) < 0.0002) return;
  rig.lastOpenness = openness;

  const positions = rig.position.array as Float32Array;
  const normals = rig.normal.array as Float32Array;
  const { basePositions, baseNormals, radius, lag, bend, maxRadius } = rig;

  // The turn always lifts the free edge toward +Z: with the book standing
  // that reads as opening toward the reader, and with the book laid flat
  // (+Z up) the leaves sweep over the desk instead of through it.
  const base = Math.PI * smoothstep(openness);
  const envelope = Math.sin(base);
  const settle = clamp01((openness - 0.82) / 0.18);

  for (let i = 0; i < lag.length; i += 1) {
    const page = lag[i];
    if (page < 0) continue;

    const reach = radius[i] / maxRadius;
    // Leaves behind the cover trail through the sweep, then the whole
    // stack closes the fan and lands together at 180°.
    const fan = page * PAGE_FAN * envelope;
    const bounce =
      PAGE_BOUNCE * Math.sin(settle * Math.PI) * (1 - settle) * page * reach * reach;
    const curl = bend[i] * envelope * PAGE_CURL * reach * reach * reach + bounce;
    const phi = base - fan + curl;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);

    const i3 = i * 3;
    const rx = basePositions[i3] - PAGE_SPINE_X;
    const rz = basePositions[i3 + 2];
    positions[i3] = PAGE_SPINE_X + rx * cos - rz * sin;
    positions[i3 + 2] = rx * sin + rz * cos;

    const nx = baseNormals[i3];
    const nz = baseNormals[i3 + 2];
    normals[i3] = nx * cos - nz * sin;
    normals[i3 + 2] = nx * sin + nz * cos;
  }

  rig.position.needsUpdate = true;
  rig.normal.needsUpdate = true;
}

function PageTurnRig({
  mesh,
  progressRef,
}: {
  mesh: THREE.Mesh | null;
  progressRef: MutableRefObject<number>;
}) {
  const rigRef = useRef<PageTurnRig | null>(null);

  useEffect(() => {
    if (!mesh) return;
    const rig = buildPageTurnRig(mesh);
    if (!rig) return;
    mesh.morphTargetInfluences?.fill(0);
    rigRef.current = rig;

    return () => {
      rigRef.current = null;
    };
  }, [mesh]);

  useFrame(() => {
    const rig = rigRef.current;
    if (!rig) return;

    const { index, t } = timeline(progressRef.current);
    const a = BOOK_KEYS[index];
    const b = BOOK_KEYS[Math.min(index + 1, BOOK_KEYS.length - 1)];
    applyPageTurn(rig, lerp(a.open, b.open, t));
  });

  return null;
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onReady, 120);
    return () => window.clearTimeout(timer);
  }, [onReady]);

  return null;
}

function CameraRig({
  progressRef,
  pointerRef,
  reducedMotion,
}: {
  progressRef: MutableRefObject<number>;
  pointerRef: PointerRef;
  reducedMotion: boolean;
}) {
  const { camera, size } = useThree();
  const currentTarget = useRef(new THREE.Vector3(-0.18, 0.86, 0));
  const perspective = camera as THREE.PerspectiveCamera;

  useFrame((_, delta) => {
    const phase = clamp01(progressRef.current) * PHASE_COUNT;
    const mobile = size.width < 760;
    const custom = shelfCameraPose(phase, mobile);
    const pose = custom ?? genericCameraPose(phase, mobile);

    const pointerX = reducedMotion || mobile ? 0 : pointerRef.current.x;
    const pointerY = reducedMotion || mobile ? 0 : pointerRef.current.y;

    const targetX = pose.target[0];
    const targetY = pose.target[1];
    const targetZ = pose.target[2];

    // Narrow desktop windows lose horizontal field of view. Pull the camera
    // back along the view ray so the staged object stays framed instead of
    // being cropped by the right edge. Wide screens keep the authored dolly.
    const aspect = size.width / Math.max(1, size.height);
    const aspectPush = mobile ? 1 : Math.min(1.35, Math.max(1, 1.6 / Math.max(0.9, aspect)));

    const desiredPosition = mobile
      ? new THREE.Vector3(
          targetX + pointerX * 0.018,
          pose.position[1] * 1.08 + pointerY * 0.012,
          pose.position[2] * 1.34,
        )
      : new THREE.Vector3(
          targetX + (pose.position[0] - targetX) * aspectPush + pointerX * 0.018,
          targetY + (pose.position[1] - targetY) * aspectPush + pointerY * 0.012,
          targetZ + (pose.position[2] - targetZ) * aspectPush,
        );

    const desiredTarget = new THREE.Vector3(
      targetX + pointerX * 0.006,
      targetY + pointerY * 0.004,
      targetZ,
    );

    const damping = 1 - Math.exp(-5.5 * delta);
    camera.position.lerp(desiredPosition, damping);
    currentTarget.current.lerp(desiredTarget, damping);
    camera.lookAt(currentTarget.current);

    // Ease the field of view with the same damping as the dolly. Snapping it
    // reads as a zoom punch on every framing change (32 → 44 → 34 → 31 → 40).
    const desiredFov = mobile ? (custom ? pose.fov + 8 : 39) : pose.fov;
    if (perspective.isPerspectiveCamera) {
      const nextFov = THREE.MathUtils.damp(perspective.fov, desiredFov, 5.5, delta);
      if (Math.abs(nextFov - perspective.fov) > 0.001) {
        perspective.fov = nextFov;
        perspective.updateProjectionMatrix();
      }
    }
  });

  return null;
}

// Chapter 02: Haptic page-turn airflow & 280mm bookmark ribbon landing on Page 042
function InteractionArcs({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const ribbonMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#d27c65',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const arcMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#c8a96d',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#d27c65',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );

  const { ribbonGeo, arcGeo1, arcGeo2 } = useMemo(() => {
    // Graceful 280mm bookmark ribbon curve landing on Page 042
    const ribbonCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.07, 0.782, -0.095),
      new THREE.Vector3(-0.015, 0.855, -0.04),
      new THREE.Vector3(0.028, 0.825, 0.025),
      new THREE.Vector3(0.042, 0.779, 0.055),
    ]);
    const rGeo = new THREE.BufferGeometry().setFromPoints(ribbonCurve.getPoints(48));

    // Page-flip trajectory arcs from left spread to right spread (Page 042)
    const flipCurve1 = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.068, 0.78, -0.03),
      new THREE.Vector3(0.0, 0.845, -0.03),
      new THREE.Vector3(0.065, 0.78, -0.03),
    );
    const aGeo1 = new THREE.BufferGeometry().setFromPoints(flipCurve1.getPoints(36));

    const flipCurve2 = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.068, 0.78, 0.035),
      new THREE.Vector3(0.0, 0.83, 0.035),
      new THREE.Vector3(0.065, 0.78, 0.035),
    );
    const aGeo2 = new THREE.BufferGeometry().setFromPoints(flipCurve2.getPoints(36));

    return { ribbonGeo: rGeo, arcGeo1: aGeo1, arcGeo2: aGeo2 };
  }, []);

  useEffect(() => {
    return () => {
      ribbonGeo.dispose();
      arcGeo1.dispose();
      arcGeo2.dispose();
      ribbonMaterial.dispose();
      arcMaterial.dispose();
      ringMaterial.dispose();
    };
  }, [ribbonGeo, arcGeo1, arcGeo2, ribbonMaterial, arcMaterial, ringMaterial]);

  useFrame((_, delta) => {
    const { phase } = timeline(progressRef.current);
    const active = band(phase, 3.15, 0.68);
    ribbonMaterial.opacity = THREE.MathUtils.damp(ribbonMaterial.opacity, active * 0.9, 6, delta);
    arcMaterial.opacity = THREE.MathUtils.damp(arcMaterial.opacity, active * 0.48, 6, delta);
    ringMaterial.opacity = THREE.MathUtils.damp(ringMaterial.opacity, active * 0.75, 6, delta);

    if (groupRef.current) {
      groupRef.current.visible = ribbonMaterial.opacity > 0.01;
    }
    if (ringRef.current) {
      const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.12;
      ringRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <line geometry={ribbonGeo as never} material={ribbonMaterial as never} />
      <line geometry={arcGeo1 as never} material={arcMaterial as never} />
      <line geometry={arcGeo2 as never} material={arcMaterial as never} />
      <mesh ref={ringRef} position={[0.042, 0.779, 0.055]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.011, 0.014, 32]} />
        <primitive object={ringMaterial} attach="material" />
      </mesh>
    </group>
  );
}

// Chapter 03 binding (and epilogue B Enterprise mode): True 3D Knowledge Graph rising from Page 042
function NeuralGraph3D({
  progressRef,
  interactionRef,
}: {
  progressRef: MutableRefObject<number>;
  interactionRef: InteractionRef;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const nodeMeshesRef = useRef<Array<THREE.Mesh | null>>([]);
  const haloMeshesRef = useRef<Array<THREE.Mesh | null>>([]);
  const pointsMaterialRef = useRef<THREE.PointsMaterial>(null);

  const nodeMap = useMemo(() => new Map(GRAPH_NODES_3D.map((n) => [n.id, n])), []);

  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 20, 20), []);
  const ringGeo = useMemo(() => new THREE.RingGeometry(1.45, 1.72, 32), []);

  const nodeMaterials = useMemo(
    () =>
      GRAPH_NODES_3D.map(
        (node) =>
          new THREE.MeshBasicMaterial({
            color: node.color,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
          }),
      ),
    [],
  );

  const haloMaterials = useMemo(
    () =>
      GRAPH_NODES_3D.map(
        (node) =>
          new THREE.MeshBasicMaterial({
            color: node.color,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
          }),
      ),
    [],
  );

  const linkItems = useMemo(() => {
    return GRAPH_LINKS_3D.map(([sourceId, targetId], idx) => {
      const s = nodeMap.get(sourceId)!;
      const t = nodeMap.get(targetId)!;
      const start = new THREE.Vector3(...s.pos);
      const end = new THREE.Vector3(...t.pos);
      const mid = start.clone().lerp(end, 0.5);
      mid.y += 0.018 + (idx % 2) * 0.01;
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(28));
      const material = new THREE.LineBasicMaterial({
        color: '#c8a96d',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      return { sourceId, targetId, geometry, material };
    });
  }, [nodeMap]);

  // Vertical anchor beam from Page 042 QR mark ([0.042, 0.779, 0.055]) up to the central 'page' node
  const anchorStem = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.042, 0.779, 0.055),
      new THREE.Vector3(0.032, 0.845, 0.025),
    ]);
    const material = new THREE.LineBasicMaterial({
      color: '#e8dcc4',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    return { geometry, material };
  }, []);

  // Ambient dust particles around the graph
  const positions = useMemo(() => {
    const values = new Float32Array(72 * 3);
    for (let i = 0; i < 72; i += 1) {
      const angle = (i / 72) * Math.PI * 10;
      const r = 0.04 + (i % 9) * 0.018;
      values[i * 3] = 0.03 + Math.cos(angle) * r * 1.2;
      values[i * 3 + 1] = 0.81 + (i / 72) * 0.2;
      values[i * 3 + 2] = 0.02 + Math.sin(angle) * r;
    }
    return values;
  }, []);

  useEffect(() => {
    return () => {
      sphereGeo.dispose();
      ringGeo.dispose();
      for (const m of nodeMaterials) m.dispose();
      for (const m of haloMaterials) m.dispose();
      for (const item of linkItems) {
        item.geometry.dispose();
        item.material.dispose();
      }
      anchorStem.geometry.dispose();
      anchorStem.material.dispose();
    };
  }, [sphereGeo, ringGeo, nodeMaterials, haloMaterials, linkItems, anchorStem]);

  useFrame(({ camera }, delta) => {
    const { phase } = timeline(progressRef.current);
    const activeNode = interactionRef.current.activeNode ?? 'page';
    const strength = band(phase, 4.12, 0.72);

    if (pointsMaterialRef.current) {
      pointsMaterialRef.current.opacity = THREE.MathUtils.damp(
        pointsMaterialRef.current.opacity,
        strength * 0.65,
        6,
        delta,
      );
    }

    anchorStem.material.opacity = THREE.MathUtils.damp(
      anchorStem.material.opacity,
      strength * 0.85,
      6,
      delta,
    );

    const now = performance.now() * 0.0025;

    GRAPH_NODES_3D.forEach((node, idx) => {
      const isFocused = activeNode === node.id;
      const isConnected = GRAPH_LINKS_3D.some(
        ([s, t]) => (s === activeNode && t === node.id) || (t === activeNode && s === node.id),
      );
      const nodeAlpha = strength * (isFocused ? 1 : isConnected ? 0.92 : 0.55);
      const haloAlpha = strength * (isFocused ? 0.85 : isConnected ? 0.38 : 0.16);

      nodeMaterials[idx].opacity = THREE.MathUtils.damp(nodeMaterials[idx].opacity, nodeAlpha, 7, delta);
      haloMaterials[idx].opacity = THREE.MathUtils.damp(haloMaterials[idx].opacity, haloAlpha, 7, delta);

      const mesh = nodeMeshesRef.current[idx];
      const halo = haloMeshesRef.current[idx];
      const scale = node.size * (isFocused ? 1.45 + Math.sin(now * 2) * 0.12 : 1);
      if (mesh) {
        mesh.scale.setScalar(scale);
        mesh.position.y = node.pos[1] + Math.sin(now + idx * 0.8) * 0.003;
      }
      if (halo) {
        halo.scale.setScalar(scale * (isFocused ? 1.35 : 1));
        halo.position.y = node.pos[1] + Math.sin(now + idx * 0.8) * 0.003;
        halo.lookAt(camera.position);
      }
    });

    for (const item of linkItems) {
      const highlighted = item.sourceId === activeNode || item.targetId === activeNode;
      const linkTarget = strength * (highlighted ? 0.82 : 0.24);
      item.material.opacity = THREE.MathUtils.damp(item.material.opacity, linkTarget, 7, delta);
    }

    if (groupRef.current) {
      const visible = strength > 0.01 || anchorStem.material.opacity > 0.01;
      groupRef.current.visible = visible;
      const lift = 0.85 + 0.15 * clamp01(strength);
      groupRef.current.scale.set(1, lift, 1);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <line geometry={anchorStem.geometry as never} material={anchorStem.material as never} />
      {linkItems.map((item, idx) => (
        <line key={idx} geometry={item.geometry as never} material={item.material as never} />
      ))}
      {GRAPH_NODES_3D.map((node, idx) => (
        <group key={node.id}>
          <mesh
            ref={(el) => {
              nodeMeshesRef.current[idx] = el;
            }}
            position={node.pos}
            geometry={sphereGeo}
            material={nodeMaterials[idx]}
          />
          <mesh
            ref={(el) => {
              haloMeshesRef.current[idx] = el;
            }}
            position={node.pos}
            geometry={ringGeo}
            material={haloMaterials[idx]}
          />
        </group>
      ))}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={pointsMaterialRef}
          size={0.0036}
          color="#d5b77d"
          transparent
          opacity={0}
          depthWrite={false}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

function ScanRing({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    const { phase } = timeline(progressRef.current);
    const target = band(phase, 4.12, 0.68) * 0.55;
    if (materialRef.current) {
      materialRef.current.opacity = THREE.MathUtils.damp(materialRef.current.opacity, target, 6, delta);
    }
    const visible = (materialRef.current?.opacity ?? 0) > 0.01;
    if (meshRef.current) {
      meshRef.current.visible = visible;
      meshRef.current.rotation.z += delta * 0.16;
    }
    if (innerRingRef.current) {
      innerRingRef.current.visible = visible;
      const pulse = 1 + Math.sin(performance.now() * 0.0035) * 0.15;
      innerRingRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0.01, 0.779, 0.01]} visible={false}>
        <ringGeometry args={[0.17, 0.172, 96]} />
        <meshBasicMaterial
          ref={materialRef}
          color="#c8a96d"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={innerRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0.042, 0.78, 0.055]} visible={false}>
        <ringGeometry args={[0.018, 0.021, 48]} />
        <meshBasicMaterial
          color="#e8dcc4"
          transparent
          opacity={0.45}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

function QrCompanionCard({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const texture = useTexture('/qr/one-code-entry-card.webp');
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const { size } = useThree();

  useFrame((_, delta) => {
    const { phase } = timeline(progressRef.current);
    const visible = size.width >= 760;
    const target = visible ? band(phase, 4.15, 0.65) * 0.92 : 0;
    if (materialRef.current) {
      materialRef.current.opacity = THREE.MathUtils.damp(materialRef.current.opacity, target, 6, delta);
    }
    if (groupRef.current) {
      const opacity = materialRef.current?.opacity ?? 0;
      groupRef.current.visible = opacity > 0.01;
      groupRef.current.scale.setScalar(0.82 + opacity * 0.18);
      groupRef.current.position.y = 0.955 + Math.sin(performance.now() * 0.0005) * 0.004;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[0.255, 0.955, 0.08]}
      rotation={[-0.04, -0.34, 0.02]}
      visible={false}
    >
      <mesh>
        <planeGeometry args={[0.095, 0.126]} />
        <meshBasicMaterial
          ref={materialRef}
          map={texture}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, -0.002]}>
        <planeGeometry args={[0.105, 0.136]} />
        <meshBasicMaterial color="#c8a96d" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function CarryLight({
  progressRef,
  pick,
}: {
  progressRef: MutableRefObject<number>;
  pick: ShelfPick;
}) {
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((_, delta) => {
    const phase = clamp01(progressRef.current) * PHASE_COUNT;
    const book = shelfBookPose(phase, pick) ?? genericBookPose(phase);
    const amount =
      smoothstep((phase - 0.46) / 0.14) * (1 - smoothstep((phase - 0.86) / 0.12));
    const light = lightRef.current;
    if (!light) return;
    light.position.set(
      book.position[0] + 0.26,
      book.position[1] + 0.34,
      book.position[2] + 0.44,
    );
    light.intensity = THREE.MathUtils.damp(light.intensity, amount * 0.55, 8, delta);
    light.visible = light.intensity > 0.01;
  });

  return (
    <pointLight
      ref={lightRef}
      position={[0.3, 1.1, 0.45]}
      intensity={0}
      color="#ffd9a6"
      distance={1.3}
      decay={2}
      visible={false}
    />
  );
}

function BookRig({
  progressRef,
  interactionRef,
  reducedMotion,
  pick,
}: {
  progressRef: MutableRefObject<number>;
  interactionRef: InteractionRef;
  reducedMotion: boolean;
  pick: ShelfPick;
}) {
  const mobile = useThree((state) => state.size.width < 760);
  const bookGroupRef = useRef<THREE.Group>(null);
  const deskGroupRef = useRef<THREE.Group>(null);
  const pedestalGroupRef = useRef<THREE.Group>(null);
  const slipcaseGroupRef = useRef<THREE.Group>(null);
  const slipcaseFlapRef = useRef<THREE.Group>(null);
  const stowMouthRef = useRef(new THREE.Vector3());
  const stowSeatRef = useRef(new THREE.Vector3());
  const shelfGroupRef = useRef<THREE.Group>(null);
  const shelfGlowRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const shelfBaseRef = useRef<Array<{ material: THREE.MeshStandardMaterial; color: THREE.Color }>>([]);
  const introRef = useRef(0);

  const book = useAssetGLTF('/models/book-transformed.glb');
  const desk = useAssetGLTF('/models/oak-desk.glb');
  const pedestal = useAssetGLTF('/models/display-pedestal.glb');
  const slipcase = useAssetGLTF('/models/slipcase.glb');
  const shelf = useAssetGLTF('/models/shelf.glb');
  // Current "THE BOOK." atlas. The GLB's embedded basecolor still carries the
  // earlier "CODEX" artwork, so only the basecolor slot is overridden while the
  // embedded normal / AO / roughness / metalness maps stay in place. The WebP is
  // a 36 KB derivative of the 2048² source atlas.
  const bookCoverAtlas = useTexture('/textures/book-basecolor.webp');

  const bookMorphMesh = useMorphMesh(book.scene);
  const bookMaterials = useSceneMaterials(book.scene);
  const deskMaterials = useSceneMaterials(desk.scene);
  const pedestalMaterials = useSceneMaterials(pedestal.scene);
  const slipcaseMaterials = useSceneMaterials(slipcase.scene);
  const shelfMaterials = useSceneMaterials(shelf.scene);

  useEffect(() => {
    bookCoverAtlas.flipY = false;
    bookCoverAtlas.colorSpace = THREE.SRGBColorSpace;
    bookCoverAtlas.needsUpdate = true;

    // Book cover (A1/A2): keep the GLB's embedded KTX2 PBR maps intact and swap
    // only the stale basecolor for the current atlas. BaseColor carries the cover
    // art; Normal / AO / Roughness / Metalness carry the cloth fibre, page edge
    // and gold-foil response. Stripping those maps flattens the object.
    applyPreset(bookMaterials, {
      map: bookCoverAtlas,
      color: '#ffffff',
      metalness: 1,
      envMapIntensity: 0.15,
      normalScale: 0.65,
    });

    // Oak desk (A4): use the delivered oak PBR maps with a dark-walnut grade.
    applyPreset(deskMaterials, {
      color: '#8a6a45',
      roughness: 0.92,
      metalness: 0,
      envMapIntensity: 0.55,
      normalScale: 0.8,
      repeat: [2, 2],
    });

    // Display pedestal (A4): cast bronze-black base with a soft satin top,
    // dark enough that the felt pad reads as the seat instead of a hole.
    applyNamedPresets(pedestalMaterials, {
      Pedestal_Bronze_Black: {
        color: '#241c14',
        roughness: 0.56,
        metalness: 0.4,
        envMapIntensity: 0.72,
      },
    });

    // Slipcase (A3): black cloth body, dark felt tray, real gold foil seal.
    applyNamedPresets(slipcaseMaterials, {
      Slipcase_Black_Cloth: {
        color: '#050403',
        roughness: 0.95,
        metalness: 0,
        envMapIntensity: 0.15,
      },
      Slipcase_Inner_Tray: {
        color: '#0b0807',
        roughness: 0.98,
        metalness: 0,
        envMapIntensity: 0.1,
      },
      Slipcase_Foil_Seal: {
        color: '#b8965d',
        roughness: 0.34,
        metalness: 0.92,
        envMapIntensity: 1.05,
      },
    });

    // Shelf (C1/C2): walnut case, dark sleeping spines, one breathing hero strip.
    applyNamedPresets(
      shelfMaterials,
      {
        Shelf_Back_Panel: {
          color: '#17120d',
          roughness: 0.92,
          metalness: 0,
          envMapIntensity: 0.28,
        },
        Shelf_Walnut: {
          color: '#3a2a1b',
          roughness: 0.78,
          metalness: 0,
          envMapIntensity: 0.34,
        },
        Sleeping_Spine_0: { color: '#2a2620', roughness: 0.82, metalness: 0, envMapIntensity: 0.26 },
        Sleeping_Spine_1: { color: '#332b22', roughness: 0.82, metalness: 0, envMapIntensity: 0.26 },
        Sleeping_Spine_2: { color: '#242a2b', roughness: 0.82, metalness: 0, envMapIntensity: 0.26 },
        Sleeping_Spine_3: { color: '#3a3024', roughness: 0.82, metalness: 0, envMapIntensity: 0.26 },
        Sleeping_Spine_4: { color: '#2c211d', roughness: 0.82, metalness: 0, envMapIntensity: 0.26 },
        Hero_Spine_Cloth: {
          color: '#241b12',
          roughness: 0.8,
          metalness: 0,
          envMapIntensity: 0.25,
        },
        Hero_Spine_Glow: {
          color: '#3a2f20',
          emissive: '#ffae47',
          emissiveIntensity: 0.05,
          roughness: 0.5,
          metalness: 0,
          envMapIntensity: 0.2,
        },
      },
      { roughness: 0.82, metalness: 0, envMapIntensity: 0.26 },
    );

    const glow = shelfMaterials.find(
      (material) => material.name === 'Hero_Spine_Glow',
    ) as THREE.MeshStandardMaterial | undefined;
    if (glow) {
      glow.toneMapped = false;
      shelfGlowRef.current = glow;
    }

    shelfBaseRef.current = shelfMaterials.map((material) => {
      const mesh = material as THREE.MeshStandardMaterial;
      return { material: mesh, color: mesh.color.clone() };
    });
  }, [bookCoverAtlas, bookMaterials, deskMaterials, pedestalMaterials, slipcaseMaterials, shelfMaterials]);

  useEffect(() => {
    if (bookMorphMesh) {
      bookMorphMesh.frustumCulled = false;
      bookMorphMesh.castShadow = false;
      bookMorphMesh.receiveShadow = false;
    }
  }, [bookMorphMesh]);

  useEffect(() => {
    // The delivered shelf GLB carries flat spine cards. The shelf stage now
    // rebuilds the books with real depth, so keep only the walnut case.
    shelf.scene.traverse((object) => {
      const name = object.name;
      if (
        name.includes('Shelf_Books_Sleeping') ||
        name.includes('Shelf_Hero_Spine') ||
        name.includes('Shelf_Hero_Glow')
      ) {
        object.visible = false;
      }
    });
  }, [shelf.scene]);

  useEffect(() => {
    // Re-pivot the front flap (and the foil seal sitting on it) on its bottom
    // edge so it can fold forward onto the desk while the book slides in. The
    // asset is authored with the hinge at the top edge, which would swing the
    // panel through the book's path instead of out of it.
    const flap = slipcase.scene.getObjectByName('Slipcase_Flap');
    const seal = slipcase.scene.getObjectByName('Slipcase_Seal');
    const pivot = slipcaseFlapRef.current;
    if (!flap || !seal || !pivot) return;

    pivot.add(flap, seal);
    flap.position.set(0, 0, -SLIPCASE_FLAP_HINGE_Z);
    seal.position.set(0, 0, -SLIPCASE_FLAP_HINGE_Z);

    return () => {
      slipcase.scene.add(flap, seal);
      flap.position.set(0, 0, 0);
      seal.position.set(0, 0, 0);
    };
  }, [slipcase.scene]);

  useFrame((_, delta) => {
    const { phase, index, t } = timeline(progressRef.current);
    const a = BOOK_KEYS[index];
    const b = BOOK_KEYS[Math.min(index + 1, BOOK_KEYS.length - 1)];

    introRef.current = THREE.MathUtils.damp(introRef.current, 1, 1.5, delta);
    const intro = 1 - introRef.current;
    // Scroll-linked arrival settle in the first 18% of Chapter 00
    const scrollLanding = phase < 0.18 ? (1 - phase / 0.18) * 0.045 : 0;
    const idle = reducedMotion ? 0 : Math.sin(performance.now() * 0.00055) * 0.0015;

    const edition = interactionRef.current.activeEdition;
    const editionShift = SLIPCASE_X[edition] - SLIPCASE_X.pro;

    // Gentle turntable rotation on the pedestal during Epilogue A (Benchmark)
    const benchmarkSpin =
      band(phase, 7.0, 0.55) * Math.sin(performance.now() * 0.00045) * 0.14;

    // Pedestal is a Benchmark-only plinth. It retracts straight down into the
    // desk before the slipcase arrives, so the deploying book and the case never
    // share the stage with it.
    const pedestalIn = smoothstep((phase - 6.68) / 0.22);
    const pedestalOut = 1 - smoothstep((phase - 7.36) / 0.22);
    const plinthRideY =
      BOOK_KEYS[7].position[1] - (1 - pedestalOut) * PEDESTAL_HEIGHT;

    // Epilogue B (Deployment) beats, all tied to the phase so the stow is
    // visible on the way in and complete once the chapter pins:
    //   1. lift the book off the retracting plinth and arc it forward
    //   2. square it to the case while the case grows in and folds its flap open
    //   3. slide it along the case's own front axis onto the tray
    //   4. fold the flap shut over the lower cover and its foil seal
    const caseIn = smoothstep((phase - SLIPCASE_IN_START) / (SLIPCASE_IN_END - SLIPCASE_IN_START));
    const flapOpen =
      caseIn *
      (1 -
        smoothstep(
          (phase - SLIPCASE_FLAP_CLOSE_START) /
            (SLIPCASE_FLAP_CLOSE_END - SLIPCASE_FLAP_CLOSE_START),
        ));

    if (bookGroupRef.current) {
      const shelfPose = shelfBookPose(phase, pick);

      if (shelfPose) {
        bookGroupRef.current.position.set(
          THREE.MathUtils.damp(bookGroupRef.current.position.x, shelfPose.position[0], 8, delta),
          THREE.MathUtils.damp(bookGroupRef.current.position.y, shelfPose.position[1] + idle, 8, delta),
          THREE.MathUtils.damp(bookGroupRef.current.position.z, shelfPose.position[2], 8, delta),
        );
        bookGroupRef.current.rotation.x = THREE.MathUtils.damp(
          bookGroupRef.current.rotation.x,
          shelfPose.rotation[0],
          8,
          delta,
        );
        bookGroupRef.current.rotation.y = THREE.MathUtils.damp(
          bookGroupRef.current.rotation.y,
          shelfPose.rotation[1],
          8,
          delta,
        );
        bookGroupRef.current.rotation.z = THREE.MathUtils.damp(
          bookGroupRef.current.rotation.z,
          shelfPose.rotation[2],
          8,
          delta,
        );
      } else if (phase >= STOW_START && slipcaseGroupRef.current) {
        // Deployment stow. The case group is the authority for x (edition
        // shifts are damped on the case itself), so reading its live transform
        // keeps the book and the cavity locked together for every edition.
        const caseGroup = slipcaseGroupRef.current;
        const caseScale = mobile ? 0.84 : 1;
        const travel = smoothstep((phase - STOW_START) / (STOW_ALIGN_END - STOW_START));
        const insert = smoothstep(
          (phase - STOW_SLIDE_START) / (STOW_SEAT_END - STOW_SLIDE_START),
        );
        const arc = Math.sin(Math.PI * travel);
        const from = BOOK_KEYS[7];

        const mouth = readCaseAnchor(
          stowMouthRef.current,
          caseGroup,
          caseScale,
          SLIPCASE_TRAY_MOUTH,
        );
        const seat = readCaseAnchor(stowSeatRef.current, caseGroup, caseScale, SLIPCASE_TRAY_SEAT);

        // The book leaves the retracting plinth with a small lift and a forward
        // bow, so its sweep to the mouth never crosses the case body.
        const startY = from.position[1] - (1 - pedestalOut) * PEDESTAL_HEIGHT;
        const travelX = lerp(from.position[0], mouth.x, travel);
        const travelZ = lerp(from.position[2], mouth.z, travel) + arc * 0.05;
        const travelY =
          lerp(startY, mouth.y, travel) + arc * 0.03 + idle * (1 - travel);

        bookGroupRef.current.position.set(
          lerp(travelX, seat.x, insert),
          lerp(travelY, seat.y, insert),
          lerp(travelZ, seat.z, insert),
        );

        // Turn square while still in front of the case, then hold the exact
        // case yaw for the straight slide into the tray.
        const turn = smoothstep(travel / 0.85);
        const fromRotation: Vec3 = [
          from.rotation[0],
          from.rotation[1] + benchmarkSpin,
          from.rotation[2],
        ];
        const rotation = mixVec3(fromRotation, SLIPCASE_ROTATION, turn);
        bookGroupRef.current.rotation.set(rotation[0], rotation[1], rotation[2]);
      } else {
        const presentationX = lerp(a.position[0], b.position[0], t) + editionShift;
        const lerpedY = lerp(a.position[1], b.position[1], t);
        // The benchmark book rides the plinth as it retracts, so the two never
        // separate mid-descent; once flush with the desk the keyframe takes over.
        const deskY =
          (phase > 7.36 ? Math.min(lerpedY, plinthRideY) : lerpedY) +
          intro * 0.16 +
          scrollLanding;

        bookGroupRef.current.position.set(
          THREE.MathUtils.damp(bookGroupRef.current.position.x, presentationX, 7, delta),
          THREE.MathUtils.damp(bookGroupRef.current.position.y, deskY + idle, 7, delta),
          THREE.MathUtils.damp(
            bookGroupRef.current.position.z,
            lerp(a.position[2], b.position[2], t),
            7,
            delta,
          ),
        );
        bookGroupRef.current.rotation.set(
          lerp(a.rotation[0], b.rotation[0], t) + intro * 0.1,
          lerp(a.rotation[1], b.rotation[1], t) + benchmarkSpin,
          lerp(a.rotation[2], b.rotation[2], t),
        );
      }
    }

    // Shelf (00 Shelf and 05 Return share one composition: ring closure).
    // The case holds its place in the room and is revealed by the shelf wash
    // instead of scaling up from nothing, so the shelving move stays visible.
    const shelfLevel = shelfPresence(phase);
    if (shelfGroupRef.current) {
      shelfGroupRef.current.visible = shelfLevel > 0.005;
    }
    for (const item of shelfBaseRef.current) {
      item.material.color.copy(item.color).multiplyScalar(shelfLevel);
    }
    const glowMaterial = shelfGlowRef.current;
    if (glowMaterial) {
      const breath = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(performance.now() * 0.0016);
      // 0.00 W is a barely-there breath, not a practical light.
      glowMaterial.emissiveIntensity = 0.05 + 0.12 * breath;
    }

    if (pedestalGroupRef.current) {
      pedestalGroupRef.current.scale.setScalar(Math.max(0.001, pedestalIn));
      pedestalGroupRef.current.position.y = 0.761 - (1 - pedestalOut) * PEDESTAL_HEIGHT;
      pedestalGroupRef.current.visible = pedestalIn > 0.002 && pedestalOut > 0.002;
    }

    if (slipcaseGroupRef.current) {
      slipcaseGroupRef.current.scale.setScalar(Math.max(0.001, caseIn));
      slipcaseGroupRef.current.visible = caseIn > 0.005;
      slipcaseGroupRef.current.position.x = THREE.MathUtils.damp(
        slipcaseGroupRef.current.position.x,
        SLIPCASE_X[edition],
        6,
        delta,
      );
    }

    if (slipcaseFlapRef.current) {
      slipcaseFlapRef.current.rotation.x = flapOpen * (Math.PI / 2);
    }
  });

  return (
    <>
      <group ref={deskGroupRef}>
        <group scale={0.001}>
          <primitive object={desk.scene} dispose={null} />
        </group>
      </group>

      <group ref={shelfGroupRef} position={[0.0, 0, -0.98]} visible={false}>
        <group scale={0.001}>
          <primitive object={shelf.scene} dispose={null} />
          <ShelfBooks pick={pick} progressRef={progressRef} />
          <ShelfSelection pick={pick} progressRef={progressRef} />
        </group>
      </group>

      <group ref={pedestalGroupRef} position={[0.01, 0.761, 0]} visible={false}>
        <group scale={0.62}>
          <group scale={0.001}>
            <primitive object={pedestal.scene} dispose={null} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 120.4, 0]}>
              <circleGeometry args={[146, 64]} />
              <meshStandardMaterial color="#14100c" roughness={0.96} metalness={0} envMapIntensity={0.18} />
            </mesh>
          </group>
        </group>
      </group>

      <group
        ref={slipcaseGroupRef}
        position={[SLIPCASE_POSITION[0], SLIPCASE_POSITION[1], SLIPCASE_POSITION[2]]}
        rotation={[SLIPCASE_ROTATION[0], SLIPCASE_ROTATION[1], SLIPCASE_ROTATION[2]]}
        visible={false}
      >
        <group scale={mobile ? 0.84 : 1}>
          <group scale={0.001}>
            <primitive object={slipcase.scene} dispose={null} />
            <group ref={slipcaseFlapRef} position={[0, 0, SLIPCASE_FLAP_HINGE_Z]} />
          </group>
        </group>
      </group>

      <group ref={bookGroupRef}>
        <group scale={mobile ? 0.84 : 1}>
          <group scale={0.001}>
            <primitive object={book.scene} dispose={null} />
            <PageTurnRig mesh={bookMorphMesh} progressRef={progressRef} />
            <QrCoverMark progressRef={progressRef} reducedMotion={reducedMotion} />
          </group>
        </group>
      </group>

      <PhoneScanner progressRef={progressRef} pick={pick} reducedMotion={reducedMotion} />
      <CloudSoulPanel progressRef={progressRef} pick={pick} reducedMotion={reducedMotion} />
      <CarryLight progressRef={progressRef} pick={pick} />

      <InteractionArcs progressRef={progressRef} />
      <NeuralGraph3D progressRef={progressRef} interactionRef={interactionRef} />
      <ScanRing progressRef={progressRef} />
      <QrCompanionCard progressRef={progressRef} />

      <ContactShadows
        position={[0, 0.7615, 0]}
        scale={2.0}
        resolution={512}
        blur={3.8}
        opacity={0.72}
        far={0.68}
        color="#020100"
        frames={Infinity}
      />
    </>
  );
}

/**
 * Day studio light with a night-desk grade for 04 Loop (asset C4).
 *
 * Every value here is a continuous function of the scroll phase. The night is
 * one eased envelope, and the practical lamp rides a slightly later envelope,
 * so the day rig hands over to it instead of both fading in lockstep.
 *
 * The HDR stays fixed on purpose: changing `files` re-suspends the
 * `Environment`, which drops `scene.environment` for a few frames and reads as
 * an exposure cut. The night is carried by the lamp plus the dimmed rig.
 */
function LightRig({
  progressRef,
  reducedMotion,
}: {
  progressRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const nightRef = useRef(0);
  const lampMixRef = useRef(0);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);
  const rimRef = useRef<THREE.DirectionalLight>(null);
  const spotRef = useRef<THREE.SpotLight>(null);
  const lampRef = useRef<THREE.PointLight>(null);
  const shelfLightRef = useRef<THREE.PointLight>(null);
  const shelfFillRef = useRef<THREE.PointLight>(null);
  const shelfMixRef = useRef(0);
  const sceneRef = useThree((state) => state.scene);

  useFrame((_, delta) => {
    const phase = clamp01(progressRef.current) * PHASE_COUNT;
    // Short time smoothing to absorb discrete wheel deltas. Kept faster than
    // the camera so the grade never lags behind the framing.
    const follow = reducedMotion ? 30 : 9;

    // 04 Loop (phase 5) is the only night beat.
    const nightTarget = lightEnvelope(phase, 4.05, 5.0, 5.4, 6.15);
    // The lamp arrives after the day rig starts to fall away and leaves after
    // it comes back, so the room always keeps a source.
    const lampTarget = lightEnvelope(phase, 4.4, 5.25, 5.55, 6.05);
    nightRef.current = THREE.MathUtils.damp(nightRef.current, nightTarget, follow, delta);
    lampMixRef.current = THREE.MathUtils.damp(lampMixRef.current, lampTarget, follow, delta);
    const night = nightRef.current;
    const lamp = lampMixRef.current;

    // Shelf wash follows the case's own scroll visibility, so the light and
    // the geometry arrive and leave together instead of on separate thresholds.
    shelfMixRef.current = THREE.MathUtils.damp(
      shelfMixRef.current,
      shelfPresence(phase),
      follow,
      delta,
    );
    const shelf = shelfMixRef.current;

    if (hemiRef.current) hemiRef.current.intensity = 0.3 - night * 0.24;
    if (keyRef.current) keyRef.current.intensity = 1.35 - night * 1.13;
    if (fillRef.current) fillRef.current.intensity = 0.5 - night * 0.46;
    if (rimRef.current) rimRef.current.intensity = 0.85 - night * 0.55;
    if (spotRef.current) spotRef.current.intensity = 5.5 - night * 4.75;
    if (lampRef.current) lampRef.current.intensity = lamp * 2.6;
    if (shelfLightRef.current) shelfLightRef.current.intensity = shelf * 0.7;
    if (shelfFillRef.current) shelfFillRef.current.intensity = shelf * 0.2;
    sceneRef.environmentIntensity = 0.7 - night * 0.48 + shelf * 0.06;
  });

  return (
    <>
      {/* HDR environment: one warm studio probe; the night grade is lighting-led */}
      <Suspense fallback={null}>
        <Environment files="/hdri/warm-studio.hdr" background={false} />
      </Suspense>

      {/* Hemisphere sky/ground fill — gradient bounce instead of flat ambient */}
      <hemisphereLight ref={hemiRef} args={['#ddc89a', '#3a2810', 0.3]} />

      {/* Key: warm window light from upper-left-front */}
      <directionalLight ref={keyRef} position={[-1.4, 2.8, 1.6]} intensity={1.35} color="#fff3d6" />

      {/* Fill: cool overcast from the right — softens key shadows */}
      <directionalLight ref={fillRef} position={[2.1, 1.2, -0.4]} intensity={0.5} color="#c4d4e8" />

      {/* Rim: warm terracotta backlight — separates book silhouette from bg */}
      <directionalLight ref={rimRef} position={[-0.6, 0.8, -1.8]} intensity={0.85} color="#cc7744" />

      {/* Desk bounce: gentle glow simulating light reflecting off the desk */}
      <pointLight position={[0, 0.72, 0.28]} intensity={0.08} color="#c9941e" distance={1.4} decay={2.2} />

      {/* Shelf wash: warm pool that reveals the modelled spines behind the book */}
      <pointLight
        ref={shelfLightRef}
        position={[-0.02, 1.34, -0.42]}
        intensity={0}
        color="#ffc987"
        distance={2.3}
        decay={2}
      />
      <pointLight
        ref={shelfFillRef}
        position={[0.5, 0.88, -0.5]}
        intensity={0}
        color="#9db4c9"
        distance={1.9}
        decay={2.2}
      />

      {/* Spine accent: skims across the spine to reveal cloth texture */}
      <pointLight position={[-0.22, 0.98, 0.12]} intensity={0.1} color="#ffe4b0" distance={1.1} decay={2} />

      {/* Practical reading spot: principal light for the hero view */}
      <spotLight
        ref={spotRef}
        position={[0.68, 2.1, 1.05]}
        angle={0.34}
        penumbra={0.92}
        intensity={5.5}
        color="#fdefc0"
        distance={5}
        decay={2}
      />

      {/* Night desk lamp: small warm radius, only live in 04 Loop */}
      <pointLight
        ref={lampRef}
        position={[-0.42, 1.08, 0.2]}
        intensity={0}
        color="#ffb15e"
        distance={1.5}
        decay={2}
      />
    </>
  );
}

function SceneContents({
  progressRef,
  pointerRef,
  interactionRef,
  reducedMotion,
  onReady,
}: {
  progressRef: MutableRefObject<number>;
  pointerRef: PointerRef;
  interactionRef: InteractionRef;
  reducedMotion: boolean;
  onReady: () => void;
}) {
  const pick = useShelfPick();

  return (
    <>
      {/* ── Scene base ─────────────────────────────────────────────── */}
      <color attach="background" args={['#0e0d0b']} />
      <fog attach="fog" args={['#0e0d0b', 2.4, 5.2]} />

      <LightRig progressRef={progressRef} reducedMotion={reducedMotion} />

      <Suspense fallback={null}>
        <BookRig
          progressRef={progressRef}
          interactionRef={interactionRef}
          reducedMotion={reducedMotion}
          pick={pick}
        />
        <ReadySignal onReady={onReady} />
      </Suspense>

      <CameraRig progressRef={progressRef} pointerRef={pointerRef} reducedMotion={reducedMotion} />
    </>
  );
}

export function BookScene({
  progressRef,
  pointerRef,
  interactionRef,
  reducedMotion,
  onReady,
}: {
  progressRef: MutableRefObject<number>;
  pointerRef: PointerRef;
  interactionRef: InteractionRef;
  reducedMotion: boolean;
  onReady: () => void;
}) {
  return (
    <SceneContents
      progressRef={progressRef}
      pointerRef={pointerRef}
      interactionRef={interactionRef}
      reducedMotion={reducedMotion}
      onReady={onReady}
    />
  );
}
