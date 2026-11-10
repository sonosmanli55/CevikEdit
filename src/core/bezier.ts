/**
 * Free cubic-Bézier easing shared by the editor curve, the preview and FFmpeg.
 *
 * A keyframe may carry a curve whose handles are normalized 0–1 in time and
 * allow overshoot in value (CSS `cubic-bezier` semantics). Preview evaluates it
 * directly; export approximates it with a fixed piecewise-linear table so both
 * paths use the same samples.
 */
export interface BezierCurve {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const DEFAULT_BEZIER: BezierCurve = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
/** Export uses this many linear slices; 24 keeps the error under ~0.2%. */
export const BEZIER_EXPORT_SEGMENTS = 24;

export function validateBezier(value: unknown): BezierCurve {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Bézier eğrisi geçersiz");
  const raw = value as Record<string, unknown>;
  const read = (key: keyof BezierCurve, min: number, max: number): number => {
    const item = raw[key];
    if (typeof item !== "number" || !Number.isFinite(item) || item < min || item > max)
      throw new Error("Bézier eğrisi geçersiz");
    return item;
  };
  return {
    x1: read("x1", 0, 1),
    y1: read("y1", -1, 2),
    x2: read("x2", 0, 1),
    y2: read("y2", -1, 2),
  };
}

const bezierAxis = (t: number, p1: number, p2: number) => {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
};

const bezierAxisSlope = (t: number, p1: number, p2: number) => {
  const u = 1 - t;
  return (
    3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2)
  );
};

/**
 * Solve `x(t) = ratio` and return `y(t)`. Newton converges quickly except near
 * flat handles; the bisection fallback guarantees a bounded result.
 */
export function bezierProgress(curve: BezierCurve, ratio: number): number {
  const target = Math.max(0, Math.min(1, ratio));
  if (target <= 0) return 0;
  if (target >= 1) return 1;
  const { x1, y1, x2, y2 } = curve;
  let t = target;
  for (let index = 0; index < 8; index += 1) {
    const x = bezierAxis(t, x1, x2) - target;
    if (Math.abs(x) < 1e-7) break;
    const slope = bezierAxisSlope(t, x1, x2);
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-6) break;
    t -= x / slope;
    if (t < 0 || t > 1) break;
  }
  if (t < 0 || t > 1) {
    let low = 0,
      high = 1;
    for (let index = 0; index < 40; index += 1) {
      t = (low + high) / 2;
      if (bezierAxis(t, x1, x2) < target) low = t;
      else high = t;
    }
  }
  return Math.max(-1, Math.min(2, bezierAxis(t, y1, y2)));
}

/** Normalized [x, y] table used by the export expression. */
export function bezierTable(
  curve: BezierCurve,
  segments = BEZIER_EXPORT_SEGMENTS,
): Array<{ x: number; y: number }> {
  const count = Math.max(2, Math.min(200, Math.round(segments)));
  const table: Array<{ x: number; y: number }> = [];
  for (let index = 1; index < count; index += 1) {
    const x = index / count;
    table.push({ x, y: bezierProgress(curve, x) });
  }
  return table;
}

/** SVG path for the normalized curve inside the keyframe graph. */
export function bezierPath(curve: BezierCurve, width: number, height: number): string {
  return `M0,${height} C${curve.x1 * width},${height - curve.y1 * height} ${curve.x2 * width},${height - curve.y2 * height} ${width},0`;
}
