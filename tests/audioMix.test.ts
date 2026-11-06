import { beforeEach, describe, expect, it } from "vitest";
import {
  applyAudioEdit,
  normalizationGainDb,
  parseLoudnormJson,
  prepareAudioNormalization,
  prepareDucking,
} from "../src/core/audioMix";
import {
  clone,
  createClip,
  createProject,
  createTrack,
  evaluateKeyframes,
  id,
  validateProject,
} from "../src/core/model";
import { useEditorStore } from "../src/editor/store";
import type { MediaAsset, Project } from "../src/core/types";

const TONE: MediaAsset = {
  id: "asset-tone",
  name: "müzik",
  path: "C:\\media\\tone.wav",
  url: "reacut-media://asset?path=tone",
  kind: "audio",
  duration: 30,
  width: 0,
  height: 0,
  fps: 0,
  hasAudio: true,
};
const VOICE: MediaAsset = {
  ...TONE,
  id: "asset-voice",
  name: "konuşma",
  path: "C:\\media\\voice.wav",
};
const VIDEO: MediaAsset = {
  ...TONE,
  id: "asset-video",
  name: "görüntü",
  path: "C:\\media\\video.mp4",
  kind: "video",
  duration: 30,
  width: 640,
  height: 360,
  fps: 30,
};

function fixture(): Project {
  const project = createProject("Ses karıştırma");
  project.fps = 30;
  project.assets = [clone(TONE), clone(VOICE), clone(VIDEO)];
  const audioTrack = createTrack("audio", "Müzik");
  const voiceTrack = createTrack("audio", "Konuşma");
  const videoTrack = createTrack("video", "Görüntü");
  project.tracks.push(audioTrack, voiceTrack, videoTrack);
  const music = createClip(TONE, audioTrack.id, 0, 30);
  music.id = "music";
  music.duration = 6;
  music.volume = 0.8;
  const voice = createClip(VOICE, voiceTrack.id, 2, 30);
  voice.id = "voice";
  voice.duration = 1.5;
  const video = createClip(VIDEO, videoTrack.id, 4, 30);
  video.id = "video";
  video.duration = 2;
  project.clips.push(music, voice, video);
  return validateProject(project);
}

beforeEach(() => useEditorStore.getState().setProject(createProject()));

