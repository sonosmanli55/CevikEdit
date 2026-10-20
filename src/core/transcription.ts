import { parseSubtitles, type Subtitle } from "./subtitles";

/** One timed phrase as produced by a speech recogniser. */
export interface TranscriptionCue {
  /** Start in seconds relative to the extracted audio. */
  start: number;
  /** End in seconds relative to the extracted audio. */
  end: number;
  text: string;
}

export interface SubtitleBuildOptions {
  /** Timeline position of the transcribed clip. */
  offset: number;
  /** Clip speed; cue times are divided by it. */
  speed: number;
  /** End of the clip on the timeline. */
  limit: number;
  fps: number;
  /** Soft maximum cue duration in seconds (default 6). */
  maxDuration?: number;
  /** Soft maximum characters per cue (default 90). */
  maxChars?: number;
  /** Hard limit on generated cues (default 2000). */
  maxCues?: number;
}

/**
 * Whisper emits short stage directions for non-speech audio. Dropping those
 * markers keeps automatic subtitles readable without hiding real dialogue
 * that happens to be surrounded by parentheses.
 */
const NON_SPEECH = new Set([
  "music",
  "muzik",
  "müzik",
  "background music",
  "arka plan müziği",
  "applause",
  "alkis",
  "alkış",
  "laughter",
  "gulusme",
  "gülüşme",
  "gülüşmeler",
  "silence",
  "sessizlik",
  "blank audio",
  "blank_audio",
  "inaudible",
  "anlasilmaz",
  "anlaşılmaz",
  "noise",
  "gurultu",
  "gürültü",
  "sound",
  "ses",
]);

const BRACKETED = /[\[\(（【]\s*([^\]\)）】]{0,80}?)\s*[\]\)）】]/g;

function markerKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,!?…:;'"\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove recogniser noise markers and normalise whitespace. */
export function cleanTranscript(value: string): string {
  if (typeof value !== "string") return "";
  let text = value
    .replace(/^\uFEFF/, "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/[♪♫♬]/g, " ");
  text = text.replace(BRACKETED, (whole, inner: string) =>
    NON_SPEECH.has(markerKey(inner)) ? " " : whole,
  );
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "";
  // A cue made only of a bracketed annotation is a stage direction, not speech.
  if (
    /^[\[\(（【][\s\S]*[\]\)）】]$/.test(text) &&
    !/[\p{L}\p{N}]/u.test(text.replace(BRACKETED, ""))
  )
    return "";
  if (!/[\p{L}\p{N}]/u.test(text)) return "";
  return text;
}

function clockSeconds(value: unknown): number {
  if (typeof value !== "string") return Number.NaN;
  const match = value
    .trim()
    .match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?[.,](\d{1,3})$/);
  if (!match) return Number.NaN;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = match[3] === undefined ? undefined : Number(match[3]);
  const fraction = Number(`0.${match[4]}`);
  return third === undefined
    ? first * 60 + second + fraction
    : first * 3600 + second * 60 + third + fraction;
}

function cueFromSegment(segment: unknown): TranscriptionCue | null {
  if (!segment || typeof segment !== "object") return null;
  const record = segment as Record<string, unknown>;
  const text = cleanTranscript(typeof record.text === "string" ? record.text : "");
  if (!text) return null;

  const offsets = record.offsets as
    | { from?: unknown; to?: unknown }
    | undefined;
  const from = Number(offsets?.from);
  const to = Number(offsets?.to);
  if (Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to > from)
    return { start: from / 1000, end: to / 1000, text };

  const start = Number(record.start);
  const end = Number(record.end);
  if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start)
    return { start, end, text };

  const timestamps = record.timestamps as
    | { from?: unknown; to?: unknown }
    | undefined;
  const timestampStart = clockSeconds(timestamps?.from);
  const timestampEnd = clockSeconds(timestamps?.to);
  if (
    Number.isFinite(timestampStart) &&
    Number.isFinite(timestampEnd) &&
    timestampEnd > timestampStart
  )
    return { start: timestampStart, end: timestampEnd, text };

  return null;
}

/**
 * Parse whisper.cpp JSON (`transcription[]`, `segments[]` or a bare array).
 * Offsets are milliseconds; timestamp strings and `start`/`end` seconds are
 * accepted for compatible tools.
 */
