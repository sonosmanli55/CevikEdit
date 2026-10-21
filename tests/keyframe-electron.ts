/** Real desktop keyframe curve flow with generated local media and frame comparison. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { runMediaTool, probeFile } from "../electron/media";
import { formatTime } from "../src/core/model";
import type { Keyframe, Project } from "../src/core/types";

const root = process.cwd(),
  output = path.join(root, ".test-output", "keyframe-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const width = 160,
  height = 90,
  fps = 30,
  seconds = 3,
  source = path.join(output, "keyframe-source.png"),
  saved = path.join(output, "keyframe.reacut"),
  exported = path.join(output, "keyframe.mp4");

const image = createCanvas(width, height),
  context = image.getContext("2d");
context.fillStyle = "#0000ff";
context.fillRect(0, 0, width, height);
context.fillStyle = "#ff0000";
context.fillRect(0, 0, 40, 30);
context.fillStyle = "#00ff00";
context.fillRect(120, 60, 40, 30);
await writeFile(source, image.toBuffer("image/png"));

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

interface CanvasSnapshot {
  width: number;
  height: number;
  data: number[];
}

try {
  await app.evaluate(
    ({ dialog }, files) => {
      (dialog as any).showOpenDialog = async (...args: any[]) => {
        const options = args[args.length - 1];
        return {
          canceled: false,
          filePaths:
            options.title === "导入素材"
              ? [files.source]
              : options.title === "打开 ReaCut 项目"
                ? [files.saved]
                : [files.saved],
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
  page.on("crash", () => errors.push("renderer crashed"));
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".tl-ruler")).toBeVisible();

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
    return JSON.parse(await readFile(saved, "utf8"));
  };
  const blur = () =>
    page!.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
  const seekSeconds = async (time: number) => {
    await blur();
    await page!.keyboard.press("Home");
    const whole = Math.floor(time + 1e-6);
    for (let index = 0; index < whole; index += 1)
      await page!.keyboard.press("Shift+ArrowRight");
    const frames = Math.round((time - whole) * fps);
    for (let index = 0; index < frames; index += 1)
      await page!.keyboard.press("ArrowRight");
    await page!.waitForTimeout(80);
  };
  const row = (label: string, time: string) =>
    page!
      .locator(".keyframe-row")
      .filter({ hasText: label })
      .filter({ hasText: time })
      .first();
  const setKeyValue = async (label: string, time: string, value: number) => {
    await row(label, time).click();
    const input = page!
      .locator(".keyframe-detail")
      .getByLabel("精确关键帧数值", { exact: true });
    await input.fill(String(value));
    await input.blur();
  };
  const setEasing = async (
    label: string,
    time: string,
    easing: Keyframe["easing"],
  ) => {
    await row(label, time).click();
    await page!
      .locator(".keyframe-detail")
      .getByLabel("关键帧插值", { exact: true })
      .selectOption(easing);
  };
  const preview = async (): Promise<CanvasSnapshot> =>
    page!.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".player-panel canvas",
      )!;
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height);
      return {
        width: pixels.width,
        height: pixels.height,
        data: Array.from(pixels.data),
      };
    });

  await page.locator(".media-import").click();
  await expect(page.locator(".media-item")).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.locator(".media-item").dblclick();
  await expect(page.locator(".tl-clip")).toHaveCount(1);

  // Use a small deterministic canvas and a three second image clip.
  await page.keyboard.press("Escape");
  await page.getByRole("spinbutton", { name: "宽度", exact: true }).fill("160");
  await page.getByRole("spinbutton", { name: "高度", exact: true }).fill("90");
  await page.getByRole("spinbutton", { name: "高度", exact: true }).blur();
  await page.locator(".tl-clip").click();
  await page
    .getByRole("spinbutton", { name: "片段时长", exact: true })
    .fill("3");
  await page
    .getByRole("spinbutton", { name: "片段时长", exact: true })
    .blur();
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "动画", exact: true })
    .click();

  const add = (name: string) =>
    page!
      .locator(".keyframe-add")
      .getByRole("button", { name, exact: true })
      .click();
  await seekSeconds(0);
  await add("缩放");
  await add("位置 X");
  await add("透明度");
  await seekSeconds(2);
  await add("缩放");
  await add("位置 X");
  await add("透明度");
  await expect(page.locator(".keyframe-row")).toHaveCount(6);

  await setKeyValue("缩放", "00:00:02:00", 2);
  await setEasing("缩放", "00:00:02:00", "easeIn");
  await setKeyValue("位置 X", "00:00:02:00", 40);
  await setEasing("位置 X", "00:00:02:00", "easeOut");
  await setKeyValue("透明度", "00:00:02:00", 0.2);
  await setEasing("透明度", "00:00:02:00", "easeInOut");

  // Drag the scale point, then undo the single drag transaction.
  await row("缩放", "00:00:02:00").click();
  await expect(page.getByLabel("曲线属性", { exact: true })).toHaveValue(
    "scale",
  );
  const points = page.locator(".keyframe-point");
  await expect(points).toHaveCount(2);
  await points.nth(1).scrollIntoViewIfNeeded();
  const point = await points.nth(1).boundingBox();
  assert(point, "the second scale point must be visible");
  await points.nth(1).hover();
  await page.mouse.down();
  assert(
    await points.nth(1).evaluate((element) =>
      element.classList.contains("selected"),
    ),
    "pointer-down must select the curve point",
  );
  await page.mouse.move(point.x + point.width / 2 - 22, point.y + point.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const dragged = await saveProject();
  const draggedScale = dragged.clips[0].keyframes.find(
    (keyframe) =>
      keyframe.property === "scale" &&
      keyframe.time > 1.5 &&
      keyframe.time < 1.99,
  );
  assert(draggedScale, "the scale key must still exist after dragging");
  assert(
    Math.abs(draggedScale.time - 2) > 0.01,
    "dragging must change the keyframe time",
  );
  assert(
    Math.abs(draggedScale.value - 2) < 0.1,
    "a horizontal drag must keep the keyframe value close to 2",
  );
  await blur();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  const undone = await saveProject();
  const restoredScale = undone.clips[0].keyframes.find(
    (keyframe) => keyframe.property === "scale" && Math.abs(keyframe.time - 2) < 1e-6,
  );
  assert(restoredScale, "one undo must restore the drag transaction");
  await page.locator(".tl-clip").click();
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "动画", exact: true })
    .click();

  // Copy the x key at 2 s, paste it at 1 s and delete it again.
  await row("位置 X", "00:00:02:00").click();
  await page.getByLabel("复制关键帧", { exact: true }).click();
  await seekSeconds(1);
  await page.getByLabel("粘贴关键帧", { exact: true }).click();
  await expect(page.locator(".keyframe-row")).toHaveCount(7);
  await expect(row("位置 X", "00:00:01:00")).toHaveCount(1);
  await page
    .locator(".keyframe-detail")
    .getByLabel("删除关键帧", { exact: true })
    .click();
  await expect(page.locator(".keyframe-row")).toHaveCount(6);

  // Precise time input must move a key between real frames.
  await row("位置 X", "00:00:02:00").click();
  const exactTime = page
    .locator(".keyframe-detail")
    .getByLabel("精确关键帧时间", { exact: true });
  await exactTime.fill("1.9");
  await exactTime.blur();
  await expect(row("位置 X", "00:00:01:27")).toHaveCount(1);
  await row("位置 X", "00:00:01:27").click();
  await exactTime.fill("2");
  await exactTime.blur();
  await expect(row("位置 X", "00:00:02:00")).toHaveCount(1);

  const beforeReopen = await saveProject();
  const finalClip = beforeReopen.clips[0];
  assert.equal(finalClip.duration, seconds);
  assert.equal(finalClip.keyframes.length, 6);
  for (const [property, value, easing] of [
    ["scale", 2, "easeIn"],
    ["x", 40, "easeOut"],
    ["opacity", 0.2, "easeInOut"],
  ] as const) {
    const key = finalClip.keyframes.find(
      (keyframe) =>
        keyframe.property === property && Math.abs(keyframe.time - 2) < 1e-6,
    );
    assert(key, `${property} keyframe at 2 s must be saved`);
    assert.equal(key.value, value);
    assert.equal(key.easing, easing);
  }

  // Reopen the real saved file and verify the curves survive unchanged.
  await page.keyboard.press("Control+o");
  await expect(page.locator(".tl-clip")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".media-item")).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.locator(".project-title input")).toHaveValue(
    beforeReopen.name,
  );
  await page.waitForTimeout(500);
  await page.locator(".tl-clip").click();
  const animationTab = page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "动画", exact: true });
  await expect(animationTab).toBeVisible();
  await animationTab.click();
  await expect(page.locator(".keyframe-row")).toHaveCount(6);
  await expect(page.getByLabel("曲线属性", { exact: true })).toBeVisible();
  await page.getByLabel("曲线属性", { exact: true }).selectOption("scale");
  await expect(page.locator(".keyframe-point")).toHaveCount(2);
  const reopened = await saveProject();
  assert.deepEqual(reopened.clips[0].keyframes, finalClip.keyframes);

  // Capture every preview frame in sequence, then compare all of them with the
  // decoded export. Reading the canvas once per frame keeps the evidence
  // frame-aligned without repeatedly rewinding the player.
  const previews = new Map<number, CanvasSnapshot>();
  const previewTimes = new Map<number, string>();
  const checkedFrames = [3, 30, 57];
  await seekSeconds(0);
  await page.waitForTimeout(180);
  for (let frame = 0; frame < seconds * fps; frame += 1) {
    if (frame > 0) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(80);
    }
    previews.set(frame, await preview());
    if (checkedFrames.includes(frame))
      previewTimes.set(
        frame,
        await page.locator(".timecode strong").innerText(),
      );
  }

  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: "开始导出", exact: true }).click();
  await expect(page.getByText("导出完成", { exact: true })).toBeVisible({
    timeout: 90_000,
  });

  const probe = await probeFile(exported);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  assert(video, "export must contain a video stream");
  assert.equal(video.width, width);
  assert.equal(video.height, height);
  const raw = await runMediaTool("ffmpeg", [
    "-v",
    "error",
    "-i",
    exported,
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
  const frameSize = width * height * 3,
    frames: Buffer[] = [];
  for (let offset = 0; offset + frameSize <= raw.length; offset += frameSize)
    frames.push(raw.subarray(offset, offset + frameSize));
  assert(
    frames.length >= seconds * fps - 1,
    `exported ${frames.length} frames for ${seconds} seconds`,
  );

  const averageDifference = (snapshot: CanvasSnapshot, rendered: Buffer) => {
    let difference = 0,
      samples = 0;
    for (let gy = 0; gy < 18; gy += 1) {
      for (let gx = 0; gx < 32; gx += 1) {
        const px = Math.min(
            snapshot.width - 1,
            Math.floor(((gx + 0.5) / 32) * snapshot.width),
          ),
          py = Math.min(
            snapshot.height - 1,
            Math.floor(((gy + 0.5) / 18) * snapshot.height),
          ),
          ex = Math.floor(((gx + 0.5) / 32) * width),
          ey = Math.floor(((gy + 0.5) / 18) * height),
          previewIndex = (py * snapshot.width + px) * 4,
          exportIndex = (ey * width + ex) * 3;
        for (let channel = 0; channel < 3; channel += 1)
          difference += Math.abs(
            snapshot.data[previewIndex + channel] -
              rendered[exportIndex + channel],
          );
        samples += 3;
      }
    }
    return difference / samples;
  };
  const allDifferences: number[] = [];
  for (
    let frame = 0;
    frame < Math.min(frames.length, previews.size);
    frame += 1
  )
    allDifferences.push(averageDifference(previews.get(frame)!, frames[frame]));
  const maxDifference = Math.max(...allDifferences);
  const meanDifference =
    allDifferences.reduce((sum, value) => sum + value, 0) /
    allDifferences.length;
  const failed = allDifferences
    .map((difference, frame) => ({ frame, difference }))
    .filter((entry) => entry.difference >= 18);
  assert.equal(
    failed.length,
    0,
    `preview/export differences at ${failed
      .slice(0, 5)
      .map((entry) => `frame ${entry.frame}: ${entry.difference.toFixed(2)}`)
      .join(", ")}; maximum ${maxDifference.toFixed(2)}`,
  );

  const comparison: Array<{
    frame: number;
    time: string;
    difference: number;
    best: number;
    candidates: Array<{ frame: number; difference: number }>;
  }> = [];
  for (const frame of checkedFrames) {
    const snapshot = previews.get(frame)!;
    const time = previewTimes.get(frame)!;
    const differences = [frame - 1, frame, frame + 1]
      .filter((index) => index >= 0 && index < frames.length)
      .map((index) => ({
        frame: index,
        difference: averageDifference(snapshot, frames[index]),
      }));
    differences.sort((a, b) => a.difference - b.difference);
    const expected = differences.find((entry) => entry.frame === frame)!;
    comparison.push({
      frame,
      time,
      difference: expected.difference,
      best: differences[0].frame,
      candidates: differences,
    });
    assert.equal(time, formatTime(frame / fps, fps));
    assert(
      expected.difference < 18,
      `preview/export frame ${frame} differs by ${expected.difference.toFixed(2)}`,
    );
    assert(
      Math.abs(differences[0].frame - frame) <= 1,
      `preview frame ${frame} must align with a neighbouring export frame`,
    );
  }
  const centerBlue = (frame: Buffer) =>
    frame[((Math.floor(height / 2) * width) + Math.floor(width / 2)) * 3 + 2];
  assert(
    centerBlue(frames[3]) > 180,
    "the opening frame must show the blue image at full opacity",
  );
  assert(
    centerBlue(frames[57]) < 120,
    "the ending frame must show the lower opacity",
  );

  assert.deepEqual(errors, []);
  const evidence = {
    checks: [
      "curve selection and property switch",
      "draggable point with one-step undo",
      "copy, paste at playhead and delete",
      "precise time and value input",
      "ease-in, ease-out and ease-in-out persistence",
      "save and reopen preserves curves",
      "preview canvas matches exported frames",
    ],
    previewVsExport: comparison,
    allFrameDifference: {
      frames: allDifferences.length,
      maximum: maxDifference,
      mean: meanDifference,
      threshold: 18,
      differences: allDifferences,
    },
    exportedFrames: frames.length,
    keyframes: finalClip.keyframes,
    project: saved,
    video: exported,
  };
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: path.join(output, "failure.png") })
      .catch(() => {});
    console.error("Renderer errors:", errors);
    try {
      console.error(
        "Visible UI:",
        (await page.locator("body").innerText()).slice(-5000),
      );
    } catch {
      console.error("Visible UI unavailable: the page is already closed.");
    }
  }
  console.error("Keyframe test error:", error);
  throw error;
} finally {
  await app.close().catch(() => {});
}
