import { describe, expect, it } from "vitest";
import {
  MAX_PPS,
  MIN_PPS,
  clampPps,
  clampScrollLeft,
  fitTimelinePps,
  followPlayheadScroll,
  maxScrollLeft,
  panScrollLeft,
  visibleRange,
  wheelZoomPps,
  zoomedScrollLeft,
} from "../src/core/timelineView";

describe("timeline viewport zoom and pan", () => {
  it("clamps the scale to the supported range and rejects non-finite input", () => {
    expect(clampPps(0)).toBe(MIN_PPS);
    expect(clampPps(-50)).toBe(MIN_PPS);
    expect(clampPps(99999)).toBe(MAX_PPS);
    expect(clampPps(Number.NaN)).toBe(MIN_PPS);
    expect(clampPps(60)).toBe(60);
    expect(MIN_PPS).toBeLessThan(MAX_PPS);
  });
  it("zooms in and out by reciprocal wheel steps and clamps at the limits", () => {
    const zoomed = wheelZoomPps(60, -100);
    expect(zoomed).toBeCloseTo(69, 6);
    expect(wheelZoomPps(zoomed, 100)).toBeCloseTo(60, 6);
    expect(wheelZoomPps(60, 0)).toBe(60);
    expect(wheelZoomPps(Number.NaN, -100)).toBe(MIN_PPS);
    expect(wheelZoomPps(MAX_PPS, -100)).toBe(MAX_PPS);
    expect(wheelZoomPps(MIN_PPS, 100)).toBe(MIN_PPS);
    expect(wheelZoomPps(60, -100, 20)).toBeCloseTo(120, 6);
    // The step is clamped to 1.01 so one notch always changes the scale.
    expect(wheelZoomPps(60, -100, 0.1)).toBeCloseTo(60.6, 6);
  });
  it("keeps the time under the cursor fixed while zooming", () => {
    const gutter = 158;
    const pps = 50;
    const scrollLeft = 300;
    const cursorX = 500;
    const time = (scrollLeft + cursorX - gutter) / pps;
    const nextPps = 100;
    const nextScroll = zoomedScrollLeft({ pps, nextPps, scrollLeft, cursorX, gutter });
    expect((nextScroll + cursorX - gutter) / nextPps).toBeCloseTo(time, 9);
    expect(nextScroll).toBeCloseTo(time * nextPps - cursorX + gutter, 9);
  });
  it("clamps the anchored scroll to zero and handles the gutter area", () => {
    const next = zoomedScrollLeft({
      pps: 80,
      nextPps: 40,
      scrollLeft: 0,
      cursorX: 100,
      gutter: 158,
    });
    expect(next).toBe(0);
    expect(
      zoomedScrollLeft({
        pps: 0,
        nextPps: 60,
        scrollLeft: 120,
        cursorX: 400,
        gutter: 158,
      }),
    ).toBe(120);
  });
  it("reports the visible range and stops at the start of the timeline", () => {
    expect(visibleRange(0, 800, 158, 40)).toEqual({
      start: 0,
      end: (800 - 158) / 40,
      span: (800 - 158) / 40,
    });
    const shifted = visibleRange(400, 800, 158, 40);
    expect(shifted.start).toBeCloseTo(10, 9);
    expect(shifted.span).toBeCloseTo((800 - 158) / 40, 9);
    expect(visibleRange(0, 100, 158, 40)).toEqual({ start: 0, end: 0, span: 0 });
    expect(visibleRange(0, 800, 158, 0)).toEqual({ start: 0, end: 0, span: 0 });
  });
  it("computes a fitting scale with a margin and a safe fallback", () => {
    expect(fitTimelinePps(1000, 158, 30)).toBeCloseTo((1000 - 158 - 24) / 30, 9);
    expect(fitTimelinePps(1000, 158, 0)).toBe(60);
    expect(fitTimelinePps(1000, 158, Number.NaN)).toBe(60);
    expect(fitTimelinePps(1000, 158, 0.5)).toBe(MAX_PPS);
  });
  it("clamps panning to the content bounds", () => {
    expect(maxScrollLeft(2000, 800)).toBe(1200);
    expect(maxScrollLeft(500, 800)).toBe(0);
    expect(clampScrollLeft(-20, 2000, 800)).toBe(0);
    expect(clampScrollLeft(9999, 2000, 800)).toBe(1200);
    expect(clampScrollLeft(Number.NaN, 2000, 800)).toBe(0);
    expect(panScrollLeft(600, 200, 2000, 800)).toBe(800);
    expect(panScrollLeft(10, -500, 2000, 800)).toBe(0);
    expect(panScrollLeft(1190, 500, 2000, 800)).toBe(1200);
  });
  it("follows the playhead only when it leaves the comfortable viewport", () => {
    expect(followPlayheadScroll(100, 1000, 158, 50, 4, 5000)).toBe(100);
    const forward = followPlayheadScroll(0, 1000, 158, 50, 17, 5000);
    expect(forward).toBeCloseTo(17 * 50 - (1000 - 158) * 0.3, 9);
    expect(followPlayheadScroll(500, 1000, 158, 50, 2, 5000)).toBeCloseTo(
      Math.max(0, 100 - (1000 - 158) * 0.1),
      9,
    );
    expect(followPlayheadScroll(0, 1000, 158, 50, 200, 1000)).toBe(0);
  });
});
