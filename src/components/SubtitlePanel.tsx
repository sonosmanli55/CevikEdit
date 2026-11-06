import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FolderOpen, LockKeyhole, Mic, Search, Subtitles } from "lucide-react";
import { useEditorStore } from "../editor/store";
import { clone, snapToFrame } from "../core/model";
import { applySubtitleEdit, prepareSubtitleEdit, type SubtitleEdit, type SubtitleEditPlan, type SubtitleStylePatch } from "../core/subtitleEdits";
import type { Clip, Project, TranscriptionStage, TranscriptionStatus } from "../core/types";
import "./SubtitlePanel.css";

interface Props { onImport: () => void | Promise<void>; onExport: () => void | Promise<void> }
interface CueDraft { project: Project; id: string; text: string; start: string; end: string }
const seconds = (value: number) => Number(value.toFixed(6)).toString();
const timeLabel = (value: number) => `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toFixed(2).padStart(5, "0")}`;
const ipcMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = "Error invoking remote method ";
  if (!message.startsWith(prefix)) return message;
  const separator = message.indexOf(": ");
  if (separator < 0) return message;
  const detail = message.slice(separator + 2);
  return detail.startsWith("Error: ") ? detail.slice(7) : detail;
};
const TRANSCRIPTION_LANGUAGES = [
  ["auto", "自动检测"],
  ["tr", "土耳其语"],
  ["en", "英语"],
  ["de", "德语"],
  ["fr", "法语"],
  ["es", "西班牙语"],
  ["ar", "阿拉伯语"],
  ["ru", "俄语"],
] as const;
const TRANSCRIPTION_STAGE: Record<TranscriptionStage, string> = {
  preparing: "正在准备…",
  extracting: "正在提取音频…",
  transcribing: "正在识别语音…",
  parsing: "正在整理字幕…",
  complete: "完成",
};
const DEFAULT_STYLE_DRAFT: SubtitleStylePatch = {
  fontFamily: "Noto Sans SC",
  fontSize: 64,
  color: "#ffffff",
  background: "transparent",
  align: "center",
  bold: true,
  stroke: "#000000",
  strokeWidth: 2,
  lineHeight: 1.3,
  padding: 0.25,
  radius: 0,
};
const styleFromClip = (clip: Clip): SubtitleStylePatch => {
  const { text: _content, ...style } = clip.text!;
  return clone(style);
};
const ANIMATION_ENTRANCES = [["none", "无"], ["fade", "淡入"], ["slideUp", "上滑"], ["scale", "缩放"]] as const;
const ANIMATION_HOLDS = [["none", "静止"], ["pulse", "呼吸"]] as const;
const ANIMATION_EXITS = [["none", "无"], ["fade", "淡出"], ["slideDown", "下滑"], ["scale", "缩放"]] as const;
const SPLIT_HINT = "拆分按项目帧对齐播放头，左段为 [开始, 播放头)，右段为 [播放头, 结束)，两侧至少各留一帧；文本按字符比例并优先在附近标点或空白处切开。";
const MERGE_HINT = "合并只处理同轨连续且相接或重叠的字幕：时间取最早开始至最晚结束，文本以换行拼接，样式和局部动画沿用最早一条。";
type SubtitleMode = "splitMerge" | "offset" | "replace" | "style" | "animation";

