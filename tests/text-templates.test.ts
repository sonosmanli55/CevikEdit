import { describe, expect, it } from "vitest";
import {
  addTextPreset,
  makeTextPreset,
  TEXT_PRESETS,
  TEXT_PRESET_CATEGORIES,
} from "../src/core/creativePresets";
import { createProject, validateProject } from "../src/core/model";

const COLORS = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

describe("title template catalogue", () => {
  it("has unique ids and a category with at least one template for every tab", () => {
    const ids = new Set(TEXT_PRESETS.map((preset) => preset.id));
    expect(ids.size).toBe(TEXT_PRESETS.length);
    for (const category of TEXT_PRESET_CATEGORIES)
      expect(
        TEXT_PRESETS.some((preset) => preset.category === category),
      ).toBe(true);
    for (const preset of TEXT_PRESETS) {
      expect(preset.name.trim()).not.toBe("");
      expect(preset.style.text.trim()).not.toBe("");
      expect(TEXT_PRESET_CATEGORIES).toContain(preset.category);
    }
  });

  it("keeps every style inside the limits the project validator accepts", () => {
    for (const preset of TEXT_PRESETS) {
      const style = preset.style;
      expect(style.fontSize ?? 72).toBeGreaterThanOrEqual(1);
      expect(style.fontSize ?? 72).toBeLessThanOrEqual(1000);
      if (style.lineHeight !== undefined)
        expect(style.lineHeight).toBeGreaterThanOrEqual(0.8);
      if (style.padding !== undefined)
        expect(style.padding).toBeGreaterThanOrEqual(0);
      if (style.radius !== undefined)
        expect(style.radius).toBeLessThanOrEqual(1);
      if (style.shadow) {
        expect(style.shadow.color).toMatch(COLORS);
        expect(style.shadow.blur).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(style.shadow.offsetX)).toBe(true);
        expect(Number.isFinite(style.shadow.offsetY)).toBe(true);
      }
    }
  });

  it("scales fonts, strokes and shadows to the project resolution", () => {
    const preset = TEXT_PRESETS.find((item) => item.style.shadow)!;
    const project = { width: 640, height: 360, fps: 30 };
    const clip = makeTextPreset(preset, "track", 0, project);
    const scale = Math.min(640 / 1920, 360 / 1080);
    expect(clip.text!.fontSize).toBeCloseTo(
      Math.max(8, (preset.style.fontSize ?? 72) * scale),
      6,
    );
    expect(clip.text!.shadow!.blur).toBeCloseTo(
      preset.style.shadow!.blur * scale,
      6,
    );
    expect(clip.text!.padding).toBe(preset.style.padding ?? 0.25);
  });

  it("adds every template to a valid project and produces motion keyframes", () => {
    for (const preset of TEXT_PRESETS) {
      const project = createProject();
      project.width = 1920;
      project.height = 1080;
      const { project: next, clip } = addTextPreset(project, preset, 1.2);
      validateProject(next);
      expect(clip.text!.text).toBe(preset.style.text);
      if (!preset.motion) continue;
      if (preset.motion === "fade") {
        expect(clip.fadeIn).toBeGreaterThan(0);
        expect(clip.fadeOut).toBeGreaterThan(0);
        continue;
      }
      expect(clip.keyframes.length).toBeGreaterThanOrEqual(2);
      for (const key of clip.keyframes) {
        expect(key.time).toBeGreaterThanOrEqual(0);
        expect(key.easing).toBe("easeInOut");
        expect(["x", "y", "scale"]).toContain(key.property);
      }
    }
  });

  it("moves sliding titles in from the right and settles scaled titles", () => {
    const slide = TEXT_PRESETS.find((item) => item.motion === "slide")!;
    const project = { width: 1000, height: 500, fps: 30 };
    const slideClip = makeTextPreset(slide, "track", 0, project);
    const firstSlide = slideClip.keyframes.find((key) => key.property === "x")!;
    expect(firstSlide.value).toBeCloseTo(400);
    const settle = TEXT_PRESETS.find((item) => item.motion === "settle")!;
    const settleClip = makeTextPreset(settle, "track", 0, project);
    const firstScale = settleClip.keyframes.find(
      (key) => key.property === "scale",
    )!;
    expect(firstScale.value).toBeCloseTo(1.22);
  });
});
