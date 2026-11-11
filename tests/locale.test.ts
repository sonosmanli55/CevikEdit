import { describe, expect, it } from "vitest";
import { resolveLocale } from "../electron/locale";
import { translateText } from "../src/i18n/translate";

describe("shipped Turkish locale", () => {
  it("uses Turkish in development and packaged builds unless the QA harness asks for Chinese", () => {
    expect(resolveLocale(false, {})).toBe("tr");
    expect(resolveLocale(true, {})).toBe("tr");
    expect(resolveLocale(true, { CEVIKEDIT_LOCALE: "tr" })).toBe("tr");
    expect(resolveLocale(true, { CEVIKEDIT_LOCALE: "zh" })).toBe("zh");
  });
  it("translates the audio-tools and subtitle labels that users see", () => {
    for (const [source, expected] of [
      ["Ses araçları", "Ses araçları"],
      ["音频", "Ses"],
      ["字幕", "Altyazı"],
      ["Ses düzeyini normalleştir", "Ses düzeyini normalleştir"],
      ["Müziği konuşma altında kıs", "Müziği konuşma altında kıs"],
    ]) {
      // Turkish strings pass through unchanged; Chinese source strings map to Turkish.
      if (/[\u4e00-\u9fff]/.test(source))
        expect(translateText(source)).toBe(expected);
      else expect(translateText(source)).toBe(source);
    }
  });
  it("keeps the new audio-tools messages translated instead of leaking the source language", () => {
    for (const source of [
      "所选音频片段不存在",
      "没有读取到响度测量结果",
      "应用响度增益后音量会超过 400%，请降低目标响度或先降低片段音量",
      "同一条片段不能同时作为语音和音乐",
      "所选音乐没有与语音区间重叠，未修改任何片段",
      "项目已变化，请重新检查音频修改后再应用",
      "响度测量需要本地素材的绝对路径",
    ]) {
      const translated = translateText(source);
      expect(translated).not.toBe(source);
      expect(translated).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });
  it("translates runtime-composed audio messages through the pattern list", () => {
    expect(translateText("片段“müzik”没有可用的音频")).toContain("kullanılabilir ses yok");
    expect(translateText("请至少选择一条konuşma片段")).toContain("En az bir");
    expect(translateText("每次最多处理 50 条müzik片段")).toContain("50");
    expect(translateText("语音片段不能重复")).toContain("yinelenemez");
    expect(translateText("目标响度须在 -40～0 之间")).toContain("arasında");
  });
});
