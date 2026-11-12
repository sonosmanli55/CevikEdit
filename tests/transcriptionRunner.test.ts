import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cancelTranscription,
  transcribeAudio,
} from "../electron/transcription";
import type { TranscriptionStage } from "../src/core/types";

const unixOnly = process.platform !== "win32";
let directory: string;
let ffmpeg: string;
let whisper: string;
let slowWhisper: string;
let model: string;
let userData: string;
let previousFfmpeg: string | undefined;

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "cevikedit-whisper-run-"));
  ffmpeg = path.join(directory, "ffmpeg");
  whisper = path.join(directory, "whisper-cli");
  slowWhisper = path.join(directory, "whisper-slow");
  model = path.join(directory, "ggml-base.bin");
  userData = path.join(directory, "user-data");
  await writeFile(ffmpeg, "#!/bin/sh\nexit 0\n");
  await writeFile(
    whisper,
    [
      "#!/bin/sh",
      'prefix=""',
      'previous=""',
      'for argument in "$@"; do',
      '  if [ "$previous" = "-of" ]; then prefix="$argument"; fi',
      '  previous="$argument"',
      "done",
      'cat > "${prefix}.json" <<\'JSON\'',
      '{"transcription":[{"offsets":{"from":0,"to":1800},"text":" Merhaba dünya"},{"offsets":{"from":1800,"to":3000},"text":" [Müzik] "}]}',
      "JSON",
      'echo "progress = 100%"',
      "exit 0",
      "",
    ].join("\n"),
  );
  await writeFile(slowWhisper, "#!/bin/sh\nsleep 5\nexit 0\n");
  await writeFile(model, "model");
  await chmod(ffmpeg, 0o755);
  await chmod(whisper, 0o755);
  await chmod(slowWhisper, 0o755);
  previousFfmpeg = process.env.CEVIKEDIT_FFMPEG;
  process.env.CEVIKEDIT_FFMPEG = ffmpeg;
});
afterAll(async () => {
  if (previousFfmpeg === undefined) delete process.env.CEVIKEDIT_FFMPEG;
  else process.env.CEVIKEDIT_FFMPEG = previousFfmpeg;
  await rm(directory, { recursive: true, force: true });
});

describe.skipIf(!unixOnly)("local whisper runner", () => {
  it("runs ffmpeg and whisper, then returns timeline subtitles", async () => {
    const jobId = crypto.randomUUID();
    const stages: TranscriptionStage[] = [];
    const result = await transcribeAudio(
      {
        jobId,
        source: path.join(directory, "source.mp4"),
        sourceIn: 2,
        start: 10,
        duration: 4,
        speed: 2,
        fps: 30,
        language: "tr",
        model,
      },
      {
        savedExecutable: whisper,
        userDataDirectory: userData,
        onProgress: (_progress, stage) => stages.push(stage),
      },
    );
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0].start).toBe(10);
    expect(result.cues[0].end).toBeCloseTo(10.9, 1);
    expect(result.cues[0].text).toBe("Merhaba dünya");
    expect(new Set(stages)).toEqual(
      new Set(["preparing", "extracting", "transcribing", "parsing", "complete"]),
    );
    await expect(
      access(path.join(userData, "transcription", jobId)),
    ).rejects.toThrow();
  });

  it("cancels a running recogniser and cleans its temporary files", async () => {
    const jobId = crypto.randomUUID();
    const pending = transcribeAudio(
      {
        jobId,
        source: path.join(directory, "source.mp4"),
        sourceIn: 0,
        start: 0,
        duration: 4,
        speed: 1,
        fps: 30,
        language: "auto",
        model,
      },
      { savedExecutable: slowWhisper, userDataDirectory: userData },
    );
    const outcome = expect(pending).rejects.toThrow("İptal");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await cancelTranscription(jobId);
    await outcome;
    await expect(
      access(path.join(userData, "transcription", jobId)),
    ).rejects.toThrow();
  });
});
