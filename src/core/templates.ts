import {
  clone,
  createClip,
  id as createId,
  snapToFrame,
  validateProject,
} from "./model";
import type { Clip, MediaAsset, Project } from "./types";

/**
 * Reusable project templates.
 *
 * A template is a plain JSON document. Its project keeps the canvas, tracks,
 * styles, animations and timings, but every media asset is replaced by a
 * `template://media/<slot>` sentinel and listed as a slot. A template therefore
 * never points at the author's disk, and importing an untrusted file can only
 * ever create a new project: paths are rewritten, sized and validated first.
 */
export const TEMPLATE_FORMAT = "cevikedit-template";
export const TEMPLATE_VERSION = 1;
export const TEMPLATE_EXTENSION = "cevikedit-template";
export const TEMPLATE_MEDIA_LIMIT = 100;
export const TEMPLATE_TEXT_LIMIT = 200;
export const TEMPLATE_COVER_LIMIT = 400_000;

export type TemplateMediaKind = "video" | "image" | "audio";

export interface TemplateMediaSlot {
  /** Stable key; also the suffix of the placeholder asset path. */
  key: string;
  label: string;
  kind: TemplateMediaKind;
  /** Offline default resolved from the bundled asset catalogue. */
  builtinId?: string;
  /** Time of the first clip using the slot. */
  start: number;
  duration: number;
  /** Missing optional slots drop their clips instead of blocking the project. */
  optional: boolean;
}

export interface TemplateTextSlot {
  /** Id of the clip in the template project. */
  key: string;
  label: string;
  text: string;
  start: number;
  duration: number;
}

export interface CevikEditTemplate {
  format: typeof TEMPLATE_FORMAT;
  version: typeof TEMPLATE_VERSION;
  id: string;
  name: string;
  description: string;
  /** Small data URL cover; empty when the template has no visual preview. */
  cover: string;
  createdAt: string;
  project: Project;
  media: TemplateMediaSlot[];
  texts: TemplateTextSlot[];
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

const MEDIA_KINDS: readonly TemplateMediaKind[] = ["video", "image", "audio"];
const BUILTIN_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const KEY = /^[A-Za-z0-9_-]{1,64}$/;
const TEMPLATE_PATH = /^template:\/\/media\/([A-Za-z0-9_-]{1,64})$/;
const BASE64_COVER = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const SVG_COVER = /^data:image\/svg\+xml;charset=utf-8,/;

export function templateAssetPath(key: string): string {
  return `template://media/${key}`;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error(`${label} geçersiz`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number, empty = true): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    value.includes("\0") ||
    (!empty && !value.trim())
  )
    throw new Error(`${label} geçersiz veya çok uzun`);
  return value;
}

