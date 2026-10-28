import type * as THREE from 'three';

/** Objects the phone's rear camera is allowed to see. */
export const PHONE_CAMERA_LAYER = 1;

export function enableLayer(root: THREE.Object3D | null | undefined, layer: number) {
  root?.traverse((object) => object.layers.enable(layer));
}
