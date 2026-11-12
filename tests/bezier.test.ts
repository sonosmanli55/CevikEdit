import { describe, expect, it } from "vitest";
import {
  BEZIER_EXPORT_SEGMENTS,
  bezierProgress,
  bezierTable,
  validateBezier,
} from "../src/core/bezier";
import {
  clone,
  createClip,
  createProject,
  createTrack,
  evaluateKeyframes,
  keyframeRatio,
  validateProject,
} from "../src/core/model";
import { keyframeExpression } from "../electron/export";
import type { Clip, Keyframe } from "../src/core/types";

const EASE = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
const OVERSHOOT = { x1: 0.6, y1: -0.35, x2: 0.4, y2: 1.35 };

function fixture(keyframe: Partial<Keyframe>): Clip {
  const project = createProject("Bézier");
  project.fps = 30;
  const track = createTrack("text", "Metin");
  project.tracks.push(track);
  const clip = createClip(undefined, track.id, 0, 30);
  clip.duration = 4;
  clip.keyframes = [
    { id: "a", time: 0, property: "x", value: 0, easing: "linear", ...keyframe },
    {
      id: "b",
      time: 4,
      property: "x",
      value: 100,
      easing: "linear",
      bezier: EASE,
    },
  ];
  project.clips.push(clip);
  return clip;
}

/** Evaluate the FFmpeg expression by parsing it into a small interpreter. */
function evalExpression(expression: string, t: number): number {
  // The generated expression only uses if/lt and arithmetic; evaluate it with a
  // minimal shim so the export path is tested without spawning FFmpeg.
  const shim = new Function(
    "t",
    `const lt=(a,b)=>a<b?1:0; const if_=(c,a,b)=>c?a:b;
     return ${expression.replace(/\bif\(/g, "if_(")};`,
  ) as (value: number) => number;
  return shim(t);
}

describe("free cubic-Bézier easing", () => {
  it("matches CSS semantics at the endpoints and stays monotonic in time", () => {
    for (const curve of [EASE, OVERSHOOT, { x1: 0, y1: 0, x2: 1, y2: 1 }]) {
      expect(bezierProgress(curve, 0)).toBeCloseTo(0, 9);
      expect(bezierProgress(curve, 1)).toBeCloseTo(1, 9);
      let previous = -Infinity;
      for (let step = 0; step <= 100; step += 1) {
        const value = bezierProgress(curve, step / 100);
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(2);
        previous = value;
      }
      expect(previous).toBeCloseTo(1, 6);
    }
  });
  it("approximates a linear curve and produces real overshoot", () => {
    const linear = { x1: 0.33, y1: 0.33, x2: 0.67, y2: 0.67 };
    for (const ratio of [0.1, 0.25, 0.5, 0.75, 0.9])
      expect(bezierProgress(linear, ratio)).toBeCloseTo(ratio, 3);
    const values = Array.from({ length: 21 }, (_, index) =>
      bezierProgress(OVERSHOOT, index / 20),
    );
    expect(Math.min(...values)).toBeLessThan(-0.02);
    expect(Math.max(...values)).toBeGreaterThan(1.02);
  });
  it("rejects out-of-range handles but accepts overshoot in Y", () => {
    expect(validateBezier(EASE)).toEqual(EASE);
    expect(validateBezier(OVERSHOOT)).toEqual(OVERSHOOT);
    for (const bad of [
      null,
      {},
      { x1: -0.1, y1: 0, x2: 0.5, y2: 1 },
      { x1: 0, y1: 0, x2: 1.2, y2: 1 },
      { x1: 0, y1: -2, x2: 1, y2: 1 },
      { x1: 0, y1: 0, x2: 1, y2: Number.NaN },
    ])
      expect(() => validateBezier(bad)).toThrow("Bézier");
  });
  it("drives keyframe evaluation and wins over the named preset", () => {
    const clip = fixture({ bezier: undefined });
    const withBezier = evaluateKeyframes(clip, 1).transform.x;
    const noBezier = evaluateKeyframes(
      { ...clip, keyframes: clip.keyframes.map((key) => ({ ...key, bezier: undefined })) },
      1,
    ).transform.x;
    // The Bézier curve is applied to the second key and must change the value.
    expect(withBezier).not.toBeCloseTo(noBezier, 3);
    const key = clip.keyframes[1];
    expect(keyframeRatio(key, 0.5)).toBeCloseTo(
      bezierProgress(key.bezier!, 0.5),
      9,
    );
    // A preset still works when no curve is present.
    expect(
      keyframeRatio({ easing: "easeIn" }, 0.5),
    ).toBeCloseTo(
      keyframeRatio({ easing: "easeIn" }, 0.5),
      9,
    );
  });
  it("round-trips through project validation and rejects malformed curves", () => {
    const clip = fixture({});
    const project = createProject("Doğrulama");
    project.fps = 30;
    const track = createTrack("text", "Metin");
    project.tracks.push(track);
    project.clips.push({ ...clone(clip), trackId: track.id });
    expect(() => validateProject(project)).not.toThrow();
    const broken = clone(project);
    broken.clips[0].keyframes[1].bezier = { x1: 0.9, y1: 0, x2: 0.2, y2: 1 };
    expect(() => validateProject(broken)).toThrow("Bézier");
    const outOfRange = clone(project);
    outOfRange.clips[0].keyframes[1].bezier = { x1: 0, y1: 0, x2: 1, y2: 5 };
    expect(() => validateProject(outOfRange)).toThrow("Bézier");
  });
  it("export expression follows the same curve within the table tolerance", () => {
    const clip = fixture({});
    const expression = keyframeExpression(clip, "x", 0);
    let maximum = 0;
    for (let step = 0; step <= 80; step += 1) {
      const time = (4 * step) / 80;
      const expected = evaluateKeyframes(clip, time).transform.x;
      const actual = evalExpression(expression, time);
      maximum = Math.max(maximum, Math.abs(expected - actual));
    }
    // Piecewise-linear export approximation: 24 segments keeps error < 1 value
    // unit out of 0–100, i.e. under 1% of the animated range.
    expect(maximum).toBeLessThan(1);
    expect(bezierTable(EASE)).toHaveLength(BEZIER_EXPORT_SEGMENTS - 1);
  });
  it("keeps a preset-only animation identical to the previous output", () => {
    const clip = fixture({});
    clip.keyframes = clip.keyframes.map((key) => ({ ...key, bezier: undefined }));
    const expression = keyframeExpression(clip, "x", 0);
    for (const time of [0, 1, 2, 3, 4])
      expect(evalExpression(expression, time)).toBeCloseTo(
        evaluateKeyframes(clip, time).transform.x,
        6,
      );
  });
});