function finite(value: unknown, label: string, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${label} geçersiz`);
  return value;
}

function isCover(value: string): boolean {
  return (
    (BASE64_COVER.test(value) || SVG_COVER.test(value)) &&
    value.length <= TEMPLATE_COVER_LIMIT
  );
}

export function projectDuration(project: Project): number {
  return project.clips.reduce(
    (end, clip) => Math.max(end, clip.start + clip.duration),
    0,
  );
}

export function templateSummary(template: CevikEditTemplate, builtin = false): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    cover: template.cover,
    createdAt: template.createdAt,
    width: template.project.width,
    height: template.project.height,
    fps: template.project.fps,
    duration: projectDuration(template.project),
    mediaCount: template.media.length,
    textCount: template.texts.length,
    builtin,
  };
}

export function validateTemplate(input: unknown): CevikEditTemplate {
  const raw = record(input, "Şablon");
  if (raw.format !== TEMPLATE_FORMAT) throw new Error("Şablon biçimi tanınmadı");
  if (raw.version !== TEMPLATE_VERSION)
    throw new Error("Desteklenmeyen şablon sürümü");
  const project = validateProject(raw.project);
  if (!Array.isArray(raw.media) || raw.media.length > TEMPLATE_MEDIA_LIMIT)
    throw new Error("Şablon medya yer tutucuları geçersiz veya çok fazla");
  if (!Array.isArray(raw.texts) || raw.texts.length > TEMPLATE_TEXT_LIMIT)
    throw new Error("Şablon metin yer tutucuları geçersiz veya çok fazla");

  // Every asset must be a placeholder; nothing may reference a local file.
  const assetByKey = new Map<string, MediaAsset>();
  for (const asset of project.assets) {
    const match = TEMPLATE_PATH.exec(asset.path);
    if (!match) throw new Error("Şablon medya yolu geçersiz");
    if (assetByKey.has(match[1]))
      throw new Error("Şablon medya yer tutucusu yineleniyor");
    assetByKey.set(match[1], asset);
  }

  const keys = new Set<string>();
  const media: TemplateMediaSlot[] = raw.media.map((entry) => {
    const value = record(entry, "Medya yer tutucusu");
    const key = text(value.key, "Yer tutucu anahtarı", 64, false);
    if (!KEY.test(key)) throw new Error("Yer tutucu anahtarı geçersiz");
    if (keys.has(key)) throw new Error("Yer tutucu anahtarı yineleniyor");
    keys.add(key);
    const asset = assetByKey.get(key);
    if (!asset) throw new Error("Şablon medya yer tutucusu projede yok");
    const kind = asset.kind;
    if (kind !== "image" && kind !== "video" && kind !== "audio")
      throw new Error("Medya yer tutucusu türü geçersiz");
    let builtinId: string | undefined;
    if (value.builtinId !== undefined) {
      builtinId = text(value.builtinId, "Yerleşik medya kimliği", 64, false);
      if (!BUILTIN_ID.test(builtinId))
        throw new Error("Yerleşik medya kimliği geçersiz");
    }
    return {
      key,
      label: text(value.label, "Yer tutucu adı", 200, false),
      kind,
      ...(builtinId ? { builtinId } : {}),
      start: finite(value.start, "Yer tutucu başlangıcı", 0, 86400),
      duration: finite(value.duration, "Yer tutucu süresi", 1 / 240, 86400),
      optional: value.optional !== false,
    };
  });
  for (const key of assetByKey.keys())
    if (!media.some((slot) => slot.key === key))
      throw new Error("Şablonda listelenmeyen medya var");

  const clipIds = new Set(project.clips.map((clip) => clip.id));
  const texts: TemplateTextSlot[] = raw.texts.map((entry) => {
    const value = record(entry, "Metin yer tutucusu");
    const key = text(value.key, "Yer tutucu anahtarı", 64, false);
    if (!KEY.test(key)) throw new Error("Yer tutucu anahtarı geçersiz");
    if (keys.has(key)) throw new Error("Yer tutucu anahtarı yineleniyor");
    if (!clipIds.has(key)) throw new Error("Şablon metin yer tutucusu projede yok");
    keys.add(key);
    return {
      key,
      label: text(value.label, "Yer tutucu adı", 200, false),
      text: text(value.text, "Yer tutucu metni", 20000),
      start: finite(value.start, "Yer tutucu başlangıcı", 0, 86400),
      duration: finite(value.duration, "Yer tutucu süresi", 1 / 240, 86400),
    };
  });

  let cover = "";
  if (raw.cover !== undefined && raw.cover !== "") {
    cover = text(raw.cover, "Şablon kapağı", TEMPLATE_COVER_LIMIT, false);
    if (!isCover(cover)) throw new Error("Şablon kapağı geçersiz");
  }
  return {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    id: text(raw.id, "Şablon kimliği", 100, false),
    name: text(raw.name, "Şablon adı", 120, false),
    description: text(raw.description ?? "", "Şablon açıklaması", 600),
    cover,
    createdAt: text(raw.createdAt, "Şablon tarihi", 40, false),
    project,
    media,
    texts,
  };
}

export function serializeTemplate(template: CevikEditTemplate): string {
  return JSON.stringify(validateTemplate(template), null, 2);
}

export function parseTemplate(source: string): CevikEditTemplate {
  if (typeof source !== "string" || source.length > 8 * 1024 * 1024)
    throw new Error("Şablon dosyası çok büyük");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("Şablon dosyası geçerli JSON değil");
  }
  return validateTemplate(value);
}

export interface SaveTemplateOptions {
  name: string;
  description?: string;
  cover?: string;
  id?: string;
}

/**
 * Turn a project into a template. Disk paths are replaced by sentinels and
 * cache fields are dropped, so the result can be shared safely.
 */
export function templateFromProject(
  input: Project,
  options: SaveTemplateOptions,
): CevikEditTemplate {
  const project = validateProject(clone(input));
  const name = text(options.name, "Şablon adı", 120, false).trim();
  const usedAssets = project.assets.filter((asset) =>
    project.clips.some((clip) => clip.assetId === asset.id),
  );
  if (usedAssets.length > TEMPLATE_MEDIA_LIMIT)
    throw new Error("Şablonda çok fazla medya var");
  const media: TemplateMediaSlot[] = [];
  const placeholders = new Map<string, MediaAsset>();
  for (const asset of usedAssets) {
    const clips = project.clips.filter((clip) => clip.assetId === asset.id);
    const first = clips.reduce((a, b) => (a.start <= b.start ? a : b));
    const key = `m${media.length + 1}`;
    media.push({
      key,
      label: asset.name || `Medya ${media.length + 1}`,
      kind: asset.kind,
      start: first.start,
      duration: Math.max(
        1 / project.fps,
        clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0) -
          first.start,
      ),
      optional: true,
    });
    placeholders.set(
      asset.id,
      {
        ...asset,
        path: templateAssetPath(key),
        url: templateAssetPath(key),
        thumbnail: undefined,
        previewUrl: undefined,
        previewError: undefined,
        waveform: undefined,
        missing: false,
      },
    );
  }
  project.assets = project.assets.map(
    (asset) => placeholders.get(asset.id) ?? asset,
  );
  // Assets that no clip uses would point at a real path; drop them entirely.
  project.assets = project.assets.filter(
    (asset) => !asset.path || TEMPLATE_PATH.test(asset.path),
  );
  const textClips = project.clips.filter((clip) => clip.text);
  if (textClips.length > TEMPLATE_TEXT_LIMIT)
    throw new Error("Şablonda çok fazla metin yer tutucusu var");
  const texts: TemplateTextSlot[] = textClips.map((clip, index) => ({
    key: clip.id,
    label: `Metin ${index + 1}`,
    text: clip.text!.text,
    start: clip.start,
    duration: clip.duration,
  }));
  const cover = options.cover ?? "";
  return validateTemplate({
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    id: options.id ?? createId(),
    name,
    description: options.description?.slice(0, 600) ?? "",
    cover,
    createdAt: new Date().toISOString(),
    project,
    media,
    texts,
  });
}

/** Small data-URL cover from the first thumbnail, otherwise a generated card. */
export function templateCover(project: Project, name: string): string {
  const candidate = project.assets
    .filter((asset) => asset.kind !== "audio" && asset.thumbnail)
    .map((asset) => asset.thumbnail!)
    .find(isCover);
  if (candidate) return candidate;
  const safe = name
    .slice(0, 32)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#15343a"/><stop offset="1" stop-color="#2a2f45"/></linearGradient></defs><rect width="480" height="270" fill="url(#g)"/><circle cx="404" cy="56" r="92" fill="#42d4c7" opacity=".16"/><text x="32" y="152" font-family="Segoe UI,sans-serif" font-size="30" font-weight="600" fill="#e8ecef">${safe || "CevikEdit"}</text><text x="32" y="184" font-family="Segoe UI,sans-serif" font-size="14" fill="#8fa3a8">CevikEdit şablonu</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface InstantiateOptions {
  name: string;
  /** Slot key → already imported local asset. */
  media?: Record<string, MediaAsset>;
  /** Text slot key → replacement text. */
  texts?: Record<string, string>;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

export interface InstantiatedTemplate {
  project: Project;
  warnings: string[];
  /** Template clip id → new project clip id, including text slots. */
  clipIds: Record<string, string>;
}

function accepts(slot: TemplateMediaKind, asset: MediaAsset): boolean {
  if (slot === "audio")
    return (
      asset.kind === "audio" ||
      (asset.kind === "video" && asset.hasAudio !== false)
    );
  if (slot === "video") return asset.kind === "video" || asset.kind === "image";
  return asset.kind === "image" || asset.kind === "video";
}

function fitClip(
  clip: Clip,
  duration: number,
  fps: number,
): { changed: boolean; duration: number } {
  if (clip.duration <= duration + 1e-9) return { changed: false, duration: clip.duration };
  const frame = 1 / fps;
  // Trim to a whole frame so the exporter and the timeline agree.
  const fitted = Math.max(
    frame,
    snapToFrame(Math.max(frame, Math.floor(duration * fps) / fps), fps),
  );
  clip.duration = Math.min(clip.duration, fitted);
  clip.fadeIn = Math.min(clip.fadeIn, clip.duration);
  clip.fadeOut = Math.min(clip.fadeOut, clip.duration);
  clip.audioFadeIn = Math.min(clip.audioFadeIn, clip.duration);
  clip.audioFadeOut = Math.min(clip.audioFadeOut, clip.duration);
  clip.keyframes = clip.keyframes.filter(
    (key) => key.time <= clip.duration + 1e-9,
  );
  return { changed: true, duration: clip.duration };
}

/**
 * Build a fresh project from a template.
 *
 * The canvas, tracks, styles, animations and timings come from the template.
 * Media is restarted at source 0 and clamped to the available source. The
 * renderer contains every source inside the canvas, so a different aspect ratio
 * is letterboxed instead of distorted. Missing optional slots drop their clips
 * and are reported instead of failing the whole instantiation.
 */
export function instantiateTemplate(
  template: CevikEditTemplate,
  options: InstantiateOptions,
): InstantiatedTemplate {
  const source = validateTemplate(template);
  const name = text(options.name, "Proje adı", 200, false).trim();
  const chosen = options.media ?? {};
  const texts = options.texts ?? {};
  const now = (options.now ?? new Date()).toISOString();
  const project = clone(source.project);
  project.id = createId();
  project.name = name;
  project.createdAt = now;
  project.updatedAt = now;
  const warnings: string[] = [];

  const trackMap = new Map<string, string>();
  project.tracks = project.tracks.map((track) => {
    const id = createId();
    trackMap.set(track.id, id);
    return { ...track, id };
  });

  const slotByAssetId = new Map<string, TemplateMediaSlot>();
  for (const asset of project.assets) {
    const match = TEMPLATE_PATH.exec(asset.path);
    const slot = source.media.find((item) => item.key === match?.[1]);
    if (slot) slotByAssetId.set(asset.id, slot);
  }

  const replacements = new Map<string, { asset: MediaAsset; slot: TemplateMediaSlot }>();
  const skipped = new Set<string>();
  for (const slot of source.media) {
    const asset = project.assets.find(
      (item) => item.path === templateAssetPath(slot.key),
    );
    if (!asset) continue;
    const replacement = chosen[slot.key];
    if (!replacement) {
      if (slot.optional) {
        skipped.add(slot.key);
        warnings.push(`“${slot.label}” seçilmedi; ilgili klipler eklenmedi.`);
        continue;
      }
      throw new Error(`Şablon medyası seçilmedi: ${slot.label}`);
    }
    if (!accepts(slot.kind, replacement))
      throw new Error(
        `“${slot.label}” için ${slot.kind === "audio" ? "ses" : slot.kind === "video" ? "video" : "görsel"} gerekli`,
      );
    replacements.set(asset.id, { slot, asset: replacement });
  }

  const assetMap = new Map<string, string>();
  const nextAssets: MediaAsset[] = [];
  for (const asset of project.assets) {
    const entry = replacements.get(asset.id);
    if (!entry) continue;
    const next: MediaAsset = {
      ...clone(entry.asset),
      id: createId(),
      ...(entry.slot.kind === "audio"
        ? { kind: "audio" as const, width: 0, height: 0, fps: 0, thumbnail: undefined }
        : {}),
    };
    nextAssets.push(next);
    assetMap.set(asset.id, next.id);
  }
  const assetById = new Map(nextAssets.map((asset) => [asset.id, asset]));
  project.assets = nextAssets;

  const clipMap: Record<string, string> = {};
  const linkMap = new Map<string, string>();
  const nextClips: Clip[] = [];
  const shortened = new Map<string, string>();
  for (const original of source.project.clips) {
    if (original.assetId) {
      const slot = slotByAssetId.get(original.assetId);
      if (!slot || skipped.has(slot.key)) continue;
    }
    const clip = clone(original);
    clip.id = createId();
    clipMap[original.id] = clip.id;
    clip.trackId = trackMap.get(original.trackId)!;
    if (original.assetId) {
      const mapped = assetMap.get(original.assetId);
      const asset = mapped ? assetById.get(mapped) : undefined;
      if (!asset) throw new Error("Şablon medya yer tutucusu çözümlenemedi");
      clip.assetId = asset.id;
      // A replaced source starts at its own beginning; the timeline duration
      // stays unless the new file is shorter.
      clip.sourceIn = 0;
      if (asset.kind !== "image") {
        const available = Math.max(0, asset.duration) / Math.max(0.000001, clip.speed);
        const fitted = fitClip(clip, available, project.fps);
        if (fitted.changed) {
          const label = slotByAssetId.get(original.assetId)?.label ?? asset.name;
          shortened.set(label, `${fitted.duration.toFixed(2)} sn`);
        }
      }
    }
    if (original.linkId) {
      if (!linkMap.has(original.linkId)) linkMap.set(original.linkId, createId());
      clip.linkId = linkMap.get(original.linkId);
    }
    clip.keyframes = original.keyframes
      .filter((key) => key.time <= clip.duration + 1e-9)
      .map((key) => ({ ...clone(key), id: createId() }));
    if (clip.text) {
      const replacement = texts[original.id];
      if (replacement !== undefined) {
        const value = text(replacement, "Metin", 20000).trim();
        const fallback = source.texts.find((item) => item.key === original.id)?.text;
        clip.text.text = value || fallback || clip.text.text;
        clip.name = clip.text.text.slice(0, 4096);
      }
    }
    nextClips.push(clip);
  }
  project.clips = nextClips;
  for (const [label, duration] of shortened)
    warnings.push(`“${label}” yeni medyaya göre ${duration} olarak kısaltıldı.`);
  return {
    project: validateProject(project),
    warnings,
    clipIds: clipMap,
  };
}

/** Placeholder clip helper for template authors and built-in templates. */
export function placeholderClip(
  asset: MediaAsset,
  trackId: string,
  start: number,
  duration: number,
  fps: number,
): Clip {
  const clip = createClip(asset, trackId, start, fps);
  clip.duration = duration;
  return clip;
}
