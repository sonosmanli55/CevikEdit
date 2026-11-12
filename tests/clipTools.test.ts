import { describe, expect, it } from "vitest";
import {
  addFreezeFrameClip,
  reverseProjectClip,
} from "../src/core/clipTools";
import { evaluateKeyframes, createClip, createProject } from "../src/core/model";
import type { Clip, MediaAsset, Project } from "../src/core/types";

const video: MediaAsset = {
  id: "video",
  name: "kaynak.mp4",
  kind: "video",
  duration: 10,
  path: "C:/media/kaynak.mp4",
  url: "",
  fps: 30,
  width: 1920,
  height: 1080,
  hasAudio: true,
};

const reversed: MediaAsset = {
  id: "reversed",
  name: "kaynak · Ters",
  kind: "video",
  duration: 4,
  path: "C:/media/reversed.mp4",
  url: "",
  fps: 30,
  width: 1920,
  height: 1080,
  hasAudio: true,
};

const still: MediaAsset = {
  id: "still",
  name: "kaynak · Donmuş kare",
  kind: "image",
  duration: 0,
  path: "C:/media/freeze.png",
  url: "",
  fps: 0,
  width: 1920,
  height: 1080,
  hasAudio: false,
};

function fixture(patch: Partial<Clip> = {}): {
  project: Project;
  clip: Clip;
} {
  const base = createProject("araç testi"),
    track = base.tracks.find((entry) => entry.kind === "video")!,
    clip: Clip = {
      ...createClip(video, track.id, 1, base.fps),
      sourceIn: 3,
      duration: 2,
      speed: 2,
      ...patch,
    },
    project: Project = { ...base, assets: [video], clips: [clip] };
  return { project, clip };
}

describe("reverseProjectClip", () => {
  it("swaps the asset, resets sourceIn and preserves timing and speed", () => {
    const { project, clip } = fixture();
    const result = reverseProjectClip(project, clip.id, reversed);
    const updated = result.project.clips[0];

    expect(updated.assetId).toBe(reversed.id);
    expect(updated.sourceIn).toBe(0);
    expect(updated.start).toBe(clip.start);
    expect(updated.duration).toBe(clip.duration);
    expect(updated.speed).toBe(clip.speed);
    expect(result.project.assets.map((asset) => asset.id)).toEqual([
      "video",
      "reversed",
    ]);
    // The original source asset and clip remain available for undo/relinking.
    expect(result.project.assets[0]).toBe(video);
    expect(project.clips[0].assetId).toBe("video");
  });

  it("reuses an already imported cache asset by path", () => {
    const { project, clip } = fixture(),
      cached = { ...reversed, id: "cached", name: "cached.mp4" };
    const withCache = { ...project, assets: [...project.assets, cached] };
    const result = reverseProjectClip(withCache, clip.id, {
      ...reversed,
      id: "new-id",
    });
    expect(result.clip.assetId).toBe("cached");
    expect(
      result.project.assets.filter((asset) => asset.path === reversed.path),
    ).toHaveLength(1);
  });

  it("rejects locked tracks, non-video results and short renders", () => {
    const { project, clip } = fixture();
    expect(() =>
      reverseProjectClip(
        {
          ...project,
          tracks: project.tracks.map((track) =>
            track.id === clip.trackId ? { ...track, locked: true } : track,
          ),
        },
        clip.id,
        reversed,
      ),
    ).toThrow("Kanal kilitli; ters oynatılamıyor");
    expect(() =>
      reverseProjectClip(project, clip.id, { ...reversed, kind: "audio" }),
    ).toThrow("Ters oynatma sonucu video değil");
    expect(() =>
      reverseProjectClip(project, clip.id, { ...reversed, duration: 2 }),
    ).toThrow("Ters oynatma sonucu çok kısa; tekrar deneyin");
    expect(() =>
      reverseProjectClip(project, clip.id, { ...reversed, hasAudio: false }),
    ).toThrow("Ters oynatma sonucunda özgün ses yok; tekrar deneyin");
  });

  it("rejects clips outside the original source range", () => {
    const { project, clip } = fixture({ sourceIn: 9, duration: 2, speed: 2 });
    expect(() => reverseProjectClip(project, clip.id, reversed)).toThrow(
      "Klip özgün video aralığının dışında",
    );
  });
});

describe("addFreezeFrameClip", () => {
  function freezeFixture() {
    const { project, clip } = fixture({
      start: 1,
      duration: 4,
      speed: 2,
      sourceIn: 0,
      transform: {
        ...createClip(video, "track", 0, 30).transform,
        x: 40,
        y: -20,
        scale: 1.4,
        rotation: 12,
        opacity: 0.75,
      },
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      chromaKey: {
        enabled: true,
        color: "#00ff00",
        similarity: 0.2,
        blend: 0.1,
      },
      keyframes: [
        {
          id: "kf",
          time: 0,
          property: "x",
          value: 0,
          easing: "linear",
        },
      ],
    });
    return { project, clip };
  }

  it("creates an image overlay above video while keeping text on top", () => {
    const { project, clip } = freezeFixture();
    const result = addFreezeFrameClip(project, clip.id, still, 2.5, 1.5);
    const freeze = result.clip,
      track = result.project.tracks.find((entry) => entry.id === freeze.trackId)!,
      evaluated = evaluateKeyframes(clip, 1.5);

    expect(result.project.tracks.map((entry) => entry.kind)).toEqual([
      "text",
      "video",
      "video",
      "audio",
    ]);
    expect(result.project.tracks[0].kind).toBe("text");
    expect(track.name).toBe("Donmuş kare");
    expect(freeze.start).toBe(2.5);
    expect(freeze.duration).toBe(1.5);
    expect(freeze.assetId).toBe(still.id);
    expect(freeze.sourceIn).toBe(0);
    expect(freeze.speed).toBe(1);
    expect(freeze.muted).toBe(true);
    expect(freeze.keyframes).toEqual([]);
    expect(freeze.transform).toEqual(evaluated.transform);
    expect(freeze.crop).toEqual(clip.crop);
    expect(freeze.chromaKey).toEqual(clip.chromaKey);
    expect(freeze.adjustments).toEqual(clip.adjustments);
    expect(result.project.assets.map((asset) => asset.id)).toEqual([
      "video",
      "still",
    ]);
    expect(result.project.clips).toHaveLength(2);
  });

  it("reuses the still lane and cache asset", () => {
    const { project, clip } = freezeFixture();
    const first = addFreezeFrameClip(project, clip.id, still, 2, 1);
    const second = addFreezeFrameClip(
      first.project,
      clip.id,
      { ...still, id: "still-2" },
      3,
      1,
    );
    expect(
      second.project.tracks.filter((track) => track.name === "Donmuş kare"),
    ).toHaveLength(1);
    expect(second.project.clips).toHaveLength(3);
    expect(second.clip.assetId).toBe("still");
  });

  it("rejects playhead and duration outside the supported range", () => {
    const { project, clip } = freezeFixture();
    expect(() =>
      addFreezeFrameClip(project, clip.id, still, 6, 1),
    ).toThrow("Oynatma başlığı seçili video klibinin aralığında olmalıdır");
    expect(() =>
      addFreezeFrameClip(project, clip.id, still, 2, 0),
    ).toThrow("Donmuş kare süresi geçersiz");
    expect(() =>
      addFreezeFrameClip(project, clip.id, { ...still, kind: "video" }, 2, 1),
    ).toThrow("Kare dondurma sonucu görsel değil");
  });
});
