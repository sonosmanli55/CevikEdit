import type {
  Clip,
  MediaAsset,
  Project,
  TrackKind,
  Track,
  Keyframe,
  KeyframeEasing,
  FadeWindow,
} from "./types";
import {
  DEFAULT_TRANSFORM,  DEFAULT_ADJUSTMENTS,
  DEFAULT_TEXT,
} from "./defaults";
import { bezierProgress } from "./bezier";
export const id = () => crypto.randomUUID();
export const clone = <T>(value: T): T => structuredClone(value);
export const snapToFrame = (time: number, fps: number) =>
  Math.round(time * fps) / fps;
export const projectDuration = (project: Project): number =>
  project.clips.reduce(
    (end, clip) => Math.max(end, clip.start + clip.duration),
    0,
  );
export function createProject(name = "Adsız proje"): Project {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: id(),
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    background: "#101015",
    assets: [],
    tracks: [
      createTrack("text", "Metin"),
      createTrack("video", "Video 1"),
      createTrack("audio", "Ses 1"),
    ],
    clips: [],
    createdAt: now,
    updatedAt: now,
  };
}
export function createTrack(kind: TrackKind, name?: string): Track {
  return {
    id: id(),
    kind,
    name:
      name ??
      { video: "Video", image: "Görüntü", audio: "Ses", text: "Metin" }[kind],
    muted: false,
    hidden: false,
    locked: false,
  };
}
export function createClip(
  asset: MediaAsset | undefined,
  trackId: string,
  start: number,
  fps: number,
): Clip {
  return {
    id: id(),
    trackId,
    assetId: asset?.id,
    name: asset?.name ?? "Varsayılan metin",
    start: snapToFrame(Math.max(0, start), fps),
    duration:
      asset?.kind === "image" || !asset ? 5 : Math.max(1 / fps, asset.duration),
    sourceIn: 0,
    speed: 1,
    volume: 1,
    muted: false,
    transform: { ...DEFAULT_TRANSFORM },
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    text: !asset ? { ...DEFAULT_TEXT } : undefined,
    fadeIn: 0,
    fadeOut: 0,
    audioFadeIn: 0,
    audioFadeOut: 0,
    keyframes: [],
  };
}
/** Fade time is in clip-local timeline seconds; cut windows preserve the original envelope. */
export function fadeWindow(clip: Clip, kind: "video" | "audio"): FadeWindow {
  return kind === "video"
    ? (clip.videoFadeWindow ?? {
        offset: 0,
        duration: clip.duration,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
      })
    : (clip.audioFadeWindow ?? {
        offset: 0,
        duration: clip.duration,
        fadeIn: clip.audioFadeIn,
        fadeOut: clip.audioFadeOut,
      });
}
export function evaluateFade(
  clip: Clip,
  time: number,
  kind: "video" | "audio",
): number {
  const window = fadeWindow(clip, kind),
    local = window.offset + time;
  const incoming =
    window.fadeIn > 0 ? Math.max(0, Math.min(1, local / window.fadeIn)) : 1;
  const outgoing =
    window.fadeOut > 0
      ? Math.max(0, Math.min(1, (window.duration - local) / window.fadeOut))
      : 1;
  return incoming * outgoing;
}
function preserveFades(original: Clip, next: Clip, offset: number): void {
  for (const kind of ["video", "audio"] as const) {
    const window = fadeWindow(original, kind);
    if (window.fadeIn > 0 || window.fadeOut > 0)
      next[kind === "video" ? "videoFadeWindow" : "audioFadeWindow"] = {
        ...window,
        offset: window.offset + offset,
      };
  }
}
export function splitClip(
  project: Project,
  clipId: string,
  time: number,
): Project {
  const clip = project.clips.find((c) => c.id === clipId);
  if (
    !Number.isFinite(time) ||
    !clip ||
    project.tracks.find((t) => t.id === clip.trackId)?.locked
  )
    return project;
  const at = snapToFrame(time, project.fps),
    leftDuration = at - clip.start;
  if (
    leftDuration < 1 / project.fps - 1e-9 ||
    clip.duration - leftDuration < 1 / project.fps - 1e-9
  )
    return project;
  const right: Clip = {
    ...clone(clip),
    id: id(),
    start: at,
    duration: clip.duration - leftDuration,
    sourceIn: clip.sourceIn + leftDuration * clip.speed,
    fadeIn: 0,
    audioFadeIn: 0,
    keyframes: sliceKeyframes(clip, leftDuration, clip.duration),
  };
  const left = {
    ...clip,
    duration: leftDuration,
    fadeOut: 0,
    audioFadeOut: 0,
    keyframes: sliceKeyframes(clip, 0, leftDuration),
  };
  preserveFades(clip, left, 0);
  preserveFades(clip, right, leftDuration);
  for (const field of [
    "fadeIn",
    "fadeOut",
    "audioFadeIn",
    "audioFadeOut",
  ] as const) {
    left[field] = Math.min(left[field], left.duration);
    right[field] = Math.min(right[field], right.duration);
  }
  return {
    ...project,
    clips: project.clips.flatMap((c) =>
      c.id === clipId ? [left, right] : [c],
    ),
  };
}
export function trimClip(
  project: Project,
  clipId: string,
  edge: "start" | "end",
  time: number,
): Project {
  const original = project.clips.find((c) => c.id === clipId);
  if (
    !Number.isFinite(time) ||
    !original ||
    project.tracks.find((t) => t.id === original.trackId)?.locked
  )
    return project;
  const clip = clone(original),
    asset = project.assets.find((a) => a.id === clip.assetId);
  const min = 1 / project.fps,
    at = snapToFrame(time, project.fps);
  if (edge === "start") {
    const lower =
      asset && asset.kind !== "image"
        ? Math.max(0, clip.start - clip.sourceIn / clip.speed)
        : 0;
    const next = Math.max(
      lower,
      Math.min(at, clip.start + clip.duration - min),
    );
    const delta = next - clip.start;
    clip.sourceIn = Math.max(0, clip.sourceIn + delta * clip.speed);
    clip.duration -= delta;
    clip.start = next;
    clip.keyframes = sliceKeyframes(original, delta, original.duration);
  } else {
    const max =
      asset && asset.kind !== "image"
        ? clip.start + (asset.duration - clip.sourceIn) / clip.speed
        : Infinity;
    clip.duration = Math.max(min, Math.min(at, max) - clip.start);
    clip.keyframes = sliceKeyframes(original, 0, clip.duration);
  }
  preserveFades(original, clip, clip.start - original.start);
  for (const field of [
    "fadeIn",
    "fadeOut",
    "audioFadeIn",
    "audioFadeOut",
  ] as const)
    clip[field] = Math.min(clip[field], clip.duration);
  if (clip.start === original.start && clip.duration === original.duration)
    return project;
  return {
    ...project,
    clips: project.clips.map((c) => (c.id === clipId ? clip : c)),
  };
}
export function changeClipSpeed(
  project: Project,
  clipId: string,
  speed: number,
): Project {
  const clip = project.clips.find((c) => c.id === clipId);
  if (
    !clip ||
    project.tracks.find((t) => t.id === clip.trackId)?.locked ||
    !Number.isFinite(speed) ||
    speed < 0.1 ||
    speed > 8 ||
    speed === clip.speed
  )
    return project;
  const ratio = clip.speed / speed;
  const next = {
    ...clip,
    speed,
    duration: clip.duration * ratio,
    keyframes: clip.keyframes.map((k) => ({ ...k, time: k.time * ratio })),
    fadeIn: clip.fadeIn * ratio,
    fadeOut: clip.fadeOut * ratio,
    audioFadeIn: clip.audioFadeIn * ratio,
    audioFadeOut: clip.audioFadeOut * ratio,
  };
  for (const field of ["videoFadeWindow", "audioFadeWindow"] as const)
    if (clip[field]) {
      const w = clip[field]!;
      next[field] = {
        offset: w.offset * ratio,
        duration: w.duration * ratio,
        fadeIn: w.fadeIn * ratio,
        fadeOut: w.fadeOut * ratio,
      };
    }
  return {
    ...project,
    clips: project.clips.map((c) => (c.id === clipId ? next : c)),
  };
}

