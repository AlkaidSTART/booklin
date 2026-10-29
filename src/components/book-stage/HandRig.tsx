import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSkinMaterial } from './skinMaterial';

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
 * The pair only appears while the board is opening: they fade in as the cover
 * starts to turn and let go before the book lands flat.
 */
const HAND_RIGHT_URL = '/models/hand.glb';
const HAND_LEFT_URL = '/models/hand-left.glb';

const CURL_AXIS = new THREE.Vector3(1, 0, 0);
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

/** Book-local cover mount. The 0.75 scale is what lets both hands share a
 * 148 mm cover: at full size their palms alone exceed the book's width. The
 * +11 mm Z offset is the clearance the sculpt needs — its palm and finger axes
 * share one plane, so touching the board buries the backs of the fingers. */
const BOOK_HAND_SCALE = 0.75;
const BOOK_HAND_Y = -12;
const BOOK_HAND_Z = 11;
const BOOK_HAND_OFFSET = 72;
const BOOK_ROLL = 0;
const BOOK_CURL: [number, number, number] = [0.03, 0.04, 0.02];
const BOOK_THUMB_RIGHT: [number, number, number] = [0.24, 0, -0.08];
const BOOK_THUMB_LEFT: [number, number, number] = [0.24, 0, 0.08];

const tmpCurl = new THREE.Quaternion();
const tmpThumb = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

type Phalanx = { bone: THREE.Bone; rest: THREE.Quaternion; stage: number };

type RiggedHand = {
  mesh: THREE.SkinnedMesh;
  phalanges: Phalanx[];
  thumb: Phalanx;
  thumbTip: Phalanx;
};

function smoothstep(value: number) {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
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
  let mesh: THREE.SkinnedMesh | null = null;
  const bones = new Map<string, THREE.Bone>();
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) mesh = object as THREE.SkinnedMesh;
    if ((object as THREE.Bone).isBone) bones.set(object.name, object as THREE.Bone);
  });
  if (!mesh) throw new Error('hand GLB is missing its skinned mesh');

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
    mesh,
    phalanges,
    thumb: phalanx('thumb_01', 0),
    thumbTip: phalanx('thumb_02', 0),
  };
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

  // Dark, low-key skin with pore-scale detail and a warm scattering bleed; the
  // GLB's own material reads as pale plastic against this scene. Transparent so
  // the hands appear and release with a fade instead of popping in.
  const skin = useMemo(() => {
    const material = createSkinMaterial();
    material.transparent = true;
    return material;
  }, []);

  useEffect(() => {
    rig.mesh.material = skin;
    rig.mesh.frustumCulled = false;
    return () => {
      skin.dispose();
    };
  }, [rig, skin]);

  useFrame(() => {
    const phase = progressRef.current * 8;
    const openness = Math.min(1, Math.max(0, opennessRef.current));
    const amount = reducedMotion ? 0 : 1;
    const t = performance.now() * 0.001;
    const drift = side > 0 ? 0 : 1.9;

    // Hands exist only while the cover is turning: they fade in with the page
    // turn, part outward, and let go before the book lands flat.
    const enter = smoothstep((phase - 2.42) / 0.12);
    const spread = smoothstep((openness - 0.02) / (side > 0 ? 0.52 : 0.26));
    const release =
      side > 0
        ? 1 - smoothstep((openness - 0.35) / 0.2)
        : 1 - smoothstep((openness - 0.3) / 0.15);
    const weight = enter * release;

    rig.mesh.visible = weight > 0.002;
    skin.opacity = weight;

    const anchor = anchorRef.current;
    if (!anchor) return;

    anchor.position.x = BOOK_HAND_OFFSET * side + side * 30 * spread;
    anchor.position.y = BOOK_HAND_Y;
    anchor.position.z = BOOK_HAND_Z + 6 * spread;

    const flutter = Math.sin(t * 0.62 + (side > 0 ? 0 : 1.7)) * 0.012 * amount * weight;
    applyPose(rig, BOOK_CURL, thumb, weight, flutter);

    const grip = gripRef.current;
    if (grip) {
      grip.rotation.x = BOOK_ROLL + Math.sin(t * 0.19 + drift) * 0.01 * amount;
      grip.rotation.z = -side * 0.32 * spread + Math.sin(t * 0.28 + drift) * 0.008 * amount;
      grip.position.y = Math.sin(t * 0.33 + drift) * 0.5 * amount;
    }
  });

  return (
    <group ref={anchorRef} position={[BOOK_HAND_OFFSET * side, BOOK_HAND_Y, BOOK_HAND_Z]}>
      <group ref={gripRef} rotation={[BOOK_ROLL, 0, 0]}>
        <group scale={BOOK_HAND_SCALE}>
          <primitive object={root} dispose={null} />
        </group>
      </group>
    </group>
  );
}

/** Opening hand on the camera side. */
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

/** Opening hand on the spine side (mirrored left rig). */
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

useGLTF.preload(HAND_RIGHT_URL);
useGLTF.preload(HAND_LEFT_URL);
