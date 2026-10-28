import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSkinMaterial } from './skinMaterial';

/** Rigged right hand built from public/hand/hand.OBJ by scripts/build-hand.py.
 *
 * Local frame: +Y runs wrist -> fingertips, -Z is the palm, +X lies across the
 * knuckles. The mesh is in millimetres, matching the 0.001 groups it is
 * mounted inside. Every bone rolls so its local X is the flexion axis, which
 * means `quaternion * Rx(angle)` curls a digit toward the palm (negative) or
 * lifts it off the held object (positive).
 *
 * The source sculpt is an open, relaxed hand, so the holds are not baked: the
 * two mounts below place the palm against the object and the bones supply the
 * thumb wrap plus a breathing flex.
 */
const HAND_URL = '/models/hand.glb';

const CURL_AXIS = new THREE.Vector3(1, 0, 0);
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

/** 01 Carry: palm on the camera-facing cover, fingers up it, arm out below.
 * The +6 mm keeps the finger volumes off the board instead of halved by it. */
const BOOK_ANCHOR: [number, number, number] = [20, 0, 6];
const BOOK_ROLL = -0.2;
const BOOK_CURL: [number, number, number] = [0.12, 0.16, 0.08];
/** thumb_01 local XYZ euler; lifts the relaxed thumb onto the cover. */
const BOOK_THUMB: [number, number, number] = [0.24, 0, -0.08];
const BOOK_THUMB_TIP = 0;

/** 00 Scan: the hand sits behind the phone, palm on the back cover, four
 * fingers up the back and the thumb around the front-left bezel. */
const PHONE_ANCHOR: [number, number, number] = [0, 20, 9.5];
const PHONE_CURL: [number, number, number] = [0.02, 0.03, 0.02];
/** Tip lands at (x 41, z 10) mm — 5 mm inside the left edge and in front of the
 * glass, so the 20 mm thumb pad covers the bezel and spills past the side.
 * The hidden middle section passes through the body, which the phone hides. */
const PHONE_THUMB: [number, number, number] = [-0.2, 0, -0.35];
const PHONE_THUMB_TIP = 0.4;

/** How far the arm waits below the frame before it rises in. */
const ENTER_DISTANCE = 120;

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
  const meshes: THREE.SkinnedMesh[] = [];
  const bones = new Map<string, THREE.Bone>();
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(object as THREE.SkinnedMesh);
    if ((object as THREE.Bone).isBone) bones.set(object.name, object as THREE.Bone);
  });
  const mesh = meshes[0];
  if (!mesh) throw new Error('hand.glb is missing its skinned mesh');

  const bone = (name: string) => {
    const found = bones.get(name);
    if (!found) throw new Error(`hand.glb is missing bone ${name}`);
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

function useRiggedHand() {
  const { scene } = useGLTF(HAND_URL);
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

/** 01 carry. The hand rises from below the frame, holds the book's bottom
 * edge, and leaves before the phone hand takes over. */
export function HandRig({
  progressRef,
  reducedMotion,
}: {
  progressRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const { root, rig } = useRiggedHand();
  const anchorRef = useRef<THREE.Group>(null);
  const gripRef = useRef<THREE.Group>(null);

  // Dark, low-key skin with pore-scale detail and a warm scattering bleed; the
  // GLB's own material reads as pale plastic against this scene.
  const skin = useMemo(() => createSkinMaterial(), []);

  useEffect(() => {
    rig.mesh.material = skin;
    rig.mesh.frustumCulled = false;
    return () => {
      skin.dispose();
    };
  }, [rig, skin]);

  useFrame(() => {
    const phase = progressRef.current * 8;
    // Starts after the phone has left the frame, so the right hand is never
    // holding two objects at once.
    const enter = smoothstep((phase - 2.14) / 0.16);
    const leave = 1 - smoothstep((phase - 2.86) / 0.12);
    const weight = enter * leave;

    const anchor = anchorRef.current;
    if (!anchor) return;

    anchor.visible = weight > 0.004;
    anchor.position.y = BOOK_ANCHOR[1] - ENTER_DISTANCE * (1 - weight);

    // The thumb wraps as the hand settles; the finger flex is a breath rather
    // than an animation.
    const t = performance.now() * 0.001;
    const amount = reducedMotion ? 0 : 1;
    const flutter = Math.sin(t * 0.62) * 0.012 * amount * weight;
    applyPose(rig, BOOK_CURL, BOOK_THUMB, BOOK_THUMB_TIP, weight, flutter);

    // A hand that holds perfectly still reads as a prop.
    const grip = gripRef.current;
    if (grip) {
      grip.rotation.x = BOOK_ROLL + Math.sin(t * 0.19 + 1.3) * 0.01 * amount;
      grip.rotation.z = Math.sin(t * 0.28) * 0.008 * amount;
      grip.position.y = Math.sin(t * 0.33) * 0.5 * amount;
    }
  });

  return (
    <group
      ref={anchorRef}
      position={[BOOK_ANCHOR[0], BOOK_ANCHOR[1] - ENTER_DISTANCE, BOOK_ANCHOR[2]]}
      visible={false}
    >
      <group ref={gripRef} rotation={[BOOK_ROLL, 0, 0]}>
        <primitive object={root} dispose={null} />
      </group>
    </group>
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
  const { root, rig } = useRiggedHand();
  const handRef = useRef<THREE.Group>(null);

  const skin = useMemo(() => {
    const material = createSkinMaterial();
    material.transparent = true;
    material.opacity = 0;
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
    const opacity = Math.min(1, Math.max(0, opacityRef.current));
    skin.opacity = opacity;
    // Invisible but still depth-writing would punch a hole through the phone.
    rig.mesh.visible = opacity > 0.002;

    const hand = handRef.current;
    if (!hand) return;

    // The arm settles against the grip rather than riding the phone rigidly;
    // amplitudes stay under a degree so the thumb never leaves the bezel.
    const t = performance.now() * 0.001;
    const amount = reducedMotion ? 0 : opacity;
    const flutter = Math.sin(t * 0.5 + 1.1) * 0.01 * amount;
    applyPose(rig, PHONE_CURL, PHONE_THUMB, PHONE_THUMB_TIP, opacity, flutter);

    hand.rotation.x = Math.sin(t * 0.23 + 0.7) * 0.006 * amount;
    hand.rotation.z = Math.sin(t * 0.17 + 2.1) * 0.008 * amount;
    hand.position.z = Math.sin(t * 0.29) * 1.2 * amount;
  });

  return (
    <group
      ref={handRef}
      position={PHONE_ANCHOR}
      rotation={[0, Math.PI, 0]}
    >
      <primitive object={root} dispose={null} />
    </group>
  );
}

useGLTF.preload(HAND_URL);
