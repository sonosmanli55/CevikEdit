import { describe, expect, it } from "vitest";
import {
  DEFAULT_LINE_HEIGHT,
  DEFAULT_TEXT_PADDING,
  roundedRectPath,
  textFont,
  textLayerLayout,
  textShadowMargin,
  type RoundedRectContext,
} from "../src/core/textLayout";
import type { TextStyle } from "../src/core/types";

const base: TextStyle = {
  text: "Tek satır",
  fontSize: 100,
  fontFamily: "sans-serif",
  color: "#ffffff",
  background: "transparent",
  align: "center",
  bold: false,
  stroke: "#000000",
  strokeWidth: 0,
};
const measure = (width: number) => () => width;

describe("text layer geometry", () => {
  it("keeps the legacy layout when the optional style fields are absent", () => {
    const layout = textLayerLayout(base, measure(300));
    const padding = Math.ceil(base.fontSize * DEFAULT_TEXT_PADDING);
    expect(layout.padding).toBe(padding);
    expect(layout.lineHeight).toBe(base.fontSize * DEFAULT_LINE_HEIGHT);
    expect(layout.width).toBe(300 + padding * 2);
    expect(layout.height).toBe(Math.ceil(layout.lineHeight + padding * 2));
    expect(layout.x).toBe(layout.width / 2);
    expect(layout.radius).toBe(0);
    expect(layout.baseline(0)).toBe(padding + layout.lineHeight / 2);
  });

  it("honours padding, line height, alignment and multi-line text", () => {
    const layout = textLayerLayout(
      {
        ...base,
        text: "Bir\nİki",
        align: "left",
        padding: 0.5,
        lineHeight: 2,
        strokeWidth: 4,
        radius: 0.2,
      },
      measure(200),
    );
    // Padding also reserves room for the stroke.
    expect(layout.padding).toBe(54);
    expect(layout.lineHeight).toBe(200);
    expect(layout.lines).toEqual(["Bir", "İki"]);
    expect(layout.width).toBe(200 + 54 * 2);
    expect(layout.height).toBe(200 * 2 + 54 * 2);
    expect(layout.x).toBe(54);
    expect(layout.baseline(1)).toBe(54 + 200 * 1.5);
    expect(layout.radius).toBe(20);
  });

  it("clamps the background radius to half of the layer height", () => {
    const layout = textLayerLayout({ ...base, radius: 2 }, measure(50));
    expect(layout.radius).toBe(Math.min(layout.height / 2, 200));
  });

  it("measures a shadow margin so the glow is not clipped", () => {
    expect(textShadowMargin({})).toBe(0);
    expect(
      textShadowMargin({
        shadow: { color: "#000000", blur: 10, offsetX: 3, offsetY: -7 },
      }),
    ).toBe(17);
  });

  it("builds a sanitised canvas font string", () => {
    expect(textFont({ ...base, bold: true, fontFamily: 'Bad"Font;' })).toContain(
      'bold 100px "BadFont"',
    );
    expect(textFont({ ...base, fontFamily: '""' })).toContain('"sans-serif"');
  });

  it("draws a closed rounded rectangle path", () => {
    const calls: string[] = [];
    const ctx: RoundedRectContext = {
      beginPath: () => calls.push("begin"),
      moveTo: () => calls.push("moveTo"),
      lineTo: () => calls.push("lineTo"),
      arcTo: () => calls.push("arcTo"),
      closePath: () => calls.push("close"),
    };
    roundedRectPath(ctx, 0, 0, 100, 40, 12);
    expect(calls.filter((call) => call === "arcTo")).toHaveLength(4);
    expect(calls.at(0)).toBe("begin");
    expect(calls.at(-1)).toBe("close");
  });
});
