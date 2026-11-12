/** Real Turkish insert / overwrite / append flow with a saved-project assertion. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createClip, createProject } from "../src/core/model";
import { importAssets } from "../electron/media";
import { generateFixtures } from "../scripts/generate-fixtures";
import type { Project } from "../src/core/types";

const root = process.cwd(),
  output = path.join(root, ".test-output", "placement-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const fixture = await generateFixtures(path.join(output, "fixtures"));
const [video] = await importAssets([fixture.video], path.join(output, "cache"));
video.name = "kaynak.mp4";
const project = createProject("Yerleştirme kabul");
project.fps = 30;
project.assets = [video];
const track = project.tracks.find((item) => item.kind === "video")!;
const first = createClip(video, track.id, 0, 30);
first.id = "first";
first.name = "ilk";
first.duration = 4;
const second = createClip(video, track.id, 6, 30);
second.id = "second";
second.name = "ikinci";
second.duration = 3;
project.clips = [first, second];

const original = path.join(output, "fixture.cevikedit");
const saved = path.join(output, "saved.cevikedit");
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
  const ui = page;
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(2);

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
  const seekSeconds = async (time: number) => {
    await page!.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page!.keyboard.press("Home");
    const whole = Math.floor(time + 1e-6);
    for (let index = 0; index < whole; index += 1) await page!.keyboard.press("Shift+ArrowRight");
    const frames = Math.round((time - whole) * 30);
    for (let index = 0; index < frames; index += 1) await page!.keyboard.press("ArrowRight");
    await page!.waitForTimeout(100);
  };
  const openSource = async () => {
    await page!.locator(".asset-card, .media-card, [data-asset-id]").first().click();
    await expect(page!.getByRole("region", { name: "Medya kaynak önizlemesi" })).toBeVisible();
  };
  const range = async (start: number, end: number) => {
    await page!.getByRole("spinbutton", { name: "Kaynak medya giriş noktası", exact: true }).fill(String(start));
    await page!.getByRole("spinbutton", { name: "Kaynak medya çıkış noktası", exact: true }).fill(String(end));
  };

  // Insert at 2 s.
  await seekSeconds(2);
  await openSource();
  await range(0, 2);
  await page.getByRole("combobox", { name: "Yerleştirme biçimi", exact: true }).selectOption("insert");
  await page.getByRole("button", { name: "Seçili klibi ekle", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("sonraki klipler kaydırıldı");
  let edited = await save();
  const onTrack = (data: Project) =>
    data.clips
      .filter((clip) => clip.trackId === track.id)
      .sort((a, b) => a.start - b.start);
  let clips = onTrack(edited);
  assert.equal(clips.length, 4);
  assert.deepEqual(
    clips.map((clip) => [Number(clip.start.toFixed(3)), Number(clip.duration.toFixed(3))]),
    [
      [0, 2],
      [2, 2],
      [4, 2],
      [8, 3],
    ],
  );
  assert.equal(clips[0].id, "first");
  assert.equal(clips[2].sourceIn, 2);
  assert.equal(clips[1].sourceIn, 0);
  assert.equal(clips[3].id, "second");
  checks.push("insert at the playhead splits the straddling clip, opens a gap and pushes later clips");

  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  edited = await save();
  clips = onTrack(edited);
  assert.equal(clips.length, 2);
  assert.deepEqual(
    clips.map((clip) => [clip.id, clip.start, clip.duration]),
    [
      ["first", 0, 4],
      ["second", 6, 3],
    ],
  );
  checks.push("one undo restores the original clip layout after insertion");

  // Overwrite 1–4 s.
  await seekSeconds(1);
  await openSource();
  await range(0, 3);
  await page.getByRole("combobox", { name: "Yerleştirme biçimi", exact: true }).selectOption("overwrite");
  await page.getByRole("button", { name: "Seçili klibi ekle", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("kanal aralığını kapladı");
  edited = await save();
  clips = onTrack(edited);
  assert.equal(clips.length, 3);
  assert.deepEqual(
    clips.map((clip) => [Number(clip.start.toFixed(3)), Number(clip.duration.toFixed(3))]),
    [
      [0, 1],
      [1, 3],
      [6, 3],
    ],
  );
  assert.equal(clips[0].id, "first");
  checks.push("overwrite trims the overlapped clip and keeps the untouched later clip");

  // Append keeps the layout and lands after the last clip.
  await openSource();
  await range(0, 1);
  await page.getByRole("combobox", { name: "Yerleştirme biçimi", exact: true }).selectOption("append");
  await page.getByRole("button", { name: "Seçili klibi ekle", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("kanal sonuna eklendi");
  edited = await save();
  clips = onTrack(edited);
  assert.equal(clips.length, 4);
  assert.equal(clips[3].start, 9);
  assert.equal(clips[3].duration, 1);
  checks.push("append keeps every existing clip and adds the range after the last one");

  await page.screenshot({ path: path.join(output, "placement.png") });

  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Geri al", exact: true })).toBeDisabled();
  checks.push("the placed timeline reopens from disk with history cleared");

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
