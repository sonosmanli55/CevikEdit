/**
 * Timeline inertia (kinetic scrolling) and minimap geometry.
 *
 * Both are pure so the feel can be verified without a DOM: inertia turns a
 * release velocity into a decaying scroll distance, and the minimap turns
 * project time into a small normalized viewport.
 */
export interface InertiaStep {
  offset: number;
  velocity: number;
  done: boolean;
}

/** Fraction of velocity kept per 60 Hz frame. */
export const INERTIA_FRICTION = 0.92;
/** Below this px/s the glide stops. */
export const INERTIA_STOP = 6;
/** Hard cap so a fast flick never flies across the whole project. */
export const INERTIA_MAX_VELOCITY = 6000;

/**
 * Advance one frame of the glide. `velocity` is px/s, `deltaMs` the frame time,
 * and the returned offset is the scroll delta for that frame.
 */
export function inertiaStep(
  velocity: number,
  deltaMs: number,
  friction = INERTIA_FRICTION,
): InertiaStep {
  const capped = Math.max(
    -INERTIA_MAX_VELOCITY,
    Math.min(INERTIA_MAX_VELOCITY, velocity),
  );
  const frames = Math.max(0, Math.min(4, deltaMs / (1000 / 60)));
  if (!Number.isFinite(frames) || frames === 0)
    return { offset: 0, velocity: capped, done: Math.abs(capped) < INERTIA_STOP };
  // Sum of the geometric series over the elapsed 60 Hz frames keeps the glide
  // frame-rate independent instead of changing feel on 120 Hz displays.
  const decay = friction ** frames;
  const offset = (capped / 60) * ((1 - decay) / (1 - friction));
  const next = capped * decay;
  return {
    offset,
    velocity: next,
    done: Math.abs(next) < INERTIA_STOP,
  };
}

/** Velocity estimate from the last two pointer samples. */
export function pointerVelocity(
  previous: { x: number; time: number },
  current: { x: number; time: number },
): number {
  const elapsed = Math.max(1, current.time - previous.time);
  return ((current.x - previous.x) / elapsed) * 1000;
}

export interface MinimapGeometry {
  /** Visible window start and width, both 0–1 of the whole timeline. */
  left: number;
  width: number;
  /** Playhead position 0–1. */
  playhead: number;
  /** Clip bars with their normalized start/width and a track index. */
  bars: Array<{ start: number; width: number; track: number }>;
}

/**
 * Normalized minimap for a timeline of `duration` seconds, `pps` pixels per
 * second, `scrollLeft`/`viewportWidth` in pixels and a fixed `gutter`.
 */
export function minimapGeometry(input: {
  duration: number;
  pps: number;
  scrollLeft: number;
  viewportWidth: number;
  gutter: number;
  playhead: number;
  clips: Array<{ start: number; duration: number; track: number }>;
}): MinimapGeometry {
  const duration = Number.isFinite(input.duration) && input.duration > 0 ? input.duration : 1;
  const pps = Number.isFinite(input.pps) && input.pps > 0 ? input.pps : 1;
  const visible = Math.max(1, input.viewportWidth - input.gutter) / pps;
  const total = Math.max(duration, visible);
  const left = Math.max(0, Math.min(1, input.scrollLeft / pps / total));
  const width = Math.max(0.02, Math.min(1 - left, visible / total));
  const bars = input.clips
    .filter((clip) => Number.isFinite(clip.start) && clip.duration > 0)
    .map((clip) => ({
      start: Math.max(0, Math.min(1, clip.start / total)),
      width: Math.max(0.004, Math.min(1, clip.duration / total)),
      track: clip.track,
    }));
  return {
    left,
    width,
    playhead: Math.max(0, Math.min(1, input.playhead / total)),
    bars,
  };
}

/** Scroll offset that centers the clicked minimap position. */
export function minimapScrollLeft(
  ratio: number,
  duration: number,
  pps: number,
  viewportWidth: number,
  gutter: number,
): number {
  const visible = Math.max(1, viewportWidth - gutter);
  const target = Math.max(0, Math.min(1, ratio)) * duration * pps;
  return Math.max(0, Math.min(target - visible / 2, duration * pps - visible));
}
