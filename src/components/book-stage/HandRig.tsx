import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createNailMaterial, createSkinMaterial } from './skinMaterial';

/** Rigged hands built from public/hand/hand.OBJ by scripts/build-hand.py.
 *
 * Local frame: +Y runs wrist -> fingertips, -Z is the palm, +X lies across the
 * knuckles. The mesh is in millimetres, matching the 0.001 groups it is
 * mounted inside. Every bone rolls so its local X is the flexion axis, which
 * means `quaternion * Rx(angle)` curls a digit toward the palm (negative) or
 * lifts it off the held object (positive). The left GLB is the right one
 * mirrored across X, so it shares the same curl direction; only the thumb's
 * small adduction flips sign.
 *
 * The GLB carries two primitives (skin + nail plates). GLTFLoader expands them
 * into two skinned meshes sharing one skeleton, so every material/visibility
 * write below loops the whole rig, not just the skin mesh.
 */
const HAND_RIGHT_URL = '/models/hand.glb';
const HAND_LEFT_URL = '/models/hand-left.glb';

const CURL_AXIS = new THREE.Vector3(1, 0, 0);
const BEND_AXIS = new THREE.Vector3(0, 0, 1);
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const VIEW_AXIS = new THREE.Vector3(0, 0, 1);
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

/** 01 Carry: two hands on the camera-facing cover, palms at the sides.
 *
 * The 0.75 scale is what lets both hands share a 148 mm cover: at full size
 * their palms alone exceed the book's width. The +11 mm Z offset is the
 * clearance the sculpt needs — its palm and finger axes share one plane, so
 * touching the board buries the backs of the fingers. Measured with this mount:
 * zero vertices inside the book. */
const BOOK_HAND_SCALE = 0.75;
const BOOK_HAND_Y = -12;
const BOOK_HAND_Z = 11;
const BOOK_HAND_OFFSET = 72;
const BOOK_ROLL = 0;
/** Book-local spine line, used by the flat-page mount maths. */
const BOOK_SPINE_X = -74;
const BOOK_CURL: [number, number, number] = [0.03, 0.04, 0.02];
const BOOK_THUMB_RIGHT: [number, number, number] = [0.24, 0, -0.08];
const BOOK_THUMB_LEFT: [number, number, number] = [0.24, 0, 0.08];
/** Flat spread, measured off the open mesh: page tops at local z ≈ 0, left half
 * x −222…−77, right half x −74…74. The palms land ~5 mm above the pages. */
const PAGE_HAND_LEFT_X = -148;
const PAGE_HAND_RIGHT_X = 0;
const PAGE_HAND_Y = 100;
const PAGE_HAND_Z = -6;

/** 00 Scan: a one-handed grip. The palm sits on the back cover, the four
 * fingers wrap the left edge onto the glass and the thumb presses the right
 * bezel. The knuckle row is rolled upright about the view axis so the fingers
 * stack along the edge instead of splaying across the back.
 *
 * The arm must not follow that roll (it would come out sideways), so the
 * forearm is pitched forward at the elbow and the wrist counter-rotated by the
 * same amount: the grip orientation is preserved while the forearm hangs below
 * the phone. Both bends sit behind the body, out of the shot.
 *
 * The X anchor looks wild because the elbow joint is 250 mm below the wrist and
 * the mount compensates for the swing it introduces. Retune PHONE_ELBOW only
 * after re-measuring PHONE_ANCHOR against the phone, or the hand leaves frame. */
const PHONE_ANCHOR: [number, number, number] = [-243.7, -25.3, 14.3];
const PHONE_ROLL = 0.61;
const PHONE_ELBOW = 0.96;
const PHONE_WRIST = -0.96;
const PHONE_CURL: [number, number, number] = [-0.22, -0.27, -0.18];
const PHONE_THUMB: [number, number, number] = [0, 0, 0.2];
const PHONE_THUMB_TIP = 0.15;

/** How far the arms wait below the frame before they rise in. */
const ENTER_DISTANCE = 120;

const tmpCurl = new THREE.Quaternion();
const tmpThumb = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

type Phalanx = { bone: THREE.Bone; rest: THREE.Quaternion; stage: number };

type RiggedHand = {
  meshes: THREE.SkinnedMesh[];
  mesh: THREE.SkinnedMesh;
  phalanges: Phalanx[];
  thumb: Phalanx;
  thumbTip: Phalanx;
  elbow: Phalanx;
  wrist: Phalanx;
};

