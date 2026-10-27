import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { RoundedBox, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const SHELF_PHASE_COUNT = 9;

export type ShelfPick = {
  x: number;
  row: number;
  rowY: number;
  slot: number;
  title: string;
  subtitle: string;
};

const PICK_TITLES = [
  { title: 'THE BOOK.', subtitle: 'CODEX 1 · PAPER + CLOUD' },
  { title: 'PAGE 042.', subtitle: 'HAPTIC ADDRESS · PAPER + CLOUD' },
  { title: 'NIGHT COPY.', subtitle: 'LOOP EDITION · PAPER + CLOUD' },
  { title: 'THE FIRST READER.', subtitle: 'SHELF COPY 0001 · PAPER + CLOUD' },
  { title: 'CELULOSE.', subtitle: 'STRUCTURE NOTES · PAPER + CLOUD' },
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

const CLOTH_PALETTE = [
  '#2a211a',
  '#241c17',
  '#1e2426',
  '#2e2318',
  '#331f1c',
  '#1d2220',
  '#3a2c1f',
  '#3f241d',
  '#232323',
  '#2a2a1e',
  '#4a3524',
  '#1a1d21',
  '#5b4630',
  '#6b5338',
];

const GOLD = '#b58a4c';

const pageBlockBase = '#cdbb96';

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

  const gapHalf = 24;
  const gapCenter = gapX * 1000;

  for (const row of rows) {
    let x = innerL + 14 + rand() * 30;
    while (x < innerR - 24) {
      const w = 20 + rand() * 26;
      const h = Math.min(row.maxH, 176 + rand() * (row.maxH - 176));
      const d = 132 + rand() * 54;
      const color = CLOTH_PALETTE[Math.floor(rand() * CLOTH_PALETTE.length)];
      const lean = rand() > 0.88 ? (rand() > 0.5 ? 1 : -1) * (0.025 + rand() * 0.045) : 0;
      const spec: BookSpec = {
        x,
        rowY: row.y,
        w,
        h,
        d,
        lean,
        color,
        pageTint: rand() > 0.5 ? '#d8c7a2' : pageBlockBase,
        bands: rand() > 0.45 ? 2 : 0,
        label: rand() > 0.58,
        labelTint: rand() > 0.55 ? '#c8b48a' : '#8d6f45',
      };

      if (row.gap) {
        const left = spec.x;
        const right = spec.x + spec.w;
        const gapLeft = gapCenter - gapHalf;
        const gapRight = gapCenter + gapHalf;
        if (right > gapLeft - 22 && left < gapRight + 22) {
          x = gapRight + 26;
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

export function ShelfBooks({ pick }: { pick: ShelfPick }) {
  const specs = useMemo(() => buildShelfBooks(pick.x), [pick.x]);
  const pageTexture = useMemo(makePageTexture, []);

  const pageRef = useRef<THREE.InstancedMesh>(null);
  const coverRef = useRef<THREE.InstancedMesh>(null);
  const spineRef = useRef<THREE.InstancedMesh>(null);
  const bandRef = useRef<THREE.InstancedMesh>(null);
  const labelRef = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

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
        roughness: 0.84,
        metalness: 0.02,
        envMapIntensity: 0.36,
      }),
    [],
  );

  const goldMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: GOLD,
        roughness: 0.38,
        metalness: 0.82,
        envMapIntensity: 0.72,
      }),
    [],
  );

  const labelMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.72,
        metalness: 0,
        envMapIntensity: 0.24,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      pageTexture?.dispose();
      pageMaterial.dispose();
      clothMaterial.dispose();
      goldMaterial.dispose();
      labelMaterial.dispose();
    };
  }, [geometry, pageTexture, pageMaterial, clothMaterial, goldMaterial, labelMaterial]);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    const write = (
      mesh: THREE.InstancedMesh | null,
      index: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      rotation: number,
    ) => {
      if (!mesh) return;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, rotation);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    };

    specs.forEach((spec, index) => {
      const w = spec.w;
      const h = spec.h;
      const d = spec.d;

      write(pageRef.current, index, spec.x, spec.rowY + h / 2, -d / 2, w - 5, h - 8, d - 8, spec.lean);
      pageRef.current?.setColorAt(index, color.set(spec.pageTint));

      write(coverRef.current, index * 2, spec.x - (w / 2 - 1.2), spec.rowY + h / 2, -d / 2 + 0.5, 2.4, h + 2, d + 3, spec.lean);
      coverRef.current?.setColorAt(index * 2, color.set(spec.color));
      write(coverRef.current, index * 2 + 1, spec.x + (w / 2 - 1.2), spec.rowY + h / 2, -d / 2 + 0.5, 2.4, h + 2, d + 3, spec.lean);
      coverRef.current?.setColorAt(index * 2 + 1, color.set(spec.color));

      write(spineRef.current, index, spec.x, spec.rowY + h / 2, -0.6, w + 0.4, h + 2, 4, spec.lean);
      spineRef.current?.setColorAt(index, color.set(spec.color));

      if (spec.bands > 0) {
        const bandIndex = specs.slice(0, index).filter((item) => item.bands > 0).length * 2;
        write(bandRef.current, bandIndex, spec.x, spec.rowY + h * 0.72, 1.75, w + 0.6, 2.2, 0.9, spec.lean);
        write(bandRef.current, bandIndex + 1, spec.x, spec.rowY + h * 0.3, 1.75, w + 0.6, 2.2, 0.9, spec.lean);
      }
    });

    let labelIndex = 0;
    specs.forEach((spec) => {
      if (!spec.label) return;
      write(labelRef.current, labelIndex, spec.x, spec.rowY + spec.h * 0.55, 1.7, Math.max(8, spec.w * 0.58), 10, 0.7, spec.lean);
      labelRef.current?.setColorAt(labelIndex, color.set(spec.labelTint));
      labelIndex += 1;
    });

    for (const mesh of [pageRef.current, coverRef.current, spineRef.current, bandRef.current, labelRef.current]) {
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
        ref={bandRef}
        args={[geometry, goldMaterial, specs.filter((spec) => spec.bands > 0).length * 2]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={labelRef}
        args={[geometry, labelMaterial, specs.filter((spec) => spec.label).length]}
        frustumCulled={false}
      />
    </group>
  );
}

