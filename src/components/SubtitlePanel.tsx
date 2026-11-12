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
  ["auto", "Otomatik algıla"],
  ["tr", "Türkçe"],
  ["en", "İngilizce"],
  ["de", "Almanca"],
  ["fr", "Fransızca"],
  ["es", "İspanyolca"],
  ["ar", "Arapça"],
  ["ru", "Rusça"],
] as const;
const TRANSCRIPTION_STAGE: Record<TranscriptionStage, string> = {
  preparing: "Hazırlanıyor…",
  extracting: "Ses çıkarılıyor…",
  transcribing: "Konuşma tanınıyor…",
  parsing: "Altyazılar düzenleniyor…",
  complete: "Tamam",
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
const ANIMATION_ENTRANCES = [["none", "Yok"], ["fade", "Yumuşak giriş"], ["slideUp", "Yukarı kay"], ["scale", "Ölçek"]] as const;
const ANIMATION_HOLDS = [["none", "Sabit"], ["pulse", "Nefes"]] as const;
const ANIMATION_EXITS = [["none", "Yok"], ["fade", "Yumuşak çıkış"], ["slideDown", "Aşağı kay"], ["scale", "Ölçek"]] as const;
const SPLIT_HINT = "Bölme, oynatma konumunu proje karelerine hizalar; sol parça [başlangıç, oynatma konumu), sağ parça [oynatma konumu, bitiş) olur ve iki tarafta en az bir kare kalır. Metin karakter oranına göre, yakındaki noktalama veya boşluk tercih edilerek ayrılır.";
const MERGE_HINT = "Birleştirme yalnızca aynı kanaldaki ardışık ve bitişik/örtüşen altyazılarda çalışır: zaman en erken başlangıçtan en geç bitişe uzanır, metinler yeni satırla birleştirilir, stil ve yerel animasyon en erken kayıttan alınır.";
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
    const preferred = textTracks.find(t => t.name.includes("Altyazı")) ?? textTracks[0];
    setTrackId(preferred?.id ?? ""); setQuery(""); setChecked([]); setDraft(null); setPlan(null); setError(""); setNotice("");
  }, [project.id]);
  useEffect(() => {
    if (!api) return;
    void api.getFontFamilies().then(setFonts).catch(() => {});
  }, [api]);
  useEffect(() => {
    if (!project.tracks.some(t => t.id === trackId && t.kind === "text")) {
      const preferred = project.tracks.find(t => t.kind === "text" && t.name.includes("Altyazı")) ?? project.tracks.find(t => t.kind === "text");
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
    if (!api) { setTranscriptionError("Bu özellik yalnızca masaüstü uygulamasında kullanılabilir."); return; }
    if (!transcription?.available) {
      setTranscriptionError(transcription?.error ?? "Whisper bulunamadı. whisper.cpp kurun veya altyazı panelinden çalıştırılabilir dosyayı seçin.");
      return;
    }
    if (!sourceClip || !sourceAsset) {
      setTranscriptionError("Zaman çizelgesinde bir ses veya video klibi seçin ya da oynatma başlığını ses içeren bir klibin üzerine getirin.");
      return;
    }
    if (!modelPath) { setTranscriptionError("Bir Whisper model dosyası seçin"); return; }
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
      if (store.project.id !== projectId) throw new Error("Proje değiştirildi; yazıya dökme sonucu atıldı");
      if (!result.cues.length) throw new Error("Whisper konuşma algılamadı");
      store.addSubtitles(result.cues);
      setTranscriptionNotice(`${result.cues.length} otomatik altyazı oluşturuldu`);
    } catch (e) {
      if (transcriptionJobId.current !== jobId) return;
      const message = ipcMessage(e);
      if (message.includes("İptal")) setTranscriptionNotice("Yazıya dökme iptal edildi");
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
      if (!draft.start.trim() || !draft.end.trim()) throw new Error("Başlangıç ve bitiş zamanlarını girin");
      const next = prepareSubtitleEdit(draft.project, [draft.id], { type: "cue", text: draft.text, start: Number(draft.start), end: Number(draft.end) });
      const store = useEditorStore.getState();
      store.commit(applySubtitleEdit(store.project, next));
      setDraft(null); setNotice(next.changedIds.length ? "Altyazı kaydedildi, tek adımda geri alınabilir" : "Altyazı değişmedi");
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
        ? "Oynatma konumunda iki altyazıya bölündü; tek adımda geri alınabilir"
        : `${count} altyazı birleştirilecek; tek adımda geri alınabilir`);
    });
  }
  function prepare() {
    attempt(() => {
      let edit: SubtitleEdit;
      if (mode === "offset") {
        if (!offset.trim()) throw new Error("Zaman kaydırma miktarını girin");
        edit = { type: "offset", seconds: Number(offset) };
      } else if (mode === "replace") edit = { type: "replace", find, replacement };
      else if (mode === "style") {
        if (referenceId && !styleDirty) edit = { type: "style", referenceId };
        else {
          if (!styleReady) throw new Error("Bir referans altyazı seçin veya doğrudan bir altyazı stilini değiştirin");
          edit = { type: "style", patch: styleDraft };
        }
      } else if (mode === "animation") {
        if (!animation.inDuration.trim() || !animation.outDuration.trim())
          throw new Error("Metin giriş ve çıkış sürelerini girin");
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
      } else throw new Error("Lütfen bölme veya birleştirme düğmelerini kullanın");
      const next = prepareSubtitleEdit(useEditorStore.getState().project, selected, edit);
      if (!next.changedIds.length) { setPlan(null); setNotice("Değiştirilecek altyazı yok"); return; }
      setPlan(next);
    });
  }
  function apply() {
    attempt(() => {
      if (!plan) return;
      const store = useEditorStore.getState();
      store.commit(applySubtitleEdit(store.project, plan));
      setNotice(`Değiştirildi: ${plan.changedIds.length} altyazı değiştirilecek, tek adımda geri alınabilir`); setPlan(null); setDraft(null);
    });
  }
  function setSelection(ids: string[]) { setChecked(ids); setPlan(null); }
  const draftStale = draft && JSON.stringify(draft.project) !== JSON.stringify(project);

  return <section className="subtitle-panel" aria-label="Altyazı düzenleyici">
    <div className="subtitle-heading"><h3>Altyazı düzenleme</h3><span>{clips.length} kayıt</span></div>
    <div className="subtitle-file-actions">
      <button className="small-button" onClick={() => void fileAction(onImport)}><FolderOpen size={14} />Altyazı dosyası içe aktar</button>
      <button className="small-button" onClick={() => void fileAction(onExport)} disabled={!project.clips.some(c => c.text)} title="Projedeki tüm metin kliplerini SRT olarak dışa aktar; altyazı dosyası stil, konum veya animasyon taşımaz"><Download size={14} />Tümünü SRT olarak dışa aktar</button>
    </div>
    <p className="subtitle-hint">SRT / WebVTT yalnızca zaman ve metni saklar; stil, görsel konum ve metin animasyonu altyazı dosyasına yazılmaz. Bitmiş görünümü korumak için videoyu dışa aktarın.</p>
    <div className="subtitle-auto">
      <div className="subtitle-heading"><h4>Otomatik altyazı</h4><span>Yerel Whisper</span></div>
      <p className="subtitle-hint"><Mic size={13} />Seçili klipteki konuşmayı yerel Whisper ile tanır; ses hiçbir yere yüklenmez.</p>
      {!api ? <p className="subtitle-hint">Bu özellik yalnızca masaüstü uygulamasında kullanılabilir.</p> : <>
        <div className="subtitle-auto-source">
          {sourceClip && sourceAsset
            ? <><span title={sourceAsset.name}>{sourceAsset.name}</span><small>{timeLabel(sourceClip.start)} — {timeLabel(sourceClip.start + sourceClip.duration)} · {Number(sourceClip.speed.toFixed(2))}×</small></>
            : <span>Ses içeren klip seçilmedi</span>}
        </div>
        {!sourceClip && <p className="subtitle-hint">Zaman çizelgesinde bir ses veya video klibi seçin ya da oynatma başlığını ses içeren bir klibin üzerine getirin.</p>}
        {!transcription && <p className="subtitle-hint">Yerel Whisper denetleniyor…</p>}
        {transcription && !transcription.available && <>
          <p className="subtitle-warning">{transcription.error ?? "Whisper bulunamadı. whisper.cpp kurun veya altyazı panelinden çalıştırılabilir dosyayı seçin."}</p>
          <div className="subtitle-auto-actions">
            <button className="small-button" onClick={() => void chooseWhisperTool("executable")}>Whisper programını seç…</button>
            <button className="small-button" onClick={() => void chooseWhisperTool("model")}>Model dosyasını seç…</button>
          </div>
        </>}
        {transcription?.available && <>
          <div className="subtitle-auto-grid">
            <label>Dil
              <select aria-label="Yazıya dökme dili" value={language} onChange={e => setLanguage(e.target.value)}>
                {TRANSCRIPTION_LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Model
              <select aria-label="Whisper modeli" value={modelPath} onChange={e => setModelPath(e.target.value)}>
                {!transcription.models.length && <option value="">Model bulunamadı</option>}
                {transcription.models.map(model => <option key={model.path} value={model.path}>{model.name} · {Math.max(1, Math.round(model.size / 1024 / 1024))} MB</option>)}
              </select>
            </label>
          </div>
          <div className="subtitle-auto-actions">
            <button className="small-button" onClick={() => void chooseWhisperTool("model")}>Model seç…</button>
            <button className="small-button" onClick={() => void chooseWhisperTool("executable")}>Programı değiştir…</button>
          </div>
          {!transcription.models.length && <p className="subtitle-warning">Whisper model dosyası bulunamadı; bir .bin modeli seçin.</p>}
        </>}
        {transcriptionJob && <div className="subtitle-progress" role="status">
          <progress max={100} value={transcriptionJob.progress} aria-label="Yazıya dökme ilerlemesi" />
          <span>{TRANSCRIPTION_STAGE[transcriptionJob.stage]}</span>
        </div>}
        {transcription?.available && !transcriptionJob && <div className="subtitle-auto-run">
          <button className="primary subtitle-generate" disabled={!sourceClip || !modelPath} onClick={() => void startTranscription()}><Mic size={14} />Altyazı oluştur</button>
        </div>}
        {transcriptionJob && <div className="subtitle-auto-run">
          <button className="small-button" onClick={() => void cancelTranscriptionJob()}>Yazıya dökmeyi iptal et</button>
        </div>}
        {transcriptionError && <p className="subtitle-error" role="alert">{transcriptionError}</p>}
        {transcriptionNotice && <p className="subtitle-notice" role="status">{transcriptionNotice}</p>}
      </>}
    </div>
    <label className="subtitle-track-label">Metin kanalı
      <select aria-label="Altyazı kanalı" value={trackId} onChange={e => setTrackId(e.target.value)}>
        {!tracks.length && <option value="">Henüz metin kanalı yok</option>}
        {tracks.map(t => <option key={t.id} value={t.id}>{t.name}{t.locked ? " · kilitli" : ""}</option>)}
      </select>
    </label>
    <label className="subtitle-search"><Search size={14} /><input aria-label="Altyazı ara" placeholder="Geçerli kanaldaki altyazıları ara" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="subtitle-selection">
      <label><input type="checkbox" aria-label="Arama sonucunu seç" disabled={locked || !visible.length} checked={visible.length > 0 && visible.every(c => selected.includes(c.id))} onChange={e => setSelection(e.target.checked ? [...new Set([...selected, ...visible.map(c => c.id)])] : selected.filter(id => !visible.some(c => c.id === id)))} />Arama sonucunu seç</label>
      <button className="subtitle-clear" disabled={!selected.length} onClick={() => setSelection([])}>Temizle ({selected.length})</button>
    </div>
    {locked && <p className="subtitle-hint"><LockKeyhole size={13} />Bu kanal kilitli; yine de altyazılara gidip görüntüleyebilirsiniz.</p>}
    <div className="subtitle-cues">
      {!visible.length && <div className="subtitle-empty"><Subtitles size={27} /><p>{clips.length ? "Eşleşen altyazı yok" : "SRT / WebVTT içe aktarın veya altyazı içeren bir metin kanalı seçin"}</p></div>}
      {visible.map((clip) => <div key={clip.id} className={`subtitle-cue ${draft?.id === clip.id ? "active" : ""}`} data-cue-id={clip.id}>
        <div className="subtitle-cue-line">
          <input type="checkbox" aria-label={`Altyazı seç:${clip.text!.text.slice(0, 40)}`} checked={selected.includes(clip.id)} disabled={locked} onChange={e => setSelection(e.target.checked ? [...selected, clip.id] : selected.filter(id => id !== clip.id))} />
          <button className="subtitle-cue-content" onClick={() => editCue(clip)} title="Bu altyazıya git ve düzenle"><span className="subtitle-time">{timeLabel(clip.start)} — {timeLabel(clip.start + clip.duration)}</span><span>{clip.text!.text || "(boş altyazı)"}</span></button>
        </div>
        {draft?.id === clip.id && <div className="subtitle-cue-form">
          <textarea aria-label="Altyazı içeriği" value={draft.text} maxLength={20000} disabled={locked} onChange={e => setDraft({ ...draft, text: e.target.value })} />
          <div className="subtitle-times">
            <label>Başlangıç (sn)<input aria-label="Altyazı başlangıç zamanı" type="number" min="0" max="86400" step={1 / project.fps} value={draft.start} disabled={locked} onChange={e => setDraft({ ...draft, start: e.target.value })} /></label>
            <label>Bitiş (sn)<input aria-label="Altyazı bitiş zamanı" type="number" min="0" max="86400" step={1 / project.fps} value={draft.end} disabled={locked} onChange={e => setDraft({ ...draft, end: e.target.value })} /></label>
          </div>
          {draftStale && <p className="subtitle-warning">Proje değişti; düzenlemeden önce bu altyazıya yeniden tıklayın.</p>}
          <div className="subtitle-draft-actions"><button className="small-button" onClick={() => setDraft(null)}>İptal</button><button className="primary small-button" disabled={locked || !!draftStale} onClick={saveCue}>Bunu kaydet</button></div>
        </div>}
      </div>)}
    </div>
    <div className="subtitle-batch">
      <div className="subtitle-heading"><h4>Toplu değişiklik</h4><span>Seçili {selected.length} kayıt</span></div>
      <div className="subtitle-batch-tabs" role="tablist" aria-label="Altyazı toplu işlemleri">
        {([['splitMerge', 'Böl / birleştir'], ['offset', 'Zaman kaydırma'], ['replace', 'Bul ve değiştir'], ['style', 'Stili eşitle'], ['animation', 'Metin animasyonu']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={mode === key} className={mode === key ? "active" : ""} onClick={() => { setMode(key); setPlan(null); }}>{label}</button>)}
      </div>
      {mode === "splitMerge" && <div className="subtitle-structure">
        <p className="subtitle-hint">{SPLIT_HINT}</p>
        <p className="subtitle-hint">{MERGE_HINT}</p>
        <div className="subtitle-structure-actions">
          <button className="small-button" disabled={!canSplit} onClick={() => structural("split")}>Oynatma konumunda böl</button>
          <button className="small-button" disabled={!canMerge} onClick={() => structural("merge")}>Seçili altyazıları birleştir</button>
        </div>
        <p className="subtitle-hint">{`Oynatma konumu ${timeLabel(playhead)} · ${selected.length} kayıt seçili`}</p>
        {splitCue && <p className="subtitle-hint">{`Geçerli altyazı ${timeLabel(splitCue.start)} — ${timeLabel(splitCue.start + splitCue.duration)}`}</p>}
      </div>}
      {mode === "offset" && <label className="subtitle-batch-field">Kaydırma saniyesi (negatif değer öne alır)<input aria-label="Altyazı kaydırma saniyesi" type="number" step={1 / project.fps} value={offset} onChange={e => { setOffset(e.target.value); setPlan(null); }} /></label>}
      {mode === "replace" && <div className="subtitle-replace"><input aria-label="Altyazı metnini ara" placeholder="Aranan metin (büyük/küçük harfe duyarlı)" value={find} onChange={e => { setFind(e.target.value); setPlan(null); }} /><input aria-label="Altyazı metnini değiştir" placeholder="Şununla değiştir (boş bırakılabilir)" value={replacement} onChange={e => { setReplacement(e.target.value); setPlan(null); }} /></div>}
      {mode === "style" && <div className="subtitle-style-editor">
        <label className="subtitle-batch-field">Stil referansı altyazı<select aria-label="Altyazı stili referansı" value={referenceId} onChange={e => chooseStyleReference(e.target.value)}><option value="">Referans altyazı seç</option>{clips.map(c => <option key={c.id} value={c.id}>{timeLabel(c.start)} · {c.text!.text.slice(0, 30) || "Boş altyazı"}</option>)}</select></label>
        <p className="subtitle-hint">Referans seçimi aşağıdaki alanları doldurur; herhangi bir alanı değiştirdiğinizde güncel değerler uygulanır. Yalnızca stil değişir; metin, zaman, konum ve animasyon korunur.</p>
        <div className="subtitle-style-grid">
          <label>Yazı tipi<select aria-label="Altyazı yazı tipi" value={styleDraft.fontFamily ?? "Noto Sans SC"} onChange={e => updateStyle({ fontFamily: e.target.value })}>{fonts.map(font => <option key={font} value={font}>{font}</option>)}</select></label>
          <label>Yazı boyutu<input aria-label="Altyazı yazı boyutu" type="number" min="1" max="1000" value={styleDraft.fontSize ?? 64} onChange={e => updateStyle({ fontSize: Number(e.target.value) })} /></label>
          <label>Metin rengi<input aria-label="Altyazı metin rengi" type="color" value={styleDraft.color ?? "#ffffff"} onChange={e => updateStyle({ color: e.target.value })} /></label>
          <label>Kontur rengi<input aria-label="Altyazı kontur rengi" type="color" value={styleDraft.stroke ?? "#000000"} onChange={e => updateStyle({ stroke: e.target.value })} /></label>
          <label>Kontur kalınlığı<input aria-label="Altyazı kontur genişliği" type="number" min="0" max="100" step="0.1" value={styleDraft.strokeWidth ?? 2} onChange={e => updateStyle({ strokeWidth: Number(e.target.value) })} /></label>
          <label>Satır yüksekliği<input aria-label="Altyazı satır yüksekliği" type="number" min="0.8" max="3" step="0.05" value={styleDraft.lineHeight ?? 1.3} onChange={e => updateStyle({ lineHeight: Number(e.target.value) })} /></label>
          <label>İç boşluk<input aria-label="Altyazı iç boşluğu" type="number" min="0" max="1.5" step="0.05" value={styleDraft.padding ?? 0.25} onChange={e => updateStyle({ padding: Number(e.target.value) })} /></label>
          <label>Yuvarlak köşe<input aria-label="Altyazı köşe yarıçapı" type="number" min="0" max="2" step="0.05" value={styleDraft.radius ?? 0} onChange={e => updateStyle({ radius: Number(e.target.value) })} /></label>
        </div>
        <div className="subtitle-style-row">
          <label><input type="checkbox" aria-label="Altyazı kalın" checked={styleDraft.bold ?? true} onChange={e => updateStyle({ bold: e.target.checked })} />Kalın</label>
          <label><input type="checkbox" aria-label="Altyazı arka planı" checked={(styleDraft.background ?? "transparent") !== "transparent"} onChange={e => updateStyle({ background: e.target.checked ? "#15151c" : "transparent" })} />Arka plan</label>
          {(styleDraft.background ?? "transparent") !== "transparent" && <input aria-label="Altyazı arka plan rengi" type="color" value={styleDraft.background} onChange={e => updateStyle({ background: e.target.value })} />}
          <label>Hizalama<select aria-label="Altyazı hizalaması" value={styleDraft.align ?? "center"} onChange={e => updateStyle({ align: e.target.value as "left" | "center" | "right" })}><option value="left">Sol</option><option value="center">Ortala</option><option value="right">Sağ</option></select></label>
        </div>
      </div>}
      {mode === "animation" && <div className="subtitle-animation">
        <div className="subtitle-animation-grid">
          <label>Giriş<select aria-label="Altyazı giriş animasyonu" value={animation.entrance} onChange={e => { setAnimation({ ...animation, entrance: e.target.value as typeof animation.entrance }); setPlan(null); }}>{ANIMATION_ENTRANCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Bekleme<select aria-label="Altyazı bekleme animasyonu" value={animation.hold} onChange={e => { setAnimation({ ...animation, hold: e.target.value as typeof animation.hold }); setPlan(null); }}>{ANIMATION_HOLDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Çıkış<select aria-label="Altyazı çıkış animasyonu" value={animation.exit} onChange={e => { setAnimation({ ...animation, exit: e.target.value as typeof animation.exit }); setPlan(null); }}>{ANIMATION_EXITS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Giriş süresi (sn)<input aria-label="Altyazı giriş süresi" type="number" min="0" max="10" step={1 / project.fps} value={animation.inDuration} onChange={e => { setAnimation({ ...animation, inDuration: e.target.value }); setPlan(null); }} /></label>
          <label>Çıkış süresi (sn)<input aria-label="Altyazı çıkış süresi" type="number" min="0" max="10" step={1 / project.fps} value={animation.outDuration} onChange={e => { setAnimation({ ...animation, outDuration: e.target.value }); setPlan(null); }} /></label>
        </div>
        <p className="subtitle-hint">Seçili altyazıların tamamına uygulanır; bu altyazıların konum, ölçek ve saydamlık anahtar karelerini değiştirir, döndürme ve ses anahtar karelerini korur. Kısa altyazılarda animasyon otomatik kısalır. Altyazı dosyası animasyonu saklamaz.</p>
      </div>}
      {mode !== "splitMerge" && (plan ? <div className="subtitle-plan"><p>{stale ? "Proje değişti; değişiklikleri yeniden denetleyin." : `${plan.changedIds.length} altyazı değiştirilecek; tek adımda geri alınabilir.`}</p><div><button className="small-button" onClick={prepare}>Yeniden denetle</button><button className="primary small-button" disabled={stale || locked} onClick={apply}>Uygula {plan.changedIds.length} değişiklik</button></div></div> : <button className="small-button subtitle-check" disabled={!selected.length || locked || (mode === "style" && !styleReady)} onClick={prepare}>Değişiklikleri denetle</button>)}
    </div>
    {error && <p ref={feedback} className="subtitle-error" role="alert">{error}</p>}
    {notice && <p className="subtitle-notice" role="status">{notice}</p>}
  </section>;
}
