import { Suspense, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { ContactShadows, Environment, useTexture } from '@react-three/drei';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

export type StageInteractionState = {
  activeLayer: number | null;
  activeNode: string | null;
  activeEdition: 'standard' | 'pro' | 'enterprise';
};

type Vec3 = readonly [number, number, number];

type BookKey = {
  position: Vec3;
  rotation: Vec3;
  morph: Vec3;
};

type CameraKey = {
  position: Vec3;
  target: Vec3;
  mobileTargetX: number;
  mobileTargetY: number;
};

type PointerRef = MutableRefObject<{ x: number; y: number }>;
type InteractionRef = MutableRefObject<StageInteractionState>;

// Unified desk coordinate space across all 6 chapters (00 -> 05)
// so the object never teleports off the oak desk.
const BOOK_KEYS: BookKey[] = [
  // 00 Arrival — closed, standing on the oak desk, turned toward the reader.
  {
    position: [0, 0.765, 0],
    rotation: [0.035, -0.28, 0.012],
    morph: [0, 0, 0],
  },
  // 01 Structure — half-open (48°) and angled so the 6 material strata fan out clearly.
  {
    position: [0.01, 0.768, 0.01],
    rotation: [0.08, -0.54, 0.025],
    morph: [0, 0.86, 0],
  },
  // 02 Interaction — laid 180° flat on the desk, ribbon sweeping onto Page 042.
  {
    position: [0, 0.772, 0.015],
    rotation: [-Math.PI / 2, 0.06, 0],
    morph: [0, 0.04, 0.96],
  },
  // 03 Neural Link — flat on the desk, lifted slightly as the Page 042 hologram rises above it.
  {
    position: [0.01, 0.785, 0.01],
    rotation: [-Math.PI / 2, 0.14, 0],
    morph: [0, 0, 1],
  },
  // 04 Benchmark — closed, elevated on the desktop display pedestal at a 45° hero angle.
  {
    position: [0.01, 0.852, 0],
    rotation: [0.04, 0.58, 0.01],
    morph: [0, 0, 0],
  },
  // 05 Deployment — closed on the desk, sliding into the custom clothbound slipcase.
  {
    position: [-0.038, 0.768, 0.015],
    rotation: [0.02, -0.24, 0.008],
    morph: [0, 0, 0],
  },
];

const CAMERA_KEYS: CameraKey[] = [
  // 00 Arrival
  {
    position: [-0.38, 1.05, 0.72],
    target: [-0.18, 0.86, 0],
    mobileTargetX: 0,
    mobileTargetY: 0.76,
  },
  // 01 Structure
  {
    position: [-0.34, 1.01, 0.67],
    target: [-0.16, 0.85, 0],
    mobileTargetX: 0,
    mobileTargetY: 0.74,
  },
  // 02 Interaction — higher top-down angle to showcase the 180° spread & ribbon arc
  {
    position: [-0.36, 1.32, 0.55],
    target: [-0.21, 0.79, 0.01],
    mobileTargetX: -0.1,
    mobileTargetY: 0.71,
  },
  // 03 Neural Link — framed to show both the open Page 042 and the 3D node constellation above it
  {
    position: [-0.32, 1.12, 0.68],
    target: [-0.17, 0.88, 0],
    mobileTargetX: -0.05,
    mobileTargetY: 0.8,
  },
  // 04 Benchmark — framed for the wide comparison table on the left and pedestal on the right
  {
    position: [-0.34, 1.08, 0.78],
    target: [-0.2, 0.88, 0],
    mobileTargetX: 0,
    mobileTargetY: 0.78,
  },
  // 05 Deployment — framed on the desk slipcase & book assembly
  {
    position: [-0.36, 1.04, 0.76],
    target: [-0.19, 0.86, 0],
    mobileTargetX: -0.02,
    mobileTargetY: 0.76,
  },
];

const PHASE_COUNT = BOOK_KEYS.length - 1;

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
    const { index, t } = timeline(progressRef.current);
    const a = CAMERA_KEYS[index];
    const b = CAMERA_KEYS[Math.min(index + 1, CAMERA_KEYS.length - 1)];
    const mobile = size.width < 760;

    const targetX = mobile
      ? lerp(a.mobileTargetX, b.mobileTargetX, t)
      : lerp(a.target[0], b.target[0], t);
    const targetY = mobile
      ? lerp(a.mobileTargetY, b.mobileTargetY, t)
      : lerp(a.target[1], b.target[1], t);
    const targetZ = lerp(a.target[2], b.target[2], t);

    const pointerX = reducedMotion || mobile ? 0 : pointerRef.current.x;
    const pointerY = reducedMotion || mobile ? 0 : pointerRef.current.y;

    const desiredPosition = new THREE.Vector3(
      mobile ? targetX : lerp(a.position[0], b.position[0], t) + pointerX * 0.018,
      lerp(a.position[1], b.position[1], t) * (mobile ? 1.08 : 1) + pointerY * 0.012,
      lerp(a.position[2], b.position[2], t) * (mobile ? 1.34 : 1),
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

    const desiredFov = mobile ? 39 : 32;
    if (perspective.isPerspectiveCamera && Math.abs(perspective.fov - desiredFov) > 0.05) {
      perspective.fov = desiredFov;
      perspective.updateProjectionMatrix();
    }
  });

  return null;
}

