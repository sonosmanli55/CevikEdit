import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeSpeech, validateSpeechRequest } from "../electron/vad";
import { runMediaTool } from "../electron/media";
import { prepareDucking } from "../src/core/audioMix";
import { mapIntervalsToTimeline } from "../src/core/vad";
import {
  createClip,
  createProject,
  createTrack,
  evaluateKeyframes,
  validateProject,
} from "../src/core/model";
import type { MediaAsset } from "../src/core/types";

/**
 * Real decoder + detector: a synthetic file with three speech-like bursts
 * separated by silence, analysed through FFmpeg exactly like the desktop app.
 */
let directory: string;
let file: string;
/** Bursts in seconds: 1–2, 3–4.2 and 6–7. */
const BURSTS: Array<[number, number]> = [
  [1, 2],
  [3, 4.2],
  [6, 7],
];

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "reacut-vad-"));
  file = path.join(directory, "konusma.wav");
  const burst =
    "aevalsrc=0.35*(0.6*sin(2*PI*180*t)+0.4*sin(2*PI*360*t))*(0.7+0.3*sin(2*PI*7*t)):s=16000:d=DURATION";
  const silence = (duration: number) =>
    `aevalsrc=0:s=16000:d=${duration}`;
  // Label every generated source so concat references labels, not input indexes.
  const exact = [
    `${silence(1)}[s0]`,
    `${burst.replace("DURATION", "1")}[b0]`,
    `${silence(1)}[s1]`,
    `${burst.replace("DURATION", "1.2")}[b1]`,
    `${silence(1.8)}[s2]`,
    `${burst.replace("DURATION", "1")}[b2]`,
    `${silence(1)}[s3]`,
  ].join(";") + ";[s0][b0][s1][b1][s2][b2][s3]concat=n=7:v=0:a=1[out]";
  await runMediaTool("ffmpeg", [
    "-v", "error", "-y",
    "-filter_complex", exact,
    "-map", "[out]",
    "-c:a", "pcm_s16le",
    file,
  ]);
}, 120_000);

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("real speech detection and ducking", () => {
  it("detects the three bursts from decoded PCM", async () => {
    const result = await analyzeSpeech({
      source: file,
      sourceIn: 0,
      duration: 8,
      speed: 1,
    });
    expect(result.analyzedSeconds).toBeCloseTo(8, 1);
    expect(result.sampleRate).toBe(16000);
    expect(result.intervals.length).toBeGreaterThanOrEqual(3);
    // Each burst is found within 150 ms of its true boundaries.
    for (const [start, end] of BURSTS) {
      const hit = result.intervals.find(
        (interval) =>
          Math.abs(interval.start - start) < 0.16 &&
          Math.abs(interval.end - end) < 0.16,
      );
      expect(hit, `burst ${start}-${end} in ${JSON.stringify(result.intervals)}`).toBeTruthy();
    }
    expect(result.speechSeconds).toBeGreaterThan(2.5);
    expect(result.speechSeconds).toBeLessThan(4);
    expect(result.noiseFloor).toBeLessThan(-60);
  }, 120_000);
  it("ignores a silent span and rejects invalid requests", async () => {
    const silent = await analyzeSpeech({
      source: file,
      sourceIn: 1.2,
      duration: 0.6,
      speed: 1,
    });
    expect(silent.intervals).toEqual([]);
    expect(() => validateSpeechRequest({ source: "göreli.wav", sourceIn: 0, duration: 1, speed: 1 })).toThrow(
      "tam yolunu",
    );
    expect(() =>
      validateSpeechRequest({ source: file, sourceIn: -1, duration: 1, speed: 1 }),
    ).toThrow("zaman aralığı");
    await expect(
      analyzeSpeech({ source: file, sourceIn: 0, duration: 0.0001, speed: 1 }),
    ).rejects.toThrow("çok kısa");
  }, 120_000);
  it("ducks music only while the detected speech plays, in the real mix", async () => {
    const asset: MediaAsset = {
      id: "asset-voice",
      name: "konuşma.wav",
      path: file,
      url: "reacut-media://asset?path=voice",
      kind: "audio",
      duration: 8,
      width: 0,
      height: 0,
      fps: 0,
      hasAudio: true,
    };
    const musicAsset: MediaAsset = {
      ...asset,
      id: "asset-music",
      name: "müzik.wav",
      path: file,
    };
    const project = createProject("VAD ducking");
    project.fps = 30;
    project.assets = [asset, musicAsset];
    const voiceTrack = createTrack("audio", "Konuşma");
    const musicTrack = createTrack("audio", "Müzik");
    project.tracks.push(voiceTrack, musicTrack);
    const voice = createClip(asset, voiceTrack.id, 0, 30);
    voice.id = "voice";
    voice.duration = 8;
    const music = createClip(musicAsset, musicTrack.id, 0, 30);
    music.id = "music";
    music.duration = 8;
    music.volume = 0.9;
    project.clips = [voice, music];
    validateProject(project);
    const analysis = await analyzeSpeech({
      source: file,
      sourceIn: 0,
      duration: 8,
      speed: 1,
    });
    const ranges = mapIntervalsToTimeline(analysis.intervals, voice);
    const plan = prepareDucking(project, ["voice"], ["music"], {
      amountDb: -14,
      fade: 0.2,
      ranges: { voice: ranges },
    });
    const ducked = plan.project.clips.find((clip) => clip.id === "music")!;
    const attenuated = 0.9 * 10 ** (-14 / 20);
    // Inside first speech burst, fully ducked.
    expect(evaluateKeyframes(ducked, 1.5).volume).toBeCloseTo(attenuated, 6);
    // In the 2.2–3 s silence the music is back to full level.
    expect(evaluateKeyframes(ducked, 2.6).volume).toBeCloseTo(0.9, 6);
    // Inside the last burst again ducked.
    expect(evaluateKeyframes(ducked, 6.5).volume).toBeCloseTo(attenuated, 6);
    const keys = ducked.keyframes.filter((key) => key.property === "volume");
    // One base key, plus two keys per interval (down and up).
    expect(keys.length).toBeGreaterThanOrEqual(ranges.length * 2);
    expect(keys.length).toBeLessThanOrEqual(40);
  }, 180_000);
});