function smoothstep(value: number) {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}

function materialName(mesh: THREE.SkinnedMesh): string {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.map((material) => material.name).join(' ');
}

/** Clone a skinned node and rebind the copy to its own bones; a plain
 * Object3D.clone() would leave both hands fighting over one skeleton. */
function cloneSkinned(source: THREE.Object3D): THREE.Object3D {
  const clone = source.clone(true);
  const cloneBones = new Map<string, THREE.Bone>();
  clone.traverse((object) => {
    const bone = object as THREE.Bone;
    if (bone.isBone) cloneBones.set(bone.name, bone);
  });

  source.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const copy = clone.getObjectByName(mesh.name) as THREE.SkinnedMesh | null;
    if (!copy) return;
    const bones = mesh.skeleton.bones.map((bone) => cloneBones.get(bone.name) ?? bone);
    copy.bind(new THREE.Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
  });

  return clone;
}

function buildRig(root: THREE.Object3D): RiggedHand {
  const meshes: THREE.SkinnedMesh[] = [];
  const bones = new Map<string, THREE.Bone>();
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(object as THREE.SkinnedMesh);
    if ((object as THREE.Bone).isBone) bones.set(object.name, object as THREE.Bone);
  });
  if (meshes.length === 0) throw new Error('hand GLB is missing its skinned mesh');
  const mesh = meshes.find((candidate) => !/nail/i.test(materialName(candidate))) ?? meshes[0];

  const bone = (name: string) => {
    const found = bones.get(name);
    if (!found) throw new Error(`hand GLB is missing bone ${name}`);
    return found;
  };
  const phalanx = (name: string, stage: number): Phalanx => ({
    bone: bone(name),
    rest: bone(name).quaternion.clone(),
    stage,
  });

  const phalanges: Phalanx[] = [];
  for (const finger of FINGERS) {
    phalanges.push(phalanx(`${finger}_01`, 0));
    phalanges.push(phalanx(`${finger}_02`, 1));
    phalanges.push(phalanx(`${finger}_03`, 2));
  }

  return {
    meshes,
    mesh,
    phalanges,
    thumb: phalanx('thumb_01', 0),
    thumbTip: phalanx('thumb_02', 0),
    elbow: phalanx('forearm', 0),
    wrist: phalanx('wrist', 0),
  };
}

/** Swap the GLB's own materials for the runtime skin/nail pair, matching by
 * material name so the two primitives of the split mesh each get theirs. */
function assignMaterials(
  rig: RiggedHand,
  skin: THREE.Material,
  nail: THREE.Material,
) {
  for (const mesh of rig.meshes) {
    // A split glTF primitive mesh has exactly one material. Wrapping it in an
    // array makes three.js look for geometry groups (there are none) and draw
    // nothing, so keep the single-material form for single-material meshes.
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) => (/nail/i.test(material.name) ? nail : skin));
    } else {
      mesh.material = /nail/i.test(mesh.material.name) ? nail : skin;
    }
    mesh.frustumCulled = false;
  }
}

function useRiggedHand(url: string) {
  const { scene } = useGLTF(url);
  const root = useMemo(() => cloneSkinned(scene), [scene]);
  const rig = useMemo(() => buildRig(root), [root]);
  return { root, rig };
}

function applyPose(
  rig: RiggedHand,
  curl: [number, number, number],
  thumb: [number, number, number],
  thumbTip: number,
  weight: number,
  flutter: number,
) {
  for (const { bone, rest, stage } of rig.phalanges) {
    const angle = curl[stage] * weight + flutter * (0.6 + stage * 0.35);
    tmpCurl.setFromAxisAngle(CURL_AXIS, angle);
    bone.quaternion.copy(rest).multiply(tmpCurl);
  }

  tmpEuler.set(thumb[0] * weight, thumb[1] * weight, thumb[2] * weight, 'XYZ');
  tmpThumb.setFromEuler(tmpEuler);
  rig.thumb.bone.quaternion.copy(rig.thumb.rest).multiply(tmpThumb);

  tmpCurl.setFromAxisAngle(CURL_AXIS, thumbTip * weight);
  rig.thumbTip.bone.quaternion.copy(rig.thumbTip.rest).multiply(tmpCurl);
}

/** Phone grip only: swing the forearm below the phone and cancel the swing at
 * the wrist, so the hand keeps the mount's roll. Set once — the pose is static
 * and both joints are hidden behind the phone. */
