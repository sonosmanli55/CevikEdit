/** Original, offline editing recipes. MIT; no third-party templates or media. */
import type { Clip, Keyframe, Project, TextStyle } from "./types";
import {
  createClip,
  createTrack,
  evaluateKeyframes,
  id,
  keyframeEasingWindow,
  snapToFrame,
} from "./model";

export type TextPresetCategory =
  | "Başlık"
  | "Alt bant"
  | "Altyazı"
  | "İşaret"
  | "Hareketli"
  | "Sosyal medya";
export type TextMotion = "rise" | "pop" | "fade" | "slide" | "settle";
export interface TextPreset {
  id: string;
  name: string;
  category: TextPresetCategory;
  style: Partial<TextStyle> & { text: string };
  y?: number;
  motion?: TextMotion;
  /** Latin search words; never rendered, so they need no translation. */
  keywords?: string[];
}
/** Tab order used by the template browser. */
export const TEXT_PRESET_CATEGORIES: readonly TextPresetCategory[] = [
  "Başlık",
  "Alt bant",
  "Altyazı",
  "İşaret",
  "Hareketli",
  "Sosyal medya",
];
export const TEXT_PRESETS: readonly TextPreset[] = [
  {
    id: "classic",
    name: "Klasik başlık",
    category: "Başlık",
    keywords: ["title", "baslik", "simple", "sade"],
    style: { text: "İlham, görüntüye dönüşsün", fontSize: 80 },
  },
  {
    id: "chapter",
    name: "Bölüm başlığı",
    category: "Başlık",
    keywords: ["chapter", "bolum"],
    style: {
      text: "CHAPTER 01\nHikâyem",
      fontSize: 66,
      color: "#ffd69a",
      strokeWidth: 0,
      lineHeight: 1.18,
    },
  },
  {
    id: "cinema",
    name: "Film adı",
    category: "Başlık",
    keywords: ["cinema", "film", "sinema"],
    style: {
      text: "YOLDA\nA JOURNEY",
      fontSize: 90,
      color: "#fff0d5",
      strokeWidth: 0,
      lineHeight: 1.12,
    },
  },
  {
    id: "editorial",
    name: "Minimal künye",
    category: "Başlık",
    keywords: ["editorial", "magazine", "dergi"],
    style: {
      text: "HAYAT GÖZLEMİ\nVOL. 01",
      fontSize: 70,
      bold: false,
      strokeWidth: 0,
      lineHeight: 1.24,
    },
  },
  {
    id: "subtitle",
    name: "Altyazı şeridi",
    category: "Altyazı",
    keywords: ["subtitle", "altyazi", "bar"],
    y: 0.36,
    style: {
      text: "Her kare kaydedilmeye değer",
      fontSize: 52,
      bold: false,
      background: "#11151c",
      strokeWidth: 0,
      padding: 0.42,
      radius: 0.14,
    },
  },
  {
    id: "outline",
    name: "Net kontur",
    category: "Altyazı",
    keywords: ["outline", "kontur", "stroke"],
    y: 0.36,
    style: { text: "Sıradan bir güne biraz ışık kat", fontSize: 54, strokeWidth: 4 },
  },
  {
    id: "warm-caption",
    name: "Sıcak beyaz anlatı",
    category: "Altyazı",
    keywords: ["caption", "warm", "sicak"],
    y: 0.32,
    style: {
      text: "Yavaş yürü, yol boyunca manzara var",
      fontSize: 48,
      bold: false,
      color: "#fff0d5",
      background: "#493b32",
      strokeWidth: 0,
      padding: 0.38,
      radius: 0.22,
    },
  },
  {
    id: "quote",
    name: "Röportaj alıntısı",
    category: "Altyazı",
    keywords: ["quote", "alinti", "interview"],
    style: {
      text: "\"Tutkuyu her güne yaz.\"",
      fontSize: 64,
      color: "#a0f1df",
      strokeWidth: 0,
    },
  },
  {
    id: "mint",
    name: "Nane işaret",
    category: "İşaret",
    keywords: ["wordmark", "logo", "marka"],
    style: { text: "CEVIKEDIT", fontSize: 104, color: "#62ead1", strokeWidth: 0 },
  },
  {
    id: "comic",
    name: "Çizgi roman vurgusu",
    category: "İşaret",
    keywords: ["comic", "pop", "cizgi"],
    style: {
      text: "İşte geldi!",
      fontSize: 100,
      color: "#ffd176",
      stroke: "#382637",
      strokeWidth: 7,
    },
  },
  {
    id: "news",
    name: "Haber bülteni",
    category: "İşaret",
    keywords: ["news", "haber", "breaking"],
    y: 0.29,
    style: {
      text: "Olay yerinden · son gelişmeler",
      fontSize: 60,
      background: "#b63f43",
      strokeWidth: 0,
      padding: 0.3,
      radius: 0.05,
    },
  },
  {
    id: "label",
    name: "Kişi isim etiketi",
    category: "İşaret",
    keywords: ["name", "isim", "tag"],
    y: 0.3,
    style: {
      text: "Orman · içerik üreticisi",
      fontSize: 52,
      color: "#15252c",
      background: "#62ead1",
      strokeWidth: 0,
      padding: 0.36,
      radius: 0.5,
    },
  },
  {
    id: "rise",
    name: "Hafifçe yüksel",
    category: "Hareketli",
    keywords: ["rise", "yukari", "intro"],
    motion: "rise",
    style: { text: "Yeni hikâye şimdi başlıyor", fontSize: 74, strokeWidth: 0 },
  },
  {
    id: "pop",
    name: "Zıplayarak giriş",
    category: "Hareketli",
    keywords: ["pop", "bounce", "zipla"],
    motion: "pop",
    style: { text: "MERHABA!", fontSize: 108, color: "#ffd176", strokeWidth: 4 },
  },
  {
    id: "fade",
    name: "Yumuşak ışıkla açılış",
    category: "Hareketli",
    keywords: ["fade", "soft", "yumusak"],
    motion: "fade",
    style: {
      text: "Güzel bir anla karşılaş",
      fontSize: 72,
      bold: false,
      color: "#fff0d5",
      strokeWidth: 0,
    },
  },
  {
    id: "end",
    name: "Nazik kapanış",
    category: "Hareketli",
    keywords: ["end", "outro", "bitis"],
    motion: "fade",
    style: {
      text: "İZLEDİĞİNİZ İÇİN TEŞEKKÜRLER\nTekrar görüşmek üzere",
      fontSize: 76,
      color: "#a0f1df",
      strokeWidth: 0,
      lineHeight: 1.28,
    },
  },
  {
    id: "lower-third",
    name: "İsim alt bandı",
    category: "Alt bant",
    keywords: ["lower third", "isim", "unvan", "name"],
    y: 0.28,
    style: {
      text: "Elif Demir\nYönetmen · İstanbul",
      fontSize: 54,
      color: "#ffffff",
      align: "left",
      background: "#0f1720",
      strokeWidth: 0,
      lineHeight: 1.2,
      padding: 0.44,
      radius: 0.12,
    },
  },
  {
    id: "news-band",
    name: "Haber bandı",
    category: "Alt bant",
    keywords: ["news", "haber", "band", "bant"],
    y: 0.38,
    motion: "slide",
    style: {
      text: "SON DAKİKA · YENİ GELİŞME",
      fontSize: 46,
      color: "#ffffff",
      background: "#c0392b",
      strokeWidth: 0,
      padding: 0.34,
      radius: 0.06,
    },
  },
  {
    id: "quote-band",
    name: "Alıntı bandı",
    category: "Alt bant",
    keywords: ["quote", "alinti", "interview"],
    y: 0.3,
    style: {
      text: "\"Işık gölgeyi izler.\"\n— Anonim",
      fontSize: 48,
      bold: false,
      align: "left",
      color: "#f4f1ea",
      background: "#1b1f24",
      strokeWidth: 0,
      lineHeight: 1.42,
      padding: 0.42,
      radius: 0.1,
    },
  },
  {
    id: "stat-card",
    name: "Veri kartı",
    category: "Sosyal medya",
    keywords: ["stat", "number", "sayi", "data"],
    y: 0.3,
    style: {
      text: "12.4B\ngörüntüleme",
      fontSize: 62,
      color: "#0f1418",
      background: "#62ead1",
      strokeWidth: 0,
      lineHeight: 1.06,
      padding: 0.4,
      radius: 0.2,
    },
  },
  {
    id: "neon",
    name: "Neon etiket",
    category: "İşaret",
    keywords: ["neon", "glow", "parlak"],
    style: {
      text: "YENİ",
      fontSize: 88,
      color: "#d9fff8",
      strokeWidth: 0,
      shadow: { color: "#62ead1", blur: 28, offsetX: 0, offsetY: 0 },
    },
  },
  {
    id: "gold",
    name: "Altın rozet",
    category: "İşaret",
    keywords: ["gold", "badge", "rozet", "altin"],
    y: 0.3,
    style: {
      text: "ÖDÜLLÜ",
      fontSize: 56,
      color: "#2a1a06",
      background: "#f2c14e",
      strokeWidth: 0,
      padding: 0.36,
      radius: 0.5,
    },
  },
  {
    id: "hook",
    name: "Kısa video açılışı",
    category: "Sosyal medya",
    keywords: ["hook", "short", "reels", "tiktok", "kanca"],
    motion: "settle",
    y: -0.22,
    style: {
      text: "BUNU BİLİYOR MUYDUNUZ?",
      fontSize: 60,
      lineHeight: 1.16,
      color: "#ffffff",
      strokeWidth: 0,
      shadow: { color: "#000000", blur: 16, offsetX: 0, offsetY: 4 },
    },
  },
  {
    id: "follow",
    name: "Takip çağrısı",
    category: "Sosyal medya",
    keywords: ["follow", "cta", "takip", "abone"],
    motion: "fade",
    y: 0.36,
    style: {
      text: "Takip et → @cevikedit",
      fontSize: 42,
      color: "#12161a",
      background: "#ffffff",
      strokeWidth: 0,
      padding: 0.38,
      radius: 0.5,
    },
  },
  {
    id: "countdown",
    name: "Geri sayım",
    category: "Hareketli",
    keywords: ["countdown", "number", "geri sayim"],
    motion: "pop",
    style: {
      text: "03",
      fontSize: 160,
      color: "#ffffff",
      strokeWidth: 0,
      shadow: { color: "#000000", blur: 24, offsetX: 0, offsetY: 6 },
    },
  },
];
type VisualProperty = Exclude<Keyframe["property"], "volume">;
function keys(
  property: VisualProperty,
  points: [number, number][],
): Keyframe[] {
  return points.map(([time, value]) => ({
    id: id(),
    property,
    time,
    value,
    easing: "easeInOut",
  }));
}
function replaceKeys(clip: Clip, additions: Keyframe[]): Keyframe[] {
  const properties = new Set(additions.map((k) => k.property));
  return [
    ...clip.keyframes.filter((k) => !properties.has(k.property)),
    ...additions,
  ];
}
export function makeTextPreset(
  preset: TextPreset,
  trackId: string,
  start: number,
  project: Pick<Project, "width" | "height" | "fps">,
): Clip {
  const clip = createClip(undefined, trackId, start, project.fps);
  const scale = Math.min(project.width / 1920, project.height / 1080);
  clip.text = {
    ...clip.text!,
    ...preset.style,
    fontSize: Math.min(
      1000,
      Math.max(8, (preset.style.fontSize ?? 72) * scale),
    ),
    strokeWidth: (preset.style.strokeWidth ?? 2) * scale,
  };
  if (preset.style.shadow)
    clip.text.shadow = {
      color: preset.style.shadow.color,
      blur: preset.style.shadow.blur * scale,
      offsetX: preset.style.shadow.offsetX * scale,
      offsetY: preset.style.shadow.offsetY * scale,
    };
  clip.name = preset.style.text.replaceAll("\n", " · ");
  clip.transform.y = (preset.y ?? 0) * project.height;
  if (preset.motion) {
    clip.fadeIn = 0.5;
    clip.fadeOut = 0.5;
  }
  if (preset.motion === "rise")
    clip.keyframes = keys("y", [
      [0, clip.transform.y + project.height * 0.12],
      [0.65, clip.transform.y],
    ]);
  if (preset.motion === "pop")
    clip.keyframes = keys("scale", [
      [0, 0.45],
      [0.4, 1.1],
      [0.65, 1],
    ]);
  if (preset.motion === "slide")
    clip.keyframes = keys("x", [
      [0, project.width * 0.4],
      [0.55, 0],
    ]);
  if (preset.motion === "settle")
    clip.keyframes = keys("scale", [
      [0, 1.22],
      [0.6, 1],
    ]);
  return clip;
}
export function addTextPreset(
  project: Project,
  preset: TextPreset,
  start: number,
): { project: Project; clip: Clip } {
  const track =
    project.tracks.find((t) => t.kind === "text" && !t.locked) ??
    createTrack("text");
  const clip = makeTextPreset(preset, track.id, start, project);
  return {
    project: {
      ...project,
      tracks: project.tracks.includes(track)
        ? project.tracks
        : [track, ...project.tracks],
      clips: [...project.clips, clip],
    },
    clip,
  };
}
export const MOTION_PRESETS = [
  { id: "push", name: "Yavaş yaklaşma", description: "Geçerli ölçekten yavaşça yaklaşarak özneyi vurgular" },
  { id: "pull", name: "Kamera uzaklaşması", description: "Yakın plandan geçerli görüntüye geri çekilir" },
  { id: "pan-left", name: "Sola kayma", description: "Hafif yatay kayma; fotoğraf ve manzaralar için" },
  {
    id: "pan-right",
    name: "Sağa kayma",
    description: "Hafif yatay kayma; fotoğraf ve manzaralar için",
  },
  { id: "float", name: "Hafif süzülme", description: "Yukarı aşağı yavaşça salınır" },
  { id: "pulse", name: "Nefes alan ölçek", description: "İki kez yumuşak büyütme ve geri dönüş" },
  { id: "sway", name: "Hafif sallanma", description: "Küçük açıyla sağa sola salınır" },
  { id: "shake", name: "Ritmik titreşim", description: "Kısa yatay titreşimden sonra eski konuma döner" },
] as const;
export type MotionId = (typeof MOTION_PRESETS)[number]["id"];
export function motionPatch(
  clip: Clip,
  motion: MotionId,
  project: Pick<Project, "width" | "height">,
): Partial<Clip> {
  const d = clip.duration,
    t = clip.transform;
  const scale = (v: number) => Math.max(0.01, Math.min(10, v));
  let frames: Keyframe[];
  switch (motion) {
    case "push":
      frames = keys("scale", [
        [0, t.scale],
        [d, scale(t.scale * 1.18)],
      ]);
      break;
    case "pull":
      frames = keys("scale", [
        [0, scale(t.scale * 1.18)],
        [d, t.scale],
      ]);
      break;
    case "pan-left":
    case "pan-right": {
      const delta = project.width * 0.06 * (motion === "pan-left" ? -1 : 1);
      frames = keys("x", [
        [0, t.x - delta],
        [d, t.x + delta],
      ]);
      break;
    }
    case "float":
      frames = keys("y", [
        [0, t.y],
        [d * 0.25, t.y - project.height * 0.025],
        [d * 0.75, t.y + project.height * 0.025],
        [d, t.y],
      ]);
      break;
    case "pulse":
      frames = keys("scale", [
        [0, t.scale],
        [d * 0.25, scale(t.scale * 1.08)],
        [d * 0.5, t.scale],
        [d * 0.75, scale(t.scale * 1.08)],
        [d, t.scale],
      ]);
      break;
    case "sway":
      frames = keys("rotation", [
        [0, t.rotation],
        [d * 0.25, t.rotation - 3],
        [d * 0.75, t.rotation + 3],
        [d, t.rotation],
      ]);
      break;
    case "shake":
      frames = keys("x", [
        [0, t.x],
        ...Array.from(
          { length: 6 },
          (_, i) =>
            [
              (d * (i + 1)) / 12,
              t.x + project.width * 0.014 * (i % 2 ? 1 : -1),
            ] as [number, number],
        ),
        [d * 0.65, t.x],
        [d, t.x],
      ]);
      break;
  }
  return { keyframes: replaceKeys(clip, frames) };
}
export const TRANSITION_PRESETS = [
  {
    id: "dissolve",
    name: "Çapraz geçiş",
    description: "İki görüntü yumuşakça birleşir",
    category: "Temel",
  },
  {
    id: "dip",
    name: "Arka plandan geçiş",
    description: "Tuval arka planına solar, sonra sonraki bölüme geçer",
    category: "Temel",
  },
  {
    id: "slide-left",
    name: "Soldan kayarak giriş",
    description: "Sonraki klip sağdan kayar",
    category: "Kamera hareketi",
  },
  {
    id: "slide-right",
    name: "Sağdan kayarak giriş",
    description: "Sonraki klip soldan kayar",
    category: "Kamera hareketi",
  },
  {
    id: "slide-up",
    name: "Yukarıdan kayarak giriş",
    description: "Sonraki klip aşağıdan kayar",
    category: "Kamera hareketi",
  },
  {
    id: "slide-down",
    name: "Aşağıdan kayarak giriş",
    description: "Sonraki klip yukarıdan kayar",
    category: "Kamera hareketi",
  },
  {
    id: "zoom",
    name: "Ölçek geçişi",
    description: "Sonraki klip küçükten büyüyerek belirir",
    category: "Dinamik",
  },
  {
    id: "spin",
    name: "Döndürme geçişi",
    description: "Sonraki klip hafifçe dönerek büyür ve belirir",
    category: "Dinamik",
  },
] as const;
export type TransitionId = (typeof TRANSITION_PRESETS)[number]["id"];
/** Make the leading edge meet the existing curve at duration; preserve its later keys. */
function incomingKeys(
  clip: Clip,
  property: VisualProperty,
  value: number,
  duration: number,
): Keyframe[] {
  const target = evaluateKeyframes(clip, duration).transform[property];
  const sorted = clip.keyframes
    .filter((k) => k.property === property)
    .sort((a, b) => a.time - b.time);
  const curve = sorted.filter(
    (k, i) => i === sorted.length - 1 || sorted[i + 1].time !== k.time,
  );
  const rightIndex = curve.findIndex((k) => k.time > duration);
  const right = curve[rightIndex],
    left = curve[rightIndex - 1];
  // Restrict the first surviving smoothstep segment to its remaining interval.
  // Merely keeping its destination key would restart easing and change later motion.
  const remaining = clip.keyframes
    .filter((k) => k.property !== property || k.time > duration)
    .map((k) => {
      if (
        k.id !== right?.id ||
        !left ||
        left.time >= duration ||
        right.easing === "linear"
      )
        return k;
      const window = keyframeEasingWindow(right);
      return {
        ...k,
        easingWindow: {
          start:
            window.start +
            ((window.end - window.start) * (duration - left.time)) /
              (right.time - left.time),
          end: window.end,
        },
      };
    });
  return [
    ...remaining,
    ...keys(property, [
      [0, value],
      [duration, target],
    ]),
  ];
}
export function applyTransition(
  project: Project,
  clipId: string,
  transition: TransitionId,
  seconds: number,
): { project: Project; duration: number } {
  if (
    !TRANSITION_PRESETS.some((p) => p.id === transition) ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  )
    throw new Error("Geçiş parametreleri geçersiz");
  const front = project.clips.find((c) => c.id === clipId),
    track = project.tracks.find((t) => t.id === front?.trackId);
  if (!front || !track || front.text || track.kind === "audio")
    throw new Error("Bir görüntü klibi seçin");
  if (track.locked) throw new Error("Önce kanalın kilidini açın");
  const siblings = project.clips
    .filter((c) => c.trackId === track.id)
    .sort((a, b) => a.start - b.start);
  const index = siblings.findIndex((c) => c.id === front.id),
    next = siblings[index + 1];
  const end = front.start + front.duration,
    tolerance = 1 / project.fps + 0.00001;
  if (
    !next ||
    next.text ||
    next.start > end + tolerance ||
    next.start < end - front.duration / 2 - 0.00001
  )
    throw new Error("Aynı kanalda bitişik iki görüntü klibi gerekir; önce boşluğu veya aşırı örtüşmeyi giderin");
  const limit = Math.min(5, front.duration / 2, next.duration / 2);
  const duration =
    Math.floor(Math.min(seconds, limit) * project.fps + 1e-8) / project.fps;
  if (duration < 1 / project.fps) throw new Error("Klip geçiş eklemek için çok kısa");
  const newStart = snapToFrame(
    end - (transition === "dip" ? 0 : duration),
    project.fps,
  );
  if (
    siblings[index + 2] &&
    newStart + next.duration > siblings[index + 2].start + 0.00001
  )
    throw new Error("Geçiş sonraki kliple örtüşür; önce sonraki klip için yer bırakın");
  let incoming: Clip = {
    ...next,
    start: newStart,
    fadeIn: duration,
    audioFadeIn: duration,
    videoFadeWindow: undefined,
    audioFadeWindow: undefined,
  };
  const at = evaluateKeyframes(next, duration).transform;
  if (transition.startsWith("slide")) {
    const horizontal =
        transition === "slide-left" || transition === "slide-right",
      property = horizontal ? "x" : "y";
    const sign =
      transition === "slide-left" || transition === "slide-up" ? 1 : -1;
    incoming.keyframes = incomingKeys(
      incoming,
      property,
      at[property] + (horizontal ? project.width : project.height) * sign,
      duration,
    );
    incoming.fadeIn = 0;
  }
  if (transition === "zoom" || transition === "spin")
    incoming.keyframes = incomingKeys(
      incoming,
      "scale",
      Math.max(0.01, at.scale * 0.3),
      duration,
    );
  if (transition === "spin")
    incoming.keyframes = incomingKeys(
      incoming,
      "rotation",
      at.rotation - 35,
      duration,
    );
  const outgoing: Clip = {
    ...front,
    fadeOut: transition === "dip" ? duration : 0,
    videoFadeWindow: front.videoFadeWindow
      ? {
          ...front.videoFadeWindow,
          fadeOut: transition === "dip" ? duration : 0,
        }
      : undefined,
    audioFadeOut: duration,
    audioFadeWindow: undefined,
  };
  // A trimmed envelope's original end need not equal this clip's end: materialize the outgoing dip.
  if (transition === "dip") outgoing.videoFadeWindow = undefined;
  return {
    duration,
    project: {
      ...project,
      clips: project.clips.map((c) =>
        c.id === front.id ? outgoing : c.id === next.id ? incoming : c,
      ),
    },
  };
}
