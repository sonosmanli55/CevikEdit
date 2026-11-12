import type { Clip, Project, Track } from "./types";
import { changeClipSpeed, clone, createClip, createTrack, projectDuration, snapToFrame, splitClip, trimClip, validateProject } from "./model";

const fields: Record<string, string[]> = {
  addText: ["text", "start", "duration", "fontSize", "color", "x", "y"],
  addAsset: ["assetId", "start", "trackId", "duration"],
  trimClip: ["clipId", "edge", "time"], splitClip: ["clipId", "time"],
  deleteClip: ["clipId"], moveClip: ["clipId", "start", "trackId"],
  setSpeed: ["clipId", "speed"], setVolume: ["clipId", "volume", "muted"],
  setText: ["clipId", "text"], setTransform: ["clipId", "x", "y", "scale", "rotation", "opacity"],
  setFades: ["clipId", "fadeIn", "fadeOut", "audioFadeIn", "audioFadeOut"],
  setProject: ["name", "width", "height", "fps", "background"],
};
const labels: Record<string, string> = {
  addText: "Metin ekle", addAsset: "Medya klibi ekle", trimClip: "Klibi kırp", splitClip: "Klibi böl",
  deleteClip: "Klibi sil", moveClip: "Klibi taşı", setSpeed: "Hızı ayarla", setVolume: "Ses düzeyini ayarla",
  setText: "Metni değiştir", setTransform: "Görüntüyü ayarla", setFades: "Yumuşak giriş/çıkışı ayarla", setProject: "Projeyi ayarla",
};
function number(value: unknown, name: string, min = 0, max = 86400): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`${name} desteklenen aralığın dışında`);
  return value;
}
function text(value: unknown, name: string, max = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0"))
    throw new Error(`${name} geçersiz`);
  return value;
}
function color(value: unknown): string {
  const result = text(value, "Renk", 9);
  if (!/^#[a-f\d]{6}([a-f\d]{2})?$/i.test(result)) throw new Error("Renk onaltılık biçimde olmalıdır");
  return result;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Düzenleme önerisinin biçimi geçersiz");
  return value as Record<string, unknown>;
}
export interface AssistantEditPreview {
  project: Project;
  descriptions: string[];
  before: { clips: number; duration: number };
  after: { clips: number; duration: number };
}

/** Validate every operation on a clone. No partial edits, disk writes or arbitrary code. */
export function previewAssistantEdits(input: Project, actions: unknown): AssistantEditPreview {
  if (!Array.isArray(actions) || !actions.length || actions.length > 40)
    throw new Error("Her öneri 1–40 değişiklik içermelidir");
  let project = validateProject(clone(input));
  const descriptions: string[] = [];
  const compatible = (track: Track, clip: Clip) => clip.text ? track.kind === "text" :
    project.assets.some(asset => asset.id === clip.assetId &&
      (track.kind === asset.kind || (track.kind === "video" && asset.kind === "image")));
  const requireClip = (value: unknown): Clip => {
    const clip = project.clips.find(c => c.id === text(value, "Klip ID'si", 256));
    if (!clip) throw new Error("Önerinin başvurduğu klip yok, yeniden oluşturun");
    if (project.tracks.find(t => t.id === clip.trackId)?.locked) throw new Error(`“${clip.name}” klibinin kanalı kilitli`);
    return clip;
  };
  for (const raw of actions) {
    const action = record(raw), type = text(action.type, "İşlem", 40);
    if (!Object.hasOwn(fields, type) || Object.keys(action).some(key => key !== "type" && !fields[type].includes(key)))
      throw new Error("Asistan desteklenmeyen bir işlem veya alan önerdi");
    let target = "", detail = "";
    if (type === "addText") {
      const content = text(action.text, "Metin içeriği");
      let track = project.tracks.find(t => t.kind === "text" && !t.locked);
      if (!track) { track = createTrack("text", "Asistan metni"); project.tracks.unshift(track); }
      const clip = createClip(undefined, track.id, number(action.start, "Başlangıç"), project.fps);
      clip.duration = Math.max(1 / project.fps, snapToFrame(number(action.duration, "Süre", 1 / project.fps), project.fps));
      clip.name = content.slice(0, 80); clip.text!.text = content;
      if (action.fontSize !== undefined) clip.text!.fontSize = number(action.fontSize, "Yazı boyutu", 8, 500);
      if (action.color !== undefined) clip.text!.color = color(action.color);
      for (const key of ["x", "y"] as const)
        if (action[key] !== undefined) clip.transform[key] = number(action[key], "Konum", -10000, 10000);
      project.clips.push(clip); target = content.length > 180 ? content.slice(0, 180) + "…" : content;
      detail = `${clip.start.toFixed(2)}s · ${clip.duration.toFixed(2)}s · punto ${clip.text!.fontSize} · ${clip.text!.color} · konum (${clip.transform.x}, ${clip.transform.y})`;
    } else if (type === "addAsset") {
      const asset = project.assets.find(a => a.id === text(action.assetId, "Medya ID'si", 256));
      if (!asset || asset.missing) throw new Error("Önerinin başvurduğu medya yok veya kaybolmuş");
      let track = action.trackId === undefined
        ? project.tracks.find(t => !t.locked && (t.kind === asset.kind || (t.kind === "video" && asset.kind === "image")))
        : project.tracks.find(t => t.id === text(action.trackId, "Kanal ID'si", 256));
      if (action.trackId !== undefined && !track) throw new Error("Hedef kanal yok");
      if (!track) { track = createTrack(asset.kind); project.tracks.push(track); }
      const clip = createClip(asset, track.id, number(action.start, "Başlangıç"), project.fps);
      if (track.locked || !compatible(track, clip)) throw new Error("Hedef kanal kilitli veya türü uyumsuz");
      if (action.duration !== undefined) {
        clip.duration = number(action.duration, "Süre", 1 / project.fps);
        if (asset.kind !== "image" && clip.duration > asset.duration + 1e-6) throw new Error("Klip süresi medya aralığını aşıyor");
      }
      project.clips.push(clip); target = asset.name; detail = `${clip.start.toFixed(2)}s · ${clip.duration.toFixed(2)}s · kanal “${track.name}”`;
    } else if (type === "setProject") {
      if (Object.keys(action).length < 2) throw new Error("Proje değişikliği boş");
      if (action.name !== undefined) project.name = text(action.name, "Proje adı", 200);
      for (const key of ["width", "height"] as const) if (action[key] !== undefined) {
        const value = number(action[key], "Tuval boyutu", 16, 7680);
        if (!Number.isInteger(value)) throw new Error("Tuval boyutu tam sayı olmalıdır"); project[key] = value;
      }
      if (action.fps !== undefined) {
        const fps = number(action.fps, "Kare hızı", 24, 60);
        if (![24, 25, 30, 50, 60].includes(fps)) throw new Error("Bu kare hızı desteklenmiyor"); project.fps = fps;
      }
      if (action.background !== undefined) project.background = color(action.background);
      target = project.name;
      detail = [
        action.name !== undefined ? `ad “${project.name}”` : "",
        action.width !== undefined || action.height !== undefined ? `tuval ${project.width}×${project.height}` : "",
        action.fps !== undefined ? `${project.fps}fps` : "",
        action.background !== undefined ? `Arka plan ${project.background}` : "",
      ].filter(Boolean).join(" · ");
    } else {
      const clip = requireClip(action.clipId); target = clip.name;
      switch (type) {
        case "deleteClip": project.clips = project.clips.filter(c => c.id !== clip.id); break;
        case "splitClip": {
          const at = snapToFrame(number(action.time, "Bölme zamanı"), project.fps);
          if (at < clip.start + 1 / project.fps - 1e-6 || at > clip.start + clip.duration - 1 / project.fps + 1e-6)
            throw new Error("Bölme noktası klibin içinde olmalıdır");
          const next = splitClip(project, clip.id, at);
          if (next === project) throw new Error("Bölme noktası geçerli bir klip oluşturmuyor; klibin içinden bir kare sınırı seçin");
          project = next; detail = `${at.toFixed(2)}s`; break;
        }
        case "trimClip": {
          if (action.edge !== "start" && action.edge !== "end") throw new Error("Kırpma kenarı geçersiz");
          const at = number(action.time, "Kırpma zamanı");
          // A natural-language cut is deliberately bounded to the existing clip.
          if (at < clip.start || at > clip.start + clip.duration ||
            (action.edge === "start" ? clip.start + clip.duration - at : at - clip.start) < 1 / project.fps - 1e-6)
            throw new Error("Kırpma zamanı geçerli klip aralığında olmalıdır");
          project = trimClip(project, clip.id, action.edge, at); detail = `${action.edge === "start" ? "Başlangıç" : "Bitiş"} ${at.toFixed(2)}s`; break;
        }
        case "moveClip": {
          clip.start = snapToFrame(number(action.start, "Başlangıç"), project.fps);
          if (action.trackId !== undefined) {
            const track = project.tracks.find(t => t.id === text(action.trackId, "Kanal ID'si", 256));
            if (!track || track.locked || !compatible(track, clip)) throw new Error("Hedef kanal kullanılamıyor veya türü uyumsuz");
            clip.trackId = track.id;
          }
          detail = `${clip.start.toFixed(2)}s${action.trackId !== undefined ? ` · kanal “${project.tracks.find(t => t.id === clip.trackId)!.name}”` : ""}`; break;
        }
        case "setSpeed": project = changeClipSpeed(project, clip.id, number(action.speed, "Hız", .1, 8)); detail = `${action.speed}×`; break;
        case "setVolume":
          if (clip.keyframes.some(key => key.property === "volume"))
            throw new Error("Bu klipte ses anahtar kareleri var; önce özellikler panelinden ilgili anahtar kareleri ayarlayın veya kaldırın, sonra ses önerisi oluşturun");
          clip.volume = number(action.volume, "Ses düzeyi", 0, 4);
          if (action.muted !== undefined) {
            if (typeof action.muted !== "boolean") throw new Error("Sessize alma parametresi geçersiz"); clip.muted = action.muted;
          }
          detail = `${Math.round(clip.volume * 100)}%${action.muted !== undefined ? (clip.muted ? " · sessiz" : " · sesi açık") : ""}`; break;
        case "setText": if (!clip.text) throw new Error("Bu klip metin değil"); clip.text.text = text(action.text, "Metin içeriği"); detail = clip.text.text.length > 180 ? clip.text.text.slice(0, 180) + "…" : clip.text.text; break;
        case "setTransform": {
          if (Object.keys(action).length < 3) throw new Error("Görüntü değişikliği boş");
          if (clip.keyframes.some(key => action[key.property] !== undefined))
            throw new Error("Değiştirilen görüntü özelliğinde anahtar kareler var; önce özellikler panelinden ilgili anahtar kareleri ayarlayın veya kaldırın, sonra öneri oluşturun");
          for (const key of ["x", "y", "scale", "rotation", "opacity"] as const) if (action[key] !== undefined)
            clip.transform[key] = number(action[key], key, key === "scale" ? .01 : key === "opacity" ? 0 : -10000, key === "scale" ? 10 : key === "opacity" ? 1 : 10000);
          detail = (["x", "y", "scale", "rotation", "opacity"] as const)
            .filter(key => action[key] !== undefined)
            .map(key => `${{ x: "X", y: "Y", scale: "Ölçek", rotation: "Döndürme", opacity: "Opaklık" }[key]} ${clip.transform[key]}${key === "rotation" ? "°" : key === "scale" ? "×" : ""}`).join(" · "); break;
        }
        case "setFades":
          for (const key of ["fadeIn", "fadeOut", "audioFadeIn", "audioFadeOut"] as const)
            clip[key] = number(action[key], "Yumuşak geçiş süresi", 0, clip.duration);
          delete clip.videoFadeWindow; delete clip.audioFadeWindow;
          detail = `Görüntü yumuşak girişi ${clip.fadeIn}s · yumuşak çıkış ${clip.fadeOut}s · ses girişi ${clip.audioFadeIn}s · ses çıkışı ${clip.audioFadeOut}s`; break;
      }
    }
    descriptions.push(`${labels[type]}: ${target}${detail ? ` · ${detail}` : ""}`);
  }
  project = validateProject(project);
  return { project, descriptions, before: { clips: input.clips.length, duration: projectDuration(input) }, after: { clips: project.clips.length, duration: projectDuration(project) } };
}

const safeName = (value: string, max = 120) => value
  .replace(/(?:[a-z][a-z\d+.-]*:\/\/|cevikedit-media:|[A-Za-z]:[\\/]|\\\\|\/)[^\s]*/gi, "[yerel içerik]")
  .replace(/\0/g, "").slice(0, max);
const safeId = (value: string) => value.length <= 256 && !/[\0\s/\\:]/.test(value);

/** Explicit allowlist: no asset URLs, absolute paths, thumbnails, waveforms or media bytes. */
export function assistantProjectContext(project: Project, selectedIds: string[], playhead: number): string {
  const selected = new Set(selectedIds);
  const rankedClips = [...project.clips].filter(c => safeId(c.id) && safeId(c.trackId) && (!c.assetId || safeId(c.assetId)))
    .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id))).slice(0, 100);
  const trackPriority = new Map([...new Set(rankedClips.map(c => c.trackId))].map((id, index) => [id, index]));
  const tracks = [...project.tracks].filter(t => safeId(t.id))
    .sort((a, b) => (trackPriority.get(a.id) ?? Infinity) - (trackPriority.get(b.id) ?? Infinity)).slice(0, 40);
  const trackIds = new Set(tracks.map(t => t.id));
  const assetPriority = new Map([...new Set(rankedClips.map(c => c.assetId))].map((id, index) => [id, index]));
  const assets = [...project.assets].filter(a => safeId(a.id))
    .sort((a, b) => (assetPriority.get(a.id) ?? Infinity) - (assetPriority.get(b.id) ?? Infinity)).slice(0, 100);
  const assetIds = new Set(assets.map(a => a.id));
  const clips = rankedClips.filter(c => trackIds.has(c.trackId) && (!c.assetId || assetIds.has(c.assetId)));
  const summary = {
    projectId: safeId(project.id) ? project.id : "redacted-project", name: safeName(project.name),
    canvas: { width: project.width, height: project.height, fps: project.fps, background: project.background },
    playhead, selectedIds: clips.filter(c => selected.has(c.id)).map(c => c.id), duration: projectDuration(project),
    assets: assets.map(a => ({ id: a.id, name: safeName(a.name), kind: a.kind, duration: a.duration, width: a.width, height: a.height, missing: !!a.missing })),
    tracks: tracks.map(t => ({ id: t.id, name: safeName(t.name), kind: t.kind, locked: t.locked })),
    clips: clips.map(c => ({ id: c.id, name: safeName(c.name), assetId: c.assetId, trackId: c.trackId, start: c.start, duration: c.duration, sourceIn: c.sourceIn, speed: c.speed, volume: c.volume, muted: c.muted,
      transform: { x: c.transform.x, y: c.transform.y, scale: c.transform.scale, rotation: c.transform.rotation, opacity: c.transform.opacity, flipX: c.transform.flipX, flipY: c.transform.flipY },
      animatedProperties: [...new Set(c.keyframes.map(k => k.property))],
      text: c.text ? safeName(c.text.text, 500) : undefined })),
    truncated: clips.length !== project.clips.length || assets.length !== project.assets.length || tracks.length !== project.tracks.length,
  };
  let serialized = JSON.stringify(summary);
  const bytes = new TextEncoder();
  // Leave headroom below the IPC/backend limit. Drop lower-priority clips first;
  // retain every reference used by the remaining clips, especially selection.
  while (bytes.encode(serialized).byteLength > 90_000) {
    summary.truncated = true;
    if (summary.clips.length > 1) summary.clips.pop();
    else if (summary.assets.length > 1) {
      const referenced = new Set(summary.clips.map(c => c.assetId));
      let removable = summary.assets.length - 1;
      while (removable >= 0 && referenced.has(summary.assets[removable].id)) removable--;
      if (removable < 0) break;
      summary.assets.splice(removable, 1);
    } else break;
    summary.selectedIds = summary.clips.filter(c => selected.has(c.id)).map(c => c.id);
    serialized = JSON.stringify(summary);
  }
  return serialized;
}
