import { describe, expect, it } from "vitest";
import {
  groupAssetsByLane,
  laneFitsAll,
  laneKindForAsset,
  resolveDropTrack,
  trackAcceptsKind,
} from "../src/core/timelineDrop";
import { createTrack } from "../src/core/model";
import type { MediaAsset, Track } from "../src/core/types";

const asset = (id: string, kind: MediaAsset["kind"]) =>
  ({ id, kind, name: id, path: `/m/${id}`, url: `file:///m/${id}`, duration: 3, width: 100, height: 100 }) as MediaAsset;

const video = createTrack("video", "Video 1");
const video2 = createTrack("video", "Video 2");
const audio = createTrack("audio", "Ses 1");
const text = createTrack("text", "Metin");
const tracks: Track[] = [text, video, audio, video2];

describe("timeline drop routing", () => {
  it("maps each media kind to the lane that should receive it", () => {
    expect(laneKindForAsset(asset("a", "audio"))).toBe("audio");
    expect(laneKindForAsset(asset("b", "video"))).toBe("video");
    expect(laneKindForAsset(asset("c", "image"))).toBe("video");
    expect(trackAcceptsKind(video, "image")).toBe(true);
    expect(trackAcceptsKind(audio, "image")).toBe(false);
    expect(trackAcceptsKind(text, "video")).toBe(false);
  });

  it("honours a hovered lane when it accepts the kind", () => {
    expect(resolveDropTrack(tracks, "video", video2.id)?.id).toBe(video2.id);
    expect(resolveDropTrack(tracks, "audio", audio.id)?.id).toBe(audio.id);
  });

  it("reroutes a video dropped on the audio lane to the nearest video lane", () => {
    // Dropping a video onto "Ses 1" must not silently do nothing. Both video lanes
    // are equidistant; the one above the pointer wins.
    const target = resolveDropTrack(tracks, "video", audio.id);
    expect(target?.kind).toBe("video");
    expect(target?.id).toBe(video.id);
  });

  it("reroutes audio dropped on the video lane", () => {
    const target = resolveDropTrack(tracks, "audio", video.id);
    expect(target?.kind).toBe("audio");
    expect(target?.id).toBe(audio.id);
  });

  it("skips locked lanes and reports nothing when all are locked", () => {
    const locked = tracks.map((track) =>
      track.kind === "video" ? { ...track, locked: true } : track,
    );
    expect(resolveDropTrack(locked, "video", video.id)).toBeUndefined();
    expect(resolveDropTrack(locked, "audio", video.id)?.id).toBe(audio.id);
  });

  it("groups a mixed selection by destination lane, keeping order", () => {
    const groups = groupAssetsByLane([
      asset("v1", "video"),
      asset("a1", "audio"),
      asset("i1", "image"),
      asset("a2", "audio"),
    ]);
    expect(groups.map((group) => group.lane)).toEqual(["video", "audio"]);
    expect(groups[0].assets.map((entry) => entry.id)).toEqual(["v1", "i1"]);
    expect(groups[1].assets.map((entry) => entry.id)).toEqual(["a1", "a2"]);
  });

  it("reports whether a lane fits every dropped asset", () => {
    expect(laneFitsAll([asset("v", "video"), asset("i", "image")], video)).toBe(true);
    expect(laneFitsAll([asset("v", "video"), asset("a", "audio")], video)).toBe(false);
  });
});
