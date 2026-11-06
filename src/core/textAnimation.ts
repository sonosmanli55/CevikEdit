import { id as createId, snapToFrame } from "./model";
import type { Clip, Keyframe, KeyframeEasing, Project } from "./types";

/**
 * Caption animation is stored with the same fades and transform keyframes the
 * editor and exporter already evaluate. There is no second animation engine to
 * keep in sync, so preview and export share the exact timing and values.
 */
export const TEXT_ENTRANCES = ["none", "fade", "slideUp", "scale"] as const;
export const TEXT_HOLDS = ["none", "pulse"] as const;
export const TEXT_EXITS = ["none", "fade", "slideDown", "scale"] as const;

export type TextEntrance = (typeof TEXT_ENTRANCES)[number];
export type TextHold = (typeof TEXT_HOLDS)[number];
export type TextExit = (typeof TEXT_EXITS)[number];

export interface TextAnimationSettings {
  entrance: TextEntrance;
  hold: TextHold;
  exit: TextExit;
  /** Requested entrance duration; shortened automatically on short cues. */
  inDuration: number;
  /** Requested exit duration; shortened automatically on short cues. */
  outDuration: number;
}

export interface TextAnimationPatch {
  fadeIn: number;
  fadeOut: number;
  keyframes: Keyframe[];
}

const MIN_ANIMATION_SECONDS = 0;
const MAX_ANIMATION_SECONDS = 10;

function object(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error("文字动画设置无效");
  return value as Record<string, unknown>;
}

function duration(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${label}必须是有限数值`);
  if (value < MIN_ANIMATION_SECONDS || value > MAX_ANIMATION_SECONDS)
    throw new Error(`${label}须在 0～${MAX_ANIMATION_SECONDS} 秒内`);
  return value;
}

function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    throw new Error(`${label}无效`);
  return value as T;
}

export function validateTextAnimation(
  value: unknown,
): TextAnimationSettings {
  const raw = object(value);
  const entrance = choice(raw.entrance, TEXT_ENTRANCES, "文字入场动画");
  const hold = choice(raw.hold, TEXT_HOLDS, "文字停留动画");
  const exit = choice(raw.exit, TEXT_EXITS, "文字出场动画");
  const inDuration = duration(raw.inDuration, "文字入场时长");
  const outDuration = duration(raw.outDuration, "文字出场时长");
  if (entrance !== "none" && inDuration <= 0)
    throw new Error("请设置大于 0 的文字入场时长");
  if (exit !== "none" && outDuration <= 0)
    throw new Error("请设置大于 0 的文字出场时长");
  return { entrance, hold, exit, inDuration, outDuration };
}

const visualProperties = new Set<Keyframe["property"]>([
  "x",
  "y",
  "scale",
  "opacity",
]);

interface Point {
  value: number;
  easing: KeyframeEasing;
}

function scaleValue(value: number): number {
  return Math.max(0.000001, Math.min(10, value));
}

/**
 * Build the fade/keyframe patch for a caption. Existing position, scale and
 * opacity keys are replaced because this is an explicit uniform animation
 * action; unrelated rotation/volume keys are preserved. Durations are limited
 * to half of each cue so entrance and exit cannot overlap, and short cues get
 * proportionally shorter motion instead of rejecting an entire batch.
 */
export function textAnimationPatch(
  clip: Clip,
  settings: TextAnimationSettings,
  project: Pick<Project, "fps" | "height">,
): TextAnimationPatch {
  const animation = validateTextAnimation(settings);
  const fps = project.fps;
  const minimum = 1 / fps;
  const duration = Math.max(minimum, clip.duration);
  const hasEntrance = animation.entrance !== "none";
  const hasExit = animation.exit !== "none";
  const hasHold = animation.hold !== "none";
  if ((hasEntrance || hasExit || hasHold) && duration < minimum * 2 - 1e-9)
    throw new Error("字幕至少需要两帧才能设置文字动画");

  const half = duration / 2;
  const limit = (seconds: number): number =>
    Math.max(minimum, Math.min(snapToFrame(seconds, fps), half));
  const inDuration = hasEntrance ? limit(animation.inDuration) : 0;
  const outDuration = hasExit ? limit(animation.outDuration) : 0;
  const outStart = duration - outDuration;

  const points = new Map<Keyframe["property"], Map<number, Point>>();
  const add = (
    property: Keyframe["property"],
    time: number,
    value: number,
    easing: KeyframeEasing,
  ) => {
    if (!Number.isFinite(time) || !Number.isFinite(value)) return;
    const at = Math.max(0, Math.min(duration, snapToFrame(time, fps)));
    let propertyPoints = points.get(property);
    if (!propertyPoints) {
      propertyPoints = new Map();
      points.set(property, propertyPoints);
    }
    propertyPoints.set(at, {
      value:
        property === "scale"
          ? scaleValue(value)
          : property === "opacity"
            ? Math.max(0, Math.min(1, value))
            : value,
      easing,
    });
  };

  const baseY = clip.transform.y;
  const baseScale = scaleValue(clip.transform.scale);
  const travel = Math.max(1, project.height * 0.06);

  if (animation.entrance === "slideUp") {
    add("y", 0, baseY + travel, "linear");
    add("y", inDuration, baseY, "easeOut");
  }
  if (animation.exit === "slideDown") {
    add("y", outStart, baseY, "linear");
    add("y", duration, baseY + travel, "easeIn");
  }

  if (animation.entrance === "scale") {
    add("scale", 0, baseScale * 0.7, "linear");
    add("scale", inDuration, baseScale, "easeOut");
  }
  if (animation.hold === "pulse" && outStart - inDuration >= minimum * 2 - 1e-9) {
    if (animation.entrance !== "scale") add("scale", 0, baseScale, "linear");
    add(
      "scale",
      (inDuration + outStart) / 2,
      baseScale * 1.04,
      "easeInOut",
    );
    add("scale", outStart, baseScale, "easeInOut");
  }
  if (animation.exit === "scale") {
    add("scale", outStart, baseScale, "linear");
    add("scale", duration, baseScale * 0.7, "easeIn");
  }

  // Do not leave a stale x animation behind: a uniform preset replaces the
  // complete position/scale/opacity animation while keeping other properties.
  const keyframes = clip.keyframes.filter(
    (key) => !visualProperties.has(key.property),
  );
  for (const [property, propertyPoints] of points) {
    for (const [time, point] of [...propertyPoints.entries()].sort(
      ([a], [b]) => a - b,
    ))
      keyframes.push({
        id: createId(),
        time,
        property,
        value: point.value,
        easing: point.easing,
      });
  }

  return {
    fadeIn: hasEntrance ? inDuration : 0,
    fadeOut: hasExit ? outDuration : 0,
    keyframes,
  };
}
