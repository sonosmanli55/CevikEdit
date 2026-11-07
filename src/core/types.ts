import type { AssistantEvent, AssistantMessage, AssistantProvider, AssistantProviderInfo, AssistantRequest } from "./assistantTypes";
import type { Subtitle } from "./subtitles";
import type { ReacutTemplate } from "./templates";
export type MediaKind = "video" | "audio" | "image";
export type TrackKind = MediaKind | "text";
export interface MediaAsset {
  id: string;
  name: string;
  path: string;
  url: string;
  kind: MediaKind;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  thumbnail?: string;
  waveform?: number[];
  missing?: boolean;
  previewUrl?: string;
  previewError?: string;
}
export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
}
export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  blur: number;
}
export interface TextShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}
export interface TextStyle {
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  background: string;
  align: "left" | "center" | "right";
  bold: boolean;
  stroke: string;
  strokeWidth: number;
  /** Line height as a multiple of the font size (default 1.3). */
  lineHeight?: number;
  /** Background padding as a multiple of the font size (default 0.25). */
  padding?: number;
  /** Background corner radius as a multiple of the font size (0 = square). */
  radius?: number;
  shadow?: TextShadow;
}
export type KeyframeEasing = "linear" | "easeIn" | "easeOut" | "easeInOut";
export interface Keyframe {
  id: string;
  time: number;
  property: "x" | "y" | "scale" | "rotation" | "opacity" | "volume";
  value: number;
  easing: KeyframeEasing;
  easingWindow?: { start: number; end: number };
}
export interface FadeWindow {
  offset: number;
  duration: number;
  fadeIn: number;
  fadeOut: number;
}
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ChromaKey {
  enabled: boolean;
  color: string;
  similarity: number;
  blend: number;
}
export interface ShapeMask {
  shape: "rectangle" | "ellipse";
  width: number;
  height: number;
  feather: number;
  invert: boolean;
}
export interface Clip {
  id: string;
  trackId: string;
  assetId?: string;
  name: string;
  start: number;
  duration: number;
  sourceIn: number;
  speed: number;
  volume: number;
  muted: boolean;
  transform: Transform;
  adjustments: Adjustments;
  text?: TextStyle;
  fadeIn: number;
  fadeOut: number;
  audioFadeIn: number;
  audioFadeOut: number;
  videoFadeWindow?: FadeWindow;
  audioFadeWindow?: FadeWindow;
  keyframes: Keyframe[];
  /** Clips sharing this id move, trim, split and delete together until detached. */
  linkId?: string;
  crop?: CropRect;
  chromaKey?: ChromaKey;
  mask?: ShapeMask;
}
export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}
export interface Project {
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  background: string;
  assets: MediaAsset[];
  tracks: Track[];
  clips: Clip[];
  createdAt: string;
  updatedAt: string;
}
export interface ExportOptions {
  range?: { start: number; end: number };
  path: string;
  width: number;
  height: number;
  fps: number;
  quality: "draft" | "standard" | "high";
  format: "mp4" | "mov";
}
export interface ExportProgress {
  jobId: string;
  progress: number;
  status: "preparing" | "rendering" | "complete" | "error" | "cancelled";
  message?: string;
  path?: string;
}
export type TranscriptionStage =
  | "preparing"
  | "extracting"
  | "transcribing"
  | "parsing"
  | "complete";

export interface TranscriptionRequest {
  jobId: string;
  source: string;
  /** Offset into the source media, in seconds. */
  sourceIn: number;
  /** Clip start on the timeline, in seconds. */
  start: number;
  /** Clip duration on the timeline, in seconds. */
  duration: number;
  speed: number;
  fps: number;
  language: string;
  model: string;
}

export interface TranscriptionProgress {
  jobId: string;
  progress: number;
  stage: TranscriptionStage;
}

export interface TranscriptionModel {
  path: string;
  name: string;
  size: number;
}

export interface TranscriptionStatus {
  available: boolean;
  executable?: string;
  models: TranscriptionModel[];
  selectedModel?: string;
  error?: string;
}

export interface TranscriptionResult {
  cues: Subtitle[];
}

export interface ReverseClipRequest {
  jobId: string;
  /** Absolute path of an already authorized local media file. */
  source: string;
  /** Offset into the source media, in seconds. */
  sourceIn: number;
  /** Source duration to reverse, before timeline speed is applied. */
  duration: number;
  /** Optional display name inherited from the project asset. */
  name?: string;
}

export type ReverseStatus =
  | "preparing"
  | "rendering"
  | "complete"
  | "error"
  | "cancelled";

export interface ReverseProgress {
  jobId: string;
  progress: number;
  status: ReverseStatus;
  message?: string;
}

export interface FreezeFrameRequest {
  /** Absolute path of an already authorized local video. */
  source: string;
  /** Source timestamp in seconds. */
  time: number;
  /** Optional display name inherited from the project asset. */
  name?: string;
}

export interface LoudnessMeasurement {
  /** Integrated loudness in LUFS. */
  inputI: number;
  /** True peak in dBTP. */
  inputTp: number;
  /** Loudness range in LU. */
  inputLra: number;
}

export interface LoudnessRequest {
  /** Absolute path of an already authorized local media file. */
  source: string;
  /** Source in-point in seconds. */
  sourceIn: number;
  /** Timeline duration in seconds. */
  duration: number;
  /** Playback speed used to derive the analysed source span. */
  speed: number;
}

