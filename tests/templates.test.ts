import { describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATES } from "../src/core/builtinTemplates";
import {
  TEMPLATE_FORMAT,
  instantiateTemplate,
  parseTemplate,
  projectDuration,
  serializeTemplate,
  templateCover,
  templateFromProject,
  templateSummary,
  validateTemplate,
} from "../src/core/templates";
import { createClip, createProject, createTrack, validateProject } from "../src/core/model";
import type { MediaAsset } from "../src/core/types";

const VIDEO: MediaAsset = {
  id: "asset-video",
  name: "çekim.mp4",
  path: "C:\\media\\çekim.mp4",
  url: "reacut-media://asset?path=x",
  kind: "video",
  duration: 4,
  width: 640,
  height: 360,
  fps: 30,
  hasAudio: true,
};
const IMAGE: MediaAsset = {
  id: "asset-image",
  name: "kapak.png",
  path: "C:\\media\\kapak.png",
  url: "reacut-media://asset?path=y",
  kind: "image",
  duration: 0,
  width: 800,
  height: 600,
  fps: 0,
  hasAudio: false,
};
const AUDIO: MediaAsset = {
  id: "asset-audio",
  name: "müzik.wav",
  path: "C:\\media\\müzik.wav",
  url: "reacut-media://asset?path=z",
  kind: "audio",
  duration: 30,
  width: 0,
  height: 0,
  fps: 0,
  hasAudio: true,
};

function project() {
  const p = createProject("Şablon kaynağı");
  p.fps = 30;
  p.assets = [{ ...VIDEO }, { ...AUDIO }, { ...IMAGE }];
  const videoTrack = p.tracks.find((t) => t.kind === "video")!;
  const audioTrack = p.tracks.find((t) => t.kind === "audio")!;
  const textTrack = p.tracks.find((t) => t.kind === "text")!;
  const visual = createClip(p.assets[0], videoTrack.id, 1, 30);
  visual.id = "visual";
  visual.duration = 4;
  visual.keyframes = [
    { id: "k", time: 0, property: "scale", value: 1, easing: "linear" },
    { id: "k2", time: 4, property: "scale", value: 1.2, easing: "easeInOut" },
  ];
  const music = createClip(p.assets[1], audioTrack.id, 0, 30);
  music.id = "music";
  music.duration = 8;
  const title = createClip(undefined, textTrack.id, 1, 30);
  title.id = "title";
  title.duration = 3;
  title.text!.text = "Başlık";
  p.clips = [visual, music, title];
  return validateProject(p);
}

