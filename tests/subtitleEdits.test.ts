import { beforeEach, describe, expect, it } from "vitest";
import { applySubtitleEdit, prepareSubtitleEdit, type SubtitleEdit } from "../src/core/subtitleEdits";
import { clone, createClip, createProject, createTrack, evaluateFade, evaluateKeyframes, id, snapToFrame, validateProject } from "../src/core/model";
import { useEditorStore } from "../src/editor/store";

function fixture() {
  const p = createProject("字幕合成验收");
  p.tracks[0].name = "字幕";
  const titleTrack = createTrack("text", "片头标题");
  p.tracks.push(titleTrack);
  p.clips = [2, 6, 9].map((start, index) => {
    const c = createClip(undefined, p.tracks[0].id, start, p.fps);
    c.id = `cue-${index}`; c.duration = 3; c.text!.text = `字幕 ${index} [a].* $&`;
    c.name = c.text!.text;
    return c;
  });
  const title = createClip(undefined, titleTrack.id, 0, p.fps);
  title.id = "title"; title.text!.text = "保留标题"; p.clips.push(title);
  return p;
}
beforeEach(() => useEditorStore.getState().setProject(createProject()));

describe("subtitle batch edit workflow", () => {
  it("offsets only selected cues in frame increments and preserves all local animation", () => {
    const p = fixture(); p.clips[0].fadeIn = 1;
    p.clips[0].keyframes = [{ id: id(), property: "x", time: 1, value: 120, easing: "linear" }];
    const plan = prepareSubtitleEdit(p, ["cue-0", "cue-2"], { type: "offset", seconds: .049 });
    expect(plan.project.clips[0].start).toBeCloseTo(2 + 1 / 30, 10);
    expect(plan.project.clips[2].start).toBeCloseTo(9 + 1 / 30, 10);
    expect(plan.project.clips[1]).toEqual(p.clips[1]); expect(plan.project.clips[3]).toEqual(p.clips[3]);
    expect({ ...plan.project.clips[0], start: 2 }).toEqual(p.clips[0]);
    expect(plan.changedIds).toEqual(["cue-0", "cue-2"]);
  });
  it("fails the entire batch if any cue would go before zero or beyond 24 hours", () => {
    const p = fixture(), before = clone(p);
    expect(() => prepareSubtitleEdit(p, ["cue-2", "cue-0"], { type: "offset", seconds: -3 })).toThrow("未修改任何字幕");
    expect(() => prepareSubtitleEdit(p, ["cue-0", "cue-2"], { type: "offset", seconds: 86390 })).toThrow("范围");
    expect(p).toEqual(before);
  });
  it("permits overlapping cues and frame-aligns nonzero absolute start/end edits", () => {
    const p = fixture();
    const c = prepareSubtitleEdit(p, ["cue-0"], { type: "cue", text: "新字幕", start: 6.017, end: 8.081 }).project.clips[0];
    expect(c.start).toBeCloseTo(6 + 1 / 30, 10); expect(c.start + c.duration).toBeCloseTo(8 + 2 / 30, 10);
    expect(c.text!.text).toBe("新字幕"); expect(c.name).toBe("新字幕");
  });
  it.each([[0, 1], [20, 21], [3, 4], [1, 6]])("retimes a complete cue window %s–%s without clamping a disjoint move", (start, end) => {
    const plan = prepareSubtitleEdit(fixture(), ["cue-0"], { type: "cue", text: "时序", start, end });
    expect(plan.project.clips[0].start).toBe(start); expect(plan.project.clips[0].duration).toBe(end - start);
  });
  it("accepts exactly one frame with floating-point timing", () => {
    const plan = prepareSubtitleEdit(fixture(), ["cue-0"], { type: "cue", text: "一帧", start: 7, end: 7 + 1 / 30 });
    expect(plan.project.clips[0].duration).toBeCloseTo(1 / 30, 10);
  });
  it("moves the local envelope with translated and disjoint cues instead of fading them out permanently", () => {
    const p = fixture(), c = p.clips[0]; c.fadeIn = 1; c.fadeOut = 1;
    c.keyframes = [{ id: id(), time: 0, property: "x", value: 0, easing: "linear" }, { id: id(), time: 3, property: "x", value: 300, easing: "linear" }];
    for (const [start, end] of [[3, 6], [20, 23], [20, 22]]) {
      const after = prepareSubtitleEdit(p, [c.id], { type: "cue", text: c.text!.text, start, end }).project.clips[0];
      for (let t = 0; t <= end - start; t += .25) {
        expect(evaluateFade(after, t, "video")).toBeCloseTo(evaluateFade(c, t, "video"), 8);
        expect(evaluateKeyframes(after, t).transform.x).toBeCloseTo(evaluateKeyframes(c, t).transform.x, 8);
      }
    }
  });
  it("preserves animation curves and video/audio fade envelopes inside a cropped cue", () => {
    const p = fixture(), c = p.clips[0]; c.duration = 8;
    c.fadeIn = 3; c.fadeOut = 3; c.audioFadeIn = 2; c.audioFadeOut = 2;
    c.keyframes = [{ id: id(), time: 0, property: "x", value: -200, easing: "linear" }, { id: id(), time: 8, property: "x", value: 600, easing: "easeInOut" }];
    const after = prepareSubtitleEdit(p, [c.id], { type: "cue", text: c.text!.text, start: 4, end: 8 }).project.clips[0];
    for (let t = 0; t <= 4; t += .125) {
      expect(evaluateKeyframes(after, t).transform.x).toBeCloseTo(evaluateKeyframes(c, t + 2).transform.x, 7);
      for (const kind of ["video", "audio"] as const) expect(evaluateFade(after, t, kind)).toBeCloseTo(evaluateFade(c, t + 2, kind), 8);
    }
  });
  it("finds and replaces literal punctuation and preserves dollar replacement text", () => {
    const p = fixture();
    const plan = prepareSubtitleEdit(p, ["cue-0", "cue-1"], { type: "replace", find: "[a].*", replacement: "$&$1" });
    expect(plan.project.clips[0].text!.text).toBe("字幕 0 $&$1 $&");
    expect(plan.project.clips[1].text!.text).toBe("字幕 1 $&$1 $&");
    expect(plan.project.clips[2]).toEqual(p.clips[2]);
  });
  it("allows empty replacement and reports an empty changed set for unmatched text", () => {
    const p = fixture();
    expect(prepareSubtitleEdit(p, ["cue-0"], { type: "replace", find: "字幕 ", replacement: "" }).project.clips[0].text!.text).toBe("0 [a].* $&");
    expect(prepareSubtitleEdit(p, ["cue-0"], { type: "replace", find: "不存在", replacement: "新" }).changedIds).toEqual([]);
  });
  it("copies only text style, preserving every target's content, transforms, timing and keyframes", () => {
    const p = fixture(); p.clips[0].text!.fontSize = 99; p.clips[0].text!.color = "#112233";
    p.clips[1].transform.x = 230; p.clips[1].keyframes = [{ id: id(), time: 1, property: "opacity", value: .5, easing: "linear" }];
    const plan = prepareSubtitleEdit(p, ["cue-1", "cue-2"], { type: "style", referenceId: "cue-0" });
    for (const i of [1, 2]) {
      expect(plan.project.clips[i].text).toEqual({ ...p.clips[0].text!, text: p.clips[i].text!.text });
      expect({ ...plan.project.clips[i], text: p.clips[i].text }).toEqual(p.clips[i]);
    }
    expect(prepareSubtitleEdit(p, ["cue-0", "cue-1", "cue-2"], { type: "style", referenceId: "cue-0" }).changedIds).toEqual(["cue-1", "cue-2"]);
  });
  it("does not modify locked target tracks, including text-only edits", () => {
    const p = fixture(); p.tracks[0].locked = true;
    const edits: SubtitleEdit[] = [{ type: "offset", seconds: 1 }, { type: "replace", find: "字幕", replacement: "修改" }, { type: "style", referenceId: "title" }, { type: "cue", text: "修改", start: 2, end: 4 }];
    for (const edit of edits) expect(() => prepareSubtitleEdit(p, ["cue-0"], edit)).toThrow("锁定");
  });
  it("rejects stale plans after edits or project switches and detaches committed data", () => {
    const p = fixture(), plan = prepareSubtitleEdit(p, ["cue-0"], { type: "offset", seconds: 1 });
    const changed = clone(p); changed.name = "别的编辑";
    expect(() => applySubtitleEdit(changed, plan)).toThrow("项目已变化");
    const another = clone(p); another.id = id(); expect(() => applySubtitleEdit(another, plan)).toThrow("项目已变化");
    const applied = applySubtitleEdit(p, plan); applied.clips[0].start = 25; expect(plan.project.clips[0].start).toBe(3);
  });
  it("commits multiple replacements as one undo/redo and leaves unrelated titles intact", () => {
    useEditorStore.getState().setProject(fixture()); const before = clone(useEditorStore.getState().project);
    const plan = prepareSubtitleEdit(before, ["cue-0", "cue-1", "cue-2"], { type: "replace", find: "字幕", replacement: "台词" });
    useEditorStore.getState().commit(applySubtitleEdit(useEditorStore.getState().project, plan));
    expect(useEditorStore.getState().past).toHaveLength(1); expect(useEditorStore.getState().project.clips[3]).toEqual(before.clips[3]);
    useEditorStore.getState().undo(); expect(useEditorStore.getState().project).toEqual(before);
    useEditorStore.getState().redo(); expect(useEditorStore.getState().project.clips[0].text!.text).toContain("台词");
  });
  it.each<SubtitleEdit>([
    { type: "offset", seconds: NaN }, { type: "offset", seconds: Infinity }, { type: "offset", seconds: 100000 },
    { type: "cue", text: "无效", start: -1, end: 2 }, { type: "cue", text: "无效", start: 2, end: 2.001 },
    { type: "cue", text: "无效", start: NaN, end: 3 }, { type: "cue", text: "无效", start: 4, end: 3 },
    { type: "cue", text: "无效", start: 86400, end: 86401 }, { type: "replace", find: "", replacement: "a" },
    { type: "replace", find: "字幕", replacement: "\0" }, { type: "style", referenceId: "missing" },
  ])("rejects invalid data %# without mutating the input", edit => {
    const p = fixture(), snapshot = clone(p); expect(() => prepareSubtitleEdit(p, ["cue-0"], edit)).toThrow(); expect(p).toEqual(snapshot);
  });
  it("rejects a batch spanning tracks, duplicate/missing targets and replacement overflow", () => {
    const p = fixture();
    for (const ids of [[], ["cue-0", "cue-0"], ["cue-0", "title"], ["cue-0", "missing"]]) expect(() => prepareSubtitleEdit(p, ids, { type: "offset", seconds: 1 })).toThrow();
    p.clips[0].text!.text = "a".repeat(20000); validateProject(p);
    expect(() => prepareSubtitleEdit(p, ["cue-0"], { type: "replace", find: "a", replacement: "aa" })).toThrow("20000");
  });
});

