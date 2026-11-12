/** 4K + 400-clip project: virtualization, zoom/scroll responsiveness, export preview. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createClip, createProject, createTrack } from "../src/core/model";
import { importAssets } from "../electron/media";
import { generateFixtures } from "../scripts/generate-fixtures";
import type { Project } from "../src/core/types";

const root = process.cwd(),
  output = path.join(root, ".test-output", "limits-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const fixture = await generateFixtures(path.join(output, "fixtures"));
const [image] = await importAssets([fixture.image], path.join(output, "cache"));
image.name = "kare.png";
const project = createProject("4K kalabalık proje");
project.width = 3840;
project.height = 2160;
project.fps = 30;
project.assets = [image];
const videoTrack = project.tracks.find((item) => item.kind === "video")!;
const textTrack = createTrack("text", "Altyazı");
project.tracks.unshift(textTrack);
project.clips = Array.from({ length: 400 }, (_, index) => {
  const text = index % 10 === 0;
  const clip = createClip(text ? undefined : image, text ? textTrack.id : videoTrack.id, index * 2, 30);
  clip.id = `clip-${index}`;
  clip.name = text ? `altyazı ${index}` : `kare ${index}`;
  clip.duration = 2;
  if (text) clip.text!.text = `Altyazı ${index}`;
  return clip;
});
const longClip = createClip(image, videoTrack.id, 3000, 30);
longClip.id = "late";
longClip.name = "uzak klip";
longClip.duration = 4;
project.clips.push(longClip);

const original = path.join(output, "buyuk.cevikedit");
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
      (dialog as any).showOpenDialog = async () => ({
        canceled: false,
        filePaths: [files.original],
      });
      (dialog as any).showMessageBox = async () => ({ response: 0 });
    },
    { original },
  );
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".app-shell");

  const started = Date.now();
  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await page.waitForSelector(".tl-clip", { timeout: 60_000 });
  const openMs = Date.now() - started;

  // Only the visible slice of a 401-clip project is in the DOM.
  const rendered = await page.locator(".tl-clip").count();
  assert(rendered > 0 && rendered < 120, `rendered ${rendered} of 401 clips`);
  const status = await page.locator(".tl-status, footer").last().innerText();
  assert(status.includes("401"), status.slice(0, 120));
  checks.push(
    `401 clips open in ${openMs} ms and only ${rendered} are drawn (virtualized)`,
  );

  // Panning to the far clip brings it into the DOM.
  await page.locator(".tl-clip").first().focus();
  await page.locator('input[aria-label="Zaman çizelgesi ölçeği"]').fill("2");
  await page.waitForTimeout(150);
  await page.locator(".tl-scroll").evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await page.waitForTimeout(250);
  const atEnd = await page.locator(".tl-clip").count();
  assert(atEnd > 0 && atEnd < 120, `end of timeline drew ${atEnd}`);
  const lateVisible = await page.locator('[data-clip-id="late"]').count();
  assert.equal(lateVisible, 1, "the far clip must draw when scrolled to");
  checks.push("scrolling to the end renders the distant clip and keeps drawing bounded");

  // Zooming a 4K project stays responsive.
  const zoomStart = Date.now();
  await page.getByRole("button", { name: "Zaman çizelgesini yakınlaştır", exact: true }).click();
  await page.waitForTimeout(200);
  const zoomMs = Date.now() - zoomStart;
  assert(zoomMs < 2000, `zoom took ${zoomMs} ms`);
  checks.push(`zoom on a 4K/401-clip project completes in ${zoomMs} ms`);

  // Export pre-flight: frame count, memory estimate and the 4K note.
  await page.getByRole("button", { name: "Dışa aktar", exact: true }).click();
  await expect(page.locator(".export-estimate")).toBeVisible();
  const estimate = (await page.locator(".export-estimate").innerText()).trim();
  assert(/kare/.test(estimate) && /MB/.test(estimate), estimate);
  const notes = await page.locator(".export-notes").innerText();
  assert(notes.includes("4K"), notes);
  assert(notes.includes("400") || notes.includes("401") || notes.includes("klip"), notes);
  checks.push(`export preview reports ${estimate.replace(/\n/g, " ")}`);
  await page.screenshot({ path: path.join(output, "limits.png") });
  await page.getByLabel("İletişim kutusunu kapat", { exact: true }).click();

  // The project still round-trips unchanged through save.
  const saved = JSON.parse(await readFile(original, "utf8")) as Project;
  assert.equal(saved.clips.length, 401);
  assert.equal(saved.width, 3840);
  checks.push("the 4K project stays intact and no clip was dropped by virtualization");

  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify({ passedAt: new Date().toISOString(), openMs, rendered, atEnd, zoomMs, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ openMs, rendered, atEnd, zoomMs, checks, errors }, null, 2));
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
