/** Draft exchange export: real menu action, file on disk, re-import round trip. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createClip, createProject } from "../src/core/model";
import { importAssets } from "../electron/media";
import { generateFixtures } from "../scripts/generate-fixtures";
import { DRAFT_EXCHANGE_FORMAT } from "../src/core/draftExchange";
import type { Project } from "../src/core/types";

const root = process.cwd(),
  output = path.join(root, ".test-output", "draft-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const fixture = await generateFixtures(path.join(output, "fixtures"));
const [video] = await importAssets([fixture.video], path.join(output, "cache"));
video.name = "çekim.mp4";
const project = createProject("Taslak kabul");
project.fps = 30;
project.assets = [video];
const videoTrack = project.tracks.find((item) => item.kind === "video")!;
const textTrack = project.tracks.find((item) => item.kind === "text")!;
const visual = createClip(video, videoTrack.id, 1, 30);
visual.id = "visual";
visual.name = "çekim";
visual.duration = 2;
visual.speed = 1.5;
visual.sourceIn = 0.5;
const title = createClip(undefined, textTrack.id, 1, 30);
title.id = "title";
title.name = "başlık";
title.duration = 2;
title.text!.text = "Taslak başlığı";
project.clips = [visual, title];

const original = path.join(output, "kaynak.cevikedit");
const draftFile = path.join(output, "taslak.cevikedit-draft.json");
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
      (dialog as any).showOpenDialog = async (...args: any[]) => {
        const title = String(args.at(-1)?.title ?? "");
        if (title.includes("CapCut") || title.includes("Taslak") || title.includes("taslak"))
          return { canceled: false, filePaths: [files.draftForImport] };
        return { canceled: false, filePaths: [files.original] };
      };
      (dialog as any).showSaveDialog = async () => ({
        canceled: false,
        filePath: files.draft,
      });
      (dialog as any).showMessageBox = async () => ({ response: 0 });
    },
    { original, draft: draftFile, draftForImport: draftFile },
  );
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(2);

  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page
    .getByRole("button", { name: "Taslak değişim dosyasını dışa aktar", exact: false })
    .click();
  await expect(page.locator(".toast")).toContainText("Taslak değişim dosyası dışa aktarıldı");
  await expect(page.locator(".toast")).toContainText("CapCut");
  await expect.poll(() => stat(draftFile).then((s) => s.size).catch(() => 0)).toBeGreaterThan(200);
  const draft = JSON.parse(await readFile(draftFile, "utf8"));
  assert.equal(draft.format, DRAFT_EXCHANGE_FORMAT);
  assert.equal(draft.canvas_config.width, project.width);
  assert.equal(draft.tracks.length, 3);
  const segment = draft.tracks.find((track: { type: string }) => track.type === "video").segments[0];
  assert.equal(segment.target_timerange.start, 1_000_000);
  assert.equal(segment.source_timerange.start, 500_000);
  assert.equal(segment.speed, 1.5);
  assert.equal(draft.project.clips.length, 2);
  checks.push("the menu exports a plaintext draft with materials, tracks and microsecond timing");

  // Re-import the exported draft through the existing CapCut importer.
  await page.keyboard.press("Escape");
  await page.locator(".project-title input").click();
  const menu = page.getByRole("button", { name: "Dosya menüsü", exact: true });
  const importItem = page.getByRole("button", { name: "CapCut taslak dosyası içe aktar", exact: false });
  if (!(await importItem.isVisible().catch(() => false))) await menu.click();
  await importItem.click();
  await expect(page.locator(".tl-clip")).toHaveCount(2);
  await expect(page.locator(".tl-clip").filter({ hasText: "Taslak başlığı" })).toHaveCount(1);
  const body = await page.locator("body").innerText();
  assert(!/[\u4e00-\u9fff]/.test(body), body.slice(0, 200));
  checks.push("the exported draft imports back through the existing plaintext importer");

  // The source project on disk is untouched by the export.
  const saved = JSON.parse(await readFile(original, "utf8")) as Project;
  assert.equal(saved.clips.length, 2);
  assert.equal(saved.clips[0].duration, 2);
  checks.push("exporting a draft never modifies the source project");

  await page.screenshot({ path: path.join(output, "draft.png") });
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
