import { DEFAULT_TEXT, DEFAULT_TRANSFORM } from "./defaults";
import { createTrack, id as createId } from "./model";
import {
  TEMPLATE_FORMAT,
  TEMPLATE_VERSION,
  templateAssetPath,
  templateCover,
  validateTemplate,
  type CevikEditTemplate,
  type TemplateMediaSlot,
} from "./templates";
import type { Clip, MediaAsset, Project, TextShadow, TextStyle } from "./types";

/**
 * Three original, offline example templates.
 *
 * They are generated from code (no bundled third-party design files) and use
 * the built-in asset catalogue only as an optional default for the media slot.
 * Timings, styles and animations are the same data a user template stores, so
 * the create-from-template path is exercised by the examples themselves.
 */
interface SceneSpec {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  duration: number;
  slot: Omit<TemplateMediaSlot, "key" | "start" | "duration" | "optional"> & {
    start: number;
    duration: number;
  };
  title: {
    text: string;
    start: number;
    duration: number;
    y: number;
    fontSize: number;
    color: string;
    background?: string;
    padding?: number;
    radius?: number;
    shadow?: TextShadow;
    bold?: boolean;
  };
  subtitles: Array<{
    text: string;
    start: number;
    duration: number;
    y: number;
    fontSize: number;
    color: string;
    background?: string;
    padding?: number;
    radius?: number;
  }>;
}

const NOW = "2026-11-08T00:00:00.000Z";

function placeholderAsset(
  slotKey: string,
  kind: MediaAsset["kind"],
  label: string,
  duration: number,
  width: number,
  height: number,
  fps: number,
): MediaAsset {
  return {
    id: createId(),
    name: label,
    path: templateAssetPath(slotKey),
    url: templateAssetPath(slotKey),
    kind,
    duration,
    width: kind === "audio" ? 0 : width,
    height: kind === "audio" ? 0 : height,
    fps: kind === "audio" ? 0 : fps,
    hasAudio: kind === "video" || kind === "audio",
  };
}

function textClip(
  trackId: string,
  start: number,
  duration: number,
  style: Partial<TextStyle> & { text: string },
  fps: number,
  transform: Partial<Clip["transform"]> = {},
): Clip {
  return {
    id: createId(),
    trackId,
    name: style.text.slice(0, 60),
    start,
    duration,
    sourceIn: 0,
    speed: 1,
    volume: 1,
    muted: false,
    transform: { ...DEFAULT_TRANSFORM, ...transform },
    adjustments: {
      brightness: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      blur: 0,
    },
    text: { ...DEFAULT_TEXT, fontSize: 72, strokeWidth: 0, ...style },
    fadeIn: 0,
    fadeOut: 0,
    audioFadeIn: 0,
    audioFadeOut: 0,
    keyframes: [],
  };
}

function sceneTemplate(spec: SceneSpec): CevikEditTemplate {
  const project = createProjectShell(spec);
  const videoTrack = createTrack("video", "Görüntü");
  const textTrack = createTrack("text", "Başlık");
  project.tracks = [textTrack, videoTrack];
  const asset = placeholderAsset(
    "m1",
    "image",
    spec.slot.label,
    spec.slot.duration,
    spec.width,
    spec.height,
    project.fps,
  );
  project.assets = [asset];
  const visual: Clip = {
    id: createId(),
    trackId: videoTrack.id,
    assetId: asset.id,
    name: spec.slot.label,
    start: spec.slot.start,
    duration: spec.slot.duration,
    sourceIn: 0,
    speed: 1,
    volume: 1,
    muted: false,
    transform: { ...DEFAULT_TRANSFORM, scale: 1.02 },
    adjustments: {
      brightness: 0.01,
      contrast: 1.04,
      saturation: 0.96,
      temperature: 0,
      blur: 0,
    },
    fadeIn: 0.4,
    fadeOut: 0.4,
    audioFadeIn: 0,
    audioFadeOut: 0,
    keyframes: [
      {
        id: createId(),
        time: 0,
        property: "scale",
        value: 1.02,
        easing: "linear",
      },
      {
        id: createId(),
        time: spec.slot.duration,
        property: "scale",
        value: 1.08,
        easing: "easeInOut",
      },
    ],
  };
  const title = textClip(
    textTrack.id,
    spec.title.start,
    spec.title.duration,
    {
      text: spec.title.text,
      fontSize: spec.title.fontSize,
      color: spec.title.color,
      background: spec.title.background ?? "transparent",
      padding: spec.title.padding ?? 0.25,
      radius: spec.title.radius ?? 0,
      bold: spec.title.bold ?? true,
      strokeWidth: 0,
      ...(spec.title.shadow ? { shadow: spec.title.shadow } : {}),
    },
    project.fps,
    { y: spec.title.y },
  );
  title.fadeIn = 0.6;
  title.fadeOut = 0.4;
  title.keyframes = [
    {
      id: createId(),
      time: 0,
      property: "y",
      value: spec.title.y + spec.height * 0.03,
      easing: "linear",
    },
    {
      id: createId(),
      time: 0.8,
      property: "y",
      value: spec.title.y,
      easing: "easeOut",
    },
  ];
  const subtitles = spec.subtitles.map((entry) =>
    textClip(
      textTrack.id,
      entry.start,
      entry.duration,
      {
        text: entry.text,
        fontSize: entry.fontSize,
        color: entry.color,
        background: entry.background ?? "#101015",
        padding: entry.padding ?? 0.34,
        radius: entry.radius ?? 0.4,
        bold: true,
        strokeWidth: 0,
      },
      project.fps,
      { y: entry.y },
    ),
  );
  for (const clip of subtitles) {
    clip.fadeIn = 0.25;
    clip.fadeOut = 0.25;
  }
  project.clips = [visual, title, ...subtitles];
  const media: TemplateMediaSlot[] = [
    {
      key: "m1",
      label: spec.slot.label,
      kind: "image",
      start: spec.slot.start,
      duration: spec.slot.duration,
      optional: true,
      ...(spec.slot.builtinId ? { builtinId: spec.slot.builtinId } : {}),
    },
  ];
  const texts = [title, ...subtitles].map((clip, index) => ({
    key: clip.id,
    label: index === 0 ? "Ana başlık" : `Altyazı ${index}`,
    text: clip.text!.text,
    start: clip.start,
    duration: clip.duration,
  }));
  return validateTemplate({
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    id: spec.id,
    name: spec.name,
    description: spec.description,
    cover: templateCover(project, spec.name),
    createdAt: NOW,
    project,
    media,
    texts,
  });
}

