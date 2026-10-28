type BookLoaderProps = {
  progress: number;
  done: boolean;
};

function Leaf({ variant }: { variant: 'a' | 'b' | 'c' }) {
  return (
    <span className={`page-loader__leaf page-loader__leaf--${variant}`}>
      <i className="page-loader__face page-loader__face--front" />
      <i className="page-loader__face page-loader__face--back" />
    </span>
  );
}

export default function BookLoader({ progress, done }: BookLoaderProps) {
  const value = Math.max(0, Math.min(100, Math.round(progress)));
  const fill = Math.max(0.015, value / 100);

  return (
    <div
      className={`page-loader${done ? ' is-done' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="正在展开书页，加载中"
    >
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
            <b>UNFOLDING</b>
            <em>正在展开</em>
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