describe("project templates", () => {
  it("ships three valid built-in templates with slots and text", () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(3);
    for (const template of BUILTIN_TEMPLATES) {
      expect(() => validateTemplate(template)).not.toThrow();
      expect(template.format).toBe(TEMPLATE_FORMAT);
      expect(template.media.length).toBeGreaterThan(0);
      expect(template.texts.length).toBeGreaterThan(0);
      expect(projectDuration(template.project)).toBeGreaterThan(4);
      const summary = templateSummary(template, true);
      expect(summary.mediaCount).toBe(template.media.length);
      expect(summary.builtin).toBe(true);
      expect(summary.width / summary.height).toBeCloseTo(
        template.project.width / template.project.height,
        6,
      );
    }
  });
  it("instantiates a built-in template with defaults and keeps its timing", () => {
    const template = BUILTIN_TEMPLATES[0];
    const slot = template.media[0];
    const result = instantiateTemplate(template, {
      name: "Yeni proje",
      media: { [slot.key]: { ...IMAGE, id: "local" } },
      texts: { [template.texts[0].key]: "Merhaba dünya" },
    });
    expect(() => validateProject(result.project)).not.toThrow();
    expect(result.project.name).toBe("Yeni proje");
    expect(result.project.assets).toHaveLength(1);
    expect(result.project.assets[0].path).toBe(IMAGE.path);
    expect(result.project.clips.every((clip) => clip.id !== template.project.clips[0].id)).toBe(true);
    const title = result.project.clips.find(
      (clip) => clip.text?.text === "Merhaba dünya",
    );
    expect(title).toBeTruthy();
    expect(result.project.tracks.map((track) => track.id)).not.toEqual(
      template.project.tracks.map((track) => track.id),
    );
    expect(projectDuration(result.project)).toBeCloseTo(
      projectDuration(template.project),
      6,
    );
  });
  it("skips optional slots and reports them instead of failing", () => {
    const template = BUILTIN_TEMPLATES[1];
    const result = instantiateTemplate(template, { name: "Boş slot" });
    expect(result.project.assets).toHaveLength(0);
    expect(result.project.clips.every((clip) => clip.text)).toBe(true);
    expect(result.warnings.join(" ")).toContain("seçilmedi");
  });
  it("rejects a required slot and a media of the wrong kind", () => {
    const template = BUILTIN_TEMPLATES[0];
    const required = {
      ...validateTemplate(template),
      media: [{ ...template.media[0], optional: false }],
    };
    expect(() => instantiateTemplate(required, { name: "Zorunlu" })).toThrow(
      "seçilmedi",
    );
    // An image slot must not accept an audio file.
    expect(() =>
      instantiateTemplate(validateTemplate(template), {
        name: "Tür",
        media: { [template.media[0].key]: { ...AUDIO } },
      }),
    ).toThrow("görsel");
  });
  it("shortens clips that are longer than the replacement media", () => {
    const template = BUILTIN_TEMPLATES[2];
    const slot = template.media[0];
    const short = { ...VIDEO, duration: 1.5, id: "kısa" };
    const result = instantiateTemplate(template, {
      name: "Kısa medya",
      media: { [slot.key]: short },
    });
    const visual = result.project.clips.find((clip) => clip.assetId);
    expect(visual!.duration).toBeLessThanOrEqual(1.5);
    expect(visual!.keyframes.every((key) => key.time <= visual!.duration + 1e-9)).toBe(true);
    expect(result.warnings.join(" ")).toContain("kısaltıldı");
  });
  it("turns a project into a template without leaking local paths", () => {
    const source = project();
    const template = templateFromProject(source, {
      name: "Benim şablonum",
      description: "Açıklama",
      cover: templateCover(source, "Benim şablonum"),
    });
    expect(template.project.assets).toHaveLength(2);
    expect(template.project.assets.every((asset) => asset.path.startsWith("template://media/"))).toBe(true);
    expect(JSON.stringify(template)).not.toContain("C:\\\\media");
    expect(JSON.stringify(template)).not.toContain("reacut-media://");
    expect(template.media).toHaveLength(2);
    expect(template.texts).toHaveLength(1);
    expect(template.texts[0].text).toBe("Başlık");
    expect(template.cover.startsWith("data:image/")).toBe(true);
    // Unused assets are dropped rather than pointing at a local path.
    expect(template.project.clips).toHaveLength(3);
    expect(template.project.assets.map((asset) => asset.kind).sort()).toEqual([
      "audio",
      "video",
    ]);
    // The source project is untouched.
    expect(source.assets[0].path).toContain("media");
    expect(source.clips).toHaveLength(3);
  });
  it("round-trips through JSON and rejects tampered templates", () => {
    const template = templateFromProject(project(), { name: "Tur" });
    const text = serializeTemplate(template);
    const parsed = parseTemplate(text);
    expect(parsed.name).toBe("Tur");
    expect(parsed.media.map((slot) => slot.key)).toEqual(
      template.media.map((slot) => slot.key),
    );
    const local = JSON.parse(text);
    local.project.assets[0].path = "C:\\gizli\\video.mp4";
    expect(() => validateTemplate(local)).toThrow("medya yolu");
    const traversal = JSON.parse(text);
    traversal.project.assets[0].path = "template://media/../../etc/passwd";
    expect(() => validateTemplate(traversal)).toThrow();
    const badCover = JSON.parse(text);
    badCover.cover = "data:text/html;base64,PHNjcmlwdD4=";
    expect(() => validateTemplate(badCover)).toThrow("kapağı");
    const missingAsset = JSON.parse(text);
    missingAsset.media = missingAsset.media.slice(1);
    expect(() => validateTemplate(missingAsset)).toThrow();
    expect(() => parseTemplate("bozuk")).toThrow("JSON");
    expect(() => parseTemplate("{}")).toThrow("biçim");
  });
  it("rejects oversized or malformed slot lists before building anything", () => {
    const template = templateFromProject(project(), { name: "Sınır" });
    const tooMany = {
      ...template,
      media: Array.from({ length: 101 }, (_, index) => ({
        ...template.media[0],
        key: `m${index}`,
      })),
    };
    expect(() => validateTemplate(tooMany)).toThrow("çok fazla");
    const duplicate = {
      ...template,
      texts: [template.texts[0], template.texts[0]],
    };
    expect(() => validateTemplate(duplicate)).toThrow("yineleniyor");
    expect(() =>
      templateFromProject(project(), { name: "  " }),
    ).toThrow("Şablon adı");
  });
  it("does not reuse ids or link ids between two instantiations", () => {
    const template = BUILTIN_TEMPLATES[0];
    const now = new Date("2026-11-08T00:00:00.000Z");
    const first = instantiateTemplate(template, {
      name: "Bir",
      media: { m1: { ...IMAGE } },
      now,
    });
    const second = instantiateTemplate(template, {
      name: "İki",
      media: { m1: { ...IMAGE } },
      now,
    });
    const ids = new Set([
      ...first.project.clips.map((clip) => clip.id),
      ...second.project.clips.map((clip) => clip.id),
    ]);
    expect(ids.size).toBe(first.project.clips.length + second.project.clips.length);
    expect(first.project.id).not.toBe(second.project.id);
    expect(first.project.createdAt).toBe(second.project.createdAt);
  });
  it("reports a summary suitable for the library", () => {
    const template = BUILTIN_TEMPLATES[2];
    const summary = templateSummary(template);
    expect(summary).toMatchObject({
      id: template.id,
      name: template.name,
      width: template.project.width,
      height: template.project.height,
      fps: 30,
      mediaCount: 1,
      textCount: 4,
      builtin: false,
    });
    expect(summary.duration).toBeGreaterThan(10);
  });
  it("creates a placeholder clip with the requested timing", () => {
    const track = createTrack("video", "Video");
    const clip = createClip(VIDEO, track.id, 2, 30);
    expect(clip.start).toBe(2);
  });
});
