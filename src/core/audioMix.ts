import { clone, id as createId, snapToFrame, validateProject } from "./model";
import type { Clip, Keyframe, LoudnessMeasurement, Project } from "./types";

export type { LoudnessMeasurement } from "./types";

/**
 * Audio measurement and mix planning shared by the audio tools panel.
 *
 * Loudness is measured by FFmpeg `loudnorm` in the main process; everything
 * below is pure so the gain math, ducking envelope and validation stay
 * testable without spawning media tools.
 */
export interface AudioEditPlan {
  base: string;
  project: Project;
  changedIds: string[];
}

export interface DuckingSettings {
  /** Attenuation applied while speech is audible, in dB (negative). */
  amountDb: number;
  /** Attack and release time in seconds. */
  fade: number;
  /**
   * Optional detected speech intervals per voice clip id, in timeline seconds.
   * When present, ducking follows real speech instead of the whole clip span.
   */
  ranges?: Record<string, Array<{ start: number; end: number }>>;
}

const MAX_CLIPS = 50;

function finite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${label} sonlu bir sayı olmalı`);
}
function range(
  value: unknown,
  label: string,
  min: number,
  max: number,
): asserts value is number {
  finite(value, label);
  if (value < min || value > max)
    throw new Error(`${label} ${min}–${max} arasında olmalı`);
}
function audioClip(project: Project, clipId: string): Clip {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip) throw new Error("Seçili ses klibi bulunamadı");
  const track = project.tracks.find((item) => item.id === clip.trackId);
  if (!track) throw new Error("Seçili ses klibinin kanalı bulunamadı");
  if (track.locked)
    throw new Error(`“${track.name}” kanalı kilitli; önce kilidini açın`);
  const asset = project.assets.find((item) => item.id === clip.assetId);
  if (!asset || asset.kind === "image" || asset.hasAudio === false)
    throw new Error(`“${clip.name}” klibinde kullanılabilir ses yok`);
  return clip;
}

function numberFromLoudnorm(value: string, label: string): number {
  const normalized = value.trim().toLowerCase();
  if (normalized === "-inf") return Number.NEGATIVE_INFINITY;
  if (normalized === "inf") return Number.POSITIVE_INFINITY;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed))
    throw new Error(`Ses yüksekliği ölçümü çözümlenemedi (${label})`);
  return parsed;
}

/**
 * Extract the measurement block FFmpeg `loudnorm` writes to stderr. Only the
 * input values are used; the renderer never trusts arbitrary numbers from the
 * media tool beyond the finite range checks below.
 */
export function parseLoudnormJson(text: string): LoudnessMeasurement {
  if (typeof text !== "string" || !text.length)
    throw new Error("Ses düzeyi ölçüm sonucu okunamadı");
  const blocks = [...text.matchAll(/\{[\s\S]*?\}/g)].map((match) => match[0]);
  for (let index = blocks.length - 1; index >= 0; index--) {
    if (!blocks[index].includes('"input_i"')) continue;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(blocks[index]) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof raw.input_i !== "string" || typeof raw.input_tp !== "string")
      continue;
    const inputI = numberFromLoudnorm(raw.input_i, "integrated"),
      inputTp = numberFromLoudnorm(raw.input_tp, "true peak"),
      inputLra = numberFromLoudnorm(
        typeof raw.input_lra === "string" ? raw.input_lra : "0",
        "range",
      );
    return { inputI, inputTp, inputLra };
  }
  throw new Error("Geçerli bir ses düzeyi ölçüm sonucu okunamadı");
}

/**
 * Gain needed to reach the target integrated loudness, limited so the measured
 * true peak never exceeds the ceiling. Returns 0 when the input is already on
 * target, and refuses silent input instead of generating a huge gain.
 */
export function normalizationGainDb(
  measurement: LoudnessMeasurement,
  targetLufs: number,
  peakCeiling = -1,
): number {
  range(targetLufs, "Hedef ses düzeyi", -40, 0);
  range(peakCeiling, "Tepe sınırı", -9, 0);
  const { inputI, inputTp } = measurement;
  if (!Number.isFinite(inputI))
    throw new Error("Seçili ses ölçüm için fazla sessiz; geçerli ses düzeyi ölçülemedi");
  let gain = targetLufs - inputI;
  if (Number.isFinite(inputTp)) gain = Math.min(gain, peakCeiling - inputTp);
  return Math.max(-30, Math.min(30, gain));
}

const VOLUME_MAX = 4;

/** Scale the clip level and every existing volume key by the measured gain. */
export function prepareAudioNormalization(
  input: Project,
  clipId: string,
  measurement: LoudnessMeasurement,
  targetLufs: number,
  peakCeiling = -1,
): AudioEditPlan {
  const project = validateProject(clone(input));
  const clip = audioClip(project, clipId);
  if (
    typeof measurement?.inputI !== "number" ||
    typeof measurement?.inputTp !== "number"
  )
    throw new Error("Ses düzeyi ölçüm sonucu geçersiz");
  const gain = normalizationGainDb(measurement, targetLufs, peakCeiling);
  const factor = 10 ** (gain / 20);
  const volume = clip.volume * factor;
  if (volume > VOLUME_MAX + 1e-9)
    throw new Error(
      "Ses düzeyi kazancı uygulanınca ses %400'ü aşar; hedef ses düzeyini düşürün veya önce klip sesini azaltın",
    );
  const keys = clip.keyframes.filter((key) => key.property === "volume");
  const scaled = keys.map((key) => {
    const value = key.value * factor;
    if (value > VOLUME_MAX + 1e-9)
      throw new Error("Ses düzeyi kazancı uygulanınca anahtar kare sesi %400'ü aşar");
    return value;
  });
  clip.volume = Math.max(0, Math.min(VOLUME_MAX, volume));
  keys.forEach((key, index) => {
    key.value = scaled[index];
  });
  return {
    base: JSON.stringify(input),
    project,
    changedIds: Math.abs(gain) < 1e-9 ? [] : [clip.id],
  };
}

interface Interval {
  start: number;
  end: number;
}

function mergeIntervals(
  intervals: Interval[],
  gap: number,
): Interval[] {
  const sorted = [...intervals].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const result: Interval[] = [];
  for (const interval of sorted) {
    const previous = result[result.length - 1];
    if (previous && interval.start <= previous.end + gap + 1e-9)
      previous.end = Math.max(previous.end, interval.end);
    else result.push({ ...interval });
  }
  return result;
}

function localIntervals(
  clip: Clip,
  voice: Interval[],
  fade: number,
): Interval[] {
  const result: Interval[] = [];
  const end = clip.start + clip.duration;
  for (const interval of voice) {
    const start = Math.max(clip.start, interval.start),
      stop = Math.min(end, interval.end);
    if (stop > start + 1e-9)
      result.push({ start: start - clip.start, end: stop - clip.start });
  }
  return mergeIntervals(result, fade * 2);
}

/**
 * Build the ducking envelope for every music clip.
 *
 * A volume key at 0 s pins the original level because keyframe evaluation uses
 * the first key for earlier times. Speech intervals closer than twice the fade
 * are merged so the music does not pump up between two sentences. The
 * resulting keys are ordinary volume keyframes, editable in the keyframe
 * panel and evaluated by both preview and export.
 */
export function prepareDucking(
  input: Project,
  voiceIds: readonly string[],
  musicIds: readonly string[],
  settings: DuckingSettings,
): AudioEditPlan {
  const project = validateProject(clone(input));
  for (const [ids, label] of [
    [voiceIds, "konuşma"],
    [musicIds, "Müzik"],
  ] as const) {
    if (!Array.isArray(ids) || !ids.length)
      throw new Error(`En az bir ${label} klibi seçin`);
    if (ids.length > MAX_CLIPS)
      throw new Error(`Her işlemde en fazla ${MAX_CLIPS} ${label} klibi işlenebilir`);
    if (new Set(ids).size !== ids.length)
      throw new Error(`${label} klipleri yinelenemez`);
    if (ids.some((id) => typeof id !== "string" || !id))
      throw new Error(`${label} klibi geçersiz`);
  }
  if (voiceIds.some((id) => musicIds.includes(id)))
    throw new Error("Aynı klip hem konuşma hem müzik olarak kullanılamaz");
  range(settings?.amountDb, "Kısma miktarı", -60, 0);
  range(settings?.fade, "Geçiş süresi", 0, 5);
  if (settings.amountDb > -0.1)
    throw new Error("Kısma miktarı 0 dB'den küçük olmalıdır");
  const voiceClips = voiceIds.map((id) => audioClip(project, id));
  const musicClips = musicIds.map((id) => audioClip(project, id));
  const ranges = settings.ranges;
  if (ranges !== undefined) {
    if (!ranges || typeof ranges !== "object" || Array.isArray(ranges))
      throw new Error("Konuşma aralıkları geçersiz");
    for (const [id, list] of Object.entries(ranges)) {
      if (!voiceIds.includes(id))
        throw new Error("Konuşma aralığı seçili olmayan bir klibe ait");
      if (!Array.isArray(list) || list.length > 5000)
        throw new Error("Konuşma aralıkları geçersiz");
      for (const item of list) {
        finite(item?.start, "Konuşma aralığı başlangıcı");
        finite(item?.end, "Konuşma aralığı bitişi");
        if (item.start < 0 || item.end <= item.start || item.end > 86400)
          throw new Error("Konuşma aralığı geçersiz");
      }
    }
  }
  const spans = ranges
    ? voiceClips.flatMap((clip) =>
        (ranges[clip.id] ?? []).map((range) => ({
          start: Math.max(clip.start, range.start),
          end: Math.min(clip.start + clip.duration, range.end),
        })),
      )
    : voiceClips.map((clip) => ({
        start: clip.start,
        end: clip.start + clip.duration,
      }));
  const voice = mergeIntervals(
    spans.filter((span) => span.end > span.start + 1e-9),
    0,
  );
  if (!voice.length)
    throw new Error("Seçili konuşma klipinde algılanan konuşma aralığı yok");
  const changed: string[] = [];
  for (const clip of musicClips) {
    const intervals = localIntervals(clip, voice, settings.fade);
    if (!intervals.length) continue;
    const base = clip.volume;
    const duck = Math.max(
      0,
      Math.min(VOLUME_MAX, base * 10 ** (settings.amountDb / 20)),
    );
    const frame = 1 / project.fps;
    const ramp = Math.max(settings.fade, frame);
    const points = new Map<number, number>();
    const put = (time: number, value: number) => {
      const at = Math.max(
        0,
        Math.min(clip.duration, snapToFrame(time, project.fps)),
      );
      points.set(at, value);
    };
    // Pin the base level at the start unless speech begins there.
    put(0, base);
    for (const interval of intervals) {
      if (interval.start <= 1e-9) put(0, duck);
      else put(interval.start - ramp, base);
      put(interval.start, duck);
      put(interval.end, duck);
      if (interval.end < clip.duration - 1e-9)
        put(interval.end + ramp, base);
    }
    const times = [...points.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([time, value], index, all) => {
        // A later point at the same snapped time wins; drop the earlier one.
        return !all.some(
          ([otherTime], otherIndex) =>
            otherIndex > index && Math.abs(otherTime - time) < 1e-9,
        ) && Number.isFinite(value);
      });
    if (times.length > 400)
      throw new Error("Çok fazla konuşma aralığı var; bu müzik için kısma zarfı oluşturulamadı");
    const nextKeys: Keyframe[] = times.map(([time, value]) => ({
      id: createId(),
      time,
      property: "volume",
      value: Math.max(0, Math.min(VOLUME_MAX, value)),
      easing: "linear",
    }));
    const previous = clip.keyframes.filter((key) => key.property === "volume");
    if (JSON.stringify(previous) === JSON.stringify(nextKeys)) continue;
    clip.keyframes = [
      ...clip.keyframes.filter((key) => key.property !== "volume"),
      ...nextKeys,
    ];
    changed.push(clip.id);
  }
  if (!changed.length)
    throw new Error("Seçili müzik konuşma aralıklarıyla örtüşmüyor; hiçbir klip değiştirilmedi");
  return { base: JSON.stringify(input), project, changedIds: changed };
}

/** Apply a prepared plan only when the project still matches its snapshot. */
export function applyAudioEdit(
  current: Project,
  plan: AudioEditPlan,
): Project {
  if (JSON.stringify(current) !== plan.base)
    throw new Error("Proje değişti; ses değişikliklerini yeniden denetleyip uygulayın");
  return validateProject(clone(plan.project));
}
