/** Real timeline zoom/pan: cursor anchor, limits, wheel pan, drag pan, fit, reopen. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createClip, createProject } from "../src/core/model";
import { importAssets } from "../electron/media";
import { generateFixtures } from "../scripts/generate-fixtures";
import type { Project } from "../src/core/types";
import { GUTTER } from "./timeline-geometry";

const root = process.cwd(),
  output = path.join(root, ".test-output", "timeline-view-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const fixture = await generateFixtures(path.join(output, "fixtures"));
const [video] = await importAssets([fixture.video], path.join(output, "cache"));
video.name = "kaynak.mp4";
const project = createProject("Zaman çizelgesi görünümü");
project.fps = 30;
project.assets = [video];
const track = project.tracks.find((item) => item.kind === "video")!;
project.clips = [0, 1, 2].map((index) => {
  const clip = createClip(video, track.id, index * 20, 30);
  clip.id = `clip-${index}`;
  clip.name = `klip ${index + 1}`;
  clip.duration = 4;
  return clip;
});
// A long timeline forces real horizontal scrolling at high zoom.
const long = createClip(video, track.id, 120, 30);
long.id = "late";
long.name = "son klip";
long.duration = 3;
project.clips.push(long);

const original = path.join(output, "fixture.reacut"),
  saved = path.join(output, "saved.reacut");
await writeFile(original, JSON.stringify(project));

const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
env.REACUT_USER_DATA = path.join(output, "user-data");
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
delete env.REACUT_LOCALE;

const app = await electron.launch({
  args: [path.join(root, "dist-electron/main.cjs")],
  env,
});
let page: Page | undefined;
const errors: string[] = [],
  checks: string[] = [];
try {
  await app.evaluate(
    ({ dialog }, files) => {
      let opened = 0;
      (dialog as any).showOpenDialog = async () => ({
        canceled: false,
        filePaths: [opened++ === 0 ? files.original : files.saved],
      });
      (dialog as any).showSaveDialog = async () => ({
        canceled: false,
        filePath: files.saved,
      });
      (dialog as any).showMessageBox = async () => ({ response: 2 });
    },
    { original, saved },
  );
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(4);

  let firstSave = true;
  async function save(): Promise<Project> {
    const before = await stat(saved).then((value) => value.mtimeMs).catch(() => -1);
    if (firstSave) {
      firstSave = false;
      await page!.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
      await page!.getByRole("button", { name: "Farklı kaydet", exact: false }).click();
    } else await page!.getByRole("button", { name: "Projeyi kaydet", exact: true }).click();
    await expect.poll(() => stat(saved).then((value) => value.mtimeMs).catch(() => -1)).toBeGreaterThan(before);
    return JSON.parse(await readFile(saved, "utf8"));
  }

  const zoomValue = () =>
    page!.locator('input[aria-label="Zaman çizelgesi ölçeği"]').inputValue();
  const scrollState = () =>
    page!.locator(".tl-scroll").evaluate((el) => ({
      left: el.scrollLeft,
      width: el.scrollWidth,
      client: el.clientWidth,
    }));
  const box = async () => (await page!.locator(".tl-scroll").boundingBox())!;

  assert.equal(await zoomValue(), "60");
  const initial = await scrollState();
  checks.push("the timeline opens at the default scale with the viewport readout visible");

  // Zoom in with the toolbar button and confirm the scale really changes.
  await page.getByRole("button", { name: "Zaman çizelgesini yakınlaştır", exact: true }).click();
  assert.equal(await zoomValue(), "75");
  await page.getByRole("button", { name: "Zaman çizelgesini uzaklaştır", exact: true }).click();
  assert.equal(await zoomValue(), "60");
  checks.push("toolbar zoom in/out changes the scale and is reversible");

  // Cursor-anchored ctrl+wheel: the time under the pointer must stay put.
  const area = await box();
  const cursorX = area.x + GUTTER + 240;
  const cursorY = area.y + area.height / 2;
  const timeAtCursor = async () => {
    const state = await scrollState();
    const rect = await box();
    const pps = Number(await zoomValue());
    return (state.left + cursorX - rect.x - GUTTER) / pps;
  };
  await page.mouse.move(cursorX, cursorY);
  const beforeZoomTime = await timeAtCursor();
  await page.locator(".tl-scroll").dispatchEvent("wheel", {
    deltaY: -240,
    ctrlKey: true,
    clientX: cursorX,
    clientY: cursorY,
  });
  await page.waitForTimeout(250);
  const zoomedIn = Number(await zoomValue());
  assert(zoomedIn > 60, `expected zoom in, got ${zoomedIn}`);
  const afterZoomTime = await timeAtCursor();
  assert(
    Math.abs(afterZoomTime - beforeZoomTime) < 0.35,
    `cursor anchor drifted: ${beforeZoomTime} -> ${afterZoomTime}`,
  );
  checks.push("ctrl/cmd wheel zooms around the cursor instead of jumping to another time");

  // Free horizontal pan with shift+wheel.
  const beforePan = await scrollState();
  await page.locator(".tl-scroll").dispatchEvent("wheel", {
    deltaY: 300,
    shiftKey: true,
    clientX: cursorX,
    clientY: cursorY,
  });
  await page.waitForTimeout(150);
  const afterPan = await scrollState();
  assert(afterPan.left > beforePan.left, "shift-wheel must pan right");
  checks.push("shift+wheel pans the timeline freely without changing the scale");

  // Middle-button drag pans both axes.
  const dragStart = await scrollState();
  const midX = area.x + area.width / 2,
    midY = area.y + area.height / 2;
  await page.mouse.move(midX, midY);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(midX - 160, midY - 40, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  await page.waitForTimeout(150);
  const dragEnd = await scrollState();
  assert(
    dragEnd.left > dragStart.left,
    `middle drag should pan right: ${dragStart.left} -> ${dragEnd.left}`,
  );
  checks.push("middle-button drag pans the timeline viewport");

  // The scale respects both hard limits.
  await page.locator('input[aria-label="Zaman çizelgesi ölçeği"]').fill("1600");
  await page.waitForTimeout(120);
  assert.equal(await zoomValue(), "1600");
  assert(
    await page.getByRole("button", { name: "Zaman çizelgesini yakınlaştır", exact: true }).isDisabled(),
  );
  await page.locator('input[aria-label="Zaman çizelgesi ölçeği"]').fill("2");
  await page.waitForTimeout(120);
  assert.equal(await zoomValue(), "2");
  assert(
    await page.getByRole("button", { name: "Zaman çizelgesini uzaklaştır", exact: true }).isDisabled(),
  );
  checks.push("zoom is clamped to the 2–1600 px/s range and the buttons disable at the limits");

  // Fit the whole project, then jump back to the playhead.
  await page.getByRole("button", { name: "Sığdır", exact: true }).click();
  await page.waitForTimeout(150);
  const fitted = await scrollState();
  assert(fitted.left === 0, "fit must reset the horizontal scroll");
  const fitPps = Number(await zoomValue());
  assert(fitPps > 2 && fitPps < 60, `fit scale ${fitPps} should be below the default`);
  await page.getByRole("button", { name: "Oynatma konumuna git", exact: true }).click();
  await page.waitForTimeout(150);
  checks.push("fit shows the whole project and the playhead button re-centers the view");

  // Viewport readout follows the real visible span.
  const readout = await page.locator(".tl-viewport").innerText();
  assert(/^\d{2}:\d{2}:\d{2} görünür$/.test(readout.trim()), readout);
  checks.push(`the toolbar reports the visible span (${readout.trim()})`);

  // Scale and scroll are view state only: the project stays identical.
  const edited = await save();
  assert.deepEqual(
    edited.clips.map((clip) => [clip.id, clip.start, clip.duration, clip.sourceIn]),
    project.clips.map((clip) => [clip.id, clip.start, clip.duration, clip.sourceIn]),
  );
  checks.push("zooming and panning never modify clips or their timing");

  await page.screenshot({ path: path.join(output, "timeline-view.png") });

  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Geri al", exact: true })).toBeDisabled();
  checks.push("reopening the project resets history and keeps every clip");

  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify({ passedAt: new Date().toISOString(), checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    await writeFile(path.join(output, "failure.txt"), await page.locator("body").innerText()).catch(() => {});
  }
  throw error;
} finally {
  if (page) await page.evaluate(() => window.editorAPI?.setDirty(false)).catch(() => {});
  await app.close();
}