describe("loudness measurement and normalization", () => {
  const summary = (values: Record<string, string>) => `
[Parsed_loudnorm_0 @ 0000]
{
	"input_i" : "${values.input_i}",
	"input_tp" : "${values.input_tp}",
	"input_lra" : "${values.input_lra ?? "7.20"}",
	"input_thresh" : "-31.15",
	"output_i" : "-15.96",
	"target_offset" : "0.04"
}
`;
  it("parses the loudnorm summary even when other stderr text surrounds it", () => {
    const measurement = parseLoudnormJson(
      `ffmpeg version 8.0\n${summary({ input_i: "-23.40", input_tp: "-5.20" })}[out#0/null] video:0kB\n`,
    );
    expect(measurement.inputI).toBeCloseTo(-23.4, 6);
    expect(measurement.inputTp).toBeCloseTo(-5.2, 6);
    expect(measurement.inputLra).toBeCloseTo(7.2, 6);
  });
  it("accepts infinite values from silent media and rejects missing summaries", () => {
    const silent = parseLoudnormJson(
      summary({ input_i: "-inf", input_tp: "-inf", input_lra: "0.00" }),
    );
    expect(silent.inputI).toBe(Number.NEGATIVE_INFINITY);
    expect(silent.inputTp).toBe(Number.NEGATIVE_INFINITY);
    expect(() => parseLoudnormJson("no json here")).toThrow("响度");
    expect(() =>
      parseLoudnormJson(summary({ input_i: "abc", input_tp: "-1" })),
    ).toThrow("响度");
  });
  it("computes target gain and clamps it so the measured true peak stays under the ceiling", () => {
    expect(
      normalizationGainDb({ inputI: -24, inputTp: -12, inputLra: 5 }, -16),
    ).toBeCloseTo(8, 6);
    // 8 dB would push a -8 dBTP peak over the -1 dBTP ceiling.
    expect(
      normalizationGainDb({ inputI: -24, inputTp: -8, inputLra: 5 }, -16),
    ).toBeCloseTo(7, 6);
    expect(
      normalizationGainDb({ inputI: -30, inputTp: -2, inputLra: 5 }, -14),
    ).toBeCloseTo(1, 6);
    expect(
      normalizationGainDb({ inputI: -60, inputTp: -50, inputLra: 5 }, 0),
    ).toBe(30);
    expect(() =>
      normalizationGainDb(
        { inputI: Number.NEGATIVE_INFINITY, inputTp: -1, inputLra: 0 },
        -16,
      ),
    ).toThrow("安静");
    expect(() =>
      normalizationGainDb({ inputI: -20, inputTp: -1, inputLra: 0 }, -50),
    ).toThrow("目标响度");
  });
  it("scales the clip level and every existing volume key without touching other keys", () => {
    const project = fixture();
    const music = project.clips.find((c) => c.id === "music")!;
    music.keyframes = [
      { id: id(), time: 0, property: "volume", value: 0.5, easing: "linear" },
      { id: id(), time: 3, property: "volume", value: 1, easing: "linear" },
      { id: id(), time: 1, property: "opacity", value: 1, easing: "linear" },
    ];
    const plan = prepareAudioNormalization(
      project,
      "music",
      { inputI: -24, inputTp: -10, inputLra: 3 },
      -18,
    );
    const factor = 10 ** (6 / 20);
    const result = plan.project.clips.find((c) => c.id === "music")!;
    expect(result.volume).toBeCloseTo(0.8 * factor, 10);
    expect(
      result.keyframes
        .filter((k) => k.property === "volume")
        .map((k) => k.value),
    ).toEqual([0.5 * factor, 1 * factor]);
    expect(
      result.keyframes.find((k) => k.property === "opacity")?.value,
    ).toBe(1);
    expect(plan.changedIds).toEqual(["music"]);
    expect(project.clips.find((c) => c.id === "music")!.volume).toBe(0.8);
  });
  it("refuses locked, silent or over-amplified targets and stale plans", () => {
    const project = fixture();
    project.tracks.find((t) => t.name === "Müzik")!.locked = true;
    expect(() =>
      prepareAudioNormalization(
        project,
        "music",
        { inputI: -20, inputTp: -5, inputLra: 1 },
        -16,
      ),
    ).toThrow("锁定");
    const fresh = fixture();
    const text = createClip(undefined, fresh.tracks[0].id, 0, 30);
    fresh.clips.push(text);
    expect(() =>
      prepareAudioNormalization(
        fresh,
        text.id,
        { inputI: -20, inputTp: -5, inputLra: 1 },
        -16,
      ),
    ).toThrow("音频");
    const loud = fixture();
    loud.clips.find((c) => c.id === "music")!.volume = 3;
    expect(() =>
      prepareAudioNormalization(
        loud,
        "music",
        { inputI: -40, inputTp: -20, inputLra: 1 },
        -2,
      ),
    ).toThrow("400%");
    const stable = fixture();
    const plan = prepareAudioNormalization(
      stable,
      "music",
      { inputI: -24, inputTp: -9, inputLra: 1 },
      -16,
    );
    expect(() => applyAudioEdit({ ...stable, name: "başka" }, plan)).toThrow(
      "已变化",
    );
    expect(() => applyAudioEdit(stable, plan)).not.toThrow();
    expect(plan.changedIds).toEqual(["music"]);
  });
});

