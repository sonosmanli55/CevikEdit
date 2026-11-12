import { snapToFrame, splitClip, trimClip } from "./model";
import type { Clip, Project } from "./types";

/**
 * Timeline placement modes for source-range insertion.
 *
 * `append` keeps the historical behaviour: place at the first free spot at the
 * end of the target track. `insert` opens a gap at the clip start and pushes
 * later clips to the right, splitting a clip that straddles the insertion
 * point so its left and right halves keep their own media range. `overwrite`
 * replaces the occupied span and splits/trims the clips on both sides.
 *
 * Everything is derived from the project alone, so a placement is one undoable
 * commit and can be verified without any media work.
 */
export type PlacementMode = "append" | "insert" | "overwrite";

export const PLACEMENT_MODES: readonly PlacementMode[] = [
  "append",
  "insert",
  "overwrite",
];

export function isPlacementMode(value: unknown): value is PlacementMode {
  return typeof value === "string" && PLACEMENT_MODES.includes(value as PlacementMode);
}

export interface PlacementResult {
  project: Project;
  clip: Clip;
}

function trackEnd(project: Project, trackId: string): number {
  return project.clips
    .filter((clip) => clip.trackId === trackId)
    .reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
}

/**
 * Push every clip that starts at or after `at` by `amount`, splitting a clip
 * that straddles `at` so its left part stays in place.
 */
function openGap(
  project: Project,
  trackId: string,
  at: number,
  amount: number,
): Project {
  if (amount <= 0) return project;
  let next = project;
  const straddling = next.clips.filter(
    (clip) =>
      clip.trackId === trackId &&
      clip.start < at - 1e-9 &&
      clip.start + clip.duration > at + 1e-9,
  );
  for (const clip of straddling) next = splitClip(next, clip.id, at);
  return {
    ...next,
    clips: next.clips.map((clip) =>
      clip.trackId === trackId && clip.start >= at - 1e-9
        ? { ...clip, start: clip.start + amount }
        : clip,
    ),
  };
}

/** Remove the occupied span, splitting clips at both edges first. */
function clearSpan(
  project: Project,
  trackId: string,
  start: number,
  end: number,
): Project {
  let next = project;
  const overlapping = () =>
    next.clips.filter(
      (clip) =>
        clip.trackId === trackId &&
        clip.start < end - 1e-9 &&
        clip.start + clip.duration > start + 1e-9,
    );
  for (const clip of overlapping()) {
    if (clip.start < start - 1e-9) next = splitClip(next, clip.id, start);
  }
  for (const clip of overlapping()) {
    if (clip.start + clip.duration > end + 1e-9)
      next = splitClip(next, clip.id, end);
  }
  // Split is a no-op for sub-frame remnants; trim those so no covered media
  // survives under the new clip.
  for (const clip of overlapping()) {
    if (clip.start < start - 1e-9) {
      next = trimClip(next, clip.id, "end", start);
    } else if (clip.start + clip.duration > end + 1e-9) {
      next = trimClip(next, clip.id, "start", end);
    }
  }
  return {
    ...next,
    clips: next.clips.filter(
      (clip) =>
        !(
          clip.trackId === trackId &&
          clip.start >= start - 1e-9 &&
          clip.start + clip.duration <= end + 1e-9
        ),
    ),
  };
}

/**
 * Place `clip` on its own track using the requested mode. The caller supplies
 * an already validated clip whose `start` is the requested insertion point.
 */
export function placeClip(
  project: Project,
  clip: Clip,
  mode: PlacementMode,
): PlacementResult {
  if (!isPlacementMode(mode)) throw new Error("Desteklenmeyen yerleştirme biçimi");
  const track = project.tracks.find((item) => item.id === clip.trackId);
  if (!track) throw new Error("Klibin kanalı bulunamadı");
  if (track.locked) throw new Error(`“${track.name}” kanalı kilitli; önce kilidini açın`);
  if (!Number.isFinite(clip.start) || !Number.isFinite(clip.duration))
    throw new Error("Klip zamanı geçersiz");
  const start = snapToFrame(Math.max(0, clip.start), project.fps);
  const base: Clip = { ...clip, start };
  if (mode === "append") {
    const at = Math.max(start, trackEnd(project, track.id));
    return {
      project: { ...project, clips: [...project.clips, { ...base, start: at }] },
      clip: { ...base, start: at },
    };
  }
  const end = start + base.duration;
  if (end > 86400) throw new Error("Klip zaman çizelgesi aralığının dışında");
  const placed: Clip = { ...base, id: clip.id };
  const prepared =
    mode === "insert"
      ? openGap(project, track.id, start, base.duration)
      : clearSpan(project, track.id, start, end);
  return {
    project: { ...prepared, clips: [...prepared.clips, placed] },
    clip: placed,
  };
}
