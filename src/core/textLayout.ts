/** Shared text-layer geometry so the preview and the export render identically. */
import type { TextStyle } from "./types";

export const DEFAULT_LINE_HEIGHT = 1.3;
export const DEFAULT_TEXT_PADDING = 0.25;

export type TextLayoutStyle = Pick<
  TextStyle,
  "text" | "fontSize" | "align" | "strokeWidth" | "lineHeight" | "padding" | "radius"
>;

export interface TextLayerLayout {
  lines: string[];
  /** Inner padding in layer pixels (already includes the stroke allowance). */
  padding: number;
  /** Distance between two baselines in layer pixels. */
  lineHeight: number;
  width: number;
  height: number;
  /** Horizontal anchor for `align`. */
  x: number;
  /** Background corner radius in layer pixels; 0 keeps a rectangular box. */
  radius: number;
  /** Vertical center of a line, matching the previous `padding + lineHeight * (i + .5)`. */
  baseline: (index: number) => number;
}

/** Canvas font string; the family is sanitised so it cannot break the CSS font list. */
export function textFont(
  style: Pick<TextStyle, "bold" | "fontSize" | "fontFamily">,
): string {
  const family =
    style.fontFamily.replace(/["'\\;\n\r]/g, "").trim() || "sans-serif";
  const weight = style.bold ? "bold " : "";
  return `${weight}${style.fontSize}px "${family}", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Arial Unicode MS", sans-serif`;
}

/**
 * Measure a text clip with the caller's canvas. `measure` receives a single
 * line and returns its advance width in CSS pixels.
 */
export function textLayerLayout(
  style: TextLayoutStyle,
  measure: (line: string) => number,
): TextLayerLayout {
  const lines = style.text.split("\n");
  const padding = Math.ceil(
    style.fontSize * (style.padding ?? DEFAULT_TEXT_PADDING) + style.strokeWidth,
  );
  const lineHeight = style.fontSize * (style.lineHeight ?? DEFAULT_LINE_HEIGHT);
  const widest = Math.max(
    ...lines.map((line) => {
      const width = measure(line);
      return Number.isFinite(width) ? width : 0;
    }),
    0,
  );
  const width = Math.max(2, Math.ceil(widest) + padding * 2);
  const height = Math.max(2, Math.ceil(lineHeight * lines.length + padding * 2));
  const x =
    style.align === "left"
      ? padding
      : style.align === "right"
        ? width - padding
        : width / 2;
  const radius = Math.min(
    height / 2,
    Math.max(0, (style.radius ?? 0) * style.fontSize),
  );
  return {
    lines,
    padding,
    lineHeight,
    width,
    height,
    x,
    radius,
    baseline: (index) => padding + lineHeight * (index + 0.5),
  };
}

/**
 * Transparent margin a layer needs so a drop shadow is not clipped by the
 * canvas edge. 0 when the style has no shadow.
 */
export function textShadowMargin(
  style: Pick<TextStyle, "shadow">,
): number {
  const shadow = style.shadow;
  if (!shadow) return 0;
  const spread =
    Math.abs(shadow.offsetX) > Math.abs(shadow.offsetY)
      ? Math.abs(shadow.offsetX)
      : Math.abs(shadow.offsetY);
  return Math.ceil(Math.max(0, shadow.blur) + spread);
}

/** Minimal canvas surface so both the browser and the export canvas can use it. */
export interface RoundedRectContext {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
}

/** Rounded rectangle path. `radius` is clamped to half the shortest side. */
export function roundedRectPath(
  ctx: RoundedRectContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  if (r <= 0.01) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

