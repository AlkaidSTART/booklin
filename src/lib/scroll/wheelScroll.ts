type WheelScrollOptions = {
  /** Distance per second, measured in viewport heights. */
  speed?: number;
  /** How far the target may run ahead of the page, in viewport heights. */
  lead?: number;
  /** Exponential catch-up factor. Higher settles sooner. */
  ease?: number;
};

export type WheelScrollController = {
  scrollToElement: (element: Element, options?: { offset?: number }) => void;
  destroy: () => void;
};

const WHEEL_DELTA_CAP = 180;
const LINE_HEIGHT = 16;
const ANCHOR_SPEED = 3.2;
const ANCHOR_MIN_DURATION = 0.4;
const ANCHOR_MAX_DURATION = 1.3;
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
  'Spacebar',
]);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createWheelScroll(options: WheelScrollOptions = {}): WheelScrollController {
  const speed = options.speed ?? 1;
  const lead = options.lead ?? 0.7;
  const ease = options.ease ?? 11;

  const root = document.documentElement;
  const previousBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';

  let scroll = window.scrollY;
  let target = scroll;
  let frame = 0;
  let lastTime = 0;
  let tween: { from: number; to: number; start: number; duration: number } | null = null;

  const limit = () => Math.max(0, root.scrollHeight - window.innerHeight);

  const write = (value: number) => {
    window.scrollTo(0, value);
  };

  const stop = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    tween = null;
  };

  const tick = (now: number) => {
    frame = 0;
    const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = now;

    if (tween) {
      const progress = clamp((now - tween.start) / tween.duration, 0, 1);
      scroll = tween.from + (tween.to - tween.from) * easeInOut(progress);
      write(scroll);

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
        return;
      }

      target = tween.to;
      tween = null;
      stop();
      return;
    }

    const distance = target - scroll;

    if (Math.abs(distance) < 0.5) {
      scroll = target;
      write(scroll);
      stop();
      return;
    }

    const maxStep = speed * window.innerHeight * delta;
    const step = clamp(distance * (1 - Math.exp(-ease * delta)), -maxStep, maxStep);

    scroll = clamp(scroll + step, 0, limit());
    write(scroll);
    frame = window.requestAnimationFrame(tick);
  };

  const start = () => {
    if (frame) return;
    lastTime = 0;
    frame = window.requestAnimationFrame(tick);
  };

  const handleWheel = (event: WheelEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= LINE_HEIGHT;
    else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= window.innerHeight;
    delta = clamp(delta, -WHEEL_DELTA_CAP, WHEEL_DELTA_CAP);

    if (!delta) return;

    event.preventDefault();

    const current = window.scrollY;

    // A running wheel loop already holds a live target; anything else
    // (idle, anchor tween) restarts from the position on screen.
    if (!frame || tween) target = current;
    tween = null;
    scroll = current;

    if ((target - current) * delta < 0) target = current;

    const reach = Math.max(240, window.innerHeight * lead);
    target = clamp(target + delta, current - reach, current + reach);
    target = clamp(target, 0, limit());

    start();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (SCROLL_KEYS.has(event.key)) stop();
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.clientX >= root.clientWidth) stop();
  };

  const handleTouchStart = () => stop();

  const handleResize = () => {
    stop();
    scroll = window.scrollY;
    target = scroll;
  };

  const scrollToElement = (element: Element, { offset = 0 } = {}) => {
    const to = clamp(element.getBoundingClientRect().top + window.scrollY - offset, 0, limit());
    const from = window.scrollY;

    if (Math.abs(to - from) < 2) return;

    tween = {
      from,
      to,
      start: performance.now(),
      duration:
        clamp(
          Math.abs(to - from) / (window.innerHeight * ANCHOR_SPEED),
          ANCHOR_MIN_DURATION,
          ANCHOR_MAX_DURATION,
        ) * 1000,
    };

    start();
  };

  window.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('touchstart', handleTouchStart, { passive: true });
  window.addEventListener('resize', handleResize);

  return {
    scrollToElement,
    destroy() {
      stop();
      root.style.scrollBehavior = previousBehavior;
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('resize', handleResize);
    },
  };
}
