import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  shell,
} from "electron";
import { startPluginHost } from "./pluginHost";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { BUILTIN_ASSETS } from "../src/core/builtinAssets";
import { discoverAssistantProviders, startAssistantSession } from "./assistantBackend";
import type { AssistantMessage, AssistantProvider, AssistantRequest } from "../src/core/assistantTypes";
import {
  importAssets,
  mediaURL,
  systemMediaInfo,
  systemFontFamilies,
  shutdownMediaTasks,
  registerBundledFont,
  probeFile,
  extractAudioTrack,
} from "./media";
import { startExport, cancelExport, cancelAllExports } from "./export";
import {
  cancelAllClipMedia,
  cancelReverseClip,
  extractFreezeFrame,
  reverseClipMedia,
  shutdownClipMedia,
} from "./clipMedia";
import { resolvePortableDocument, startPortablePackage, cancelPortablePackage, cancelPortablePackages, savePortableDocument } from "./portableProject";
import { setBundledMediaToolsDirectory } from "./mediaTools";
import { measureLoudness, validateLoudnessRequest } from "./loudness";
import { loadTemplates, readTemplateFile, removeTemplate, writeTemplate } from "./templates";
import { serializeTemplate } from "../src/core/templates";
import {
  cancelAllTranscriptions,
  cancelTranscription,
  shutdownTranscriptions,
  transcribeAudio,
  whisperStatus,
} from "./transcription";
import { getMainLocale, resolveLocale, setMainLocale, tr, translateMenu } from "./locale";
import { validateProject } from "../src/core/model";
import { decodeCapcutDraft } from "./capcutCodec";
import {
  discoverSelectedCapcutProject,
  readSelectedCapcutTimeline,
  type CapcutProjectIOPlan,
} from "./capcutProjectIO";
import type {
  CapcutImportSelection,
  MediaAsset,
  Project,
  RecentProject,
  ExportOptions,
  FreezeFrameRequest,
  ReverseClipRequest,
  ReverseProgress,
  TranscriptionProgress,
  TranscriptionRequest,
} from "../src/core/types";

const pluginMode = process.argv.includes("--reacut-plugin");
setMainLocale(resolveLocale(app.isPackaged));
// A connected MCP server is a background app until its desktop window is shown.
if (process.platform === "darwin") app.setActivationPolicy(pluginMode ? "accessory" : "regular");
if (pluginMode && !process.env.REACUT_USER_DATA)
  app.setPath("userData", path.join(app.getPath("appData"), "ReaCut-Plugin", "sessions", randomUUID()));
if (app.isPackaged && process.platform === "darwin")
  setBundledMediaToolsDirectory(path.join(process.resourcesPath, "media-tools"));
if (process.env.REACUT_USER_DATA)
  app.setPath("userData", path.resolve(process.env.REACUT_USER_DATA));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "reacut-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
let window: BrowserWindow | null = null;
let assistantOverrides: Partial<Record<AssistantProvider, string>> = {};
let assistantRunning: { requestId: string; cancel: () => void; done: Promise<void> } | null = null;
let assistantStarting = false;
let assistantPendingId: string | null = null;
let assistantCancelPending = false;
let assistantStartDone: Promise<void> = Promise.resolve();
let assistantHistoryWrites = Promise.resolve();
function assistantHistoryFile(projectId: unknown): string {
  if (typeof projectId !== "string" || !projectId || projectId.length > 256) throw new Error("无效项目 ID");
  return userFile(`assistant/${createHash("sha256").update(projectId).digest("hex")}.json`);
}
function cleanAssistantMessages(value: unknown): AssistantMessage[] {
  if (!Array.isArray(value) || value.length > 60) throw new Error("对话记录过大");
  const messages = value.map(item => {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string" || item.content.length > 12000)
      throw new Error("对话记录格式无效");
    return { role: item.role, content: item.content } as AssistantMessage;
  });
  if (JSON.stringify(messages).length > 250000) throw new Error("对话记录过大");
  return messages;
}
let pendingProject = process.argv.find(
  (argument) => path.isAbsolute(argument) && /\.reacut$/i.test(argument),
);
app.on("open-file", (event, file) => {
  event.preventDefault();
  pendingProject = file;
  if (window && !window.webContents.isLoading()) menuAction("open-external");
});
let dirty = false,
  closeAllowed = false,
  askingClose = false,
  quitRequested = false;
const allowedMedia = new Set<string>();
const recentPaths = new Set<string>();
const outputPaths = new Set<string>();
const savePaths = new Set<string>();
const portablePaths = new Set<string>();
const capcutSelections = new Map<
  string,
  { plan: CapcutProjectIOPlan; ownerId: number; expiresAt: number; reading: boolean }
>();
const pruneCapcutSelections = () => {
  for (const [token, selection] of capcutSelections)
    if (selection.expiresAt <= Date.now()) capcutSelections.delete(token);
};
function validateCapcutToken(token: unknown): asserts token is string {
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(token)
  )
    throw new Error("剪映项目选择无效，请重新选择项目");
}
const menuAction = (action: string) =>
  window?.webContents.send("menu-action", action);
