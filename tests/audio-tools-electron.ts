/** Real Turkish audio-tools flow: loudness, normalization, ducking, undo and reopen. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createClip, createProject } from "../src/core/model";
import { importAssets } from "../electron/media";
import { generateFixtures } from "../scripts/generate-fixtures";
import type { Project } from "../src/core/types";

const root = process.cwd(),
  output = path.join(root, ".test-output", "audio-tools-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const fixture = await generateFixtures(path.join(output, "fixtures"));
const [tone, video] = await importAssets(
  [fixture.audio, fixture.video],
  path.join(output, "cache"),
);
const project = createProject("Ses araçları kabul");
project.fps = 30;
tone.name = "müzik.wav";
video.name = "konuşma.mp4";
project.assets = [tone, video];
const audioTrack = project.tracks.find((track) => track.kind === "audio")!;
const videoTrack = project.tracks.find((track) => track.kind === "video")!;
const music = createClip(tone, audioTrack.id, 0, 30);
music.id = "music";
music.name = "müzik";
music.duration = 4;
const speech = createClip(video, videoTrack.id, 1, 30);
speech.id = "speech";
speech.name = "konuşma";
speech.duration = 1.5;
project.clips = [music, speech];

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
      const state = globalThis as unknown as { opened?: number };
      state.opened = 0;
      (dialog as any).showOpenDialog = async () => ({
        canceled: false,
        filePaths: [state.opened!++ === 0 ? files.original : files.saved],
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
  await expect(page.getByRole("button", { name: "Dosya menüsü", exact: true })).toBeVisible();
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

  await page.getByRole("button", { name: "Ses", exact: true }).click();
  await expect(page.getByRole("region", { name: "Ses araçları" })).toBeVisible();
  await expect(page.getByText("Ses araçları", { exact: true })).toBeVisible();
  checks.push("the audio tab opens a Turkish audio-tools panel next to the media library");
  // The shipped UI must never render the Chinese authoring strings.
  const tabs = ["Medya", "Ses", "Metin", "Çıkartma", "Efekt", "Geçiş", "Altyazı"];
  for (const label of tabs) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const text = await page.locator("body").innerText();
    assert(!/[\u4e00-\u9fff]/.test(text), `${label} sekmesinde Çince metin görünüyor: ${text.slice(0, 200)}`);
  }
  await page.getByRole("button", { name: "Ses", exact: true }).click();
  checks.push("every resource tab renders Turkish only, with no Chinese source strings");

  await page.locator('[data-clip-id="music"]').click();
  await page.getByRole("button", { name: "Seçili sesi ölç", exact: true }).click();
  await expect(page.locator(".audio-reading")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".audio-notice")).toContainText("Ölçüm tamamlandı");
  const reading = (await page.locator(".audio-reading").innerText()).trim();
  assert(/^-?\d+\.\d LUFS · -?\d+\.\d dBTP$/.test(reading), reading);
  checks.push(`local FFmpeg loudness measurement is shown in Turkish (${reading})`);

  await page.getByRole("button", { name: "Ses düzeyini normalleştir", exact: true }).click();
  await expect(page.locator(".audio-notice")).toContainText("kazanç uygulandı");
  let edited = await save();
  const normalized = edited.clips.find((clip) => clip.id === "music")!;
  assert(normalized.volume > 1, `expected a positive gain, got ${normalized.volume}`);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  edited = await save();
  assert.equal(edited.clips.find((clip) => clip.id === "music")!.volume, 1);
  checks.push("normalization applies the measured gain to volume and one undo restores it");

  await page.locator('[data-clip-id="music"]').click();
  await page.getByRole("button", { name: "Müzik listesine ekle", exact: true }).click();
  await page.locator('[data-clip-id="speech"]').click();
  await page.getByRole("button", { name: "Konuşma listesine ekle", exact: true }).click();
  await expect(page.locator(".audio-chip")).toHaveCount(2);
  await page.getByRole("spinbutton", { name: "Müzik kısma miktarı", exact: true }).fill("-12");
  await page.getByRole("spinbutton", { name: "Müzik kısma geçiş süresi", exact: true }).fill("0.2");
  await page.getByRole("button", { name: "Müziği konuşma altında kıs", exact: true }).click();
  await expect(page.locator(".audio-notice")).toContainText("ses kısıldı");
  edited = await save();
  const ducked = edited.clips.find((clip) => clip.id === "music")!;
  const keys = ducked.keyframes
    .filter((key) => key.property === "volume")
    .sort((a, b) => a.time - b.time);
  assert.deepEqual(keys.map((key) => Number(key.time.toFixed(3))), [0, 0.8, 1, 2.5, 2.7]);
  assert(Math.abs(keys[0].value - 1) < 1e-9);
  assert(Math.abs(keys[2].value - 10 ** (-12 / 20)) < 1e-9);
  assert(Math.abs(keys[4].value - 1) < 1e-9);
  assert(!edited.clips.find((clip) => clip.id === "speech")!.keyframes.length);
  checks.push("speech and music lists write a ducking envelope on the music clip only");

  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  edited = await save();
  assert(!edited.clips.find((clip) => clip.id === "music")!.keyframes.some((key) => key.property === "volume"));
  await page.getByRole("button", { name: "Yinele", exact: true }).click();
  edited = await save();
  assert(
    edited.clips
      .find((clip) => clip.id === "music")!
      .keyframes.some((key) => key.property === "volume"),
  );
  checks.push("ducking is a single undo/redo step and leaves other clips untouched");

  await page.locator(".audio-tools").evaluate((node) => node.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, "audio-tools.png") });

  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Geri al", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Ses", exact: true }).click();
  await page.locator('[data-clip-id="music"]').click();
  await expect(page.getByRole("button", { name: "Seçili sesi ölç", exact: true })).toBeEnabled();
  const reopened = JSON.parse(await readFile(saved, "utf8")) as Project;
  assert(
    reopened.clips
      .find((clip) => clip.id === "music")!
      .keyframes.some((key) => key.property === "volume"),
  );
  checks.push("the saved ducking envelope reopens with a cleared history and a working Turkish UI");

  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify({ passedAt: new Date().toISOString(), locale: "tr", checks, errors }, null, 2),
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
