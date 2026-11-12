/**
 * Real desktop drag & drop: files without an OS path (the same situation as a
 * drop from a browser or archive) are copied into the profile folder, probed
 * with the bundled/system FFprobe, added to the project and exported.
 */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { generateFixtures } from "../scripts/generate-fixtures";
import { probeFile } from "../electron/media";

const root = process.cwd();
const output = path.join(root, ".test-output", "drop-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const fixtures = await generateFixtures(path.join(output, "media"));
const exported = path.join(output, "drop-export.mp4");
const saved = path.join(output, "drop-project.cevikedit");

const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
env.CEVIKEDIT_USER_DATA = path.join(output, "user-data");
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
// Force the FFprobe discovery path users actually hit: no shell PATH.
const shellPath = env.PATH;
env.PATH = "";

const app = await electron.launch({
  args: [path.join(root, "dist-electron", "main.cjs")],
  env,
  timeout: 30_000,
});
let page: Page | undefined;
const errors: string[] = [];
const checks: string[] = [];
try {
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(
    ({ dialog }, files) => {
      (dialog as any).showSaveDialog = async (...args: any[]) => ({
        canceled: false,
        filePath: args.at(-1)?.defaultPath?.endsWith(".mp4")
          ? files.exported
          : files.saved,
      });
      (dialog as any).showMessageBox = async () => ({ response: 2 });
    },
    { exported, saved },
  );
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".media-item")).toHaveCount(0);

  const videoBytes = (await readFile(fixtures.video)).toString("base64");
  const audioBytes = (await readFile(fixtures.audio)).toString("base64");
  const dropFiles = async (files: { name: string; data: string; type: string }[]) =>
    page!.evaluate(async (payload) => {
      const transfer = new DataTransfer();
      for (const entry of payload) {
        const binary = atob(entry.data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1)
          bytes[index] = binary.charCodeAt(index);
        transfer.items.add(new File([bytes], entry.name, { type: entry.type }));
      }
      const shell = document.querySelector(".app-shell")!;
      shell.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
      const overlay = await new Promise<boolean>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve(Boolean(document.querySelector(".drop-overlay"))),
          ),
        ),
      );
      shell.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
      return overlay;
    }, files);

  const overlayVisible = await dropFiles([
    { name: "sürüklenen video.mp4", data: videoBytes, type: "video/mp4" },
    { name: "bırakılan ses.wav", data: audioBytes, type: "audio/wav" },
  ]);
  assert(overlayVisible, "the drop target overlay must appear while dragging files");
  checks.push("drop overlay appears while files are dragged over the window");

  await expect(page.locator(".media-item")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.locator(".drop-overlay")).toHaveCount(0);
  checks.push("dropped files without an OS path become project media");

  const copied = await readdir(path.join(output, "user-data", "dropped"));
  assert.equal(copied.length, 2, "both files are copied into the profile folder");
  checks.push("bytes are copied into the profile folder before probing");

  const videoAsset = await page.evaluate(
    () => (window as any).__cevikeditDebugMedia ?? null,
  );
  void videoAsset;

  // Metadata proves FFprobe ran with an empty PATH, i.e. discovery succeeded.
  const items = await page.locator(".media-item").evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: node.textContent ?? "",
      title: node.getAttribute("title") ?? "",
    })),
  );
  assert(
    items.some((item) => item.label.includes("sürüklenen video")),
    `dropped video listed: ${JSON.stringify(items)}`,
  );
  assert(
    items.some((item) => item.label.includes("bırakılan ses")),
    `dropped audio listed: ${JSON.stringify(items)}`,
  );
  checks.push("Turkish file names survive the copy and appear in the library");

  await expect(page.locator(".media-item").first()).toContainText(/\d{2}:\d{2}/);

  // Add both assets to the timeline and produce a real H.264/AAC render.
  await page.locator(".media-item").first().dblclick();
  await expect(page.locator(".tl-clip")).toHaveCount(1);
  await page.getByRole("button", { name: "Dışa aktar", exact: true }).click();
  await page.getByRole("button", { name: "Dışa aktarmayı başlat", exact: true }).click();
  await expect(page.getByText("Dışa aktarma tamamlandı", { exact: true })).toBeVisible({
    timeout: 180_000,
  });
  const info = await stat(exported);
  assert(info.size > 4096, "export produced a non-trivial MP4");
  const probe = await probeFile(exported);
  const videoStream = probe.streams.find((stream) => stream.codec_type === "video");
  const audioStream = probe.streams.find((stream) => stream.codec_type === "audio");
  assert.equal(videoStream?.width, 1920);
  assert.equal(videoStream?.height, 1080);
  assert.equal(videoStream?.codec_name, "h264");
  assert(audioStream, "the render keeps the source audio");
  assert.equal(audioStream?.codec_name, "aac");
  const duration = Number(probe.format?.duration ?? 0);
  assert(duration > 3, `render duration ${duration}`);
  checks.push("dropped media renders a real 1920×1080 H.264/AAC file");

  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passedAt: new Date().toISOString(),
        shellPathInherited: Boolean(shellPath && process.env.PATH?.includes("ffmpeg")),
        checks,
        items,
        export: {
          bytes: info.size,
          video: videoStream?.codec_name,
          audio: audioStream?.codec_name,
          width: videoStream?.width,
          height: videoStream?.height,
        },
        errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await app.close();
}
