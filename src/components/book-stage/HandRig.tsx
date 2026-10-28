import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSkinMaterial } from './skinMaterial';

/** The blockout hand grips a 34 mm cylinder. After the glTF Y-up conversion its
 * local axes are: X = grip axis, -Z = palm side, -Y = forearm. It holds the
 * book's bottom edge — fingers across the width, palm on the back cover — and is
 * rolled about that edge so the forearm swings toward the camera and leaves the
 * frame instead of stabbing through the desk. */
const GRIP_ROLL = -0.42;
const GRIP_POSITION: [number, number, number] = [20, 0, 0];

/** How far the arm waits below the frame before it rises in. */
const ENTER_DISTANCE = 120;

function smoothstep(value: number) {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}

export function HandRig({
  progressRef,
  reducedMotion,
}: {
  progressRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const { scene } = useGLTF('/models/hand-blockout.glb');
  const anchorRef = useRef<THREE.Group>(null);
  const gripRef = useRef<THREE.Group>(null);

  // Dark, low-key skin with pore-scale detail and a warm scattering bleed; a
  // stock GLB material reads as pale plastic against this scene.
  const skin = useMemo(() => createSkinMaterial(), []);

  useEffect(() => {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.material = skin;
    });
    return () => {
      skin.dispose();
    };
  }, [scene, skin]);

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
    anchor.position.y = GRIP_POSITION[1] - ENTER_DISTANCE * (1 - weight);

    // A hand that holds perfectly still reads as a prop. A breath of drift and
    // roll keeps it alive without becoming an animation.
    const grip = gripRef.current;
    if (grip) {
      const t = performance.now() * 0.001;
      const amount = reducedMotion ? 0 : 1;
      grip.rotation.x = GRIP_ROLL + Math.sin(t * 0.19 + 1.3) * 0.01 * amount;
      grip.rotation.z = Math.sin(t * 0.28) * 0.008 * amount;
      grip.position.y = Math.sin(t * 0.33) * 0.5 * amount;
    }
  });

  return (
    <group
      ref={anchorRef}
      position={[GRIP_POSITION[0], GRIP_POSITION[1] - ENTER_DISTANCE, GRIP_POSITION[2]]}
      visible={false}
    >
      <group ref={gripRef} rotation={[GRIP_ROLL, 0, 0]}>
        <primitive object={scene} dispose={null} />
      </group>
    </group>
  );
}

/**
 * The claim-chapter hand. This blockout is modelled around a 92 x 188 mm body:
 * palm behind the phone's back plane, fingers up the back, thumb wrapping the
 * front-left bezel. After the glTF Y-up conversion it maps 1:1 onto the phone
 * group, so mounting it at identity makes the phone's own transform the grip.
 *
 * Unlike the book hand it fades instead of rising, because it has to share the
 * phone's fade window; `opacityRef` is written by the scanner every frame.
 */
export function PhoneHandRig({
  opacityRef,
  reducedMotion,
}: {
  opacityRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const { scene } = useGLTF('/models/hand-phone.glb');
  const handRef = useRef<THREE.Group>(null);

  const skin = useMemo(() => {
    const material = createSkinMaterial();
    material.transparent = true;
    material.opacity = 0;
    return material;
  }, []);

  useEffect(() => {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.material = skin;
    });
    return () => {
      skin.dispose();
    };
  }, [scene, skin]);

  useFrame(() => {
    const opacity = Math.min(1, Math.max(0, opacityRef.current));
    skin.opacity = opacity;

    const hand = handRef.current;
    if (!hand) return;

    // The arm settles against the grip rather than riding the phone rigidly.
    // Amplitudes stay under a degree so the thumb never leaves the bezel.
    const t = performance.now() * 0.001;
    const amount = reducedMotion ? 0 : opacity;
    // This group sits inside the caller's 0.001 wrapper, so the offset is in
    // millimetres like the source mesh.
    hand.rotation.x = Math.sin(t * 0.23 + 0.7) * 0.006 * amount;
    hand.rotation.z = Math.sin(t * 0.17 + 2.1) * 0.008 * amount;
    hand.position.z = Math.sin(t * 0.29) * 1.2 * amount;
  });

  return (
    <group ref={handRef}>
      <primitive object={scene} dispose={null} />
    </group>
  );
}

useGLTF.preload('/models/hand-blockout.glb');
useGLTF.preload('/models/hand-phone.glb');