function applyArm(rig: RiggedHand) {
  tmpCurl.setFromAxisAngle(BEND_AXIS, PHONE_ELBOW);
  rig.elbow.bone.quaternion.copy(rig.elbow.rest).multiply(tmpCurl);
  tmpCurl.setFromAxisAngle(BEND_AXIS, PHONE_WRIST);
  rig.wrist.bone.quaternion.copy(rig.wrist.rest).multiply(tmpCurl);
}

function BookHand({
  progressRef,
  opennessRef,
  reducedMotion,
  url,
  side,
  thumb,
}: {
  progressRef: MutableRefObject<number>;
  opennessRef: MutableRefObject<number>;
  reducedMotion: boolean;
  url: string;
  side: -1 | 1;
  thumb: [number, number, number];
}) {
  const { root, rig } = useRiggedHand(url);
  const anchorRef = useRef<THREE.Group>(null);
  const gripRef = useRef<THREE.Group>(null);
  const hingeRef = useRef<THREE.Group>(null);

  // Dark, low-key skin with pore-scale detail and a warm scattering bleed; the
  // GLB's own material reads as pale plastic against this scene. Transparent so
  // the hands can release with a fade instead of popping out.
  const skin = useMemo(() => {
    const material = createSkinMaterial();
    material.transparent = true;
    return material;
  }, []);
  const nail = useMemo(() => {
    const material = createNailMaterial();
    material.transparent = true;
    return material;
  }, []);

  useEffect(() => {
    assignMaterials(rig, skin, nail);
    return () => {
      skin.dispose();
      nail.dispose();
    };
  }, [rig, skin, nail]);

  useFrame(() => {
    const phase = progressRef.current * 8;
    const openness = Math.min(1, Math.max(0, opennessRef.current));
    const amount = reducedMotion ? 0 : 1;
    const t = performance.now() * 0.001;
    const drift = side > 0 ? 0 : 1.9;

    // --- Cover beat: rise, hold the closed board, then part outward as it opens.
    const enter = smoothstep((phase - 1.72) / 0.22);
    const spread = smoothstep((openness - 0.02) / (side > 0 ? 0.52 : 0.26));
    const release =
      side > 0
        ? 1 - smoothstep((openness - 0.35) / 0.2)
        : 1 - smoothstep((openness - 0.3) / 0.15);
    const coverPresence =
      enter * release * (1 - smoothstep((phase - 2.82) / 0.12));

    // --- Flat beat: once the book is spread, the hands settle onto the two
    // pages with the fingers pointing at the spine and the forearms leaving
    // the book's sides. They move while invisible, then fade in on the pages.
    const settle = smoothstep((phase - 2.86) / 0.18);
    const pagePresence =
      smoothstep((phase - 3.0) / 0.14) * (1 - smoothstep((phase - 3.72) / 0.2));

    const weight = Math.max(coverPresence, pagePresence);
    for (const mesh of rig.meshes) mesh.visible = weight > 0.002;
    skin.opacity = weight;
    nail.opacity = weight;

    const anchor = anchorRef.current;
    if (!anchor) return;

    const coverX = BOOK_HAND_OFFSET * side + side * 30 * spread - BOOK_SPINE_X;
    const flatX = (side > 0 ? PAGE_HAND_RIGHT_X : PAGE_HAND_LEFT_X) - BOOK_SPINE_X;
    const coverY = BOOK_HAND_Y - ENTER_DISTANCE * (1 - enter);
    const coverZ = BOOK_HAND_Z + 6 * spread;

    anchor.position.x = coverX + (flatX - coverX) * settle;
    anchor.position.y = coverY + (PAGE_HAND_Y - coverY) * settle;
    anchor.position.z = coverZ + (PAGE_HAND_Z - coverZ) * settle;

    const flutter = Math.sin(t * 0.62 + (side > 0 ? 0 : 1.7)) * 0.012 * amount * weight;
    applyPose(rig, BOOK_CURL, thumb, 0, weight, flutter);

    const grip = gripRef.current;
    if (grip) {
      grip.rotation.x = BOOK_ROLL + Math.sin(t * 0.19 + drift) * 0.01 * amount;
      grip.rotation.z =
        (1 - settle) * -side * 0.32 * spread +
        (settle * side * Math.PI) / 2 +
        Math.sin(t * 0.28 + drift) * 0.008 * amount;
      grip.position.y = Math.sin(t * 0.33 + drift) * 0.5 * amount;
    }
  });

  return (
    <group ref={hingeRef} position={[BOOK_SPINE_X, 0, 0]}>
      <group
        ref={anchorRef}
        position={[
          BOOK_HAND_OFFSET * side - BOOK_SPINE_X,
          BOOK_HAND_Y - ENTER_DISTANCE,
          BOOK_HAND_Z,
        ]}
      >
        <group ref={gripRef} rotation={[BOOK_ROLL, 0, 0]}>
          <group scale={BOOK_HAND_SCALE}>
            <primitive object={root} dispose={null} />
          </group>
        </group>
      </group>
    </group>
  );
}

