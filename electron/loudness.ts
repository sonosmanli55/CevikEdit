import path from "node:path";
import {
  parseLoudnormJson,
  type LoudnessMeasurement,
} from "../src/core/audioMix";
import type { LoudnessRequest } from "../src/core/types";
import { runMediaToolWithDiagnostics } from "./media";

/**
 * Validate the renderer request before touching the filesystem. The caller
 * must also confirm the path is an authorized local asset.
 */
export function validateLoudnessRequest(input: unknown): LoudnessRequest {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Ses düzeyi ölçüm isteği geçersiz");
  const raw = input as Record<string, unknown>;
  const source = raw.source;
  if (typeof source !== "string" || !path.isAbsolute(source) || source.length > 4096)
    throw new Error("Ses düzeyi ölçümü için yerel medyanın tam yolu gerekli");
  for (const [key, min, max] of [
    ["sourceIn", 0, 86400],
    ["duration", 1 / 1000, 86400],
    ["speed", 0.1, 8],
  ] as const) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
      throw new Error("Ses düzeyi ölçümünün zaman aralığı geçersiz");
  }
  return {
    source: path.resolve(source),
    sourceIn: raw.sourceIn as number,
    duration: raw.duration as number,
    speed: raw.speed as number,
  };
}

/**
 * Measure EBU R128 integrated loudness and true peak for the audible source
 * span of one clip. `loudnorm` prints its JSON summary to stderr, so the tool
 * runner keeps the bounded diagnostics tail instead of the (empty) stdout.
 */
export async function measureLoudness(
  request: LoudnessRequest,
): Promise<LoudnessMeasurement> {
  const span = Math.min(86400, request.duration * request.speed);
  const { diagnostics } = await runMediaToolWithDiagnostics(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-ss",
      request.sourceIn.toFixed(6),
      "-t",
      span.toFixed(6),
      "-i",
      request.source,
      "-vn",
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
      "-f",
      "null",
      "-",
    ],
    180_000,
  );
  return parseLoudnormJson(diagnostics);
}
