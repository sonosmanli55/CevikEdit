/**
 * Large-project and 4K guardrails.
 *
 * Everything here is pure estimation. The goal is to tell the user what is
 * expensive *before* a 4K or thousand-clip project stalls, and to keep the
 * timeline responsive by rendering only the clips that are on screen.
 */
import type { Project } from "./types";

/** Soft limits; above them the editor still works but shows guidance. */
export const PROJECT_LIMITS = {
  clips: 300,
  keyframes: 2000,
  textClips: 300,
  tracks: 40,
  durationSeconds: 60 * 60,
  /** Timeline pixel work above this is virtualized regardless. */
  visibleClips: 120,
} as const;

/** Peak working-set budget used for the export pre-flight check (bytes). */
export const EXPORT_MEMORY_BUDGET = 3 * 1024 * 1024 * 1024;

export interface ProjectMetrics {
  clips: number;
  tracks: number;
  textClips: number;
  keyframes: number;
  assets: number;
  duration: number;
  /** Pixels per exported frame at the project canvas size. */
  framePixels: number;
  /** Rough RGBA bytes for one canvas-sized frame. */
  frameBytes: number;
  /** Bitmap budget for the reverse-playback cache (documented limit). */
  reverseSeconds: number;
}

export function projectMetrics(project: Project): ProjectMetrics {
  const duration = project.clips.reduce(
    (end, clip) => Math.max(end, clip.start + clip.duration),
    0,
  );
  const framePixels = Math.max(1, project.width * project.height);
  return {
    clips: project.clips.length,
    tracks: project.tracks.length,
    textClips: project.clips.filter((clip) => !!clip.text).length,
    keyframes: project.clips.reduce(
      (total, clip) => total + clip.keyframes.length,
      0,
    ),
    assets: project.assets.length,
    duration,
    framePixels,
    frameBytes: framePixels * 4,
    // The reverse-render budget documented for clip tools is 3 GiB.
    reverseSeconds: (3 * 1024 * 1024 * 1024) / (framePixels * 4 * 30),
  };
}

export interface PerformanceNote {
  id: string;
  level: "info" | "warning";
  message: string;
}

/**
 * User-facing guidance in Turkish. Only `warning` items are actionable enough
 * to interrupt; `info` items explain a deliberate trade-off.
 */
export function performanceNotes(
  project: Project,
  canvas: { width: number; height: number; fps: number } = project,
): PerformanceNote[] {
  const metrics = projectMetrics(project);
  const notes: PerformanceNote[] = [];
  if (metrics.clips > PROJECT_LIMITS.clips)
    notes.push({
      id: "clips",
      level: "warning",
      message: `${metrics.clips} klip var; zaman çizelgesi yalnızca görünür klipleri çizer, ancak dışa aktarma uzun sürebilir.`,
    });
  if (metrics.keyframes > PROJECT_LIMITS.keyframes)
    notes.push({
      id: "keyframes",
      level: "warning",
      message: `${metrics.keyframes} anahtar kare var; önizleme akıcılığı için gereksiz anahtar kareleri temizleyin.`,
    });
  if (metrics.textClips > PROJECT_LIMITS.textClips)
    notes.push({
      id: "text",
      level: "warning",
      message: `${metrics.textClips} metin katmanı var; her karede yeniden rasterleştirilir. Uzun altyazıları bölmeyi düşünün.`,
    });
  if (metrics.tracks > PROJECT_LIMITS.tracks)
    notes.push({
      id: "tracks",
      level: "warning",
      message: `${metrics.tracks} kanal var; çok kanallı projelerde oynatma sırasında önizleme düşebilir.`,
    });
  if (metrics.duration > PROJECT_LIMITS.durationSeconds)
    notes.push({
      id: "duration",
      level: "warning",
      message: "Proje bir saatten uzun; tek seferde dışa aktarma en fazla 24 saat destekler. Aralık seçerek dışa aktarmayı düşünün.",
    });
  if (canvas.width * canvas.height >= 3840 * 2160)
    notes.push({
      id: "4k",
      level: "info",
      message:
        "4K tuval: önizleme ekran boyutunda çizilir, dışa aktarma tam çözünürlükte yapılır. Düşük güçlü makinelerde 1080p ile prova edin.",
    });
  if (metrics.clips > PROJECT_LIMITS.clips && metrics.textClips > 0)
    notes.push({
      id: "mixed",
      level: "info",
      message:
        "Kalabalık projelerde dışa aktarmayı parçalara bölmek bellek kullanımını düşürür.",
    });
  return notes;
}

/** Estimated peak memory of one export, from canvas size and active layers. */
export function estimateExportBytes(
  canvas: { width: number; height: number },
  layers: number,
): number {
  const frame = Math.max(1, canvas.width * canvas.height) * 4;
  // Base compositor frame plus one buffer per simultaneously composited layer.
  return frame * (2 + Math.max(1, Math.min(24, layers)));
}

export function exportMemoryProblem(
  canvas: { width: number; height: number },
  layers: number,
): string | null {
  const bytes = estimateExportBytes(canvas, layers);
  if (bytes <= EXPORT_MEMORY_BUDGET) return null;
  const needed = (bytes / (1024 * 1024 * 1024)).toFixed(1);
  return `Bu çözünürlükte ${layers} katman için yaklaşık ${needed} GB belleğe ihtiyaç var; daha düşük çözünürlük seçin veya katmanları azaltın.`;
}

/**
 * Clips that must be drawn for a viewport. `margin` widens the window so a
 * partially visible clip and its handles are never clipped away.
 */
export function visibleClips<T extends { start: number; duration: number }>(
  clips: T[],
  view: { start: number; end: number },
  margin = 0,
): T[] {
  const start = Math.min(view.start, view.end) - margin;
  const end = Math.max(view.start, view.end) + margin;
  return clips.filter(
    (clip) => clip.start + clip.duration >= start && clip.start <= end,
  );
}