function ExplodedLayers({
  progressRef,
  interactionRef,
}: {
  progressRef: MutableRefObject<number>;
  interactionRef: InteractionRef;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const layerRefs = useRef<Array<THREE.Group | null>>([]);

  const edgeGeometry = useMemo(() => {
    const source = new THREE.BoxGeometry(148, 210, 0.6);
    const edges = new THREE.EdgesGeometry(source);
    source.dispose();
    return edges;
  }, []);

  const planeGeometry = useMemo(() => new THREE.PlaneGeometry(146, 208), []);

  const lineMaterials = useMemo(
    () =>
      Array.from({ length: 6 }, (_, idx) =>
        new THREE.LineBasicMaterial({
          color: idx === 4 ? '#d27c65' : '#c8a96d',
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    [],
  );

  const fillMaterials = useMemo(
    () =>
      Array.from({ length: 6 }, (_, idx) =>
        new THREE.MeshBasicMaterial({
          color: idx === 4 ? '#d27c65' : '#c8a96d',
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      ),
    [],
  );

  useEffect(() => {
    return () => {
      edgeGeometry.dispose();
      planeGeometry.dispose();
      for (const m of lineMaterials) m.dispose();
      for (const m of fillMaterials) m.dispose();
    };
  }, [edgeGeometry, planeGeometry, lineMaterials, fillMaterials]);

  useFrame((_, delta) => {
    const { phase } = timeline(progressRef.current);
    const chapterStrength = band(phase, 1.18, 0.72);
    const activeLayer = interactionRef.current.activeLayer;

    let anyVisible = false;
    for (let i = 0; i < 6; i += 1) {
      const isSelected = activeLayer === i;
      const isDimmed = activeLayer !== null && !isSelected;
      const lineTarget = chapterStrength * (isSelected ? 0.98 : isDimmed ? 0.22 : 0.56);
      const fillTarget = chapterStrength * (isSelected ? 0.18 : 0.035);

      lineMaterials[i].opacity = THREE.MathUtils.damp(lineMaterials[i].opacity, lineTarget, 8, delta);
      fillMaterials[i].opacity = THREE.MathUtils.damp(fillMaterials[i].opacity, fillTarget, 8, delta);

      if (lineMaterials[i].opacity > 0.01) anyVisible = true;

      const layerGroup = layerRefs.current[i];
      if (layerGroup) {
        const spread = (-75 + i * 30) * (0.4 + 0.6 * chapterStrength);
        const lift = isSelected ? 14 : 0;
        layerGroup.position.x = THREE.MathUtils.damp(layerGroup.position.x, lift, 8, delta);
        layerGroup.position.z = THREE.MathUtils.damp(layerGroup.position.z, spread, 7, delta);
      }
    }

    if (groupRef.current) {
      groupRef.current.visible = anyVisible;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {Array.from({ length: 6 }, (_, index) => (
        <group
          key={index}
          ref={(el) => {
            layerRefs.current[index] = el;
          }}
          position={[0, 105, -75 + index * 30]}
          rotation={[0, 0, (index - 2.5) * 0.008]}
        >
          <lineSegments geometry={edgeGeometry} material={lineMaterials[index]} />
          <mesh geometry={planeGeometry} material={fillMaterials[index]} />
        </group>
      ))}
    </group>
  );
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
    const active = band(phase, 2.15, 0.68);
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

// Chapter 03 (and Chapter 05 Enterprise mode): True 3D Knowledge Graph rising from Page 042
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
    const enterpriseBoost =
      phase >= 4.45 && interactionRef.current.activeEdition === 'enterprise' ? 0.78 : 0;
    const strength = Math.max(band(phase, 3.12, 0.72), enterpriseBoost);

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

function ScanRing({
  progressRef,
  interactionRef,
}: {
  progressRef: MutableRefObject<number>;
  interactionRef: InteractionRef;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    const { phase } = timeline(progressRef.current);
    const standardBoost =
      phase >= 4.45 && interactionRef.current.activeEdition === 'standard' ? 0.55 : 0;
    const target = Math.max(band(phase, 3.12, 0.68) * 0.55, standardBoost);
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
    const target = visible ? band(phase, 3.15, 0.65) * 0.92 : 0;
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

function BookRig({
  progressRef,
  interactionRef,
  reducedMotion,
}: {
  progressRef: MutableRefObject<number>;
  interactionRef: InteractionRef;
  reducedMotion: boolean;
}) {
  const mobile = useThree((state) => state.size.width < 760);
  const bookGroupRef = useRef<THREE.Group>(null);
  const deskGroupRef = useRef<THREE.Group>(null);
  const pedestalGroupRef = useRef<THREE.Group>(null);
  const slipcaseGroupRef = useRef<THREE.Group>(null);
  const introRef = useRef(0);

  const book = useAssetGLTF('/models/book-transformed.glb');
  const desk = useAssetGLTF('/models/oak-desk.glb');
  const pedestal = useAssetGLTF('/models/display-pedestal.glb');
  const slipcase = useAssetGLTF('/models/slipcase.glb');
  const bookCoverAtlas = useTexture('/textures/source/book-basecolor.png');

  const bookMorphMesh = useMorphMesh(book.scene);
  const bookMaterials = useSceneMaterials(book.scene);
  const deskMaterials = useSceneMaterials(desk.scene);
  const pedestalMaterials = useSceneMaterials(pedestal.scene);
  const slipcaseMaterials = useSceneMaterials(slipcase.scene);

  useEffect(() => {
    bookCoverAtlas.flipY = false;
    bookCoverAtlas.colorSpace = THREE.SRGBColorSpace;
    bookCoverAtlas.needsUpdate = true;

    const configure = (
      materials: THREE.Material[],
      intensity: number,
      tint?: string,
      normalFactor = 0.42,
    ) => {
      for (const material of materials) {
        const standard = material as THREE.MeshStandardMaterial;
        if ('envMapIntensity' in standard) standard.envMapIntensity = intensity;
        if (tint && standard.color) standard.color.multiply(new THREE.Color(tint));
        if (standard.normalScale) standard.normalScale.multiplyScalar(normalFactor);
        if (typeof standard.roughness === 'number') standard.roughness = Math.max(standard.roughness, 0.78);
        material.needsUpdate = true;
      }
    };

    configure(bookMaterials, 1.3);
    for (const material of bookMaterials) {
      const standard = material as THREE.MeshStandardMaterial;
      standard.map = bookCoverAtlas;
      material.needsUpdate = true;
    }

    configure(deskMaterials, 0.2, '#171310', 0.035);
    configure(pedestalMaterials, 0.55, '#5a4a3a');
    configure(slipcaseMaterials, 0.85, '#8a6a4a');

    for (const material of deskMaterials) {
      const standard = material as THREE.MeshStandardMaterial;
      standard.map = null;
      standard.normalMap = null;
      standard.roughnessMap = null;
      standard.metalnessMap = null;
      standard.color.set('#171310');
      standard.roughness = 0.96;
      standard.metalness = 0;
      material.needsUpdate = true;
    }
  }, [bookCoverAtlas, bookMaterials, deskMaterials, pedestalMaterials, slipcaseMaterials]);

  useEffect(() => {
    if (bookMorphMesh) {
      bookMorphMesh.frustumCulled = false;
      bookMorphMesh.castShadow = false;
      bookMorphMesh.receiveShadow = false;
    }
  }, [bookMorphMesh]);

  useFrame((_, delta) => {
    const { phase, index, t } = timeline(progressRef.current);
    const a = BOOK_KEYS[index];
    const b = BOOK_KEYS[Math.min(index + 1, BOOK_KEYS.length - 1)];

    introRef.current = THREE.MathUtils.damp(introRef.current, 1, 1.5, delta);
    const intro = 1 - introRef.current;
    // Scroll-linked arrival settle in the first 18% of Chapter 00
    const scrollLanding = phase < 0.18 ? (1 - phase / 0.18) * 0.045 : 0;
    const idle = reducedMotion ? 0 : Math.sin(performance.now() * 0.00055) * 0.0015;

    // In Chapter 05 (Deployment), adapt the book's horizontal position to the chosen edition
    const edition = interactionRef.current.activeEdition;
    const deploymentOffsetX =
      phase > 4.2
        ? smoothstep((phase - 4.2) / 0.8) *
          (edition === 'standard' ? 0.085 : edition === 'enterprise' ? 0.055 : 0)
        : 0;

    // Gentle turntable rotation on the pedestal during Chapter 04 (Benchmark)
    const benchmarkSpin =
      band(phase, 4.0, 0.55) * Math.sin(performance.now() * 0.00045) * 0.14;

    if (bookGroupRef.current) {
      const targetX = lerp(a.position[0], b.position[0], t) + deploymentOffsetX;
      const targetY = lerp(a.position[1], b.position[1], t) + intro * 0.16 + scrollLanding + idle;
      const targetZ = lerp(a.position[2], b.position[2], t);

      bookGroupRef.current.position.set(
        THREE.MathUtils.damp(bookGroupRef.current.position.x, targetX, 7, delta),
        THREE.MathUtils.damp(bookGroupRef.current.position.y, targetY, 7, delta),
        THREE.MathUtils.damp(bookGroupRef.current.position.z, targetZ, 7, delta),
      );
      bookGroupRef.current.rotation.set(
        lerp(a.rotation[0], b.rotation[0], t) + intro * 0.1,
        lerp(a.rotation[1], b.rotation[1], t) + benchmarkSpin,
        lerp(a.rotation[2], b.rotation[2], t),
      );
    }

    if (bookMorphMesh?.morphTargetInfluences) {
      const influences = bookMorphMesh.morphTargetInfluences;
      influences[0] = 0;
      influences[1] = lerp(a.morph[1], b.morph[1], t);
      influences[2] = lerp(a.morph[2], b.morph[2], t);
    }

    // Pedestal appears on the desk for Chapter 04 (Benchmark)
    const pedestalTarget = band(phase, 4.0, 0.56) > 0.08 ? 1 : 0.001;
    // Slipcase appears on the desk for Chapter 05 (Deployment)
    const slipcaseTarget = phase >= 4.35 && edition !== 'standard' ? 1 : phase >= 4.35 ? 0.65 : 0.001;

    if (pedestalGroupRef.current) {
      const next = THREE.MathUtils.damp(pedestalGroupRef.current.scale.x, pedestalTarget, 6, delta);
      pedestalGroupRef.current.scale.setScalar(Math.max(0.001, next));
      pedestalGroupRef.current.visible = next > 0.005;
    }

    if (slipcaseGroupRef.current) {
      const next = THREE.MathUtils.damp(slipcaseGroupRef.current.scale.x, slipcaseTarget, 6, delta);
      slipcaseGroupRef.current.scale.setScalar(Math.max(0.001, next));
      slipcaseGroupRef.current.visible = next > 0.005;
      const slipX = edition === 'standard' ? -0.13 : edition === 'enterprise' ? -0.095 : -0.042;
      slipcaseGroupRef.current.position.x = THREE.MathUtils.damp(
        slipcaseGroupRef.current.position.x,
        slipX,
        6,
        delta,
      );
    }
  });

  return (
    <>
      <group ref={deskGroupRef}>
        <group scale={0.001}>
          <primitive object={desk.scene} dispose={null} />
        </group>
      </group>

      <group ref={pedestalGroupRef} position={[0.01, 0.761, 0]} visible={false}>
        <group scale={0.62}>
          <group scale={0.001}>
            <primitive object={pedestal.scene} dispose={null} />
          </group>
        </group>
      </group>

      <group
        ref={slipcaseGroupRef}
        position={[-0.042, 0.763, 0.012]}
        rotation={[0.02, -0.24, 0.008]}
        visible={false}
      >
        <group scale={mobile ? 0.84 : 1}>
          <group scale={0.001}>
            <primitive object={slipcase.scene} dispose={null} />
          </group>
        </group>
      </group>

      <group ref={bookGroupRef}>
        <group scale={mobile ? 0.84 : 1}>
          <group scale={0.001}>
            <primitive object={book.scene} dispose={null} />
            <ExplodedLayers progressRef={progressRef} interactionRef={interactionRef} />
          </group>
        </group>
      </group>

      <InteractionArcs progressRef={progressRef} />
      <NeuralGraph3D progressRef={progressRef} interactionRef={interactionRef} />
      <ScanRing progressRef={progressRef} interactionRef={interactionRef} />
      <QrCompanionCard progressRef={progressRef} />

      <ContactShadows
        position={[0, 0.7615, 0]}
        scale={1.65}
        resolution={256}
        blur={2.6}
        opacity={0.48}
        far={0.55}
        color="#050403"
        frames={Infinity}
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
  return (
    <>
      <color attach="background" args={['#11100e']} />
      <fog attach="fog" args={['#11100e', 1.9, 4.2]} />

      <Environment files="/hdri/warm-studio.hdr" background={false} environmentIntensity={0.62} />

      <ambientLight intensity={0.42} color="#d8c6a7" />
      <directionalLight position={[1.8, 2.4, 1.7]} intensity={2.7} color="#ffe4bd" />
      <directionalLight position={[-1.6, 1.25, 0.35]} intensity={1.75} color="#c9905e" />
      <pointLight position={[0.26, 0.92, 0.45]} intensity={0.55} color="#d8b275" distance={1.8} decay={2} />
      <pointLight position={[-0.32, 0.96, 0.48]} intensity={0.42} color="#ffe0b0" distance={1.4} decay={2} />
      <spotLight
        position={[0.9, 1.9, 1.1]}
        angle={0.48}
        penumbra={1}
        intensity={8.5}
        color="#f4d39a"
        distance={5}
        decay={2}
      />

      <Suspense fallback={null}>
        <BookRig
          progressRef={progressRef}
          interactionRef={interactionRef}
          reducedMotion={reducedMotion}
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
