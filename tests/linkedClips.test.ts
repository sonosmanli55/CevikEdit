import { beforeEach, describe, expect, it } from "vitest";
import {
  clone,
  createClip,
  createProject,
  evaluateKeyframes,
  validateProject,
} from "../src/core/model";
import { separateProjectAudio } from "../src/core/audio";
import { useEditorStore } from "../src/editor/store";
import type { MediaAsset, Project } from "../src/core/types";

const VIDEO: MediaAsset = {
  id: "asset-video",
  name: "video.mp4",
  path: "C:\\media\\video.mp4",
  url: "reacut-media://asset?path=video",
  kind: "video",
  duration: 20,
  width: 640,
  height: 360,
  fps: 30,
  hasAudio: true,
};
const AUDIO: MediaAsset = {
  id: "asset-audio",
  name: "audio.m4a",
  path: "C:\\media\\audio.m4a",
  url: "reacut-media://asset?path=audio",
  kind: "audio",
  duration: 20,
  width: 0,
  height: 0,
  fps: 0,
  hasAudio: true,
};

function fixture(): Project {
  const project = createProject("Bağlı klipler");
  project.fps = 30;
  project.assets = [clone(VIDEO), clone(AUDIO)];
  const track = project.tracks.find((item) => item.kind === "video")!;
  const clip = createClip(VIDEO, track.id, 2, 30);
  clip.id = "video";
  clip.duration = 4;
  clip.volume = 0.7;
  project.clips = [clip];
  return validateProject(project);
}

function linked(): Project {
  const project = fixture();
  const result = separateProjectAudio(project, "video", AUDIO);
  return validateProject(result.project);
}

const find = (project: Project, id: string) =>
  project.clips.find((clip) => clip.id === id);

beforeEach(() => useEditorStore.getState().setProject(createProject()));

describe("linked video and separated audio", () => {
  it("marks the source and the extracted track with one shared link id", () => {
    const project = fixture();
    expect(find(project, "video")!.linkId).toBeUndefined();
    const result = separateProjectAudio(project, "video", AUDIO);
    const video = result.project.clips.find((clip) => clip.id === "video")!;
    expect(video.muted).toBe(true);
    expect(video.linkId).toBeTruthy();
    expect(result.clip.linkId).toBe(video.linkId);
    expect(result.project.clips.filter((clip) => clip.linkId === video.linkId)).toHaveLength(2);
    expect(() => validateProject(result.project)).not.toThrow();
  });
  it("moves the linked audio with the video and keeps their offsets", () => {
    const project = linked();
    useEditorStore.getState().setProject(project);
    useEditorStore.getState().moveClips(["video"], 1.5);
    const state = useEditorStore.getState().project;
    expect(find(state, "video")!.start).toBe(3.5);
    const audio = state.clips.find((clip) => clip.id !== "video")!;
    expect(audio.start).toBe(3.5);
    expect(audio.duration).toBe(4);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(project);
  });
  it("trims, splits and deletes both sides of the link", () => {
    const project = linked();
    useEditorStore.getState().setProject(project);
    useEditorStore.getState().trim("video", "end", 5);
    let state = useEditorStore.getState().project;
    expect(find(state, "video")!.duration).toBe(3);
    const audioId = project.clips.find((clip) => clip.id !== "video")!.id;
    expect(find(state, audioId)!.duration).toBe(3);
    useEditorStore.getState().undo();

    useEditorStore.getState().select(["video"]);
    useEditorStore.getState().seek(4);
    useEditorStore.getState().split();
    state = useEditorStore.getState().project;
    expect(state.clips.filter((clip) => clip.trackId === project.tracks.find((t) => t.kind === "video")!.id)).toHaveLength(2);
    const audioParts = state.clips.filter((clip) => clip.assetId === AUDIO.id);
    expect(audioParts).toHaveLength(2);
    expect(audioParts.every((clip) => clip.linkId)).toBe(true);
    expect(state.clips.filter((clip) => clip.trackId === project.tracks.find((t) => t.kind === "video")!.id).map((c) => c.start).sort()).toEqual([2, 4]);
    expect(audioParts.map((c) => c.start).sort()).toEqual([2, 4]);

    useEditorStore.getState().undo();
    useEditorStore.getState().select(["video"]);
    useEditorStore.getState().deleteSelected();
    state = useEditorStore.getState().project;
    expect(state.clips.filter((clip) => clip.assetId === VIDEO.id || clip.assetId === AUDIO.id)).toHaveLength(0);
  });
  it("detaches the link so later edits only touch the selected clip", () => {
    const project = linked();
    useEditorStore.getState().setProject(project);
    useEditorStore.getState().select(["video"]);
    useEditorStore.getState().detachLinks(["video"]);
    let state = useEditorStore.getState().project;
    expect(find(state, "video")!.linkId).toBeUndefined();
    expect(state.clips.find((clip) => clip.id !== "video")!.linkId).toBeUndefined();
    const audioStart = state.clips.find((clip) => clip.id !== "video")!.start;
    useEditorStore.getState().moveClips(["video"], 2);
    state = useEditorStore.getState().project;
    expect(find(state, "video")!.start).toBe(4);
    expect(state.clips.find((clip) => clip.id !== "video")!.start).toBe(audioStart);
    useEditorStore.getState().undo();
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(project);
  });
  it("keeps an existing volume envelope on the separated audio and the clip audio level", () => {
    const project = fixture();
    project.clips[0].keyframes = [
      { id: "g", time: 0, property: "volume", value: 0.4, easing: "linear" },
      { id: "x", time: 1, property: "x", value: 10, easing: "linear" },
    ];
    const result = separateProjectAudio(project, "video", AUDIO);
    const audio = result.project.clips.find((clip) => clip.assetId === AUDIO.id)!;
    expect(audio.volume).toBe(0.7);
    expect(audio.keyframes).toHaveLength(1);
    expect(audio.keyframes[0].property).toBe("volume");
    expect(audio.keyframes[0].value).toBe(0.4);
    expect(evaluateKeyframes(audio, 1).volume).toBeCloseTo(0.4, 10);
    expect(audio.muted).toBe(false);
  });
});
