/** Real UI controls + serialized project assertions, isolated synthetic captions only. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createClip, createProject } from "../src/core/model";
import type { Project } from "../src/core/types";
const root = process.cwd(), output = path.join(root, ".test-output/subtitle-electron");
await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
const project = createProject("Altyazı toplu düzenleme kabulü");
const title = createClip(undefined, project.tracks[0].id, 0, 30); title.text!.text = "Açılış başlığını koru"; title.duration = 2; project.clips.push(title);
const original = path.join(output, "fixture.cevikedit"), saved = path.join(output, "edited.cevikedit"), subtitles = path.join(output, "captions.srt"), exported = path.join(output, "captions-export.srt");
await writeFile(original, JSON.stringify(project));
await writeFile(subtitles, "1\n00:00:02,000 --> 00:00:05,000\nBirinci [a].*\n\n2\n00:00:06,000 --> 00:00:09,000\nİkinci [a].*\n\n3\n00:00:09,000 --> 00:00:12,000\nÜçüncü\n");
const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
env.CEVIKEDIT_USER_DATA = path.join(output, "user-data"); delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
const packaged = process.env.CEVIKEDIT_TEST_APP;
if (packaged) { env.PATH = ""; delete env.CEVIKEDIT_FFMPEG; delete env.CEVIKEDIT_FFPROBE; }
const app = await electron.launch({ ...(packaged ? { executablePath: path.join(path.resolve(packaged), "Contents/MacOS/CevikEdit"), args: [], cwd: output } : { args: [path.join(root, "dist-electron/main.cjs")] }), env });
let page: Page | undefined; const errors: string[] = [], checks: string[] = [];
try {
  await app.evaluate(({ dialog }, files) => {
    const state = globalThis as unknown as { __cevikeditOpened?: number };
    state.__cevikeditOpened = 0;
    (dialog as any).showOpenDialog = async (...args: any[]) => {
      if (args.at(-1).title !== "CevikEdit projesi aç") return { canceled: false, filePaths: [files.subtitles] };
      // The first open loads the fixture, every later open reloads the saved project.
      return { canceled: false, filePaths: [state.__cevikeditOpened!++ === 0 ? files.original : files.saved] };
    };
    (dialog as any).showSaveDialog = async (...args: any[]) => ({ canceled: false, filePath: args.at(-1).defaultPath?.endsWith(".srt") ? files.exported : files.saved });
    (dialog as any).showMessageBox = async () => ({ response: 2 });
  }, { original, subtitles, saved, exported });
  page = await app.firstWindow(); page.on("pageerror", e => errors.push(e.message));
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(1);
  await page.getByRole("button", { name: "Altyazı", exact: true }).click();
  await page.getByRole("button", { name: "Altyazı dosyası içe aktar", exact: true }).click();
  await expect(page.locator(".subtitle-cue")).toHaveCount(3);
  checks.push("SRT import selects the new subtitle track without mixing the existing title");
  let firstSave = true;
  async function save(): Promise<Project> {
    const before = await stat(saved).then(s => s.mtimeMs).catch(() => -1);
    if (firstSave) {
      firstSave = false; await page!.getByRole("button", { name: "Dosya menüsü", exact: true }).click(); await page!.getByRole("button", { name: "Farklı kaydet", exact: false }).click();
    } else await page!.getByRole("button", { name: "Projeyi kaydet", exact: true }).click();
    await expect.poll(() => stat(saved).then(s => s.mtimeMs).catch(() => -1)).toBeGreaterThan(before);
    return JSON.parse(await readFile(saved, "utf8"));
  }
  const imported = await save(), cues = imported.clips.filter(c => c.id !== title.id);
  await page.getByRole("textbox", { name: "Altyazı ara", exact: true }).fill("[a].*");
  await expect(page.locator(".subtitle-cue")).toHaveCount(2);
  await page.getByRole("checkbox", { name: "Arama sonucunu seç", exact: true }).check();
  await page.getByRole("tab", { name: "Bul ve değiştir", exact: true }).click();
  await page.getByRole("textbox", { name: "Altyazı metnini ara", exact: true }).fill("[a].*");
  await page.getByRole("textbox", { name: "Altyazı metnini değiştir", exact: true }).fill("$& gerçek değiştirme");
  await page.getByRole("button", { name: "Değişiklikleri denetle", exact: true }).click();
  await page.getByRole("button", { name: "2 değişikliği uygula", exact: true }).click();
  let edited = await save();
  assert.equal(edited.clips.find(c => c.id === cues[0].id)!.text!.text, "Birinci $& gerçek değiştirme");
  assert.deepEqual(edited.clips.find(c => c.id === title.id), imported.clips.find(c => c.id === title.id));
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  edited = await save(); assert.deepEqual(edited.clips, imported.clips);
  checks.push("literal replacement is scoped to filtered selection; one undo restores both cues and title is untouched");

  await page.getByRole("textbox", { name: "Altyazı ara", exact: true }).fill("");
  await page.getByRole("checkbox", { name: "Arama sonucunu seç", exact: true }).check();
  await page.getByRole("tab", { name: "Zaman kaydırma", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Altyazı kaydırma saniyesi", exact: true }).fill("0.049");
  await page.getByRole("button", { name: "Değişiklikleri denetle", exact: true }).click();
  await page.getByRole("button", { name: "3 değişikliği uygula", exact: true }).click();
  edited = await save(); assert(Math.abs(edited.clips.find(c => c.id === cues[0].id)!.start - (2 + 1 / 30)) < 1e-9);
  checks.push("batch offsets align to project frames while preserving nonzero cue times");

  const firstCue = page.locator(`[data-cue-id="${cues[0].id}"]`);
  await firstCue.locator(".subtitle-cue-content").click();
  await page.getByRole("textbox", { name: "Altyazı içeriği", exact: true }).fill("Altyazıları tek tek düzenle");
  await page.getByRole("spinbutton", { name: "Altyazı başlangıç zamanı", exact: true }).fill("3");
  await page.getByRole("spinbutton", { name: "Altyazı bitiş zamanı", exact: true }).fill("4.5");
  await page.getByRole("button", { name: "Bunu kaydet", exact: true }).click();
  edited = await save(); assert.equal(edited.clips.find(c => c.id === cues[0].id)!.start, 3); assert.equal(edited.clips.find(c => c.id === cues[0].id)!.duration, 1.5);
  checks.push("single cue text and absolute range persist via native project save");

  await firstCue.locator(".subtitle-cue-content").click();
  await page.getByRole("textbox", { name: "Altyazı içeriği", exact: true }).fill("Yeni durumun üzerine yazmamalı");
  await page.getByRole("button", { name: "Altyazı kanalını kilitle", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bunu kaydet", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Değişiklikleri denetle", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Altyazı kanalının kilidini aç", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bunu kaydet", exact: true })).toBeDisabled();
  checks.push("locked tracks disable edits; unlocked but stale cue forms cannot overwrite newer project state");
  await page.getByRole("button", { name: "İptal", exact: true }).click();

  await page.getByRole("spinbutton", { name: "Altyazı kaydırma saniyesi", exact: true }).fill("1");
  await page.getByRole("button", { name: "Değişiklikleri denetle", exact: true }).click();
  await page.getByRole("button", { name: "Altyazı kanalını kilitle", exact: true }).click();
  await page.getByRole("button", { name: "Altyazı kanalının kilidini aç", exact: true }).click();
  await expect(page.getByRole("button", { name: "3 değişikliği uygula", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Yeniden denetle", exact: true }).click();
  await page.getByRole("button", { name: "3 değişikliği uygula", exact: true }).click();
  checks.push("stale batch plans require fresh validation after timeline changes");

  await page.getByRole("tab", { name: "Stili eşitle", exact: true }).click();
  await page.getByRole("combobox", { name: "Altyazı stili referansı", exact: true }).selectOption(cues[0].id);
  // Change the reference through the existing inspector, then copy with the new batch form.
  await firstCue.locator(".subtitle-cue-content").click();
  await page.locator(".inspector").getByRole("spinbutton", { name: "Yazı boyutu", exact: true }).fill("90");
  await page.locator(".inspector").getByRole("spinbutton", { name: "Yazı boyutu", exact: true }).blur();
  await page.getByRole("button", { name: "Değişiklikleri denetle", exact: true }).click();
  await page.getByRole("button", { name: "2 değişikliği uygula", exact: true }).click();
  edited = await save();
  assert(edited.clips.filter(c => c.trackId === cues[0].trackId).every(c => c.text!.fontSize === 90));
  assert.equal(edited.clips.find(c => c.id === cues[1].id)!.text!.text, "İkinci [a].*");
  checks.push("copying reference style keeps independent cue text");

  const clearSelection = async () => {
    const clear = page!.getByRole("button", { name: /^Temizle/ });
    if (await clear.isEnabled()) await clear.click();
  };
  const cueBox = (id: string) => page!.locator(`[data-cue-id="${id}"]`).locator('input[type="checkbox"]');
  const seekSeconds = async (time: number) => {
    await page!.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page!.keyboard.press("Home");
    const whole = Math.floor(time + 1e-6);
    for (let index = 0; index < whole; index += 1) await page!.keyboard.press("Shift+ArrowRight");
    const frames = Math.round((time - whole) * 30);
    for (let index = 0; index < frames; index += 1) await page!.keyboard.press("ArrowRight");
    await page!.waitForTimeout(120);
  };

  await clearSelection();
  await cueBox(cues[0].id).check();
  await page.getByRole("tab", { name: "Böl / birleştir", exact: true }).click();
  await seekSeconds(4.5);
  await page.getByRole("button", { name: "Oynatma konumunda böl", exact: true }).click();
  edited = await save();
  let trackCues = edited.clips.filter(c => c.trackId === cues[0].trackId).sort((a, b) => a.start - b.start);
  assert.equal(trackCues.length, 4);
  assert.equal(trackCues[0].start, 4);
  assert.equal(trackCues[0].duration, 0.5);
  assert.equal(trackCues[0].text!.text, "Altyazıları");
  assert.equal(trackCues[1].start, 4.5);
  assert.equal(trackCues[1].duration, 1);
  assert.equal(trackCues[1].text!.text, "tek tek düzenle");
  assert.deepEqual(edited.clips.find(c => c.id === title.id), imported.clips.find(c => c.id === title.id));
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  edited = await save();
  trackCues = edited.clips.filter(c => c.trackId === cues[0].trackId).sort((a, b) => a.start - b.start);
  assert.equal(trackCues.length, 3);
  assert.equal(trackCues[0].text!.text, "Altyazıları tek tek düzenle");
  checks.push("frame-aligned split divides the cue text and one undo restores the original cue");

  await cueBox(cues[1].id).check();
  await cueBox(cues[2].id).check();
  await page.getByRole("button", { name: "Seçili altyazıları birleştir", exact: true }).click();
  edited = await save();
  trackCues = edited.clips.filter(c => c.trackId === cues[0].trackId).sort((a, b) => a.start - b.start);
  assert.equal(trackCues.length, 2);
  assert.equal(trackCues[1].id, cues[1].id);
  assert.equal(trackCues[1].text!.text, "İkinci [a].*\nÜçüncü");
  assert.equal(trackCues[1].start, 7 + 1 / 30);
  assert.equal(trackCues[1].start + trackCues[1].duration, 13 + 1 / 30);
  assert.deepEqual(edited.clips.find(c => c.id === title.id), imported.clips.find(c => c.id === title.id));
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  edited = await save();
  assert.equal(edited.clips.filter(c => c.trackId === cues[0].trackId).length, 3);
  checks.push("touching captions merge with a newline and one undo restores every cue and the title");

  await clearSelection();
  await cueBox(cues[0].id).check();
  await page.getByRole("tab", { name: "Stili eşitle", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Altyazı yazı boyutu", exact: true }).fill("71");
  await page.screenshot({ path: path.join(output, "subtitle-style.png") });
  await page.getByRole("button", { name: "Değişiklikleri denetle", exact: true }).click();
  await page.getByRole("button", { name: "1 değişikliği uygula", exact: true }).click();
  edited = await save();
  assert.equal(edited.clips.find(c => c.id === cues[0].id)!.text!.fontSize, 71);
  assert.equal(edited.clips.find(c => c.id === cues[0].id)!.text!.text, "Altyazıları tek tek düzenle");
  assert.equal(edited.clips.find(c => c.id === cues[1].id)!.text!.fontSize, 90);
  checks.push("direct editable style applies only to the selected cue and preserves its text");

  await page.getByRole("tab", { name: "Metin animasyonu", exact: true }).click();
  await page.getByRole("combobox", { name: "Altyazı giriş animasyonu", exact: true }).selectOption("slideUp");
  await page.getByRole("combobox", { name: "Altyazı bekleme animasyonu", exact: true }).selectOption("pulse");
  await page.getByRole("combobox", { name: "Altyazı çıkış animasyonu", exact: true }).selectOption("fade");
  await page.getByRole("spinbutton", { name: "Altyazı giriş süresi", exact: true }).fill("0.3");
  await page.getByRole("spinbutton", { name: "Altyazı çıkış süresi", exact: true }).fill("0.3");
  await page.screenshot({ path: path.join(output, "subtitle-animation.png") });
  await page.getByRole("button", { name: "Değişiklikleri denetle", exact: true }).click();
  await page.getByRole("button", { name: "1 değişikliği uygula", exact: true }).click();
  edited = await save();
  let animated = edited.clips.find(c => c.id === cues[0].id)!;
  assert(Math.abs(animated.fadeIn - 0.3) < 1e-9);
  assert(Math.abs(animated.fadeOut - 0.3) < 1e-9);
  assert(animated.keyframes.some(k => k.property === "y"));
  assert(animated.keyframes.some(k => k.property === "scale" && k.value > 1));
  checks.push("uniform entrance, hold and exit animation is stored as fades and keyframes on the cue");

  const brightPixels = () => page!.evaluate(() => {
    const canvas = document.querySelector('canvas[aria-label="Video önizlemesi"]') as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let bright = 0;
    for (let index = 0; index < data.length; index += 4)
      if (data[index] > 180 && data[index + 1] > 180 && data[index + 2] > 180) bright++;
    return bright;
  });
  await seekSeconds(4);
  const entrancePixels = await brightPixels();
  await seekSeconds(4.75);
  const steadyPixels = await brightPixels();
  await seekSeconds(5.45);
  const exitPixels = await brightPixels();
  assert(steadyPixels > 100, `expected visible caption at hold, got ${steadyPixels}`);
  assert(steadyPixels > entrancePixels * 2, `entrance ${entrancePixels} vs hold ${steadyPixels}`);
  assert(steadyPixels > exitPixels * 2, `exit ${exitPixels} vs hold ${steadyPixels}`);
  checks.push("preview renders the animated caption invisibly at entry, fully during hold and faint at exit");

  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  edited = await save();
  animated = edited.clips.find(c => c.id === cues[0].id)!;
  assert.equal(animated.fadeIn, 0);
  assert.equal(animated.fadeOut, 0);
  assert(!animated.keyframes.some(k => k.property === "y"));
  await page.getByRole("button", { name: "Yinele", exact: true }).click();
  edited = await save();
  animated = edited.clips.find(c => c.id === cues[0].id)!;
  assert(Math.abs(animated.fadeIn - 0.3) < 1e-9);
  checks.push("animation apply, undo and redo each commit one whole project step");

  await page.getByRole("button", { name: "Tümünü SRT olarak dışa aktar", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("stil, konum veya animasyon içermez");
  await expect(page.getByText("SRT / WebVTT yalnızca zaman ve metni saklar", { exact: false })).toBeVisible();
  await expect.poll(() => readFile(exported, "utf8").catch(() => "")).toContain("Altyazıları tek tek düzenle");
  assert(!(await readFile(exported, "utf8")).includes("keyframes"));
  checks.push("SRT export keeps text only and states that styles, position and animation are not saved");

  await page.getByRole("button", { name: "Dosya menüsü", exact: true }).click();
  await page.getByRole("button", { name: "Proje aç", exact: false }).click();
  await expect(page.locator(".subtitle-cue")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Geri al", exact: true })).toBeDisabled();
  await expect(page.locator(`[data-cue-id="${cues[0].id}"]`)).toContainText("Altyazıları tek tek düzenle");
  await expect(page.locator(".tl-clip")).toHaveCount(4);
  checks.push("reopened project keeps the edited cues, title and cleared history from disk");
  await page.screenshot({ path: path.join(output, "subtitle-editor.png") });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "evidence.json"), JSON.stringify({ passedAt: new Date().toISOString(), packaged: !!packaged, checks, errors }, null, 2));
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
