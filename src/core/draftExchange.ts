/**
 * Draft exchange export.
 *
 * This writes a **plain-text, openly documented** draft document that CevikEdit can
 * read back and that other tools can inspect. It deliberately does NOT write
 * into CapCut's encrypted draft store: that format is proprietary, its payload
 * keys belong to the application, and modifying another app's files is outside
 * this project's authorized scope (see AGENTS.md). The shape below mirrors the
 * classic plaintext draft structure that the importer already accepts, so the
 * round trip through `importCapcutDraft` is fully testable.
 */
import { clone } from "./model";
import type { Clip, Project } from "./types";

export const DRAFT_EXCHANGE_FORMAT = "cevikedit-exchange-draft";
export const DRAFT_EXCHANGE_VERSION = 1;
export const DRAFT_EXCHANGE_EXTENSION = "cevikedit-draft.json";
export const DRAFT_LIMITS = { clips: 10_000, materials: 10_000, tracks: 1_000 } as const;

export interface DraftExchangeDocument {
  format: typeof DRAFT_EXCHANGE_FORMAT;
  version: typeof DRAFT_EXCHANGE_VERSION;
  generator: "CevikEdit";
  /** Compatibility hint only; the document is not a CapCut draft. */
  layout: "plaintext-draft";
  id: string;
  name: string;
  duration: number;
  fps: number;
  canvas_config: { width: number; height: number; ratio: string };
  materials: {
    videos: Array<Record<string, unknown>>;
    audios: Array<Record<string, unknown>>;
    texts: Array<Record<string, unknown>>;
  };
  tracks: Array<Record<string, unknown>>;
  /** CevikEdit can round-trip the full project in this side channel. */
  project: Project;
}

const micro = (seconds: number) => Math.round(seconds * 1_000_000);

function ratio(width: number, height: number): string {
  const divisor = (a: number, b: number): number => (b ? divisor(b, a % b) : a);
  const common = divisor(Math.round(width), Math.round(height)) || 1;
  return `${Math.round(width / common)}:${Math.round(height / common)}`;
}

export interface DraftExportOptions {
  name?: string;
}

/**
 * Build the exchange document. Media paths are absolute local paths so the
 * importer can re-link them on the same machine; they are never uploaded.
 */
export function exportDraft(
  input: Project,
  options: DraftExportOptions = {},
): DraftExchangeDocument {
  if (input.clips.length > DRAFT_LIMITS.clips)
    throw new Error(`Taslak en fazla ${DRAFT_LIMITS.clips} klip içerebilir`);
  if (input.tracks.length > DRAFT_LIMITS.tracks)
    throw new Error(`Taslak en fazla ${DRAFT_LIMITS.tracks} kanal içerebilir`);
  if (input.assets.length > DRAFT_LIMITS.materials)
    throw new Error(`Taslak en fazla ${DRAFT_LIMITS.materials} medya içerebilir`);
  const project = clone(input);
  const videos: Array<Record<string, unknown>> = [];
  const audios: Array<Record<string, unknown>> = [];
  const texts: Array<Record<string, unknown>> = [];
  const materialId = new Map<string, string>();
  for (const asset of project.assets) {
    const id = `material-${materialId.size + 1}`;
    materialId.set(asset.id, id);
    if (asset.kind === "audio")
      audios.push({
        id,
        type: "extracted_music",
        material_name: asset.name,
        path: asset.path,
        duration: micro(asset.duration),
      });
    else
      videos.push({
        id,
        type: asset.kind === "image" ? "photo" : "video",
        material_name: asset.name,
        path: asset.path,
        duration: micro(asset.duration),
        width: asset.width,
        height: asset.height,
      });
  }
  const trackOf = new Map(project.tracks.map((track, index) => [track.id, index]));
  const tracks: Array<Record<string, unknown>> = [];
  for (const [index, track] of project.tracks.entries()) {
    if (track.kind === "image") continue;
    const segments: Array<Record<string, unknown>> = [];
    for (const clip of project.clips.filter((item) => item.trackId === track.id))
      segments.push(segmentFor(clip, track.kind, materialId, texts, segments.length));
    tracks.push({
      id: `track-${index + 1}`,
      type: track.kind,
      name: track.name,
      attribute: track.kind === "text" ? 1 : 0,
      segments,
    });
  }
  // Stable visual layering: earlier CevikEdit tracks are drawn on top.
  for (const track of tracks) {
    const layer = Math.max(
      0,
      tracks.length - 1 - tracks.indexOf(track),
    );
    for (const segment of track.segments as Array<Record<string, unknown>>)
      segment.track_render_index = layer;
  }
  const duration = project.clips.reduce(
    (end, clip) => Math.max(end, clip.start + clip.duration),
    0,
  );
  void trackOf;
  return {
    format: DRAFT_EXCHANGE_FORMAT,
    version: DRAFT_EXCHANGE_VERSION,
    generator: "CevikEdit",
    layout: "plaintext-draft",
    id: `draft-${project.id}`,
    name: options.name?.trim() || project.name,
    duration: micro(duration),
    fps: project.fps,
    canvas_config: {
      width: project.width,
      height: project.height,
      ratio: ratio(project.width, project.height),
    },
    materials: { videos, audios, texts },
    tracks,
    project,
  };
}

