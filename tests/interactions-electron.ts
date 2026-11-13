/**
 * Real desktop coverage for the editor interactions added in 0.10.0:
 * preview corner scaling, creative presets dragged onto the timeline,
 * multi-select batch add, the square media add button, and ruler drag zoom.
 */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { generateFixtures } from "../scripts/generate-fixtures";
import { importAssets } from "../electron/media";
import { createClip, createProject, createTrack } from "../src/core/model";
import type { Project } from "../src/core/types";

const root = process.cwd();
const output = path.join(root, ".test-output", "interactions-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const fixtures = await generateFixtures(path.join(output, "media"));
const assets = await importAssets(
  [fixtures.video, fixtures.audio],
  path.join(output, "fixture-cache"),
);

const project = createProject("Etkileşim kabulü");
project.width = 320;
project.height = 180;
project.assets = assets;
project.tracks = [createTrack("video", "Video 1"), createTrack("audio", "Ses 1")];
const first = { ...createClip(assets[0], project.tracks[0].id, 0, 30), duration: 2 };
const second = { ...createClip(assets[0], project.tracks[0].id, 2, 30), duration: 2 };
first.transform = { ...first.transform, scale: 1 };
project.clips = [first, second];

const original = path.join(output, "fixture.cevikedit");
const saved = path.join(output, "edited.cevikedit");
await writeFile(original, JSON.stringify(project));

const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
env.CEVIKEDIT_USER_DATA = path.join(output, "user-data");
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const app = await electron.launch({
  args: [path.join(root, "dist-electron", "main.cjs"), original],
  env,
  timeout: 30_000,
});
let page: Page | undefined;
const errors: string[] = [];
const checks: string[] = [];
const readProject = async (): Promise<Project> =>
  JSON.parse(await readFile(original, "utf8"));
const save = async (): Promise<Project> => {
  await page!.getByRole("button", { name: "Projeyi kaydet", exact: true }).click();
  await expect(page!.locator(".save-dot")).not.toHaveClass(/dirty/);
  return readProject();
};
const dragPreset = async (selector: string, payload: object) =>
  page!.evaluate(
    ({ selector: target, payload: data }) => {
      const element = document.querySelector(target);
      if (!element) throw new Error(`no element ${target}`);
      const transfer = new DataTransfer();
      transfer.setData("application/x-cevikedit-preset", JSON.stringify(data));
      element.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
      element.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
      return true;
    },
    { selector, payload },
  );

try {
  await app.evaluate(
    ({ dialog }, file) => {
      (dialog as any).showSaveDialog = async () => ({
        canceled: false,
        filePath: file,
      });
      (dialog as any).showMessageBox = async () => ({ response: 2 });
    },
    saved,
  );
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".tl-clip")).toHaveCount(2);

  /* 1. Preview corner scaling */
  await page.locator(`[data-clip-id="${first.id}"]`).click({ position: { x: 30, y: 20 } });
  await page.keyboard.press("Home");
  await expect(page.locator(".player-scale-box")).toBeVisible();
  const handle = page.locator(".player-scale-handle.player-scale-se");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 45, box.y + 45, { steps: 8 });
  await page.mouse.up();
  let edited = await save();
  const scaled = edited.clips.find((clip) => clip.id === first.id)!;
  assert(scaled.transform.scale > 1.05, `scale grew: ${scaled.transform.scale}`);
  checks.push("dragging a preview corner handle scales the selected clip");

  await page.locator(".player-scale-handle.player-scale-se").focus();
  await page.keyboard.press("ArrowLeft");
  edited = await save();
  assert(
    edited.clips.find((clip) => clip.id === first.id)!.transform.scale <
      scaled.transform.scale,
  );
  checks.push("arrow keys adjust the preview scale handle");

  /* 2. Creative presets dropped onto the timeline */
  await page.getByRole("button", { name: "Geçiş", exact: true }).click();
  await dragPreset(`[data-clip-id="${second.id}"]`, {
    kind: "transition",
    id: "dissolve",
    seconds: 0.5,
  });
  edited = await save();
  assert(
    edited.clips.some((clip) => clip.fadeIn > 0 || clip.videoFadeWindow),
    "a transition drops onto the clip under the pointer",
  );
  checks.push("dropping a transition from the library applies it to the clip");

  await page.getByRole("button", { name: "Efekt", exact: true }).click();
  await dragPreset(`[data-clip-id="${first.id}"]`, {
    kind: "effect",
    id: "mono",
  });
  edited = await save();
  const mono = edited.clips.find((clip) => clip.id === first.id)!;
  assert(
    mono.adjustments.saturation < 0.5 && mono.adjustments.contrast > 1.1,
    `effect patch applied: ${JSON.stringify(mono.adjustments)}`,
  );
  checks.push("dropping a colour effect from the library patches the clip");

  /* 3. Multi-select and batch add */
  await page.getByRole("button", { name: "Medya", exact: true }).click();
  const items = page.locator(".media-item");
  await items.nth(0).click();
  await items.nth(1).click({ modifiers: ["Control"] });
  await expect(page.locator(".media-item.is-selected")).toHaveCount(2);
  const batch = page.locator(".media-add-selected");
  await expect(batch).toContainText("2 medyayı ekle");
  const beforeBatch = await page.locator(".tl-clip").count();
  await batch.click();
  await expect
    .poll(() => page!.locator(".tl-clip").count(), { timeout: 15_000 })
    .toBe(beforeBatch + 2);
  assert.equal((await save()).clips.length, beforeBatch + 2);
  checks.push("Ctrl+click selects several assets and one button appends them all");

  /* 4. Text template dropped on a text lane */
  const beforeText = await page.locator(".tl-clip").count();
  await page.getByRole("button", { name: "Metin", exact: true }).click();
  await dragPreset(".tl-lane", { kind: "text", id: "classic" });
  await expect
    .poll(() => page!.locator(".tl-clip").count(), { timeout: 15_000 })
    .toBe(beforeText + 1);
  assert.equal((await save()).clips.length, beforeText + 1);
  checks.push("dropping a text template on the timeline creates a text clip");

  /* 5. Square add button */
  await page.getByRole("button", { name: "Medya", exact: true }).click();
  const addShape = await page
    .locator(".media-add")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        radius: style.borderRadius,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
  assert.equal(addShape.width, addShape.height, "add button is a square");
  assert.equal(addShape.radius, "5px", `radius ${addShape.radius}`);
  checks.push("the media add control renders as an even square");

  /* 6. Ruler drag zoom */
  const zoomSlider = page.locator(".tl-toolbar input[type=range]");
  const beforeZoom = Number(await zoomSlider.inputValue());
  const ruler = (await page.locator(".tl-ruler-body").boundingBox())!;
  await page.mouse.move(ruler.x + 60, ruler.y + 12);
  await page.mouse.down();
  await page.mouse.move(ruler.x + 180, ruler.y + 12, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await zoomSlider.inputValue()), { timeout: 10_000 })
    .toBeGreaterThan(beforeZoom);
  const afterZoom = Number(await zoomSlider.inputValue());
  checks.push(`dragging the ruler stretches the scale (${beforeZoom} → ${afterZoom} px/s)`);

  await page.mouse.click(ruler.x + 200, ruler.y + 12);
  await expect
    .poll(() => page!.locator(".timecode strong").innerText())
    .not.toBe("00:00:00");
  checks.push("a click on the ruler keeps seeking the playhead");

  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify(
      {
        passedAt: new Date().toISOString(),
        checks,
        scale: edited.clips.find((clip) => clip.id === first.id)!.transform.scale,
        zoom: { before: beforeZoom, after: afterZoom },
        addShape,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ checks, addShape, zoom: { before: beforeZoom, after: afterZoom }, errors }, null, 2),
  );
} catch (error) {
  await page?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await app.close();
}
