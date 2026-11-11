/** Real Turkish linked-clip flow: separate audio, move together, detach, undo. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createClip, createProject } from "../src/core/model";
import { importAssets } from "../electron/media";
import { generateFixtures } from "../scripts/generate-fixtures";
import type { Project } from "../src/core/types";

const root = process.cwd(),
  output = path.join(root, ".test-output", "linked-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const fixture = await generateFixtures(path.join(output, "fixtures"));
const [video] = await importAssets([fixture.video], path.join(output, "cache"));
video.name = "kaynak.mp4";
const project = createProject("Bağlı klip kabul");
project.fps = 30;
project.assets = [video];
const track = project.tracks.find((item) => item.kind === "video")!;
const clip = createClip(video, track.id, 2, 30);
clip.id = "video";
clip.name = "kaynak";
clip.duration = 2;
project.clips = [clip];

const original = path.join(output, "fixture.cevikedit"),
  saved = path.join(output, "saved.cevikedit");
await writeFile(original, JSON.stringify(project));

const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
env.CEVIKEDIT_USER_DATA = path.join(output, "user-data");
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
delete env.CEVIKEDIT_LOCALE;

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
  await expect(page.locator(".tl-clip")).toHaveCount(1);

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

  await page.locator('[data-clip-id="video"]').click();
  await page.locator(".inspector").getByRole("button", { name: "Ses", exact: true }).click();
  await page.locator(".inspector").getByRole("button", { name: "Sesi ayır", exact: true }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(2, { timeout: 60_000 });
  let edited = await save();
  const videoClip = edited.clips.find((item) => item.id === "video")!;
  const audioClip = edited.clips.find((item) => item.id !== "video")!;
  assert(videoClip.linkId, "video linkId missing");
  assert.equal(audioClip.linkId, videoClip.linkId);
  assert.equal(videoClip.muted, true);
  checks.push("separating audio links the source video and the new audio clip");

  await expect(page.getByRole("button", { name: "Bağlantıyı çöz", exact: true })).toBeVisible();
  // Nudge the video by one frame with the timeline keyboard shortcut; the audio
  // must follow in the same commit.
  await page.locator('[data-clip-id="video"]').focus();
  await page.keyboard.press("Alt+ArrowRight");
  await page.waitForTimeout(200);
  edited = await save();
  const movedVideo = edited.clips.find((item) => item.id === "video")!;
  const movedAudio = edited.clips.find((item) => item.id !== "video")!;
  assert(Math.abs(movedVideo.start - (videoClip.start + 1 / 30)) < 1e-9, `video ${movedVideo.start}`);
  assert(Math.abs(movedAudio.start - (audioClip.start + 1 / 30)) < 1e-9, `audio ${movedAudio.start}`);
  checks.push("moving the linked video also moves the separated audio by the same amount");

  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  edited = await save();
  assert.equal(edited.clips.find((item) => item.id === "video")!.start, videoClip.start);
  assert.equal(edited.clips.find((item) => item.id !== "video")!.start, audioClip.start);
  checks.push("one undo restores both linked clips");

  await page.locator('[data-clip-id="video"]').click();
  await page.locator(".inspector").getByRole("button", { name: "Ses", exact: true }).click();
  await page.getByRole("button", { name: "Bağlantıyı çöz", exact: true }).click();
  edited = await save();
  assert(!edited.clips.find((item) => item.id === "video")!.linkId);
  assert(!edited.clips.find((item) => item.id !== "video")!.linkId);
  const audioStart = edited.clips.find((item) => item.id !== "video")!.start;
  await page.locator('[data-clip-id="video"]').focus();
  await page.keyboard.press("Alt+ArrowRight");
  await page.waitForTimeout(200);
  edited = await save();
  assert(Math.abs(edited.clips.find((item) => item.id === "video")!.start - (videoClip.start + 1 / 30)) < 1e-9);
  assert.equal(edited.clips.find((item) => item.id !== "video")!.start, audioStart);
  checks.push("detaching the link lets the video move without the audio");

  await page.screenshot({ path: path.join(output, "linked.png") });

  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Geri al", exact: true })).toBeDisabled();
  const reopened = JSON.parse(await readFile(saved, "utf8")) as Project;
  assert(!reopened.clips.find((item) => item.id === "video")!.linkId);
  checks.push("the detached clips reopen from disk with no link and a cleared history");

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