function segmentFor(
  clip: Clip,
  kind: "video" | "audio" | "text",
  materialId: Map<string, string>,
  texts: Array<Record<string, unknown>>,
  index: number,
): Record<string, unknown> {
  const target = {
    start: micro(clip.start),
    duration: micro(clip.duration),
  };
  const source = {
    start: micro(clip.sourceIn),
    duration: micro(clip.duration * clip.speed),
  };
  let id = clip.assetId ? materialId.get(clip.assetId) : undefined;
  if (kind === "text" || clip.text) {
    id = `text-${index + 1}-${texts.length + 1}`;
    texts.push({
      id,
      type: "text",
      material_name: clip.text?.text?.slice(0, 60) ?? clip.name,
      // The importer accepts plain text or a JSON payload with `text`.
      content: clip.text?.text ?? "",
    });
  }
  if (!id) throw new Error(`“${clip.name}” klibinin medyası taslakta yok`);
  const segment: Record<string, unknown> = {
    id: `segment-${index + 1}-${Math.round(clip.start * 1000)}`,
    material_id: id,
    target_timerange: target,
    source_timerange: source,
    speed: clip.speed,
    volume: clip.volume,
    visible: true,
  };
  return segment;
}

export function serializeDraft(draft: DraftExchangeDocument): string {
  return JSON.stringify(draft, null, 2);
}

/**
 * Validate a document produced by `exportDraft` before it is written, so a
 * corrupt project cannot produce a file that silently loses clips.
 */
export function validateExchangeDraft(input: unknown): DraftExchangeDocument {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Taslak belgesi geçersiz");
  const draft = input as DraftExchangeDocument;
  if (draft.format !== DRAFT_EXCHANGE_FORMAT)
    throw new Error("Taslak biçimi tanınmadı");
  if (draft.version !== DRAFT_EXCHANGE_VERSION)
    throw new Error("Desteklenmeyen taslak sürümü");
  if (!draft.canvas_config || draft.canvas_config.width <= 0 || draft.canvas_config.height <= 0)
    throw new Error("Taslak tuval boyutu geçersiz");
  if (!Array.isArray(draft.tracks) || draft.tracks.length > DRAFT_LIMITS.tracks)
    throw new Error("Taslak kanal listesi geçersiz");
  if (!draft.materials || typeof draft.materials !== "object")
    throw new Error("Taslak medya listesi geçersiz");
  const total =
    draft.materials.videos.length +
    draft.materials.audios.length +
    draft.materials.texts.length;
  if (total > DRAFT_LIMITS.materials)
    throw new Error("Taslak medya listesi çok uzun");
  let segments = 0;
  for (const track of draft.tracks) {
    const list = (track as { segments?: unknown }).segments;
    if (!Array.isArray(list)) throw new Error("Taslak kanal segmentleri geçersiz");
    segments += list.length;
  }
  if (segments > DRAFT_LIMITS.clips) throw new Error("Taslak segment sayısı çok fazla");
  return draft;
}
