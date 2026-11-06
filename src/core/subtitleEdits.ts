import {
  clone,
  id as createId,
  snapToFrame,
  splitClip,
  trimClip,
  validateProject,
} from "./model";
import {
  textAnimationPatch,
  validateTextAnimation,
  type TextAnimationSettings,
} from "./textAnimation";
import type { Clip, Project, TextStyle } from "./types";

export type SubtitleStylePatch = Partial<Omit<TextStyle, "text">>;

export type SubtitleEdit =
  | { type: "cue"; text: string; start: number; end: number }
  | { type: "offset"; seconds: number }
  | { type: "replace"; find: string; replacement: string }
  | { type: "style"; referenceId?: string; patch?: SubtitleStylePatch }
  | { type: "split"; at: number }
  | { type: "merge" }
  | { type: "animation"; animation: TextAnimationSettings };

export interface SubtitleEditPlan {
  base: string;
  project: Project;
  changedIds: string[];
}

function text(
  value: unknown,
  label: string,
  empty = true,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 20000 ||
    value.includes("\0") ||
    (!empty && !value.length)
  )
    throw new Error(`${label}无效（最多 20000 字）`);
}
function finite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${label}必须是有限数值`);
}
function range(
  value: unknown,
  label: string,
  min: number,
  max: number,
): asserts value is number {
  finite(value, label);
  if (value < min || value > max)
    throw new Error(`${label}须在 ${min}～${max} 之间`);
}
function color(value: unknown, label: string): asserts value is string {
  text(value, label, false);
  if (
    value.length > 32 ||
    (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(value) &&
      !/^(black|white|red|green|blue|transparent)$/i.test(value))
  )
    throw new Error(`${label}无效`);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error(`${label}无效`);
  return value as Record<string, unknown>;
}
function cue(project: Project, id: string, editable = true): Clip {
  const clip = project.clips.find((c) => c.id === id);
  const track = project.tracks.find((t) => t.id === clip?.trackId);
  if (!clip?.text || track?.kind !== "text")
    throw new Error("所选字幕不存在或不是文字片段");
  if (editable && track.locked)
    throw new Error(`轨道“${track.name}”已锁定，请先解锁`);
  return clip;
}

const STYLE_KEYS = new Set([
  "fontFamily",
  "fontSize",
  "color",
  "background",
  "align",
  "bold",
  "stroke",
  "strokeWidth",
  "lineHeight",
  "padding",
  "radius",
  "shadow",
]);

/** Validate an editable subset of TextStyle; content is never accepted here. */
export function subtitleStylePatch(value: unknown): SubtitleStylePatch {
  const raw = record(value, "字幕样式");
  const result: SubtitleStylePatch = {};
  for (const key of Object.keys(raw)) {
    if (!STYLE_KEYS.has(key)) throw new Error(`不支持的字幕样式字段“${key}”`);
    const next = raw[key];
    if (next === undefined) continue;
    switch (key) {
      case "fontFamily":
        text(next, "字幕字体", false);
        if (next.length > 256) throw new Error("字幕字体无效");
        result.fontFamily = next;
        break;
      case "fontSize":
        range(next, "字幕字号", 1, 1000);
        result.fontSize = next;
        break;
      case "color":
        color(next, "字幕文字颜色");
        result.color = next;
        break;
      case "background":
        color(next, "字幕背景颜色");
        result.background = next;
        break;
      case "align":
        if (next !== "left" && next !== "center" && next !== "right")
          throw new Error("字幕对齐无效");
        result.align = next;
        break;
      case "bold":
        if (typeof next !== "boolean") throw new Error("字幕粗体设置无效");
        result.bold = next;
        break;
      case "stroke":
        color(next, "字幕描边颜色");
        result.stroke = next;
        break;
      case "strokeWidth":
        range(next, "字幕描边宽度", 0, 100);
        result.strokeWidth = next;
        break;
      case "lineHeight":
        range(next, "字幕行高", 0.8, 3);
        result.lineHeight = next;
        break;
      case "padding":
        range(next, "字幕内边距", 0, 1.5);
        result.padding = next;
        break;
      case "radius":
        range(next, "字幕圆角", 0, 2);
        result.radius = next;
        break;
      case "shadow": {
        if (next === null) {
          result.shadow = undefined;
          break;
        }
        const shadow = record(next, "字幕阴影");
        color(shadow.color, "字幕阴影颜色");
        range(shadow.blur, "字幕阴影模糊", 0, 200);
        range(shadow.offsetX, "字幕阴影偏移 X", -200, 200);
        range(shadow.offsetY, "字幕阴影偏移 Y", -200, 200);
        result.shadow = {
          color: shadow.color,
          blur: shadow.blur,
          offsetX: shadow.offsetX,
          offsetY: shadow.offsetY,
        };
        break;
      }
    }
  }
  return result;
}

function referenceStyle(reference: Clip): SubtitleStylePatch {
  const { text: _content, ...style } = reference.text!;
  return clone(style);
}

const sentenceBreak = /[。！？!?；;，,、：:]/;

/**
 * Split text proportionally to the selected time. A sentence punctuation mark,
 * newline or whitespace near the proportional character position wins; if none
 * is available, the code-point position is used. Outer whitespace is trimmed.
 */
export function splitSubtitleText(
  value: string,
  ratio: number,
): [string, string] {
  const chars = Array.from(value);
  if (chars.length < 2) throw new Error("字幕文本太短，无法拆分");
  const target = Math.max(
    1,
    Math.min(chars.length - 1, Math.round(chars.length * Math.max(0, Math.min(1, ratio)))),
  );
  const window = Math.max(1, Math.floor(chars.length * 0.2));
  let cut = target;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < chars.length; index++) {
    const distance = Math.abs(index - target);
    if (distance > window || distance >= best) continue;
    const before = chars[index - 1];
    const after = chars[index];
    const candidate =
      before === "\n" ||
      sentenceBreak.test(before) ||
      /\s/.test(before) ||
      /\s/.test(after);
    if (!candidate) continue;
    if (!chars.slice(0, index).join("").trim()) continue;
    if (!chars.slice(index).join("").trim()) continue;
    cut = index;
    best = distance;
  }
  let left = chars.slice(0, cut).join("").trim();
  let right = chars.slice(cut).join("").trim();
  if (!left || !right) {
    cut = target;
    left = chars.slice(0, cut).join("").trim();
    right = chars.slice(cut).join("").trim();
  }
  if (!left || !right) throw new Error("字幕文本太短，无法拆分为两条");
  return [left, right];
}

/** Prepare on a clone. Overlapping cues are legal; none of the targets may fail silently. */
export function prepareSubtitleEdit(
  input: Project,
  ids: readonly string[],
  edit: SubtitleEdit,
): SubtitleEditPlan {
  let project = validateProject(clone(input));
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 10000 ||
    new Set(ids).size !== ids.length
  )
    throw new Error("请选择不重复的字幕");
  const originals = ids.map((id) => cue(project, id));
  if (new Set(originals.map((c) => c.trackId)).size !== 1)
    throw new Error("每次批量操作只能修改一个字幕轨道");
  if (!edit || typeof edit !== "object") throw new Error("字幕操作无效");
  let structuralIds: string[] | undefined;

  if (edit.type === "cue") {
    if (ids.length !== 1) throw new Error("逐条编辑只能选择一条字幕");
    text(edit.text, "字幕内容");
    finite(edit.start, "开始时间");
    finite(edit.end, "结束时间");
    if (edit.start < 0 || edit.end > 86400 || edit.end <= edit.start)
      throw new Error("字幕时间须在 0～86400 秒内，结束时间须晚于开始时间");
    const start = snapToFrame(edit.start, project.fps),
      end = snapToFrame(edit.end, project.fps);
    if (end - start < 1 / project.fps - 1e-9)
      throw new Error("字幕时长至少为一帧");
    const original = originals[0];
    const originalEnd = original.start + original.duration;
    if (
      Math.abs(end - start - original.duration) < 1e-9 ||
      start >= originalEnd ||
      end <= original.start
    ) {
      // A translated or disjoint cue is a move, not a crop of its old absolute envelope.
      // Keep its local animation/fades so moving an animated caption does not make it disappear.
      original.start = start;
      project = trimClip(project, original.id, "end", end);
    } else {
      if (end > originalEnd)
        project = trimClip(project, original.id, "end", end);
      if (start < original.start)
        project = trimClip(project, original.id, "start", start);
      project = trimClip(project, original.id, "start", start);
      project = trimClip(project, original.id, "end", end);
    }
    const next = cue(project, original.id);
    if (
      Math.abs(next.start - start) > 1e-8 ||
      Math.abs(next.start + next.duration - end) > 1e-8
    )
      throw new Error("无法应用所选字幕时间");
    next.text!.text = edit.text;
    next.name = edit.text.slice(0, 4096);
  } else if (edit.type === "offset") {
    finite(edit.seconds, "偏移量");
    if (Math.abs(edit.seconds) > 86400) throw new Error("偏移量超出范围");
    const delta = snapToFrame(edit.seconds, project.fps);
    for (const clip of originals) {
      const start = snapToFrame(clip.start + delta, project.fps);
      if (start < 0 || start + clip.duration > 86400)
        throw new Error("偏移后字幕超出时间线范围，未修改任何字幕");
      clip.start = start;
    }
  } else if (edit.type === "replace") {
    text(edit.find, "查找内容", false);
    text(edit.replacement, "替换内容");
    for (const clip of originals) {
      const pieces = clip.text!.text.split(edit.find);
      const size =
        clip.text!.text.length +
        (pieces.length - 1) * (edit.replacement.length - edit.find.length);
      if (size > 20000)
        throw new Error("替换后的字幕内容无效（最多 20000 字）");
      const value = pieces.join(edit.replacement);
      text(value, "替换后的字幕内容");
      clip.text!.text = value;
      clip.name = value.slice(0, 4096);
    }
  } else if (edit.type === "style") {
    const patch =
      edit.patch === undefined ? {} : subtitleStylePatch(edit.patch);
    let reference: SubtitleStylePatch | undefined;
    if (edit.referenceId !== undefined && edit.referenceId !== "")
      reference = referenceStyle(cue(project, edit.referenceId, false));
    if (!reference && !Object.keys(patch).length)
      throw new Error("请选择参考字幕，或直接编辑一项字幕样式");
    for (const clip of originals)
      clip.text = {
        ...clip.text!,
        ...(reference ? clone(reference) : {}),
        ...clone(patch),
      };
  } else if (edit.type === "split") {
    if (ids.length !== 1) throw new Error("拆分只能选择一条字幕");
    finite(edit.at, "播放头时间");
    const original = originals[0];
    const at = snapToFrame(edit.at, project.fps);
    const minimum = 1 / project.fps;
    const local = at - original.start;
    if (local < minimum - 1e-9 || original.duration - local < minimum - 1e-9)
      throw new Error("播放头必须位于所选字幕内部，且两侧各留出至少一帧");
    const before = new Set(project.clips.map((clip) => clip.id));
    project = splitClip(project, original.id, at);
    const left = project.clips.find((clip) => clip.id === original.id);
    const right = project.clips.find(
      (clip) => !before.has(clip.id) && clip.trackId === original.trackId,
    );
    if (!left?.text || !right?.text) throw new Error("无法拆分所选字幕");
    const [leftText, rightText] = splitSubtitleText(
      original.text!.text,
      local / original.duration,
    );
    left.text.text = leftText;
    left.name = leftText.slice(0, 4096);
    right.text.text = rightText;
    right.name = rightText.slice(0, 4096);
    structuralIds = [left.id, right.id];
  } else if (edit.type === "merge") {
    if (ids.length < 2) throw new Error("请选择至少两条字幕再合并");
    const sorted = [...originals].sort(
      (a, b) => a.start - b.start || a.id.localeCompare(b.id),
    );
    const track = project.tracks.find((item) => item.id === sorted[0].trackId)!;
    const trackClips = project.clips
      .filter((clip) => clip.trackId === track.id && clip.text)
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const positions = new Map(trackClips.map((clip, index) => [clip.id, index]));
    for (let index = 1; index < sorted.length; index++) {
      if (positions.get(sorted[index].id) !== positions.get(sorted[index - 1].id)! + 1)
        throw new Error("只能合并轨道上连续相邻的字幕");
      const previous = sorted[index - 1];
      if (sorted[index].start > previous.start + previous.duration + 1e-9)
        throw new Error("只能合并相接或时间重叠的字幕，请先补合间隙");
    }
    const start = sorted[0].start;
    const end = Math.max(
      ...sorted.map((clip) => clip.start + clip.duration),
    );
    if (end - start < 1 / project.fps - 1e-9)
      throw new Error("合并后的字幕时长至少为一帧");
    const keep = sorted[0];
    const merged = sorted
      .map((clip) => clip.text!.text.trim())
      .join("\n");
    if (merged.length > 20000)
      throw new Error("合并后的字幕内容无效（最多 20000 字）");
    keep.start = start;
    keep.duration = end - start;
    keep.text!.text = merged;
    keep.name = merged.slice(0, 4096);
    // A merged cue spans a new envelope. Let the earliest cue's fade values
    // apply to that full envelope instead of leaving a cut window that would
    // make the rest of the merged cue transparent.
    delete keep.videoFadeWindow;
    delete keep.audioFadeWindow;
    keep.keyframes = keep.keyframes.filter(
      (key) => key.time <= keep.duration + 1e-9,
    );
    project.clips = project.clips.filter(
      (clip) => clip.id === keep.id || !ids.includes(clip.id),
    );
    structuralIds = sorted.map((clip) => clip.id);
  } else if (edit.type === "animation") {
    const animation = validateTextAnimation(edit.animation);
    for (const clip of originals) {
      delete clip.videoFadeWindow;
      delete clip.audioFadeWindow;
      Object.assign(clip, textAnimationPatch(clip, animation, project));
    }
  } else throw new Error("不支持的字幕操作");

  project = validateProject(project);
  return {
    base: JSON.stringify(input),
    project,
    changedIds:
      structuralIds ??
      ids.filter(
        (id) =>
          JSON.stringify(input.clips.find((c) => c.id === id)) !==
          JSON.stringify(project.clips.find((c) => c.id === id)),
      ),
  };
}

/** A user can keep an edit form open while the project changes elsewhere. Never overwrite it. */
export function applySubtitleEdit(
  current: Project,
  plan: SubtitleEditPlan,
): Project {
  if (JSON.stringify(current) !== plan.base)
    throw new Error("项目已变化，请重新检查字幕修改后再应用");
  return validateProject(clone(plan.project));
}