describe("automatic music ducking", () => {
  it("writes a base key at zero, ducks only inside speech and releases after it", () => {
    const project = fixture();
    const plan = prepareDucking(project, ["voice"], ["music"], {
      amountDb: -12,
      fade: 0.5,
    });
    const music = plan.project.clips.find((c) => c.id === "music")!;
    const keys = music.keyframes
      .filter((k) => k.property === "volume")
      .sort((a, b) => a.time - b.time);
    expect(keys.map((k) => k.time)).toEqual([0, 1.5, 2, 3.5, 4]);
    expect(keys[0].value).toBeCloseTo(0.8, 10);
    expect(keys[1].value).toBeCloseTo(0.8, 10);
    expect(keys[2].value).toBeCloseTo(0.8 * 10 ** (-12 / 20), 10);
    expect(keys[3].value).toBeCloseTo(0.8 * 10 ** (-12 / 20), 10);
    expect(keys[4].value).toBeCloseTo(0.8, 10);
    expect(evaluateKeyframes(music, 0).volume).toBeCloseTo(0.8, 10);
    expect(evaluateKeyframes(music, 2.75).volume).toBeCloseTo(
      0.8 * 10 ** (-12 / 20),
      10,
    );
    expect(evaluateKeyframes(music, 5.5).volume).toBeCloseTo(0.8, 10);
    expect(plan.changedIds).toEqual(["music"]);
    expect(
      plan.project.clips.find((c) => c.id === "voice")!.keyframes,
    ).toEqual([]);
  });
  it("merges speech clips closer than two fades and clips the envelope to the music", () => {
    const project = fixture();
    const voice = project.clips.find((c) => c.id === "voice")!;
    voice.duration = 1;
    const second = createClip(VOICE, voice.trackId, 3.4, 30);
    second.id = "voice-2";
    second.duration = 1;
    project.clips.push(second);
    const music = project.clips.find((c) => c.id === "music")!;
    music.start = 1;
    music.duration = 5;
    const plan = prepareDucking(project, ["voice", "voice-2"], ["music"], {
      amountDb: -6,
      fade: 0.4,
    });
    const result = plan.project.clips.find((c) => c.id === "music")!;
    const keys = result.keyframes
      .filter((k) => k.property === "volume")
      .sort((a, b) => a.time - b.time);
    expect(keys.map((k) => k.time)).toEqual([0, 0.6, 1, 3.4, 3.8]);
    expect(keys[0].value).toBeCloseTo(0.8, 10);
    expect(evaluateKeyframes(result, 0.5).volume).toBeCloseTo(0.8, 10);
    expect(evaluateKeyframes(result, 2.5).volume).toBeCloseTo(
      0.8 * 10 ** (-6 / 20),
      10,
    );
    expect(evaluateKeyframes(result, 4.5).volume).toBeCloseTo(0.8, 10);
  });
  it("uses a video clip with audio as speech and replaces only old volume keys", () => {
    const project = fixture();
    const music = project.clips.find((c) => c.id === "music")!;
    music.keyframes = [
      { id: id(), time: 0, property: "volume", value: 0.2, easing: "linear" },
      { id: id(), time: 1, property: "x", value: 12, easing: "linear" },
    ];
    const plan = prepareDucking(project, ["video"], ["music"], {
      amountDb: -20,
      fade: 0,
    });
    const result = plan.project.clips.find((c) => c.id === "music")!;
    expect(result.keyframes.some((k) => k.property === "x")).toBe(true);
    expect(
      result.keyframes
        .filter((k) => k.property === "volume")
        .map((k) => Number(k.time.toFixed(4))),
    ).toEqual([0, 3.9667, 4, 6]);
    expect(evaluateKeyframes(result, 5).volume).toBeCloseTo(0.08, 10);
    expect(evaluateKeyframes(result, 3).volume).toBeCloseTo(0.8, 10);
  });
  it("rejects overlaps, locked music, missing audio and non-overlapping ranges", () => {
    const project = fixture();
    expect(() =>
      prepareDucking(project, ["voice"], ["voice"], {
        amountDb: -12,
        fade: 0.3,
      }),
    ).toThrow("同时");
    expect(() =>
      prepareDucking(project, ["voice"], ["music"], {
        amountDb: 4,
        fade: 0.3,
      }),
    ).toThrow();
    expect(() =>
      prepareDucking(project, ["voice"], ["music"], {
        amountDb: -12,
        fade: 9,
      }),
    ).toThrow();
    expect(() =>
      prepareDucking(project, [], ["music"], { amountDb: -12, fade: 0.3 }),
    ).toThrow("语音");
    expect(() =>
      prepareDucking(project, ["voice", "voice"], ["music"], {
        amountDb: -12,
        fade: 0.3,
      }),
    ).toThrow("重复");
    const far = fixture();
    far.clips.find((c) => c.id === "voice")!.start = 20;
    expect(() =>
      prepareDucking(far, ["voice"], ["music"], {
        amountDb: -12,
        fade: 0.3,
      }),
    ).toThrow("重叠");
    const locked = fixture();
    locked.tracks.find((t) => t.name === "Müzik")!.locked = true;
    expect(() =>
      prepareDucking(locked, ["voice"], ["music"], {
        amountDb: -12,
        fade: 0.3,
      }),
    ).toThrow("锁定");
    const silent = fixture();
    silent.assets.find((a) => a.id === "asset-voice")!.hasAudio = false;
    expect(() =>
      prepareDucking(silent, ["voice"], ["music"], {
        amountDb: -12,
        fade: 0.3,
      }),
    ).toThrow("音频");
  });
  it("commits one undo step and restores the previous music envelope", () => {
    const project = fixture();
    useEditorStore.getState().setProject(project);
    const before = clone(project);
    const plan = prepareDucking(project, ["voice"], ["music"], {
      amountDb: -15,
      fade: 0.25,
    });
    useEditorStore
      .getState()
      .commit(applyAudioEdit(useEditorStore.getState().project, plan));
    expect(
      useEditorStore
        .getState()
        .project.clips.find((c) => c.id === "music")!.keyframes.length,
    ).toBeGreaterThan(0);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(before);
  });
});
