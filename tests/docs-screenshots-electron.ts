/**
 * Regenerate the public documentation screenshots in the shipped Turkish UI.
 * Kept separate from the Chinese-source assertion harnesses so those cannot
 * overwrite the docs with non-Turkish captures.
 */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClip, createProject } from "../src/core/model";
import { importAssets } from "../electron/media";
import { generateFixtures } from "../scripts/generate-fixtures";

const root = process.cwd(),
  output = path.join(root, ".test-output", "docs-screenshots");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(path.join(root, "docs", "screenshots"), { recursive: true });

const fixture = await generateFixtures(path.join(output, "fixtures"));
const [video, audio, image] = await importAssets(
  [fixture.video, fixture.audio, fixture.image],
  path.join(output, "cache"),
);
// Public screenshots must read entirely in the shipped language.
video.name = "stüdyo.mp4";
audio.name = "müzik.wav";
image.name = "logo.png";
const project = createProject("CevikEdit tanıtım");
project.fps = 30;
project.assets = [video, audio, image];
const videoTrack = project.tracks.find((item) => item.kind === "video")!;
const audioTrack = project.tracks.find((item) => item.kind === "audio")!;
const textTrack = project.tracks.find((item) => item.kind === "text")!;
const clip = createClip(video, videoTrack.id, 0, 30);
clip.id = "video";
clip.name = "stüdyo.mp4";clip.duration = 4;
clip.keyframes = [
  { id: "k1", time: 0, property: "scale", value: 1, easing: "linear" },
  { id: "k2", time: 4, property: "scale", value: 1.2, easing: "easeInOut" },
];
const music = createClip(audio, audioTrack.id, 0, 30);
music.id = "music";
music.name = "müzik.wav";
music.duration = 4;
const title = createClip(undefined, textTrack.id, 0, 30);
title.id = "title";
title.name = "başlık";
title.duration = 3;
title.text!.text = "Her an bir hikâye";
project.clips = [clip, music, title];

const file = path.join(output, "tanitim.cevikedit");
await writeFile(file, JSON.stringify(project));

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
const errors: string[] = [];
try {
  await app.evaluate(
    ({ dialog }, target) => {
      (dialog as any).showOpenDialog = async () => ({
        canceled: false,
        filePaths: [target],
      });
    },
    file,
  );
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(3);
  await page.locator('[data-clip-id="title"]').click();
  await page.locator(".tl-scroll").evaluate((element) => {
    element.scrollLeft = 0;
  });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(root, "docs", "screenshots", "electron-editor.png"),
  });
  const parity = path.join(root, "docs", "screenshots", "ui-parity-editor.png");
  await page.screenshot({ path: parity });
  await page.getByRole("button", { name: "Dışa aktar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Dışa aktar", exact: true }).last()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(root, "docs", "screenshots", "electron-export.png"),
    mask: [page.getByLabel("Dışa aktarma konumu", { exact: true })],
    maskColor: "#262626",
  });
  await page.getByLabel("İletişim kutusunu kapat", { exact: true }).click();
  await page.locator(".tl-track-header").first().getByRole("button", { name: /kanal işlemleri/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(root, "docs", "screenshots", "electron-track-tools.png"),
  });
  await page.getByRole("button", { name: "Ses", exact: true }).click();
  await page.locator('[data-clip-id="music"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(root, "docs", "screenshots", "electron-audio-tools.png"),
  });
  console.log(JSON.stringify({ screenshots: 4, errors }, null, 2));
} finally {
  if (page) await page.evaluate(() => window.editorAPI?.setDirty(false)).catch(() => {});
  await app.close();
}
