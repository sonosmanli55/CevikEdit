/**
 * Timeline viewport math shared by the timeline UI and its tests.
 *
 * The timeline is a scroll container whose content is measured in pixels per
 * second (pps). All helpers here are pure so zoom anchoring, panning limits and
 * the visible range can be verified without a DOM.
 */
export const MIN_PPS = 2;
export const MAX_PPS = 1600;

/** Pixels per second clamp used by every zoom entry point. */
export function clampPps(value: number): number {
  if (!Number.isFinite(value)) return MIN_PPS;
  return Math.min(MAX_PPS, Math.max(MIN_PPS, value));
}

/**
 * Next zoom level for a wheel notch. Zooming in and out with the same notch
 * count returns to the original level because the factors are reciprocal.
 */
export function wheelZoomPps(pps: number, deltaY: number, step = 1.15): number {
  if (!Number.isFinite(deltaY) || deltaY === 0)
    return clampPps(pps);
  const safeStep = Math.min(2, Math.max(1.01, step));
  const next = deltaY < 0 ? pps * safeStep : pps / safeStep;
  return clampPps(next);
}

export interface ZoomAnchor {
  pps: number;
  nextPps: number;
  /** Current scroll offset of the timeline container. */
  scrollLeft: number;
  /** Cursor X relative to the container's left edge. */
  cursorX: number;
  /** Width of the fixed track-name gutter inside the scrollable content. */
  gutter: number;
}

/**
 * Scroll offset that keeps the time under the cursor fixed while the scale
 * changes. Without this, zooming jumps to an unrelated part of the timeline.
 */
export function zoomedScrollLeft({
  pps,
  nextPps,
  scrollLeft,
  cursorX,
  gutter,
}: ZoomAnchor): number {
  if (!Number.isFinite(pps) || pps <= 0) return Math.max(0, scrollLeft);
  // A cursor over the fixed track-name gutter has no meaningful time anchor.
  if (!Number.isFinite(cursorX) || cursorX <= gutter) return Math.max(0, scrollLeft);
  const time = Math.max(0, (scrollLeft + cursorX - gutter) / pps);
  return Math.max(0, time * nextPps - cursorX + gutter);
}

/** Largest useful scroll offset for the current content and viewport. */
export function maxScrollLeft(
  bodyWidth: number,
  viewportWidth: number,
): number {
  if (!Number.isFinite(bodyWidth) || !Number.isFinite(viewportWidth))
    return 0;
  return Math.max(0, bodyWidth - Math.max(0, viewportWidth));
}

export function clampScrollLeft(
  scrollLeft: number,
  bodyWidth: number,
  viewportWidth: number,
): number {
  if (!Number.isFinite(scrollLeft)) return 0;
  return Math.min(
    maxScrollLeft(bodyWidth, viewportWidth),
    Math.max(0, scrollLeft),
  );
}

export interface VisibleRange {
  start: number;
  end: number;
  /** Seconds visible in the viewport, never negative. */
  span: number;
}

/** Time span currently visible, ignoring the fixed gutter. */
export function visibleRange(
  scrollLeft: number,
  viewportWidth: number,
  gutter: number,
  pps: number,
): VisibleRange {
  if (!Number.isFinite(pps) || pps <= 0)
    return { start: 0, end: 0, span: 0 };
  const width = Math.max(0, viewportWidth - gutter);
  const start = Math.max(0, scrollLeft / pps);
  const end = Math.max(start, (scrollLeft + width) / pps);
  return { start, end, span: end - start };
}

/** Scale that shows the whole project inside the viewport with a small margin. */
export function fitTimelinePps(
  viewportWidth: number,
  gutter: number,
  duration: number,
): number {
  const width = Math.max(0, viewportWidth - gutter - 24);
  if (!Number.isFinite(duration) || duration <= 0) return clampPps(60);
  return clampPps(width / duration);
}

/** Horizontal pan in pixels for a wheel/shift-wheel gesture. */
export function panScrollLeft(
  scrollLeft: number,
  delta: number,
  bodyWidth: number,
  viewportWidth: number,
): number {
  return clampScrollLeft(scrollLeft + delta, bodyWidth, viewportWidth);
}

/** Scroll offset that centers the playhead, keeping it inside a small margin. */
export function followPlayheadScroll(
  scrollLeft: number,
  viewportWidth: number,
  gutter: number,
  pps: number,
  playhead: number,
  bodyWidth: number,
): number {
  const x = playhead * pps;
  const visible = Math.max(1, viewportWidth - gutter);
  if (x > scrollLeft + visible - 32)
    return clampScrollLeft(x - visible * 0.3, bodyWidth, viewportWidth);
  if (x < scrollLeft) return clampScrollLeft(x - visible * 0.1, bodyWidth, viewportWidth);
  return scrollLeft;
}