export function parseWhisperJson(raw: string): TranscriptionCue[] {
  let value: unknown;
  try {
    value = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Whisper 结果无法解析");
  }
  const record = value as Record<string, unknown> | null;
  const list = Array.isArray(value)
    ? value
    : Array.isArray(record?.transcription)
      ? record.transcription
      : Array.isArray(record?.segments)
        ? record.segments
        : null;
  if (!list) throw new Error("Whisper 结果无法解析");
  return list
    .map(cueFromSegment)
    .filter((cue): cue is TranscriptionCue => cue !== null)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Accept whisper JSON or its SRT fallback. Empty output yields no cues. */
export function parseWhisperOutput(raw: string): TranscriptionCue[] {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return parseWhisperJson(text);
    } catch {
      /* An SRT body may still start with a bracket in a malformed file. */
    }
  }
  return parseSubtitles(text)
    .map(({ start, end, text: body }) => ({
      start,
      end,
      text: cleanTranscript(body),
    }))
    .filter((cue) => cue.text && cue.end > cue.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function characterChunks(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxChars)
    chunks.push(text.slice(index, index + maxChars));
  return chunks;
}

function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  if (words.length > 1) {
    const chunks: string[] = [];
    let current = "";
    for (const word of words) {
      if (!current) current = word;
      else if (current.length + 1 + word.length <= maxChars)
        current += ` ${word}`;
      else {
        chunks.push(current);
        current = word;
      }
    }
    if (current) chunks.push(current);
    return chunks.flatMap((chunk) =>
      chunk.length <= maxChars ? [chunk] : characterChunks(chunk, maxChars),
    );
  }
  return characterChunks(text, maxChars);
}

function splitCue(
  cue: TranscriptionCue,
  maxDuration: number,
  maxChars: number,
): TranscriptionCue[] {
  if (cue.end - cue.start <= maxDuration && cue.text.length <= maxChars)
    return [cue];
  const parts = chunkText(cue.text, maxChars);
  const duration = cue.end - cue.start;
  if (parts.length <= 1) return [cue];
  const weights = parts.map((part) => Math.max(1, part.length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = cue.start;
  return parts
    .map((text, index) => {
      const isLast = index === parts.length - 1;
      const end = isLast
        ? cue.end
        : Math.min(cue.end, cursor + duration * (weights[index] / total));
      const part = { start: cursor, end, text };
      cursor = end;
      return part;
    })
    .filter((part) => part.end > part.start);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Turn recogniser cues into timeline subtitles. Cue times are divided by the
 * clip speed (the extracted audio is at source speed), shifted to the clip
 * position, clamped to the clip window, frame-aligned and made non-overlapping.
 */
export function buildSubtitleCues(
  input: TranscriptionCue[],
  options: SubtitleBuildOptions,
): Subtitle[] {
  const fps = clamp(finite(options.fps, 30), 1, 240);
  const speed = clamp(finite(options.speed, 1), 0.1, 8);
  const maxDuration = clamp(finite(options.maxDuration, 6), 0.5, 30);
  const maxChars = Math.round(clamp(finite(options.maxChars, 90), 10, 20_000));
  const maxCues = Math.round(clamp(finite(options.maxCues, 2_000), 1, 5_000));
  const offset = finite(options.offset, 0);
  const limit = Math.max(0, finite(options.limit, 0));
  const frame = 1 / fps;
  const result: Subtitle[] = [];

  for (const cue of [...input].sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (
      !Number.isFinite(cue.start) ||
      !Number.isFinite(cue.end) ||
      cue.start < 0 ||
      cue.end <= cue.start
    )
      continue;
    for (const part of splitCue(cue, maxDuration, maxChars)) {
      let start = offset + part.start / speed;
      let end = offset + part.end / speed;
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (end <= 0 || start >= limit) continue;
      start = Math.max(0, start);
      end = Math.min(limit, end);
      start = Math.floor(start * fps + 1e-9) / fps;
      end = Math.ceil(end * fps - 1e-9) / fps;
      if (end <= start) continue;
      if (end - start < frame) {
        if (start + frame <= limit) end = start + frame;
        else if (end - frame >= 0) start = end - frame;
        else continue;
      }
      const text = cleanTranscript(part.text);
      if (!text) continue;
      const previous = result[result.length - 1];
      if (previous) {
        if (
          previous.text === text &&
          start - previous.end <= 0.35 &&
          end - previous.start <= maxDuration
        ) {
          previous.end = Math.max(previous.end, end);
          continue;
        }
        if (start < previous.end) start = previous.end;
        if (end - start < frame) continue;
      }
      if (result.length >= maxCues)
        throw new Error(`自动字幕超过 ${maxCues} 条，请分段转写`);
      result.push({ start, end, text });
    }
  }
  return result;
}
