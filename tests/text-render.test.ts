import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { DEFAULT_TEXT } from "../src/core/defaults";
import {
  roundedRectPath,
  textFont,
  textLayerLayout,
  textShadowMargin,
} from "../src/core/textLayout";
import type { TextStyle } from "../src/core/types";

/** Mirrors electron/export.ts so unsupported canvas APIs fail here first. */
function render(style: TextStyle) {
  const measurement = createCanvas(1, 1).getContext("2d");
  const font = textFont(style);
  measurement.font = font;
  const layout = textLayerLayout(
    style,
    (line) => measurement.measureText(line).width,
  );
  const margin = textShadowMargin(style);
  const canvas = createCanvas(
    layout.width + margin * 2,
    layout.height + margin * 2,
  );
  const context = canvas.getContext("2d");
  expect(canvas.width).toBeGreaterThan(0);
  expect(canvas.height).toBeGreaterThan(0);
  context.translate(margin, margin);
  if (style.background !== "transparent") {
    context.fillStyle = style.background;
    roundedRectPath(context, 0, 0, layout.width, layout.height, layout.radius);
    context.fill();
  }
  context.font = font;
  context.textAlign = style.align;
  context.textBaseline = "middle";
  context.fillStyle = style.color;
  context.strokeStyle = style.stroke;
  context.lineWidth = style.strokeWidth * 2;
  if (style.shadow) {
    context.shadowColor = style.shadow.color;
    context.shadowBlur = style.shadow.blur;
    context.shadowOffsetX = style.shadow.offsetX;
    context.shadowOffsetY = style.shadow.offsetY;
  }
  layout.lines.forEach((line, index) => {
    const y = layout.baseline(index);
    if (style.strokeWidth > 0) context.strokeText(line, layout.x, y);
    context.fillText(line, layout.x, y);
  });
  return canvas.toBuffer("image/png");
}

describe("text layer rendering on the export canvas", () => {
  it("renders a rounded background with a drop shadow", () => {
    const png = render({
      ...DEFAULT_TEXT,
      text: "Merhaba dünya",
      fontSize: 48,
      background: "#15151c",
      radius: 0.5,
      padding: 0.4,
      shadow: { color: "#62ead1", blur: 18, offsetX: 2, offsetY: -3 },
    });
    expect(png.length).toBeGreaterThan(500);
  });

  it("renders multi-line outlined text without a background", () => {
    const png = render({
      ...DEFAULT_TEXT,
      text: "İki satır\nikinci satır",
      fontSize: 36,
      lineHeight: 1.5,
      background: "transparent",
      strokeWidth: 6,
      stroke: "#000000",
    });
    expect(png.length).toBeGreaterThan(500);
  });
});
