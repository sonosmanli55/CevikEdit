import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  EditorAPI,
  ExportProgress,
  UpdateDownloadProgress,
  ReverseProgress,
  TranscriptionProgress,
} from "../src/core/types";
import type { AssistantEvent } from "../src/core/assistantTypes";
const api: EditorAPI = {
  packageProject: project => ipcRenderer.invoke("package-project", project),
  cancelPackage: jobId => ipcRenderer.invoke("cancel-package", jobId),
  onPackageProgress: callback => {
    const listener = (_: unknown, event: ExportProgress) => callback(event);
    ipcRenderer.on("package-progress", listener);
    return () => ipcRenderer.removeListener("package-progress", listener);
  },
  importBuiltinAsset: (id) => ipcRenderer.invoke("import-builtin-asset", id),
  getAssistantProviders: () => ipcRenderer.invoke("assistant-providers"),
  chooseAssistantCLI: (provider) => ipcRenderer.invoke("assistant-choose-cli", provider),
  startAssistant: (request) => ipcRenderer.invoke("assistant-start", request),
  cancelAssistant: (requestId) => ipcRenderer.invoke("assistant-cancel", requestId),
  getAssistantHistory: (projectId) => ipcRenderer.invoke("assistant-history", projectId),
  saveAssistantHistory: (projectId, messages) => ipcRenderer.invoke("assistant-save-history", projectId, messages),
  onAssistantEvent: (callback) => {
    const listener = (_: unknown, event: AssistantEvent) => callback(event);
    ipcRenderer.on("assistant-event", listener);
    return () => ipcRenderer.removeListener("assistant-event", listener);
  },
  importMedia: (paths) => ipcRenderer.invoke("import-media", paths),
  relinkAsset: (asset) => ipcRenderer.invoke("relink-asset", asset),
  extractAudio: (asset) => ipcRenderer.invoke("extract-audio", asset),
  reverseClip: (request) => ipcRenderer.invoke("reverse-clip", request),
  cancelReverse: (jobId) => ipcRenderer.invoke("cancel-reverse", jobId),
  onReverseProgress: (callback) => {
    const listener = (_: unknown, event: ReverseProgress) => callback(event);
    ipcRenderer.on("reverse-progress", listener);
    return () => ipcRenderer.removeListener("reverse-progress", listener);
  },
  freezeFrame: (request) => ipcRenderer.invoke("freeze-frame", request),
  analyzeLoudness: (request) => ipcRenderer.invoke("analyze-loudness", request),
  analyzeSpeech: (request) => ipcRenderer.invoke("analyze-speech", request),
  checkForUpdates: () => ipcRenderer.invoke("check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: (installer) => ipcRenderer.invoke("install-update", installer),
  openUpdatePage: () => ipcRenderer.invoke("open-update-page"),
  onUpdateProgress: (callback) => {
    const listener = (_: unknown, event: UpdateDownloadProgress) => callback(event);
    ipcRenderer.on("update-progress", listener);
    return () => ipcRenderer.removeListener("update-progress", listener);
  },
  listTemplates: () => ipcRenderer.invoke("list-templates"),
  saveTemplate: (template) => ipcRenderer.invoke("save-template", template),
  deleteTemplate: (id) => ipcRenderer.invoke("delete-template", id),
  importTemplate: () => ipcRenderer.invoke("import-template"),
  exportTemplate: (id) => ipcRenderer.invoke("export-template", id),
  getStartupProject: () => ipcRenderer.invoke("get-startup-project"),
  openProject: () => ipcRenderer.invoke("open-project"),
  saveProject: (project, path) =>
    ipcRenderer.invoke("save-project", project, path),
  autosaveProject: (project) => ipcRenderer.invoke("autosave-project", project),
  getAutosave: () => ipcRenderer.invoke("get-autosave"),
  getRecentProjects: () => ipcRenderer.invoke("get-recent-projects"),
  openRecentProject: (path) => ipcRenderer.invoke("open-recent-project", path),
  chooseExportPath: (name, format) =>
    ipcRenderer.invoke("choose-export-path", name, format),
  exportProject: (project, options) =>
    ipcRenderer.invoke("export-project", project, options),
  cancelExport: (jobId) => ipcRenderer.invoke("cancel-export", jobId),
  onExportProgress: (callback) => {
    const listener = (_: unknown, event: ExportProgress) => callback(event);
    ipcRenderer.on("export-progress", listener);
    return () => ipcRenderer.removeListener("export-progress", listener);
  },
  getFontFamilies: () => ipcRenderer.invoke("font-families"),
  getSystemInfo: () => ipcRenderer.invoke("system-info"),
  readTextFile: (extensions) =>
    ipcRenderer.invoke("read-text-file", extensions),
  chooseCapcutProject: (mode) =>
    ipcRenderer.invoke("choose-capcut-project", mode),
  readCapcutDraft: (token, timelineId) =>
    ipcRenderer.invoke("read-capcut-draft", token, timelineId),
  discardCapcutProject: (token) =>
    ipcRenderer.invoke("discard-capcut-project", token),
  writeTextFile: (text, name) =>
    ipcRenderer.invoke("write-text-file", text, name),
  revealPath: (path) => ipcRenderer.invoke("reveal-path", path),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onMenuAction: (callback) => {
    const listener = (_: unknown, action: string) => callback(action);
    ipcRenderer.on("menu-action", listener);
    return () => ipcRenderer.removeListener("menu-action", listener);
  },
  setDirty: (dirty) => ipcRenderer.send("set-dirty", dirty),
  cancelCloseRequest: () => ipcRenderer.send("cancel-close-request"),
  closeWindow: () => ipcRenderer.send("close-window"),
  chooseMediaTool: (name) => ipcRenderer.invoke("choose-media-tool", name),
  getTranscriptionStatus: () => ipcRenderer.invoke("transcription-status"),
  chooseWhisperTool: (kind) =>
    ipcRenderer.invoke("choose-whisper-tool", kind),
  transcribeAudio: (request) =>
    ipcRenderer.invoke("transcribe-audio", request),
  cancelTranscription: (jobId) =>
    ipcRenderer.invoke("cancel-transcription", jobId),
  onTranscriptionProgress: (callback) => {
    const listener = (_: unknown, event: TranscriptionProgress) =>
      callback(event);
    ipcRenderer.on("transcription-progress", listener);
    return () => ipcRenderer.removeListener("transcription-progress", listener);
  },
};
contextBridge.exposeInMainWorld("editorAPI", api);

// Present only in the dedicated plugin process, never in a normal desktop window.
if (process.argv.includes("--cevikedit-plugin")) {
  contextBridge.exposeInMainWorld("cevikeditPlugin", {
    onCommand: (callback: (request: { action: string; args: unknown }) => Promise<unknown>) => {
      ipcRenderer.on("plugin-command", async (_, request) => {
        try { ipcRenderer.send("plugin-result", { id: request.id, result: await callback(request) }); }
        catch (error) { ipcRenderer.send("plugin-result", { id: request.id, error: error instanceof Error ? error.message : "İşlem başarısız" }); }
      });
      ipcRenderer.send("plugin-ready");
    },
  });
}