/** 01 carry, right hand. */
export function HandRig({
  progressRef,
  opennessRef,
  reducedMotion,
}: {
  progressRef: MutableRefObject<number>;
  opennessRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  return (
    <BookHand
      progressRef={progressRef}
      opennessRef={opennessRef}
      reducedMotion={reducedMotion}
      url={HAND_RIGHT_URL}
      side={1}
      thumb={BOOK_THUMB_RIGHT}
    />
  );
}

/** 01 carry, left hand — the mirrored rig, so the pair reads as two hands
 * taking the covers to open the book. */
export function LeftHandRig({
  progressRef,
  opennessRef,
  reducedMotion,
}: {
  progressRef: MutableRefObject<number>;
  opennessRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  return (
    <BookHand
      progressRef={progressRef}
      opennessRef={opennessRef}
      reducedMotion={reducedMotion}
      url={HAND_LEFT_URL}
      side={-1}
      thumb={BOOK_THUMB_LEFT}
    />
  );
}

/** 00 scan. Mounted inside the phone's millimetre group, behind the body, so
 * the phone's own transform is the grip. `opacityRef` is written by the
 * scanner every frame. */
export function PhoneHandRig({
  opacityRef,
  reducedMotion,
}: {
  opacityRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const { root, rig } = useRiggedHand(HAND_RIGHT_URL);
  const handRef = useRef<THREE.Group>(null);
  const wobbleRef = useRef<THREE.Group>(null);

  // Face the palm at the back cover, then roll the knuckle row upright about
  // the view axis. Premultiplying puts the roll outside the half-turn.
  const mount = useMemo(() => {
    const quaternion = new THREE.Quaternion().setFromAxisAngle(UP_AXIS, Math.PI);
    return quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(VIEW_AXIS, PHONE_ROLL));
  }, []);

  const skin = useMemo(() => {
    const material = createSkinMaterial();
    material.transparent = true;
    material.opacity = 0;
    return material;
  }, []);
  const nail = useMemo(() => {
    const material = createNailMaterial();
    material.transparent = true;
    material.opacity = 0;
    return material;
  }, []);

  useEffect(() => {
    assignMaterials(rig, skin, nail);
    applyArm(rig);
    return () => {
      skin.dispose();
      nail.dispose();
    };
  }, [rig, skin, nail]);

  useFrame(() => {
    const opacity = Math.min(1, Math.max(0, opacityRef.current));
    skin.opacity = opacity;
    nail.opacity = opacity;
    // Invisible but still depth-writing would punch a hole through the phone.
    for (const mesh of rig.meshes) mesh.visible = opacity > 0.002;

    const hand = handRef.current;
    if (!hand) return;

    // The grip settles against the phone rather than riding it rigidly;
    // amplitudes stay under a degree so the fingers never leave the edge.
    const t = performance.now() * 0.001;
    const amount = reducedMotion ? 0 : opacity;
    const flutter = Math.sin(t * 0.5 + 1.1) * 0.01 * amount;
    applyPose(rig, PHONE_CURL, PHONE_THUMB, PHONE_THUMB_TIP, opacity, flutter);

    const wobble = wobbleRef.current;
    if (wobble) {
      wobble.rotation.x = Math.sin(t * 0.23 + 0.7) * 0.006 * amount;
      wobble.rotation.z = Math.sin(t * 0.17 + 2.1) * 0.008 * amount;
    }
    hand.position.z = PHONE_ANCHOR[2] + Math.sin(t * 0.29) * 1.2 * amount;
  });

  return (
    <group ref={handRef} position={PHONE_ANCHOR} quaternion={mount}>
      <group ref={wobbleRef}>
        <primitive object={root} dispose={null} />
      </group>
    </group>
  );
}

useGLTF.preload(HAND_RIGHT_URL);
useGLTF.preload(HAND_LEFT_URL);
