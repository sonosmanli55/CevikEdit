/** Real desktop reverse + freeze flow with generated frame-numbered local media. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { runMediaTool, probeFile } from "../electron/media";
import type { Project } from "../src/core/types";

const root = process.cwd(),
  output = path.join(root, ".test-output", "clip-tools-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const width = 160,
  height = 90,
  fps = 10,
  seconds = 3,
  frames = fps * seconds,
  source = path.join(output, "reverse-source.mp4"),
  saved = path.join(output, "clip-tools.reacut"),
  exported = path.join(output, "clip-tools.mp4");
const frameDirectory = path.join(output, "frames");
await mkdir(frameDirectory, { recursive: true });

const color = (frame: number): [number, number, number] => [
  (frame * 37) % 256,
  (frame * 83 + 40) % 256,
  (frame * 131 + 90) % 256,
];
for (let frame = 0; frame < frames; frame += 1) {
  const canvas = createCanvas(width, height),
    context = canvas.getContext("2d");
  context.fillStyle = `rgb(${color(frame).join(",")})`;
  context.fillRect(0, 0, width, height);
  await writeFile(
    path.join(frameDirectory, `frame-${String(frame).padStart(3, "0")}.png`),
    canvas.toBuffer("image/png"),
  );
}
await runMediaTool("ffmpeg", [
  "-v",
  "error",
  "-y",
  "-framerate",
  String(fps),
  "-i",
  path.join(frameDirectory, "frame-%03d.png"),
  "-f",
  "lavfi",
  "-i",
  `sine=frequency=440:sample_rate=48000:duration=${seconds}`,
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

const sourceHash = createHash("sha256").update(await readFile(source)).digest("hex");

const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
env.REACUT_USER_DATA = path.join(output, "user-data");
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const app = await electron.launch({
  args: [path.join(root, "dist-electron", "main.cjs")],
  env,
  timeout: 30_000,
});
let page: Page | undefined;
const errors: string[] = [];
const readProject = async (): Promise<Project> =>
  JSON.parse(await readFile(saved, "utf8"));
const saveProject = async (): Promise<Project> => {
  const before = await stat(saved)
    .then((value) => value.mtimeMs)
    .catch(() => -1);
  await page!.getByRole("button", { name: "保存项目", exact: true }).click();
  await expect
    .poll(
      () =>
        stat(saved)
          .then((value) => value.mtimeMs)
          .catch(() => -1),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(before);
  return readProject();
};
const rawFrames = async (file: string): Promise<Buffer[]> => {
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
  const size = width * height * 3,
    result: Buffer[] = [];
  for (let offset = 0; offset + size <= raw.length; offset += size)
    result.push(raw.subarray(offset, offset + size));
  return result;
};
const center = (frame: Buffer): [number, number, number] => {
  const offset = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 3;
  return [frame[offset], frame[offset + 1], frame[offset + 2]];
};
const nearestFrame = (pixel: [number, number, number]): number => {
  let best = -1,
    distance = Infinity;
  for (let index = 0; index < frames; index += 1) {
    const expected = color(index),
      next =
        Math.abs(pixel[0] - expected[0]) +
        Math.abs(pixel[1] - expected[1]) +
        Math.abs(pixel[2] - expected[2]);
    if (next < distance) {
      distance = next;
      best = index;
    }
  }
  return best;
};

try {
  await app.evaluate(
    ({ dialog }, files) => {
      (dialog as any).showOpenDialog = async (...args: any[]) => {
        const options = args[args.length - 1];
        return {
          canceled: false,
          filePaths:
            options.title === "导入素材" ? [files.source] : [files.saved],
        };
      };
      (dialog as any).showSaveDialog = async (...args: any[]) => ({
        canceled: false,
        filePath:
          args[args.length - 1].title === "导出视频"
            ? files.exported
            : files.saved,
      });
      (dialog as any).showMessageBox = async () => ({
        response: 2,
        checkboxChecked: false,
      });
    },
    { source, saved, exported },
  );
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".tl-ruler")).toBeVisible();

  await page.locator(".media-import").click();
  await expect(page.locator(".media-item")).toHaveCount(1, { timeout: 30_000 });
  await page.locator(".media-item").dblclick();
  await expect(page.locator(".tl-clip")).toHaveCount(1);

  // Keep the export small and deterministic.
  await page.keyboard.press("Escape");
  await page.getByRole("spinbutton", { name: "宽度", exact: true }).fill("160");
  await page.getByRole("spinbutton", { name: "高度", exact: true }).fill("90");
  await page.getByRole("spinbutton", { name: "高度", exact: true }).blur();
  await page.locator(".tl-clip").click();
  await page.getByRole("button", { name: "速度", exact: true }).click();
  await page.getByRole("button", { name: "倒放片段", exact: true }).click();
  await expect(page.getByText("片段已倒放，原素材仍保留在媒体库。", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator(".media-item")).toHaveCount(2, { timeout: 30_000 });

  // The player must decode the derived file, not just the export path.
  await page.locator(".tl-clip").click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 16; index += 1)
    await page.keyboard.press("ArrowRight");
  const previewTargets = [23, 24, 25].map(color);
  await expect
    .poll(
      async () =>
        page!.evaluate(
          (targets) => {
            const canvas = document.querySelector<HTMLCanvasElement>(
              ".player-panel canvas",
            )!;
            const pixel = canvas
              .getContext("2d")!
              .getImageData(
                Math.floor(canvas.width / 2),
                Math.floor(canvas.height / 2),
                1,
                1,
              ).data;
            return targets.some((expected) =>
              [0, 1, 2].every(
                (index) => Math.abs(pixel[index] - expected[index]) <= 45,
              ),
            );
          },
          previewTargets,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);

  let project = await saveProject();
  const originalAsset = project.assets.find((asset) => asset.path === source)!;
  const reversedAsset = project.assets.find(
    (asset) => asset.path !== source && asset.kind === "video",
  )!;
  assert(originalAsset, "the original source asset must remain in the project");
  assert(reversedAsset, "the reversed cache asset must be added");
  assert.equal(project.clips[0].assetId, reversedAsset.id);
  assert.equal(project.clips[0].sourceIn, 0);
  assert.equal(project.clips[0].duration, seconds);
  assert(
    reversedAsset.path.includes("reverse-media"),
    "reversed media must live in the managed cache",
  );

  // Undo restores the original asset, redo returns to the reversed asset.
  await page.locator(".tl-clip").click();
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await saveProject()).clips[0].assetId, { timeout: 10_000 })
    .toBe(originalAsset.id);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(async () => (await saveProject()).clips[0].assetId, { timeout: 10_000 })
    .toBe(reversedAsset.id);

  // Freeze the frame at 1.0 s for one second.
  await page.locator(".tl-clip").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "速度", exact: true }).click();
  await page.getByRole("spinbutton", { name: "定格时长", exact: true }).fill("1");
  await page.getByRole("spinbutton", { name: "定格时长", exact: true }).blur();
  await page.getByRole("button", { name: "定格当前帧", exact: true }).click();
  await expect(
    page.getByText("已生成定格画面，可在画面属性中调整持续时长。", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".tl-clip")).toHaveCount(2, { timeout: 30_000 });
  await expect(
    page.getByRole("spinbutton", { name: "片段时长", exact: true }),
  ).toHaveValue("1");

  project = await saveProject();
  const freezeAsset = project.assets.find((asset) => asset.kind === "image")!;
  const freezeClip = project.clips.find((clip) => clip.assetId === freezeAsset.id)!;
  assert(freezeAsset, "the freeze image must be added");
  assert(freezeClip, "the freeze clip must be added");
  assert.equal(freezeClip.start, 1);
  assert.equal(freezeClip.duration, 1);
  assert.equal(freezeClip.speed, 1);
  assert(
    freezeAsset.path.includes("freeze-frames"),
    "freeze frame must live in the managed cache",
  );
  assert(
    project.tracks.filter((track) => track.name === "定格画面").length === 1,
    "freeze frames use one dedicated lane",
  );
  assert.equal(
    project.tracks.filter((track) => track.kind === "text").length,
    1,
    "text lane must still exist",
  );

  // Reopen the saved project, then export it through the real UI.
  await page.keyboard.press("Control+o");
  await expect(page.locator(".tl-clip.is-selected")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.locator(".media-item")).toHaveCount(3, { timeout: 30_000 });

  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: "开始导出", exact: true }).click();
  await expect(page.getByText("导出完成", { exact: true })).toBeVisible({
    timeout: 90_000,
  });

  const probe = await probeFile(exported);
  assert(
    probe.streams.some((stream) => stream.codec_type === "video"),
    "export must have a video stream",
  );
  assert(
    probe.streams.some((stream) => stream.codec_type === "audio"),
    "reversed audio must survive export",
  );
  const rendered = await rawFrames(exported);
  assert(
    rendered.length >= 88,
    `exported frame count ${rendered.length} should cover three seconds`,
  );
  const at = (time: number) => nearestFrame(center(rendered[Math.round(time * 30)]));
  assert(
    Math.abs(at(0.5) - 24) <= 1,
    `reverse start should show the tail frame, got ${at(0.5)}`,
  );
  assert(
    Math.abs(at(2.5) - 4) <= 1,
    `reverse end should show the head frame, got ${at(2.5)}`,
  );
  const frozen = [at(1.25), at(1.5), at(1.75)];
  assert(
    frozen.every((value) => Math.abs(value - 19) <= 1),
    `freeze range must stay on one frame, got ${frozen.join(",")}`,
  );
  assert.equal(new Set(frozen).size, 1);
  assert(
    Math.abs(at(2.25) - 7) <= 1,
    `video must resume after the freeze, got ${at(2.25)}`,
  );

  assert.equal(
    createHash("sha256").update(await readFile(source)).digest("hex"),
    sourceHash,
    "the original source file must never be overwritten",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      checks: [
        "reverse cache asset and original source coexist",
        "reversed clip decodes in the player",
        "undo/redo restore the asset",
        "freeze image lane and duration",
        "reopen keeps derived assets",
        "export frame order and freeze hold",
        "original source unchanged",
      ],
      exportedFrames: rendered.length,
      reversedAsset: reversedAsset.path,
      freezeAsset: freezeAsset.path,
    }),
  );
} finally {
  await app.close().catch(() => {});
}