/* ------------------------------------------------------------------
   Shelf selection halo + integrated light strips
   ------------------------------------------------------------------ */

export function ShelfSelection({ pick }: { pick: ShelfPick }) {
  const glowRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringRef = useRef<THREE.Mesh>(null);

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

  useFrame((_, delta) => {
    if (glowRef.current) {
      const breath = 0.55 + Math.sin(performance.now() * 0.0014) * 0.16;
      glowRef.current.opacity = THREE.MathUtils.damp(glowRef.current.opacity, breath, 4, delta);
    }
    if (ringRef.current) {
      const pulse = 1 + Math.sin(performance.now() * 0.0018) * 0.08;
      ringRef.current.scale.setScalar(pulse);
    }
  });

  const centerX = pick.x * 1000;

  return (
    <group>
      <mesh position={[centerX, pick.rowY + 130, -42]}>
        <planeGeometry args={[110, 290]} />
        <meshBasicMaterial
          ref={glowRef}
          map={glowTexture ?? undefined}
          transparent
          opacity={0.4}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={ringRef} position={[centerX, pick.rowY + 4, 2]}>
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
}: {
  progressRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const qr = useTexture('/qr/one-code-entry.png');
  const sweepRef = useRef<THREE.Mesh>(null);
  const sweepMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.MeshBasicMaterial>(null);
  const frameRef = useRef<THREE.Group>(null);

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
        strength * pulse + 0.06,
        6,
        delta,
      );
    }
    if (frameRef.current) {
      frameRef.current.visible = true;
    }
    if (sweepRef.current) {
      const sweep = ((phase - 1.44) / 0.26) % 1;
      sweepRef.current.position.y = 42.5 - Math.max(0, Math.min(1, sweep)) * 25;
      sweepRef.current.visible = strength > 0.01;
    }
  });

  return (
    <group position={[46, 43.5, 15.5]}>
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
          [-17.6, -17.6, 0, 0],
          [17.6, -17.6, Math.PI / 2, 0],
          [17.6, 17.6, Math.PI, 0],
          [-17.6, 17.6, -Math.PI / 2, 0],
        ].map(([x, y, rot, key], index) => (
          <mesh key={index} position={[x, y, 0]} rotation={[0, 0, rot]}>
            <planeGeometry args={[8, 0.7]} />
            <meshBasicMaterial color="#e0b372" transparent opacity={0.55} depthWrite={false} toneMapped={false} />
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
  );
}

/* ------------------------------------------------------------------
   Phone scanner
   ------------------------------------------------------------------ */

