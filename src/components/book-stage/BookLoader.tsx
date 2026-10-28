import { useEffect, useRef, useState } from 'react';

type BookLoaderProps = {
  progress: number;
  done: boolean;
};

function Leaf({ variant }: { variant: 'a' | 'b' | 'c' }) {
  return (
    <span className={`page-loader__leaf page-loader__leaf--${variant}`} aria-hidden="true">
      <i className="page-loader__face page-loader__face--front">
        <i className="page-loader__shade" />
        <i className="page-loader__sheen" />
      </i>
      <i className="page-loader__face page-loader__face--back">
        <i className="page-loader__shade page-loader__shade--back" />
        <i className="page-loader__sheen page-loader__sheen--back" />
      </i>
    </span>
  );
}

export default function BookLoader({ progress, done }: BookLoaderProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [stage, setStage] = useState<'loading' | 'completing' | 'done'>('loading');
  const [hidden, setHidden] = useState(false);

  const displayRef = useRef(0);
  const doneRef = useRef(done);
  doneRef.current = done;

  const targetProgressRef = useRef(progress);
  targetProgressRef.current = progress;

  // useProgress derives its percentage from (loaded - lastTotal) / (total - lastTotal),
  // so every new asset batch inflates `total` and the percentage dips. Keep the
  // highest value seen so the bar only ever moves forward.
  const peakRef = useRef(0);

  useEffect(() => {
    let animId = 0;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min(50, currentTime - lastTime);
      lastTime = currentTime;

      const isDone = doneRef.current;
      const rawTarget = isDone ? 100 : Math.min(96, Math.max(8, targetProgressRef.current));
      peakRef.current = Math.max(peakRef.current, rawTarget);
      const target = peakRef.current;

      const diff = target - displayRef.current;
      if (Math.abs(diff) > 0.05) {
        // Fast yet silky damping curve
        const factor = isDone ? 0.16 : 0.08;
        displayRef.current += diff * (factor * (dt / 16.6));
        setDisplayProgress(Math.round(displayRef.current));
      } else if (isDone && displayRef.current < 100) {
        displayRef.current = 100;
        setDisplayProgress(100);
      }

      if (displayRef.current >= 99.5 && isDone) {
        setStage((prev) => (prev === 'loading' ? 'completing' : prev));
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animId);
  }, []);

  // When reaching 'completing', hold for a brief moment then gracefully exit
  useEffect(() => {
    if (stage === 'completing') {
      const settleTimer = setTimeout(() => {
        setStage('done');
        document.documentElement.classList.add('is-loaded');
        window.dispatchEvent(new CustomEvent('bookln:loader-done'));
      }, 200);

      const hideTimer = setTimeout(() => {
        setHidden(true);
      }, 1050);

      return () => {
        clearTimeout(settleTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [stage]);

  if (hidden) {
    return null;
  }

  const value = Math.max(0, Math.min(100, displayProgress));
  const fill = Math.max(0.02, value / 100);
  const isDoneClass = stage === 'done' ? ' is-done' : stage === 'completing' ? ' is-completing' : '';

  return (
    <div
      className={`page-loader${isDoneClass}`}
      role="status"
      aria-live="polite"
      aria-label={stage === 'done' ? '书卷已展开' : '正在展开书页，加载中'}
    >
      <div className="page-loader__backdrop" aria-hidden="true" />
      <div className="page-loader__inner">
        <div className="page-loader__book" aria-hidden="true">
          <span className="page-loader__spread">
            <span className="page-loader__page page-loader__page--left" />
            <span className="page-loader__page page-loader__page--right" />
            <span className="page-loader__gutter" />
            <Leaf variant="a" />
            <Leaf variant="b" />
            <Leaf variant="c" />
          </span>
          <span className="page-loader__edge" />
        </div>

        <div className="page-loader__readout">
          <span className="page-loader__label">
            <b>{stage === 'loading' ? 'UNFOLDING' : 'OPENING'}</b>
            <em>{stage === 'loading' ? '正在展开' : '正在启卷'}</em>
          </span>
          <span className="page-loader__value" aria-hidden="true">
            {String(value).padStart(2, '0')}
            <small>%</small>
          </span>
        </div>

        <span className="page-loader__bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${fill})` }} />
        </span>
      </div>
    </div>
  );
}
