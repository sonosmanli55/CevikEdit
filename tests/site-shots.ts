/** Capture Turkish UI detail shots for the landing page. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClip, createProject } from "../src/core/model";
import { importAssets } from "../electron/media";
import { generateFixtures } from "../scripts/generate-fixtures";

const root = process.cwd();
const output = path.join(root, ".test-output", "site-shots");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const fixture = await generateFixtures(path.join(output, "fixtures"));
const [video, audio, image] = await importAssets(
  [fixture.video, fixture.audio, fixture.image],
  path.join(output, "cache"),
);
video.name = "stüdyo.mp4";
audio.name = "müzik.wav";
image.name = "logo.png";

const project = createProject("CevikEdit tanıtım");
project.fps = 30;
project.assets = [video, audio, image];
const videoTrack = project.tracks.find((t) => t.kind === "video")!;
const textTrack = project.tracks.find((t) => t.kind === "text")!;
const visual = createClip(video, videoTrack.id, 0, 30);
visual.id = "visual";
visual.name = "stüdyo.mp4";
visual.duration = 4;
visual.keyframes = [
  { id: "k1", time: 0, property: "scale", value: 1, easing: "linear" },
  { id: "k2", time: 4, property: "scale", value: 1.18, easing: "easeInOut" },
];
const captionTrack = { ...textTrack, name: "Altyazı" };
const headings = ["Her an bir hikâye", "Sabah ışığı", "Açık su", "Gün batımı"].map(
  (text, index) => {
    const clip = createClip(undefined, captionTrack.id, index * 4, 30);
    clip.id = `cue-${index}`;
    clip.name = text;
    clip.duration = 4;
    clip.text!.text = text;
    clip.text!.fontSize = 54;
    clip.text!.strokeWidth = 0;
    clip.fadeIn = 0.3;
    clip.fadeOut = 0.3;
    return clip;
  },
);
project.tracks = project.tracks.map((t) => (t.id === textTrack.id ? captionTrack : t));
project.clips = [visual, ...headings];

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

const app = await electron.launch({
  args: [path.join(root, "dist-electron/main.cjs")],
  env,
});
let page: Page | undefined;
const errors: string[] = [];
try {
  await app.evaluate(({ dialog }, target) => {
    (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, file);
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".app-shell");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(5);

  const assets = path.join(root, "site", "assets");

  // Subtitles panel with the batch controls visible.
  await page.getByRole("button", { name: "Altyazı", exact: true }).click();
  await page.locator(".subtitle-selection input[type=checkbox]").check();
  await page.getByRole("tab", { name: "Metin animasyonu", exact: true }).click();
  await page.locator(".subtitle-panel").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await page.waitForTimeout(400);
  const panel = page.locator(".subtitle-panel");
  await panel.screenshot({ path: path.join(assets, "subtitles.png") });

  // Audio tools.
  await page.getByRole("button", { name: "Ses", exact: true }).click();
  await page.locator('[data-clip-id="visual"]').click();
  await page.waitForTimeout(300);
  await page.locator(".audio-tools").evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.locator(".audio-tools").screenshot({ path: path.join(assets, "audio.png") });

  // Timeline with the minimap.
  await page.getByRole("button", { name: "Medya", exact: true }).click();
  await page.locator(".tl-scroll").evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.waitForTimeout(200);
  const timelineBox = await page
    .getByRole("region", { name: "Çok kanallı zaman çizelgesi" })
    .boundingBox();
  await page.screenshot({
    path: path.join(assets, "timeline.png"),
    clip: timelineBox ?? { x: 0, y: 610, width: 1440, height: 290 },
  });

  // Full editor for the hero.
  await page.getByRole("button", { name: "Altyazı", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(assets, "editor.png") });
  await page.screenshot({ path: path.join(output, "editor-full.png") });

  console.log(JSON.stringify({ captured: 4, errors }, null, 2));
} finally {
  if (page) await page.evaluate(() => window.editorAPI?.setDirty(false)).catch(() => {});
  await app.close();
}