function drawPhoneScreen(
  ctx: CanvasRenderingContext2D,
  found: boolean,
  pick: ShelfPick,
  qrImage: HTMLImageElement | null,
) {
  const w = 512;
  const h = 1024;
  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0b0a08');
  bg.addColorStop(0.55, '#080706');
  bg.addColorStop(1, '#050504');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

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

  const vf = { x: 36, y: 170, w: 440, h: 404 };

  ctx.fillStyle = '#0c0b09';
  ctx.fillRect(vf.x, vf.y, vf.w, vf.h);
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

  if (qrImage && qrImage.complete) {
    ctx.save();
    ctx.globalAlpha = found ? 0.94 : 0.8;
    ctx.drawImage(qrImage, vf.x + 68, vf.y + 52, 304, 304);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(232, 220, 196, 0.1)';
    ctx.fillRect(vf.x + 96, vf.y + 80, 248, 248);
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
  ctx.fillText(found ? pick.title : 'THE BOOK.', 36, 754);

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
  ctx.fillText(found ? 'CLOUD SOUL · UPLINK READY' : 'SCROLL TO UPLINK', 36, 936);

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
}: {
  progressRef: MutableRefObject<number>;
  pick: ShelfPick;
  reducedMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const screenMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const scanRef = useRef<THREE.Mesh>(null);
  const scanMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const [found, setFound] = useState(false);
  const foundRef = useRef(false);
  const qrImage = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const image = new Image();
    image.src = '/qr/one-code-entry.png';
    return image;
  }, []);

  const canvas = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const element = document.createElement('canvas');
    element.width = 512;
    element.height = 1024;
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
      drawPhoneScreen(ctx, found, pick, qrImage);
      texture.needsUpdate = true;
    };
    redraw();
    void document.fonts?.ready.then(redraw);
    if (qrImage) {
      if (qrImage.complete) redraw();
      else qrImage.addEventListener('load', redraw, { once: true });
    }
    return () => {
      qrImage?.removeEventListener('load', redraw);
    };
  }, [canvas, texture, found, pick, qrImage]);

  useEffect(() => {
    return () => texture?.dispose();
  }, [texture]);

  useFrame((_, delta) => {
    const phase = progressRef.current * SHELF_PHASE_COUNT;
    const rise = Math.min(1, Math.max(0, (phase - 1.56) / 0.18));
    const fadeIn = Math.min(1, Math.max(0, (phase - 1.56) / 0.1));
    const fadeOut = 1 - Math.min(1, Math.max(0, (phase - 2.06) / 0.14));
    const vis = fadeIn * fadeOut;
    const eased = rise * rise * (3 - 2 * rise);

    if (groupRef.current) {
      groupRef.current.visible = vis > 0.01;
      groupRef.current.position.x = 0.285;
      groupRef.current.position.y = 0.862 - (1 - eased) * 0.2 + (reducedMotion ? 0 : Math.sin(performance.now() * 0.0011) * 0.003);
      groupRef.current.position.z = 0.19;
      groupRef.current.rotation.set(0.02, -0.4, 0.015);
      const scale = 0.86 + eased * 0.14;
      groupRef.current.scale.setScalar(scale);
    }

    if (bodyMatRef.current) bodyMatRef.current.opacity = vis;
    if (screenMatRef.current) screenMatRef.current.opacity = vis;
    if (glowMatRef.current) {
      glowMatRef.current.opacity = vis * (reducedMotion ? 0.09 : 0.07 + Math.sin(performance.now() * 0.0016) * 0.025);
    }

    if (scanRef.current) {
      const scanning = phase > 1.64 && phase < 1.83;
      const progress = ((phase - 1.64) / 0.19) % 1;
      scanRef.current.visible = scanning;
      scanRef.current.position.y = 0.066 - Math.max(0, Math.min(1, progress)) * 0.132;
      if (scanMatRef.current) scanMatRef.current.opacity = scanning ? 0.8 : 0;
    }

    const shouldFound = phase > 1.82;
    if (shouldFound !== foundRef.current) {
      foundRef.current = shouldFound;
      setFound(shouldFound);
    }

    void delta;
  });

  return (
    <group ref={groupRef} position={[0.285, 0.862, 0.19]} rotation={[0.02, -0.4, 0.015]} visible={false}>
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

      <mesh position={[0, 0, 0.0074]}>
        <planeGeometry args={[0.079, 0.171]} />
        <meshBasicMaterial
          ref={screenMatRef}
          map={texture ?? undefined}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={scanRef} position={[0, 0.066, 0.0085]} visible={false}>
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
  ctx.fillText('CLOUD SOUL', 42, 64);
  ctx.fillStyle = 'rgba(232, 220, 196, 0.46)';
  ctx.font = '400 16px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('云魂 · PUBLIC PREVIEW', 42, 92);

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
      new THREE.Vector3(0.16, 0.975, 0.07),
      new THREE.Vector3(0.215, 0.961, 0.079),
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
    const inAmount = Math.min(1, Math.max(0, (phase - 1.8) / 0.12));
    const outAmount = 1 - Math.min(1, Math.max(0, (phase - 2.08) / 0.12));
    const vis = inAmount * outAmount;
    const mobile = size.width < 760;

    if (groupRef.current) {
      groupRef.current.visible = vis > 0.01;
      groupRef.current.position.set(
        mobile ? 0.14 : 0.255,
        1.055 - (1 - vis) * 0.035 + (reducedMotion ? 0 : Math.sin(performance.now() * 0.0009) * 0.002),
        0.08,
      );
      groupRef.current.rotation.set(0.02, mobile ? -0.12 : -0.2, 0.008);
      const scale = (mobile ? 0.72 : 0.86) + vis * (mobile ? 0.14 : 0.14);
      groupRef.current.scale.setScalar(scale);
    }

    if (panelMatRef.current) panelMatRef.current.opacity = vis;
    if (borderMatRef.current) borderMatRef.current.opacity = vis * 0.62;
    if (beamRef.current) beamRef.current.visible = vis > 0.01;
    if (beamMatRef.current) beamMatRef.current.opacity = vis * 0.72;
    if (motesRef.current) motesRef.current.visible = vis > 0.01;
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
      <group ref={groupRef} position={[0.255, 1.055, 0.08]} rotation={[0.02, -0.2, 0.008]} visible={false}>
        <mesh position={[0, 0, -0.004]}>
          <planeGeometry args={[0.318, 0.204]} />
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
          <planeGeometry args={[0.3, 0.188]} />
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