export interface AppSettings {
  ffmpegPath?: string;
  ffprobePath?: string;
  language: "zh" | "en";
  autosave: boolean;
}
export interface RecentProject {
  path: string;
  name: string;
  updatedAt: string;
}
export interface CapcutImportSelection {
  token: string;
  name: string;
  timelines: {
    id: string;
    name: string;
    isMain: boolean;
    isActive: boolean;
  }[];
  recommendedTimelineId?: string;
  requiresTimelineChoice: boolean;
  warnings: string[];
}
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  cover: string;
  createdAt: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  mediaCount: number;
  textCount: number;
  builtin: boolean;
}

export interface TemplateStore {
  templates: ReacutTemplate[];
  warnings: string[];
}

export interface EditorAPI {
  packageProject: (project: Project) => Promise<{ jobId: string } | null>;
  cancelPackage: (jobId: string) => Promise<void>;
  onPackageProgress: (callback: (event: ExportProgress) => void) => () => void;
  importBuiltinAsset: (id: string) => Promise<MediaAsset>;
  getAssistantProviders: () => Promise<AssistantProviderInfo[]>;
  chooseAssistantCLI: (provider: AssistantProvider) => Promise<AssistantProviderInfo[]>;
  startAssistant: (request: AssistantRequest) => Promise<void>;
  cancelAssistant: (requestId: string) => Promise<void>;
  onAssistantEvent: (callback: (event: AssistantEvent) => void) => () => void;
  getAssistantHistory: (projectId: string) => Promise<AssistantMessage[]>;
  saveAssistantHistory: (projectId: string, messages: AssistantMessage[]) => Promise<void>;
  importMedia: (paths?: string[]) => Promise<MediaAsset[]>;
  relinkAsset: (asset: MediaAsset) => Promise<MediaAsset | null>;
  extractAudio: (asset: MediaAsset) => Promise<MediaAsset>;
  reverseClip: (request: ReverseClipRequest) => Promise<MediaAsset>;
  cancelReverse: (jobId: string) => Promise<void>;
  onReverseProgress: (callback: (event: ReverseProgress) => void) => () => void;
  freezeFrame: (request: FreezeFrameRequest) => Promise<MediaAsset>;
  listTemplates: () => Promise<TemplateStore>;
  saveTemplate: (template: ReacutTemplate) => Promise<TemplateStore>;
  deleteTemplate: (id: string) => Promise<TemplateStore>;
  importTemplate: () => Promise<TemplateStore | null>;
  exportTemplate: (id: string) => Promise<string | null>;
  analyzeLoudness: (
    request: LoudnessRequest,
  ) => Promise<LoudnessMeasurement>;
  onMenuAction: (callback: (action: string) => void) => () => void;
  setDirty: (dirty: boolean) => void;
  cancelCloseRequest: () => void;
  closeWindow: () => void;
  chooseMediaTool: (name: "ffmpeg" | "ffprobe") => Promise<string | null>;
  getTranscriptionStatus: () => Promise<TranscriptionStatus>;
  chooseWhisperTool: (kind: "executable" | "model") => Promise<string | null>;
  transcribeAudio: (request: TranscriptionRequest) => Promise<TranscriptionResult>;
  cancelTranscription: (jobId: string) => Promise<void>;
  onTranscriptionProgress: (
    callback: (event: TranscriptionProgress) => void,
  ) => () => void;
  getFontFamilies: () => Promise<string[]>;
  getStartupProject: () => Promise<{ project: Project; path: string } | null>;
  openProject: () => Promise<{ project: Project; path: string } | null>;
  saveProject: (project: Project, path?: string) => Promise<string | null>;
  autosaveProject: (project: Project) => Promise<void>;
  getAutosave: () => Promise<Project | null>;
  getRecentProjects: () => Promise<RecentProject[]>;
  openRecentProject: (
    path: string,
  ) => Promise<{ project: Project; path: string }>;
  chooseExportPath: (
    name: string,
    format: "mp4" | "mov",
  ) => Promise<string | null>;
  exportProject: (
    project: Project,
    options: ExportOptions,
  ) => Promise<{ jobId: string }>;
  cancelExport: (jobId: string) => Promise<void>;
  onExportProgress: (callback: (event: ExportProgress) => void) => () => void;
  getSystemInfo: () => Promise<{
    version: string;
    platform: string;
    ffmpeg: boolean;
    ffmpegVersion?: string;
    ffmpegPath?: string;
    ffprobePath?: string;
  }>;
  readTextFile: (
    extensions: string[],
  ) => Promise<{ text: string; name: string } | null>;
  chooseCapcutProject: (
    mode: "file" | "directory",
  ) => Promise<CapcutImportSelection | null>;
  readCapcutDraft: (
    token: string,
    timelineId?: string,
  ) => Promise<{ text: string; name: string; warnings: string[] }>;
  discardCapcutProject: (token: string) => Promise<void>;
  writeTextFile: (text: string, name: string) => Promise<string | null>;
  revealPath: (path: string) => Promise<void>;
  getPathForFile: (file: File) => string;
}
declare global {
  interface Window {
    editorAPI?: EditorAPI;
    reacutLocale?: string;
  }
}
