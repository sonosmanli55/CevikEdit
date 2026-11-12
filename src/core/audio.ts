import { createClip, createTrack, id } from "./model";
import type { Clip, MediaAsset, Project } from "./types";

export interface AudioSeparation {
  /** Project with the extracted clip added and the source clip muted. */
  project: Project;
  /** Newly created audio clip, aligned with the source clip. */
  clip: Clip;
}

/**
 * Build the project state for "separate audio".
 *
 * The extracted track is placed on its own audio lane exactly where the source
 * clip sits, keeps its trim, speed and level envelope, and the source clip is
 * muted so the same sound is never heard twice. Everything is derived from the
 * project alone so the operation stays undoable and testable.
 */
export function separateProjectAudio(
  project: Project,
  clipId: string,
  audioAsset: MediaAsset,
): AudioSeparation {
  const source = project.clips.find((clip) => clip.id === clipId);
  if (!source) throw new Error("Sesi ayrılacak klip bulunamadı");
  if (audioAsset.kind !== "audio") throw new Error("Ayrılan materyal ses değil");
  const frame = 1 / project.fps;
  // Audible part of the source clip, measured in source seconds.
  const span = Math.min(
    source.duration * source.speed,
    Math.max(0, audioAsset.duration - source.sourceIn),
  );
  if (span < frame - 1e-9) throw new Error("Ayrılan ses çok kısa");
  const track = createTrack("audio");
  const linkId = id();
  const clip = createClip(audioAsset, track.id, source.start, project.fps);
  clip.name = source.name;
  clip.sourceIn = source.sourceIn;
  clip.speed = source.speed;
  clip.duration = Math.max(frame, span / source.speed);
  clip.volume = source.volume;
  clip.muted = false;
  clip.audioFadeIn = source.audioFadeIn;
  clip.audioFadeOut = source.audioFadeOut;
  clip.keyframes = source.keyframes
    .filter((keyframe) => keyframe.property === "volume")
    .map((keyframe) => ({
      ...keyframe,
      id: id(),
      easingWindow: keyframe.easingWindow
        ? { ...keyframe.easingWindow }
        : undefined,
    }));
  return {
    project: {
      ...project,
      tracks: [...project.tracks, track],
      clips: [
        ...project.clips.map((clip) =>
          clip.id === clipId
            ? { ...clip, muted: true, linkId: linkId }
            : clip,
        ),
        { ...clip, linkId },
      ],
    },
    clip: { ...clip, linkId },
  };
}
