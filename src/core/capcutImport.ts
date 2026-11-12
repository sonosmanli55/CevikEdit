import type { Clip, MediaAsset, Project, TrackKind } from "./types";
import {
  createProject,
  createTrack,
  createClip,
  id,
  validateProject,
} from "./model";

type ObjectValue = Record<string, unknown>;
export interface CapcutImportOptions {
  name?: string;
  mediaUrl?: (path: string) => string;
}
export interface CapcutImportResult {
  project: Project;
  warnings: string[];
}
const object = (v: unknown): ObjectValue =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as ObjectValue) : {};
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const string = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const number = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const seconds = (v: unknown) => number(v) / 1_000_000;
const bounded = (v: unknown, low: number, high: number, fallback: number) =>
  Math.max(low, Math.min(high, number(v, fallback)));
const identityUrl = (path: string) => path;

/** Experimental, lossy conversion of decoded tracks/materials JSON.
 * Desktop envelope decoding is handled before this platform-neutral converter. */
export function importCapcutDraft(
  input: unknown,
  options: CapcutImportOptions = {},
): CapcutImportResult {
  if (typeof input === "string") {
    const source = input.trim().replace(/^\uFEFF/, "");
    if (!source.startsWith("{"))
      throw new Error(
        "CapCut taslağı opak bir yüktür; masaüstü uygulamasında CapCut taslağı içe aktarma özelliğiyle açın.",
      );
    try {
      input = JSON.parse(source);
    } catch {
      throw new Error("CapCut taslağı JSON'u ayrıştırılamıyor");
    }
  }
  const draft = object(input);
  // Modern empty timelines omit tracks. Require the observed versioned draft
  // structure so arbitrary objects and malformed tracks still fail validation.
  const sparseEmpty =
    draft.tracks === undefined &&
    typeof draft.id === "string" && draft.id.length > 0 &&
    Number.isInteger(draft.version) && number(draft.version) > 0 &&
    typeof draft.new_version === "string" && draft.new_version.length > 0 &&
    (draft.duration === undefined || draft.duration === 0) &&
    Object.keys(object(draft.materials)).length === 0 &&
    number(object(draft.canvas_config).width) > 0 &&
    number(object(draft.canvas_config).height) > 0;
  const tracks = sparseEmpty ? [] : draft.tracks;
  if (
    !Array.isArray(tracks) ||
    !draft.materials ||
    typeof draft.materials !== "object" ||
    Array.isArray(draft.materials)
  )
    throw new Error("Desteklenen bir CapCut taslağı değil: tracks ve materials ya da geçerli boş zaman çizelgesi yapısı gerekir.");
  if (tracks.length > 1000) throw new Error("Taslaktaki kanal sayısı içe aktarma sınırını aşıyor");
  const warnings: string[] = [
    "Deneysel içe aktarma: yalnızca temel zaman çizelgesi dönüştürülür; bazı efektler ve metin stilleri kaybolabilir. Önizlemeyi ve dışa aktarmayı kontrol edin.",
  ];
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  const project = createProject(
    options.name ?? string(draft.name, "CapCut içe aktarma projesi"),
  );
  // The controlled native export uses black when no canvas background is set.
  project.background = "#000000";
  const canvas = object(draft.canvas_config);
  const hasCanvasDimensions =
    number(canvas.width) > 0 && number(canvas.height) > 0;
  if (hasCanvasDimensions) {
    project.width = Math.round(bounded(canvas.width, 16, 7680, 1920));
    project.height = Math.round(bounded(canvas.height, 16, 7680, 1080));
  }
  const fps = number(draft.fps, 30);
  project.fps = [24, 25, 30, 50, 60].includes(fps) ? fps : 30;
  if (fps !== project.fps) warn(`Kare hızı ${fps} desteklenmiyor; 30 fps olarak ayarlandı.`);
  project.tracks = [];
  project.assets = [];
  project.clips = [];
  const materials = object(draft.materials);
  const materialById = new Map<
    string,
    { category: string; data: ObjectValue }
  >();
  let materialCount = 0;
  for (const [category, items] of Object.entries(materials))
    for (const item of array(items)) {
      if (++materialCount > 100000) throw new Error("Taslaktaki medya sayısı içe aktarma sınırını aşıyor");
      const data = object(item),
        materialId = string(data.id);
      if (materialId) materialById.set(materialId, { category, data });
    }
  const assets = new Map<string, MediaAsset>();
  const makeAsset = (
    materialId: string,
    category: string,
    data: ObjectValue,
  ): MediaAsset | undefined => {
    const known = assets.get(materialId);
    if (known) return known;
    const type = string(data.type);
    const kind =
      category === "audios"
        ? "audio"
        : ["photo", "image"].includes(type)
          ? "image"
          : type === "video" || type === ""
            ? "video"
            : undefined;
    if (!kind) {
      warn(`Medya türü ${type || category} desteklenmiyor; ilgili klipler atlandı.`);
      return undefined;
    }
    const path = string(data.path);
    if (
      path &&
      (!/^(\/|[a-zA-Z]:[\\/])/.test(path) ||
        path.includes("\0") ||
        path.length > 32768)
    ) {
      warn("Medya yolu desteklenen bir yerel mutlak yol değil; ilgili klipler atlandı.");
      return undefined;
    }
    if (!path) {
      warn(
        `Medya ${string(data.material_name, materialId)} için yerel yol yok; ilgili klipler atlandı.`,
      );
      return undefined;
    }
    const asset: MediaAsset = {
      id: id(),
      kind,
      path,
      url: (options.mediaUrl ?? identityUrl)(path),
      name: string(
        data.material_name,
        string(data.name, path.split(/[\\/]/).pop() ?? "Medya"),
      ),
      duration: bounded(seconds(data.duration), 0, 86400 * 8, 0),
      width: bounded(data.width, 0, 100000, 0),
      height: bounded(data.height, 0, 100000, 0),
      fps: bounded(data.fps, 0, 1000, project.fps),
      hasAudio: kind === "audio" || kind === "video",
      missing: false,
    };
    assets.set(materialId, asset);
    project.assets.push(asset);
    return asset;
  };
  let originalCanvas: { width: number; height: number } | undefined;
  const positions = new Map<Clip, { x: number; y: number }>();
  const inferredDurations = new Set<string>();
  const trackLayers = new Map<string, number>();
  const unmappedSettings = new Set<string>();
  const settingNames: Record<string, string> = {
    canvases: "Tuval arka planı", placeholder_infos: "Yer tutucu ayarı",
    sound_channel_mappings: "Kanal ayarı", material_colors: "Medya rengi",
    vocal_separations: "Vokal ayırma", material_animations: "Klip animasyonu",
    transitions: "Geçiş", video_effects: "Video efekti", audio_effects: "Ses efekti",
    audio_fades: "Ses yumuşak giriş/çıkışı", masks: "Maske",
  };
  let totalSegments = 0;
  for (const rawTrack of tracks) {
    const sourceTrack = object(rawTrack),
      kind = string(sourceTrack.type);
    if (!["video", "audio", "text"].includes(kind)) {
      warn(`Kanal türü ${kind || "Bilinmiyor"} desteklenmiyor; atlandı.`);
      continue;
    }
    const track = createTrack(
      kind as TrackKind,
      string(
        sourceTrack.name,
        { video: "Video", audio: "Ses", text: "Metin" }[kind],
      ),
    );
    project.tracks.push(track);
    const layers = array(sourceTrack.segments)
      .map((item) => object(item).track_render_index)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const uniqueLayers = [...new Set(layers)];
    trackLayers.set(track.id, uniqueLayers[0] ?? project.tracks.length - 1);
    if (uniqueLayers.length > 1)
      warn("Aynı kanaldaki kliplerin katman sırası farklı; ilk klibin kanal düzeyine göre içe aktarıldı. Örtüşme ilişkisini kontrol edin.");
    for (const rawSegment of array(sourceTrack.segments)) {
      if (++totalSegments > 10000) throw new Error("Taslaktaki klip sayısı içe aktarma sınırını aşıyor");
      const segment = object(rawSegment),
        materialId = string(segment.material_id),
        material = materialById.get(materialId);
      if (!material) {
        warn(`Klibin başvurduğu medya ${materialId || "Bilinmiyor"} bulunamadı; atlandı.`);
        continue;
      }
      const target = object(segment.target_timerange),
        source = object(segment.source_timerange);
      const start = seconds(target.start),
        duration = seconds(target.duration),
        sourceIn = seconds(source.start);
      if (
        start < 0 ||
        duration <= 0 ||
        start + duration > 86400 ||
        sourceIn < 0 ||
        sourceIn > 86400 * 8
      ) {
        warn("Geçersiz zaman aralığına sahip klipler atlandı.");
        continue;
      }
      let asset: MediaAsset | undefined;
      if (kind === "text") {
        if (
          material.category !== "texts" ||
          !["text", "subtitle", ""].includes(string(material.data.type))
        ) {
          warn("Temel olmayan metin medyası atlandı.");
          continue;
        }
      } else {
        if (material.category !== (kind === "audio" ? "audios" : "videos")) {
          warn("Medya türü kanalla uyuşmuyor; ilgili klipler atlandı.");
          continue;
        }
        asset = makeAsset(materialId, material.category, material.data);
        if (!asset) continue;
        if (asset.duration === 0 && asset.kind !== "image")
          inferredDurations.add(asset.id);
      }
      const clip = createClip(asset, track.id, start, project.fps);
      clip.start = start;
      clip.duration = duration;
      clip.sourceIn = sourceIn;
      const refs = array(segment.extra_material_refs).map((v) => string(v));
      const speedMaterial = refs
        .map((ref) => materialById.get(ref))
        .find((m) => m?.category === "speeds");
      const speed = number(
        speedMaterial?.data.speed,
        asset?.kind === "image" || !asset
          ? 1
          : seconds(source.duration) / duration || 1,
      );
      if (speed < 0.1 || speed > 8) {
        warn(`Klip hızı ${speed} 0.1–8× aralığının dışında; atlandı.`);
        continue;
      }
      if (asset && asset.kind !== "image") {
        const extent = sourceIn + duration * speed;
        if (extent > 86400 * 8) {
          warn("Kaynak medya zaman aralığı desteklenen aralığın dışında; ilgili klipler atlandı.");
          continue;
        }
        if (inferredDurations.has(asset.id)) {
          asset.duration = Math.max(asset.duration, extent);
          warn(
            "Bazı medyalarda süre eksik; temel kliplerden tahmin edildi. Gerçek süreyi doğrulamak için medyayı yeniden bağlayın.",
          );
        } else if (extent > asset.duration + 0.08) {
          warn("Klip, kaydedilen kaynak medya süresini aşıyor; atlandı.");
          continue;
        }
        if (
          seconds(source.duration) > 0 &&
          Math.abs(seconds(source.duration) - duration * speed) > 0.08
        )
          warn("Kaynak/hedef zaman aralığı ile temel hız arasında fark var; eğri hız değişimleri korunmamış olabilir.");
      }
      clip.speed = speed;
      clip.volume = bounded(segment.volume, 0, 4, 1);
      if (clip.volume !== number(segment.volume, 1))
        warn("Klip ses düzeyi desteklenen aralığın dışında; 0–4 katına sınırlandı. Sesi kontrol edin.");
      const transform = object(segment.clip),
        position = object(transform.transform),
        scale = object(transform.scale),
        flip = object(transform.flip);
      clip.transform.scale = bounded(scale.x, 0.05, 10, 1);
      clip.transform.rotation = bounded(transform.rotation, -1e9, 1e9, 0);
      clip.transform.opacity = bounded(transform.alpha, 0, 1, 1);
      if (clip.transform.scale !== number(scale.x, 1))
        warn("Klip ölçeği desteklenen aralığın dışında; 0,05–10 katına sınırlandı.");
      if (clip.transform.opacity !== number(transform.alpha, 1))
        warn("Klip opaklığı desteklenen aralığın dışında; 0–1 aralığına sınırlandı.");
      clip.transform.flipX = flip.horizontal === true;
      clip.transform.flipY = flip.vertical === true;
      if (number(scale.y, number(scale.x, 1)) !== number(scale.x, 1))
        warn("Orantısız ölçek, tek tip ölçek olarak içe aktarıldı; görüntü değişebilir.");
      if (kind === "text") {
        const text = parseText(material.data.content);
        if (text === undefined || text.length > 20000) {
          warn("Metin içeriği ayrıştırılamayan klipler atlandı.");
          continue;
        }
        clip.text!.text = text;
        clip.name = text.slice(0, 30) || "Metin";
        warn(
          "Metin içeriği korundu; CapCut yazı tipi, süslü yazı, stil ve dizgi eşlenmedi, CevikEdit varsayılan stili kullanıldı.",
        );
      }
      if (segment.reverse === true) warn("Ters oynatma desteklenmiyor; bu klip normal yönde oynatılır.");
      if (
        array(segment.common_keyframes).length ||
        Object.keys(object(segment.keyframes)).length
      )
        warn("CapCut anahtar kareleri eşlenmedi; klibin statik parametreleri korundu.");
      for (const ref of refs) {
        const extra = materialById.get(ref);
        if (extra && extra.category !== "speeds")
          unmappedSettings.add(settingNames[extra.category] ?? "Diğer ek efektler");
        if (
          extra?.category === "speeds" &&
          array(extra.data.curve_speed).length
        )
          warn("Eğri hız değişimi desteklenmiyor; yalnızca temel hız korundu.");
      }
      if (Object.keys(object(material.data.crop)).length)
        warn("CapCut kırpma bilgisi eşlenmedi; medyanın tam görüntüsü kullanıldı.");
      // Only accepted visual segments may establish an unspecified canvas.
      // Library-only materials and rejected clips must not affect its size.
      if (!hasCanvasDimensions && !originalCanvas && kind === "video" && asset) {
        const width = number(material.data.width),
          height = number(material.data.height);
        if (
          Number.isInteger(width) &&
          width > 0 &&
          width <= 100000 &&
          Number.isInteger(height) &&
          height > 0 &&
          height <= 100000
        )
          originalCanvas = { width, height };
      }
      positions.set(clip, { x: number(position.x), y: number(position.y) });
      project.clips.push(clip);
    }
  }
  if (!hasCanvasDimensions) {
    if (originalCanvas) {
      project.width = Math.round(bounded(originalCanvas.width, 16, 7680, 1920));
      project.height = Math.round(bounded(originalCanvas.height, 16, 7680, 1080));
      warn(
        `Taslakta geçerli tuval boyutu yok; ilk içe aktarılabilir görsel klipten ${project.width} × ${project.height} olarak tahmin edildi. Tuval oranını doğrulayın.`,
      );
    } else {
      warn(
        "Taslakta geçerli tuval boyutu ve tahmin için görsel klip yok; varsayılan 1920 × 1080 kullanıldı. Tuval oranını kontrol edin.",
      );
    }
  }
  for (const [clip, position] of positions) {
    clip.transform.x = bounded((position.x * project.width) / 2, -1e9, 1e9, 0);
    clip.transform.y = bounded((-position.y * project.height) / 2, -1e9, 1e9, 0);
  }
  // Native higher track_render_index is drawn above lower values. CevikEdit's
  // first track is the top layer; source array order is the fallback.
  project.tracks.sort((a, b) => trackLayers.get(b.id)! - trackLayers.get(a.id)!);
  if (!project.tracks.length) project.tracks = [createTrack("video")];
  if (!project.clips.length) warn("İçe aktarılabilir temel klip yok.");
  if (unmappedSettings.size)
    warn(`Dönüştürülmeyen ek ayarlar: ${[...unmappedSettings].join(", ")}. İlgili efektleri doğrulayın.`);
  const bg = object(canvas.background);
  if (Object.keys(bg).length)
    warn("CapCut tuval arka planı eşlenmedi; siyah arka plan kullanıldı.");
  return { project: validateProject(project), warnings };
}

function parseText(content: unknown): string | undefined {
  if (typeof content !== "string") return undefined;
  if (!content.trim().startsWith("{")) return content;
  try {
    const value = object(JSON.parse(content));
    return typeof value.text === "string" ? value.text : undefined;
  } catch {
    return undefined;
  }
}
