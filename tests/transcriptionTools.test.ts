import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  discoverWhisperModels,
  resolveWhisperExecutable,
  whisperStatus,
} from "../electron/transcription";

const platform = process.platform;
const tool = platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
let directory: string;
let bundled: string;
let system: string;
let selected: string;
let generic: string;

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "cevikedit-whisper-"));
  bundled = path.join(directory, "media-tools");
  system = path.join(directory, "system");
  selected = path.join(directory, "selected");
  generic = path.join(directory, "generic");
  for (const folder of [bundled, system, selected]) {
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, tool), "fake whisper");
    if (platform !== "win32") await chmod(path.join(folder, tool), 0o755);
  }
  await mkdir(generic, { recursive: true });
  const genericWhisper = path.join(
    generic,
    platform === "win32" ? "whisper.exe" : "whisper",
  );
  await writeFile(genericWhisper, "not whisper.cpp");
  if (platform !== "win32") await chmod(genericWhisper, 0o755);
  await mkdir(path.join(bundled, "whisper", "models"), { recursive: true });
  await writeFile(path.join(bundled, "whisper", "models", "ggml-base.bin"), "model");
  await writeFile(path.join(bundled, "whisper", "models", "notes.txt"), "ignore");
  await mkdir(path.join(directory, "user-data", "whisper-models"), {
    recursive: true,
  });
  await writeFile(
    path.join(directory, "user-data", "whisper-models", "ggml-small.bin"),
    "small",
  );
});
afterAll(() => rm(directory, { recursive: true, force: true }));

describe("whisper executable discovery", () => {
  it("prefers an explicitly selected executable", async () => {
    const executable = path.join(selected, tool);
    expect(
      await resolveWhisperExecutable({
        platform,
        env: { PATH: system, CEVIKEDIT_WHISPER: path.join(system, tool) },
        bundledDirectories: [bundled],
        savedExecutable: executable,
      }),
    ).toBe(executable);
  });

  it("uses the environment override before bundled tools", async () => {
    const executable = path.join(system, tool);
    expect(
      await resolveWhisperExecutable({
        platform,
        env: { PATH: "", CEVIKEDIT_WHISPER: executable },
        bundledDirectories: [bundled],
      }),
    ).toBe(executable);
  });

  it("finds bundled whisper.cpp and then PATH", async () => {
    expect(
      await resolveWhisperExecutable({
        platform,
        env: { PATH: system },
        bundledDirectories: [bundled],
      }),
    ).toBe(path.join(bundled, tool));
    expect(
      await resolveWhisperExecutable({
        platform,
        env: { PATH: system },
        bundledDirectories: [path.join(directory, "missing")],
      }),
    ).toBe(path.join(system, tool));
  });

  it("does not auto-select the generic whisper command from PATH", async () => {
    await expect(
      resolveWhisperExecutable({
        platform,
        env: { PATH: generic },
        bundledDirectories: [path.join(directory, "missing")],
      }),
    ).rejects.toThrow("找不到 Whisper");
  });

  it("reports invalid explicit paths and missing tools", async () => {
    await expect(
      resolveWhisperExecutable({
        platform,
        env: { PATH: system },
        savedExecutable: directory,
      }),
    ).rejects.toThrow("所选 Whisper");
    await expect(
      resolveWhisperExecutable({
        platform,
        env: { PATH: "" },
        bundledDirectories: [path.join(directory, "missing")],
      }),
    ).rejects.toThrow("找不到 Whisper");
  });
});

describe("whisper model discovery", () => {
  it("lists bundled, user and explicitly selected GGML models only", async () => {
    const selectedModel = path.join(directory, "elsewhere", "ggml-large.bin");
    await mkdir(path.dirname(selectedModel), { recursive: true });
    await writeFile(selectedModel, "large");
    const models = await discoverWhisperModels({
      platform,
      env: {},
      bundledDirectories: [bundled],
      userDataDirectory: path.join(directory, "user-data"),
      savedModel: selectedModel,
    });
    expect(models.map((model) => model.name)).toEqual([
      "ggml-base.bin",
      "ggml-large.bin",
      "ggml-small.bin",
    ]);
    expect(
      models.every((model) => model.path.endsWith(".bin") && model.size > 0),
    ).toBe(true);
  });

  it("keeps working when only the model is missing", async () => {
    const status = await whisperStatus({
      platform,
      env: { PATH: system },
      bundledDirectories: [path.join(directory, "missing")],
    });
    expect(status.available).toBe(true);
    expect(status.models).toEqual([]);
    expect(status.error).toBeUndefined();
  });
});
