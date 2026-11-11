import { beforeEach, describe, expect, it } from "vitest";
import { placeClip, type PlacementMode } from "../src/core/placement";
import {
  clone,
  createClip,
  createProject,
  createTrack,
  id,
  validateProject,
} from "../src/core/model";
import { useEditorStore } from "../src/editor/store";
import type { MediaAsset, Project } from "../src/core/types";

const VIDEO: MediaAsset = {
  id: "asset-video",
  name: "klip",
  path: "C:\\media\\video.mp4",
  url: "cevikedit-media://asset?path=video",
  kind: "video",
  duration: 60,
  width: 640,
  height: 360,
  fps: 30,
  hasAudio: true,
};

function fixture(): Project {
  const project = createProject("Yerleştirme");
  project.fps = 30;
  project.assets = [clone(VIDEO)];
  const track = createTrack("video", "Video 1");
  project.tracks.push(track);
  const first = createClip(VIDEO, track.id, 0, 30);
  first.id = "first";
  first.duration = 4;
  const second = createClip(VIDEO, track.id, 6, 30);
  second.id = "second";
  second.duration = 3;
  project.clips = [first, second];
  return validateProject(project);
}

function incoming(project: Project, start: number, duration = 2) {
  const clip = createClip(VIDEO, project.tracks.find((t) => t.name === "Video 1")!.id, start, 30);
  clip.id = "incoming";
  clip.duration = duration;
  return clip;
}

const byId = (project: Project, clipId: string) =>
  project.clips.find((clip) => clip.id === clipId);

beforeEach(() => useEditorStore.getState().setProject(createProject()));

describe("timeline placement modes", () => {
  it("appends at the end of the target track without touching existing clips", () => {
    const project = fixture();
    const result = placeClip(project, incoming(project, 1), "append");
    expect(result.clip.start).toBe(9);
    expect(result.project.clips.find((clip) => clip.id === "first")).toEqual(
      project.clips.find((clip) => clip.id === "first"),
    );
    expect(
      result.project.clips.filter((clip) => clip.trackId === result.clip.trackId),
    ).toHaveLength(3);
  });
  it("inserts at the playhead, pushes later clips and splits a straddling clip", () => {
    const project = fixture();
    const result = placeClip(project, incoming(project, 2), "insert");
    expect(result.clip).toMatchObject({ start: 2, duration: 2 });
    expect(byId(result.project, "first")).toMatchObject({ start: 0, duration: 2 });
    const right = result.project.clips.find(
      (clip) => clip.id !== "first" && clip.id !== "second" && clip.id !== "incoming",
    )!;
    expect(right).toMatchObject({ start: 4, duration: 2, sourceIn: 2 });
    expect(byId(result.project, "second")).toMatchObject({ start: 8, duration: 3 });
    expect(result.project.clips).toHaveLength(4);
  });
  it("inserts without a split when the playhead is in a gap", () => {
    const project = fixture();
    const result = placeClip(project, incoming(project, 4.5), "insert");
    expect(result.clip.start).toBe(4.5);
    expect(byId(result.project, "first")).toMatchObject({ start: 0, duration: 4 });
    expect(byId(result.project, "second")).toMatchObject({ start: 8, duration: 3 });
  });
  it("overwrites the occupied span by trimming the left part", () => {
    const project = fixture();
    const result = placeClip(project, incoming(project, 1, 3), "overwrite");
    expect(result.clip).toMatchObject({ start: 1, duration: 3 });
    expect(byId(result.project, "first")).toMatchObject({ start: 0, duration: 1, sourceIn: 0 });
    expect(byId(result.project, "second")).toMatchObject({ start: 6, duration: 3 });
    expect(result.project.clips).toHaveLength(3);
  });
  it("removes a fully covered clip and keeps unrelated tracks untouched", () => {
    const project = fixture();
    project.tracks.push(createTrack("text", "Başlık"));
    const title = createClip(undefined, project.tracks.at(-1)!.id, 0, 30);
    title.id = "title";
    title.duration = 1;
    title.text!.text = "başlık";
    project.clips.push(title);
    project.tracks.push(createTrack("video", "Video 2"));
    const other = createClip(VIDEO, project.tracks.at(-1)!.id, 0, 30);
    other.id = "other";
    other.duration = 2;
    project.clips.push(other);
    const result = placeClip(project, incoming(project, 0, 4), "overwrite");
    expect(byId(result.project, "first")).toBeUndefined();
    expect(byId(result.project, "title")).toEqual(title);
    expect(byId(result.project, "other")).toEqual(other);
    expect(byId(result.project, "second")).toMatchObject({ start: 6, duration: 3 });
  });
  it("rejects locked tracks, invalid modes and out-of-range clips", () => {
    const project = fixture();
    project.tracks.find((track) => track.name === "Video 1")!.locked = true;
    expect(() => placeClip(project, incoming(project, 1), "insert")).toThrow("锁定");
    const unlocked = fixture();
    expect(() => placeClip(unlocked, incoming(unlocked, 1), "replace" as PlacementMode)).toThrow(
      "入轨模式",
    );
    expect(() => placeClip(unlocked, incoming(unlocked, 86399, 5), "insert")).toThrow("时间线");
    const detached = incoming(unlocked, 1);
    detached.trackId = "missing";
    expect(() => placeClip(unlocked, detached, "append")).toThrow("轨道");
  });
  it("commits each mode as one undo step through the store", () => {
    const project = fixture();
    const trackId = project.tracks.find((track) => track.name === "Video 1")!.id;
    useEditorStore.getState().setProject(project);
    const before = clone(project);
    useEditorStore
      .getState()
      .addAssetClip(VIDEO.id, 2, trackId, { sourceIn: 0, duration: 2 }, "insert");
    expect(useEditorStore.getState().project.clips).toHaveLength(4);
    expect(useEditorStore.getState().past).toHaveLength(1);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(before);
    useEditorStore
      .getState()
      .addAssetClip(VIDEO.id, 1, trackId, { sourceIn: 0, duration: 3 }, "overwrite");
    const applied = useEditorStore.getState().project;
    const placedId = useEditorStore.getState().selectedIds[0];
    expect(applied.clips.find((clip) => clip.id === placedId)).toMatchObject({
      start: 1,
      duration: 3,
    });
    expect(applied.clips.filter((clip) => clip.trackId === trackId)).toHaveLength(3);
  });
  it("keeps clip ids unique and validates the result", () => {
    const project = fixture();
    const result = placeClip(project, { ...incoming(project, 1), id: id() }, "overwrite");
    expect(() => validateProject(result.project)).not.toThrow();
    const ids = result.project.clips.map((clip) => clip.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
