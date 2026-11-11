import { describe, expect, it } from "vitest";
import {
  DEFAULT_VAD,
  detectSpeech,
  frameEnergies,
  mapIntervalsToTimeline,
} from "../src/core/vad";
import { prepareDucking } from "../src/core/audioMix";
import {
  clone,
  createClip,
  createProject,
  createTrack,
  evaluateKeyframes,
  validateProject,
} from "../src/core/model";
import type { MediaAsset, Project } from "../src/core/types";

const VOICE: MediaAsset = {
  id: "asset-voice",
  name: "konuşma.wav",
  path: "C:\\media\\voice.wav",
  url: "cevikedit-media://asset?path=voice",
  kind: "audio",
  duration: 30,
  width: 0,
  height: 0,
  fps: 0,
  hasAudio: true,
};
const MUSIC: MediaAsset = { ...VOICE, id: "asset-music", name: "müzik.wav", path: "C:\\media\\music.wav" };

/** Build an energy trace: silence floor + loud bursts. */
function trace(length: number, bursts: Array<[number, number]>, floor = -70, loud = -18) {
  const values = Array.from({ length }, () => floor);
  for (const [start, end] of bursts)
    for (let index = start; index < Math.min(length, end); index += 1) values[index] = loud;
  return values;
}

function fixture(): Project {
  const project = createProject("VAD");
  project.fps = 30;
  project.assets = [clone(VOICE), clone(MUSIC)];
  const voiceTrack = createTrack("audio", "Konuşma");
  const musicTrack = createTrack("audio", "Müzik");
  project.tracks.push(voiceTrack, musicTrack);
  const voice = createClip(VOICE, voiceTrack.id, 2, 30);
  voice.id = "voice";
  voice.duration = 8;
  const music = createClip(MUSIC, musicTrack.id, 0, 30);
  music.id = "music";
  music.duration = 12;
  music.volume = 0.8;
  project.clips = [voice, music];
  return validateProject(project);
}

describe("offline speech detection", () => {
  it("finds bursts and keeps every interval away from the noise floor", () => {
    // 20 ms windows: speech at 1–2 s, 2.4–3 s and 5–6 s.
    const energies = trace(400, [
      [50, 100],
      [120, 150],
      [250, 300],
    ]);
    const result = detectSpeech(energies, { window: 0.02 });
    expect(result.noiseFloor).toBeCloseTo(-70, 6);
    expect(result.intervals).toHaveLength(3);
    expect(result.intervals[0].start).toBeCloseTo(1, 2);
    expect(result.intervals[0].end).toBeCloseTo(2, 2);
    expect(result.intervals[2].start).toBeCloseTo(5, 2);
    expect(result.speechSeconds).toBeCloseTo(2.6, 2);
  });
  it("bridges short pauses but keeps real silence between sentences", () => {
    // A 100 ms pause is inside one sentence; a 1 s pause separates two.
    const energies = trace(500, [
      [50, 200],
      [205, 300],
      [350, 400],
    ]);
    const result = detectSpeech(energies, { window: 0.02, minimumGap: 0.35 });
    expect(result.intervals).toHaveLength(2);
    expect(result.intervals[0].start).toBeCloseTo(1, 2);
    expect(result.intervals[0].end).toBeCloseTo(6, 2);
    expect(result.intervals[1].start).toBeCloseTo(7, 2);
  });
  it("ignores clicks shorter than the minimum speech duration", () => {
    const energies = trace(300, [[50, 53], [100, 160]]);
    const result = detectSpeech(energies, { window: 0.02, minimumSpeech: 0.25 });
    expect(result.intervals).toHaveLength(1);
    expect(result.intervals[0].start).toBeCloseTo(2, 2);
  });
  it("never reports speech in a constant noise floor, however loud", () => {
    const hiss = Array.from({ length: 300 }, (_, index) => -22 + (index % 3));
    const result = detectSpeech(hiss, { window: 0.02 });
    expect(result.intervals).toEqual([]);
    expect(result.speechSeconds).toBe(0);
  });
  it("scales the threshold with the measured noise floor", () => {
    const energies = trace(400, [[100, 200]], -45, -30);
    const result = detectSpeech(energies, { window: 0.02, thresholdDb: 8 });
    // Noise −45 dB, speech −30 dB → 15 dB lift, above the 8 dB gate.
    expect(result.threshold).toBeCloseTo(-37, 6);
    expect(result.intervals).toHaveLength(1);
    const quiet = trace(400, [[100, 200]], -45, -36);
    expect(detectSpeech(quiet, { window: 0.02, thresholdDb: 8 }).intervals).toEqual([]);
  });
  it("handles empty and malformed option input safely", () => {
    expect(detectSpeech([]).intervals).toEqual([]);
    const result = detectSpeech(trace(80, [[10, 40]]), {
      window: Number.NaN,
      thresholdDb: Number.NaN,
    });
    expect(Number.isFinite(result.threshold)).toBe(true);
    expect(DEFAULT_VAD.window).toBeCloseTo(0.02, 6);
  });
  it("frames float samples at the requested window", () => {
    const rate = 1000;
    const samples = new Float32Array(rate); // 1 s
    for (let index = 250; index < 500; index += 1) samples[index] = 0.5;
    const energies = frameEnergies(samples, rate, 0.05);
    expect(energies).toHaveLength(20);
    expect(energies[0]).toBe(-120);
    // A half-amplitude square wave has RMS 0.5 → about −6 dBFS.
    expect(energies[7]).toBeCloseTo(20 * Math.log10(0.5), 3);
    expect(frameEnergies(samples, 0, 0.02)).toEqual([]);
  });
  it("maps source intervals to the timeline through speed and trim", () => {
    const mapped = mapIntervalsToTimeline(
      [
        { start: 1, end: 2 },
        { start: 5, end: 6 },
      ],
      { start: 10, duration: 4, sourceIn: 2, speed: 2 },
    );
    // Source 1 s is before the clip's in-point, 5–6 s maps to 11.5–12 s.
    expect(mapped).toHaveLength(1);
    expect(mapped[0].start).toBeCloseTo(11.5, 6);
    expect(mapped[0].end).toBeCloseTo(12, 6);
    expect(mapIntervalsToTimeline([], { start: 0, duration: 1, sourceIn: 0, speed: 1 })).toEqual([]);
    expect(
      mapIntervalsToTimeline([{ start: 0, end: 2 }], {
        start: 5,
        duration: 1,
        sourceIn: 0,
        speed: 1,
      })[0],
    ).toMatchObject({ start: 5, end: 6 });
  });
});

