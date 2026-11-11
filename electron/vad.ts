import path from "node:path";
import {
  DEFAULT_VAD,
  detectSpeech,
  frameEnergies,
  type SpeechInterval,
} from "../src/core/vad";
import type { SpeechAnalysisRequest, SpeechAnalysisResult } from "../src/core/types";
import { runMediaTool } from "./media";

/** Longest clip the detector decodes at once (16 kHz mono f32 ≈ 64 kB/s). */
const MAX_SECONDS = 900;

export function validateSpeechRequest(input: unknown): SpeechAnalysisRequest {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Konuşma algılama isteği geçersiz");
  const raw = input as Record<string, unknown>;
  const source = raw.source;
  if (typeof source !== "string" || !path.isAbsolute(source) || source.length > 4096)
    throw new Error("Konuşma algılama yerel medyanın tam yolunu gerektirir");
  for (const [key, min, max] of [
    ["sourceIn", 0, 86400],
    ["duration", 1 / 1000, 86400],
    ["speed", 0.1, 8],
  ] as const) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
      throw new Error("Konuşma algılama zaman aralığı geçersiz");
  }
  return {
    source: path.resolve(source),
    sourceIn: raw.sourceIn as number,
    duration: raw.duration as number,
    speed: raw.speed as number,
  };
}

/**
 * Decode the audible source span to 16 kHz mono float PCM and run the shared
 * detector. Nothing is written to disk and no audio leaves the machine.
 */
export async function analyzeSpeech(
  request: SpeechAnalysisRequest,
): Promise<SpeechAnalysisResult> {
  const span = Math.min(MAX_SECONDS, request.duration * request.speed);
  // Below one analysis window there is nothing meaningful to detect.
  if (span < 0.02) throw new Error("Konuşma algılama aralığı çok kısa");
  const bytes = await runMediaTool(
    "ffmpeg",
    [
      "-v", "error",
      "-ss", request.sourceIn.toFixed(6),
      "-t", span.toFixed(6),
      "-i", request.source,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-f", "f32le",
      "pipe:1",
    ],
    180_000,
    Math.min(64 * 1024 * 1024, 16000 * 4 * Math.ceil(span) + 65536),
  );
  const sampleRate = 16000;
  const samples = new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    Math.floor(bytes.length / 4),
  );
  const window = DEFAULT_VAD.window;
  const energies = frameEnergies(samples, sampleRate, window);
  if (!energies.length) throw new Error("Seçili aralıkta ses verisi okunamadı");
  const result = detectSpeech(energies, { window });
  const intervals: SpeechInterval[] = result.intervals.map((interval) => ({
    start: interval.start,
    end: Math.min(span, interval.end),
  }));
  return {
    intervals,
    noiseFloor: Number(result.noiseFloor.toFixed(1)),
    threshold: Number(result.threshold.toFixed(1)),
    speechSeconds: Number(result.speechSeconds.toFixed(3)),
    analyzedSeconds: span,
    sampleRate,
  };
}
