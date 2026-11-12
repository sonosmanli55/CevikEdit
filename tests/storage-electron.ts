/** Real desktop storage flows; native dialogs deferred only in this owned test process. */
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { generateFixtures } from "../scripts/generate-fixtures";
import type { Project } from "../src/core/types";

const root = process.cwd(),
  output = path.join(root, ".test-output", "storage-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const fixture = await generateFixtures(path.join(output, "media"));
const saved = path.join(output, "storage.cevikedit"),
  backup = path.join(output, "replacement.mp4");
await copyFile(fixture.video, backup);
const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
env.CEVIKEDIT_USER_DATA = path.join(output, "user-data");
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const errors: string[] = [];
let app!: ElectronApplication;
let page!: Page;
const launch = async () => {
  app = await electron.launch({
    args: [path.join(root, "dist-electron", "main.cjs")],
    env,
    timeout: 30000,
  });
  await app.evaluate(
    ({ dialog }, p) => {
      const g = globalThis as any;
      g.deferSave = false;
      g.deferOpen = false;
      g.closePrompts = 0;
      (dialog as any).showSaveDialog = async () =>
        g.deferSave
          ? new Promise((resolve) => {
              g.releaseSave = () =>
                resolve({ canceled: false, filePath: p.saved });
            })
          : { canceled: false, filePath: p.saved };
      (dialog as any).showOpenDialog = async (...args: any[]) => {
        const options = args[args.length - 1];
        const file =
          options.title === "Medya içe aktar"
            ? p.video
            : options.title === "CevikEdit projesi aç"
              ? p.saved
              : p.backup;
        if (g.deferOpen)
          return new Promise((resolve) => {
            g.releaseOpen = () =>
              resolve({ canceled: false, filePaths: [file] });
          });
        return { canceled: false, filePaths: [file] };
      };
      (dialog as any).showMessageBox = async () => {
        g.closePrompts++;
        return { response: 1, checkboxChecked: false };
      };
    },
    { saved, backup, video: fixture.video },
  );
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.waitForSelector(".app-shell");
};
const read = async (): Promise<Project> =>
  JSON.parse(await readFile(saved, "utf8"));
const setName = async (name: string) => {
  await page.locator(".project-title input").fill(name);
  await page.locator(".project-title input").blur();
};
const addText = async (text: string) => {
  await page
    .locator(".resource-tabs")
    .getByRole("button", { name: "Metin", exact: true })
    .click();
  await page.getByRole("button", { name: "Metin ekle", exact: true }).click();
  await page.getByRole("textbox", { name: "Metin içeriği", exact: true }).fill(text);
  await page.getByRole("textbox", { name: "Metin içeriği", exact: true }).blur();
};
const save = async () => {
  await page.getByRole("button", { name: "Projeyi kaydet", exact: true }).click();
  await expect(page.locator(".save-dot")).not.toHaveClass(/dirty/);
  return read();
};
try {
  await launch();
  await setName("Kaydetme anındaki anlık görüntü");
  await app.evaluate(() => {
    (globalThis as any).deferSave = true;
  });
  await page.getByRole("button", { name: "Projeyi kaydet", exact: true }).click();
  await expect
    .poll(() => app.evaluate(() => Boolean((globalThis as any).releaseSave)))
    .toBe(true);
  await setName("Kaydetme sırasında düzenlemeye devam");
  await app.evaluate(() => {
    (globalThis as any).releaseSave();
    (globalThis as any).deferSave = false;
  });
  await expect
    .poll(async () =>
      read()
        .then((p) => p.name)
        .catch(() => null),
    )
    .toBe("Kaydetme anındaki anlık görüntü");
  await expect(page.locator(".save-dot")).toHaveClass(/dirty/);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close();
  });
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).closePrompts))
    .toBe(1);
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    1,
    "Unsaved changes must keep the window open after Cancel",
  );
  assert.equal((await save()).name, "Kaydetme sırasında düzenlemeye devam");
  await addText("Otomatik kurtarmanın koruduğu içerik");
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const p = await window.editorAPI!.getAutosave();
          return p?.clips.some((c) => c.text?.text === "Otomatik kurtarmanın koruduğu içerik");
        }),
      { timeout: 10000 },
    )
    .toBe(true);
  await app.evaluate(({ dialog }) => {
    (dialog as any).showMessageBox = async () => ({ response: 2 });
  });
  await app.close();
  await launch();
  await expect(
    page.getByRole("dialog", { name: "Son düzenlemeyi geri yükle", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Projeyi geri yükle", exact: true }).click();
  await expect(page.locator(".project-title input")).toHaveValue(
    "Kaydetme sırasında düzenlemeye devam",
  );
  // Restoring autosave swaps the whole project into the store; a slow runner can
  // still be applying it when the dialog closes, so wait for the recovered clip.
  await expect
    .poll(
      async () =>
        (await save()).clips.some(
          (c) => c.text?.text === "Otomatik kurtarmanın koruduğu içerik",
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  await page
    .locator(".resource-tabs")
    .getByRole("button", { name: "Medya", exact: true })
    .click();
  await page.locator(".media-import").click();
  await expect(page.locator(".media-item")).toHaveCount(1, { timeout: 30000 });
  let project = await save();
  const video = project.assets[0];
  await page.locator(`[data-asset-id="${video.id}"]`).dblclick();
  project = await save();
  await rm(fixture.video);
  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Eksik medyayı yeniden bağla", exact: true }),
  ).toBeVisible();
  await app.evaluate(() => {
    (globalThis as any).deferOpen = true;
  });
  await page
    .getByRole("button", { name: "Eksik medyayı yeniden bağla", exact: true })
    .click();
  await expect
    .poll(() => app.evaluate(() => Boolean((globalThis as any).releaseOpen)))
    .toBe(true);
  await addText("Yeniden bağlama sırasında eklenen metin");
  await app.evaluate(() => {
    (globalThis as any).releaseOpen();
    (globalThis as any).deferOpen = false;
  });
  await expect(
    page.getByRole("button", { name: "Eksik medyayı yeniden bağla", exact: true }),
  ).toHaveCount(0, { timeout: 30000 });
  project = await save();
  assert.equal(project.assets[0].path, backup);
  assert(project.clips.some((c) => c.text?.text === "Yeniden bağlama sırasında eklenen metin"));
  // Switching projects while a Save As dialog is pending must not attach the old path to a new project.
  await app.evaluate(() => {
    (globalThis as any).deferSave = true;
    (globalThis as any).releaseSave = undefined;
  });
  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Farklı kaydet", exact: false }).click();
  await expect
    .poll(() => app.evaluate(() => Boolean((globalThis as any).releaseSave)))
    .toBe(true);
  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Yeni proje", exact: false }).click();
  await app.evaluate(() => {
    (globalThis as any).releaseSave();
    (globalThis as any).deferSave = false;
  });
  await expect(
    page.getByText("Özgün projenin anlık görüntüsü kaydedildi", { exact: true }),
  ).toBeVisible();
  await setName("Değiştirmeden sonra bağımsız yeni proje");
  await app.evaluate(() => {
    (globalThis as any).deferSave = true;
    (globalThis as any).releaseSave = undefined;
  });
  await page.getByRole("button", { name: "Projeyi kaydet", exact: true }).click();
  await expect
    .poll(() => app.evaluate(() => Boolean((globalThis as any).releaseSave)))
    .toBe(true);
  await app.evaluate(() => {
    (globalThis as any).releaseSave();
    (globalThis as any).deferSave = false;
  });
  await expect(page.locator(".save-dot")).not.toHaveClass(/dirty/);
  assert.deepEqual(errors, []);
  const evidence = {
    passedAt: new Date().toISOString(),
    checks: [
      "save snapshot keeps later edits dirty",
      "native close Cancel preserves window",
      "save latest snapshot",
      "autosave recovery after relaunch",
      "missing source detection",
      "relink preserves simultaneous edits",
      "project switch during save does not attach stale path",
    ],
    errors,
  };
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log("Desktop storage checks passed:", evidence);
} catch (error) {
  if (page!)
    await page
      .screenshot({ path: path.join(output, "failure.png") })
      .catch(() => {});
  throw error;
} finally {
  if (app!) {
    await app
      .evaluate(({ dialog }) => {
        (dialog as any).showMessageBox = async () => ({ response: 2 });
      })
      .catch(() => {});
    await app.close().catch(() => {});
  }
}