describe("subtitle split and merge", () => {
  it("splits one cue at the frame-aligned playhead and divides text at a nearby sentence break", () => {
    const p = fixture(), cue = p.clips[0];
    cue.start = 2; cue.duration = 4; cue.text!.text = "第一句。第二句"; cue.name = cue.text!.text;
    const splitAt = snapToFrame(4.017, p.fps);
    const plan = prepareSubtitleEdit(p, ["cue-0"], { type: "split", at: 4.017 });
    const cues = plan.project.clips.filter(c => c.trackId === p.tracks[0].id).sort((a, b) => a.start - b.start);
    expect(cues).toHaveLength(4);
    expect(cues[0]).toMatchObject({ id: "cue-0", start: 2, duration: splitAt - 2 });
    expect(cues[0].text!.text).toBe("第一句。");
    expect(cues[1].start).toBe(splitAt); expect(cues[1].duration).toBe(6 - splitAt);
    expect(cues[1].text!.text).toBe("第二句");
    expect(cues[1].text).toEqual({ ...cues[0].text!, text: "第二句" });
    expect(plan.changedIds).toEqual(["cue-0", cues[1].id]);
    expect(plan.project.clips.find(c => c.id === "title")).toEqual(p.clips[3]);
  });
  it("keeps at least one frame on each side of a split and refuses boundaries or locked tracks", () => {
    const p = fixture(), before = clone(p);
    for (const at of [2, 2 + 1 / 120, 5, 5 - 1 / 120])
      expect(() => prepareSubtitleEdit(p, ["cue-0"], { type: "split", at })).toThrow("至少");
    expect(p).toEqual(before);
    p.tracks[0].locked = true;
    expect(() => prepareSubtitleEdit(p, ["cue-0"], { type: "split", at: 3.5 })).toThrow("锁定");
    expect(() => prepareSubtitleEdit(fixture(), ["cue-0", "cue-1"], { type: "split", at: 3.5 })).toThrow("一条");
  });
  it("merges only a contiguous adjacent/overlapping run and joins text with a newline", () => {
    const p = fixture();
    p.clips[1].text!.text = "English first line"; p.clips[1].name = p.clips[1].text!.text;
    p.clips[2].text!.text = "第二句中文字幕"; p.clips[2].name = p.clips[2].text!.text;
    p.clips[2].start = 8.5; // overlapping with cue-1, still adjacent in track order
    const plan = prepareSubtitleEdit(p, ["cue-2", "cue-1"], { type: "merge" });
    const merged = plan.project.clips.find(c => c.id === "cue-1")!;
    expect(merged).toMatchObject({ start: 6, duration: 5.5 });
    expect(merged.text!.text).toBe("English first line\n第二句中文字幕");
    expect(plan.project.clips.some(c => c.id === "cue-2")).toBe(false);
    expect(plan.project.clips.find(c => c.id === "cue-0")).toEqual(p.clips[0]);
    expect(plan.project.clips.find(c => c.id === "title")).toEqual(p.clips[3]);
    expect(plan.changedIds).toEqual(["cue-1", "cue-2"]);
  });
  it("refuses gaps, non-consecutive selections and unselected cues between targets", () => {
    const p = fixture();
    p.clips[2].start = 9.5;
    expect(() => prepareSubtitleEdit(p, ["cue-1", "cue-2"], { type: "merge" })).toThrow("相接");
    expect(() => prepareSubtitleEdit(fixture(), ["cue-0", "cue-2"], { type: "merge" })).toThrow("连续");
    expect(() => prepareSubtitleEdit(fixture(), ["cue-0"], { type: "merge" })).toThrow("至少");
  });
  it("commits a split and merge as one undo step across the title and source cues", () => {
    const p = fixture(); useEditorStore.getState().setProject(p);
    const before = clone(p);
    const split = prepareSubtitleEdit(p, ["cue-0"], { type: "split", at: 3.5 });
    useEditorStore.getState().commit(applySubtitleEdit(useEditorStore.getState().project, split));
    const right = split.changedIds.find(id => id !== "cue-0")!;
    const merged = prepareSubtitleEdit(useEditorStore.getState().project, ["cue-0", right], { type: "merge" });
    useEditorStore.getState().commit(applySubtitleEdit(useEditorStore.getState().project, merged));
    expect(useEditorStore.getState().past).toHaveLength(2);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project.clips.filter(c => c.trackId === p.tracks[0].id)).toHaveLength(4);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(before);
  });
});

