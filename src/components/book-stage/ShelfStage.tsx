import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { RoundedBox, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { enableLayer, PHONE_CAMERA_LAYER } from '../../lib/stage/layers';

export const SHELF_PHASE_COUNT = 8;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

export function shelfPresence(phase: number) {
  const shelfIn = smoothstep((phase - 0.28) / 0.36);
  const shelfOut = 1 - smoothstep((phase - 2.3) / 0.12);
  const shelfReturn = smoothstep((phase - 5.55) / 0.18) * (1 - smoothstep((phase - 6.6) / 0.15));
  return Math.max(shelfIn * shelfOut, shelfReturn);
}

export function shelfSeatPulse(phase: number) {
  return smoothstep(1 - Math.abs(phase - 0.82) / 0.11);
}

type Vec3 = [number, number, number];

export type ShelfPick = {
  x: number;
  row: number;
  rowY: number;
  slot: number;
  title: string;
  subtitle: string;
};

/**
 * Live pointer focus for the shelf, in shelf-local millimetres.
 * `tick` increments on every click so the selection halo can fire one pulse
 * per press without a React render in the animation loop.
 */
export type ShelfFocus = {
  x: number;
  rowY: number;
  active: boolean;
  tick: number;
};

const PICK_TITLES = [
  { title: '书链', subtitle: 'CODEX 1 · PAPER + CLOUD' },
  { title: 'PAGE 042.', subtitle: 'HAPTIC ADDRESS · PAPER + CLOUD' },
  { title: 'NIGHT COPY.', subtitle: 'LOOP EDITION · PAPER + CLOUD' },
  { title: 'THE FIRST READER.', subtitle: 'SHELF COPY 0001 · PAPER + CLOUD' },
  { title: 'CELLULOSE.', subtitle: 'STRUCTURE NOTES · PAPER + CLOUD' },
];

const PICK_SLOTS = [0.03, 0.13, 0.23, 0.33];

export function useShelfPick(): ShelfPick {
  return useState<ShelfPick>(() => {
    const slot = Math.floor(Math.random() * PICK_SLOTS.length);
    const title = PICK_TITLES[Math.floor(Math.random() * PICK_TITLES.length)];
    return {
      x: PICK_SLOTS[slot],
      row: 2,
      rowY: 0.824,
      slot,
      ...title,
    };
  })[0];
}

/* ------------------------------------------------------------------
   Materials & textures
   ------------------------------------------------------------------ */

function makePageTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#b9a47e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, 'rgba(70, 52, 32, 0.26)');
  grad.addColorStop(0.18, 'rgba(70, 52, 32, 0)');
  grad.addColorStop(0.84, 'rgba(255, 246, 222, 0.14)');
  grad.addColorStop(1, 'rgba(70, 52, 32, 0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 2) {
    const alpha = 0.035 + Math.random() * 0.075;
    ctx.strokeStyle = `rgba(46, 34, 20, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.random() * 1.2);
    ctx.lineTo(canvas.width, y + Math.random() * 1.2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Neutral cloth weave for the modelled front covers. It is almost white so the
 * per-book instance colour still owns the hue; the weave only breaks up the
 * flat board when a cover is presented square to the camera.
 */
function makeCoverTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#f4f1eb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x < canvas.width; x += 2) {
    const alpha = 0.02 + Math.random() * 0.03;
    ctx.fillStyle = `rgba(20, 16, 12, ${alpha})`;
    ctx.fillRect(x, 0, 1, canvas.height);
  }
  for (let y = 0; y < canvas.height; y += 2) {
    const alpha = 0.02 + Math.random() * 0.03;
    ctx.fillStyle = `rgba(255, 252, 244, ${alpha})`;
    ctx.fillRect(0, y, canvas.width, 1);
  }
  for (let i = 0; i < 1400; i += 1) {
    const alpha = 0.01 + Math.random() * 0.035;
    ctx.fillStyle = `rgba(24, 18, 12, ${alpha})`;
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 3);
  texture.anisotropy = 4;
  return texture;
}

const CLOTH_PALETTE = [
  '#241b16',
  '#1e1714',
  '#1a2022',
  '#2a2016',
  '#2c1a18',
  '#191e1c',
  '#33261a',
  '#341d19',
  '#1f1f1f',
  '#242419',
  '#3d2b1d',
  '#15181b',
  '#42311f',
  '#4a3722',
];

const GOLD = '#8a6a3e';

const pageBlockBase = '#bfa87f';

/* ------------------------------------------------------------------
   Procedural shelf books
   ------------------------------------------------------------------ */

type BookSpec = {
  x: number;
  rowY: number;
  w: number;
  h: number;
  d: number;
  lean: number;
  color: string;
  pageTint: string;
  bands: number;
  label: boolean;
  labelTint: string;
};

function buildShelfBooks(gapX: number): BookSpec[] {
  const specs: BookSpec[] = [];
  const innerL = -670;
  const innerR = 670;
  const rows = [
    { y: 354, maxH: 410, gap: false },
    { y: 824, maxH: 410, gap: true },
    { y: 1294, maxH: 440, gap: false },
  ];
  let seed = 9317;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const gapHalf = 40;
  const gapCenter = gapX * 1000;

  for (const row of rows) {
    let x = innerL + 14 + rand() * 30;
    while (x < innerR - 24) {
      const w = 20 + rand() * 26;
      const h = Math.min(row.maxH, 176 + rand() * (row.maxH - 176));
      const d = 132 + rand() * 54;
      const color = CLOTH_PALETTE[Math.floor(rand() * CLOTH_PALETTE.length)];
      const lean = rand() > 0.94 ? (rand() > 0.5 ? 1 : -1) * (0.012 + rand() * 0.02) : 0;
      const spec: BookSpec = {
        x,
        rowY: row.y,
        w,
        h,
        d,
        lean,
        color,
        pageTint: rand() > 0.5 ? '#c8b48c' : pageBlockBase,
        bands: rand() > 0.68 ? 2 : 0,
        label: rand() > 0.78,
        labelTint: rand() > 0.55 ? '#8a7350' : '#6e5a3f',
      };

      if (row.gap) {
        const left = spec.x;
        const right = spec.x + spec.w;
        const gapLeft = gapCenter - gapHalf;
        const gapRight = gapCenter + gapHalf;
        if (right > gapLeft - 10 && left < gapRight + 10) {
          x = gapRight + 14;
          continue;
        }
      }

      if (x + w > innerR) break;
      specs.push(spec);
      x += w + 1 + rand() * 2.4;
    }
  }

  return specs;
}

export function ShelfBooks({
  pick,
  progressRef,
  focusRef,
}: {
  pick: ShelfPick;
  progressRef: MutableRefObject<number>;
  focusRef: MutableRefObject<ShelfFocus | null>;
}) {
  const specs = useMemo(() => buildShelfBooks(pick.x), [pick.x]);
  const pageTexture = useMemo(makePageTexture, []);
  const coverTexture = useMemo(makeCoverTexture, []);

  const pageRef = useRef<THREE.InstancedMesh>(null);
  const coverRef = useRef<THREE.InstancedMesh>(null);
  const spineRef = useRef<THREE.InstancedMesh>(null);
  const roundedSpineRef = useRef<THREE.InstancedMesh>(null);
  const bandRef = useRef<THREE.InstancedMesh>(null);
  const labelRef = useRef<THREE.InstancedMesh>(null);
  const coverPanelRef = useRef<THREE.InstancedMesh>(null);
  const coverGoldRef = useRef<THREE.InstancedMesh>(null);
  const coverLabelRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);

  const hoverRef = useRef<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const focusTickRef = useRef(0);
  const pullRef = useRef(new Float32Array(specs.length));
  const tiltRef = useRef(new Float32Array(specs.length));
  const yawRef = useRef(new Float32Array(specs.length));
  const presentRef = useRef(new Float32Array(specs.length));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const gl = useThree((state) => state.gl);

  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const roundedSpineGeometry = useMemo(
    () => new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, -Math.PI / 2, Math.PI),
    [],
  );

  const pageMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: pageTexture ?? undefined,
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.26,
    });
  }, [pageTexture]);

  const clothMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.78,
        metalness: 0.02,
        envMapIntensity: 0.3,
      }),
    [],
  );

  const goldMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: GOLD,
        roughness: 0.52,
        metalness: 0.62,
        envMapIntensity: 0.42,
      }),
    [],
  );

  const labelMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.8,
        metalness: 0,
        envMapIntensity: 0.16,
      }),
    [],
  );

  // Front-cover board. Tinted per instance from the book's cloth colour, so
  // every book gets its own simple cover without a texture per book.
  const coverMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map: coverTexture ?? undefined,
        roughness: 0.9,
        metalness: 0,
        envMapIntensity: 0.18,
      }),
    [coverTexture],
  );

  // Invisible pick proxy: one box per book, on the same pivot as the modelled
  // spine, so a click resolves to a single index. Keeping this separate from
  // the visible instanced meshes means bands and labels can never steal a hit.
  const hitMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    [],
  );

  const goldBase = useMemo(() => new THREE.Color(GOLD), []);

  // Instance slot for each book's decorative bands / label (sparse meshes).
  const bandStart = useMemo(() => {
    let cursor = 0;
    return specs.map((spec) => {
      if (spec.bands <= 0) return -1;
      const start = cursor;
      cursor += 2;
      return start;
    });
  }, [specs]);

  const labelStart = useMemo(() => {
    let cursor = 0;
    return specs.map((spec) => {
      if (!spec.label) return -1;
      const start = cursor;
      cursor += 1;
      return start;
    });
  }, [specs]);

  /**
   * Writes one book into every instanced mesh at once.
   *
   * `pull` slides the book out along +Z. `yaw` turns it about its own centre so
   * the front board faces the reader, and `tilt` leans it forward around the
   * bottom of the spine for the small hover nudge.
   */
  const writeBook = (index: number, pull: number, tilt: number, yaw: number) => {
    const spec = specs[index];
    if (!spec) return;

    const w = spec.w;
    const h = spec.h;
    const d = spec.d;

    // Yaw pivots on the book's centre; tilt pivots on the bottom of the spine.
    // Composing the two keeps the presented cover square to the camera while
    // the hover peek still hinges from the shelf lip.
    const yawPivotY = spec.rowY + h / 2;
    const yawPivotZ = -d / 2;
    const tiltPivotY = spec.rowY;
    const tiltPivotZ = -0.6;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosX = Math.cos(tilt);
    const sinX = Math.sin(tilt);

    const place = (
      mesh: THREE.InstancedMesh | null,
      slot: number,
      baseX: number,
      baseY: number,
      baseZ: number,
      scaleX: number,
      scaleY: number,
      scaleZ: number,
    ) => {
      if (!mesh || slot < 0) return;

      const dx0 = baseX - spec.x;
      const dy0 = baseY - yawPivotY;
      const dz0 = baseZ - yawPivotZ;
      const dx1 = dx0 * cosY + dz0 * sinY;
      const dz1 = -dx0 * sinY + dz0 * cosY;

      const dy1 = baseY - tiltPivotY;
      const dzTilt = yawPivotZ + dz1 - tiltPivotZ;
      dummy.position.set(
        spec.x + dx1,
        tiltPivotY + dy1 * cosX - dzTilt * sinX,
        tiltPivotZ + dy1 * sinX + dzTilt * cosX + pull,
      );
      dummy.rotation.set(tilt, yaw, spec.lean);
      dummy.scale.set(scaleX, scaleY, scaleZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    };

    place(pageRef.current, index, spec.x, spec.rowY + h / 2, -d / 2, w - 5, h - 8, d - 8);
    place(
      coverRef.current,
      index * 2,
      spec.x - (w / 2 - 1.2),
      spec.rowY + h / 2,
      -d / 2 + 0.5,
      2.4,
      h + 2,
      d + 3,
    );
    place(
      coverRef.current,
      index * 2 + 1,
      spec.x + (w / 2 - 1.2),
      spec.rowY + h / 2,
      -d / 2 + 0.5,
      2.4,
      h + 2,
      d + 3,
    );
    place(spineRef.current, index, spec.x, spec.rowY + h / 2, -0.6, w + 0.4, h + 2, 4);
    place(
      roundedSpineRef.current,
      index,
      spec.x,
      spec.rowY + h / 2,
      0.35,
      w / 2,
      h,
      Math.max(1.4, w * 0.12),
    );

    const surfaceZ = 0.35 + Math.max(1.4, w * 0.12) + 0.25;
    const band = bandStart[index];
    if (band >= 0) {
      place(bandRef.current, band, spec.x, spec.rowY + h * 0.72, surfaceZ, w + 0.6, 1.5, 0.8);
      place(bandRef.current, band + 1, spec.x, spec.rowY + h * 0.3, surfaceZ, w + 0.6, 1.5, 0.8);
    }

    const label = labelStart[index];
    if (label >= 0) {
      place(
        labelRef.current,
        label,
        spec.x,
        spec.rowY + h * 0.55,
        0.35 + Math.max(1.4, w * 0.12) + 0.2,
        Math.max(7, w * 0.5),
        8,
        0.6,
      );
    }

    // Simple modelled front cover on the outer +X board: cloth panel, gold
    // keyline, label and one rule. Instanced once per book, so all ~120 books
    // gain a cover for three extra draw calls.
    const coverX = spec.x + w / 2;
    place(coverPanelRef.current, index, coverX + 0.25, spec.rowY + h / 2, -d / 2, 0.5, h - 16, d - 16);
    const goldX = coverX + 0.6;
    const gold = index * 5;
    place(coverGoldRef.current, gold, goldX, spec.rowY + h - 8, -d / 2, 0.6, 1.6, d - 16);
    place(coverGoldRef.current, gold + 1, goldX, spec.rowY + 8, -d / 2, 0.6, 1.6, d - 16);
    place(coverGoldRef.current, gold + 2, goldX, spec.rowY + h / 2, -8, 0.6, h - 16, 1.6);
    place(coverGoldRef.current, gold + 3, goldX, spec.rowY + h / 2, -d + 8, 0.6, h - 16, 1.6);
    place(coverGoldRef.current, gold + 4, goldX, spec.rowY + h * 0.5, -d / 2, 0.6, 1.1, d * 0.42);
    place(
      coverLabelRef.current,
      index,
      coverX + 0.55,
      spec.rowY + h * 0.66,
      -d / 2,
      0.5,
      Math.max(10, h * 0.075),
      d * 0.6,
    );

    place(hitRef.current, index, spec.x, spec.rowY + h / 2, -d / 2, w + 2, h + 2, d + 4);
  };

  const publishFocus = () => {
    const index = activeRef.current ?? hoverRef.current;
    if (index == null) {
      focusRef.current = null;
      return;
    }
    const spec = specs[index];
    if (!spec) {
      focusRef.current = null;
      return;
    }
    focusRef.current = {
      x: spec.x,
      rowY: spec.rowY,
      active: activeRef.current === index,
      tick: focusTickRef.current,
    };
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (event.instanceId == null) return;
    hoverRef.current = event.instanceId;
    gl.domElement.style.cursor = 'pointer';
    publishFocus();
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (hoverRef.current === event.instanceId) hoverRef.current = null;
    gl.domElement.style.cursor = '';
    publishFocus();
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.instanceId == null) return;
    activeRef.current = activeRef.current === event.instanceId ? null : event.instanceId;
    focusTickRef.current += 1;
    publishFocus();
  };

  useFrame((_, delta) => {
    const level = shelfPresence(progressRef.current * SHELF_PHASE_COUNT);
    pageMaterial.color.setScalar(level);
    clothMaterial.color.setScalar(level);
    goldMaterial.color.copy(goldBase).multiplyScalar(level);
    labelMaterial.color.setScalar(level);
    coverMaterial.color.setScalar(level);

    const active = activeRef.current;
    const hovered = hoverRef.current;

    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index];
      const isActive = index === active;

      // One progress value drives the whole take-down: clear the case, swing
      // the cover square to the reader, then settle back toward the shelf.
      const present = THREE.MathUtils.damp(
        presentRef.current[index],
        isActive ? 1 : 0,
        6,
        delta,
      );
      presentRef.current[index] = present;

      const clearance = smoothstep(present / 0.5);
      const settle = smoothstep((present - 0.82) / 0.18);
      const swing = smoothstep((present - 0.48) / 0.52);

      // The book must travel far enough out that its trailing corner clears
      // the shelf while it turns; once facing the camera it can come back in.
      const reach =
        spec.d / 2 + Math.hypot(spec.d / 2, spec.w / 2) + 14;
      const home = spec.d / 2 + 40;
      const presenting = isActive || present > 0.002;
      const presentPull = reach * clearance - (reach - home) * settle;

      const targetPull = presenting ? presentPull : 0;
      const targetTilt = !isActive && index === hovered ? 0.03 : 0;
      const targetYaw = (-Math.PI / 2) * swing;
      const hoverPull = index === hovered && !isActive ? 9 : 0;

      const pull = THREE.MathUtils.damp(
        pullRef.current[index],
        presenting ? targetPull : hoverPull,
        10,
        delta,
      );
      const tilt = THREE.MathUtils.damp(tiltRef.current[index], targetTilt, 10, delta);
      const yaw = THREE.MathUtils.damp(yawRef.current[index], targetYaw, 12, delta);

      if (
        Math.abs(pull - pullRef.current[index]) > 0.01 ||
        Math.abs(tilt - tiltRef.current[index]) > 0.0002 ||
        Math.abs(yaw - yawRef.current[index]) > 0.0002
      ) {
        pullRef.current[index] = pull;
        tiltRef.current[index] = tilt;
        yawRef.current[index] = yaw;
        writeBook(index, pull, tilt, yaw);
      }
    }
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      roundedSpineGeometry.dispose();
      hitMaterial.dispose();
      pageTexture?.dispose();
      coverTexture?.dispose();
      pageMaterial.dispose();
      clothMaterial.dispose();
      goldMaterial.dispose();
      labelMaterial.dispose();
      coverMaterial.dispose();
      gl.domElement.style.cursor = '';
    };
  }, [
    geometry,
    roundedSpineGeometry,
    hitMaterial,
    pageTexture,
    coverTexture,
    pageMaterial,
    clothMaterial,
    goldMaterial,
    labelMaterial,
    coverMaterial,
    gl,
  ]);

  useLayoutEffect(() => {
    const color = new THREE.Color();
    const white = new THREE.Color('#ffffff');

    specs.forEach((spec, index) => {
      writeBook(index, 0, 0, 0);

      pageRef.current?.setColorAt(index, color.set(spec.pageTint));

      coverRef.current?.setColorAt(index * 2, color.set(spec.color));
      coverRef.current?.setColorAt(index * 2 + 1, color.set(spec.color));

      spineRef.current?.setColorAt(index, color.set(spec.color));
      roundedSpineRef.current?.setColorAt(index, color.set(spec.color));
      coverPanelRef.current?.setColorAt(index, color.set(spec.color).lerp(white, 0.04));
      coverLabelRef.current?.setColorAt(index, color.set(spec.labelTint).lerp(white, 0.3));

      const band = bandStart[index];
      if (band >= 0) {
        bandRef.current?.setColorAt(band, color.set(spec.color));
        bandRef.current?.setColorAt(band + 1, color.set(spec.color));
      }

      const label = labelStart[index];
      if (label >= 0) {
        labelRef.current?.setColorAt(label, color.set(spec.labelTint));
      }
    });

    // The cover board is the only user of this material. Recompile now that a
    // per-instance colour buffer exists, so the shader picks up the tint.
    coverMaterial.needsUpdate = true;

    for (const mesh of [
      pageRef.current,
      coverRef.current,
      spineRef.current,
      roundedSpineRef.current,
      bandRef.current,
      labelRef.current,
      coverPanelRef.current,
      coverGoldRef.current,
      coverLabelRef.current,
      hitRef.current,
    ]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [specs]);

  return (
    <group>
      <instancedMesh ref={pageRef} args={[geometry, pageMaterial, specs.length]} frustumCulled={false} />
      <instancedMesh ref={coverRef} args={[geometry, clothMaterial, specs.length * 2]} frustumCulled={false} />
      <instancedMesh ref={spineRef} args={[geometry, clothMaterial, specs.length]} frustumCulled={false} />
      <instancedMesh
        ref={roundedSpineRef}
        args={[roundedSpineGeometry, clothMaterial, specs.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={bandRef}
        args={[geometry, goldMaterial, specs.filter((spec) => spec.bands > 0).length * 2]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={labelRef}
        args={[geometry, labelMaterial, specs.filter((spec) => spec.label).length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={coverPanelRef}
        args={[geometry, coverMaterial, specs.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={coverGoldRef}
        args={[geometry, goldMaterial, specs.length * 5]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={coverLabelRef}
        args={[geometry, labelMaterial, specs.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={hitRef}
        args={[geometry, hitMaterial, specs.length]}
        frustumCulled={false}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      />
    </group>
  );
}

/* ------------------------------------------------------------------
   Shelf selection halo + integrated light strips
   ------------------------------------------------------------------ */

export function ShelfSelection({
  pick,
  progressRef,
  focusRef,
}: {
  pick: ShelfPick;
  progressRef: MutableRefObject<number>;
  focusRef: MutableRefObject<ShelfFocus | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const haloGroupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.MeshBasicMaterial>(null);
  const flashRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const pulseRingRef = useRef<THREE.Mesh>(null);
  const pulseMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const flashBarRef = useRef<THREE.Mesh>(null);
  const flashBarMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const basesRef = useRef<Array<{ material: THREE.MeshBasicMaterial; base: number }>>([]);
  const pulseTickRef = useRef(0);
  const pulseStartRef = useRef(-1e9);

  const glowTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(64, 128, 4, 64, 128, 118);
    grad.addColorStop(0, 'rgba(255, 198, 112, 0.52)');
    grad.addColorStop(0.45, 'rgba(214, 150, 70, 0.18)');
    grad.addColorStop(1, 'rgba(214, 150, 70, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  useEffect(() => {
    const list: Array<{ material: THREE.MeshBasicMaterial; base: number }> = [];
    groupRef.current?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshBasicMaterial;
      if (
        !material ||
        material === glowRef.current ||
        material === flashRef.current ||
        material === pulseMatRef.current ||
        material === flashBarMatRef.current
      ) {
        return;
      }
      list.push({ material, base: material.opacity });
    });
    basesRef.current = list;
  }, []);

  useFrame((_, delta) => {
    const phase = progressRef.current * SHELF_PHASE_COUNT;
    const level = shelfPresence(phase);
    const approach = smoothstep((phase - 0.58) / 0.2);
    const seat = shelfSeatPulse(phase);
    const now = performance.now();

    if (groupRef.current) groupRef.current.visible = level > 0.01;

    // The narrative pick stays the resting anchor; hover and click simply move
    // the same halo onto the book under the pointer.
    const focus = focusRef.current;
    const targetX = focus?.x ?? pick.x * 1000;
    const targetY = focus?.rowY ?? pick.rowY;
    if (haloGroupRef.current) {
      haloGroupRef.current.position.x = THREE.MathUtils.damp(
        haloGroupRef.current.position.x,
        targetX,
        10,
        delta,
      );
      haloGroupRef.current.position.y = THREE.MathUtils.damp(
        haloGroupRef.current.position.y,
        targetY,
        10,
        delta,
      );
    }

    if (focus && focus.tick !== pulseTickRef.current) {
      pulseTickRef.current = focus.tick;
      pulseStartRef.current = now;
    }

    for (const item of basesRef.current) {
      item.material.opacity = THREE.MathUtils.damp(
        item.material.opacity,
        item.base * level * (1 + seat * 0.7 + (focus?.active ? 0.34 : 0)),
        6,
        delta,
      );
    }

    if (glowRef.current) {
      const breath = 0.58 + Math.sin(now * 0.0014) * 0.14;
      glowRef.current.opacity = THREE.MathUtils.damp(
        glowRef.current.opacity,
        level * (breath + approach * 0.55 + seat * 1.15 + (focus?.active ? 0.3 : 0)),
        4,
        delta,
      );
    }
    if (flashRef.current) {
      flashRef.current.opacity = THREE.MathUtils.damp(
        flashRef.current.opacity,
        level * seat * 1.15,
        10,
        delta,
      );
    }
    if (ringRef.current) {
      const pulse = 1 + Math.sin(now * 0.0018) * 0.08 + seat * 0.9;
      ringRef.current.scale.setScalar(pulse);
    }
    if (lightRef.current) {
      lightRef.current.intensity = level * 0.5 + approach * 0.35 + seat * 1.1;
    }

    // Two-beat click feedback: a ring races outward, and a soft streak lights
    // the selected spine so the press reads even when the halo is in transit.
    const ringPulse = (now - pulseStartRef.current) / 820;
    if (pulseRingRef.current && pulseMatRef.current) {
      const on = ringPulse >= 0 && ringPulse < 1;
      pulseRingRef.current.visible = on;
      if (on) {
        pulseRingRef.current.scale.setScalar(0.35 + ringPulse * 1.9);
        pulseMatRef.current.opacity = (1 - ringPulse) * (1 - ringPulse) * level * 0.9;
      } else {
        pulseMatRef.current.opacity = 0;
      }
    }
    const streak = (now - pulseStartRef.current) / 640;
    if (flashBarRef.current && flashBarMatRef.current) {
      const on = streak >= 0 && streak < 1;
      flashBarRef.current.visible = on;
      flashBarMatRef.current.opacity = on ? Math.sin(streak * Math.PI) * level * 0.32 : 0;
    }
  });

  const initialX = pick.x * 1000;

  return (
    <group ref={groupRef}>
      <group ref={haloGroupRef} position={[initialX, pick.rowY, 0]}>
        <mesh position={[0, 130, -42]}>
          <planeGeometry args={[110, 290]} />
          <meshBasicMaterial
            ref={glowRef}
            map={glowTexture ?? undefined}
            transparent
            opacity={0.5}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 108, 12]}>
          <planeGeometry args={[150, 260]} />
          <meshBasicMaterial
            ref={flashRef}
            map={glowTexture ?? undefined}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={ringRef} position={[0, 4, 2]}>
          <ringGeometry args={[22, 24, 48]} />
          <meshBasicMaterial
            color="#c8a96d"
            transparent
            opacity={0.4}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <mesh ref={pulseRingRef} position={[0, 4, 4]} visible={false}>
          <ringGeometry args={[22, 25, 48]} />
          <meshBasicMaterial
            ref={pulseMatRef}
            color="#f0cf95"
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <mesh ref={flashBarRef} position={[0, 112, 30]} visible={false}>
          <planeGeometry args={[84, 238]} />
          <meshBasicMaterial
            ref={flashBarMatRef}
            color="#ffdfa8"
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <pointLight
          ref={lightRef}
          position={[0, 145, -70]}
          intensity={0.5}
          color="#ffcf8f"
          distance={0.6}
          decay={2}
        />

        {[
          { position: [0, 232, 6] as Vec3, size: [68, 1.8] as [number, number] },
          { position: [0, -2, 6] as Vec3, size: [68, 1.8] as [number, number] },
          { position: [-33.5, 115, 6] as Vec3, size: [1.8, 236] as [number, number] },
          { position: [33.5, 115, 6] as Vec3, size: [1.8, 236] as [number, number] },
        ].map((bar, index) => (
          <mesh key={index} position={bar.position}>
            <planeGeometry args={bar.size} />
            <meshBasicMaterial
              color="#e0b372"
              transparent
              opacity={index < 2 ? 0.5 : 0.38}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>

      {[354, 824, 1294, 1776].map((y, index) => (
        <mesh key={y} position={[0, y - 2, 2.2]}>
          <planeGeometry args={[1300, 2.2]} />
          <meshBasicMaterial
            color={index === 1 ? '#e0b372' : '#c49a5f'}
            transparent
            opacity={index === 1 ? 0.24 : 0.13}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------
   QR mark on the book cover + scan sweep
   ------------------------------------------------------------------ */

export function QrCoverMark({
  progressRef,
  reducedMotion,
  markRef,
  opennessRef,
}: {
  progressRef: MutableRefObject<number>;
  reducedMotion: boolean;
  markRef?: MutableRefObject<THREE.Object3D | null>;
  opennessRef?: MutableRefObject<number>;
}) {
  const qr = useTexture('/qr/one-code-entry.png');
  const sweepRef = useRef<THREE.Mesh>(null);
  const sweepMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.MeshBasicMaterial>(null);
  const frameRef = useRef<THREE.Group>(null);
  const coverRef = useRef<THREE.Group>(null);
  const spineGlowRef = useRef<THREE.MeshBasicMaterial>(null);

  const frameMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#e0b372',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => () => frameMaterial.dispose(), [frameMaterial]);

  useEffect(() => {
    qr.colorSpace = THREE.SRGBColorSpace;
    qr.anisotropy = 4;
    qr.needsUpdate = true;
  }, [qr]);

  useFrame((_, delta) => {
    const phase = progressRef.current * SHELF_PHASE_COUNT;
    const scanning = phase > 1.44 && phase < 1.9;
    const strength = scanning
      ? Math.min(1, Math.max(0, (phase - 1.44) / 0.08)) * (1 - Math.max(0, (phase - 1.8) / 0.1))
      : 0;

    if (sweepMatRef.current) {
      sweepMatRef.current.opacity = THREE.MathUtils.damp(sweepMatRef.current.opacity, strength * 0.92, 8, delta);
    }
    if (haloRef.current) {
      const pulse = reducedMotion ? 0.16 : 0.14 + Math.sin(performance.now() * 0.006) * 0.06;
      haloRef.current.opacity = THREE.MathUtils.damp(
        haloRef.current.opacity,
        strength * pulse,
        6,
        delta,
      );
    }
    // The tick frame is a scanning affordance, not a printed part of the cover;
    // it has to disappear with the scan or it reads as stray foil lines.
    frameMaterial.opacity = THREE.MathUtils.damp(frameMaterial.opacity, strength * 0.6, 8, delta);
    if (frameRef.current) {
      frameRef.current.visible = frameMaterial.opacity > 0.01;
    }
    if (sweepRef.current) {
      const sweep = ((phase - 1.44) / 0.26) % 1;
      sweepRef.current.position.y = 42.5 - Math.max(0, Math.min(1, sweep)) * 25;
      sweepRef.current.visible = strength > 0.01;
    }
    // The printed code sits on the front board, so it hinges on the spine with
    // the board: same angle the page-turn rig gives the cover leaf.
    if (coverRef.current) {
      const openness = opennessRef?.current ?? 0;
      coverRef.current.rotation.x = Math.PI * smoothstep(openness);
    }
    if (spineGlowRef.current) {
      const onShelf = phase > 0.8 && phase < 1.6;
      const breathe = reducedMotion ? 0.1 : 0.08 + Math.sin(performance.now() * 0.0021) * 0.08;
      spineGlowRef.current.opacity = THREE.MathUtils.damp(
        spineGlowRef.current.opacity,
        onShelf ? 0.34 + breathe : 0.18,
        4,
        delta,
      );
    }
  });

  return (
    <>
      <mesh position={[-74.3, 105, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[4.4, 168]} />
        <meshBasicMaterial
          ref={spineGlowRef}
          color="#ffd79a"
          transparent
          opacity={0.18}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <group ref={coverRef} position={[-74, 0, 0]}>
        <group ref={markRef} position={[120, 43.5, 15.5]}>
          <mesh position={[0, 0, 0.15]}>
            <planeGeometry args={[31.5, 31.5]} />
            <meshStandardMaterial
              map={qr}
              roughness={0.72}
              metalness={0}
              envMapIntensity={0.4}
              transparent
              opacity={0.96}
            />
          </mesh>

          <mesh position={[0, 0, 0.12]}>
            <planeGeometry args={[38, 38]} />
            <meshBasicMaterial
              ref={haloRef}
              color="#d4a55f"
              transparent
              opacity={0.08}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>

          <group ref={frameRef} position={[0, 0, 0.3]}>
            {[
              [-17.6, -17.6, 0],
              [17.6, -17.6, Math.PI / 2],
              [17.6, 17.6, Math.PI],
              [-17.6, 17.6, -Math.PI / 2],
            ].map(([x, y, rot], index) => (
              <mesh key={index} position={[x, y, 0]} rotation={[0, 0, rot]} material={frameMaterial}>
                <planeGeometry args={[8, 0.7]} />
              </mesh>
            ))}
          </group>

          <mesh ref={sweepRef} position={[0, 0, 0.45]} visible={false}>
            <planeGeometry args={[31.5, 0.9]} />
            <meshBasicMaterial
              ref={sweepMatRef}
              color="#ffd79a"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>
    </>
  );
}

/* ------------------------------------------------------------------
   Phone scanner
   ------------------------------------------------------------------ */

const PHONE_SCREEN_SIZE: [number, number] = [0.079, 0.158];
const PHONE_CANVAS_SIZE: [number, number] = [512, 1024];
const SCAN_VIEW = { x: 36, y: 170, width: 440, height: 404 };

// The live camera feed only fills the viewfinder rect, not the whole screen:
// the chrome canvas paints the status bar and result block around it.
const SCAN_PLANE_WIDTH = PHONE_SCREEN_SIZE[0] * (SCAN_VIEW.width / PHONE_CANVAS_SIZE[0]);
const SCAN_PLANE_HEIGHT = PHONE_SCREEN_SIZE[1] * (SCAN_VIEW.height / PHONE_CANVAS_SIZE[1]);
const SCAN_PLANE_ASPECT = SCAN_PLANE_WIDTH / SCAN_PLANE_HEIGHT;
const SCAN_PLANE_POSITION: [number, number, number] = [
  ((SCAN_VIEW.x + SCAN_VIEW.width / 2) / PHONE_CANVAS_SIZE[0] - 0.5) * PHONE_SCREEN_SIZE[0],
  (0.5 - (SCAN_VIEW.y + SCAN_VIEW.height / 2) / PHONE_CANVAS_SIZE[1]) * PHONE_SCREEN_SIZE[1],
  0.0073,
];

// Rear lens sits behind the screen. The phone faces the viewer, so the lens is
// aimed at the book rather than derived from its own orientation — strict optics
// would put empty room in the feed.
const PHONE_LENS_POSITION: [number, number, number] = [-0.026, 0.062, -0.0062];

// A phone scanning a mark sits a hand's width away, so the feed camera rides in
// along the same sight line until the mark fills the viewfinder.
const SCAN_DISTANCE = 0.14;

// Scan beat, in phase units. The phone is held, so it has to enter, aim and
// leave as one continuous held gesture: it rises in at 1.50, swings the rear
// camera onto the cover mark by 1.86, holds through the sweep and is gone by
// 2.16 — before the carry hand starts at 2.14.
const PHONE_IN_START = 1.5;
const PHONE_IN_END = 1.7;
const PHONE_AIM_START = 1.64;
const PHONE_AIM_END = 1.86;
const PHONE_RELEASE_START = 1.94;
const PHONE_RELEASE_END = 2.06;
const PHONE_OUT_START = 2.0;
const PHONE_OUT_END = 2.16;
const PHONE_LOCK_PHASE = 1.84;

// The screen is two layers: the rear camera feed fills the viewfinder rect and
// this canvas paints only the chrome on top of it, so it must stay transparent.
function drawPhoneScreen(ctx: CanvasRenderingContext2D, found: boolean, pick: ShelfPick) {
  const w = PHONE_CANVAS_SIZE[0];
  const h = PHONE_CANVAS_SIZE[1];
  ctx.clearRect(0, 0, w, h);

  // The viewfinder stays clear so the camera feed shows through; everything
  // else gets a dark screen backdrop instead of the phone's metal body. This
  // has to land before any text or the chrome gets washed out.
  ctx.fillStyle = 'rgba(7, 6, 5, 0.94)';
  ctx.fillRect(0, 0, w, SCAN_VIEW.y);
  ctx.fillRect(0, SCAN_VIEW.y + SCAN_VIEW.height, w, h - (SCAN_VIEW.y + SCAN_VIEW.height));
  ctx.fillRect(0, SCAN_VIEW.y, SCAN_VIEW.x, SCAN_VIEW.height);
  ctx.fillRect(
    SCAN_VIEW.x + SCAN_VIEW.width,
    SCAN_VIEW.y,
    w - (SCAN_VIEW.x + SCAN_VIEW.width),
    SCAN_VIEW.height,
  );

  ctx.strokeStyle = 'rgba(200, 169, 109, 0.38)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  ctx.fillStyle = '#d8cbb0';
  ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('9:41', 34, 52);

  ctx.fillStyle = 'rgba(200, 169, 109, 0.88)';
  ctx.font = '500 15px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('BOOKLN · SCAN', 178, 52);

  ctx.fillStyle = 'rgba(232, 220, 196, 0.6)';
  ctx.font = '500 14px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('▮▮▮  ▰', 404, 52);

  ctx.strokeStyle = 'rgba(232, 220, 196, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(34, 74);
  ctx.lineTo(w - 34, 74);
  ctx.stroke();

  ctx.fillStyle = '#c8a96d';
  ctx.font = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('SPINE MARK · 脊码', 36, 118);
  ctx.fillStyle = 'rgba(232, 220, 196, 0.44)';
  ctx.font = '400 14px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('PUBLIC PREVIEW LAYER', 36, 142);

  const vf = { x: SCAN_VIEW.x, y: SCAN_VIEW.y, w: SCAN_VIEW.width, h: SCAN_VIEW.height };

  ctx.strokeStyle = 'rgba(200, 169, 109, 0.12)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(vf.x + (vf.w / 6) * i, vf.y);
    ctx.lineTo(vf.x + (vf.w / 6) * i, vf.y + vf.h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(vf.x, vf.y + (vf.h / 6) * i);
    ctx.lineTo(vf.x + vf.w, vf.y + (vf.h / 6) * i);
    ctx.stroke();
  }

  const bracket = 34;
  const corners = [
    [vf.x + 12, vf.y + 12, 1, 1],
    [vf.x + vf.w - 12, vf.y + 12, -1, 1],
    [vf.x + 12, vf.y + vf.h - 12, 1, -1],
    [vf.x + vf.w - 12, vf.y + vf.h - 12, -1, -1],
  ];
  ctx.strokeStyle = found ? '#e7c38b' : 'rgba(224, 179, 114, 0.82)';
  ctx.lineWidth = 4;
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * bracket, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * bracket);
    ctx.stroke();
  }

  ctx.fillStyle = found ? '#e0b372' : 'rgba(232, 220, 196, 0.7)';
  ctx.font = '600 17px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(found ? 'SPINE MARK FOUND' : 'SCANNING…', 36, 620);

  ctx.fillStyle = 'rgba(232, 220, 196, 0.4)';
  ctx.font = '400 14px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(found ? '0.4 S · 9 NODES · 0.00 W' : 'HOLD STEADY · 0.00 W', 36, 646);

  ctx.fillStyle = found ? 'rgba(200, 169, 109, 0.18)' : 'rgba(200, 169, 109, 0.06)';
  ctx.fillRect(36, 680, 440, 1);

  ctx.fillStyle = found ? '#e8dcc4' : 'rgba(232, 220, 196, 0.36)';
  ctx.font = '500 44px "Cormorant Garamond", Georgia, serif';
  ctx.fillText(found ? pick.title : '书链', 36, 754);

  ctx.fillStyle = 'rgba(232, 220, 196, 0.46)';
  ctx.font = '500 16px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(found ? pick.subtitle : 'AWAITING SPINE MARK', 36, 786);

  const cols = [
    { x: 36, value: found ? '9' : '—', label: 'NODES' },
    { x: 176, value: found ? '11' : '—', label: 'LINKS' },
    { x: 316, value: found ? '0.4' : '—', label: 'SECONDS' },
    { x: 428, value: found ? '0.00' : '—', label: 'WATTS' },
  ];
  for (const col of cols) {
    ctx.fillStyle = found ? '#c8a96d' : 'rgba(200, 169, 109, 0.3)';
    ctx.font = '500 34px "Cormorant Garamond", Georgia, serif';
    ctx.fillText(col.value, col.x, 852);
    ctx.fillStyle = 'rgba(232, 220, 196, 0.36)';
    ctx.font = '500 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(col.label, col.x, 872);
  }

  ctx.fillStyle = found ? 'rgba(200, 169, 109, 0.14)' : 'rgba(200, 169, 109, 0.05)';
  ctx.fillRect(36, 900, 440, 1);

  ctx.fillStyle = found ? '#e0b372' : 'rgba(232, 220, 196, 0.38)';
  ctx.font = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(found ? 'COMPANION LAYER · UPLINK READY' : 'SCROLL TO UPLINK', 36, 936);

  ctx.fillStyle = 'rgba(232, 220, 196, 0.3)';
  ctx.font = '400 12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('NO ACCOUNT · NO FEED · NO NOTIFICATIONS', 36, 968);

  ctx.fillStyle = 'rgba(232, 220, 196, 0.55)';
  ctx.beginPath();
  ctx.roundRect(188, 992, 136, 4, 2);
  ctx.fill();
}

export function PhoneScanner({
  progressRef,
  pick,
  reducedMotion,
  cameraSubjects = [],
  cameraAim,
}: {
  progressRef: MutableRefObject<number>;
  pick: ShelfPick;
  reducedMotion: boolean;
  cameraSubjects?: ReadonlyArray<MutableRefObject<THREE.Object3D | null>>;
  cameraAim?: MutableRefObject<THREE.Object3D | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const chromeMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const scanRef = useRef<THREE.Mesh>(null);
  const scanMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const lensRef = useRef<THREE.Object3D>(null);
  const screenRef = useRef<THREE.Mesh>(null);
  const screenLightRef = useRef<THREE.PointLight>(null);
  const [found, setFound] = useState(false);
  const foundRef = useRef(false);
  const { size, scene, camera: mainCamera, gl } = useThree();
  const mobile = size.width < 760;

  const feedTarget = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(512, 512);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    target.texture.minFilter = THREE.LinearFilter;
    target.texture.magFilter = THREE.LinearFilter;
    target.texture.generateMipmaps = false;
    return target;
  }, []);

  const feedCamera = useMemo(
    () => new THREE.PerspectiveCamera(32, SCAN_PLANE_ASPECT, 0.02, 8),
    [],
  );
  const feedAim = useMemo(() => new THREE.Vector3(), []);
  const feedDirection = useMemo(() => new THREE.Vector3(), []);
  const feedLens = useMemo(() => new THREE.Vector3(), []);
  const [feedHeight, setFeedHeight] = useState(512);

  const feedUniforms = useMemo(
    () => ({ uScanBlur: { value: 0.6 }, uScanTime: { value: 0 } }),
    [],
  );

  // The room's own grade is not a camera: the feed needs a cooler, contrastier
  // image with soft edges, so the grade rides on top of the map sample.
  const feedMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      map: feedTarget.texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    material.customProgramCacheKey = () => 'bookln-phone-feed';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uScanBlur = feedUniforms.uScanBlur;
      shader.uniforms.uScanTime = feedUniforms.uScanTime;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'uniform vec3 diffuse;',
          'uniform vec3 diffuse;\nuniform float uScanBlur;\nuniform float uScanTime;',
        )
        .replace(
          '#include <map_fragment>',
          `
          #ifdef USE_MAP
          vec2 scanOffset = vMapUv - 0.5;
          float scanRadius = length(scanOffset) * 1.9;
          float scanBlur = uScanBlur * smoothstep(0.3, 1.0, scanRadius);
          vec4 sampledDiffuseColor = vec4(0.0);
          for (int i = 0; i < 5; i++) {
            float scanAngle = float(i) * 2.399963;
            float scanStep = float(i) * 0.25;
            sampledDiffuseColor += texture2D(
              map,
              vMapUv + vec2(cos(scanAngle), sin(scanAngle)) * 0.012 * scanBlur * scanStep
            );
          }
          sampledDiffuseColor /= 5.0;
          diffuseColor.rgb *= sampledDiffuseColor.rgb;

          float scanLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 scanColor = mix(vec3(scanLuma), diffuseColor.rgb, 0.92);
          scanColor *= 1.02;
          scanColor += vec3(0.0, 0.005, 0.016) * (1.0 - scanLuma);
          scanColor *= mix(0.82, 1.0, smoothstep(1.2, 0.32, scanRadius));
          float scanGrain =
            fract(sin(dot(vMapUv * 900.0 + uScanTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
          diffuseColor.rgb = max(scanColor + scanGrain * 0.015, vec3(0.0));
          #endif
          `,
        );
    };
    return material;
  }, [feedTarget, feedUniforms]);

  useEffect(() => {
    return () => feedMaterial.dispose();
  }, [feedMaterial]);

  const canvas = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const element = document.createElement('canvas');
    element.width = PHONE_CANVAS_SIZE[0];
    element.height = PHONE_CANVAS_SIZE[1];
    return element;
  }, []);

  const texture = useMemo(() => {
    if (!canvas) return null;
    const value = new THREE.CanvasTexture(canvas);
    value.colorSpace = THREE.SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, [canvas]);

  useEffect(() => {
    if (!canvas || !texture) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const redraw = () => {
      drawPhoneScreen(ctx, found, pick);
      texture.needsUpdate = true;
    };
    redraw();
    void document.fonts?.ready.then(redraw);
  }, [canvas, texture, found, pick]);

  useEffect(() => {
    return () => texture?.dispose();
  }, [texture]);

  // Resolution follows the screen's on-screen size, so the feed is never
  // upscaled on a wide viewport nor wasted on a phone.
  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    screen.updateWorldMatrix(true, false);
    const point = new THREE.Vector3();
    let top = -Infinity;
    let bottom = Infinity;
    for (const x of [-0.5, 0.5]) {
      for (const y of [-0.5, 0.5]) {
        point
          .set(x * PHONE_SCREEN_SIZE[0], y * PHONE_SCREEN_SIZE[1], 0)
          .applyMatrix4(screen.matrixWorld)
          .project(mainCamera);
        top = Math.max(top, point.y);
        bottom = Math.min(bottom, point.y);
      }
    }
    const cssHeight = ((top - bottom) / 2) * size.height;
    setFeedHeight(
      Math.round(Math.min(1024, Math.max(384, cssHeight * gl.getPixelRatio() * 1.25))),
    );
  }, [gl, mainCamera, size.width, size.height]);

  useEffect(() => {
    const width = Math.round(feedHeight * SCAN_PLANE_ASPECT);
    feedTarget.setSize(width, feedHeight);
  }, [feedHeight, feedTarget]);

  useEffect(() => {
    return () => feedTarget.dispose();
  }, [feedTarget]);

  // The feed camera sees a chosen subset of the scene; lights must join that
  // layer too or the subject renders black.
  useEffect(() => {
    feedCamera.layers.set(PHONE_CAMERA_LAYER);
    for (const subject of cameraSubjects) enableLayer(subject.current, PHONE_CAMERA_LAYER);
    scene.traverse((object) => {
      if ((object as THREE.Light).isLight) object.layers.enable(PHONE_CAMERA_LAYER);
    });
  }, [cameraSubjects, feedCamera, scene]);

  useFrame((_, delta) => {
    const phase = progressRef.current * SHELF_PHASE_COUNT;
    const rise = smoothstep((phase - PHONE_IN_START) / (PHONE_IN_END - PHONE_IN_START));
    const fadeIn = smoothstep((phase - PHONE_IN_START) / 0.1);
    const fadeOut =
      1 - smoothstep((phase - PHONE_OUT_START) / (PHONE_OUT_END - PHONE_OUT_START));
    const vis = fadeIn * fadeOut;
    // Aim is the held gesture: the phone swings its rear camera square to the
    // cover and drifts toward the mark, then releases once the read lands.
    const aim =
      smoothstep((phase - PHONE_AIM_START) / (PHONE_AIM_END - PHONE_AIM_START)) *
      (1 - smoothstep((phase - PHONE_RELEASE_START) / (PHONE_RELEASE_END - PHONE_RELEASE_START)));
    // A short settle when the mark resolves — the hand steadies, it does not
    // perform a second move.
    const lock = Math.sin(clamp01((phase - PHONE_LOCK_PHASE) / 0.08) * Math.PI);
    const drift = reducedMotion ? 0 : Math.sin(performance.now() * 0.0011);

    if (groupRef.current) {
      groupRef.current.visible = vis > 0.01;
      groupRef.current.position.set(
        (mobile ? 0.145 : 0.265) - aim * 0.075,
        (mobile ? 0.842 : 0.862) -
          (1 - rise) * 0.2 +
          aim * 0.042 +
          drift * 0.003 +
          lock * 0.002,
        (mobile ? 0.22 : 0.19) - aim * 0.07,
      );
      groupRef.current.rotation.set(
        0.02 + aim * 0.05 + lock * 0.006,
        (mobile ? -0.34 : -0.52) + aim * 0.22,
        0.015 - aim * 0.01 + (reducedMotion ? 0 : Math.sin(performance.now() * 0.0007) * 0.005),
      );
      const scale = (mobile ? 0.8 : 0.86) + rise * (mobile ? 0.12 : 0.14);
      groupRef.current.scale.setScalar(scale);
    }

    // A candle-power point light falls off with 1/d²: at the thumb (~8 cm) this
    // is about 1 cd — enough to separate the grip from the body without
    // blowing the skin out, and invisible on the desk 30 cm away.
    if (screenLightRef.current) screenLightRef.current.intensity = vis * 0.006;

    if (bodyMatRef.current) bodyMatRef.current.opacity = vis;
    if (chromeMatRef.current) chromeMatRef.current.opacity = vis;
    feedMaterial.opacity = vis;
    if (glowMatRef.current) {
      glowMatRef.current.opacity = vis * (reducedMotion ? 0.09 : 0.07 + Math.sin(performance.now() * 0.0016) * 0.025);
    }

    if (scanRef.current) {
      const scanning = phase > 1.66 && phase < 1.9;
      const progress = ((phase - 1.66) / 0.22) % 1;
      scanRef.current.visible = scanning;
      scanRef.current.position.y = 0.06 - Math.max(0, Math.min(1, progress)) * 0.12;
      if (scanMatRef.current) scanMatRef.current.opacity = scanning ? 0.8 : 0;
    }

    const shouldFound = phase > 1.84;
    if (shouldFound !== foundRef.current) {
      foundRef.current = shouldFound;
      setFound(shouldFound);
    }

    feedUniforms.uScanTime.value += delta * 0.8;

    if (vis <= 0.01 || !lensRef.current) return;

    // Paint the rear camera before the main pass: same scene, restricted layer
    // set, and no tone mapping so the feed lands on the screen as display colour.
    lensRef.current.getWorldPosition(feedLens);
    if (cameraAim?.current) cameraAim.current.getWorldPosition(feedAim);
    else feedAim.copy(feedLens).setZ(feedLens.z - 1);

    feedDirection.copy(feedAim).sub(feedLens);
    const lensDistance = feedDirection.length() || SCAN_DISTANCE;
    feedDirection.divideScalar(lensDistance);
    feedCamera.position
      .copy(feedAim)
      .addScaledVector(feedDirection, -Math.min(SCAN_DISTANCE, lensDistance * 0.85));
    feedCamera.lookAt(feedAim);

    // Handheld drift lives on the feed camera, never on the phone itself.
    if (!reducedMotion) {
      const drift = performance.now() * 0.001;
      feedCamera.rotateX(Math.sin(drift * 2.1) * 0.0035);
      feedCamera.rotateY(Math.cos(drift * 1.7) * 0.0045);
    }

    const previousTarget = gl.getRenderTarget();
    const previousToneMapping = gl.toneMapping;
    gl.toneMapping = THREE.NoToneMapping;
    gl.setRenderTarget(feedTarget);
    gl.render(scene, feedCamera);
    gl.setRenderTarget(previousTarget);
    gl.toneMapping = previousToneMapping;
  });

  return (
    <group ref={groupRef} position={[0.265, 0.862, 0.19]} rotation={[0.02, -0.52, 0.015]} visible={false}>
      <mesh position={[0, 0, -0.012]}>
        <planeGeometry args={[0.16, 0.27]} />
        <meshBasicMaterial
          ref={glowMatRef}
          color="#d9a45d"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <RoundedBox args={[0.092, 0.188, 0.011]} radius={0.011} smoothness={4}>
        <meshStandardMaterial
          ref={bodyMatRef}
          color="#1b1814"
          metalness={0.74}
          roughness={0.34}
          envMapIntensity={1.2}
          transparent
          opacity={0}
        />
      </RoundedBox>

      <object3D ref={lensRef} position={PHONE_LENS_POSITION} />

      <mesh ref={screenRef} position={[0, 0, 0.0074]} renderOrder={2}>
        <planeGeometry args={[PHONE_SCREEN_SIZE[0], PHONE_SCREEN_SIZE[1]]} />
        <meshBasicMaterial
          ref={chromeMatRef}
          map={texture ?? undefined}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh position={SCAN_PLANE_POSITION} renderOrder={1}>
        <planeGeometry args={[SCAN_PLANE_WIDTH, SCAN_PLANE_HEIGHT]} />
        <primitive object={feedMaterial} attach="material" />
      </mesh>

      {/* Screen spill on the thumb and wrist. Kept far enough in front of the
          glass that it never lands as a hotspot. */}
      <pointLight
        ref={screenLightRef}
        position={[0, 0.01, 0.09]}
        intensity={0}
        color="#d9c6a4"
        distance={0.4}
        decay={2}
      />

      <mesh ref={scanRef} position={[0, 0.06, 0.0085]} visible={false}>
        <planeGeometry args={[0.071, 0.0022]} />
        <meshBasicMaterial
          ref={scanMatRef}
          color="#ffd79a"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------
   Cloud soul panel + uplink
   ------------------------------------------------------------------ */

const CLOUD_NODES = [
  [0.5, 0.52],
  [0.72, 0.29],
  [0.86, 0.47],
  [0.73, 0.72],
  [0.5, 0.83],
  [0.28, 0.71],
  [0.14, 0.48],
  [0.28, 0.29],
  [0.5, 0.14],
];

const CLOUD_LINKS: Array<[number, number]> = [
  [0, 1],
  [0, 3],
  [0, 4],
  [0, 5],
  [0, 6],
  [0, 7],
  [0, 8],
  [1, 2],
  [1, 7],
  [3, 8],
  [4, 5],
];

function drawCloudPanel(ctx: CanvasRenderingContext2D, pick: ShelfPick) {
  const w = 1024;
  const h = 640;
  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, 'rgba(16, 14, 11, 0.97)');
  bg.addColorStop(0.55, 'rgba(11, 10, 8, 0.96)');
  bg.addColorStop(1, 'rgba(20, 16, 12, 0.97)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(200, 169, 109, 0.44)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  ctx.strokeStyle = 'rgba(232, 220, 196, 0.055)';
  ctx.lineWidth = 1;
  for (let x = 32; x < w; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 32; y < h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const tick = 18;
  ctx.strokeStyle = 'rgba(224, 179, 114, 0.82)';
  ctx.lineWidth = 3;
  for (const [x, y, sx, sy] of [
    [0, 0, 1, 1],
    [w, 0, -1, 1],
    [0, h, 1, -1],
    [w, h, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * tick, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * tick);
    ctx.stroke();
  }

  ctx.fillStyle = '#c8a96d';
  ctx.font = '600 21px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('COMPANION LAYER', 42, 64);
  ctx.fillStyle = 'rgba(232, 220, 196, 0.46)';
  ctx.font = '400 16px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('伴读层 · PUBLIC PREVIEW', 42, 92);

  ctx.fillStyle = '#e0b372';
  ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('SYNCED · 0.4 S', w - 236, 64);
  ctx.fillStyle = 'rgba(232, 220, 196, 0.4)';
  ctx.font = '400 14px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('0.00 W · NO ACCOUNT', w - 236, 90);

  ctx.strokeStyle = 'rgba(200, 169, 109, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(42, 116);
  ctx.lineTo(w - 42, 116);
  ctx.stroke();

  const graphLeft = 512;
  const graphTop = 156;
  const graphSize = 360;
  ctx.strokeStyle = 'rgba(200, 169, 109, 0.32)';
  ctx.lineWidth = 1.4;
  for (const [source, target] of CLOUD_LINKS) {
    const [sx, sy] = CLOUD_NODES[source];
    const [tx, ty] = CLOUD_NODES[target];
    ctx.beginPath();
    ctx.moveTo(graphLeft + sx * graphSize, graphTop + (1 - sy) * graphSize);
    ctx.lineTo(graphLeft + tx * graphSize, graphTop + (1 - ty) * graphSize);
    ctx.stroke();
  }
  CLOUD_NODES.forEach(([nx, ny], index) => {
    const x = graphLeft + nx * graphSize;
    const y = graphTop + (1 - ny) * graphSize;
    const focused = index === 0;
    ctx.beginPath();
    ctx.arc(x, y, focused ? 11 : 6, 0, Math.PI * 2);
    ctx.fillStyle = focused ? '#e8dcc4' : index % 3 === 0 ? '#d27c65' : '#c8a96d';
    ctx.fill();
    if (focused) {
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(232, 220, 196, 0.36)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  const stats = [
    { value: '9', label: 'NODES' },
    { value: '11', label: 'LINKS' },
    { value: '0.00', label: 'WATTS' },
  ];
  stats.forEach((stat, index) => {
    const x = 42 + index * 148;
    ctx.fillStyle = '#c8a96d';
    ctx.font = '500 52px "Cormorant Garamond", Georgia, serif';
    ctx.fillText(stat.value, x, 224);
    ctx.fillStyle = 'rgba(232, 220, 196, 0.4)';
    ctx.font = '500 14px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(stat.label, x, 248);
  });

  ctx.fillStyle = '#e8dcc4';
  ctx.font = '500 50px "Cormorant Garamond", Georgia, serif';
  ctx.fillText(pick.title, 42, 342);

  ctx.fillStyle = 'rgba(232, 220, 196, 0.5)';
  ctx.font = '500 17px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(pick.subtitle, 42, 376);

  ctx.strokeStyle = 'rgba(200, 169, 109, 0.2)';
  ctx.beginPath();
  ctx.moveTo(42, 408);
  ctx.lineTo(470, 408);
  ctx.stroke();

  const rows = [
    ['目录', 'CONTENTS · 12 CHAPTERS'],
    ['样章', 'SAMPLE · P.042'],
    ['讲题', 'LESSON L07 · 4 MIN'],
    ['图谱', 'GRAPH · 9 NODES'],
  ];
  rows.forEach(([zh, en], index) => {
    const y = 452 + index * 38;
    ctx.fillStyle = 'rgba(232, 220, 196, 0.38)';
    ctx.font = '500 15px "Noto Sans SC", sans-serif';
    ctx.fillText(zh, 42, y);
    ctx.fillStyle = index === 0 ? '#c8a96d' : 'rgba(232, 220, 196, 0.56)';
    ctx.font = '500 14px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(en, 104, y);
  });

  ctx.fillStyle = 'rgba(232, 220, 196, 0.26)';
  ctx.font = '400 13px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('DETERMINISTIC CONCEPT PREVIEW · NOT A LIVE FEED', 42, h - 32);
}

export function CloudSoulPanel({
  progressRef,
  pick,
  reducedMotion,
}: {
  progressRef: MutableRefObject<number>;
  pick: ShelfPick;
  reducedMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const panelMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const borderMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const beamMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const motesRef = useRef<THREE.Points>(null);
  const moteMatRef = useRef<THREE.PointsMaterial>(null);
  const moteAttrRef = useRef<THREE.BufferAttribute>(null);
  const { size } = useThree();

  const canvas = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const element = document.createElement('canvas');
    element.width = 1024;
    element.height = 640;
    return element;
  }, []);

  const texture = useMemo(() => {
    if (!canvas) return null;
    const value = new THREE.CanvasTexture(canvas);
    value.colorSpace = THREE.SRGBColorSpace;
    value.anisotropy = 8;
    return value;
  }, [canvas]);

  useEffect(() => {
    if (!canvas || !texture) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const redraw = () => {
      drawCloudPanel(ctx, pick);
      texture.needsUpdate = true;
    };
    redraw();
    void document.fonts?.ready.then(redraw);
  }, [canvas, texture, pick]);

  useEffect(() => () => texture?.dispose(), [texture]);

  const beamGeometry = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.043, 0.815, 0.034),
      new THREE.Vector3(0.145, 0.955, 0.058),
      new THREE.Vector3(0.178, 0.958, 0.06),
    );
    return new THREE.TubeGeometry(curve, 32, 0.0011, 6, false);
  }, []);

  const motePositions = useMemo(() => {
    const values = new Float32Array(21 * 3);
    for (let i = 0; i < 21; i += 1) {
      values[i * 3] = 0.07 + (i / 20) * 0.18;
      values[i * 3 + 1] = 0.85 + (i / 20) * 0.2;
      values[i * 3 + 2] = 0.06 + Math.sin(i * 2.4) * 0.018;
    }
    return values;
  }, []);

  useEffect(() => () => beamGeometry.dispose(), [beamGeometry]);

  useFrame((_, delta) => {
    const phase = progressRef.current * SHELF_PHASE_COUNT;
    // The card has to clear the frame before the book is carried in: at the
    // carry framing its left edge would otherwise print over the front board
    // as a dark rectangle while the panel fades.
    const inAmount = Math.min(1, Math.max(0, (phase - 1.78) / 0.1));
    const outAmount = 1 - Math.min(1, Math.max(0, (phase - 2.04) / 0.12));
    const vis = inAmount * outAmount;
    const mobile = size.width < 760;

    if (groupRef.current) {
      groupRef.current.visible = vis > 0.01;
      groupRef.current.position.set(
        mobile ? 0.1 : 0.225,
        (mobile ? 1.0 : 1.045) - (1 - vis) * 0.035 + (reducedMotion ? 0 : Math.sin(performance.now() * 0.0009) * 0.002),
        0.06,
      );
      groupRef.current.rotation.set(0.02, mobile ? -0.16 : -0.26, 0.008);
      const scale = (mobile ? 0.68 : 0.86) + vis * (mobile ? 0.12 : 0.14);
      groupRef.current.scale.setScalar(scale);
    }

    if (panelMatRef.current) panelMatRef.current.opacity = vis;
    if (borderMatRef.current) borderMatRef.current.opacity = vis * 0.62;
    if (beamRef.current) beamRef.current.visible = vis > 0.01 && !mobile;
    if (beamMatRef.current) beamMatRef.current.opacity = vis * 0.72;
    if (motesRef.current) motesRef.current.visible = vis > 0.01 && !mobile;
    if (moteMatRef.current) {
      moteMatRef.current.opacity = vis * 0.8;
      const positions = motePositions;
      const now = performance.now() * 0.00016;
      for (let i = 0; i < 21; i += 1) {
        positions[i * 3 + 1] = 0.83 + (((i / 20) + now) % 1) * 0.14;
      }
      if (moteAttrRef.current) moteAttrRef.current.needsUpdate = true;
    }
  });

  return (
    <>
      <group ref={groupRef} position={[0.225, 1.045, 0.06]} rotation={[0.02, -0.26, 0.008]} visible={false}>
        <mesh position={[0, 0, -0.004]}>
          <planeGeometry args={[0.298, 0.19]} />
          <meshBasicMaterial
            ref={borderMatRef}
            color="#c8a96d"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh>
          <planeGeometry args={[0.28, 0.175]} />
          <meshBasicMaterial
            ref={panelMatRef}
            map={texture ?? undefined}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>

      <mesh ref={beamRef} geometry={beamGeometry} visible={false}>
        <meshBasicMaterial
          ref={beamMatRef}
          color="#c8a96d"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <points ref={motesRef} position={[0, 0, 0]} visible={false}>
        <bufferGeometry>
          <bufferAttribute ref={moteAttrRef} attach="attributes-position" args={[motePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={moteMatRef}
          size={0.0034}
          color="#e0b372"
          transparent
          opacity={0}
          depthWrite={false}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </>
  );
}
