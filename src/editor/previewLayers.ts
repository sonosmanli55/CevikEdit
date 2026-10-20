import type { Clip } from "../core/types";
import { getCropPixels, applyChromaKey, applyShapeMask } from "../core/visual";
import { applyColorAdjustments } from "../core/color";
import {
  roundedRectPath,
  textFont,
  textLayerLayout,
  textShadowMargin,
} from "../core/textLayout";
interface Layer {
  canvas: HTMLCanvasElement;
  key: string;
  width: number;
  height: number;
}
const cache = new Map<string, Layer>();
export function clearPreviewLayers(keepIds: Set<string>) {
  for (const id of cache.keys()) if (!keepIds.has(id)) cache.delete(id);
}
function canvasFor(
  clip: Clip,
  key: string,
  width: number,
  height: number,
): Layer {
  let layer = cache.get(clip.id);
  if (!layer) {
    layer = {
      canvas: document.createElement("canvas"),
      key: "",
      width,
      height,
    };
    cache.set(clip.id, layer);
  }
  if (layer.canvas.width !== width || layer.canvas.height !== height) {
    layer.canvas.width = width;
    layer.canvas.height = height;
    layer.key = "";
  }
  layer.width = width;
  layer.height = height;
  return layer;
}
function adjust(layer: Layer, clip: Clip) {
  const a = clip.adjustments;
  if (
    !clip.chromaKey?.enabled &&
    !clip.mask &&
    a.brightness === 0 &&
    a.contrast === 1 &&
    a.saturation === 1 &&
    a.temperature === 0
  )
    return;
  const context = layer.canvas.getContext("2d", { willReadFrequently: true })!;
  const pixels = context.getImageData(
    0,
    0,
    layer.canvas.width,
    layer.canvas.height,
  );
  applyChromaKey(pixels.data, clip.chromaKey);
  applyShapeMask(
    pixels.data,
    layer.canvas.width,
    layer.canvas.height,
    clip.mask,
  );
  applyColorAdjustments(pixels.data, a);
  context.putImageData(pixels, 0, 0);
}
export function imagePreviewLayer(
  clip: Clip,
  source: HTMLImageElement | HTMLVideoElement,
  nativeWidth: number,
  nativeHeight: number,
  frame?: number,
): HTMLCanvasElement {
  const crop = getCropPixels(
    { width: nativeWidth, height: nativeHeight },
    clip.crop,
  );
  const width = crop.width,
    height = crop.height;
  const clock =
    frame ?? (source instanceof HTMLVideoElement ? source.currentTime : 0);
  const key = JSON.stringify([
    source.src,
    Math.floor(clock * 120) / 120,
    clip.crop,
    clip.chromaKey,
    clip.mask,
    clip.adjustments,
    width,
    height,
  ]);
  const layer = canvasFor(clip, key, width, height);
  if (layer.key !== key) {
    const context = layer.canvas.getContext("2d", {
      willReadFrequently: true,
    })!;
    context.clearRect(0, 0, width, height);
    context.drawImage(source, -crop.x, -crop.y, nativeWidth, nativeHeight);
    adjust(layer, clip);
    layer.key = key;
  }
  return layer.canvas;
}
export function textPreviewLayer(clip: Clip): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
} {
  const style = clip.text!;
  const cachedKey = JSON.stringify([
    style,
    clip.crop,
    clip.chromaKey,
    clip.mask,
    clip.adjustments,
  ]);
  const cached = cache.get(clip.id);
  if (cached?.key === cachedKey) return cached;
  const font = textFont(style);
  const context = document.createElement("canvas").getContext("2d")!;
  context.font = font;
  const layout = textLayerLayout(style, (line) =>
    context.measureText(line).width,
  );
  const margin = textShadowMargin(style);
  const key = cachedKey;
  const crop = getCropPixels(
    {
      width: layout.width + margin * 2,
      height: layout.height + margin * 2,
    },
    clip.crop,
  );
  const layer = canvasFor(
    clip,
    key,
    Math.min(8192, crop.width),
    Math.min(8192, crop.height),
  );
  if (layer.key !== key) {
    const ctx = layer.canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    ctx.save();
    ctx.translate(-crop.x + margin, -crop.y + margin);
    if (style.background !== "transparent") {
      ctx.fillStyle = style.background;
      roundedRectPath(
        ctx,
        0,
        0,
        layout.width,
        layout.height,
        layout.radius,
      );
      ctx.fill();
    }
    ctx.font = font;
    ctx.textAlign = style.align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = style.color;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidth * 2;
    ctx.lineJoin = "round";
    if (style.shadow) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = style.shadow.blur;
      ctx.shadowOffsetX = style.shadow.offsetX;
      ctx.shadowOffsetY = style.shadow.offsetY;
    }
    layout.lines.forEach((line, i) => {
      const y = layout.baseline(i);
      if (style.strokeWidth > 0) ctx.strokeText(line, layout.x, y);
      ctx.fillText(line, layout.x, y);
    });
    ctx.restore();
    adjust(layer, clip);
    layer.key = key;
  }
  return { canvas: layer.canvas, width: crop.width, height: crop.height };
}
