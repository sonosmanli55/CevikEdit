import { afterAll, beforeAll, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveMediaTool } from "../electron/mediaTools";

let directory: string, bundledDirectory: string, system: string;
const suffix = process.platform === "win32" ? ".exe" : "";
const tool = (name: "ffmpeg" | "ffprobe") => `${name}${suffix}`;
beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "cevikedit-tools-"));
  bundledDirectory = path.join(directory, "App with spaces.app", "media-tools");
  system = path.join(directory, "system");
  for (const folder of [bundledDirectory, system]) {
    await mkdir(folder, { recursive: true });
    for (const name of ["ffmpeg", "ffprobe"] as const) {
      const file = path.join(folder, tool(name));
      await writeFile(file, "#!/bin/sh\nexit 0\n");
      await chmod(file, 0o755);
    }
  }
});
afterAll(() => rm(directory, { recursive: true, force: true }));

it("uses both bundled tools even with a competing PATH", async () => {
  for (const name of ["ffmpeg", "ffprobe"] as const)
    expect(
      await resolveMediaTool(name, {
        platform: process.platform,
        bundledDirectory,
        env: { PATH: system },
      }),
    ).toBe(path.join(bundledDirectory, tool(name)));
});

it("keeps an explicit user override ahead of the bundled tool", async () => {
  const override = path.join(system, tool("ffmpeg"));
  expect(
    await resolveMediaTool("ffmpeg", {
      platform: process.platform,
      bundledDirectory,
      env: { CEVIKEDIT_FFMPEG: override },
    }),
  ).toBe(override);
});

it("falls back to a working system tool instead of failing on a damaged bundle", async () => {
  // A packaged app that shipped without media tools must still import media when
  // the user has FFmpeg installed; refusing to start was the reported bug.
  for (const name of ["ffmpeg", "ffprobe"] as const)
    expect(
      await resolveMediaTool(name, {
        platform: process.platform,
        bundledDirectory: path.join(directory, "missing"),
        env: { PATH: system },
      }),
    ).toBe(path.join(system, tool(name)));
});

it("accepts several bundled directories and keeps their order", async () => {
  const secondary = path.join(directory, "resources media-tools");
  await mkdir(secondary, { recursive: true });
  await writeFile(path.join(secondary, tool("ffprobe")), "#!/bin/sh\nexit 0\n");
  await chmod(path.join(secondary, tool("ffprobe")), 0o755);
  expect(
    await resolveMediaTool("ffprobe", {
      platform: process.platform,
      bundledDirectory: [path.join(directory, "missing"), secondary],
      env: { PATH: "" },
    }),
  ).toBe(path.join(secondary, tool("ffprobe")));
});

it("does not hide a stale explicit override with the bundled tool", async () => {
  await expect(
    resolveMediaTool("ffmpeg", {
      platform: process.platform,
      bundledDirectory,
      env: { CEVIKEDIT_FFMPEG: directory },
    }),
  ).rejects.toThrow("Seçili ffmpeg");
});

it("retains PATH discovery for source development", async () => {
  expect(
    await resolveMediaTool("ffmpeg", {
      platform: process.platform,
      env: { PATH: system },
    }),
  ).toBe(path.join(system, tool("ffmpeg")));
});

it("explains how to install FFmpeg when nothing is available", async () => {
  const empty = path.join(directory, "empty-home");
  await mkdir(empty, { recursive: true });
  await expect(
    resolveMediaTool("ffprobe", {
      platform: "linux",
      env: { PATH: "", HOME: empty },
    }),
  ).rejects.toThrow(/ffprobe bulunamadı/);
});