export default function SubtitlePanel({ onImport, onExport }: Props) {
  const project = useEditorStore(s => s.project);
  const [trackId, setTrackId] = useState("");
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [draft, setDraft] = useState<CueDraft | null>(null);
  const [mode, setMode] = useState<SubtitleMode>("offset");
  const [offset, setOffset] = useState("0");
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [styleDraft, setStyleDraft] = useState<SubtitleStylePatch>({ ...DEFAULT_STYLE_DRAFT });
  const [styleDirty, setStyleDirty] = useState(false);
  const [fonts, setFonts] = useState<string[]>(["Noto Sans SC", "sans-serif", "PingFang SC", "Arial", "Georgia"]);
  const [animation, setAnimation] = useState({
    entrance: "fade" as (typeof ANIMATION_ENTRANCES)[number][0],
    hold: "none" as (typeof ANIMATION_HOLDS)[number][0],
    exit: "fade" as (typeof ANIMATION_EXITS)[number][0],
    inDuration: "0.3",
    outDuration: "0.3",
  });
  const [plan, setPlan] = useState<SubtitleEditPlan | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [transcription, setTranscription] = useState<TranscriptionStatus | null>(null);
  const [language, setLanguage] = useState("auto");
  const [modelPath, setModelPath] = useState("");
  const [transcriptionJob, setTranscriptionJob] = useState<{ id: string; progress: number; stage: TranscriptionStage } | null>(null);
  const [transcriptionError, setTranscriptionError] = useState("");
  const [transcriptionNotice, setTranscriptionNotice] = useState("");
  const transcriptionJobId = useRef<string | null>(null);
  const selectedIds = useEditorStore(s => s.selectedIds);
  const playhead = useEditorStore(s => s.playhead);
  const api = window.editorAPI;
  const feedback = useRef<HTMLParagraphElement>(null);
  const knownTracks = useRef(new Set(project.tracks.map(t => t.id)));
  const tracks = project.tracks.filter(t => t.kind === "text");
  const activeTrack = tracks.find(t => t.id === trackId);
  const clips = useMemo(() => project.clips.filter(c => c.trackId === trackId && c.text).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)), [project, trackId]);
  const sourceClip = useMemo(() => {
    const usable = (clip: Clip) => {
      const asset = project.assets.find(a => a.id === clip.assetId);
      return !!asset && (asset.kind === "audio" || asset.kind === "video") && asset.hasAudio !== false;
    };
    const selected = selectedIds
      .map(id => project.clips.find(clip => clip.id === id))
      .find((clip): clip is Clip => !!clip && usable(clip));
    return selected ?? project.clips.find(clip => usable(clip) && playhead >= clip.start && playhead < clip.start + clip.duration) ?? null;
  }, [project, selectedIds, playhead]);
  const sourceAsset = sourceClip ? project.assets.find(a => a.id === sourceClip.assetId) : undefined;
  const visible = clips.filter(c => c.text!.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selected = checked.filter(id => clips.some(c => c.id === id));
  const locked = !!activeTrack?.locked;
  const stale = !!plan && plan.base !== JSON.stringify(project);
  const splitCue = selected.length === 1 ? clips.find(c => c.id === selected[0]) : undefined;
  const splitFrame = snapToFrame(playhead, project.fps);
  const frame = 1 / project.fps;
  const canSplit = !!splitCue && !locked &&
    splitFrame >= splitCue.start + frame - 1e-9 &&
    splitFrame <= splitCue.start + splitCue.duration - frame + 1e-9;
  const canMerge = selected.length >= 2 && !locked;
  const styleReady = !!referenceId || styleDirty;

  useEffect(() => {
    const textTracks = project.tracks.filter(t => t.kind === "text");
    const preferred = textTracks.find(t => t.name.includes("字幕")) ?? textTracks[0];
    setTrackId(preferred?.id ?? ""); setQuery(""); setChecked([]); setDraft(null); setPlan(null); setError(""); setNotice("");
  }, [project.id]);
  useEffect(() => {
    if (!api) return;
    void api.getFontFamilies().then(setFonts).catch(() => {});
  }, [api]);
  useEffect(() => {
    if (!project.tracks.some(t => t.id === trackId && t.kind === "text")) {
      const preferred = project.tracks.find(t => t.kind === "text" && t.name.includes("字幕")) ?? project.tracks.find(t => t.kind === "text");
      setTrackId(preferred?.id ?? "");
    }
    // Newly imported cues become selected in the editor; follow their new track.
    const first = project.clips.find(c => c.id === useEditorStore.getState().selectedIds[0] && c.text);
    if (first && first.trackId !== trackId && (!knownTracks.current.has(first.trackId) || !project.clips.some(c => c.trackId === trackId))) setTrackId(first.trackId);
    knownTracks.current = new Set(project.tracks.map(t => t.id));
  }, [project, trackId]);
  useEffect(() => { setChecked([]); setDraft(null); setPlan(null); setError(""); setNotice(""); setReferenceId(""); setStyleDirty(false); }, [trackId]);
  useEffect(() => { if (error) feedback.current?.scrollIntoView({ block: "nearest" }); }, [error]);
  useEffect(() => { void refreshTranscription(); }, []);
  useEffect(() => {
    if (!api) return;
    return api.onTranscriptionProgress(event => {
      if (event.jobId === transcriptionJobId.current)
        setTranscriptionJob({ id: event.jobId, progress: event.progress, stage: event.stage });
    });
  }, []);

  async function refreshTranscription(preferredModel?: string) {
    if (!api) return;
    try {
      const status = await api.getTranscriptionStatus();
      setTranscription(status);
      setModelPath(current => {
        if (preferredModel && status.models.some(model => model.path === preferredModel)) return preferredModel;
        return status.models.some(model => model.path === current) ? current : status.selectedModel ?? status.models[0]?.path ?? "";
      });
    } catch (e) {
      setTranscription({ available: false, models: [], error: ipcMessage(e) });
    }
  }

  async function chooseWhisperTool(kind: "executable" | "model") {
    if (!api) return;
    setTranscriptionError(""); setTranscriptionNotice("");
    try {
      const file = await api.chooseWhisperTool(kind);
      if (file) await refreshTranscription(kind === "model" ? file : undefined);
    } catch (e) {
      setTranscriptionError(ipcMessage(e));
    }
  }

  async function startTranscription() {
    setTranscriptionError(""); setTranscriptionNotice(""); setNotice("");
    if (!api) { setTranscriptionError("此功能仅在桌面版可用。"); return; }
    if (!transcription?.available) {
      setTranscriptionError(transcription?.error ?? "找不到 Whisper。请安装 whisper.cpp，或在字幕面板中选择可执行文件。");
      return;
    }
    if (!sourceClip || !sourceAsset) {
      setTranscriptionError("请选择时间线中的音频或视频片段，或把播放头移到含音频的片段上。");
      return;
    }
    if (!modelPath) { setTranscriptionError("请选择 Whisper 模型文件"); return; }
    if (transcriptionJobId.current) return;
    const projectId = project.id;
    const jobId = crypto.randomUUID();
    transcriptionJobId.current = jobId;
    setTranscriptionJob({ id: jobId, progress: 0, stage: "preparing" });
    try {
      const result = await api.transcribeAudio({
        jobId,
        source: sourceAsset.path,
        sourceIn: sourceClip.sourceIn,
        start: sourceClip.start,
        duration: sourceClip.duration,
        speed: sourceClip.speed,
        fps: project.fps,
        language,
        model: modelPath,
      });
      if (transcriptionJobId.current !== jobId) return;
      const store = useEditorStore.getState();
      if (store.project.id !== projectId) throw new Error("项目已切换，转写结果已丢弃");
      if (!result.cues.length) throw new Error("Whisper 没有识别到语音");
      store.addSubtitles(result.cues);
      setTranscriptionNotice(`已生成 ${result.cues.length} 条自动字幕`);
    } catch (e) {
      if (transcriptionJobId.current !== jobId) return;
      const message = ipcMessage(e);
      if (message.includes("取消")) setTranscriptionNotice("转写已取消");
      else setTranscriptionError(message);
    } finally {
      if (transcriptionJobId.current === jobId) {
        transcriptionJobId.current = null;
        setTranscriptionJob(null);
      }
    }
  }

  async function cancelTranscriptionJob() {
    const jobId = transcriptionJobId.current;
    if (!jobId || !api) return;
    try {
      await api.cancelTranscription(jobId);
    } catch (e) {
      setTranscriptionError(ipcMessage(e));
    }
  }

  function attempt(action: () => void) {
    setError(""); setNotice("");
    try { action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function fileAction(action: Props["onImport"]) {
    setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  function editCue(clip: Clip) {
    useEditorStore.getState().select([clip.id]);
    useEditorStore.getState().seek(clip.start);
    setDraft({ project: clone(project), id: clip.id, text: clip.text!.text, start: seconds(clip.start), end: seconds(clip.start + clip.duration) });
    setReferenceId(clip.id); setPlan(null); setError(""); setNotice("");
  }
  function saveCue() {
    attempt(() => {
      if (!draft) return;
      if (!draft.start.trim() || !draft.end.trim()) throw new Error("请填写开始和结束时间");
      const next = prepareSubtitleEdit(draft.project, [draft.id], { type: "cue", text: draft.text, start: Number(draft.start), end: Number(draft.end) });
      const store = useEditorStore.getState();
      store.commit(applySubtitleEdit(store.project, next));
      setDraft(null); setNotice(next.changedIds.length ? "字幕已保存，可一次撤销" : "字幕未变化");
    });
  }
  function updateStyle(patch: SubtitleStylePatch) {
    setStyleDraft(current => ({ ...current, ...patch }));
    setStyleDirty(true); setPlan(null);
  }
  function chooseStyleReference(id: string) {
    setReferenceId(id); setPlan(null);
    const clip = clips.find(c => c.id === id);
    if (clip?.text) { setStyleDraft(styleFromClip(clip)); setStyleDirty(false); }
  }
  function structural(type: "split" | "merge") {
    const count = selected.length;
    attempt(() => {
      const store = useEditorStore.getState();
      const edit: SubtitleEdit = type === "split"
        ? { type: "split", at: store.playhead }
        : { type: "merge" };
      const next = prepareSubtitleEdit(store.project, selected, edit);
      store.commit(applySubtitleEdit(store.project, next));
      setSelection([]); setPlan(null); setDraft(null);
      setNotice(type === "split"
        ? "已按播放头拆分为两条字幕，可一次撤销"
        : `已合并 ${count} 条字幕，可一次撤销`);
    });
  }
  function prepare() {
    attempt(() => {
      let edit: SubtitleEdit;
      if (mode === "offset") {
        if (!offset.trim()) throw new Error("请填写时间偏移量");
        edit = { type: "offset", seconds: Number(offset) };
      } else if (mode === "replace") edit = { type: "replace", find, replacement };
      else if (mode === "style") {
        if (referenceId && !styleDirty) edit = { type: "style", referenceId };
        else {
          if (!styleReady) throw new Error("请选择参考字幕，或直接修改一项字幕样式");
          edit = { type: "style", patch: styleDraft };
        }
      } else if (mode === "animation") {
        if (!animation.inDuration.trim() || !animation.outDuration.trim())
          throw new Error("请填写文字入场和出场时长");
        edit = {
          type: "animation",
          animation: {
            entrance: animation.entrance,
            hold: animation.hold,
            exit: animation.exit,
            inDuration: Number(animation.inDuration),
            outDuration: Number(animation.outDuration),
          },
        };
      } else throw new Error("请使用拆分或合并按钮");
      const next = prepareSubtitleEdit(useEditorStore.getState().project, selected, edit);
      if (!next.changedIds.length) { setPlan(null); setNotice("没有需要修改的字幕"); return; }
      setPlan(next);
    });
  }
  function apply() {
    attempt(() => {
      if (!plan) return;
      const store = useEditorStore.getState();
      store.commit(applySubtitleEdit(store.project, plan));
      setNotice(`已修改 ${plan.changedIds.length} 条字幕，可一次撤销`); setPlan(null); setDraft(null);
    });
  }
  function setSelection(ids: string[]) { setChecked(ids); setPlan(null); }
  const draftStale = draft && JSON.stringify(draft.project) !== JSON.stringify(project);

  return <section className="subtitle-panel" aria-label="字幕编辑器">
    <div className="subtitle-heading"><h3>字幕编辑</h3><span>{clips.length} 条</span></div>
    <div className="subtitle-file-actions">
      <button className="small-button" onClick={() => void fileAction(onImport)}><FolderOpen size={14} />导入字幕文件</button>
      <button className="small-button" onClick={() => void fileAction(onExport)} disabled={!project.clips.some(c => c.text)} title="导出项目中全部文字片段为 SRT；字幕文件不携带样式、位置或动画"><Download size={14} />导出全部 SRT</button>
    </div>
    <p className="subtitle-hint">SRT / WebVTT 只保存时间与文本；样式、画面位置和文字动画不会写入字幕文件，请导出视频保留成片效果。</p>
    <div className="subtitle-auto">
      <div className="subtitle-heading"><h4>自动字幕</h4><span>本地 Whisper</span></div>
      <p className="subtitle-hint"><Mic size={13} />使用本地 Whisper 识别所选片段中的语音，音频不会上传。</p>
      {!api ? <p className="subtitle-hint">此功能仅在桌面版可用。</p> : <>
        <div className="subtitle-auto-source">
          {sourceClip && sourceAsset
            ? <><span title={sourceAsset.name}>{sourceAsset.name}</span><small>{timeLabel(sourceClip.start)} — {timeLabel(sourceClip.start + sourceClip.duration)} · {Number(sourceClip.speed.toFixed(2))}×</small></>
            : <span>未选择含音频的片段</span>}
        </div>
        {!sourceClip && <p className="subtitle-hint">请选择时间线中的音频或视频片段，或把播放头移到含音频的片段上。</p>}
        {!transcription && <p className="subtitle-hint">正在检查本地 Whisper…</p>}
        {transcription && !transcription.available && <>
          <p className="subtitle-warning">{transcription.error ?? "找不到 Whisper。请安装 whisper.cpp，或在字幕面板中选择可执行文件。"}</p>
          <div className="subtitle-auto-actions">
            <button className="small-button" onClick={() => void chooseWhisperTool("executable")}>选择 Whisper 程序…</button>
            <button className="small-button" onClick={() => void chooseWhisperTool("model")}>选择模型文件…</button>
          </div>
        </>}
        {transcription?.available && <>
          <div className="subtitle-auto-grid">
            <label>语言
              <select aria-label="转写语言" value={language} onChange={e => setLanguage(e.target.value)}>
                {TRANSCRIPTION_LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>模型
              <select aria-label="Whisper 模型" value={modelPath} onChange={e => setModelPath(e.target.value)}>
                {!transcription.models.length && <option value="">未找到模型</option>}
                {transcription.models.map(model => <option key={model.path} value={model.path}>{model.name} · {Math.max(1, Math.round(model.size / 1024 / 1024))} MB</option>)}
              </select>
            </label>
          </div>
          <div className="subtitle-auto-actions">
            <button className="small-button" onClick={() => void chooseWhisperTool("model")}>选择模型…</button>
            <button className="small-button" onClick={() => void chooseWhisperTool("executable")}>更换程序…</button>
          </div>
          {!transcription.models.length && <p className="subtitle-warning">未找到 Whisper 模型文件，请选择 .bin 模型。</p>}
        </>}
        {transcriptionJob && <div className="subtitle-progress" role="status">
          <progress max={100} value={transcriptionJob.progress} aria-label="转写进度" />
          <span>{TRANSCRIPTION_STAGE[transcriptionJob.stage]}</span>
        </div>}
        {transcription?.available && !transcriptionJob && <div className="subtitle-auto-run">
          <button className="primary subtitle-generate" disabled={!sourceClip || !modelPath} onClick={() => void startTranscription()}><Mic size={14} />生成字幕</button>
        </div>}
        {transcriptionJob && <div className="subtitle-auto-run">
          <button className="small-button" onClick={() => void cancelTranscriptionJob()}>取消转写</button>
        </div>}
        {transcriptionError && <p className="subtitle-error" role="alert">{transcriptionError}</p>}
        {transcriptionNotice && <p className="subtitle-notice" role="status">{transcriptionNotice}</p>}
      </>}
    </div>
    <label className="subtitle-track-label">文字轨道
      <select aria-label="字幕轨道" value={trackId} onChange={e => setTrackId(e.target.value)}>
        {!tracks.length && <option value="">暂无文字轨道</option>}
        {tracks.map(t => <option key={t.id} value={t.id}>{t.name}{t.locked ? " · 已锁定" : ""}</option>)}
      </select>
    </label>
    <label className="subtitle-search"><Search size={14} /><input aria-label="搜索字幕" placeholder="搜索当前轨道字幕" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="subtitle-selection">
      <label><input type="checkbox" aria-label="选择搜索结果" disabled={locked || !visible.length} checked={visible.length > 0 && visible.every(c => selected.includes(c.id))} onChange={e => setSelection(e.target.checked ? [...new Set([...selected, ...visible.map(c => c.id)])] : selected.filter(id => !visible.some(c => c.id === id)))} />选择搜索结果</label>
      <button className="subtitle-clear" disabled={!selected.length} onClick={() => setSelection([])}>清空 ({selected.length})</button>
    </div>
    {locked && <p className="subtitle-hint"><LockKeyhole size={13} />此轨道已锁定，仍可定位和查看字幕。</p>}
    <div className="subtitle-cues">
      {!visible.length && <div className="subtitle-empty"><Subtitles size={27} /><p>{clips.length ? "没有匹配的字幕" : "导入 SRT / WebVTT，或选择含字幕的文字轨道"}</p></div>}
      {visible.map((clip) => <div key={clip.id} className={`subtitle-cue ${draft?.id === clip.id ? "active" : ""}`} data-cue-id={clip.id}>
        <div className="subtitle-cue-line">
          <input type="checkbox" aria-label={`选择字幕：${clip.text!.text.slice(0, 40)}`} checked={selected.includes(clip.id)} disabled={locked} onChange={e => setSelection(e.target.checked ? [...selected, clip.id] : selected.filter(id => id !== clip.id))} />
          <button className="subtitle-cue-content" onClick={() => editCue(clip)} title="定位到此字幕并编辑"><span className="subtitle-time">{timeLabel(clip.start)} — {timeLabel(clip.start + clip.duration)}</span><span>{clip.text!.text || "（空字幕）"}</span></button>
        </div>
        {draft?.id === clip.id && <div className="subtitle-cue-form">
          <textarea aria-label="字幕内容" value={draft.text} maxLength={20000} disabled={locked} onChange={e => setDraft({ ...draft, text: e.target.value })} />
          <div className="subtitle-times">
            <label>开始 (秒)<input aria-label="字幕开始时间" type="number" min="0" max="86400" step={1 / project.fps} value={draft.start} disabled={locked} onChange={e => setDraft({ ...draft, start: e.target.value })} /></label>
            <label>结束 (秒)<input aria-label="字幕结束时间" type="number" min="0" max="86400" step={1 / project.fps} value={draft.end} disabled={locked} onChange={e => setDraft({ ...draft, end: e.target.value })} /></label>
          </div>
          {draftStale && <p className="subtitle-warning">项目已变化，重新点击此条字幕后再编辑。</p>}
          <div className="subtitle-draft-actions"><button className="small-button" onClick={() => setDraft(null)}>取消</button><button className="primary small-button" disabled={locked || !!draftStale} onClick={saveCue}>保存此条</button></div>
        </div>}
      </div>)}
    </div>
    <div className="subtitle-batch">
      <div className="subtitle-heading"><h4>批量修改</h4><span>已选 {selected.length} 条</span></div>
      <div className="subtitle-batch-tabs" role="tablist" aria-label="字幕批量操作">
        {([['splitMerge', '拆分 / 合并'], ['offset', '时间偏移'], ['replace', '查找替换'], ['style', '统一样式'], ['animation', '文字动画']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={mode === key} className={mode === key ? "active" : ""} onClick={() => { setMode(key); setPlan(null); }}>{label}</button>)}
      </div>
      {mode === "splitMerge" && <div className="subtitle-structure">
        <p className="subtitle-hint">{SPLIT_HINT}</p>
        <p className="subtitle-hint">{MERGE_HINT}</p>
        <div className="subtitle-structure-actions">
          <button className="small-button" disabled={!canSplit} onClick={() => structural("split")}>按播放头拆分</button>
          <button className="small-button" disabled={!canMerge} onClick={() => structural("merge")}>合并所选字幕</button>
        </div>
        <p className="subtitle-hint">{`播放头 ${timeLabel(playhead)} · 已选 ${selected.length} 条`}</p>
        {splitCue && <p className="subtitle-hint">{`当前字幕 ${timeLabel(splitCue.start)} — ${timeLabel(splitCue.start + splitCue.duration)}`}</p>}
      </div>}
      {mode === "offset" && <label className="subtitle-batch-field">偏移秒数（负数提前）<input aria-label="字幕偏移秒数" type="number" step={1 / project.fps} value={offset} onChange={e => { setOffset(e.target.value); setPlan(null); }} /></label>}
      {mode === "replace" && <div className="subtitle-replace"><input aria-label="查找字幕文字" placeholder="查找文字（区分大小写）" value={find} onChange={e => { setFind(e.target.value); setPlan(null); }} /><input aria-label="替换字幕文字" placeholder="替换为（可留空）" value={replacement} onChange={e => { setReplacement(e.target.value); setPlan(null); }} /></div>}
      {mode === "style" && <div className="subtitle-style-editor">
        <label className="subtitle-batch-field">样式参考字幕<select aria-label="字幕样式参考" value={referenceId} onChange={e => chooseStyleReference(e.target.value)}><option value="">选择参考字幕</option>{clips.map(c => <option key={c.id} value={c.id}>{timeLabel(c.start)} · {c.text!.text.slice(0, 30) || "空字幕"}</option>)}</select></label>
        <p className="subtitle-hint">选择参考会填入下方字段；修改任意字段后按当前值应用。只改样式，保留每条文案、时间、位置和动画。</p>
        <div className="subtitle-style-grid">
          <label>字体<select aria-label="字幕字体" value={styleDraft.fontFamily ?? "Noto Sans SC"} onChange={e => updateStyle({ fontFamily: e.target.value })}>{fonts.map(font => <option key={font} value={font}>{font}</option>)}</select></label>
          <label>字号<input aria-label="字幕字号" type="number" min="1" max="1000" value={styleDraft.fontSize ?? 64} onChange={e => updateStyle({ fontSize: Number(e.target.value) })} /></label>
          <label>文字颜色<input aria-label="字幕文字颜色" type="color" value={styleDraft.color ?? "#ffffff"} onChange={e => updateStyle({ color: e.target.value })} /></label>
          <label>描边颜色<input aria-label="字幕描边颜色" type="color" value={styleDraft.stroke ?? "#000000"} onChange={e => updateStyle({ stroke: e.target.value })} /></label>
          <label>描边宽度<input aria-label="字幕描边宽度" type="number" min="0" max="100" step="0.1" value={styleDraft.strokeWidth ?? 2} onChange={e => updateStyle({ strokeWidth: Number(e.target.value) })} /></label>
          <label>行高<input aria-label="字幕行高" type="number" min="0.8" max="3" step="0.05" value={styleDraft.lineHeight ?? 1.3} onChange={e => updateStyle({ lineHeight: Number(e.target.value) })} /></label>
          <label>内边距<input aria-label="字幕内边距" type="number" min="0" max="1.5" step="0.05" value={styleDraft.padding ?? 0.25} onChange={e => updateStyle({ padding: Number(e.target.value) })} /></label>
          <label>圆角<input aria-label="字幕圆角" type="number" min="0" max="2" step="0.05" value={styleDraft.radius ?? 0} onChange={e => updateStyle({ radius: Number(e.target.value) })} /></label>
        </div>
        <div className="subtitle-style-row">
          <label><input type="checkbox" aria-label="字幕粗体" checked={styleDraft.bold ?? true} onChange={e => updateStyle({ bold: e.target.checked })} />粗体</label>
          <label><input type="checkbox" aria-label="字幕背景" checked={(styleDraft.background ?? "transparent") !== "transparent"} onChange={e => updateStyle({ background: e.target.checked ? "#15151c" : "transparent" })} />背景</label>
          {(styleDraft.background ?? "transparent") !== "transparent" && <input aria-label="字幕背景颜色" type="color" value={styleDraft.background} onChange={e => updateStyle({ background: e.target.value })} />}
          <label>对齐<select aria-label="字幕对齐" value={styleDraft.align ?? "center"} onChange={e => updateStyle({ align: e.target.value as "left" | "center" | "right" })}><option value="left">左</option><option value="center">居中</option><option value="right">右</option></select></label>
        </div>
      </div>}
      {mode === "animation" && <div className="subtitle-animation">
        <div className="subtitle-animation-grid">
          <label>入场<select aria-label="字幕入场动画" value={animation.entrance} onChange={e => { setAnimation({ ...animation, entrance: e.target.value as typeof animation.entrance }); setPlan(null); }}>{ANIMATION_ENTRANCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>停留<select aria-label="字幕停留动画" value={animation.hold} onChange={e => { setAnimation({ ...animation, hold: e.target.value as typeof animation.hold }); setPlan(null); }}>{ANIMATION_HOLDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>出场<select aria-label="字幕出场动画" value={animation.exit} onChange={e => { setAnimation({ ...animation, exit: e.target.value as typeof animation.exit }); setPlan(null); }}>{ANIMATION_EXITS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>入场时长 (秒)<input aria-label="字幕入场时长" type="number" min="0" max="10" step={1 / project.fps} value={animation.inDuration} onChange={e => { setAnimation({ ...animation, inDuration: e.target.value }); setPlan(null); }} /></label>
          <label>出场时长 (秒)<input aria-label="字幕出场时长" type="number" min="0" max="10" step={1 / project.fps} value={animation.outDuration} onChange={e => { setAnimation({ ...animation, outDuration: e.target.value }); setPlan(null); }} /></label>
        </div>
        <p className="subtitle-hint">统一应用到所选字幕；会替换这些字幕的位置、缩放和透明度关键帧，保留旋转与音量关键帧。短字幕会自动缩短动画。字幕文件不保存动画。</p>
      </div>}
      {mode !== "splitMerge" && (plan ? <div className="subtitle-plan"><p>{stale ? "项目已变化，请重新检查修改。" : `将修改 ${plan.changedIds.length} 条字幕，可一次撤销。`}</p><div><button className="small-button" onClick={prepare}>重新检查</button><button className="primary small-button" disabled={stale || locked} onClick={apply}>应用 {plan.changedIds.length} 条修改</button></div></div> : <button className="small-button subtitle-check" disabled={!selected.length || locked || (mode === "style" && !styleReady)} onClick={prepare}>检查修改</button>)}
    </div>
    {error && <p ref={feedback} className="subtitle-error" role="alert">{error}</p>}
    {notice && <p className="subtitle-notice" role="status">{notice}</p>}
  </section>;
}
