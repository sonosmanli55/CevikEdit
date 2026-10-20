import {
  clone,
  createClip,
  createTrack,
  evaluateFade,
  evaluateKeyframes,
  snapToFrame,
} from "./model";
import type { Clip, MediaAsset, Project } from "./types";
import { t } from "../i18n/locale";

export interface ReversedClipResult {
  project: Project;
  clip: Clip;
  asset: MediaAsset;
}

export interface FreezeFrameResult {
  project: Project;
  clip: Clip;
  asset: MediaAsset;
}

function addDerivedAsset(project: Project, asset: MediaAsset): MediaAsset {
  const existing = project.assets.find(
    (entry) => entry.path === asset.path && entry.kind === asset.kind,
  );
  if (existing) return existing;
  project.assets = [...project.assets, asset];
  return asset;
}

/**
 * Replace the selected video clip with its locally rendered reversed media.
 *
 * The reversed file contains exactly the source range used by the clip, so the
 * clip keeps its timeline start, duration and speed while sourceIn becomes zero.
 * The original asset stays in the project and on disk.
 */
export function reverseProjectClip(
  project: Project,
  clipId: string,
  reversed: MediaAsset,
): ReversedClipResult {
  const source = project.clips.find((clip) => clip.id === clipId);
  if (!source) throw new Error("找不到要倒放的片段");
  const track = project.tracks.find((entry) => entry.id === source.trackId);
  if (!track) throw new Error("找不到片段所在轨道");
  if (track.locked) throw new Error("轨道已锁定，无法倒放");

  const original = project.assets.find((asset) => asset.id === source.assetId);
  if (!original) throw new Error("找不到原视频素材");
  if (original.kind !== "video") throw new Error("只有视频片段可以倒放");
  if (original.missing) throw new Error("原视频素材已丢失");
  if (reversed.kind !== "video") throw new Error("倒放结果不是视频");
  if (!Number.isFinite(reversed.duration) || reversed.duration <= 0)
    throw new Error("倒放结果时长无效");
  if (original.hasAudio && !reversed.hasAudio)
    throw new Error("倒放结果缺少原声，请重试");

  const sourceExtent = source.duration * source.speed;
  if (!Number.isFinite(sourceExtent) || sourceExtent <= 0)
    throw new Error("片段时长无效");
  if (
    Number.isFinite(original.duration) &&
    source.sourceIn + sourceExtent > original.duration + 0.08
  )
    throw new Error("片段超出原视频范围");
  if (reversed.duration + 0.08 < sourceExtent)
    throw new Error("倒放结果时长不足，请重试");

  const nextProject = {
    ...project,
    assets: [...project.assets],
    clips: project.clips.map((clip) =>
      clip.id === clipId
        ? {
            ...clone(clip),
            assetId: reversed.id,
            sourceIn: 0,
          }
        : clip,
    ),
  };
  const asset = addDerivedAsset(nextProject, reversed);
  const next = nextProject.clips.find((clip) => clip.id === clipId)!;
  // Reuse the existing asset id when the same cache file is already known.
  if (asset.id !== reversed.id) next.assetId = asset.id;
  return { project: nextProject, clip: next, asset };
}

/**
 * Create a still-image overlay from the current playhead.
 *
 * The image is rendered by the main process from the source frame. This core
 * function only builds project state: it copies the visible transform and color
 * settings at the playhead, clears animation envelopes, and puts the still on a
 * dedicated video lane so the original timing is never changed.
 */
export function addFreezeFrameClip(
  project: Project,
  sourceClipId: string,
  image: MediaAsset,
  playhead: number,
  duration = 2,
): FreezeFrameResult {
  const source = project.clips.find((clip) => clip.id === sourceClipId);
  if (!source) throw new Error("找不到要定格的片段");
  const track = project.tracks.find((entry) => entry.id === source.trackId);
  if (!track) throw new Error("找不到片段所在轨道");
  if (track.locked) throw new Error("轨道已锁定，无法定格");
  const sourceAsset = project.assets.find(
    (asset) => asset.id === source.assetId,
  );
  if (!sourceAsset || sourceAsset.kind !== "video")
    throw new Error("只有视频片段可以定格画面");
  if (sourceAsset.missing) throw new Error("原视频素材已丢失");
  if (image.kind !== "image") throw new Error("定格结果不是图片");
  if (!Number.isFinite(playhead)) throw new Error("播放头位置无效");
  if (
    playhead < source.start - 1e-9 ||
    playhead > source.start + source.duration + 1e-9
  )
    throw new Error("播放头必须在选中视频片段范围内");
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("定格时长无效");

  const start = snapToFrame(Math.max(0, playhead), project.fps);
  const freezeDuration = Math.max(
    1 / project.fps,
    snapToFrame(duration, project.fps),
  );
  if (start + freezeDuration > 86400)
    throw new Error("定格画面超出时间线范围");

  const lastFrame = Math.max(0, source.duration - 1 / project.fps);
  const local = Math.max(
    0,
    Math.min(lastFrame, Math.max(0, playhead - source.start)),
  );
  const evaluated = evaluateKeyframes(source, local);
  const fade = evaluateFade(source, Math.min(local, source.duration), "video");

  let tracks = project.tracks;
  let freezeTrack = tracks.find(
    (entry) =>
      entry.kind === "video" &&
      entry.name === t("定格画面") &&
      entry.id !== source.trackId &&
      !entry.locked,
  );
  if (!freezeTrack) {
    freezeTrack = createTrack("video", t("定格画面"));
    // Keep text above the still while placing it above ordinary video lanes.
    const at = tracks.findIndex((entry) => entry.kind !== "text");
    tracks =
      at < 0
        ? [...tracks, freezeTrack]
        : [...tracks.slice(0, at), freezeTrack, ...tracks.slice(at)];
  }

  const base = createClip(image, freezeTrack.id, start, project.fps);
  const clip: Clip = {
    ...base,
    name: t("定格画面"),
    duration: freezeDuration,
    sourceIn: 0,
    speed: 1,
    volume: 0,
    muted: true,
    transform: {
      ...evaluated.transform,
      opacity: evaluated.transform.opacity * fade,
    },
    adjustments: { ...source.adjustments },
    fadeIn: 0,
    fadeOut: 0,
    audioFadeIn: 0,
    audioFadeOut: 0,
    videoFadeWindow: undefined,
    audioFadeWindow: undefined,
    keyframes: [],
    crop: source.crop ? clone(source.crop) : undefined,
    chromaKey: source.chromaKey ? clone(source.chromaKey) : undefined,
    mask: source.mask ? clone(source.mask) : undefined,
  };

  const nextProject: Project = {
    ...project,
    tracks,
    assets: [...project.assets],
    clips: [...project.clips, clip],
  };
  const asset = addDerivedAsset(nextProject, image);
  if (asset.id !== image.id) clip.assetId = asset.id;
  return { project: nextProject, clip, asset };
}