function createProjectShell(spec: SceneSpec): Project {
  return {
    version: 1,
    id: createId(),
    name: spec.name,
    width: spec.width,
    height: spec.height,
    fps: 30,
    background: "#101015",
    assets: [],
    tracks: [],
    clips: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const CARD = sceneTemplate({
  id: "acilis-karti",
  name: "Açılış kartı",
  description:
    "Karanlık arka plan üzerinde yumuşak yükselen başlık ve kısa alt başlık. Tek görsel yer tutucusu ve iki metin alanıyla hızlı bir giriş.",
  width: 1920,
  height: 1080,
  duration: 6,
  slot: {
    label: "Arka plan görseli",
    kind: "image",
    builtinId: "bg-midnight",
    start: 0,
    duration: 6,
  },
  title: {
    text: "Başlığınızı yazın",
    start: 0.4,
    duration: 5.2,
    y: -60,
    fontSize: 108,
    color: "#ffffff",
    shadow: { color: "#000000", blur: 22, offsetX: 0, offsetY: 6 },
  },
  subtitles: [
    {
      text: "Alt başlık veya tarih",
      start: 1.2,
      duration: 4.2,
      y: 80,
      fontSize: 44,
      color: "#e8ecef",
      background: "transparent",
    },
  ],
});

const VERTICAL = sceneTemplate({
  id: "dikey-sosyal",
  name: "Dikey sosyal video",
  description:
    "9:16 dikey tuval, büyük başlık ve alt bant. Telefon için hazırlanan tanıtım ve Reels/Shorts açılışları için başlangıç noktası.",
  width: 1080,
  height: 1920,
  duration: 8,
  slot: {
    label: "Dikey görsel veya video",
    kind: "image",
    builtinId: "bg-aurora",
    start: 0,
    duration: 8,
  },
  title: {
    text: "Yeni bir başlangıç",
    start: 0.3,
    duration: 7.4,
    y: -520,
    fontSize: 96,
    color: "#ffffff",
    shadow: { color: "#000000", blur: 26, offsetX: 0, offsetY: 8 },
  },
  subtitles: [
    {
      text: "Kaydır, izle, paylaş",
      start: 4.6,
      duration: 3.2,
      y: 640,
      fontSize: 46,
      color: "#101015",
      background: "#ffffff",
    },
  ],
});

const BLOG = sceneTemplate({
  id: "altyazi-blogu",
  name: "Altyazı bloğu",
  description:
    "Arka plan görüntüsü üzerinde sırayla beliren üç altyazı. Konuşma videosu ve eğitim içerikleri için sade, okunaklı bir düzen.",
  width: 1920,
  height: 1080,
  duration: 12,
  slot: {
    label: "Konuşma görüntüsü",
    kind: "image",
    builtinId: "bg-blueprint",
    start: 0,
    duration: 12,
  },
  title: {
    text: "Anlatmaya başlayın",
    start: 0.2,
    duration: 2.6,
    y: -330,
    fontSize: 64,
    color: "#ffffff",
  },
  subtitles: [
    {
      text: "İlk cümle buraya gelir",
      start: 1.4,
      duration: 3,
      y: 300,
      fontSize: 46,
      color: "#101015",
      background: "#f2f4f5",
    },
    {
      text: "İkinci cümle devam eder",
      start: 4.6,
      duration: 3,
      y: 300,
      fontSize: 46,
      color: "#101015",
      background: "#f2f4f5",
    },
    {
      text: "Üçüncü cümle kapanışı yapar",
      start: 7.8,
      duration: 3.4,
      y: 300,
      fontSize: 46,
      color: "#101015",
      background: "#f2f4f5",
    },
  ],
});

export const BUILTIN_TEMPLATES: readonly CevikEditTemplate[] = [
  CARD,
  VERTICAL,
  BLOG,
];