const userFile = (name: string) => path.join(app.getPath("userData"), name);
const cacheDir = () => userFile("thumbnails");
const reverseDir = () => userFile("reverse-media");
const freezeDir = () => userFile("freeze-frames");
let transcriptionTools: { executable?: string; model?: string } = {};
function transcriptionToolDirectories(): string[] {
  const directories = [
    ...(app.isPackaged
      ? [path.join(process.resourcesPath, "media-tools")]
      : []),
    path.join(app.getAppPath(), "media-tools"),
    path.join(path.dirname(app.getPath("exe")), "media-tools"),
    ...(process.env.REACUT_WHISPER_DIR
      ? [path.resolve(process.env.REACUT_WHISPER_DIR)]
      : []),
  ];
  return [...new Set(directories)];
}
const transcriptionOptions = () => ({
  bundledDirectories: transcriptionToolDirectories(),
  userDataDirectory: app.getPath("userData"),
  savedExecutable: transcriptionTools.executable,
  savedModel: transcriptionTools.model,
});
let writeQueue = Promise.resolve();
async function atomicWrite(file: string, text: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, file);
}
async function recent(): Promise<RecentProject[]> {
  try {
    const data = JSON.parse(await readFile(userFile("recent.json"), "utf8"));
    return Array.isArray(data)
      ? data
          .filter(
            (x: RecentProject) =>
              typeof x.path === "string" && typeof x.name === "string",
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
async function remember(project: Project, file: string) {
  const entries = (await recent()).filter((p) => p.path !== file);
  await atomicWrite(
    userFile("recent.json"),
    JSON.stringify(
      [
        { path: file, name: project.name, updatedAt: new Date().toISOString() },
        ...entries,
      ].slice(0, 20),
    ),
  );
  recentPaths.add(file);
  savePaths.add(file);
}
function authorizeAsset(asset: MediaAsset) {
  allowedMedia.add(path.resolve(asset.path));
  for (const cachedURL of [asset.thumbnail, asset.previewUrl])
    if (cachedURL?.startsWith("reacut-media:")) {
      try {
        const thumbnail = new URL(cachedURL).searchParams.get("path");
        if (thumbnail && path.dirname(path.resolve(thumbnail)) === cacheDir())
          allowedMedia.add(path.resolve(thumbnail));
      } catch {
        /* optional */
      }
    }
}
async function hydrateProject(input: unknown): Promise<Project> {
  const p = validateProject(input);
  const refreshed = new Map<string, Promise<MediaAsset | undefined>>();
  p.assets = await Promise.all(
    p.assets.map(async (asset) => {
      const resolved = path.resolve(asset.path);
      let missing = false;
      try {
        await access(resolved);
      } catch {
        missing = true;
      }
      if (!missing && !refreshed.has(resolved))
        refreshed.set(
          resolved,
          importAssets([resolved], cacheDir())
            .then((assets) => assets[0])
            .catch(() => undefined),
        );
      const metadata = await refreshed.get(resolved);
      const hydrated: MediaAsset = {
        ...asset,
        ...(metadata ?? {}),
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        path: resolved,
        url: mediaURL(resolved),
        missing,
        previewUrl: metadata?.previewUrl,
        previewError: metadata?.previewError,
        thumbnail: metadata?.thumbnail,
      };
      if (asset.kind === "audio") {
        hydrated.width = 0;
        hydrated.height = 0;
        hydrated.thumbnail = undefined;
      }
      authorizeAsset(hydrated);
      return hydrated;
    }),
  );
  return p;
}
async function readProject(file: string) {
  const metadata = await stat(file);
  if (metadata.size > 30 * 1024 * 1024)
    throw new Error("项目文件过大（最大 30MB）");
  const input = JSON.parse(await readFile(file, "utf8"));
  const project = await hydrateProject(await resolvePortableDocument(input, file));
  if (input?.format === "reacut-portable") portablePaths.add(path.resolve(file));
  return project;
}
function handle(name: string, callback: (...args: any[]) => unknown) {
  ipcMain.handle(name, (event, ...args) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error("无效调用来源");
    return callback(...args);
  });
}
function validateTranscriptionRequest(
  value: unknown,
): asserts value is TranscriptionRequest {
  if (!value || typeof value !== "object") throw new Error("无效的转写请求");
  const request = value as Record<string, unknown>;
  if (
    typeof request.jobId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      request.jobId,
    )
  )
    throw new Error("无效的转写请求");
  if (
    typeof request.source !== "string" ||
    !path.isAbsolute(request.source) ||
    !allowedMedia.has(path.resolve(request.source))
  )
    throw new Error("该素材未通过本地访问授权");
  if (typeof request.model !== "string" || !path.isAbsolute(request.model))
    throw new Error("所选模型不可用，请重新选择");
  const number = (key: string, min: number, max: number) => {
    const candidate = request[key];
    if (
      typeof candidate !== "number" ||
      !Number.isFinite(candidate) ||
      candidate < min ||
      candidate > max
    )
      throw new Error("无效的转写请求");
    return candidate;
  };
  const sourceIn = number("sourceIn", 0, 24 * 3600);
  const start = number("start", 0, 86400);
  const duration = number("duration", 1 / 240, 86400);
  const speed = number("speed", 0.1, 8);
  number("fps", 1, 240);
  if (start + duration > 86400) throw new Error("无效的转写请求");
  if (duration * speed > 6 * 3600)
    throw new Error("单个片段最长支持 6 小时");
  if (sourceIn + duration * speed > 24 * 3600)
    throw new Error("无效的转写请求");
  if (
    typeof request.language !== "string" ||
    !/^(auto|[a-z]{2,3})$/i.test(request.language)
  )
    throw new Error("无效的转写语言");
}
const jobIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function validateReverseRequest(
  value: unknown,
): asserts value is ReverseClipRequest {
  if (!value || typeof value !== "object") throw new Error("无效的倒放请求");
  const request = value as Record<string, unknown>;
  if (typeof request.jobId !== "string" || !jobIdPattern.test(request.jobId))
    throw new Error("无效的倒放请求");
  if (
    typeof request.source !== "string" ||
    !path.isAbsolute(request.source) ||
    !allowedMedia.has(path.resolve(request.source))
  )
    throw new Error("该素材未通过本地访问授权");
  const number = (key: string, min: number, max: number) => {
    const candidate = request[key];
    if (
      typeof candidate !== "number" ||
      !Number.isFinite(candidate) ||
      candidate < min ||
      candidate > max
    )
      throw new Error("无效的倒放请求");
    return candidate;
  };
  const sourceIn = number("sourceIn", 0, 24 * 3600);
  const duration = number("duration", 1 / 240, 6 * 3600);
  if (sourceIn + duration > 24 * 3600) throw new Error("无效的倒放请求");
  if (
    request.name !== undefined &&
    (typeof request.name !== "string" ||
      !request.name.trim() ||
      request.name.length > 4096 ||
      request.name.includes("\0"))
  )
    throw new Error("无效的倒放请求");
}

function validateFreezeRequest(
  value: unknown,
): asserts value is FreezeFrameRequest {
  if (!value || typeof value !== "object") throw new Error("无效的定格请求");
  const request = value as Record<string, unknown>;
  if (
    typeof request.source !== "string" ||
    !path.isAbsolute(request.source) ||
    !allowedMedia.has(path.resolve(request.source))
  )
    throw new Error("该素材未通过本地访问授权");
  if (
    typeof request.time !== "number" ||
    !Number.isFinite(request.time) ||
    request.time < 0 ||
    request.time > 24 * 3600
  )
    throw new Error("无效的定格请求");
  if (
    request.name !== undefined &&
    (typeof request.name !== "string" ||
      !request.name.trim() ||
      request.name.length > 4096 ||
      request.name.includes("\0"))
  )
    throw new Error("无效的定格请求");
}

function derivedAssetName(name: string | undefined, source: string): string {
  const base = (name?.trim() || path.basename(source)).replace(/\0/g, "");
  return base.length > 3800 ? base.slice(0, 3800) : base;
}

function registerIPC() {
  handle("import-builtin-asset", async (id: unknown) => {
    const definition = BUILTIN_ASSETS.find(asset => asset.id === id);
    if (!definition) throw new Error("未找到内置素材");
    const source = app.isPackaged
      ? path.join(app.getAppPath().replace(/\.asar$/, ".asar.unpacked"), "dist/builtin-assets", definition.fileName)
      : path.join(__dirname, "../public/builtin-assets", definition.fileName);
    const bytes = await readFile(source);
    const directory = userFile("builtin-assets");
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, `${definition.id}-${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}${path.extname(definition.fileName)}`);
    try { await access(target); } catch { await copyFile(source, target); }
    const [asset] = await importAssets([target], cacheDir());
    asset.name = definition.name; authorizeAsset(asset); return asset;
  });
  handle("assistant-providers", () => discoverAssistantProviders(assistantOverrides));
  handle("assistant-choose-cli", async (provider: AssistantProvider) => {
    if (provider !== "codex" && provider !== "claude") throw new Error("无效助手类型");
    const result = await dialog.showOpenDialog(window!, { title: tr(`选择 ${provider === "codex" ? "Codex" : "Claude Code"} CLI`), properties: ["openFile"] });
    if (!result.canceled) {
      assistantOverrides[provider] = result.filePaths[0];
      await mkdir(path.dirname(userFile("assistant-clis.json")), { recursive: true });
      await writeFile(userFile("assistant-clis.json"), JSON.stringify(assistantOverrides), { mode: 0o600 });
    }
    return discoverAssistantProviders(assistantOverrides);
  });
  handle("assistant-start", async (request: AssistantRequest) => {
    if (assistantStarting || assistantRunning) throw new Error("助手正在处理上一条消息");
    if (!request || typeof request.requestId !== "string" || !["codex", "claude"].includes(request.provider)) throw new Error("助手请求无效");
    assistantStarting = true;
    assistantPendingId = request.requestId; assistantCancelPending = false;
    let resolveStart!: () => void;
    assistantStartDone = new Promise<void>(resolve => { resolveStart = resolve; });
    const owner = window!.webContents;
    try {
      const running = await startAssistantSession(request, event => {
        if (!owner.isDestroyed()) owner.send("assistant-event", event);
      }, { executablePath: assistantOverrides[request.provider], sessionRoot: userFile("assistant-runs") });
      assistantRunning = { requestId: request.requestId, ...running };
      void running.done.finally(() => { if (assistantRunning?.requestId === request.requestId) assistantRunning = null; }).catch(() => {});
      if (owner.isDestroyed() || assistantCancelPending) running.cancel();
    } finally { assistantStarting = false; assistantPendingId = null; resolveStart(); }
  });
  handle("assistant-cancel", async (requestId: unknown) => {
    if (assistantPendingId === requestId) { assistantCancelPending = true; await assistantStartDone; }
    const running = assistantRunning;
    if (running && running.requestId === requestId) { running.cancel(); await running.done; }
  });
  handle("assistant-history", async (projectId: unknown) => {
    const file = assistantHistoryFile(projectId);
    await assistantHistoryWrites.catch(() => {});
    try {
      if ((await stat(file)).size > 1024 * 1024) throw new Error("对话记录过大");
      return cleanAssistantMessages(JSON.parse(await readFile(file, "utf8")));
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  });
  handle("assistant-save-history", async (projectId: unknown, input: unknown) => {
    const file = assistantHistoryFile(projectId), messages = cleanAssistantMessages(input);
    assistantHistoryWrites = assistantHistoryWrites.catch(() => {}).then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      await writeFile(temporary, JSON.stringify(messages), { mode: 0o600 });
      await rename(temporary, file);
    });
    await assistantHistoryWrites;
  });
  handle("import-media", async (paths?: string[]) => {
    let selected = paths;
    if (!selected) {
      const result = await dialog.showOpenDialog(window!, {
        title: tr("导入素材"),
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: tr("媒体文件"),
            extensions: [
              "mp4",
              "mov",
              "mkv",
              "webm",
              "m4v",
              "avi",
              "mp3",
              "wav",
              "m4a",
              "aac",
              "ogg",
              "flac",
              "png",
              "jpg",
              "jpeg",
              "webp",
              "bmp",
              "avif",
              "heic",
            ],
          },
          { name: tr("所有文件"), extensions: ["*"] },
        ],
      });
      if (result.canceled) return [];
      selected = result.filePaths;
    }
    if (
      !Array.isArray(selected) ||
      selected.length > 100 ||
      selected.some((p) => typeof p !== "string" || !path.isAbsolute(p))
    )
      throw new Error("请提供最多 100 个本地素材的绝对路径");
    const assets = await importAssets(selected, cacheDir());
    assets.forEach(authorizeAsset);
    return assets;
  });
  handle("extract-audio", async (asset: MediaAsset) => {
    const source = path.resolve(String(asset?.path ?? ""));
    if (!allowedMedia.has(source))
      throw new Error("该素材未通过本地访问授权");
    const probe = await probeFile(source);
    if (!probe.streams.some((stream) => stream.codec_type === "audio"))
      throw new Error("这段素材没有可分离的音频");
    const metadata = await stat(source);
    const directory = userFile("extracted-audio");
    await mkdir(directory, { recursive: true });
    // Content-addressed: extracting the same clip twice reuses one file.
    const key = createHash("sha256")
      .update(`${source}:${metadata.size}:${metadata.mtimeMs}`)
      .digest("hex")
      .slice(0, 16);
    const target = path.join(directory, `${key}.m4a`);
    try {
      await access(target);
    } catch {
      await extractAudioTrack(source, target);
    }
    const [extracted] = await importAssets([target], cacheDir());
    if (!extracted) throw new Error("无法读取分离出的音频");
    extracted.name =
      typeof asset.name === "string" && asset.name.trim()
        ? asset.name
        : extracted.name;
    authorizeAsset(extracted);
    return extracted;
  });
  handle("reverse-clip", async (input: unknown) => {
    validateReverseRequest(input);
    const request = input;
    const source = path.resolve(request.source);
    const metadata = await stat(source);
    if (!metadata.isFile()) throw new Error("所选素材无效");
    const directory = reverseDir();
    await mkdir(directory, { recursive: true });
    const key = createHash("sha256")
      .update(
        `reverse-v1:${source}:${metadata.size}:${metadata.mtimeMs}:${request.sourceIn.toFixed(6)}:${request.duration.toFixed(6)}`,
      )
      .digest("hex")
      .slice(0, 24);
    const target = path.join(directory, `${key}.mp4`);
    const owner = window?.webContents;
    const emit = (
      progress: number,
      status: ReverseProgress["status"],
      message?: string,
    ) => {
      if (!owner || owner.isDestroyed()) return;
      owner.send("reverse-progress", {
        jobId: request.jobId,
        progress: Math.max(0, Math.min(100, progress)),
        status,
        ...(message ? { message } : {}),
      } satisfies ReverseProgress);
    };
    emit(0, "preparing");
    try {
      let exists = true;
      try {
        await access(target);
      } catch {
        exists = false;
      }
      if (!exists)
        await reverseClipMedia({
          jobId: request.jobId,
          source,
          sourceIn: request.sourceIn,
          duration: request.duration,
          destination: target,
          onProgress: (progress, status) => emit(progress, status),
        });
      const [reversed] = await importAssets([target], cacheDir());
      if (!reversed || reversed.kind !== "video")
        throw new Error("无法读取倒放后的视频");
      reversed.name = `${derivedAssetName(request.name, source)} · ${tr("倒放")}`;
      authorizeAsset(reversed);
      emit(100, "complete");
      return reversed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("取消")) {
        emit(0, "error", message);
      } else {
        emit(0, "cancelled", message);
      }
      throw error;
    }
  });
  handle("cancel-reverse", (jobId: unknown) => {
    if (typeof jobId !== "string" || !jobIdPattern.test(jobId))
      throw new Error("无效的倒放请求");
    return cancelReverseClip(jobId);
  });
  handle("freeze-frame", async (input: unknown) => {
    validateFreezeRequest(input);
    const request = input;
    const source = path.resolve(request.source);
    const metadata = await stat(source);
    if (!metadata.isFile()) throw new Error("所选素材无效");
    const directory = freezeDir();
    await mkdir(directory, { recursive: true });
    const key = createHash("sha256")
      .update(
        `freeze-v1:${source}:${metadata.size}:${metadata.mtimeMs}:${request.time.toFixed(6)}`,
      )
      .digest("hex")
      .slice(0, 24);
    const target = path.join(directory, `${key}.png`);
    let exists = true;
    try {
      await access(target);
    } catch {
      exists = false;
    }
    if (!exists) {
      try {
        await extractFreezeFrame(source, request.time, target);
      } catch (error) {
        try {
          await access(target);
        } catch {
          throw error;
        }
      }
    }
    const [image] = await importAssets([target], cacheDir());
    if (!image || image.kind !== "image")
      throw new Error("无法读取定格画面");
    image.name = `${derivedAssetName(request.name, source)} · ${tr("定格画面")}`;
    authorizeAsset(image);
    return image;
  });
  handle("analyze-loudness", async (input: unknown) => {
    const request = validateLoudnessRequest(input);
    if (!allowedMedia.has(request.source))
      throw new Error("该素材未通过本地访问授权");
    const metadata = await stat(request.source);
    if (!metadata.isFile()) throw new Error("所选素材无效");
    return measureLoudness(request);
  });
  handle("list-templates", () => loadTemplates(userFile("templates")));
  handle("save-template", async (input: unknown) => {
    await writeTemplate(userFile("templates"), input);
    return loadTemplates(userFile("templates"));
  });
  handle("delete-template", async (id: unknown) => {
    await removeTemplate(userFile("templates"), id);
    return loadTemplates(userFile("templates"));
  });
  handle("import-template", async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: tr("Şablon içe aktar"),
      properties: ["openFile"],
      filters: [{ name: tr("ReaCut şablonu"), extensions: ["reacut-template"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const template = await readTemplateFile(result.filePaths[0]);
    await writeTemplate(userFile("templates"), template);
    return loadTemplates(userFile("templates"));
  });
  handle("export-template", async (id: unknown) => {
    const store = await loadTemplates(userFile("templates"));
    const template = store.templates.find((item) => item.id === id);
    if (!template) throw new Error("Şablon bulunamadı");
    const result = await dialog.showSaveDialog(window!, {
      title: tr("Şablonu dışa aktar"),
      defaultPath: `${template.name}.reacut-template`,
      filters: [{ name: tr("ReaCut şablonu"), extensions: ["reacut-template"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, serializeTemplate(template), "utf8");
    return result.filePath;
  });
  handle("relink-asset", async (asset: MediaAsset) => {
    const result = await dialog.showOpenDialog(window!, {
      title: tr(`重新链接 ${asset.name}`),
      properties: ["openFile"],
    });
    if (result.canceled) return null;
    const imported = (await importAssets(result.filePaths, cacheDir()))[0];
    if (
      !imported ||
      (imported.kind !== asset.kind &&
        !(asset.kind === "audio" && imported.hasAudio))
    )
      throw new Error("新素材类型与原素材不一致");
    authorizeAsset(imported);
    return {
      ...imported,
      id: asset.id,
      ...(asset.kind === "audio"
        ? { kind: "audio", width: 0, height: 0, thumbnail: undefined }
        : {}),
    };
  });
  handle("get-startup-project", async () => {
    if (!pendingProject) return null;
    const file = pendingProject;
    pendingProject = undefined;
    const project = await readProject(file);
    await remember(project, file);
    return { project, path: file };
  });
  handle("open-project", async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: tr("打开 ReaCut 项目"),
      properties: ["openFile"],
      filters: [{ name: tr("ReaCut 项目"), extensions: ["reacut", "json"] }],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0],
      project = await readProject(file);
    await remember(project, file);
    return { project, path: file };
  });
  handle("open-recent-project", async (file: string) => {
    if (!recentPaths.has(file)) throw new Error("项目不在最近打开列表");
    const project = await readProject(file);
    await remember(project, file);
    return { project, path: file };
  });
  handle("get-recent-projects", async () => {
    const entries = await recent();
    entries.forEach((e) => recentPaths.add(e.path));
    return entries;
  });
  handle("save-project", async (input: unknown, file?: string) => {
    const project = validateProject(input);
    if (file && !savePaths.has(file)) throw new Error("未经选择的项目保存位置");
    if (!file) {
      const result = await dialog.showSaveDialog(window!, {
        title: tr("保存项目"),
        defaultPath: project.name + ".reacut",
        filters: [{ name: tr("ReaCut 项目"), extensions: ["reacut"] }],
      });
      if (result.canceled || !result.filePath) return null;
      file = result.filePath;
      savePaths.add(file);
    }
    if (portablePaths.has(path.resolve(file))) {
      for (const asset of project.assets) if (!allowedMedia.has(path.resolve(asset.path))) throw new Error("项目引用了未经导入的素材");
      await savePortableDocument(project, file);
    } else await atomicWrite(file, JSON.stringify(project, null, 2));
    await remember(project, file);
    return file;
  });
  handle("package-project", async (input: unknown) => {
    const project = validateProject(input), owner = window!.webContents;
    for (const asset of project.assets) if (!allowedMedia.has(path.resolve(asset.path))) throw new Error("项目引用了未经导入的素材");
    const selected = await dialog.showOpenDialog(window!, { title: tr("选择素材包保存位置"), properties: ["openDirectory", "createDirectory"] });
    if (selected.canceled || !selected.filePaths[0] || owner.isDestroyed()) return null;
    return startPortablePackage(project, selected.filePaths[0], event => {
      if (event.status === "complete" && event.path) outputPaths.add(event.path);
      if (!owner.isDestroyed()) owner.send("package-progress", event);
    });
  });
  handle("cancel-package", (jobId: string) => cancelPortablePackage(jobId));
  handle("autosave-project", (input: unknown) => {
    const project = validateProject(input);
    const serialized = JSON.stringify(project);
    writeQueue = writeQueue
      .catch(() => {})
      .then(() => atomicWrite(userFile("autosave.reacut"), serialized));
    return writeQueue;
  });
  handle("get-autosave", async () => {
    try {
      return await readProject(userFile("autosave.reacut"));
    } catch {
      return null;
    }
  });
  handle("choose-export-path", async (name: string, format: string) => {
    if (!["mp4", "mov"].includes(format)) throw new Error("无效导出格式");
    const result = await dialog.showSaveDialog(window!, {
      title: tr("导出视频"),
      defaultPath: name + "." + format,
      filters: [{ name: format.toUpperCase() + " " + tr("视频"), extensions: [format] }],
    });
    if (result.canceled || !result.filePath) return null;
    outputPaths.add(result.filePath);
    return result.filePath;
  });
  handle("export-project", async (input: unknown, options: ExportOptions) => {
    const project = validateProject(input);
    if (!outputPaths.has(options.path)) throw new Error("请先选择导出位置");
    for (const asset of project.assets)
      if (!allowedMedia.has(path.resolve(asset.path)))
        throw new Error("导出引用了未经导入的素材");
    return startExport(project, options, (event) =>
      window?.webContents.send("export-progress", event),
    );
  });
  handle("cancel-export", (jobId: string) => cancelExport(jobId));
  handle("font-families", () => systemFontFamilies());
  handle("system-info", async () => ({
    version: app.getVersion(),
    platform: process.platform,
    ...(await systemMediaInfo()),
  }));
  handle("read-text-file", async (extensions: string[]) => {
    if (
      !Array.isArray(extensions) ||
      extensions.some((e) => !/^[a-z0-9]+$/i.test(e))
    )
      throw new Error("无效文件类型");
    const result = await dialog.showOpenDialog(window!, {
      properties: ["openFile"],
      filters: [{ name: tr("文本文件"), extensions }],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if ((await stat(file)).size > 20 * 1024 * 1024)
      throw new Error("文件超过 20MB");
    return { text: await readFile(file, "utf8"), name: path.basename(file) };
  });
  handle("choose-capcut-project", async (mode: "file" | "directory") => {
    if (mode !== "file" && mode !== "directory")
      throw new Error("请选择草稿文件或项目文件夹");
    const owner = window!;
    const result = await dialog.showOpenDialog(owner, {
      title: tr(mode === "file" ? "选择剪映草稿文件" : "选择剪映项目文件夹"),
      properties: [mode === "file" ? "openFile" : "openDirectory"],
      ...(mode === "file"
        ? { filters: [{ name: tr("剪映草稿"), extensions: ["json"] }] }
        : {}),
    });
    if (result.canceled || !result.filePaths[0]) return null;
    if (owner !== window || owner.isDestroyed()) return null;
    const plan = await discoverSelectedCapcutProject(result.filePaths[0], mode);
    if (owner !== window || owner.isDestroyed()) return null;
    pruneCapcutSelections();
    while (capcutSelections.size >= 8)
      capcutSelections.delete(capcutSelections.keys().next().value!);
    const token = randomUUID();
    capcutSelections.set(token, {
      plan,
      ownerId: owner.webContents.id,
      expiresAt: Date.now() + 10 * 60 * 1000,
      reading: false,
    });
    const selection: CapcutImportSelection = {
      token,
      name: path.basename(plan.selection.projectDirectory),
      timelines: plan.timelines.map(({ id, name, isMain, isActive }) => ({
        id,
        name,
        isMain,
        isActive,
      })),
      recommendedTimelineId: plan.recommendedTimelineId,
      requiresTimelineChoice: plan.requiresTimelineChoice,
      warnings: plan.warnings,
    };
    return selection;
  });
  handle("read-capcut-draft", async (token: unknown, timelineId?: unknown) => {
    validateCapcutToken(token);
    pruneCapcutSelections();
    const selection = capcutSelections.get(token);
    if (!selection || selection.ownerId !== window!.webContents.id)
      throw new Error("剪映项目选择已失效，请重新选择项目");
    if (selection.reading) throw new Error("所选时间线正在读取，请稍候");
    if (
      timelineId !== undefined &&
      (typeof timelineId !== "string" ||
        !selection.plan.timelines.some((choice) => choice.id === timelineId))
    )
      throw new Error("请选择项目中已有的时间线");
    selection.reading = true;
    try {
      const result = await readSelectedCapcutTimeline(
        selection.plan,
        timelineId as string | undefined,
      );
      const decoded = decodeCapcutDraft(result.text);
      capcutSelections.delete(token);
      return {
        text: decoded.text,
        name: result.name,
        warnings: selection.plan.warnings,
      };
    } finally {
      selection.reading = false;
    }
  });
  handle("discard-capcut-project", (token: unknown) => {
    validateCapcutToken(token);
    const selection = capcutSelections.get(token);
    if (selection?.ownerId === window!.webContents.id)
      capcutSelections.delete(token);
  });
  handle("write-text-file", async (text: string, name: string) => {
    if (typeof text !== "string" || text.length > 20 * 1024 * 1024)
      throw new Error("文本内容无效或过大");
    const result = await dialog.showSaveDialog(window!, {
      defaultPath: path.basename(name),
    });
    if (result.canceled || !result.filePath) return null;
    await atomicWrite(result.filePath, text);
    return result.filePath;
  });
  handle("reveal-path", (file: string) => {
    if (
      !allowedMedia.has(file) &&
      !savePaths.has(file) &&
      !outputPaths.has(file)
    )
      throw new Error("未授权的文件位置");
    shell.showItemInFolder(file);
  });
  handle("choose-media-tool", async (name: string) => {
    if (!["ffmpeg", "ffprobe"].includes(name)) throw new Error("无效工具名");
    const result = await dialog.showOpenDialog(window!, {
      title: tr(`选择 ${name} 可执行文件`),
      properties: ["openFile"],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    process.env[name === "ffmpeg" ? "REACUT_FFMPEG" : "REACUT_FFPROBE"] = file;
    const settings = {
      ffmpeg: process.env.REACUT_FFMPEG,
      ffprobe: process.env.REACUT_FFPROBE,
    };
    await atomicWrite(userFile("media-tools.json"), JSON.stringify(settings));
    return file;
  });
  handle("transcription-status", () => whisperStatus(transcriptionOptions()));
  handle("choose-whisper-tool", async (kind: unknown) => {
    if (kind !== "executable" && kind !== "model")
      throw new Error("无效工具类型");
    const result = await dialog.showOpenDialog(window!, {
      title: tr(
        kind === "executable"
          ? "选择 Whisper 可执行文件"
          : "选择 Whisper 模型文件",
      ),
      properties: ["openFile"],
      ...(kind === "model"
        ? { filters: [{ name: tr("Whisper 模型"), extensions: ["bin"] }] }
        : {}),
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const file = path.resolve(result.filePaths[0]);
    const metadata = await stat(file);
    if (!metadata.isFile()) throw new Error("所选文件无效");
    if (kind === "model") {
      if (path.extname(file).toLowerCase() !== ".bin")
        throw new Error("请选择 .bin 模型文件");
      if (metadata.size <= 0 || metadata.size > 8 * 1024 * 1024 * 1024)
        throw new Error("模型文件大小无效");
      transcriptionTools.model = file;
    } else {
      if (metadata.size <= 0) throw new Error("所选文件无效");
      if (metadata.size > 512 * 1024 * 1024)
        throw new Error("可执行文件过大");
      transcriptionTools.executable = file;
    }
    await atomicWrite(
      userFile("transcription-tools.json"),
      JSON.stringify(transcriptionTools),
    );
    return file;
  });
  handle("transcribe-audio", async (input: unknown) => {
    validateTranscriptionRequest(input);
    const request = input;
    const status = await whisperStatus(transcriptionOptions());
    if (!status.available)
      throw new Error(
        status.error ??
          "找不到 Whisper。请安装 whisper.cpp，或在字幕面板中选择可执行文件。",
      );
    if (
      !status.models.some(
        (model) => path.resolve(model.path) === path.resolve(request.model),
      )
    )
      throw new Error("所选模型不可用，请重新选择");
    const owner = window?.webContents;
    if (!owner) throw new Error("窗口已关闭");
    return transcribeAudio(request, {
      ...transcriptionOptions(),
      onProgress: (progress, stage) => {
        if (owner.isDestroyed()) return;
        const event: TranscriptionProgress = {
          jobId: request.jobId,
          progress,
          stage,
        };
        owner.send("transcription-progress", event);
      },
    });
  });
  handle("cancel-transcription", (jobId: unknown) => {
    if (
      typeof jobId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        jobId,
      )
    )
      throw new Error("无效的转写请求");
    return cancelTranscription(jobId);
  });
  ipcMain.on("set-dirty", (event, value) => {
    if (event.sender === window?.webContents) dirty = Boolean(value);
  });
  ipcMain.on("cancel-close-request", (event) => {
    if (event.sender === window?.webContents) quitRequested = false;
  });
  ipcMain.on("close-window", (event) => {
    if (event.sender === window?.webContents && !dirty) {
      closeAllowed = true;
      if (quitRequested) app.quit();
      else window?.close();
    }
  });
}
async function serveMedia(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url),
      supplied = url.searchParams.get("path");
    if (url.hostname !== "asset" || !supplied)
      return new Response("Invalid media URL", { status: 400 });
    const file = path.resolve(supplied);
    if (!allowedMedia.has(file))
      return new Response("Media was not imported", { status: 403 });
    const metadata = await stat(file);
    if (!metadata.isFile()) return new Response("Not a file", { status: 404 });
    const range = request.headers.get("range");
    let start = 0,
      end = metadata.size - 1,
      status = 200;
    if (range) {
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!match) return new Response(null, { status: 416 });
      if (match[1]) {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      } else if (match[2])
        start = Math.max(0, metadata.size - Number(match[2]));
      if (start > end || start >= metadata.size)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${metadata.size}` },
        });
      status = 206;
    }
    const mime: Record<string, string> = {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".m4a": "audio/mp4",
      ".ogg": "audio/ogg",
      ".flac": "audio/flac",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    };
    const headers: Record<string, string> = {
      "Content-Type":
        mime[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Content-Length": String(Math.max(0, end - start + 1)),
      "Access-Control-Allow-Origin": "*",
    };
    if (status === 206)
      headers["Content-Range"] = `bytes ${start}-${end}/${metadata.size}`;
    const body =
      request.method === "HEAD" || metadata.size === 0
        ? null
        : Readable.toWeb(createReadStream(file, { start, end }));
    return new Response(body as ReadableStream<Uint8Array> | null, {
      status,
      headers,
    });
  } catch {
    return new Response("Media missing", { status: 404 });
  }
}
function createWindow() {
  const directory = __dirname;
  window = new BrowserWindow({
    width: pluginMode ? 1440 : 1500,
    height: pluginMode ? 900 : 950,
    show: !pluginMode,
    minWidth: 1060,
    minHeight: 680,
    title: tr("ReaCut · 映刻"),
    backgroundColor: "#141518",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 17 },
    webPreferences: {
      preload: path.join(directory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !pluginMode,
      additionalArguments: [
        ...(pluginMode ? ["--reacut-plugin"] : []),
        `--reacut-locale=${getMainLocale()}`,
      ],
    },
  });
  if (pluginMode) {
    if (process.platform === "darwin") {
      window.on("show", () => app.setActivationPolicy("regular"));
      window.on("hide", () => app.setActivationPolicy("accessory"));
    }
    startPluginHost(window, () => { closeAllowed = true; app.quit(); });
  }
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window?.webContents.getURL()) event.preventDefault();
  });
  window.on("close", (event) => {
    if (pluginMode && !closeAllowed && !quitRequested) { event.preventDefault(); window?.hide(); return; }
    if (!dirty || closeAllowed) return;
    event.preventDefault();
    if (askingClose) return;
    askingClose = true;
    void dialog
      .showMessageBox(window!, {
        type: "question",
        message: tr("项目有未保存的修改"),
        detail: tr("保存项目后再关闭？最近编辑也会自动恢复。"),
        buttons: [tr("保存并关闭"), tr("取消"), tr("不保存")],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        askingClose = false;
        if (result.response === 0) menuAction("save-and-close");
        if (result.response === 1) quitRequested = false;
        if (result.response === 2) {
          closeAllowed = true;
          if (quitRequested) app.quit();
          else window?.close();
        }
      });
  });
  window.on("closed", () => {
    void cancelPortablePackages();
    cancelAllClipMedia();
    cancelAllTranscriptions();
    assistantCancelPending = true;
    assistantRunning?.cancel();
    capcutSelections.clear();
    window = null;
    dirty = false;
    closeAllowed = false;
  });
  if (process.env.VITE_DEV_SERVER_URL)
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void window.loadFile(path.join(directory, "../dist/index.html"));
}
void app.whenReady().then(async () => {
  try {
    const settings = JSON.parse(await readFile(userFile("assistant-clis.json"), "utf8"));
    for (const key of ["codex", "claude"] as const)
      if (typeof settings[key] === "string" && path.isAbsolute(settings[key])) assistantOverrides[key] = settings[key];
  } catch { /* default CLI discovery */ }
  try {
    const settings = JSON.parse(
      await readFile(userFile("transcription-tools.json"), "utf8"),
    );
    if (typeof settings.executable === "string" && path.isAbsolute(settings.executable))
      transcriptionTools.executable = settings.executable;
    if (typeof settings.model === "string" && path.isAbsolute(settings.model))
      transcriptionTools.model = settings.model;
  } catch {
    /* choose tools from the subtitle panel */
  }
  registerBundledFont(
    path.join(
      app.getAppPath().replace(/\.asar$/, ".asar.unpacked"),
      "dist/fonts/NotoSansSC.ttf",
    ),
  );
  registerBundledFont(
    path.join(app.getAppPath(), "public/fonts/NotoSansSC.ttf"),
  );

  try {
    const settings = JSON.parse(
      await readFile(userFile("media-tools.json"), "utf8"),
    );
    if (settings.ffmpeg && !process.env.REACUT_FFMPEG)
      process.env.REACUT_FFMPEG = settings.ffmpeg;
    if (settings.ffprobe && !process.env.REACUT_FFPROBE)
      process.env.REACUT_FFPROBE = settings.ffprobe;
  } catch {
    /* system defaults */
  }
  protocol.handle("reacut-media", serveMedia);
  registerIPC();
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: "ReaCut",
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "文件",
      submenu: [
        {
          label: "新建项目",
          accelerator: "CmdOrCtrl+N",
          click: () => menuAction("new"),
        },
        {
          label: "打开项目",
          accelerator: "CmdOrCtrl+O",
          click: () => menuAction("open"),
        },
        {
          label: "保存",
          accelerator: "CmdOrCtrl+S",
          click: () => menuAction("save"),
        },
        {
          label: "另存为",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => menuAction("save-as"),
        },
        { type: "separator" },
        {
          label: "导入素材",
          accelerator: "CmdOrCtrl+I",
          click: () => menuAction("import"),
        },
        {
          label: "导入剪映草稿文件…",
          click: () => menuAction("import-capcut-file"),
        },
        {
          label: "导入剪映项目文件夹…",
          click: () => menuAction("import-capcut-directory"),
        },
        {
          label: "导出视频",
          accelerator: "CmdOrCtrl+E",
          click: () => menuAction("export"),
        },
      ],
    },
    {
      label: "编辑",
      submenu: [
        {
          label: "撤销",
          accelerator: "CmdOrCtrl+Z",
          click: () => menuAction("undo"),
        },
        {
          label: "重做",
          accelerator: "CmdOrCtrl+Shift+Z",
          click: () => menuAction("redo"),
        },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize" },
        { role: "togglefullscreen" },
        ...(process.env.VITE_DEV_SERVER_URL
          ? [{ role: "toggleDevTools" as const }]
          : []),
      ],
    },
    {
      label: "帮助",
      submenu: [
        { label: "快捷键", click: () => menuAction("shortcuts") },
        { label: "关于 ReaCut", click: () => menuAction("about") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(translateMenu(template)));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let quitting = false;
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  if (dirty && !closeAllowed) {
    quitRequested = true;
    window?.close();
    return;
  }
  void Promise.all([
    (async () => { assistantCancelPending = true; await assistantStartDone; const running = assistantRunning; running?.cancel(); await running?.done; await assistantHistoryWrites.catch(() => {}); })(),
    cancelAllExports(),
    cancelPortablePackages(),
    shutdownClipMedia(),
    shutdownMediaTasks(),
    shutdownTranscriptions(),
    writeQueue.catch(() => {}),
  ]).finally(() => {
    quitting = true;
    app.quit();
  });
});
