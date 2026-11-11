import { describe, expect, it } from "vitest";
import {
  EXPORT_MEMORY_BUDGET,
  PROJECT_LIMITS,
  estimateExportBytes,
  exportMemoryProblem,
  performanceNotes,
  projectMetrics,
  visibleClips,
} from "../src/core/limits";
import { createClip, createProject, createTrack, validateProject } from "../src/core/model";
import type { MediaAsset, Project } from "../src/core/types";

const VIDEO: MediaAsset = {
  id: "asset-video",
  name: "klip.mp4",
  path: "C:\\media\\klip.mp4",
  url: "cevikedit-media://asset?path=x",
  kind: "video",
  duration: 60,
  width: 640,
  height: 360,
  fps: 30,
  hasAudio: true,
};

function bigProject(clips: number, options: { text?: number; keyframes?: number } = {}) {
  const project = createProject("Büyük proje");
  project.fps = 30;
  project.assets = [{ ...VIDEO }];
  const videoTrack = project.tracks.find((track) => track.kind === "video")!;
  const remaining = options.text ?? 0;
  if (remaining > 0) {
    project.tracks.unshift(createTrack("text", "Altyazı"));
  }
  const textTrack = project.tracks.find((track) => track.kind === "text")!;
  project.clips = Array.from({ length: clips }, (_, index) => {
    const isText = index < remaining;
    const clip = createClip(
      isText ? undefined : project.assets[0],
      isText ? textTrack.id : videoTrack.id,
      index * 2,
      30,
    );
    clip.duration = 2;
    if (isText) clip.text!.text = `altyazı ${index}`;
    if (options.keyframes)
      clip.keyframes = Array.from({ length: options.keyframes }, (_, key) => ({
        id: `k-${index}-${key}`,
        time: 0,
        property: "opacity" as const,
        value: 1,
        easing: "linear" as const,
      }));
    return clip;
  });
  return validateProject(project);
}

describe("large-project guardrails", () => {
  it("reports clip, track, text, keyframe and duration metrics", () => {
    const project = bigProject(6, { text: 2, keyframes: 3 });
    const metrics = projectMetrics(project);
    expect(metrics.clips).toBe(6);
    expect(metrics.textClips).toBe(2);
    expect(metrics.keyframes).toBe(18);
    expect(metrics.tracks).toBeGreaterThanOrEqual(3);
    expect(metrics.duration).toBeCloseTo(12, 6);
    expect(metrics.framePixels).toBe(project.width * project.height);
    expect(metrics.frameBytes).toBe(metrics.framePixels * 4);
    expect(metrics.reverseSeconds).toBeGreaterThan(0);
  });
  it("raises no warnings for a normal project but explains a 4K canvas", () => {
    expect(performanceNotes(bigProject(4))).toEqual([]);
    const notes = performanceNotes(bigProject(4), {
      width: 3840,
      height: 2160,
      fps: 30,
    });
    expect(notes.map((note) => note.id)).toContain("4k");
    expect(notes[0].level).toBe("info");
  });
  it("warns above each soft limit with an actionable Turkish message", () => {
    const heavy = bigProject(PROJECT_LIMITS.clips + 10, {
      text: PROJECT_LIMITS.textClips + 5,
      keyframes: 10,
    });
    const ids = performanceNotes(heavy).map((note) => note.id);
    expect(ids).toEqual(expect.arrayContaining(["clips", "text", "keyframes"]));
    for (const note of performanceNotes(heavy))
      expect(note.message.length).toBeGreaterThan(20);
    const long = bigProject(2);
    long.clips[0].duration = 2;
    long.clips[1].start = PROJECT_LIMITS.durationSeconds + 1;
    long.clips[1].duration = 1;
    expect(performanceNotes(validateProject(long)).map((note) => note.id)).toContain(
      "duration",
    );
  });
  it("estimates export memory from canvas and layers and refuses over budget", () => {
    expect(estimateExportBytes({ width: 1920, height: 1080 }, 3)).toBe(
      1920 * 1080 * 4 * 5,
    );
    expect(exportMemoryProblem({ width: 1920, height: 1080 }, 3)).toBeNull();
    // 8K with 24 layers is far beyond the budget.
    const problem = exportMemoryProblem({ width: 7680, height: 4320 }, 24);
    expect(problem).toContain("GB");
    expect(problem).toContain("çözünürlük");
    const fourK = estimateExportBytes({ width: 3840, height: 2160 }, 12);
    expect(fourK).toBeLessThan(EXPORT_MEMORY_BUDGET);
  });
  it("keeps only clips intersecting the viewport plus the margin", () => {
    const clips = Array.from({ length: 10 }, (_, index) => ({
      start: index * 10,
      duration: 4,
      id: `c${index}`,
    }));
    const visible = visibleClips(clips, { start: 20, end: 40 });
    expect(visible.map((clip) => clip.id)).toEqual(["c2", "c3", "c4"]);
    const wide = visibleClips(clips, { start: 20, end: 40 }, 10);
    expect(wide.map((clip) => clip.id)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(visibleClips(clips, { start: 40, end: 20 })).toEqual(visible);
    expect(visibleClips([], { start: 0, end: 1 })).toEqual([]);
    // A clip that starts before the window but still covers it is kept.
    expect(
      visibleClips([{ start: 0, duration: 100, id: "long" }], { start: 50, end: 60 }),
    ).toHaveLength(1);
  });
  it("stays fast when the project has thousands of clips", () => {
    const project: Project = bigProject(2000);
    const started = performance.now();
    const metrics = projectMetrics(project);
    const visible = visibleClips(project.clips, { start: 100, end: 140 });
    const elapsed = performance.now() - started;
    expect(metrics.clips).toBe(2000);
    expect(visible.length).toBeLessThan(30);
    // Pure array work; a generous ceiling keeps the check machine independent.
    expect(elapsed).toBeLessThan(150);
  });
});
