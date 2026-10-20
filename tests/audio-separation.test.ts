import { describe, expect, it } from "vitest";
import { separateProjectAudio } from "../src/core/audio";
import { createClip, createProject, createTrack } from "../src/core/model";
import type { Clip, MediaAsset, Project } from "../src/core/types";

const video: MediaAsset = {
  id: "video",
  name: "klip.mp4",
  kind: "video",
  duration: 10,
  path: "C:/media/klip.mp4",
  url: "",
  fps: 30,
  width: 1920,
  height: 1080,
  hasAudio: true,
};

const audio: MediaAsset = {
  id: "audio",
  name: "klip.mp4",
  kind: "audio",
  duration: 10,
  path: "C:/media/extracted.m4a",
  url: "",
  fps: 0,
  width: 0,
  height: 0,
  hasAudio: true,
  waveform: [0.2, 0.8, 0.4],
};

function fixture(patch: Partial<Clip> = {}) {
  const base = createProject("ses testi"),
    track = base.tracks[0] ?? createTrack("video"),
    clip: Clip = { ...createClip(video, track.id, 0, base.fps), ...patch },
    project: Project = {
      ...base,
      assets: [video],
      tracks: [track],
      clips: [clip],
    };
  return { project, clip };
}

describe("audio separation", () => {
  it("adds an aligned audio clip and mutes the video", () => {
    const { project, clip } = fixture({
      start: 4,
      sourceIn: 2,
      duration: 3,
      volume: 0.6,
      audioFadeIn: 0.4,
      audioFadeOut: 0.2,
    });
    const result = separateProjectAudio(project, clip.id, audio);
    expect(result.project.tracks).toHaveLength(2);
    expect(result.project.tracks[1].kind).toBe("audio");
    expect(result.clip.trackId).toBe(result.project.tracks[1].id);
    expect(result.clip.assetId).toBe(audio.id);
    expect(result.clip.name).toBe(clip.name);
    expect(result.clip.start).toBe(4);
    expect(result.clip.sourceIn).toBe(2);
    expect(result.clip.duration).toBe(3);
    expect(result.clip.volume).toBe(0.6);
    expect(result.clip.audioFadeIn).toBe(0.4);
    expect(result.clip.audioFadeOut).toBe(0.2);
    expect(result.clip.muted).toBe(false);
    expect(
      result.project.clips.find((entry) => entry.id === clip.id)?.muted,
    ).toBe(true);
  });

  it("keeps the speed so the separated sound stays in sync", () => {
    const { project, clip } = fixture({ duration: 2, speed: 2 });
    const { clip: separate } = separateProjectAudio(project, clip.id, audio);
    expect(separate.speed).toBe(2);
    expect(separate.duration).toBe(2);
    expect(
      separate.sourceIn + separate.duration * separate.speed,
    ).toBeLessThanOrEqual(audio.duration + 1e-9);
  });

  it("copies the volume envelope with fresh keyframe ids", () => {
    const { project, clip } = fixture({
      keyframes: [
        { id: "fade", time: 0, property: "volume", value: 0, easing: "linear" },
        {
          id: "opacity",
          time: 0,
          property: "opacity",
          value: 1,
          easing: "linear",
        },
      ],
    });
    const { clip: separate } = separateProjectAudio(project, clip.id, audio);
    expect(separate.keyframes).toHaveLength(1);
    expect(separate.keyframes[0].property).toBe("volume");
    expect(separate.keyframes[0].id).not.toBe("fade");
    expect(separate.keyframes[0].value).toBe(0);
  });

  it("stops at the end of a shorter extracted file", () => {
    const { project, clip } = fixture({ duration: 10 });
    const { clip: separate } = separateProjectAudio(project, clip.id, {
      ...audio,
      duration: 6,
    });
    expect(separate.duration).toBe(6);
  });

  it("rejects unknown clips, non-audio assets and empty ranges", () => {
    const { project, clip } = fixture();
    expect(() => separateProjectAudio(project, "missing", audio)).toThrow();
    expect(() =>
      separateProjectAudio(project, clip.id, { ...audio, kind: "video" }),
    ).toThrow();
    expect(() =>
      separateProjectAudio(project, clip.id, { ...audio, duration: 0 }),
    ).toThrow();
  });
});
