import { Suspense, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { ContactShadows, Environment, useTexture } from '@react-three/drei';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

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

const BOOK_KEYS: BookKey[] = [
  // 00 Arrival — closed, standing on the desk, turned toward the reader.
  {
    position: [0, 0.765, 0],
    rotation: [0.035, -0.28, 0.012],
    morph: [0, 0, 0],
  },
  // 01 Structure — half-open and turned so the section can be read.
  {
    position: [0, 0.765, 0],
    rotation: [0.07, -0.52, 0.02],
    morph: [0, 0.82, 0],
  },
  // 02 Interaction — laid flat, fully open, pages toward the camera.
  {
    position: [0, 0.77, 0.01],
    rotation: [-Math.PI / 2, 0.08, 0],
    morph: [0, 0.08, 0.92],
  },
  // 03 Neural Link — still flat, lifted a few millimetres off the desk.
  {
    position: [0, 0.79, 0],
    rotation: [-Math.PI / 2, 0.16, 0],
    morph: [0, 0, 1],
  },
  // 04 Benchmark — closed and floating above the display pedestal.
  {
    position: [0, 0.125, 0],
    rotation: [0.02, 0.54, 0],
    morph: [0, 0, 0],
  },
  // 05 Deployment — closed, beside the slipcase.
  {
    position: [0.105, 0.02, 0.035],
    rotation: [0.025, -0.22, 0.012],
    morph: [0, 0, 0],
  },
];

const CAMERA_KEYS: CameraKey[] = [
  {
    position: [-0.38, 1.05, 0.72],
    target: [-0.18, 0.86, 0],
    mobileTargetX: 0,
    mobileTargetY: 0.76,
  },
  {
    position: [-0.34, 1.0, 0.68],
    target: [-0.17, 0.85, 0],
    mobileTargetX: 0,
    mobileTargetY: 0.74,
  },
  {
    position: [-0.4, 1.34, 0.57],
    target: [-0.24, 0.78, 0.01],
    mobileTargetX: -0.13,
    mobileTargetY: 0.70,
  },
  {
    position: [-0.28, 1.15, 0.61],
    target: [-0.18, 0.8, 0],
    mobileTargetX: -0.09,
    mobileTargetY: 0.70,
  },
  {
    position: [-0.3, 0.72, 1.0],
    target: [-0.17, 0.18, 0],
    mobileTargetX: 0,
    mobileTargetY: 0.08,
  },
  {
    position: [-0.38, 0.6, 1.15],
    target: [-0.22, 0.03, 0],
    mobileTargetX: 0,
    mobileTargetY: -0.09,
  },
];

const PHASE_COUNT = BOOK_KEYS.length - 1;

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
  // Hold each chapter for the first 52% of its scroll segment, then
  // move to the next pose. This gives the copy room to be read.
  const t = smoothstep((local - 0.52) / 0.48);
  return { phase, index, t };
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
  const currentTarget = useRef(new THREE.Vector3(0.01, 0.86, 0));
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

function ExplodedLayers({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const material = useMemo(
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

  const geometry = useMemo(() => {
    const source = new THREE.BoxGeometry(148, 210, 0.45);
    const edges = new THREE.EdgesGeometry(source);
    source.dispose();
    return edges;
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((_, delta) => {
    const { phase } = timeline(progressRef.current);
    const target = band(phase, 1.42, 0.62) * 0.58;
    material.opacity = THREE.MathUtils.damp(material.opacity, target, 7, delta);
    if (groupRef.current) groupRef.current.visible = material.opacity > 0.01;
  });

  return (
    <group ref={groupRef} visible={false}>
      {Array.from({ length: 6 }, (_, index) => (
        <lineSegments
          key={index}
          geometry={geometry}
          material={material}
          position={[0, 105, -76 + index * 30]}
          rotation={[0, 0, (index - 2.5) * 0.006]}
        />
      ))}
    </group>
  );
}

function NeuralField({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);

  const positions = useMemo(() => {
    const values = new Float32Array(94 * 3);
    for (let i = 0; i < 94; i += 1) {
      const radius = 0.12 + Math.random() * 0.22;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      values[i * 3] = Math.sin(phi) * Math.cos(theta) * radius * 1.45;
      values[i * 3 + 1] = Math.cos(phi) * radius * 1.05;
      values[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    }
    return values;
  }, []);

  useFrame((_, delta) => {
    const { phase } = timeline(progressRef.current);
    const target = band(phase, 3.28, 0.68) * 0.8;
    if (materialRef.current) {
      materialRef.current.opacity = THREE.MathUtils.damp(materialRef.current.opacity, target, 5, delta);
    }
    if (groupRef.current) {
      groupRef.current.visible = (materialRef.current?.opacity ?? 0) > 0.01;
      groupRef.current.rotation.y += delta * 0.045;
      groupRef.current.rotation.z = Math.sin(performance.now() * 0.00012) * 0.04;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.86, -0.02]} visible={false}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={materialRef}
          size={0.0038}
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
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    const { phase } = timeline(progressRef.current);
    const target = band(phase, 3.3, 0.62) * 0.5;
    if (materialRef.current) {
      materialRef.current.opacity = THREE.MathUtils.damp(materialRef.current.opacity, target, 6, delta);
    }
    if (meshRef.current) {
      meshRef.current.visible = (materialRef.current?.opacity ?? 0) > 0.01;
      meshRef.current.rotation.z += delta * 0.16;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.778, -0.1]} visible={false}>
      <ringGeometry args={[0.185, 0.187, 96]} />
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
    const target = visible ? band(phase, 3.32, 0.65) * 0.96 : 0;
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
      position={[0.315, 0.955, 0.12]}
      rotation={[-0.04, -0.3, 0.02]}
      visible={false}
    >
      <mesh>
        <planeGeometry args={[0.101, 0.135]} />
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
        <planeGeometry args={[0.112, 0.146]} />
        <meshBasicMaterial color="#c8a96d" transparent opacity={0.08} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function BookRig({
  progressRef,
  reducedMotion,
}: {
  progressRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const mobile = useThree((state) => state.size.width < 760);
  const bookGroupRef = useRef<THREE.Group>(null);
  const deskGroupRef = useRef<THREE.Group>(null);
  const pedestalGroupRef = useRef<THREE.Group>(null);
  const slipcaseGroupRef = useRef<THREE.Group>(null);
  const deskShadowRef = useRef<THREE.Group>(null);
  const floorShadowRef = useRef<THREE.Group>(null);
  const introRef = useRef(0);

  const book = useAssetGLTF('/models/book-transformed.glb');
  const desk = useAssetGLTF('/models/oak-desk.glb');
  const pedestal = useAssetGLTF('/models/display-pedestal.glb');
  const slipcase = useAssetGLTF('/models/slipcase.glb');

  const bookMorphMesh = useMorphMesh(book.scene);
  const bookMaterials = useSceneMaterials(book.scene);
  const deskMaterials = useSceneMaterials(desk.scene);
  const pedestalMaterials = useSceneMaterials(pedestal.scene);
  const slipcaseMaterials = useSceneMaterials(slipcase.scene);

  useEffect(() => {
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
    configure(deskMaterials, 0.2, '#171310', 0.035);
    configure(pedestalMaterials, 0.46, '#5a4a3a');
    configure(slipcaseMaterials, 0.82, '#8a6a4a');

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
  }, [bookMaterials, deskMaterials, pedestalMaterials, slipcaseMaterials]);

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

    introRef.current = THREE.MathUtils.damp(introRef.current, 1, 1.35, delta);
    const intro = 1 - introRef.current;
    const idle = reducedMotion ? 0 : Math.sin(performance.now() * 0.00055) * 0.0015;

    if (bookGroupRef.current) {
      bookGroupRef.current.position.set(
        lerp(a.position[0], b.position[0], t),
        lerp(a.position[1], b.position[1], t) + intro * 0.19 + idle,
        lerp(a.position[2], b.position[2], t),
      );
      bookGroupRef.current.rotation.set(
        lerp(a.rotation[0], b.rotation[0], t) + intro * 0.12,
        lerp(a.rotation[1], b.rotation[1], t),
        lerp(a.rotation[2], b.rotation[2], t),
      );
    }

    if (bookMorphMesh?.morphTargetInfluences) {
      const influences = bookMorphMesh.morphTargetInfluences;
      influences[0] = 0;
      influences[1] = lerp(a.morph[1], b.morph[1], t);
      influences[2] = lerp(a.morph[2], b.morph[2], t);
    }

    const deskTarget = phase < 3.56 ? 1 : 0.001;
    const pedestalTarget = phase >= 3.62 && phase < 4.63 ? 1 : 0.001;
    const slipcaseTarget = phase >= 4.64 ? 1 : 0.001;

    if (deskGroupRef.current) {
      const next = THREE.MathUtils.damp(deskGroupRef.current.scale.x, deskTarget, 5.5, delta);
      deskGroupRef.current.scale.setScalar(Math.max(0.001, next));
      deskGroupRef.current.visible = next > 0.003;
    }

    if (pedestalGroupRef.current) {
      const next = THREE.MathUtils.damp(pedestalGroupRef.current.scale.x, pedestalTarget, 5.5, delta);
      pedestalGroupRef.current.scale.setScalar(Math.max(0.001, next));
      pedestalGroupRef.current.visible = next > 0.003;
    }

    if (slipcaseGroupRef.current) {
      const next = THREE.MathUtils.damp(slipcaseGroupRef.current.scale.x, slipcaseTarget, 5.5, delta);
      slipcaseGroupRef.current.scale.setScalar(Math.max(0.001, next));
      slipcaseGroupRef.current.visible = next > 0.003;
    }

    if (deskShadowRef.current) deskShadowRef.current.visible = phase < 3.58;
    if (floorShadowRef.current) floorShadowRef.current.visible = phase >= 3.5;
  });

  return (
    <>
      <group ref={deskGroupRef}>
        <group scale={0.001}>
          <primitive object={desk.scene} dispose={null} />
        </group>
      </group>

      <group ref={pedestalGroupRef} visible={false}>
        <group position={[0, 0.06, 0]} scale={0.55}>
          <group scale={0.001}>
            <primitive object={pedestal.scene} dispose={null} />
          </group>
        </group>
      </group>

      <group ref={slipcaseGroupRef} position={[-0.105, 0, 0]} visible={false}>
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
            <ExplodedLayers progressRef={progressRef} />
          </group>
        </group>
      </group>

      <NeuralField progressRef={progressRef} />
      <ScanRing progressRef={progressRef} />
      <QrCompanionCard progressRef={progressRef} />

      <group ref={deskShadowRef}>
        <ContactShadows
          position={[0, 0.7615, 0]}
          scale={1.55}
          resolution={256}
          blur={2.8}
          opacity={0.46}
          far={0.55}
          color="#050403"
          frames={Infinity}
        />
      </group>

      <group ref={floorShadowRef} visible={false}>
        <ContactShadows
          position={[0, 0.004, 0]}
          scale={2.1}
          resolution={256}
          blur={3.1}
          opacity={0.34}
          far={0.8}
          color="#050403"
          frames={Infinity}
        />
      </group>
    </>
  );
}

function SceneContents({
  progressRef,
  pointerRef,
  reducedMotion,
  onReady,
}: {
  progressRef: MutableRefObject<number>;
  pointerRef: PointerRef;
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
        <BookRig progressRef={progressRef} reducedMotion={reducedMotion} />
        <ReadySignal onReady={onReady} />
      </Suspense>

      <CameraRig progressRef={progressRef} pointerRef={pointerRef} reducedMotion={reducedMotion} />
    </>
  );
}

export function BookScene({
  progressRef,
  pointerRef,
  reducedMotion,
  onReady,
}: {
  progressRef: MutableRefObject<number>;
  pointerRef: PointerRef;
  reducedMotion: boolean;
  onReady: () => void;
}) {
  return <SceneContents progressRef={progressRef} pointerRef={pointerRef} reducedMotion={reducedMotion} onReady={onReady} />;
}

