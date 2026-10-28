import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

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

export function HandRig({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const { scene } = useGLTF('/models/hand-blockout.glb');
  const anchorRef = useRef<THREE.Group>(null);

  // Dark, low-key skin: the blockout only survives in rim light, and a stock
  // GLB material reads as pale plastic against this scene.
  const skin = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#120b08'),
        roughness: 0.78,
        metalness: 0,
        sheen: 0.2,
        sheenColor: new THREE.Color('#6d4526'),
        sheenRoughness: 0.85,
        envMapIntensity: 0.22,
      }),
    [],
  );

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
    const enter = smoothstep((phase - 2.04) / 0.14);
    const leave = 1 - smoothstep((phase - 2.86) / 0.12);
    const weight = enter * leave;

    const anchor = anchorRef.current;
    if (!anchor) return;

    anchor.visible = weight > 0.004;
    anchor.position.y = GRIP_POSITION[1] - ENTER_DISTANCE * (1 - weight);
  });

  return (
    <group
      ref={anchorRef}
      position={[GRIP_POSITION[0], GRIP_POSITION[1] - ENTER_DISTANCE, GRIP_POSITION[2]]}
      visible={false}
    >
      <group rotation={[GRIP_ROLL, 0, 0]}>
        <primitive object={scene} dispose={null} />
      </group>
    </group>
  );
}

useGLTF.preload('/models/hand-blockout.glb');
