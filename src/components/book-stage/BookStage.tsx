import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AdaptiveDpr, useProgress } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { createWheelScroll } from '../../lib/scroll/wheelScroll';
import { BookScene, SHELF_CUT } from './BookScene';
import type { StageInteractionState } from './BookScene';
import { SHELF_PHASE_COUNT, shelfPresence } from './ShelfStage';
import BookLoader from './BookLoader';

type SceneErrorBoundaryProps = {
  children: ReactNode;
  onError: () => void;
};

type SceneErrorBoundaryState = {
  failed: boolean;
};

class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
  state: SceneErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[bookln] 3D scene failed:', error, info.componentStack);
    this.props.onError();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function StageFallback({
  canEnable,
  onEnable,
  reduced,
  noWebgl,
}: {
  canEnable: boolean;
  onEnable: () => void;
  reduced: boolean;
  noWebgl: boolean;
}) {
  return (
    <div className="stage-fallback">
      <div className="stage-fallback__halo" aria-hidden="true" />
      <div className="stage-fallback__cover" aria-hidden="true">
        <picture>
          <source media="(max-width: 760px)" srcSet="/fallback/book-cover-art.webp" />
          <img
            src="/fallback/book-cover-art.webp"
            alt=""
            width="512"
            height="768"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
      </div>
      <div className="stage-fallback__frame" aria-hidden="true" />
      {canEnable && (
        <button type="button" className="stage-fallback__enable" onClick={onEnable}>
          Enable 3D
        </button>
      )}
      {noWebgl && <p className="stage-fallback__note">Static edition · WebGL unavailable</p>}
      {reduced && canEnable && <p className="stage-fallback__note">Motion reduced</p>}
    </div>
  );
}