describe("ducking from detected speech", () => {
  it("ducks only inside detected intervals instead of the whole clip", () => {
    const project = fixture();
    const plan = prepareDucking(project, ["voice"], ["music"], {
      amountDb: -12,
      fade: 0.3,
      ranges: { voice: [{ start: 3, end: 4.5 }, { start: 7, end: 8 }] },
    });
    const music = plan.project.clips.find((clip) => clip.id === "music")!;
    const keys = music.keyframes
      .filter((key) => key.property === "volume")
      .sort((a, b) => a.time - b.time);
    expect(keys[0]).toMatchObject({ time: 0, value: 0.8 });
    // Silence at 5 s stays at full level; speech at 3.7 s is attenuated.
    expect(evaluateKeyframes(music, 5).volume).toBeCloseTo(0.8, 10);
    expect(evaluateKeyframes(music, 3.7).volume).toBeCloseTo(0.8 * 10 ** (-12 / 20), 10);
    expect(evaluateKeyframes(music, 7.5).volume).toBeCloseTo(0.8 * 10 ** (-12 / 20), 10);
    expect(evaluateKeyframes(music, 1).volume).toBeCloseTo(0.8, 10);
  });
  it("clamps detected ranges to the clip and ignores empty lists", () => {
    const project = fixture();
    const plan = prepareDucking(project, ["voice"], ["music"], {
      amountDb: -9,
      fade: 0.2,
      ranges: { voice: [{ start: 0, end: 2.5 }, { start: 8.5, end: 9.5 }] },
    });
    const music = plan.project.clips.find((clip) => clip.id === "music")!;
    const ducked = 0.8 * 10 ** (-9 / 20);
    expect(evaluateKeyframes(music, 2).volume).toBeCloseTo(ducked, 10);
    expect(evaluateKeyframes(music, 5).volume).toBeCloseTo(0.8, 10);
    expect(evaluateKeyframes(music, 9).volume).toBeCloseTo(ducked, 10);
  });
  it("rejects ranges for clips that are not selected, invalid spans or no speech", () => {
    const project = fixture();
    expect(() =>
      prepareDucking(project, ["voice"], ["music"], {
        amountDb: -12,
        fade: 0.3,
        ranges: { music: [{ start: 0, end: 1 }] },
      }),
    ).toThrow("seçili olmayan");
    expect(() =>
      prepareDucking(project, ["voice"], ["music"], {
        amountDb: -12,
        fade: 0.3,
        ranges: { voice: [{ start: 3, end: 3 }] },
      }),
    ).toThrow("geçersiz");
    expect(() =>
      prepareDucking(project, ["voice"], ["music"], {
        amountDb: -12,
        fade: 0.3,
        ranges: { voice: [] },
      }),
    ).toThrow("konuşma aralığı yok");
  });
  it("keeps the old whole-clip behaviour when no ranges are supplied", () => {
    const project = fixture();
    const plan = prepareDucking(project, ["voice"], ["music"], {
      amountDb: -12,
      fade: 0.3,
    });
    const music = plan.project.clips.find((clip) => clip.id === "music")!;
    expect(evaluateKeyframes(music, 5).volume).toBeCloseTo(0.8 * 10 ** (-12 / 20), 10);
  });
});
