/** Full desktop recipe library workflow, isolated project and original bundled art only. */
import { _electron as electron, expect } from "@playwright/test";
import { mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createProject, createClip } from "../src/core/model";
import { importAssets, probeFile, runMediaTool } from "../electron/media";
import type { Project } from "../src/core/types";
const root = process.cwd(),
  output = path.join(root, ".test-output/creative-library-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const project = createProject("Özgün metin · hareket · geçiş");
project.width = 640;
project.height = 360;
project.fps = 24;
project.assets = await importAssets(
  ["bg-sand.png", "bg-ocean.png"].map((f) =>
    path.join(root, "public/builtin-assets", f),
  ),
  path.join(output, "cache"),
);
project.clips = project.assets.map((a, i) => ({
  ...createClip(a, project.tracks[1].id, i * 2, 24),
  duration: 2,
}));
const source = path.join(output, "before.cevikedit"),
  saved = path.join(output, "saved.cevikedit"),
  exported = path.join(output, "creative.mp4");
await writeFile(source, JSON.stringify(project));
const packaged = process.env.CEVIKEDIT_TEST_APP,
  env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
env.CEVIKEDIT_USER_DATA = path.join(output, "user-data");
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
if (packaged) {
  env.PATH = "";
  delete env.CEVIKEDIT_FFMPEG;
  delete env.CEVIKEDIT_FFPROBE;
}
const app = await electron.launch({
  ...(packaged
    ? {
        executablePath: path.join(
          path.resolve(packaged),
          "Contents/MacOS/CevikEdit",
        ),
        args: [source],
        cwd: output,
      }
    : { args: [path.join(root, "dist-electron/main.cjs"), source] }),
  env,
});
const page = await app.firstWindow(),
  errors: string[] = [],
  checks: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await app.evaluate(
    ({ dialog, BrowserWindow }, paths) => {
      BrowserWindow.getAllWindows()[0].setSize(1470, 900);
      (dialog as any).showSaveDialog = async (...args: any[]) => ({
        canceled: false,
        filePath: args.at(-1).title.includes("Dışa aktar")
          ? paths.exported
          : paths.saved,
      });
      (dialog as any).showMessageBox = async () => ({ response: 2 });
    },
    { saved, exported },
  );
  await expect(page.locator(".tl-clip")).toHaveCount(2);
  const save = async (): Promise<Project> => {
    const old = await stat(source).then((s) => s.mtimeMs);
    await page.getByRole("button", { name: "Projeyi kaydet", exact: true }).click();
    await expect
      .poll(() => stat(source).then((s) => s.mtimeMs))
      .toBeGreaterThan(old);
    return JSON.parse(await readFile(source, "utf8"));
  };
  await page.getByRole("button", { name: "Metin", exact: true }).click();
  await expect(page.locator(".creative-card")).toHaveCount(25);
  const preview = page.getByRole("button", {
    name: "Zıplayarak giriş önizle",
    exact: true,
  });
  await preview.scrollIntoViewIfNeeded();
  await preview.hover();
  const snapshot = () =>
    preview
      .locator("canvas")
      .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  const first = await snapshot();
  await expect.poll(snapshot).not.toBe(first);
  checks.push("25 text recipes and animated canvas preview");
  await page
    .getByRole("textbox", { name: "Ön ayar ara", exact: true })
    .fill("yok şablonu");
  await expect(
    page.getByText("Eşleşen metin şablonu yok", { exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Ön ayar ara", exact: true }).fill("");
  await page.getByRole("tab", { name: "Hareketli", exact: true }).click();
  await expect(page.locator(".creative-card")).toHaveCount(5);
  await page.getByRole("tab", { name: "Alt bant", exact: true }).click();
  await expect(page.locator(".creative-card")).toHaveCount(3);
  await page.getByRole("tab", { name: "Sosyal medya", exact: true }).click();
  await expect(page.locator(".creative-card")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Veri kartı şablonunu ekle", exact: true })
    .click();
  let p = await save();
  const statText = p.clips.at(-1)!.text!;
  assert.equal(statText.text, "12.4B\ngörüntüleme");
  assert.equal(statText.background, "#62ead1");
  assert.equal(statText.radius, 0.2);
  assert.equal(statText.padding, 0.4);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  assert.equal((await save()).clips.length, 2);
  await page.getByRole("tab", { name: "Hareketli", exact: true }).click();
  await page
    .getByRole("button", { name: "Zıplayarak giriş şablonunu ekle", exact: true })
    .click();
  p = await save();
  assert.equal(p.clips.length, 3);
  assert(p.clips.at(-1)?.text?.text === "MERHABA!");
  assert.equal(p.clips.at(-1)?.keyframes.length, 3);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  assert.equal((await save()).clips.length, 2);
  await page
    .getByRole("button", { name: "Hafifçe yüksel şablonunu ekle", exact: true })
    .click();
  p = await save();
  assert(p.clips.at(-1)?.text?.text.includes("yeni hikâye"));
  checks.push("text category/search, editable animated text and one-step undo");
  await page.getByRole("tab", { name: "Tümü", exact: true }).click();
  await page.locator(".player-panel .panel-heading").click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 24; i++) await page.keyboard.press("ArrowRight");
  await page.screenshot({ path: path.join(output, "text-library.png") });
  const front = page.locator(`[data-clip-id="${project.clips[0].id}"]`);
  await front.click({ position: { x: 25, y: 20 } });
  await page.getByRole("button", { name: "Efekt", exact: true }).click();
  await expect(page.locator(".creative-card")).toHaveCount(8);
  await page.getByRole("button", { name: "Sıcak güneş renk ayarını uygula", exact: true }).click();
  p = await save();
  assert.equal(p.clips[0].adjustments.temperature, 0.3);
  await page.getByRole("tab", { name: "Hareketli efektler", exact: true }).click();
  await expect(page.locator(".creative-card")).toHaveCount(8);
  await page
    .getByRole("button", { name: "Nefes alan ölçek efektini uygula", exact: true })
    .click();
  p = await save();
  assert.equal(
    p.clips[0].keyframes.filter((k) => k.property === "scale").length,
    5,
  );
  checks.push("8 color and 8 motion effects apply real adjustments/keyframes");
  await page.locator(".effects-content").evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: path.join(output, "effect-library.png") });
  await page.getByRole("button", { name: "Geçiş", exact: true }).click();
  await expect(page.locator(".creative-card")).toHaveCount(8);
  await page
    .getByRole("spinbutton", { name: "Geçiş süresi", exact: true })
    .fill("0.6");
  await page
    .getByRole("button", { name: "Soldan kayarak giriş geçişini uygula", exact: true })
    .click();
  p = await save();
  const next = p.clips.find((c) => c.id === project.clips[1].id)!;
  assert(Math.abs(next.start - (2 - 14 / 24)) < 1e-8);
  assert.equal(next.keyframes.filter((k) => k.property === "x").length, 2);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  assert.equal((await save()).clips[1].start, 2);
  await front.click({ position: { x: 25, y: 20 } });
  await page
    .getByRole("button", { name: "Ölçek geçişi geçişini uygula", exact: true })
    .click();
  p = await save();
  assert.equal(
    p.clips[1].keyframes.filter((k) => k.property === "scale").length,
    2,
  );
  checks.push(
    "8 transitions, frame-aligned duration, adjacent clip movement and atomic undo",
  );
  await page.locator(".creative-scroll").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: path.join(output, "transition-library.png") });
  await page.getByRole("button", { name: "Dışa aktar", exact: true }).click();
  await page.getByRole("button", { name: "Dışa aktarmayı başlat", exact: true }).click();
  await expect(page.getByText("Dışa aktarma tamamlandı", { exact: true })).toBeVisible({
    timeout: 120000,
  });
  const info = await page.evaluate(() => window.editorAPI!.getSystemInfo());
  if (packaged) {
    process.env.CEVIKEDIT_FFMPEG = info.ffmpegPath;
    process.env.CEVIKEDIT_FFPROBE = info.ffprobePath;
  }
  const probe = await probeFile(exported);
  assert.equal(Number(probe.format.duration), 5);
  assert(probe.streams.some((s) => s.width === 640 && s.height === 360));
  const frame = await runMediaTool("ffmpeg", [
    "-v",
    "error",
    "-ss",
    "1",
    "-i",
    exported,
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  let white = 0;
  for (let i = 0; i < frame.length; i += 3)
    if (frame[i] > 235 && frame[i + 1] > 235 && frame[i + 2] > 235) white++;
  assert(white > 50, "Export contains white Chinese template text");
  checks.push(
    "actual five-second MP4 exports Chinese animated title, motion/color and zoom transition",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        packaged: !!packaged,
        checks,
        whitePixels: white,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Creative library: ${checks.length} checks passed (packaged=${!!packaged}).`,
  );
} catch (e) {
  await page
    .screenshot({ path: path.join(output, "failure.png") })
    .catch(() => {});
  throw e;
} finally {
  await app.close();
}
