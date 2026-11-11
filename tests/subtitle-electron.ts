/** Real UI controls + serialized project assertions, isolated synthetic captions only. */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createClip, createProject } from "../src/core/model";
import type { Project } from "../src/core/types";
const root = process.cwd(), output = path.join(root, ".test-output/subtitle-electron");
await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
const project = createProject("字幕批量编辑验收");
const title = createClip(undefined, project.tracks[0].id, 0, 30); title.text!.text = "保留片头标题"; title.duration = 2; project.clips.push(title);
const original = path.join(output, "fixture.cevikedit"), saved = path.join(output, "edited.cevikedit"), subtitles = path.join(output, "captions.srt"), exported = path.join(output, "captions-export.srt");
await writeFile(original, JSON.stringify(project));
await writeFile(subtitles, "1\n00:00:02,000 --> 00:00:05,000\n第一条 [a].*\n\n2\n00:00:06,000 --> 00:00:09,000\n第二条 [a].*\n\n3\n00:00:09,000 --> 00:00:12,000\n第三条\n");
const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
env.CEVIKEDIT_USER_DATA = path.join(output, "user-data"); delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
const packaged = process.env.CEVIKEDIT_TEST_APP;
if (packaged) { env.PATH = ""; delete env.CEVIKEDIT_FFMPEG; delete env.CEVIKEDIT_FFPROBE; }
env.CEVIKEDIT_LOCALE = "zh";
const app = await electron.launch({ ...(packaged ? { executablePath: path.join(path.resolve(packaged), "Contents/MacOS/CevikEdit"), args: [], cwd: output } : { args: [path.join(root, "dist-electron/main.cjs")] }), env });
let page: Page | undefined; const errors: string[] = [], checks: string[] = [];
try {
  await app.evaluate(({ dialog }, files) => {
    const state = globalThis as unknown as { __cevikeditOpened?: number };
    state.__cevikeditOpened = 0;
    (dialog as any).showOpenDialog = async (...args: any[]) => {
      if (args.at(-1).title !== "打开 CevikEdit 项目") return { canceled: false, filePaths: [files.subtitles] };
      // The first open loads the fixture, every later open reloads the saved project.
      return { canceled: false, filePaths: [state.__cevikeditOpened!++ === 0 ? files.original : files.saved] };
    };
    (dialog as any).showSaveDialog = async (...args: any[]) => ({ canceled: false, filePath: args.at(-1).defaultPath?.endsWith(".srt") ? files.exported : files.saved });
    (dialog as any).showMessageBox = async () => ({ response: 2 });
  }, { original, subtitles, saved, exported });
  page = await app.firstWindow(); page.on("pageerror", e => errors.push(e.message));
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: "文件菜单", exact: true }).click();
  await page.getByRole("button", { name: "打开项目", exact: false }).click();
  await expect(page.locator(".tl-clip")).toHaveCount(1);
  await page.getByRole("button", { name: "字幕", exact: true }).click();
  await page.getByRole("button", { name: "导入字幕文件", exact: true }).click();
  await expect(page.locator(".subtitle-cue")).toHaveCount(3);
  checks.push("SRT import selects the new subtitle track without mixing the existing title");
  let firstSave = true;
  async function save(): Promise<Project> {
    const before = await stat(saved).then(s => s.mtimeMs).catch(() => -1);
    if (firstSave) {
      firstSave = false; await page!.getByRole("button", { name: "文件菜单", exact: true }).click(); await page!.getByRole("button", { name: "另存为", exact: false }).click();
    } else await page!.getByRole("button", { name: "保存项目", exact: true }).click();
    await expect.poll(() => stat(saved).then(s => s.mtimeMs).catch(() => -1)).toBeGreaterThan(before);
    return JSON.parse(await readFile(saved, "utf8"));
  }
  const imported = await save(), cues = imported.clips.filter(c => c.id !== title.id);
  await page.getByRole("textbox", { name: "搜索字幕", exact: true }).fill("[a].*");
  await expect(page.locator(".subtitle-cue")).toHaveCount(2);
  await page.getByRole("checkbox", { name: "选择搜索结果", exact: true }).check();
  await page.getByRole("tab", { name: "查找替换", exact: true }).click();
  await page.getByRole("textbox", { name: "查找字幕文字", exact: true }).fill("[a].*");
  await page.getByRole("textbox", { name: "替换字幕文字", exact: true }).fill("$& 字面替换");
  await page.getByRole("button", { name: "检查修改", exact: true }).click();
  await page.getByRole("button", { name: "应用 2 条修改", exact: true }).click();
  let edited = await save();
  assert.equal(edited.clips.find(c => c.id === cues[0].id)!.text!.text, "第一条 $& 字面替换");
  assert.deepEqual(edited.clips.find(c => c.id === title.id), imported.clips.find(c => c.id === title.id));
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  edited = await save(); assert.deepEqual(edited.clips, imported.clips);
  checks.push("literal replacement is scoped to filtered selection; one undo restores both cues and title is untouched");

  await page.getByRole("textbox", { name: "搜索字幕", exact: true }).fill("");
  await page.getByRole("checkbox", { name: "选择搜索结果", exact: true }).check();
  await page.getByRole("tab", { name: "时间偏移", exact: true }).click();
  await page.getByRole("spinbutton", { name: "字幕偏移秒数", exact: true }).fill("0.049");
  await page.getByRole("button", { name: "检查修改", exact: true }).click();
  await page.getByRole("button", { name: "应用 3 条修改", exact: true }).click();
  edited = await save(); assert(Math.abs(edited.clips.find(c => c.id === cues[0].id)!.start - (2 + 1 / 30)) < 1e-9);
  checks.push("batch offsets align to project frames while preserving nonzero cue times");

  const firstCue = page.locator(`[data-cue-id="${cues[0].id}"]`);
  await firstCue.locator(".subtitle-cue-content").click();
  await page.getByRole("textbox", { name: "字幕内容", exact: true }).fill("逐条修订字幕");
  await page.getByRole("spinbutton", { name: "字幕开始时间", exact: true }).fill("3");
  await page.getByRole("spinbutton", { name: "字幕结束时间", exact: true }).fill("4.5");
  await page.getByRole("button", { name: "保存此条", exact: true }).click();
  edited = await save(); assert.equal(edited.clips.find(c => c.id === cues[0].id)!.start, 3); assert.equal(edited.clips.find(c => c.id === cues[0].id)!.duration, 1.5);
  checks.push("single cue text and absolute range persist via native project save");

  await firstCue.locator(".subtitle-cue-content").click();
  await page.getByRole("textbox", { name: "字幕内容", exact: true }).fill("不得覆盖新状态");
  await page.getByRole("button", { name: "锁定字幕", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存此条", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "检查修改", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "解锁字幕", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存此条", exact: true })).toBeDisabled();
  checks.push("locked tracks disable edits; unlocked but stale cue forms cannot overwrite newer project state");
  await page.getByRole("button", { name: "取消", exact: true }).click();

  await page.getByRole("spinbutton", { name: "字幕偏移秒数", exact: true }).fill("1");
  await page.getByRole("button", { name: "检查修改", exact: true }).click();
  await page.getByRole("button", { name: "锁定字幕", exact: true }).click();
  await page.getByRole("button", { name: "解锁字幕", exact: true }).click();
  await expect(page.getByRole("button", { name: "应用 3 条修改", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "重新检查", exact: true }).click();
  await page.getByRole("button", { name: "应用 3 条修改", exact: true }).click();
  checks.push("stale batch plans require fresh validation after timeline changes");

  await page.getByRole("tab", { name: "统一样式", exact: true }).click();
  await page.getByRole("combobox", { name: "字幕样式参考", exact: true }).selectOption(cues[0].id);
  // Change the reference through the existing inspector, then copy with the new batch form.
  await firstCue.locator(".subtitle-cue-content").click();
  await page.locator(".inspector").getByRole("spinbutton", { name: "字号", exact: true }).fill("90");
  await page.locator(".inspector").getByRole("spinbutton", { name: "字号", exact: true }).blur();
  await page.getByRole("button", { name: "检查修改", exact: true }).click();
  await page.getByRole("button", { name: "应用 2 条修改", exact: true }).click();
  edited = await save();
  assert(edited.clips.filter(c => c.trackId === cues[0].trackId).every(c => c.text!.fontSize === 90));
  assert.equal(edited.clips.find(c => c.id === cues[1].id)!.text!.text, "第二条 [a].*");
  checks.push("copying reference style keeps independent cue text");

  const clearSelection = async () => {
    const clear = page!.getByRole("button", { name: /^清空/ });
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
  await page.getByRole("tab", { name: "拆分 / 合并", exact: true }).click();
  await seekSeconds(4.5);
  await page.getByRole("button", { name: "按播放头拆分", exact: true }).click();
  edited = await save();
  let trackCues = edited.clips.filter(c => c.trackId === cues[0].trackId).sort((a, b) => a.start - b.start);
  assert.equal(trackCues.length, 4);
  assert.equal(trackCues[0].start, 4);
  assert.equal(trackCues[0].duration, 0.5);
  assert.equal(trackCues[0].text!.text, "逐条");
  assert.equal(trackCues[1].start, 4.5);
  assert.equal(trackCues[1].duration, 1);
  assert.equal(trackCues[1].text!.text, "修订字幕");
  assert.deepEqual(edited.clips.find(c => c.id === title.id), imported.clips.find(c => c.id === title.id));
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  edited = await save();
  trackCues = edited.clips.filter(c => c.trackId === cues[0].trackId).sort((a, b) => a.start - b.start);
  assert.equal(trackCues.length, 3);
  assert.equal(trackCues[0].text!.text, "逐条修订字幕");
  checks.push("frame-aligned split divides the cue text and one undo restores the original cue");

  await cueBox(cues[1].id).check();
  await cueBox(cues[2].id).check();
  await page.getByRole("button", { name: "合并所选字幕", exact: true }).click();
  edited = await save();
  trackCues = edited.clips.filter(c => c.trackId === cues[0].trackId).sort((a, b) => a.start - b.start);
  assert.equal(trackCues.length, 2);
  assert.equal(trackCues[1].id, cues[1].id);
  assert.equal(trackCues[1].text!.text, "第二条 [a].*\n第三条");
  assert.equal(trackCues[1].start, 7 + 1 / 30);
  assert.equal(trackCues[1].start + trackCues[1].duration, 13 + 1 / 30);
  assert.deepEqual(edited.clips.find(c => c.id === title.id), imported.clips.find(c => c.id === title.id));
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  edited = await save();
  assert.equal(edited.clips.filter(c => c.trackId === cues[0].trackId).length, 3);
  checks.push("touching captions merge with a newline and one undo restores every cue and the title");

  await clearSelection();
  await cueBox(cues[0].id).check();
  await page.getByRole("tab", { name: "统一样式", exact: true }).click();
  await page.getByRole("spinbutton", { name: "字幕字号", exact: true }).fill("71");
  await page.screenshot({ path: path.join(output, "subtitle-style.png") });
  await page.getByRole("button", { name: "检查修改", exact: true }).click();
  await page.getByRole("button", { name: "应用 1 条修改", exact: true }).click();
  edited = await save();
  assert.equal(edited.clips.find(c => c.id === cues[0].id)!.text!.fontSize, 71);
  assert.equal(edited.clips.find(c => c.id === cues[0].id)!.text!.text, "逐条修订字幕");
  assert.equal(edited.clips.find(c => c.id === cues[1].id)!.text!.fontSize, 90);
  checks.push("direct editable style applies only to the selected cue and preserves its text");

  await page.getByRole("tab", { name: "文字动画", exact: true }).click();
  await page.getByRole("combobox", { name: "字幕入场动画", exact: true }).selectOption("slideUp");
  await page.getByRole("combobox", { name: "字幕停留动画", exact: true }).selectOption("pulse");
  await page.getByRole("combobox", { name: "字幕出场动画", exact: true }).selectOption("fade");
  await page.getByRole("spinbutton", { name: "字幕入场时长", exact: true }).fill("0.3");
  await page.getByRole("spinbutton", { name: "字幕出场时长", exact: true }).fill("0.3");
  await page.screenshot({ path: path.join(output, "subtitle-animation.png") });
  await page.getByRole("button", { name: "检查修改", exact: true }).click();
  await page.getByRole("button", { name: "应用 1 条修改", exact: true }).click();
  edited = await save();
  let animated = edited.clips.find(c => c.id === cues[0].id)!;
  assert(Math.abs(animated.fadeIn - 0.3) < 1e-9);
  assert(Math.abs(animated.fadeOut - 0.3) < 1e-9);
  assert(animated.keyframes.some(k => k.property === "y"));
  assert(animated.keyframes.some(k => k.property === "scale" && k.value > 1));
  checks.push("uniform entrance, hold and exit animation is stored as fades and keyframes on the cue");

  const brightPixels = () => page!.evaluate(() => {
    const canvas = document.querySelector('canvas[aria-label="视频预览"]') as HTMLCanvasElement;
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

  await page.getByRole("button", { name: "撤销", exact: true }).click();
  edited = await save();
  animated = edited.clips.find(c => c.id === cues[0].id)!;
  assert.equal(animated.fadeIn, 0);
  assert.equal(animated.fadeOut, 0);
  assert(!animated.keyframes.some(k => k.property === "y"));
  await page.getByRole("button", { name: "重做", exact: true }).click();
  edited = await save();
  animated = edited.clips.find(c => c.id === cues[0].id)!;
  assert(Math.abs(animated.fadeIn - 0.3) < 1e-9);
  checks.push("animation apply, undo and redo each commit one whole project step");

  await page.getByRole("button", { name: "导出全部 SRT", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("不包含样式、位置或动画");
  await expect(page.getByText("SRT / WebVTT 只保存时间与文本", { exact: false })).toBeVisible();
  await expect.poll(() => readFile(exported, "utf8").catch(() => "")).toContain("逐条修订字幕");
  assert(!(await readFile(exported, "utf8")).includes("keyframes"));
  checks.push("SRT export keeps text only and states that styles, position and animation are not saved");

  await page.getByRole("button", { name: "文件菜单", exact: true }).click();
  await page.getByRole("button", { name: "打开项目", exact: false }).click();
  await expect(page.locator(".subtitle-cue")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
  await expect(page.locator(`[data-cue-id="${cues[0].id}"]`)).toContainText("逐条修订字幕");
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
