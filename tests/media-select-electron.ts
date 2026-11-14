/**
 * Real desktop check that project media can be selected freely: plain click,
 * Ctrl/⌘ toggle, Shift range, select-all, and batch add to the timeline.
 * Clicking a card must not replace the library with the source preview anymore.
 */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { generateFixtures } from "../scripts/generate-fixtures";
import { importAssets } from "../electron/media";
import { createProject } from "../src/core/model";
import type { Project } from "../src/core/types";

const root = process.cwd();
const output = path.join(root, ".test-output", "media-select-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const fixtures = await generateFixtures(path.join(output, "media"));
const assets = await importAssets(
  [fixtures.video, fixtures.audio],
  path.join(output, "fixture-cache"),
);

const project = createProject("Seçim kabulü");
project.width = 320;
project.height = 180;
project.assets = assets;
project.tracks = [];
project.clips = [];
const file = path.join(output, "selection.cevikedit");
await writeFile(file, JSON.stringify(project));

const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
env.CEVIKEDIT_USER_DATA = path.join(output, "user-data");
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const app = await electron.launch({
  args: [path.join(root, "dist-electron", "main.cjs"), file],
  env,
  timeout: 30_000,
});
let page: Page | undefined;
const errors: string[] = [];
const checks: string[] = [];
const read = async (): Promise<Project> => JSON.parse(await readFile(file, "utf8"));

try {
  await app.evaluate(({ dialog }) => {
    (dialog as any).showMessageBox = async () => ({ response: 2 });
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".app-shell");
  await page.locator(".resource-tabs").getByRole("button", { name: "Medya", exact: true }).click();
  const items = page.locator(".media-item");
  await expect(items).toHaveCount(2);

  /* 1. Plain click selects and keeps the library visible (no panel swap). */
  await items.nth(0).click();
  await expect(page.locator(".media-item.is-selected")).toHaveCount(1);
  await expect(page.locator(".media-library")).toBeVisible();
  await expect(page.getByRole("region", { name: "Medya kaynak önizlemesi" })).toHaveCount(0);
  checks.push("clicking a card selects it instead of replacing the library with a preview");

  /* 2. Ctrl+click adds a second item to the selection. */
  await items.nth(1).click({ modifiers: ["Control"] });
  await expect(page.locator(".media-item.is-selected")).toHaveCount(2);
  checks.push("Ctrl+click builds a multi-selection");

  /* 3. Clicking an already selected item with Ctrl removes it again. */
  await items.nth(1).click({ modifiers: ["Control"] });
  await expect(page.locator(".media-item.is-selected")).toHaveCount(1);
  checks.push("Ctrl+click toggles a selected item off");

  /* 4. Shift+click extends the range. */
  await items.nth(0).click();
  await items.nth(1).click({ modifiers: ["Shift"] });
  await expect(page.locator(".media-item.is-selected")).toHaveCount(2);
  checks.push("Shift+click selects a contiguous range");

  /* 5. Preview is still reachable from its own button. */
  await page.locator(".media-preview-btn").first().click();
  await expect(page.getByRole("region", { name: "Medya kaynak önizlemesi" })).toBeVisible();
  await page.getByRole("button", { name: "Kaynak önizlemeyi kapat" }).click().catch(async () => {
    // The close button may be labelled differently; Escape closes the panel.
    await page!.keyboard.press("Escape");
  });
  checks.push("the dedicated preview button still opens the source preview");

  /* 6. Select all, then batch add to the timeline. */
  await page.locator(".resource-tabs").getByRole("button", { name: "Medya", exact: true }).click();
  await page.locator(".media-select-all").click();
  await expect(page.locator(".media-item.is-selected")).toHaveCount(2);
  checks.push("select-all marks every asset");

  const before = (await read()).clips.length;
  await page.locator(".media-add-selected").click();
  await expect
    .poll(() => page!.locator(".tl-clip").count(), { timeout: 20_000 })
    .toBe(2);
  await page.getByRole("button", { name: "Projeyi kaydet", exact: true }).click();
  await expect
    .poll(async () => (await read()).clips.length, { timeout: 20_000 })
    .toBe(before + 2);
  const projectAfter = await read();
  const kinds = projectAfter.clips.map(
    (clip) => projectAfter.tracks.find((track) => track.id === clip.trackId)?.kind,
  );
  assert(kinds.includes("video"), "video asset landed on a video lane");
  assert(kinds.includes("audio"), "audio asset landed on an audio lane");
  checks.push("batch add places video and audio on their own lanes");

  /* 7. Clearing the selection collapses the batch button. */
  await page.locator(".media-select-all").click();
  await expect(page.locator(".media-add-selected")).toHaveCount(0);
  checks.push("clear selection hides the batch add button");

  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify({ passedAt: new Date().toISOString(), checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  await page?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await app.close();
}
