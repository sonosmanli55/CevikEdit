import { describe, expect, it } from "vitest";
import {
  buildSubtitleCues,
  cleanTranscript,
  parseWhisperJson,
  parseWhisperOutput,
} from "../src/core/transcription";

describe("whisper output parsing", () => {
  it("reads offset milliseconds and removes non-speech markers", () => {
    const raw = JSON.stringify({
      transcription: [
        { offsets: { from: 0, to: 2100 }, text: " Merhaba dünya " },
        { offsets: { from: 2100, to: 4000 }, text: " [Müzik] " },
        { offsets: { from: 4000, to: 6000 }, text: "(applause)" },
        {
          offsets: { from: 6000, to: 8000 },
          text: "İyi akşamlar [BLANK_AUDIO]",
        },
      ],
    });
    expect(parseWhisperJson(raw)).toEqual([
      { start: 0, end: 2.1, text: "Merhaba dünya" },
      { start: 6, end: 8, text: "İyi akşamlar" },
    ]);
  });

  it("falls back to timestamp strings and accepts segments or a bare array", () => {
    const timestamps = JSON.stringify({
      segments: [
        {
          timestamps: { from: "00:00:01,500", to: "00:00:03,250" },
          text: "İkinci cümle",
        },
      ],
    });
    expect(parseWhisperJson(timestamps)).toEqual([
      { start: 1.5, end: 3.25, text: "İkinci cümle" },
    ]);
    expect(
      parseWhisperJson(
        JSON.stringify([{ start: 2, end: 3.5, text: "Dizi biçimi" }]),
      ),
    ).toEqual([{ start: 2, end: 3.5, text: "Dizi biçimi" }]);
  });

  it("parses SRT fallback and keeps punctuation inside dialogue", () => {
    const srt =
      "1\n00:00:01,000 --> 00:00:02,500\nMerhaba (dünya)\n\n" +
      "2\n00:00:03,000 --> 00:00:04,000\n[Music]\n";
    expect(parseWhisperOutput(srt)).toEqual([
      { start: 1, end: 2.5, text: "Merhaba (dünya)" },
    ]);
  });

  it("reports malformed JSON instead of guessing", () => {
    expect(() => parseWhisperJson("{bad")).toThrow("çözümlenemedi");
    expect(parseWhisperOutput("   ")).toEqual([]);
  });

  it("drops punctuation-only and bracketed noise cues", () => {
    expect(cleanTranscript(" ♪ ... ♪ ")).toBe("");
    expect(cleanTranscript("(music)")).toBe("");
    expect(cleanTranscript("Merhaba (music) dünya")).toBe("Merhaba dünya");
  });
});

describe("subtitle timing", () => {
  it("splits long text into readable cues without losing the time window", () => {
    const cues = buildSubtitleCues(
      [
        {
          start: 0,
          end: 10,
          text: "bir iki üç dört beş altı yedi sekiz dokuz on on bir on iki",
        },
      ],
      { offset: 0, speed: 1, limit: 20, fps: 30, maxChars: 20, maxDuration: 6 },
    );
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[0].start).toBe(0);
    expect(cues.at(-1)!.end).toBe(10);
    for (let index = 1; index < cues.length; index += 1) {
      expect(cues[index].start).toBeGreaterThanOrEqual(cues[index - 1].end);
      expect(cues[index].text.length).toBeLessThanOrEqual(20);
    }
  });

  it("moves cues to the clip position, applies speed and clamps to the clip", () => {
    const cues = buildSubtitleCues(
      [
        { start: 0, end: 2, text: "hızlı" },
        { start: 2, end: 4, text: "kırpılan" },
      ],
      { offset: 10, speed: 2, limit: 11.5, fps: 30 },
    );
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(10);
    expect(cues[0].end).toBe(11);
    expect(cues[1].start).toBe(11);
    expect(cues[1].end).toBe(11.5);
  });

  it("drops cues outside the clip and frame-aligns boundaries", () => {
    const cues = buildSubtitleCues(
      [
        { start: 0, end: 1.01, text: "içeride" },
        { start: 7, end: 9, text: "dışarıda" },
      ],
      { offset: 0, speed: 1, limit: 5, fps: 30 },
    );
    expect(cues).toHaveLength(1);
    expect(cues[0].start).toBe(0);
    expect(cues[0].end).toBeCloseTo(Math.ceil(1.01 * 30) / 30, 8);
  });

  it("removes overlaps and merges immediate duplicate phrases", () => {
    const cues = buildSubtitleCues(
      [
        { start: 0, end: 2, text: "Merhaba" },
        { start: 1, end: 3, text: "dünya" },
        { start: 3.1, end: 4.1, text: "Merhaba" },
        { start: 4.2, end: 5.2, text: "Merhaba" },
      ],
      { offset: 0, speed: 1, limit: 10, fps: 30 },
    );
    expect(cues.map((cue) => cue.text)).toEqual(["Merhaba", "dünya", "Merhaba"]);
    expect(cues[1].start).toBe(2);
  });

  it("enforces the cue count limit", () => {
    const input = Array.from({ length: 5 }, (_, index) => ({
      start: index,
      end: index + 0.5,
      text: `cümle ${index}`,
    }));
    expect(() =>
      buildSubtitleCues(input, {
        offset: 0,
        speed: 1,
        limit: 10,
        fps: 30,
        maxCues: 3,
      }),
    ).toThrow("3 kaydı aşıyor");
  });

  it("gives every cue at least one frame", () => {
    const cues = buildSubtitleCues(
      [{ start: 1, end: 1.001, text: "kısa" }],
      { offset: 0, speed: 1, limit: 2, fps: 30 },
    );
    expect(cues).toHaveLength(1);
    expect(cues[0].end).toBeCloseTo(1 + 1 / 30, 8);
  });
});