export const KEYFRAME_EASINGS = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
] as const satisfies readonly KeyframeEasing[];

/**
 * Each destination key owns the interpolation for the interval ending at it.
 * The optional window narrows the easing inside that interval; trimming and
 * splitting remap it so the curve keeps its original shape.
 */
export function keyframeEasingWindow(
  key: Pick<Keyframe, "easing" | "easingWindow">,
): { start: number; end: number } {
  if (key.easingWindow) return key.easingWindow;
  if (key.easing === "easeIn") return { start: 0, end: 0.5 };
  if (key.easing === "easeOut") return { start: 0.5, end: 1 };
  return { start: 0, end: 1 };
}

/** Coefficients of the shared normalized cubic easing family. */
export function keyframeEasingCoefficients(
  easing: KeyframeEasing,
  window: { start: number; end: number },
): { a: number; b: number; c: number; denominator: number } {
  if (easing === "linear") return { a: 1, b: 0, c: 0, denominator: 1 };
  const start = window.start,
    delta = window.end - window.start,
    a = 6 * start * (1 - start),
    b = 3 * delta * (1 - 2 * start),
    c = -2 * delta * delta;
  return { a, b, c, denominator: a + b + c };
}

/** Shared normalized easing used by preview, export and curve editing. */
export function keyframeEasedRatio(
  easing: KeyframeEasing,
  ratio: number,
  window = keyframeEasingWindow({ easing }),
): number {
  const r = Math.max(0, Math.min(1, ratio));
  if (easing === "linear") return r;
  const { a, b, c, denominator } = keyframeEasingCoefficients(easing, window);
  if (!Number.isFinite(denominator) || denominator === 0) return r;
  const value = (r * (a + b * r + c * r * r)) / denominator;
  return Math.max(0, Math.min(1, value));
}