export default function BookStage() {
  const [mounted, setMounted] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [force3D, setForce3D] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const progressRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const interactionRef = useRef<StageInteractionState>({
    activeNode: 'page',
    activeEdition: 'pro',
  });
  const { progress } = useProgress();

  const showCanvas = mounted && webgl && !failed && (!reduced || force3D);

  useEffect(() => {
    setMounted(true);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(motionQuery.matches);

    const handleMotionChange = () => setReduced(motionQuery.matches);
    motionQuery.addEventListener('change', handleMotionChange);

    const probe = document.createElement('canvas');
    const context =
      probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ||
      probe.getContext('webgl', { failIfMajorPerformanceCaveat: false });
    setWebgl(Boolean(context));

    return () => {
      motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  useEffect(() => {
    const onNode = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string | null }>).detail;
      interactionRef.current.activeNode = detail?.id ?? 'page';
    };
    const onEdition = (event: Event) => {
      const detail = (event as CustomEvent<{ id: 'standard' | 'pro' | 'enterprise' }>).detail;
      if (detail?.id) {
        interactionRef.current.activeEdition = detail.id;
      }
    };

    window.addEventListener('bookln:node', onNode);
    window.addEventListener('bookln:edition', onEdition);

    return () => {
      window.removeEventListener('bookln:node', onNode);
      window.removeEventListener('bookln:edition', onEdition);
    };
  }, []);

  useEffect(() => {
    let frame = 0;

    // Static appendices (e.g. the Chain business chapter) opt out of the 3D
    // keyframe timeline so the existing phase constants stay untouched.
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-chapter]:not([data-no-phase])'),
    );

    const update = () => {
      const limit = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const pageProgress = Math.min(1, Math.max(0, window.scrollY / limit));
      document.documentElement.style.setProperty('--page-progress', pageProgress.toFixed(4));

      if (!sections.length) {
        progressRef.current = pageProgress;
        return;
      }

      const starts = sections.map((section) => section.getBoundingClientRect().top + window.scrollY);
      const y = window.scrollY;
      let phase = 0;

      if (y >= starts[starts.length - 1]) {
        phase = starts.length - 1;
      } else {
        for (let index = 0; index < starts.length - 1; index += 1) {
          if (y >= starts[index] && y < starts[index + 1]) {
            const span = Math.max(1, starts[index + 1] - starts[index]);
            const local = Math.min(1, Math.max(0, (y - starts[index]) / span));
            phase = index + local;
            break;
          }
        }
      }

      progressRef.current = Math.min(1, phase / Math.max(1, starts.length - 1));

      // Direct manipulation is only offered while the shelf is on stage. The
      // class also lets the canvas receive clicks through the story layer.
      const shelfHot = shelfPresence(progressRef.current * SHELF_PHASE_COUNT) > 0.12;
      document.documentElement.classList.toggle('is-shelf-hot', shelfHot);

      // Hand-off: the book is no longer carried back into its shelf slot, so
      // the stage cuts straight to the shelved pose. These envelopes are the
      // mask around that cut — closed over the switch and open again once the
      // shelf owns the frame. `--handoff` paints the mask, `--handoff-type`
      // the shelf label that rides on top of it.
      const mask = Math.min(
        Math.min(1, Math.max(0, (phase - (SHELF_CUT - 0.1)) / 0.08)),
        Math.min(1, Math.max(0, (SHELF_CUT + 0.18 - phase) / 0.08)),
      );
      const type = Math.min(
        Math.min(1, Math.max(0, (phase - (SHELF_CUT - 0.04)) / 0.06)),
        Math.min(1, Math.max(0, (SHELF_CUT + 0.2 - phase) / 0.06)),
      );
      document.documentElement.style.setProperty('--handoff', mask.toFixed(3));
      document.documentElement.style.setProperty('--handoff-type', type.toFixed(3));
      document.documentElement.classList.toggle('is-handoff', phase < 0.9);
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('load', schedule);
      document.documentElement.classList.remove('is-shelf-hot');
    };
  }, []);

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      pointerRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };

    const resetPointer = () => {
      pointerRef.current.x = 0;
      pointerRef.current.y = 0;
    };

    window.addEventListener('pointermove', handlePointer, { passive: true });
    document.addEventListener('pointerleave', resetPointer);

    return () => {
      window.removeEventListener('pointermove', handlePointer);
      document.removeEventListener('pointerleave', resetPointer);
    };
  }, []);

  useEffect(() => {
    if (!mounted || reduced) return;

    const wheelScroll = createWheelScroll({ speed: 1.2, lead: 0.7, ease: 11 });

    const handleAnchor = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;
      const section = document.querySelector(href);
      if (!section) return;
      event.preventDefault();
      wheelScroll.scrollToElement(section, { offset: 84 });
    };

    document.addEventListener('click', handleAnchor);

    return () => {
      document.removeEventListener('click', handleAnchor);
      wheelScroll.destroy();
    };
  }, [mounted, reduced]);

  const handleReady = useCallback(() => setReady(true), []);
  const handleError = useCallback(() => {
    setFailed(true);
    setReady(false);
  }, []);

  const loaderDone = mounted && (ready || !webgl || failed || reduced);

  return (
    <>
      <BookLoader progress={progress} done={loaderDone} />

      <div className={`book-stage${ready ? ' is-ready' : ''}`}>
        <StageFallback
          canEnable={reduced && webgl}
          onEnable={() => setForce3D(true)}
          reduced={reduced}
          noWebgl={mounted && !webgl}
        />

        {showCanvas && (
          <div className="book-stage__canvas" aria-hidden="true">
            <SceneErrorBoundary onError={handleError}>
              <Canvas
                dpr={[1, 1.75]}
                camera={{ fov: 32, near: 0.05, far: 20, position: [-0.18, 1.04, 0.69] }}
                gl={{
                  antialias: true,
                  alpha: false,
                  powerPreference: 'high-performance',
                  stencil: false,
                }}
                shadows={false}
                frameloop="always"
                onCreated={({ gl }) => {
                  gl.toneMapping = THREE.ACESFilmicToneMapping;
                  // Bump exposure a touch — richer blacks without blowing highlights
                  gl.toneMappingExposure = 1.1;
                }}
              >
                <AdaptiveDpr pixelated={false} />
                <Suspense fallback={null}>
                  <BookScene
                    progressRef={progressRef}
                    pointerRef={pointerRef}
                    interactionRef={interactionRef}
                    reducedMotion={reduced}
                    onReady={handleReady}
                  />
                </Suspense>
              </Canvas>
            </SceneErrorBoundary>
          </div>
        )}

        <div className="stage-scrim" aria-hidden="true" />
        <div className="stage-grain" aria-hidden="true" />
      </div>
    </>
  );
}
