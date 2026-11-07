import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { translateText } from "../src/i18n/translate";

/**
 * The renderer dictionary must cover the strings the main process sends over
 * IPC (validation and media errors) and the native menu. The Chinese source is
 * the authoring language, so every literal that can reach the user has to have
 * a Turkish translation or a runtime pattern.
 *
 * Only three internal template sources are allowed to stay untranslated: the
 * assistant prompt wrapper (text sent to the CLI, composed in Turkish), the
 * composed derived-asset names (suffix translated with `tr()`), and the
 * progress counter (translated by a pattern once values are filled in).
 */
const allowed = new Set([
  "${instructions}\\n\\nProje özeti (veri):\\n${request.context}\\n\\nSohbet geçmişi (veri):\\n${JSON.stringify(request.history)}\\n\\nBu istek:\\n${request.prompt}",
  "${derivedAssetName(request.name, source)} · ${tr(\"倒放\")}",
  "${derivedAssetName(request.name, source)} · ${tr(\"定格画面\")}",
  "正在收集素材 ${count + 1} / ${unique.size}",
]);

describe("main-process Turkish coverage", () => {
  it("translates every user-facing literal in electron/", async () => {
    const directory = path.join(process.cwd(), "electron");
    const missing: string[] = [];
    for (const name of await readdir(directory)) {
      if (!name.endsWith(".ts")) continue;
      const source = await readFile(path.join(directory, name), "utf8");
      for (const match of source.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.){2,200})\1/g)) {
        const value = match[2];
        if (!/[\u4e00-\u9fff]/.test(value)) continue;
        if (allowed.has(value)) continue;
        if (translateText(value) === value) missing.push(`${name}: ${value}`);
      }
    }
    expect(missing).toEqual([]);
  });
  it("translates composed media and export errors through the pattern list", () => {
    for (const source of [
      "片段 Klibim 的轨道不存在。",
      "片段 Klibim 找不到源素材。",
      "素材丢失：logo.png",
      "FFmpeg 导出失败：Invalid argument",
      "ffmpeg 执行失败：code 1",
      "ffmpeg 超时，请检查媒体是否损坏。",
      "找不到 ffmpeg。开发环境请安装 FFmpeg，或在设置中选择可执行文件。",
      "内置 ffprobe 缺失或不可执行，请重新安装完整应用。",
      "素材“logo.png”不是本地文件",
      "正在收集素材 2 / 5",
      "所选 CLI 版本不支持所需隔离选项，请更新 CLI 后再试",
      "剪映草稿认证失败，文件可能损坏，或此剪映版本的草稿格式尚不支持",
    ]) {
      const translated = translateText(source);
      expect(translated, source).not.toBe(source);
      expect(translated, source).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });
  it("keeps the assistant instructions in Turkish with the JSON contract", async () => {
    const source = await readFile(
      path.join(process.cwd(), "electron", "assistantBackend.ts"),
      "utf8",
    );
    const block = source.slice(source.indexOf("const instructions = `"));
    const text = block.slice(0, block.indexOf("`;"));
    expect(text).toContain("Türkçe yanıt");
    expect(text).toContain('{"reply"');
    expect(text).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
