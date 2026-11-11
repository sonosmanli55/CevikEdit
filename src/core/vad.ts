/**
 * Offline speech-activity detection used to duck music only where someone is
 * actually talking instead of across a whole clip.
 *
 * The input is a sequence of short-window energy values (dBFS), which the main
 * process computes from the decoded PCM. Everything below is pure and
 * deterministic so the decision (noise floor, hysteresis, gap merging) is
 * testable without audio hardware.
 */
export interface VadOptions {
  /** Analysis window in seconds; the detector is designed for 10–50 ms. */
  window: number;
  /** Speech must be this much above the estimated noise floor (dB). */
  thresholdDb: number;
  /** Ignore bursts shorter than this (clicks, breaths). */
  minimumSpeech: number;
  /** Bridge pauses shorter than this so music does not pump between words. */
  minimumGap: number;
  /** Absolute ceiling so pure silence never registers as speech. */
  silenceFloorDb: number;
}

export const DEFAULT_VAD: VadOptions = {
  window: 0.02,
  thresholdDb: 8,
  minimumSpeech: 0.25,
  minimumGap: 0.35,
  silenceFloorDb: -55,
};

export interface SpeechInterval {
  start: number;
  end: number;
}

export interface VadResult {
  intervals: SpeechInterval[];
  /** Estimated noise floor in dBFS (10th percentile of the analysis). */
  noiseFloor: number;
  /** Threshold actually used (dBFS). */
  threshold: number;
  speechSeconds: number;
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return -120;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

/**
 * Compute per-frame dBFS from interleaved float samples. Exported so the main
 * process and the tests share exactly one framing rule.
 */
export function frameEnergies(
  samples: Float32Array,
  sampleRate: number,
  window: number,
): number[] {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return [];
  const size = Math.max(1, Math.round(window * sampleRate));
  const energies: number[] = [];
  for (let offset = 0; offset + size <= samples.length; offset += size) {
    let sum = 0;
    for (let index = offset; index < offset + size; index += 1) {
      const value = samples[index];
      sum += value * value;
    }
    const rms = Math.sqrt(sum / size);
    energies.push(rms > 0 ? Math.max(-120, 20 * Math.log10(rms)) : -120);
  }
  return energies;
}

/**
 * Detect speech intervals. The noise floor comes from the quietest 10% of
 * frames, so a recording with a loud constant hiss still works: hysteresis then
 * keeps the detector from flickering on single frames.
 */
export function detectSpeech(
  energies: number[],
  options: Partial<VadOptions> = {},
): VadResult {
  const mergedOptions = { ...DEFAULT_VAD, ...options };
  const finiteOr = (value: number, fallback: number) =>
    Number.isFinite(value) ? value : fallback;
  const settings: VadOptions = {
    window: Math.max(0.005, Math.min(0.2, finiteOr(mergedOptions.window, DEFAULT_VAD.window))),
    thresholdDb: Math.max(1, Math.min(60, finiteOr(mergedOptions.thresholdDb, DEFAULT_VAD.thresholdDb))),
    minimumSpeech: Math.max(0, finiteOr(mergedOptions.minimumSpeech, DEFAULT_VAD.minimumSpeech)),
    minimumGap: Math.max(0, finiteOr(mergedOptions.minimumGap, DEFAULT_VAD.minimumGap)),
    silenceFloorDb: Math.max(-120, Math.min(0, finiteOr(mergedOptions.silenceFloorDb, DEFAULT_VAD.silenceFloorDb))),
  };
  const window = settings.window;
  if (!energies.length)
    return { intervals: [], noiseFloor: -120, threshold: settings.silenceFloorDb, speechSeconds: 0 };
  const noiseFloor = percentile(energies, 0.1);
  // Both a relative lift above the noise and an absolute floor are required.
  const threshold = Math.max(noiseFloor + settings.thresholdDb, settings.silenceFloorDb);
  const enter = threshold + 2;
  const leave = threshold - 2;
  const raw: SpeechInterval[] = [];
  let active = false;
  let start = 0;
  for (let index = 0; index < energies.length; index += 1) {
    const level = energies[index];
    if (!active && level >= enter) {
      active = true;
      start = index * window;
    } else if (active && level < leave) {
      active = false;
      raw.push({ start, end: index * window });
    }
  }
  if (active) raw.push({ start, end: energies.length * window });

  // Drop blips, bridge short pauses.
  const kept: SpeechInterval[] = raw.filter(
    (interval) => interval.end - interval.start >= settings.minimumSpeech,
  );
  const merged: SpeechInterval[] = [];
  for (const interval of kept) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start - previous.end < settings.minimumGap)
      previous.end = interval.end;
    else merged.push({ ...interval });
  }
  const speechSeconds = merged.reduce(
    (total, interval) => total + (interval.end - interval.start),
    0,
  );
  return { intervals: merged, noiseFloor, threshold, speechSeconds };
}

/**
 * Clamp detected intervals to a clip's timeline span and convert them from the
 * analysed audio (source seconds) to timeline seconds.
 */
export function mapIntervalsToTimeline(
  intervals: SpeechInterval[],
  clip: { start: number; duration: number; sourceIn: number; speed: number },
): SpeechInterval[] {
  const speed = clip.speed > 0 ? clip.speed : 1;
  const result: SpeechInterval[] = [];
  for (const interval of intervals) {
    // Source time → clip-local → timeline.
    const localStart = (interval.start - clip.sourceIn) / speed;
    const localEnd = (interval.end - clip.sourceIn) / speed;
    const start = Math.max(clip.start, clip.start + localStart);
    const end = Math.min(clip.start + clip.duration, clip.start + localEnd);
    if (end - start > 1e-3) result.push({ start, end });
  }
  return result;
}
