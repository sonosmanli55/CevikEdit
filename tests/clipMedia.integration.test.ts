import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  cancelReverseClip,
  extractFreezeFrame,
  reverseClipMedia,
} from "../electron/clipMedia";
import { importAssets, probeFile, runMediaTool } from "../electron/media";

const width = 64,
  height = 64,
  frameBytes = width * height * 3;
let directory: string,
  source: string,
  reversed: string,
  freeze: string,
  cancelSource: string,
  cancelled: string,
  progress: number[];

async function rawFrames(file: string): Promise<Buffer[]> {
  const raw = await runMediaTool("ffmpeg", [
    "-v",
    "error",
    "-i",
    file,
    "-map",
    "0:v:0",
    "-fps_mode",
    "passthrough",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  const frames: Buffer[] = [];
  for (let offset = 0; offset + frameBytes <= raw.length; offset += frameBytes)
    frames.push(raw.subarray(offset, offset + frameBytes));
  return frames;
}

function nearest(sourceFrames: Buffer[], frame: Buffer): number {
  let best = -1,
    bestDifference = Infinity;
  sourceFrames.forEach((candidate, index) => {
    let difference = 0;
    for (let offset = 0; offset < frameBytes; offset += 97)
      difference += Math.abs(candidate[offset] - frame[offset]);
    if (difference < bestDifference) {
      bestDifference = difference;
      best = index;
    }
  });
  return best;
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "cevikedit-clip-media-"));
  source = path.join(directory, "source.mp4");
  reversed = path.join(directory, "reversed.mp4");
  freeze = path.join(directory, "freeze.png");
  cancelSource = path.join(directory, "cancel-source.mp4");
  cancelled = path.join(directory, "cancelled.mp4");
  await runMediaTool("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=64x64:rate=10:duration=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-g",
    "5",
    "-c:a",
    "aac",
    "-shortest",
    source,
  ]);
  await runMediaTool("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1280x720:rate=30:duration=6",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    cancelSource,
  ]);
  progress = [];
  await reverseClipMedia({
    jobId: randomUUID(),
    source,
    sourceIn: 0.5,
    duration: 1,
    destination: reversed,
    onProgress: (value, status) => {
      if (status === "rendering") progress.push(value);
    },
  });
}, 120_000);

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("reverseClipMedia", () => {
  it("renders the exact source range in reverse frame order", async () => {
    const original = await rawFrames(source),
      output = await rawFrames(reversed);
    expect(output.length).toBeGreaterThanOrEqual(9);
    expect(output.length).toBeLessThanOrEqual(11);

    const indices = output.map((frame) => nearest(original, frame));
    expect(indices[0]).toBeGreaterThanOrEqual(13);
    expect(indices[indices.length - 1]).toBeLessThanOrEqual(6);
    for (let index = 1; index < indices.length; index += 1)
      expect(indices[index]).toBeLessThanOrEqual(indices[index - 1]);

    const probe = await probeFile(reversed);
    expect(probe.streams.some((stream) => stream.codec_type === "video")).toBe(
      true,
    );
    expect(probe.streams.some((stream) => stream.codec_type === "audio")).toBe(
      true,
    );
    expect(Number(probe.format.duration)).toBeGreaterThan(0.9);
    expect(Number(probe.format.duration)).toBeLessThan(1.1);
    expect(progress.length).toBeGreaterThan(0);
    expect(Math.max(...progress)).toBeGreaterThan(90);
  });

  it("cancels an active FFmpeg render and removes its temporary output", async () => {
    const jobId = randomUUID();
    let started!: () => void;
    const rendering = new Promise<void>((resolve) => {
      started = resolve;
    });
    const job = reverseClipMedia({
      jobId,
      source: cancelSource,
      sourceIn: 0,
      duration: 6,
      destination: cancelled,
      onProgress: (_value, status) => {
        if (status === "rendering") started();
      },
    });
    await rendering;
    await new Promise((resolve) => setTimeout(resolve, 100));
    await cancelReverseClip(jobId);
    await expect(job).rejects.toThrow("Ters oynatma iptal edildi");
    await expect(access(cancelled)).rejects.toThrow();
  }, 30_000);

  it("never overwrites the source and can be imported as a normal asset", async () => {
    const before = await readFile(source),
      assets = await importAssets([reversed], path.join(directory, "cache")),
      after = await readFile(source);
    expect(after.equals(before)).toBe(true);
    expect(assets[0].kind).toBe("video");
    expect(assets[0].duration).toBeGreaterThan(0.9);
  });
});

describe("extractFreezeFrame", () => {
  it("writes a reusable image at the requested source frame", async () => {
    await extractFreezeFrame(source, 0.75, freeze);
    const original = await rawFrames(source),
      image = await runMediaTool("ffmpeg", [
        "-v",
        "error",
        "-i",
        freeze,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ]),
      nearestFrame = nearest(original, image);
    expect(Math.abs(nearestFrame - 7)).toBeLessThanOrEqual(1);

    const assets = await importAssets([freeze], path.join(directory, "cache"));
    expect(assets[0].kind).toBe("image");
    expect(assets[0].width).toBe(width);
    expect(assets[0].height).toBe(height);
    expect(assets[0].duration).toBe(0);
  });
});
