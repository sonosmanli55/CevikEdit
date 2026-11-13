/**
 * Packaged Windows build smoke test (Release candidate 0.6.0).
 *
 * Launches the real installed-layout binary from `release/win-unpacked`, with an
 * isolated user-data folder, the shipped Turkish language, a built-in template
 * and a real FFmpeg export. Dialogs are stubbed only inside this test process.
 */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { probeFile } from "../electron/media";

const root = process.cwd();
const executable = process.env.CEVIKEDIT_PACKAGED_APP
  ? path.resolve(process.env.CEVIKEDIT_PACKAGED_APP)
  : path.join(root, "release", "win-unpacked", "CevikEdit.exe");
await stat(executable).catch(() => {
  throw new Error(`Paketlenmiş uygulama bulunamadı: ${executable}`);
});
const output = path.join(root, ".test-output", "package-win-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const saved = path.join(output, "paket-projesi.cevikedit");
const exported = path.join(output, "paket-render.mp4");

const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
env.CEVIKEDIT_USER_DATA = path.join(output, "user-data");
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
// The installer must import and export with its own FFmpeg: no shell PATH and no
// saved tool override, which is exactly the situation reported by users.
env.PATH = "";
delete env.CEVIKEDIT_FFMPEG;
delete env.CEVIKEDIT_FFPROBE;

const app = await electron.launch({
  executablePath: executable,
  args: [],
  cwd: output,
  env,
  timeout: 60_000,
});
let page: Page | undefined;
const errors: string[] = [];
const checks: string[] = [];
try {
  await app.evaluate(
    ({ dialog }, files) => {
      (dialog as any).showSaveDialog = async (...args: any[]) => {
        const options = args[args.length - 1];
        const wantsVideo =
          typeof options.defaultPath === "string" &&
          /\.(mp4|mov)$/i.test(options.defaultPath);
        return { canceled: false, filePath: wantsVideo ? files.exported : files.saved };
      };
      (dialog as any).showMessageBox = async () => ({ response: 0 });
    },
    { saved, exported },
  );
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".app-shell", { timeout: 60_000 });

  const info = await page.evaluate(() => window.editorAPI!.getSystemInfo());
  assert.equal(info.version, "0.11.0", `paket sürümü ${info.version}`);
  assert.equal(info.platform, "win32");
  checks.push(`packaged binary reports version ${info.version} on ${info.platform}`);

  // Turkish-only shell, no Chinese source strings anywhere.
  const body = await page.locator("body").innerText();
  assert(!/[\u4e00-\u9fff]/.test(body), body.slice(0, 300));
  for (const label of ["Medya", "Ses", "Metin", "Çıkartma", "Efekt", "Geçiş", "Altyazı", "Şablonlar"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  checks.push("every resource tab in the packaged app renders Turkish only");

  // Create a project from a built-in template using the bundled default media.
  await page.getByRole("button", { name: "Şablonlar", exact: true }).click();
  await expect(page.locator(".template-card")).toHaveCount(3);
  await page.locator(".template-open").filter({ hasText: "Açılış kartı" }).click();
  await page.getByRole("textbox", { name: "Yeni proje adı", exact: true }).fill("Paket kabul");
  await page.getByRole("combobox", { name: /Yer tutucu:/ }).first().selectOption({ index: 1 });
  await page.getByRole("textbox", { name: /Metin:/ }).first().fill("Paket başlığı");
  await page.getByRole("button", { name: "Bu şablonla proje oluştur", exact: true }).click();
  await expect(page.locator(".templates-notice")).toContainText("oluşturuldu");
  await page.getByRole("button", { name: "Medya", exact: true }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(3);
  checks.push("the packaged app creates a project from a template with its bundled media");

  // Save and export through the real native dialogs and FFmpeg.
  await page.getByRole("button", { name: "Projeyi kaydet", exact: true }).click();
  await expect.poll(() => stat(saved).then((s) => s.size).catch(() => 0)).toBeGreaterThan(100);
  const project = JSON.parse(await readFile(saved, "utf8")) as {
    name: string;
    assets: Array<{ path: string }>;
  };
  assert.equal(project.name, "Paket kabul");
  assert(project.assets.length > 0);
  checks.push("the packaged app saves a validated project to disk");

  await page.getByRole("button", { name: "Dışa aktar", exact: true }).click();
  await page.getByRole("button", { name: "Dışa aktarmayı başlat", exact: true }).click();
  await expect.poll(() => stat(exported).then((s) => s.size).catch(() => 0), {
    timeout: 180_000,
  }).toBeGreaterThan(10_000);
  const probe = await probeFile(exported);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  assert(video && video.codec_name === "h264", "video stream");
  assert(Number(probe.format.duration) > 4, "duration");
  checks.push(
    `packaged export produced ${video.width}×${video.height} H.264, ${Number(probe.format.duration).toFixed(1)} s`,
  );

  await page.screenshot({ path: path.join(output, "paket.png") });
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify(
      {
        passedAt: new Date().toISOString(),
        executable,
        version: info.version,
        ffmpeg: info.ffmpeg,
        ffmpegPath: info.ffmpegPath,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ version: info.version, checks, errors }, null, 2));
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    await writeFile(
      path.join(output, "failure.txt"),
      await page.locator("body").innerText(),
    ).catch(() => {});
  }
  throw error;
} finally {
  if (page) await page.evaluate(() => window.editorAPI?.setDirty(false)).catch(() => {});
  await app.close();
}
