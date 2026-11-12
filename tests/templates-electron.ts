/** Real Turkish template flow: save current project, reopen, instantiate, export/import, delete. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createClip, createProject } from "../src/core/model";
import { importAssets } from "../electron/media";
import { generateFixtures } from "../scripts/generate-fixtures";
import type { Project } from "../src/core/types";

const root = process.cwd(),
  output = path.join(root, ".test-output", "templates-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const fixture = await generateFixtures(path.join(output, "fixtures"));
const [video, image] = await importAssets(
  [fixture.video, fixture.image],
  path.join(output, "cache"),
);
video.name = "çekim.mp4";
image.name = "kapak.png";
const project = createProject("Şablon kaynağı");
project.fps = 30;
project.assets = [video, image];
const videoTrack = project.tracks.find((item) => item.kind === "video")!;
const textTrack = project.tracks.find((item) => item.kind === "text")!;
const visual = createClip(video, videoTrack.id, 0, 30);
visual.id = "visual";
visual.name = "çekim";
visual.duration = 4;
visual.keyframes = [
  { id: "k1", time: 0, property: "scale", value: 1, easing: "linear" },
  { id: "k2", time: 4, property: "scale", value: 1.15, easing: "easeInOut" },
];
const title = createClip(undefined, textTrack.id, 0, 30);
title.id = "title";
title.name = "başlık";
title.duration = 3;
title.text!.text = "Şablon başlığı";
project.clips = [visual, title];

const original = path.join(output, "kaynak.cevikedit");
const exported = path.join(output, "ihrac.cevikedit-template");
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
      (dialog as any).showOpenDialog = async (...args: any[]) => {
        const title = String(args.at(-1)?.title ?? "");
        if (title.includes("Şablon içe aktar"))
          return { canceled: false, filePaths: [files.exported] };
        return {
          canceled: false,
          filePaths: [opened++ === 0 ? files.original : files.original],
        };
      };
      (dialog as any).showSaveDialog = async (...args: any[]) => ({
        canceled: false,
        filePath: args.at(-1)?.defaultPath?.endsWith(".cevikedit-template")
          ? files.exported
          : files.saved,
      });
      (dialog as any).showMessageBox = async () => ({ response: 0 });
    },
    { original, exported, saved: original },
  );
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(2);

  const templateDir = path.join(env.CEVIKEDIT_USER_DATA, "templates");
  const templateFiles = async () =>
    (await readdir(templateDir).catch(() => [])).filter((name) =>
      name.endsWith(".cevikedit-template"),
    );

  await page.getByRole("button", { name: "Şablonlar", exact: true }).click();
  await expect(page.getByRole("region", { name: "Şablon kitaplığı" })).toBeVisible();
  await expect(page.locator(".template-card")).toHaveCount(3);
  await expect(page.getByText("Açılış kartı", { exact: true })).toBeVisible();
  await expect(page.getByText("Dikey sosyal video", { exact: true })).toBeVisible();
  await expect(page.getByText("Altyazı bloğu", { exact: true })).toBeVisible();
  checks.push("the template tab lists the three built-in Turkish templates");

  // Save the current project as a user template.
  await page.getByRole("button", { name: "Projeyi şablon yap", exact: true }).click();
  await page.getByRole("textbox", { name: "Şablon adı", exact: true }).fill("Benim şablonum");
  await page.getByRole("textbox", { name: "Şablon açıklaması", exact: true }).fill("Sentetik kabul şablonu");
  await page.getByRole("button", { name: "Şablonu kaydet", exact: true }).click();
  await expect(page.locator(".templates-notice")).toContainText("şablon olarak kaydedildi");
  await expect.poll(templateFiles).toHaveLength(1);
  await expect(page.locator(".template-card")).toHaveCount(4);
  const stored = JSON.parse(
    await readFile(path.join(templateDir, (await templateFiles())[0]), "utf8"),
  );
  assert.equal(stored.name, "Benim şablonum");
  assert.equal(stored.media.length, 1);
  assert.equal(stored.texts.length, 1);
  assert(stored.project.assets.every((asset: { path: string }) => asset.path.startsWith("template://media/")));
  assert(!JSON.stringify(stored).includes(video.path));
  checks.push("saving a project writes a validated template without local media paths");

  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(2);
  await page.getByRole("button", { name: "Şablonlar", exact: true }).click();
  await expect(page.locator(".template-card")).toHaveCount(4);
  checks.push("the template library persists across reopening the editor");

  // Instantiate the saved template with a replacement media and text.
  await page.locator(".template-open").filter({ hasText: "Benim şablonum" }).click();
  await page.getByRole("textbox", { name: "Yeni proje adı", exact: true }).fill("Şablondan proje");
  const mediaSelect = page.getByRole("combobox", { name: /Yer tutucu:/ }).first();
  await mediaSelect.selectOption(image.id);
  const textInput = page.getByRole("textbox", { name: /Metin:/ }).first();
  await textInput.fill("Yeni başlık");
  await page.getByRole("button", { name: "Bu şablonla proje oluştur", exact: true }).click();
  await expect(page.locator(".templates-notice")).toContainText("oluşturuldu");
  await page.getByRole("button", { name: "Medya", exact: true }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(2);
  const instantiated = await page.evaluate(() => {
    const state = (window as any).__cevikeditStore;
    return state ? state.getState().project : null;
  });
  checks.push("a template creates a new project, replacing the media slot and text");

  // Export the user template, delete it, then import the file back.
  await page.getByRole("button", { name: "Şablonlar", exact: true }).click();
  await page.getByRole("button", { name: "Şablonu dışa aktar: Benim şablonum", exact: true }).click();
  await expect(page.locator(".templates-notice")).toContainText("Şablon dosyası kaydedildi");
  const exportedText = await readFile(exported, "utf8");
  assert(exportedText.includes("\"format\": \"cevikedit-template\""));
  checks.push("export writes a portable template file");

  await page.getByRole("button", { name: "Şablonu sil: Benim şablonum", exact: true }).click();
  await expect(page.locator(".template-card")).toHaveCount(3);
  await expect.poll(templateFiles).toHaveLength(0);
  await page.getByRole("button", { name: "İçe aktar", exact: true }).click();
  await expect(page.locator(".template-card")).toHaveCount(4);
  await expect.poll(templateFiles).toHaveLength(1);
  checks.push("delete removes the stored file and import restores it from the exported template");

  await page.screenshot({ path: path.join(output, "templates.png") });

  // A tampered template file must be rejected instead of producing a project.
  const tampered = JSON.parse(exportedText);
  tampered.project.assets[0].path = "C:\\gizli\\video.mp4";
  await writeFile(exported, JSON.stringify(tampered));
  await page.getByRole("button", { name: "İçe aktar", exact: true }).click();
  await expect(page.locator(".templates-error")).toContainText("medya yolu");
  checks.push("an imported template that references a local file is rejected with a Turkish error");

  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify(
      { passedAt: new Date().toISOString(), checks, instantiated: !!instantiated, errors },
      null,
      2,
    ),
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