/**
 * Easing for one keyframe interval. A free Bézier curve takes precedence over
 * the named preset; the returned value may overshoot like CSS cubic-bezier.
 */
export function keyframeRatio(
  key: Pick<Keyframe, "easing" | "easingWindow" | "bezier">,
  ratio: number,
): number {
  if (key.bezier) return bezierProgress(key.bezier, ratio);
  const value = keyframeEasedRatio(
    key.easing,
    ratio,
    keyframeEasingWindow(key),
  );
  return value;
}

/** Each destination key owns the interpolation for the interval ending at it. */
function orderedKeys(clip: Clip, property: Keyframe["property"]): Keyframe[] {
  const keys = clip.keyframes
    .filter((k) => k.property === property)
    .sort((a, b) => a.time - b.time);
  return keys.filter(
    (k, i) => i === keys.length - 1 || keys[i + 1].time !== k.time,
  );
}
/** Remap an interval of a smoothstep curve without changing its values or shape. */
function sliceKeyframes(clip: Clip, from: number, to: number): Keyframe[] {
  const result: Keyframe[] = [];
  for (const property of [
    "x",
    "y",
    "scale",
    "rotation",
    "opacity",
    "volume",
  ] as const) {
    const keys = orderedKeys(clip, property);
    if (!keys.length) continue;
    const times = [
      ...new Set([
        from,
        ...keys.filter((k) => k.time > from && k.time < to).map((k) => k.time),
        to,
      ]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < times.length; i++) {
      const at = times[i],
        evaluated = evaluateKeyframes(clip, at);
      const value =
        property === "volume"
          ? evaluated.volume
          : evaluated.transform[property];
      const key: Keyframe = {
        id: id(),
        time: at - from,
        property,
        value,
        easing: "linear",
      };
      if (i > 0) {
        const previous = times[i - 1],
          midpoint = (previous + at) / 2;
        const rightIndex = keys.findIndex((k) => k.time > midpoint);
        if (rightIndex > 0) {
          const left = keys[rightIndex - 1],
            right = keys[rightIndex];
          key.easing = right.easing;
          if (right.easing !== "linear") {
            const window = keyframeEasingWindow(right),
              span = right.time - left.time;
            const start =
              window.start +
              ((window.end - window.start) * (previous - left.time)) / span;
            const end =
              window.start +
              ((window.end - window.start) * (at - left.time)) / span;
            if (start > 0 || end < 1)
              key.easingWindow = {
                start: Math.max(0, start),
                end: Math.min(1, end),
              };
          }
        }
      }
      result.push(key);
    }
  }
  return result;
}
export function evaluateKeyframes(clip: Clip, time: number): Clip {
  const result = { ...clip, transform: { ...clip.transform } };
  for (const property of [
    "x",
    "y",
    "scale",
    "rotation",
    "opacity",
    "volume",
  ] as const) {
    const keys = orderedKeys(clip, property);
    if (!keys.length) continue;
    let value = keys[0].value;
    if (time >= keys[keys.length - 1].time) value = keys[keys.length - 1].value;
    else
      for (let i = 0; i < keys.length - 1; i++)
        if (time >= keys[i].time && time <= keys[i + 1].time) {
          const ratio = keyframeRatio(
            keys[i + 1],
            (time - keys[i].time) / (keys[i + 1].time - keys[i].time || 1),
          );
          value = keys[i].value + (keys[i + 1].value - keys[i].value) * ratio;
          break;
        }
    if (property === "volume") result.volume = value;
    else result.transform[property] = value;
  }
  return result;
}
export function formatTime(time: number, fps = 30) {
  const frames = Math.max(0, Math.round(time * fps));
  const f = frames % fps,
    seconds = Math.floor(frames / fps);
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
    f,
  ]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
/** Validate external project data without numeric coercion or defaulting missing fields. */
export function validateProject(input: unknown): Project {
  const fail = (name: string): never => {
    throw new Error(`Proje geçersiz: ${name}`);
  };
  const object = (value: unknown, name: string): Record<string, unknown> => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      fail(name);
    return value as Record<string, unknown>;
  };
  const str = (
    value: unknown,
    name: string,
    max = 4096,
    empty = false,
  ): string => {
    if (
      typeof value !== "string" ||
      value.length > max ||
      (!empty && !value.length) ||
      value.includes("\0")
    )
      fail(name);
    return value as string;
  };
  const num = (
    value: unknown,
    name: string,
    low = -1e9,
    high = 1e9,
  ): number => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < low ||
      value > high
    )
      fail(name);
    return value as number;
  };
  const bool = (value: unknown, name: string): void => {
    if (typeof value !== "boolean") fail(name);
  };
  const list = (value: unknown, name: string, max: number): unknown[] => {
    if (!Array.isArray(value) || value.length > max) fail(name);
    return value as unknown[];
  };
  const choice = (
    value: unknown,
    choices: readonly string[],
    name: string,
  ): void => {
    if (typeof value !== "string" || !choices.includes(value)) fail(name);
  };
  const color = (value: unknown, name: string): void => {
    str(value, name, 32);
    if (
      !/^#[\da-f]{6}([\da-f]{2})?$/i.test(value as string) &&
      !/^(black|white|red|green|blue|transparent)$/i.test(value as string)
    )
      fail(name);
  };
  const p = object(input, "İçerik");
  if (p.version !== 1) fail("Sürüm (yalnızca sürüm 1 desteklenir)");
  str(p.id, "ID", 256);
  str(p.name, "Ad", 4096, true);
  for (const field of ["width", "height"] as const)
    if (!Number.isInteger(num(p[field], field, 16, 7680))) fail(field);
  if (![24, 25, 30, 50, 60].includes(num(p.fps, "Kare hızı"))) fail("Kare hızı");
  color(p.background, "Arka plan rengi");
  for (const field of ["createdAt", "updatedAt"] as const)
    if (!Number.isFinite(Date.parse(str(p[field], field, 64)))) fail(field);
  const rawAssets = list(p.assets, "Medya listesi", 10000),
    rawTracks = list(p.tracks, "Kanal listesi", 1000),
    rawClips = list(p.clips, "Klip listesi", 10000);
  const ids = new Set<string>();
  const recordId = (item: Record<string, unknown>, label: string) => {
    const value = str(item.id, `${label} ID`, 256);
    if (ids.has(value)) fail("Yinelenen ID");
    ids.add(value);
    return value;
  };
  const assets = new Map<string, Record<string, unknown>>(),
    tracks = new Map<string, Record<string, unknown>>();
  for (const raw of rawAssets) {
    const a = object(raw, "Medya");
    assets.set(recordId(a, "Medya"), a);
    str(a.name, "Medya adı", 4096, true);
    str(a.path, "Medya yolu", 32768);
    str(a.url, "Medya URL'si", 32768);
    choice(a.kind, ["video", "audio", "image"], "Medya türü");
    num(a.duration, "Medya süresi", 0, 86400 * 8);
    for (const field of ["width", "height"] as const)
      num(a[field], `Medya ${field}`, 0, 100000);
    num(a.fps, "Medya kare hızı", 0, 1000);
    bool(a.hasAudio, "Medya ses işareti");
    if (a.missing !== undefined) bool(a.missing, "Medya eksik işareti");
    if (a.thumbnail !== undefined) str(a.thumbnail, "Medya küçük resmi", 32768);
    if (a.previewUrl !== undefined) str(a.previewUrl, "Medya önizleme URL'si", 32768);
    if (a.previewError !== undefined)
      str(a.previewError, "Medya önizleme hatası", 4096, true);
    if (a.colorPrimaries !== undefined)
      str(a.colorPrimaries, "Medya renk ana bileşenleri", 64, true);
    if (a.colorTransfer !== undefined)
      str(a.colorTransfer, "Medya transfer işlevi", 64, true);
    if (a.hdr !== undefined) bool(a.hdr, "Medya: HDR etiketi");
    if (a.hdrKind !== undefined)
      choice(a.hdrKind, ["pq", "hlg"], "Medya HDR türü");
    if (a.waveform !== undefined)
      for (const v of list(a.waveform, "Ses dalga formu", 100000))
        num(v, "Ses dalga formu değeri", 0, 1);
  }
  for (const raw of rawTracks) {
    const t = object(raw, "Kanal");
    tracks.set(recordId(t, "Kanal"), t);
    str(t.name, "Kanal adı", 4096, true);
    choice(t.kind, ["video", "audio", "image", "text"], "Kanal türü");
    for (const field of ["muted", "hidden", "locked"] as const)
      bool(t[field], `Kanal ${field}`);
  }
  for (const raw of rawClips) {
    const c = object(raw, "Klip");
    recordId(c, "Klip");
    str(c.name, "Klip adı", 4096, true);
    const track = tracks.get(str(c.trackId, "Klip kanal ID'si", 256));
    if (!track) fail("Klip kanal referansı");
    const asset =
      c.assetId === undefined
        ? undefined
        : assets.get(str(c.assetId, "Klip medya ID'si", 256));
    if (c.assetId !== undefined && !asset) fail("Klip medya referansı");
    const start = num(c.start, "Klip başlangıcı", 0, 86400),
      duration = num(c.duration, "Klip süresi", Number.MIN_VALUE, 86400),
      sourceIn = num(c.sourceIn, "Kaynak medya başlangıcı", 0, 86400 * 8),
      speed = num(c.speed, "Hız", 0.1, 8);
    if (start + duration > 86400) fail("Zaman çizelgesi süresi (en fazla 24 saat)");
    num(c.volume, "Ses düzeyi", 0, 4);
    bool(c.muted, "Klibi sessize al");
    if (c.linkId !== undefined) str(c.linkId, "Klip bağlantı kimliği", 64);
    for (const field of [
      "fadeIn",
      "fadeOut",
      "audioFadeIn",
      "audioFadeOut",
    ] as const)
      num(c[field], field, 0, duration);
    for (const field of ["videoFadeWindow", "audioFadeWindow"] as const)
      if (c[field] !== undefined) {
        const w = object(c[field], field);
        num(w.offset, `${field} kayması`, -86400 * 80, 86400 * 80);
        const full = num(
          w.duration,
          `${field} kaynak süresi`,
          Number.MIN_VALUE,
          86400 * 80,
        );
        num(w.fadeIn, `${field} Yumuşak giriş`, 0, full);
        num(w.fadeOut, `${field} Yumuşak çıkış`, 0, full);
      }
    const transform = object(c.transform, "Dönüşüm");
    for (const field of ["x", "y", "rotation"] as const)
      num(transform[field], field);
    num(transform.scale, "Ölçek", 0.000001, 10);
    num(transform.opacity, "Opaklık", 0, 1);
    bool(transform.flipX, "Yatay çevir");
    bool(transform.flipY, "Dikey çevir");
    if (c.crop !== undefined) {
      const crop = object(c.crop, "Kırpma");
      const x = num(crop.x, "Kırpma X", 0, 1),
        y = num(crop.y, "Kırpma Y", 0, 1),
        width = num(crop.width, "Kırpma genişliği", 0.01, 1),
        height = num(crop.height, "Kırpma yüksekliği", 0.01, 1);
      if (x + width > 1 + 1e-9 || y + height > 1 + 1e-9) fail("Kırpma medyayı aşıyor");
    }
    if (c.chromaKey !== undefined) {
      const chroma = object(c.chromaKey, "Kroma key");
      bool(chroma.enabled, "Kroma key anahtarı");
      str(chroma.color, "Kroma rengi", 9);
      if (!/^#[\da-f]{6}$/i.test(chroma.color as string)) fail("Kroma rengi");
      num(chroma.similarity, "Kroma benzerliği", 0.01, 1);
      num(chroma.blend, "Kroma yumuşaklığı", 0, 1);
    }
    if (c.mask !== undefined) {
      const mask = object(c.mask, "Şekil maskesi");
      choice(mask.shape, ["rectangle", "ellipse"], "Maske şekli");
      num(mask.width, "Maske genişliği", 0.01, 1);
      num(mask.height, "Maske yüksekliği", 0.01, 1);
      num(mask.feather, "Maske yumuşatma", 0, 0.5);
      bool(mask.invert, "Maskeyi ters çevir");
    }
    const adjustments = object(c.adjustments, "Renk ayarı");
    num(adjustments.brightness, "Parlaklık", -1, 1);
    num(adjustments.contrast, "Kontrast", 0, 3);
    num(adjustments.saturation, "Doygunluk", 0, 3);
    num(adjustments.temperature, "Renk sıcaklığı", -1, 1);
    num(adjustments.blur, "Bulanıklık", 0, 100);
    if (c.text !== undefined) {
      if (asset || track!.kind !== "text") fail("Metin klibi referansı");
      const text = object(c.text, "Metin stili");
      str(text.text, "Metin içeriği", 20000, true);
      num(text.fontSize, "Yazı boyutu", 1, 1000);
      str(text.fontFamily, "Yazı tipi", 256);
      color(text.color, "Metin rengi");
      color(text.background, "Metin arka planı");
      color(text.stroke, "Metin konturu");
      num(text.strokeWidth, "Kontur kalınlığı", 0, 100);
      choice(text.align, ["left", "center", "right"], "Metin hizalaması");
      bool(text.bold, "Kalın");
      if (text.lineHeight !== undefined)
        num(text.lineHeight, "Satır yüksekliği", 0.8, 3);
      if (text.padding !== undefined) num(text.padding, "İç boşluk", 0, 1.5);
      if (text.radius !== undefined) num(text.radius, "Yuvarlak köşe", 0, 2);
      if (text.shadow !== undefined) {
        const shadow = object(text.shadow, "Metin gölgesi");
        color(shadow.color, "Gölge rengi");
        num(shadow.blur, "Gölge bulanıklığı", 0, 200);
        num(shadow.offsetX, "Gölge kayması X", -200, 200);
        num(shadow.offsetY, "Gölge kayması Y", -200, 200);
      }
    } else {
      if (
        !asset ||
        track!.kind === "text" ||
        !(
          track!.kind === asset.kind ||
          (track!.kind === "video" && asset.kind === "image")
        )
      )
        fail("Klip kanalı ve medya türü");
      if (
        asset!.kind !== "image" &&
        sourceIn + duration * speed > (asset!.duration as number) + 0.08
      )
        fail("Klip kaynak medya süresini aşıyor");
    }
    const keyIds = new Set<string>();
    for (const rawKey of list(c.keyframes, "Anahtar kare listesi", 400)) {
      const k = object(rawKey, "Anahtar kare"),
        keyId = str(k.id, "Anahtar kare ID'si", 256);
      if (keyIds.has(keyId)) fail("Yinelenen anahtar kare ID'si");
      keyIds.add(keyId);
      if (k.easingWindow !== undefined) {
        const w = object(k.easingWindow, "Anahtar kare ara değer penceresi");
        num(w.start, "Ara değer penceresi başlangıcı", 0, 1);
        num(w.end, "Ara değer penceresi bitişi", 0, 1);
        if (
          (w.start as number) >= (w.end as number) ||
          k.easing === "linear"
        )
          fail("Anahtar kare ara değer penceresi");
      }
      if (k.bezier !== undefined) {
        const curve = object(k.bezier, "Anahtar kare Bézier eğrisi");
        num(curve.x1, "Bézier X1", 0, 1);
        num(curve.x2, "Bézier X2", 0, 1);
        num(curve.y1, "Bézier Y1", -1, 2);
        num(curve.y2, "Bézier Y2", -1, 2);
        if ((curve.x1 as number) > (curve.x2 as number))
          fail("Anahtar kare Bézier eğrisi");
      }
      num(k.time, "Anahtar kare zamanı", 0, duration);
      choice(
        k.property,
        ["x", "y", "scale", "rotation", "opacity", "volume"],
        "Anahtar kare özelliği",
      );
      choice(k.easing, KEYFRAME_EASINGS, "Anahtar kare ara değeri");
      const low =
        k.property === "scale"
          ? 0.000001
          : ["opacity", "volume"].includes(k.property as string)
            ? 0
            : -1e9;
      const high =
        k.property === "scale"
          ? 10
          : k.property === "opacity"
            ? 1
            : k.property === "volume"
              ? 4
              : 1e9;
      num(k.value, "Anahtar kare değeri", low, high);
    }
  }
  // Return a detached value so a caller cannot mutate an already validated project through its input.
  return structuredClone(input) as Project;
}