describe("editable subtitle styles and uniform text animation", () => {
  it("applies only validated editable style fields and preserves content, transforms, timing and titles", () => {
    const p = fixture();
    p.clips[1].transform.x = 230;
    p.clips[1].keyframes = [{ id: id(), time: 1, property: "opacity", value: .5, easing: "linear" }];
    const plan = prepareSubtitleEdit(p, ["cue-1", "cue-2"], {
      type: "style",
      patch: { fontSize: 80, color: "#abcdef", bold: false, align: "right", strokeWidth: 0 },
    });
    for (const index of [1, 2]) {
      expect(plan.project.clips[index].text).toMatchObject({
        text: p.clips[index].text!.text,
        fontSize: 80, color: "#abcdef", bold: false, align: "right", strokeWidth: 0,
      });
      expect(plan.project.clips[index].start).toBe(p.clips[index].start);
      expect(plan.project.clips[index].duration).toBe(p.clips[index].duration);
    }
    expect(plan.project.clips[1].transform.x).toBe(230);
    expect(plan.project.clips[1].keyframes).toEqual(p.clips[1].keyframes);
    expect(plan.project.clips[3]).toEqual(p.clips[3]);
  });
  it("can combine a reference style with an editable override and rejects unsupported fields", () => {
    const p = fixture(); p.clips[0].text!.fontSize = 99;
    const plan = prepareSubtitleEdit(p, ["cue-1"], { type: "style", referenceId: "cue-0", patch: { color: "#123456" } });
    expect(plan.project.clips[1].text!.fontSize).toBe(99);
    expect(plan.project.clips[1].text!.color).toBe("#123456");
    for (const patch of [{ text: "x" }, { fontSize: 0 }, { color: "not-a-color" }, { lineHeight: 9 }] as any[])
      expect(() => prepareSubtitleEdit(p, ["cue-1"], { type: "style", patch })).toThrow();
    expect(() => prepareSubtitleEdit(p, ["cue-1"], { type: "style" })).toThrow("参考");
  });
  it("applies the same entrance, hold and exit to every selected cue using preview/export fades and keyframes", () => {
    const p = fixture();
    const animation = { entrance: "slideUp", hold: "pulse", exit: "fade", inDuration: .4, outDuration: .4 } as const;
    const plan = prepareSubtitleEdit(p, ["cue-0", "cue-1"], { type: "animation", animation });
    for (const index of [0, 1]) {
      const clip = plan.project.clips[index], baseY = p.clips[index].transform.y;
      expect(clip.fadeIn).toBeCloseTo(.4, 10);
      expect(clip.fadeOut).toBeCloseTo(.4, 10);
      expect(clip.keyframes.some(k => k.property === "y")).toBe(true);
      expect(clip.keyframes.some(k => k.property === "scale" && k.value > p.clips[index].transform.scale)).toBe(true);
      expect(evaluateFade(clip, 0, "video")).toBe(0);
      expect(evaluateFade(clip, .2, "video")).toBeCloseTo(.5, 10);
      expect(evaluateFade(clip, .4, "video")).toBeCloseTo(1, 10);
      expect(evaluateFade(clip, clip.duration / 2, "video")).toBe(1);
      expect(evaluateFade(clip, clip.duration - .2, "video")).toBeCloseTo(.5, 10);
      expect(evaluateFade(clip, clip.duration, "video")).toBe(0);
      expect(evaluateKeyframes(clip, 0).transform.y).toBeGreaterThan(baseY);
      expect(evaluateKeyframes(clip, .4).transform.y).toBeCloseTo(baseY, 10);
      expect(evaluateKeyframes(clip, clip.duration / 2).transform.scale).toBeGreaterThan(p.clips[index].transform.scale);
    }
    expect(plan.project.clips[2]).toEqual(p.clips[2]);
    expect(plan.project.clips[3]).toEqual(p.clips[3]);
  });
  it("replaces old visual animation, keeps rotation, and shortens the requested motion on short cues", () => {
    const p = fixture(); p.clips[0].duration = 1 / 15;
    p.clips[0].keyframes = [
      { id: id(), time: 0, property: "x", value: 1, easing: "linear" },
      { id: id(), time: .05, property: "rotation", value: 4, easing: "linear" },
    ];
    const plan = prepareSubtitleEdit(p, ["cue-0"], {
      type: "animation",
      animation: { entrance: "scale", hold: "none", exit: "scale", inDuration: 2, outDuration: 2 },
    });
    const clip = plan.project.clips[0];
    expect(clip.fadeIn).toBeCloseTo(.0333333333, 6);
    expect(clip.fadeOut).toBeCloseTo(.0333333333, 6);
    expect(clip.keyframes.every(k => k.property !== "x" && k.time <= clip.duration + 1e-9)).toBe(true);
    expect(clip.keyframes.find(k => k.property === "rotation")?.value).toBe(4);
  });
  it("rejects invalid animation settings without changing the source project", () => {
    const p = fixture(), before = clone(p);
    for (const animation of [
      { entrance: "bounce", hold: "none", exit: "fade", inDuration: .3, outDuration: .3 },
      { entrance: "fade", hold: "pulse", exit: "fade", inDuration: NaN, outDuration: .3 },
      { entrance: "fade", hold: "none", exit: "fade", inDuration: .3, outDuration: 99 },
    ])
      expect(() => prepareSubtitleEdit(p, ["cue-0"], { type: "animation", animation } as any)).toThrow();
    expect(p).toEqual(before);
    p.clips[0].duration = 1 / 60;
    expect(() => prepareSubtitleEdit(p, ["cue-0"], { type: "animation", animation: { entrance: "fade", hold: "none", exit: "none", inDuration: .3, outDuration: 0 } })).toThrow("两帧");
  });
});
