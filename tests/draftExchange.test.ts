import { describe, expect, it } from "vitest";
import {
  DRAFT_EXCHANGE_FORMAT,
  exportDraft,
  serializeDraft,
  validateExchangeDraft,
} from "../src/core/draftExchange";
import { importCapcutDraft } from "../src/core/capcutImport";
import { createClip, createProject, createTrack, validateProject } from "../src/core/model";
import type { MediaAsset, Project } from "../src/core/types";

const VIDEO: MediaAsset = {
  id: "asset-video",
  name: "çekim.mp4",
  path: "C:\\media\\çekim.mp4",
  url: "reacut-media://asset?path=v",
  kind: "video",
  duration: 20,
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true,
};
const AUDIO: MediaAsset = {
  ...VIDEO,
  id: "asset-audio",
  name: "müzik.wav",
  path: "C:\\media\\müzik.wav",
  kind: "audio",
  duration: 20,
  width: 0,
  height: 0,
  fps: 0,
};
const IMAGE: MediaAsset = {
  ...VIDEO,
  id: "asset-image",
  name: "kapak.png",
  path: "C:\\media\\kapak.png",
  kind: "image",
  duration: 0,
  width: 800,
  height: 600,
  fps: 0,
  hasAudio: false,
};

function fixture(): Project {
  const project = createProject("Taslak turu");
  project.fps = 30;
  project.width = 1920;
  project.height = 1080;
  project.assets = [{ ...VIDEO }, { ...AUDIO }, { ...IMAGE }];
  const videoTrack = project.tracks.find((track) => track.kind === "video")!;
  const audioTrack = project.tracks.find((track) => track.kind === "audio")!;
  const textTrack = project.tracks.find((track) => track.kind === "text")!;
  const visual = createClip(project.assets[0], videoTrack.id, 1, 30);
  visual.id = "visual";
  visual.name = "çekim";
  visual.duration = 4;
  visual.speed = 1.5;
  visual.sourceIn = 2;
  const overlay = createClip(project.assets[2], videoTrack.id, 6, 30);
  overlay.id = "overlay";
  overlay.name = "kapak";
  overlay.duration = 2;
  const music = createClip(project.assets[1], audioTrack.id, 0, 30);
  music.id = "music";
  music.duration = 8;
  music.volume = 0.6;
  const title = createClip(undefined, textTrack.id, 1, 30);
  title.id = "title";
  title.duration = 3;
  title.text!.text = "Başlık metni";
  project.clips = [visual, overlay, music, title];
  return validateProject(project);
}

describe("draft exchange export", () => {
  it("produces a documented document with materials, tracks and segments", () => {
    const project = fixture();
    const draft = exportDraft(project);
    expect(draft.format).toBe(DRAFT_EXCHANGE_FORMAT);
    expect(draft.generator).toBe("ReaCut");
    expect(draft.canvas_config).toMatchObject({ width: 1920, height: 1080, ratio: "16:9" });
    expect(draft.materials.videos).toHaveLength(2);
    expect(draft.materials.audios).toHaveLength(1);
    expect(draft.materials.texts).toHaveLength(1);
    expect(draft.materials.texts[0].content).toBe("Başlık metni");
    expect(draft.duration).toBe(8_000_000);
    // Video + audio + text tracks; the image track kind is not duplicated.
    expect(draft.tracks.map((track) => track.type)).toEqual(
      expect.arrayContaining(["video", "audio", "text"]),
    );
    const videoTrack = draft.tracks.find((track) => track.type === "video")!;
    const segments = videoTrack.segments as Array<Record<string, unknown>>;
    expect(segments).toHaveLength(2);
    expect(segments[0].target_timerange).toEqual({ start: 1_000_000, duration: 4_000_000 });
    expect(segments[0].source_timerange).toEqual({ start: 2_000_000, duration: 6_000_000 });
    expect(segments[0].speed).toBe(1.5);
    expect(draft.project.clips).toHaveLength(project.clips.length);
  });
  it("round-trips back through the importer with timings, speed and text intact", () => {
    const project = fixture();
    const draft = exportDraft(project);
    const imported = importCapcutDraft(draft, { name: "Geri alınan" });
    const byId = new Map(imported.project.clips.map((clip) => [clip.name, clip]));
    const visual = imported.project.clips.find((clip) => clip.duration === 4)!;
    expect(visual.start).toBeCloseTo(1, 6);
    expect(visual.sourceIn).toBeCloseTo(2, 6);
    expect(visual.speed).toBeCloseTo(1.5, 6);
    const title = imported.project.clips.find((clip) => clip.text?.text === "Başlık metni");
    expect(title).toBeTruthy();
    expect(title!.start).toBeCloseTo(1, 6);
    expect(title!.duration).toBeCloseTo(3, 6);
    const music = imported.project.clips.find((clip) => clip.volume === 0.6);
    expect(music?.start).toBeCloseTo(0, 6);
    expect(imported.project.assets.map((asset) => asset.kind).sort()).toEqual(
      ["audio", "image", "video"],
    );
    expect(imported.project.width).toBe(1920);
    expect(imported.project.fps).toBe(30);
    expect(byId.size).toBeGreaterThanOrEqual(3);
    validateProject(imported.project);
  });
  it("keeps the exact project in the side channel for lossless re-import", () => {
    const project = fixture();
    const draft = exportDraft(project);
    expect(draft.project.clips.map((clip) => clip.id)).toEqual(
      project.clips.map((clip) => clip.id),
    );
    expect(draft.project.clips.find((clip) => clip.id === "visual")!.keyframes).toEqual([]);
    // Editing the exported copy must not touch the source project.
    draft.project.clips[0].duration = 1;
    expect(project.clips[0].duration).toBe(4);
  });
  it("validates the document and rejects malformed shapes", () => {
    const draft = exportDraft(fixture());
    expect(() => validateExchangeDraft(draft)).not.toThrow();
    expect(() => validateExchangeDraft(JSON.parse(serializeDraft(draft)))).not.toThrow();
    expect(() => validateExchangeDraft(null)).toThrow("geçersiz");
    expect(() => validateExchangeDraft({ format: "x" })).toThrow("tanınmadı");
    expect(() =>
      validateExchangeDraft({ ...draft, version: 99 }),
    ).toThrow("sürümü");
    expect(() =>
      validateExchangeDraft({
        ...draft,
        canvas_config: { width: 0, height: 0, ratio: "" },
      }),
    ).toThrow("tuval");
    expect(() =>
      validateExchangeDraft({ ...draft, tracks: [{ id: "t" }] }),
    ).toThrow("segmentleri");
  });
  it("uses the requested name and keeps unsupported clip kinds out", () => {
    const project = fixture();
    project.tracks.push(createTrack("image", "Görseller"));
    const draft = exportDraft(project, { name: "  Özel ad  " });
    expect(draft.name).toBe("Özel ad");
    expect(draft.tracks.some((track) => track.type === "image")).toBe(false);
  });
});
