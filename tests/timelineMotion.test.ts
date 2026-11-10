import { describe, expect, it } from "vitest";
import {
  INERTIA_MAX_VELOCITY,
  INERTIA_STOP,
  inertiaStep,
  minimapGeometry,
  minimapScrollLeft,
  pointerVelocity,
} from "../src/core/timelineMotion";

describe("timeline inertia and minimap", () => {
  it("decelerates to a stop and never accelerates", () => {
    let velocity = 2400;
    let total = 0;
    let previous = Math.abs(velocity);
    for (let frame = 0; frame < 400; frame += 1) {
      const step = inertiaStep(velocity, 1000 / 60);
      expect(Math.abs(step.velocity)).toBeLessThanOrEqual(previous + 1e-9);
      previous = Math.abs(step.velocity);
      total += step.offset;
      velocity = step.velocity;
      if (step.done) break;
    }
    expect(Math.abs(velocity)).toBeLessThan(INERTIA_STOP);
    expect(total).toBeGreaterThan(100);
    // A 2400 px/s flick glides at most v/(60*(1-f)) ≈ 500 px.
    expect(total).toBeLessThan(600);
  });
  it("is frame-rate independent for the same elapsed time", () => {
    // Two 60 Hz frames and one 120 Hz frame must travel the same distance.
    const a = inertiaStep(1200, 1000 / 60);
    const b = inertiaStep(a.velocity, 1000 / 60);
    const one = inertiaStep(1200, 1000 / 30);
    expect(a.offset + b.offset).toBeCloseTo(one.offset, 6);
  });
  it("caps extreme velocity, ignores bad deltas and stops small flicks", () => {
    const capped = inertiaStep(999_999, 1000 / 60);
    expect(capped.offset).toBeLessThanOrEqual(
      (INERTIA_MAX_VELOCITY / 60) / (1 - 0.92) + 1e-6,
    );
    expect(inertiaStep(500, Number.NaN)).toEqual({
      offset: 0,
      velocity: 500,
      done: false,
    });
    expect(inertiaStep(500, 0).offset).toBe(0);
    expect(inertiaStep(2, 1000 / 60).done).toBe(true);
    // Negative velocity glides the other way.
    expect(inertiaStep(-600, 1000 / 60).offset).toBeLessThan(0);
  });
  it("estimates pointer velocity in px/s and survives a zero interval", () => {
    expect(
      pointerVelocity({ x: 100, time: 1000 }, { x: 160, time: 1016 }),
    ).toBeCloseTo(3750, 6);
    expect(pointerVelocity({ x: 100, time: 5 }, { x: 100, time: 5 })).toBe(0);
  });
  it("normalizes the minimap window, playhead and clip bars", () => {
    const map = minimapGeometry({
      duration: 100,
      pps: 50,
      scrollLeft: 1000,
      viewportWidth: 658,
      gutter: 158,
      playhead: 30,
      clips: [
        { start: 0, duration: 10, track: 0 },
        { start: 50, duration: 25, track: 1 },
      ],
    });
    // Visible span is 10 s of 100 s starting at 20 s.
    expect(map.left).toBeCloseTo(0.2, 9);
    expect(map.width).toBeCloseTo(0.1, 9);
    expect(map.playhead).toBeCloseTo(0.3, 9);
    expect(map.bars[0]).toMatchObject({ start: 0, track: 0 });
    expect(map.bars[0].width).toBeCloseTo(0.1, 9);
    expect(map.bars[1].start).toBeCloseTo(0.5, 9);
    expect(map.bars[1].width).toBeCloseTo(0.25, 9);
  });
  it("handles an empty, short or invalid timeline without NaNs", () => {
    const map = minimapGeometry({
      duration: 0,
      pps: 0,
      scrollLeft: -50,
      viewportWidth: 300,
      gutter: 158,
      playhead: -1,
      clips: [{ start: Number.NaN, duration: 0, track: 0 }],
    });
    for (const value of [map.left, map.width, map.playhead])
      expect(Number.isFinite(value)).toBe(true);
    expect(map.bars).toEqual([]);
    expect(map.width).toBeGreaterThan(0);
  });
  it("centers the clicked minimap position and clamps at both ends", () => {
    expect(minimapScrollLeft(0.5, 100, 50, 658, 158)).toBeCloseTo(2500 - 250, 6);
    expect(minimapScrollLeft(0, 100, 50, 658, 158)).toBe(0);
    expect(minimapScrollLeft(1, 100, 50, 658, 158)).toBeCloseTo(4500, 6);
    expect(minimapScrollLeft(-1, 100, 50, 658, 158)).toBe(0);
    expect(minimapScrollLeft(5, 100, 50, 658, 158)).toBeCloseTo(4500, 6);
  });
});
