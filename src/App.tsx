import { version as appVersion } from "../package.json";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  Download,
  FilePlus2,
  FolderOpen,
  Info,
  Keyboard,
  LoaderCircle,
  Monitor,
  Music2,
  MessageSquare,
  Shapes,
  Play,
  Save,
  Settings2,
  Sparkles,
  Subtitles,
  LayoutTemplate,
  Type,
  Upload,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { useEditorStore } from "./editor/store";
import {
  clone,
  createProject,
  createTrack,
  formatTime,
  id,
  projectDuration,
} from "./core/model";
import type {
  CapcutImportSelection,
  Clip,
  ExportOptions,
  ExportProgress,
  MediaAsset,
  Project,
  RecentProject,
  ReverseProgress,
} from "./core/types";
import { parseSubtitles, stringifySubtitles } from "./core/subtitles";
import {
  DRAFT_EXCHANGE_EXTENSION,
  exportDraft,
  serializeDraft,
  validateExchangeDraft,
} from "./core/draftExchange";
import { estimateExportBytes, exportMemoryProblem, performanceNotes } from "./core/limits";
import { describeColor, hdrWarnings } from "./core/colorManagement";
import { importCapcutDraft } from "./core/capcutImport";
import SubtitlePanel from "./components/SubtitlePanel";
import TemplatesLibrary from "./components/TemplatesLibrary";
import { UpdateBanner, UpdateSettings, useUpdater } from "./components/UpdateCenter";
import type { PlacementMode } from "./core/placement";
import AudioTools from "./components/AudioTools";
import PackageDialog from "./components/PackageDialog";
import { resolveExportRange, selectedClipRange } from "./core/exportRange";
import AssistantPanel from "./components/AssistantPanel";
import AssetLibrary from "./components/AssetLibrary";
import type { BuiltinAsset } from "./core/builtinAssets";
import MediaLibrary from "./components/MediaLibrary";
import SourcePreview from "./components/SourcePreview";
import EditorWorkspace from "./components/EditorWorkspace";
import Timeline, { type LibraryPreset } from "./components/Timeline";
import {
  groupAssetsByLane,
  resolveDropTrack,
} from "./core/timelineDrop";
import EffectsPanel, {
  COLOR_PRESETS,
  presetPatch,
} from "./components/EffectsPanel";
import { TextLibrary, TransitionLibrary } from "./components/CreativeLibrary";
import {
  TEXT_PRESETS,
  addTextPreset,
  applyTransition,
  motionPatch,
  type MotionId,
  type TextPreset,
  type TransitionId,
} from "./core/creativePresets";
import Player from "./components/Player";
import Inspector from "./components/Inspector";
import "./styles.css";
type Modal = "package" | "export" | "settings" | "shortcuts" | "about" | "capcut" | null;
type PendingCapcutImport = {
  selection: CapcutImportSelection;
  capturedProject: Project;
};
/** Electron wraps IPC failures; show the message the user can act on. */
function cleanIPCError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}
const shortcuts = [
  ["Oynat / Duraklat", "Space"],
  ["Klibi böl", "⌘ / Ctrl + B"],
  ["Klibi sil", "Delete / Backspace"],
  ["Geri al / Yinele", "⌘ + Z / ⇧ + ⌘ + Z"],
  ["Kopyala / Yapıştır", "⌘ + C / ⌘ + V"],
  ["Klibi kopyala", "⌘ / Ctrl + D"],
  ["Tüm klipleri seç", "⌘ / Ctrl + A"],
  ["Önceki kare / Sonraki kare", "← / →"],
  ["Yeni / Aç / Kaydet", "⌘ + N / O / S"],
  ["İçe aktar / Dışa aktar", "⌘ + I / E"],
  ["Zaman çizelgesini yakınlaştır / uzaklaştır", "+ / −"],
  ["Başa / sona git", "Home / End"],
];
function ModalShell({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "modal-wide" : ""}`}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="İletişim kutusunu kapat" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function ExportDialog({
  project,
  selectedIds,
  onClose,
  notify,
}: {
  project: Project;
  selectedIds: string[];
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [options, setOptions] = useState<ExportOptions>({
      path: "",
      width: project.width + (project.width % 2),
      height: project.height + (project.height % 2),
      fps: project.fps,
      quality: "standard",
      format: "mp4",
    }),
    [progress, setProgress] = useState<ExportProgress | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [scope, setScope] = useState("all");
  const [rangeStart, setRangeStart] = useState("0"), [rangeEnd, setRangeEnd] = useState(String(projectDuration(project)));
  const selectedRange = selectedClipRange(project, selectedIds);
  const rangeOptions = scope === "all" ? undefined : scope === "selected" ? selectedRange : { start: Number(rangeStart), end: Number(rangeEnd) };
  const exportDuration = rangeOptions ? Math.max(0, rangeOptions.end - rangeOptions.start) : projectDuration(project);
  const notes = performanceNotes(project, {
    width: options.width,
    height: options.height,
    fps: options.fps,
  });
  const colorNotes = hdrWarnings(
    project.assets.map((asset) => ({
      name: asset.name,
      info: describeColor({
        colorTransfer: asset.colorTransfer,
        colorPrimaries: asset.colorPrimaries,
      }),
    })),
  );
  const layers = project.clips.filter(
    (clip) =>
      clip.start < exportDuration &&
      (rangeOptions
        ? clip.start + clip.duration > rangeOptions.start
        : true),
  ).length;
  const memoryProblem = exportMemoryProblem(options, Math.min(12, Math.max(1, layers)));
  const estimatedBytes = estimateExportBytes(options, Math.min(12, Math.max(1, layers)));
  const frames = Math.ceil(exportDuration * options.fps);
  const job = useRef<string | null>(null);
  const exporting =
    busy &&
    !["complete", "error", "cancelled"].includes(progress?.status ?? "");
  useEffect(
    () =>
      window.editorAPI?.onExportProgress((event) => {
        if (!job.current || event.jobId === job.current) {
          setProgress(event);
          if (["complete", "error", "cancelled"].includes(event.status)) {
            setBusy(false);
            if (event.status === "error") setError(event.message ?? "Dışa aktarma başarısız");
          }
        }
      }),
    [],
  );
  const choose = async () => {
    try {
      const path = await window.editorAPI?.chooseExportPath(
        project.name,
        options.format,
      );
      if (path) setOptions((p) => ({ ...p, path }));
    } catch (error) {
      setError(String(error));
    }
  };
  const exportVideo = async () => {
    if (!window.editorAPI) {
      setError("Video dışa aktarma için masaüstü sürümü ve yerel FFmpeg gerekir.");
      return;
    }
    try {
      setError("");
      if (memoryProblem) throw new Error(memoryProblem);
      if (scope === "selected" && !selectedRange) throw new Error("Önce zaman çizelgesinden bir klip seçin");
      if (scope === "custom" && (!rangeStart.trim() || !rangeEnd.trim())) throw new Error("Aralığın başlangıç ve bitiş zamanlarını girin");
      resolveExportRange(project, { ...options, range: rangeOptions });
      let path = options.path;
      if (!path) {
        path =
          (await window.editorAPI.chooseExportPath(
            project.name,
            options.format,
          )) ?? "";
        if (!path) return;
        setOptions((p) => ({ ...p, path }));
      }
      job.current = null;
      setBusy(true);
      setProgress({ jobId: "", progress: 0, status: "preparing" });
      const result = await window.editorAPI.exportProject(clone(project), {
        ...options,
        range: rangeOptions,
        path,
      });
      job.current = result.jobId;
    } catch (error) {
      setBusy(false);
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const status = progress?.status;
  return (
    <ModalShell
      title="Videoyu dışa aktar"
      onClose={() => {
        if (!exporting) onClose();
      }}
    >
      <div className="export-preview">
        <div>
          <Video size={28} />
          <strong>{project.name}</strong>
          <span>
            {formatTime(exportDuration, project.fps)} ·{" "}
            {project.clips.length} klip
          </span>
        </div>
        <span className="export-badge">Yerel oluşturma</span>
      </div>
      <div className="modal-body">
        <label className="stacked-label">
          Kayıt konumu
          <div className="file-picker">
            <input
              aria-label="Dışa aktarma konumu"
              readOnly
              value={options.path}
              placeholder="Video kayıt konumunu seçin"
            />
            <button disabled={exporting} onClick={choose}>
              <FolderOpen size={16} />
            </button>
          </div>
        </label>
        <label className="stacked-label">Dışa aktarma aralığı
          <select aria-label="Dışa aktarma aralığı" value={scope} disabled={exporting} onChange={e => setScope(e.target.value)}>
            <option value="all">Tüm zaman çizelgesi</option><option value="selected" disabled={!selectedRange}>Seçili kliplerin bulunduğu aralık</option><option value="custom">Özel aralık</option>
          </select>
        </label>
        {scope === "custom" && <div className="export-fields"><label>Başlangıç (sn)<input aria-label="Aralık başlangıcı" type="number" min="0" step={1 / project.fps} disabled={exporting} value={rangeStart} onChange={e => setRangeStart(e.target.value)} /></label><label>Bitiş (sn)<input aria-label="Aralık bitişi" type="number" min="0" step={1 / project.fps} disabled={exporting} value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} /></label></div>}
        {scope === "selected" && selectedRange && <p className="field-hint">{selectedRange.start.toFixed(3)}–{selectedRange.end.toFixed(3)} sn · aralıktaki tüm görünür görüntü ve ses dahil.</p>}
        <div className="export-fields">
          <label>
            Çözünürlük
            <select
              aria-label="Dışa aktarma çözünürlüğü"
              disabled={exporting}
              value={`${options.width}:${options.height}`}
              onChange={(e) => {
                const [width, height] = e.target.value.split(":").map(Number);
                setOptions((p) => ({ ...p, width, height }));
              }}
            >
              <option
                value={`${project.width + (project.width % 2)}:${project.height + (project.height % 2)}`}
              >
                Özgün · {project.width}×{project.height}
              </option>
              {[720, 1080, 1440, 2160].map((height) => {
                const width =
                  Math.round((height * project.width) / project.height / 2) * 2;
                return (
                  <option key={height} value={`${width}:${height}`}>
                    {height}p · {width}×{height}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            Kare hızı
            <select
              aria-label="Dışa aktarma kare hızı"
              value={options.fps}
              disabled={exporting}
              onChange={(e) =>
                setOptions((p) => ({ ...p, fps: Number(e.target.value) }))
              }
            >
              {[24, 25, 30, 50, 60].map((fps) => (
                <option key={fps}>{fps}</option>
              ))}
            </select>
          </label>
          <label>
            Kalite
            <select
              aria-label="Dışa aktarma kalitesi"
              disabled={exporting}
              value={options.quality}
              onChange={(e) =>
                setOptions((p) => ({
                  ...p,
                  quality: e.target.value as ExportOptions["quality"],
                }))
              }
            >
              <option value="draft">Taslak · daha hızlı</option>
              <option value="standard">Standart · önerilen</option>
              <option value="high">Yüksek kalite</option>
            </select>
          </label>
          <label>
            Biçim
            <select
              aria-label="Dışa aktarma biçimi"
              disabled={exporting}
              value={options.format}
              onChange={(e) => {
                job.current = null;
                setOptions((p) => ({
                  ...p,
                  format: e.target.value as "mp4" | "mov",
                  path: "",
                }));
              }}
            >
              <option value="mp4">MP4 · H.264 / AAC</option>
              <option value="mov">MOV · H.264 / AAC</option>
            </select>
          </label>
        </div>
        <p className="field-hint">
          Özgün medyayı ve görünür tüm görüntü kanallarını dışa aktarır, ses ayarlarına göre miksler. Giriş veya yükleme gerekmez.
        </p>
        <div className="export-estimate" role="status">
          <span>
            {frames.toLocaleString("tr-TR")} kare ·{" "}
            {(estimatedBytes / (1024 * 1024)).toFixed(0)} MB tepe bellek tahmini ·{" "}
            {layers} klip
          </span>
        </div>
        {memoryProblem && (
          <p className="export-warning" role="alert">{memoryProblem}</p>
        )}
        {(notes.length > 0 || colorNotes.length > 0) && (
          <ul className="export-notes">
            {[...colorNotes, ...notes.map((note) => note.message)].map((message) => (
              <li key={message} className={notes.some((note) => note.message === message && note.level === "warning") ? "is-warning" : ""}>
                {message}
              </li>
            ))}
          </ul>
        )}
        {progress && (
          <div
            className={`export-progress ${status === "complete" ? "is-complete" : ""}`}
          >
            <div>
              <span>
                {status === "complete"
                  ? "Dışa aktarma tamamlandı"
                  : status === "cancelled"
                    ? "Dışa aktarma iptal edildi"
                    : status === "preparing"
                      ? "Medya hazırlanıyor"
                      : status === "error"
                        ? "Dışa aktarma başarısız"
                        : "Video oluşturuluyor"}
              </span>
              <strong>{Math.round(progress.progress * 100)}%</strong>
            </div>
            <progress value={progress.progress} max={1} />
          </div>
        )}
        {error && (
          <div role="alert" className="inline-warning">
            {error}
          </div>
        )}
      </div>
      <footer>
        {exporting ? (
          <>
            <span className="muted">
              <LoaderCircle size={14} className="spin" />
              Düzenleme, yerel işleme tamamlandıktan sonra sürer
            </span>
            <button
              onClick={() => {
                if (job.current)
                  void window.editorAPI
                    ?.cancelExport(job.current)
                    .catch((error) => setError(String(error)));
              }}
            >
              Dışa aktarmayı iptal et
            </button>
          </>
        ) : status === "complete" ? (
          <>
            <button
              onClick={() =>
                void window.editorAPI
                  ?.revealPath(progress?.path ?? options.path)
                  .catch((error) => notify(String(error)))
              }
            >
              <FolderOpen size={15} />
              Dosya yöneticisinde göster
            </button>
            <button className="primary" onClick={onClose}>
              <Check size={15} />
              Tamam
            </button>
          </>
        ) : (
          <>
            <button onClick={onClose}>İptal</button>
            <button
              className="primary"
              onClick={exportVideo}
              disabled={!project.clips.length}
            >
              <Download size={16} />
              Dışa aktarmayı başlat
            </button>
          </>
        )}
      </footer>
    </ModalShell>
  );
}
async function browserAssets(files: File[]): Promise<MediaAsset[]> {
  const results: MediaAsset[] = [];
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : "video";
    if (kind === "image") {
      const image = new Image();
      image.src = url;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`${file.name} okunamadı`));
      });
      results.push({
        id: id(),
        name: file.name,
        path: file.name,
        url,
        kind,
        duration: 0,
        width: image.width,
        height: image.height,
        fps: 0,
        hasAudio: false,
        thumbnail: url,
      });
    } else {
      const element = document.createElement(kind);
      element.preload = "metadata";
      element.src = url;
      await new Promise<void>((resolve, reject) => {
        element.onloadedmetadata = () => resolve();
        element.onerror = () => reject(new Error(`${file.name} okunamadı`));
      });
      const video = element instanceof HTMLVideoElement ? element : null;
      results.push({
        id: id(),
        name: file.name,
        path: file.name,
        url,
        kind,
        duration: element.duration,
        width: video?.videoWidth ?? 0,
        height: video?.videoHeight ?? 0,
        fps: 30,
        hasAudio: true,
      });
      element.removeAttribute("src");
      element.load();
    }
  }
  return results;
}
export default function App() {
  const s = useEditorStore();
  const updater = useUpdater(!!window.editorAPI);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sourceAssetId, setSourceAssetId] = useState<string | null>(null);
  const sourceAsset = s.project.assets.find(asset => asset.id === sourceAssetId);
  const [addingBuiltin, setAddingBuiltin] = useState<string | null>(null);
  const [tab, setTab] = useState("Medya"),
    [modal, setModal] = useState<Modal>(null),
    [fileMenu, setFileMenu] = useState(false),
    [toast, setToast] = useState(""),
    [importing, setImporting] = useState(false),
  [dropActive, setDropActive] = useState(false),
    [separating, setSeparating] = useState(false),
    [reverseJob, setReverseJob] = useState<ReverseProgress | null>(null),
    [freezing, setFreezing] = useState(false),
    [system, setSystem] = useState<{
      ffmpeg: boolean;
      version?: string;
      ffmpegVersion?: string;
      ffmpegPath?: string;
    }>({ ffmpeg: false }),
    [recent, setRecent] = useState<RecentProject[]>([]),
    [recover, setRecover] = useState<Project | null>(null),
    [initialized, setInitialized] = useState(false);
  const reverseJobId = useRef<string | null>(null);
  useEffect(() => { setSourceAssetId(null); }, [s.project.id, modal, s.selectedIds]);
  useEffect(() => { if (s.playing) setSourceAssetId(null); }, [s.playing]);
  useEffect(() => {
    const api = window.editorAPI;
    if (!api?.onReverseProgress) return;
    return api.onReverseProgress((event) => {
      if (event.jobId === reverseJobId.current) setReverseJob(event);
    });
  }, []);
  const [timelineHeight, setTimelineHeight] = useState(() =>
    Math.max(220, Math.min(420, window.innerHeight * 0.34)),
  );
  const timelineResize = useRef<{ y: number; height: number } | null>(null);
  const resizeTimeline = (height: number) =>
    setTimelineHeight(
      Math.max(190, Math.min(window.innerHeight - 290, height)),
    );
  useEffect(() => {
    const clamp = () =>
      setTimelineHeight((height) =>
        Math.max(190, Math.min(window.innerHeight - 290, height)),
      );
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);
  const addBuiltin = async (definition: BuiltinAsset) => {
    if (!window.editorAPI) throw new Error("Yerleşik medya eklemek için masaüstü sürümü gerekir");
    if (addingBuiltin) return;
    const projectId = useEditorStore.getState().project.id;
    setAddingBuiltin(definition.id);
    try {
      const imported = await window.editorAPI.importBuiltinAsset(definition.id);
      const state = useEditorStore.getState();
      if (state.project.id !== projectId) throw new Error("Proje değişti, medyayı yeniden ekleyin");
      state.beginTransaction();
      try {
        state.addAssets([imported]);
        const latest = useEditorStore.getState();
        const asset = latest.project.assets.find(a => a.path === imported.path)!;
        const name = definition.category === "backgrounds" ? "Yerleşik arka plan" : definition.kind === "audio" ? "Yerleşik ses efekti" : "Yerleşik süsleme";
        let track = latest.project.tracks.find(t => t.name === name && t.kind === definition.kind && !t.locked);
        if (!track) {
          track = createTrack(definition.kind, name);
          const tracks = [...latest.project.tracks];
          if (definition.category === "backgrounds" || definition.kind === "audio") tracks.push(track);
          else { const at = tracks.findIndex(t => t.kind !== "text"); tracks.splice(at < 0 ? tracks.length : at, 0, track); }
          latest.updateProject({ tracks });
        }
        latest.addAssetClip(asset.id, latest.playhead, track.id);
        const after = useEditorStore.getState();
        if (definition.category === "stickers" && after.selectedIds[0]) after.updateClip(after.selectedIds[0], { transform: { ...after.project.clips.find(c => c.id === after.selectedIds[0])!.transform, scale: .35 } });
      } finally { useEditorStore.getState().endTransaction(); }
    } finally { setAddingBuiltin(null); }
  };
  const saving = useRef(false);
  const [capcutImport, setCapcutImport] =
    useState<PendingCapcutImport | null>(null);
  const [capcutTimelineId, setCapcutTimelineId] = useState("");
  const [capcutBusy, setCapcutBusy] = useState(false);
  const capcutImportRef = useRef<PendingCapcutImport | null>(null);
  const capcutBusyRef = useRef(false);
  useEffect(
    () => () => {
      const token = capcutImportRef.current?.selection.token;
      if (token)
        void window.editorAPI?.discardCapcutProject(token).catch(() => {});
    },
    [],
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleInput = useRef<HTMLInputElement>(null);
  const [subtitleAction, setSubtitleAction] = useState<"import" | "draft">(
    "import",
  );
  const [placementMode, setPlacementMode] = useState<PlacementMode>("append");
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  const safe = useCallback(
    async (action: () => unknown) => {
      try {
        await action();
      } catch (error) {
        notify(cleanIPCError(error));
      }
    },
    [notify],
  );
  const active = s.project.clips.find((c) => c.id === s.selectedIds[0]);
  const activeTrack = s.project.tracks.find((t) => t.id === active?.trackId);
  const refreshSystem = async () => {
    if (window.editorAPI) setSystem(await window.editorAPI.getSystemInfo());
  };
  useEffect(() => {
    void safe(async () => {
      await refreshSystem();
      if (window.editorAPI) {
        setRecent(await window.editorAPI.getRecentProjects());
        let startup;
        try {
          startup = await window.editorAPI.getStartupProject();
        } catch (error) {
          notify(
            `Başlangıç projesi açılamadı: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (startup) {
          s.setProject(startup.project, startup.path);
          setInitialized(true);
          return;
        }
        const autosave = await window.editorAPI.getAutosave();
        if (autosave && (autosave.clips.length || autosave.assets.length))
          setRecover(autosave);
      }
      setInitialized(true);
    }).finally(() => setInitialized(true));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    window.editorAPI?.setDirty(s.dirty);
  }, [s.dirty]);
  useEffect(() => {
    if (!initialized || recover || !window.editorAPI) return;
    const timer = setTimeout(() => {
      void window
        .editorAPI!.autosaveProject(s.project)
        .catch((error) => notify(`Otomatik kaydetme başarısız: ${String(error)}`));
    }, 1000);
    return () => clearTimeout(timer);
  }, [s.project, initialized, recover]);
  const confirmReplace = () =>
    !useEditorStore.getState().dirty ||
    window.confirm("Geçerli projede kaydedilmemiş değişiklikler var. Devam ederseniz proje kapanır. Önce kaydetmeniz önerilir.");
  const importMedia = async (paths?: string[]) => {
    if (!window.editorAPI) {
      notify("Tarayıcı önizlemesinde dosyaları sürükleyerek içe aktarabilirsiniz. Tüm dosya işlemleri için masaüstü sürümünü çalıştırın.");
      return;
    }
    const projectId = useEditorStore.getState().project.id;
    setImporting(true);
    try {
      const assets = await window.editorAPI.importMedia(paths);
      if (useEditorStore.getState().project.id !== projectId) {
        notify("Proje değişti, içe aktarılan medya yeni projeye eklenmedi");
        return;
      }
      s.addAssets(assets);
      if (assets.length) notify(`${assets.length} medya içe aktarıldı`);
    } finally {
      setImporting(false);
    }
  };
  /**
   * Files dropped from the OS keep a real path we can hand to FFprobe. Files
   * that come from a browser or an archive have no path, so their bytes are
   * copied into the profile folder first. Either way the drop ends up as normal
   * project media.
   */
  const importDropped = async (files: File[]) => {
    const api = window.editorAPI;
    if (!api) return false;
    if (!files.length) return false;
    const projectId = useEditorStore.getState().project.id;
    setImporting(true);
    try {
      const located: string[] = [];
      const payload: { name: string; data: ArrayBuffer }[] = [];
      for (const file of files) {
        const filePath = api.getPathForFile(file);
        if (filePath) located.push(filePath);
        else payload.push({ name: file.name, data: await file.arrayBuffer() });
      }
      const imported: MediaAsset[] = [];
      if (located.length) imported.push(...(await api.importMedia(located)));
      if (payload.length) imported.push(...(await api.importDroppedMedia(payload)));
      if (useEditorStore.getState().project.id !== projectId) {
        notify("Proje değişti, bırakılan medya yeni projeye eklenmedi");
        return true;
      }
      useEditorStore.getState().addAssets(imported);
      if (imported.length) notify(`${imported.length} medya içe aktarıldı`);
      return imported.length > 0;
    } finally {
      setImporting(false);
    }
  };
  const separateAudio = async (clip: Clip) => {
    const projectId = useEditorStore.getState().project.id,
      asset = useEditorStore
        .getState()
        .project.assets.find((entry) => entry.id === clip.assetId);
    if (!asset?.hasAudio) {
      notify("Bu materyalde ayrılacak ses yok.");
      return;
    }
    if (!window.editorAPI) {
      notify("Ses ayırma yalnızca masaüstü uygulamasında kullanılabilir.");
      return;
    }
    if (separating) return;
    setSeparating(true);
    try {
      const extracted = await window.editorAPI.extractAudio(asset);
      if (useEditorStore.getState().project.id !== projectId) return;
      useEditorStore.getState().separateAudio(clip.id, extracted);
      notify("Ses ayrıldı; artık yeni ses kanalında ayrı düzenlenebilir");
    } catch (error) {
      notify(`Ses ayırma başarısız: ${cleanIPCError(error)}`);
    } finally {
      setSeparating(false);
    }
  };
  const reverseClip = async (clip: Clip) => {
    const state = useEditorStore.getState(),
      projectId = state.project.id,
      asset = state.project.assets.find((entry) => entry.id === clip.assetId),
      track = state.project.tracks.find((entry) => entry.id === clip.trackId);
    if (!asset || asset.kind !== "video") {
      notify("Bir video klibi seçin.");
      return;
    }
    if (asset.missing) {
      notify("Özgün video medyası eksik; ters oynatılamıyor.");
      return;
    }
    if (track?.locked) {
      notify("Kanal kilitli; ters oynatılamıyor.");
      return;
    }
    if (!window.editorAPI) {
      notify("Video ters oynatma yalnızca masaüstü sürümünde kullanılabilir.");
      return;
    }
    if (reverseJobId.current) return;
    const jobId = crypto.randomUUID();
    reverseJobId.current = jobId;
    setReverseJob({ jobId, progress: 0, status: "preparing" });
    try {
      const reversed = await window.editorAPI.reverseClip({
        jobId,
        source: asset.path,
        sourceIn: clip.sourceIn,
        duration: clip.duration * clip.speed,
        name: asset.name,
      });
      const latest = useEditorStore.getState();
      if (latest.project.id !== projectId) return;
      if (!latest.project.clips.some((entry) => entry.id === clip.id)) {
        notify("Klip artık yok; ters oynatma sonucu projeye eklenmedi.");
        return;
      }
      latest.reverseClip(clip.id, reversed);
      notify("Klip ters çevrildi; özgün medya kitaplıkta korunuyor.");
    } catch (error) {
      const message = cleanIPCError(error);
      if (message.includes("İptal")) notify("Ters oynatma iptal edildi.");
      else notify(`Ters oynatma başarısız: ${message}`);
    } finally {
      if (reverseJobId.current === jobId) {
        reverseJobId.current = null;
        setReverseJob(null);
      }
    }
  };
  const cancelReverse = async () => {
    const jobId = reverseJobId.current;
    if (!jobId || !window.editorAPI) return;
    try {
      await window.editorAPI.cancelReverse(jobId);
    } catch (error) {
      notify(cleanIPCError(error));
    }
  };
  const addFreezeFrame = async (duration: number) => {
    const state = useEditorStore.getState(),
      projectId = state.project.id,
      clip = state.project.clips.find((entry) => entry.id === state.selectedIds[0]),
      asset = clip
        ? state.project.assets.find((entry) => entry.id === clip.assetId)
        : undefined,
      track = clip
        ? state.project.tracks.find((entry) => entry.id === clip.trackId)
        : undefined;
    if (!clip || !asset || asset.kind !== "video") {
      notify("Bir video klibi seçin.");
      return;
    }
    if (asset.missing) {
      notify("Özgün video medyası eksik; kare dondurulamıyor.");
      return;
    }
    if (track?.locked) {
      notify("Kanal kilitli; kare dondurulamıyor.");
      return;
    }
    if (
      state.playhead < clip.start - 1e-9 ||
      state.playhead > clip.start + clip.duration + 1e-9
    ) {
      notify("Önce oynatma başlığını seçili video klibinin aralığına taşıyın.");
      return;
    }
    if (!window.editorAPI) {
      notify("Kare dondurma yalnızca masaüstü sürümünde kullanılabilir.");
      return;
    }
    if (freezing) return;
    const start = Math.round(state.playhead * state.project.fps) / state.project.fps,
      lastFrame = Math.max(0, clip.duration - 1 / state.project.fps),
      local = Math.max(
        0,
        Math.min(lastFrame, Math.max(0, start - clip.start)),
      ),
      time = clip.sourceIn + local * clip.speed;
    setFreezing(true);
    try {
      const image = await window.editorAPI.freezeFrame({
        source: asset.path,
        time,
        name: asset.name,
      });
      const latest = useEditorStore.getState();
      if (latest.project.id !== projectId) return;
      if (!latest.project.clips.some((entry) => entry.id === clip.id)) {
        notify("Klip artık yok; donmuş kare projeye eklenmedi.");
        return;
      }
      latest.addFreezeFrame(clip.id, image, start, duration);
      notify("Donmuş kare oluşturuldu; süresini görüntü özelliklerinden ayarlayabilirsiniz.");
    } catch (error) {
      notify(`Donmuş kare oluşturulamadı: ${cleanIPCError(error)}`);
    } finally {
      setFreezing(false);
    }
  };
  const save = async (as = false) => {    if (saving.current) {
      notify("Proje kaydediliyor, lütfen bekleyin");
      return false;
    }
    if (!window.editorAPI) {
      const blob = new Blob([JSON.stringify(s.project, null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = s.project.name + ".cevikedit";
      a.click();
      URL.revokeObjectURL(url);
      notify("Proje JSON'u indirildi. Tarayıcıdaki medya bağlantıları oturumlar arasında korunmaz.");
      return false;
    }
    saving.current = true;
    try {
      const state = useEditorStore.getState(),
        captured = state.project,
        file = await window.editorAPI.saveProject(
          captured,
          as ? undefined : state.path,
        );
      if (!file) return false;
      setRecent(await window.editorAPI.getRecentProjects());
      const latest = useEditorStore.getState();
      if (latest.project.id !== captured.id) {
        notify("Özgün projenin anlık görüntüsü kaydedildi");
        return false;
      }
      const unchanged = latest.project === captured;
      if (unchanged) latest.markSaved(file);
      else useEditorStore.setState({ path: file, dirty: true });
      notify(unchanged ? "Proje kaydedildi" : "Geçerli anlık görüntü kaydedildi, sonraki düzenlemeler henüz kaydedilmedi");
      return unchanged;
    } finally {
      saving.current = false;
    }
  };
  const open = async () => {
    if (!confirmReplace()) return;
    if (!window.editorAPI) {
      notify("Yerel proje açmak için masaüstü sürümü gerekir.");
      return;
    }
    const result = await window.editorAPI.openProject();
    if (result) s.setProject(result.project, result.path);
  };
  const newProject = () => {
    if (confirmReplace()) s.setProject(createProject());
  };
  const handleAction = async (action: string) => {
    // Native menu accelerators bypass DOM key handlers; keep modal workflows intact.
    if ((modal || recover) && action !== "save-and-close") return;
    setFileMenu(false);
    switch (action) {
      case "new":
        newProject();
        break;
      case "open":
        await open();
        break;
      case "open-external":
        if (confirmReplace()) {
          const result = await window.editorAPI?.getStartupProject();
          if (result) s.setProject(result.project, result.path);
        }
        break;
      case "save":
        await save();
        break;
      case "save-as":
        await save(true);
        break;
      case "save-and-close":
        try {
          if (await save()) {
            window.editorAPI?.setDirty(false);
            window.editorAPI?.closeWindow();
          } else window.editorAPI?.cancelCloseRequest();
        } catch (error) {
          window.editorAPI?.cancelCloseRequest();
          throw error;
        }
        break;
      case "import":
        await importMedia();
        break;
      case "import-capcut-file":
        await importDraft("file");
        break;
      case "import-capcut-directory":
        await importDraft("directory");
        break;
      case "export":
        s.setPlaying(false);
        setModal("export");
        break;
      case "undo":
        s.undo();
        break;
      case "redo":
        s.redo();
        break;
      case "shortcuts":
        setModal("shortcuts");
        break;
      case "about":
        setModal("about");
        break;
    }
  };
  const actionRef = useRef(handleAction);
  actionRef.current = handleAction;
  useEffect(
    () =>
      window.editorAPI?.onMenuAction(
        (action) => void safe(() => actionRef.current(action)),
      ),
    [safe],
  );
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (modal === "capcut") {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelCapcutImport();
        }
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true]"))
        return;
      if (modal || recover) {
        if (e.key === "Escape" && modal !== "export" && modal !== "package") {
          setModal(null);
        }
        return;
      }
      const state = useEditorStore.getState(),
        modifier = e.metaKey || e.ctrlKey;
      let handled = true;
      if (modifier) {
        switch (e.key.toLowerCase()) {
          case "n":
            void safe(() => actionRef.current("new"));
            break;
          case "o":
            void safe(() => actionRef.current("open"));
            break;
          case "s":
            void safe(() => actionRef.current(e.shiftKey ? "save-as" : "save"));
            break;
          case "i":
            void safe(() => actionRef.current("import"));
            break;
          case "e":
            void safe(() => actionRef.current("export"));
            break;
          case "b":
            state.split();
            break;
          case "d":
            state.duplicate();
            break;
          case "z":
            e.shiftKey ? state.redo() : state.undo();
            break;
          case "y":
            state.redo();
            break;
          case "c":
            state.copy();
            break;
          case "v":
            state.paste();
            break;
          case "a":
            state.select(state.project.clips.map((c) => c.id));
            break;
          default:
            handled = false;
        }
      } else
        switch (e.key) {
          case " ":
            if (state.playhead >= projectDuration(state.project)) state.seek(0);
            state.setPlaying(!state.playing && !!state.project.clips.length);
            break;
          case "Backspace":
          case "Delete":
            state.deleteSelected();
            break;
          case "ArrowLeft":
            state.seek(
              Math.max(
                0,
                state.playhead - (e.shiftKey ? 1 : 1 / state.project.fps),
              ),
            );
            break;
          case "ArrowRight":
            state.seek(
              Math.min(
                projectDuration(state.project),
                state.playhead + (e.shiftKey ? 1 : 1 / state.project.fps),
              ),
            );
            break;
          case "Home":
            state.seek(0);
            break;
          case "End":
            state.seek(projectDuration(state.project));
            break;
          case "+":
          case "=":
            state.setZoom(state.zoom * 1.25);
            break;
          case "-":
            state.setZoom(state.zoom / 1.25);
            break;
          case "Escape":
            state.select([]);
            setFileMenu(false);
            break;
          default:
            handled = false;
        }
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [modal, recover, safe]);
  const addStyledText = (preset: TextPreset) => {
    const result = addTextPreset(s.project, preset, s.playhead);
    s.commit(result.project);
    s.select([result.clip.id]);
    setTab("Metin");
  };
  const readSubtitles = async () => {
    if (!window.editorAPI) {
      setSubtitleAction("import");
      subtitleInput.current?.click();
      return;
    }
    const result = await window.editorAPI.readTextFile(["srt", "vtt"]);
    if (!result) return;
    const cues = parseSubtitles(result.text);
    if (!cues.length) throw new Error("Geçerli SRT / VTT altyazısı okunamadı");
    s.addSubtitles(cues);
    notify(`${cues.length} altyazı içe aktarıldı`);
  };
  const exportDraftFile = async () => {
    if (!window.editorAPI) {
      notify("Taslak dışa aktarma yalnızca masaüstü sürümde kullanılabilir.");
      return;
    }
    const draft = validateExchangeDraft(
      exportDraft(s.project, { name: s.project.name }),
    );
    const file = await window.editorAPI.writeTextFile(
      serializeDraft(draft),
      `${s.project.name}.${DRAFT_EXCHANGE_EXTENSION}`,
    );
    if (file)
      notify(
        "Taslak değişim dosyası dışa aktarıldı (düz metin JSON, yeniden içe aktarılabilir). Bu, CapCut'un şifreli taslağı değildir; CapCut dosyayı doğrudan açamaz.",
      );
  };
  const exportSubtitles = async () => {
    const cues = s.project.clips
      .filter((c) => c.text)
      .sort((a, b) => a.start - b.start)
      .map((c) => ({
        start: c.start,
        end: c.start + c.duration,
        text: c.text!.text,
      }));
    if (!cues.length) throw new Error("Projede metin veya altyazı yok");
    const text = stringifySubtitles(cues);
    if (window.editorAPI)
      await window.editorAPI.writeTextFile(text, s.project.name + ".srt");
    else {
      const url = URL.createObjectURL(
          new Blob([text], { type: "text/plain;charset=utf-8" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = s.project.name + ".srt";
      a.click();
      URL.revokeObjectURL(url);
    }
    notify("SRT dışa aktarıldı; altyazı dosyası yalnızca zaman ve metni saklar; stil, konum veya animasyon içermez");
  };
  const cancelCapcutImport = () => {
    if (capcutBusyRef.current) return;
    const token = capcutImportRef.current?.selection.token;
    capcutImportRef.current = null;
    setCapcutImport(null);
    setModal(null);
    if (token)
      void window.editorAPI?.discardCapcutProject(token).catch(() => {});
  };
  const finishCapcutImport = async (
    pending: PendingCapcutImport,
    timelineId?: string,
  ) => {
    if (!window.editorAPI) return;
    capcutBusyRef.current = true;
    setCapcutBusy(true);
    try {
      const result = await window.editorAPI.readCapcutDraft(
        pending.selection.token,
        timelineId,
      );
      const imported = importCapcutDraft(result.text, { name: result.name });
      const loaded: MediaAsset[] = [];
      for (const asset of imported.project.assets) {
        try {
          const probed = (await window.editorAPI.importMedia([asset.path]))[0];
          if (!probed) throw new Error("Medya okunamıyor");
          loaded.push({ ...asset, ...probed, id: asset.id, kind: asset.kind });
        } catch {
          loaded.push({
            ...asset,
            missing: true,
            url: `cevikedit-media://asset?path=${encodeURIComponent(asset.path)}`,
          });
        }
      }
      const latest = useEditorStore.getState();
      if (latest.project.id !== pending.capturedProject.id) {
        notify("Proje değişti, CapCut taslağını geçerli projeye yeniden aktarın.");
        return;
      }
      if (latest.project !== pending.capturedProject && !confirmReplace())
        return;
      imported.project.assets = loaded;
      s.setProject(imported.project);
      notify([...new Set([...result.warnings, ...imported.warnings])].join(" "));
    } finally {
      await window.editorAPI
        .discardCapcutProject(pending.selection.token)
        .catch(() => {});
      capcutImportRef.current = null;
      setCapcutImport(null);
      setModal((value) => (value === "capcut" ? null : value));
      capcutBusyRef.current = false;
      setCapcutBusy(false);
    }
  };
  const importDraft = async (mode: "file" | "directory" = "file") => {
    setFileMenu(false);
    if (capcutBusyRef.current || capcutImportRef.current) {
      notify("Önce geçerli CapCut projesinin içe aktarımını tamamlayın.");
      return;
    }
    if (!window.editorAPI && mode === "directory") {
      notify("CapCut proje klasörünü içe aktarmak için masaüstü sürümü gerekir.");
      return;
    }
    if (!confirmReplace()) return;
    if (!window.editorAPI) {
      setSubtitleAction("draft");
      subtitleInput.current?.click();
      return;
    }
    const capturedProject = useEditorStore.getState().project;
    capcutBusyRef.current = true;
    setCapcutBusy(true);
    try {
      const selection = await window.editorAPI.chooseCapcutProject(mode);
      if (!selection) return;
      const pending = { selection, capturedProject };
      capcutImportRef.current = pending;
      if (selection.requiresTimelineChoice) {
        setCapcutImport(pending);
        setCapcutTimelineId(
          selection.recommendedTimelineId ?? selection.timelines[0]?.id ?? "",
        );
        setModal("capcut");
      } else {
        await finishCapcutImport(pending, selection.recommendedTimelineId);
      }
    } finally {
      capcutBusyRef.current = false;
      setCapcutBusy(false);
    }
  };
  const applySceneTransition = (transition: TransitionId, seconds: number) => {
    if (!active) throw new Error("Bir görüntü klibi seçin");
    const result = applyTransition(s.project, active.id, transition, seconds);
    s.commit(result.project);
    notify(transition === "dissolve"
      ? `${result.duration.toFixed(2)} sn'lik çapraz geçiş eklendi (sonraki klip erkene ötelenir)`
      : `${result.duration.toFixed(2)} sn'lik geçiş eklendi; geri alınabilir`);
  };
  /** Appends library assets one after another, starting at the playhead. */
  const appendAssets = (assetIds: string[]) => {
    let cursor = s.playhead;
    for (const assetId of assetIds) {
      const asset = useEditorStore
        .getState()
        .project.assets.find((a) => a.id === assetId);
      if (!asset || asset.missing) continue;
      useEditorStore.getState().addAssetClip(assetId, cursor);
      cursor += asset.duration > 0 ? asset.duration : 3;
    }
    if (assetIds.length)
      notify(
        assetIds.length === 1
          ? "Medya zaman çizelgesine eklendi"
          : `${assetIds.length} medya arka arkaya eklendi`,
      );
  };
  /**
   * Applies a creative-library item dropped on the timeline. Transitions attach
   * to the clip that ends where the drop landed; effects and motions patch the
   * clip under the pointer; text templates create a new text clip.
   */
  const applyDroppedPreset = (
    preset: LibraryPreset,
    target: { clipId?: string; time: number; trackId?: string },
  ) => {
    const current = useEditorStore.getState();
    const project = current.project;
    const clip =
      (target.clipId
        ? project.clips.find((c) => c.id === target.clipId)
        : undefined) ??
      project.clips.find(
        (c) =>
          (!target.trackId || c.trackId === target.trackId) &&
          c.start <= target.time &&
          target.time < c.start + c.duration,
      ) ??
      project.clips.find(
        (c) =>
          (!target.trackId || c.trackId === target.trackId) &&
          Math.abs(c.start + c.duration - target.time) < 1e-6,
      );
    if (preset.kind === "text") {
      const template = TEXT_PRESETS.find((p) => p.id === preset.id);
      if (!template) throw new Error("Metin şablonu bulunamadı");
      const result = addTextPreset(project, template, target.time);
      current.commit(result.project);
      current.select([result.clip.id]);
      notify(`${template.name} metni eklendi`);
      return;
    }
    if (!clip) {
      notify("Önce bir klip seçin veya geçişi bir klibin üzerine bırakın");
      return;
    }
    if (project.tracks.find((t) => t.id === clip.trackId)?.locked) {
      notify("Kanal kilitli");
      return;
    }
    if (preset.kind === "transition") {
      const track = project.tracks.find((t) => t.id === clip.trackId);
      if (clip.text || track?.kind === "audio") {
        notify("Geçişler yalnızca görüntü kliplerine uygulanır");
        return;
      }
      // A transition belongs to the clip that ends at the drop point.
      const previous = project.clips
        .filter(
          (c) =>
            c.trackId === clip.trackId &&
            !c.text &&
            Math.abs(c.start + c.duration - clip.start) < 1e-6,
        )
        .at(0);
      const owner = previous ?? clip;
      const result = applyTransition(
        project,
        owner.id,
        preset.id as TransitionId,
        preset.seconds ?? 0.5,
      );
      current.commit(result.project);
      notify(`${result.duration.toFixed(2)} sn'lik geçiş eklendi`);
      return;
    }
    if (preset.kind === "motion") {
      current.updateClip(clip.id, motionPatch(clip, preset.id as MotionId, project));
      notify("Hareket uygulandı");
      return;
    }
    const colorPreset = COLOR_PRESETS.find((p) => p.id === preset.id);
    if (!colorPreset) throw new Error("Efekt bulunamadı");
    current.updateClip(clip.id, presetPatch(colorPreset, clip));
    notify(`${colorPreset.name} uygulandı`);
  };
  const renderMediaLibrary = (audioOnly: boolean) => (
    <MediaLibrary
      project={
        audioOnly
          ? {
              ...s.project,
              assets: s.project.assets.filter((a) => a.kind === "audio"),
            }
          : s.project
      }
      onImport={(paths) => void safe(() => importMedia(paths))}
      onPreviewAsset={(assetId) => {
        s.setPlaying(false);
        setSourceAssetId(assetId);
      }}
      onAddAsset={(assetId) => {
        setSourceAssetId(null);
        s.addAssetClip(assetId);
      }}
      onAddAssets={(assetIds) => {
        setSourceAssetId(null);
        appendAssets(assetIds);
      }}
      onRemoveAsset={(assetId) => void safe(() => s.removeAsset(assetId))}
      importing={importing}
      onDropFiles={(files) => void safe(() => importDropped(files))}
      onImportFiles={(files) =>
        void safe(async () => s.addAssets(await browserAssets(files)))
      }
      onRevealAsset={(assetId) =>
        void safe(() => {
          const asset = s.project.assets.find((a) => a.id === assetId);
          if (asset?.missing) return relink(asset);
          if (asset && window.editorAPI)
            return window.editorAPI.revealPath(asset.path);
        })
      }
    />
  );
  return (
    <div
      className="app-shell"
      style={{
        gridTemplateRows: `44px minmax(180px,1fr) ${timelineHeight}px 26px`,
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!dropActive) setDropActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDropActive(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropActive(false);
        const files = Array.from(e.dataTransfer.files);
        void safe(async () => {
          if (window.editorAPI) {
            if (await importDropped(files)) return;
            await importMedia(
              files
                .map((file) => window.editorAPI!.getPathForFile(file))
                .filter(Boolean),
            );
          } else s.addAssets(await browserAssets(files));
        });
      }}
    >
      {dropActive && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-card">
            <Upload size={30} />
            <strong>Medyayı bırakın</strong>
            <span>Video, ses ve görseller proje medyasına eklenir</span>
          </div>
        </div>
      )}
      <header className="titlebar">
        <div className="brand">
          <span className="brand-icon">
            <img src="./icons/cevikedit.png" alt="" />
          </span>
          <strong>CevikEdit</strong>
        </div>
        <div className="titlebar-menus">
          <div className="file-menu-container">
            <button
              aria-label="Dosya menüsü"
              onClick={() => setFileMenu(!fileMenu)}
            >
              Dosya
              <ChevronDown size={12} />
            </button>
            {fileMenu && (
              <div className="file-menu">
                {[
                  ["new", "Yeni proje", "⌘N"],
                  ["open", "Proje aç", "⌘O"],
                  ["save", "Projeyi kaydet", "⌘S"],
                  ["save-as", "Farklı kaydet", "⇧⌘S"],
                  ["import", "Medya içe aktar", "⌘I"],
                  ["export", "Videoyu dışa aktar", "⌘E"],
                ].map(([action, label, shortcut]) => (
                  <button
                    key={action}
                    onClick={() => void safe(() => handleAction(action))}
                  >
                    {label}
                    <kbd>{shortcut}</kbd>
                  </button>
                ))}
                <hr />
                <button onClick={() => { setFileMenu(false); setModal("package"); }}>Proje medyasını topla…</button>
                <button onClick={() => void safe(() => importDraft("file"))}>
                  CapCut taslak dosyası içe aktar<span>Deneysel</span>
                </button>
                <button
                  onClick={() => void safe(() => importDraft("directory"))}
                >
                  CapCut proje klasörü içe aktar<span>Deneysel</span>
                </button>
                <button onClick={() => void safe(() => exportDraftFile())}>
                  Taslak değişim dosyasını dışa aktar (JSON)<span>taşınabilir</span>
                </button>              </div>
            )}
          </div>
          <button onClick={() => setModal("shortcuts")}>Kısayollar</button>
        </div>
        <div className="project-title">
          <input
            aria-label="Proje adı"
            value={s.project.name}
            onFocus={() => s.beginTransaction()}
            onBlur={() => s.endTransaction()}
            onChange={(e) => s.updateProject({ name: e.target.value })}
          />
          <span
            title={s.dirty ? "Kaydedilmemiş değişiklik var" : "Kaydedildi"}
            className={`save-dot ${s.dirty ? "dirty" : ""}`}
          />
        </div>
        <div className="titlebar-actions">
          <button aria-label="Düzenleme asistanı" className={assistantOpen ? "active" : ""} onClick={() => setAssistantOpen(!assistantOpen)}><MessageSquare size={15} />Asistan</button>
          <span className="offline-pill">
            <CloudOff size={12} />
            Çevrimdışı düzenleme
          </span>
          <button
            title="Projeyi kaydet ⌘S"
            aria-label="Projeyi kaydet"
            onClick={() => void safe(() => save())}
          >
            <Save size={16} />
          </button>
          <button
            title="Ayarlar"
            aria-label="Ayarlar"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={16} />
          </button>
          <button
            className="primary export-button"
            onClick={() => {
              s.setPlaying(false);
              setModal("export");
            }}
          >
            <Upload size={15} />
            Dışa aktar
          </button>
        </div>
      </header>
      <EditorWorkspace assistantOpen={assistantOpen}>
        <section className="resource-panel panel">
          <nav className="resource-tabs">
            {[
              ["Medya", Video],
              ["Ses", Music2],
              ["Metin", Type],
              ["Çıkartma", Shapes],
              ["Efekt", WandSparkles],
              ["Geçiş", Sparkles],
              ["Altyazı", Subtitles],
              ["Şablonlar", LayoutTemplate],
            ].map(([label, Icon]) => (
              <button
                key={label as string}
                className={tab === label ? "active" : ""}
                onClick={() => setTab(label as string)}
              >
                {typeof Icon !== "string" && <Icon size={19} />}
                <span>{label as string}</span>
              </button>
            ))}
          </nav>
          <div className="resource-body">
            {tab === "Çıkartma" && <AssetLibrary onAdd={addBuiltin} addingId={addingBuiltin} />}
            {tab === "Medya" && renderMediaLibrary(false)}
            {tab === "Ses" && (
              <div className="audio-tab">
                <div className="audio-library">{renderMediaLibrary(true)}</div>
                <AudioTools />
              </div>
            )}
            {tab === "Metin" && <TextLibrary onAdd={addStyledText} onBlank={s.addText} />}
            {tab === "Altyazı" && <SubtitlePanel onImport={() => safe(readSubtitles)} onExport={() => safe(exportSubtitles)} />}
            {tab === "Şablonlar" && <TemplatesLibrary />}
            {tab === "Efekt" && (
              <EffectsPanel
                clip={active}
                project={s.project}
                kind={activeTrack?.kind}
                locked={activeTrack?.locked}
                onApply={(patch) => {
                  if (active) s.updateClip(active.id, patch);
                  else notify("Önce zaman çizelgesinden bir klip seçin");
                }}
              />
            )}
            {tab === "Geçiş" && <TransitionLibrary
              disabled={!active || !!active.text || activeTrack?.kind === "audio" || !!activeTrack?.locked}
              onApply={(transition,seconds)=>void safe(()=>applySceneTransition(transition,seconds))}
            />}
          </div>
        </section>
        {sourceAsset ? <SourcePreview
          asset={sourceAsset}
          fps={s.project.fps}
          mode={placementMode}
          onModeChange={setPlacementMode}
          onClose={() => setSourceAssetId(null)}
          onAddRange={(sourceIn, duration, mode) => void safe(() => {
            s.addAssetClip(
              sourceAsset.id,
              mode === "append" ? undefined : s.playhead,
              undefined,
              { sourceIn, duration },
              mode === "append" ? undefined : mode,
            );
            setSourceAssetId(null);
            notify(mode === "append"
              ? "Klip kanal sonuna eklendi; geri alınabilir"
              : mode === "insert"
                ? "Klip oynatma konumuna eklendi, sonraki klipler kaydırıldı; geri alınabilir"
                : "Klip oynatma konumundaki kanal aralığını kapladı; geri alınabilir");
          })}
        /> : <Player
          project={s.project}
          selectedIds={s.selectedIds}
          playhead={s.playhead}
          playing={s.playing}
          onSelect={s.select}
          onUpdateClip={s.updateClip}
          onSeek={s.seek}
          onPlayingChange={s.setPlaying}
        />}
        {assistantOpen ? <AssistantPanel onClose={() => setAssistantOpen(false)} /> : <Inspector
          project={s.project}
          clip={active}
          playhead={s.playhead}
          onUpdate={(patch) => active && s.updateClip(active.id, patch)}
          onProjectUpdate={s.updateProject}
          onSeparateAudio={active ? () => void separateAudio(active) : undefined}
          onDetachLink={active ? () => s.detachLinks(s.selectedIds) : undefined}
          separating={separating}
          onReverse={active ? () => void reverseClip(active) : undefined}
          onCancelReverse={reverseJob ? () => void cancelReverse() : undefined}
          reversing={!!reverseJob}
          reverseProgress={reverseJob?.progress}
          onFreezeFrame={active ? (duration) => void addFreezeFrame(duration) : undefined}
          freezing={freezing}
        />}
      </EditorWorkspace>
      <div className="timeline-pane">
        <div
          className="timeline-resize"
          role="separator"
          tabIndex={0}
          aria-label="Zaman çizelgesi yüksekliğini ayarla"
          aria-orientation="horizontal"
          aria-valuenow={Math.round(timelineHeight)}
          aria-valuemin={190}
          aria-valuemax={Math.max(190, window.innerHeight - 290)}
          title="Yüksekliği ayarlamak için sürükleyin"
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              resizeTimeline(
                timelineHeight + (event.key === "ArrowUp" ? 20 : -20),
              );
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            timelineResize.current = {
              y: event.clientY,
              height: timelineHeight,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = timelineResize.current;
            if (drag) resizeTimeline(drag.height + drag.y - event.clientY);
          }}
          onPointerUp={(event) => {
            timelineResize.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            timelineResize.current = null;
          }}
        />
        <Timeline
          project={s.project}
          selectedIds={s.selectedIds}
          playhead={s.playhead}
          playing={s.playing}
          zoom={s.zoom}
          onSeek={(time) => { setSourceAssetId(null); s.seek(time); }}
          onSelect={(ids) => { setSourceAssetId(null); s.select(ids); }}
          onClipUpdate={s.updateClip}
          onMoveClips={s.moveClips}
          onTrim={s.trim}
          onSplit={s.split}
          onDelete={s.deleteSelected}
          onZoom={s.setZoom}
          onTrackUpdate={s.updateTrack}
          onTrackDelete={s.deleteTrack}
          onTrackMove={s.reorderTrack}
          onAddTrack={s.addTrack}
          onDropAsset={(assetId, time, trackId) => {
            setSourceAssetId(null);
            // The store picks a compatible lane and creates one when needed.
            useEditorStore.getState().addAssetClip(assetId, time, trackId);
            const asset = useEditorStore
              .getState()
              .project.assets.find((a) => a.id === assetId);
            if (asset)
              notify(
                `${asset.name} ${asset.kind === "audio" ? "ses" : "video"} kanalına eklendi`,
              );
          }}
          onDropAssets={(assetIds, time, trackId) => {
            setSourceAssetId(null);
            const project = useEditorStore.getState().project;
            const dropped = assetIds
              .map((id) => project.assets.find((a) => a.id === id))
              .filter((asset): asset is MediaAsset => !!asset && !asset.missing);
            // Mixed selections fan out: audio to audio lanes, everything else to
            // video lanes. Each lane keeps its own running cursor.
            const cursors = new Map<string, number>();
            for (const group of groupAssetsByLane(dropped)) {
              const lane = resolveDropTrack(
                useEditorStore.getState().project.tracks,
                group.lane,
                trackId,
              )?.id;
              const key = lane ?? `new-${group.lane}`;
              let cursor = cursors.get(key) ?? time;
              for (const asset of group.assets) {
                useEditorStore.getState().addAssetClip(asset.id, cursor, lane);
                cursor += asset.duration > 0 ? asset.duration : 3;
              }
              cursors.set(key, cursor);
            }
            notify(
              dropped.length === 1
                ? "Medya zaman çizelgesine eklendi"
                : `${dropped.length} medya uygun kanallara eklendi`,
            );
          }}
          onDropPreset={(preset, target) =>
            void safe(() => applyDroppedPreset(preset, target))
          }
          onDropBuiltin={(builtinId, time, trackId) =>
            void safe(async () => {
              if (!window.editorAPI) return;
              const imported = await window.editorAPI.importBuiltinAsset(builtinId);
              if (!imported) throw new Error("Yerleşik medya içe aktarılamadı");
              useEditorStore.getState().addAssets([imported]);
              const lane = resolveDropTrack(
                useEditorStore.getState().project.tracks,
                imported.kind === "audio" ? "audio" : "video",
                trackId,
              );
              useEditorStore
                .getState()
                .addAssetClip(imported.id, time, lane?.id);
              notify(`${imported.name} zaman çizelgesine eklendi`);
            })
          }
          snapping={s.snapping}
          onSnappingChange={s.setSnapping}
          magnetic={s.magnetic}
          onMagneticChange={s.setMagnetic}
          onDuplicate={s.duplicate}
          onAddText={s.addText}
          onUndo={s.undo}
          onRedo={s.redo}
          canUndo={s.past.length > 0}
          canRedo={s.future.length > 0}
        />
      </div>
      <footer className="app-status">
        <span>
          <span className="status-dot" />{" "}
          {window.editorAPI ? "Masaüstü sürümü" : "Tarayıcı önizlemesi"} ·{" "}
          {s.project.assets.length} medya · {s.project.clips.length} klip
        </span>
        <div>
          {active?.assetId &&
            s.project.assets.find((a) => a.id === active.assetId)?.hasAudio &&
            s.project.assets.find((a) => a.id === active.assetId)?.kind ===
              "video" && (
              <button
                disabled={separating}
                onClick={() => void separateAudio(active)}
              >
                {separating ? "Ses ayrılıyor…" : "Sesi ayır"}
              </button>
            )}
          {s.project.assets.some((a) => a.missing) && (
            <button
              onClick={() =>
                void safe(() =>
                  relink(s.project.assets.find((a) => a.missing)!),
                )
              }
            >
              Eksik medyayı yeniden bağla
            </button>
          )}
          <span>{s.dirty ? "Kaydedilmedi · otomatik kurtarma açık" : "Proje hazır"}</span>
          <button title="Son projeler" onClick={() => setModal("settings")}>
            <FolderOpen size={12} />
          </button>
        </div>
      </footer>
      <UpdateBanner updater={updater} />
      {toast && (
        <div role="status" className="toast">
          <Info size={16} />
          <span>{toast}</span>
          <button aria-label="Bildirimi kapat" onClick={() => setToast("")}>
            <X size={13} />
          </button>
        </div>
      )}
      {modal === "package" && <PackageDialog project={clone(s.project)} onClose={() => setModal(null)} />}
      {modal === "export" && (
        <ExportDialog
          project={s.project}
          selectedIds={s.selectedIds}
          onClose={() => setModal(null)}
          notify={notify}
        />
      )}
      {modal === "capcut" && capcutImport && (
        <ModalShell title="CapCut zaman çizelgesini seçin" onClose={cancelCapcutImport}>
          <div className="modal-body">
            <p>
              <strong>{capcutImport.selection.name}</strong>{" "}
              Birden fazla zaman çizelgesi içeriyor; içe aktarılacak içeriği seçin.
            </p>
            <label>
              Zaman çizelgesi
              <select
                aria-label="CapCut zaman çizelgesi"
                value={capcutTimelineId}
                disabled={capcutBusy}
                onChange={(event) => setCapcutTimelineId(event.target.value)}
              >
                {capcutImport.selection.timelines.map((timeline) => (
                  <option key={timeline.id} value={timeline.id}>
                    {timeline.name}
                    {timeline.isActive ? " · şu anda düzenleniyor" : ""}
                    {timeline.isMain ? " · ana zaman çizelgesi" : ""}
                  </option>
                ))}
              </select>
            </label>
            {capcutImport.selection.warnings.map((warning) => (
              <p className="muted" key={warning}>
                {warning}
              </p>
            ))}
            <p className="muted">İçe aktardıktan sonra görüntüyü, metni ve efektleri kontrol edin.</p>
          </div>
          <footer>
            <button disabled={capcutBusy} onClick={cancelCapcutImport}>
              İptal
            </button>
            <button
              className="primary"
              disabled={capcutBusy || !capcutTimelineId}
              onClick={() =>
                void safe(() =>
                  finishCapcutImport(capcutImport, capcutTimelineId),
                )
              }
            >
              {capcutBusy ? "İçe aktarılıyor…" : "Seçili zaman çizelgesini içe aktar"}
            </button>
          </footer>
        </ModalShell>
      )}
      {modal === "shortcuts" && (
        <ModalShell title="Klavye kısayolları" onClose={() => setModal(null)}>
          <div className="shortcut-list">
            {shortcuts.map(([action, keys]) => (
              <div key={action}>
                <span>{action}</span>
                <kbd>{keys}</kbd>
              </div>
            ))}
          </div>
          <footer>
            <span className="muted small">
              Windows / Linux üzerinde ⌘ yerine Ctrl kullanın
            </span>
            <button className="primary" onClick={() => setModal(null)}>
              Anladım
            </button>
          </footer>
        </ModalShell>
      )}
      {modal === "about" && (
        <ModalShell title="CevikEdit hakkında" onClose={() => setModal(null)}>
          <div className="about-body">
            <div className="about-logo">
              <img src="./icons/cevikedit.png" width="58" height="58" alt="CevikEdit simgesi" />
            </div>
            <h2>CevikEdit</h2>
            <span>{appVersion} · Bağımsız açık kaynak masaüstü video düzenleyici</span>
            <p>
              Tümüyle yerel düzenleme için gözlemlenebilir kurgu akışlarını inceler ve bağımsız
              kodla uygular. Çekirdek kaynak MIT lisanslıdır. macOS kurulumu FFmpeg / FFprobe ve
              x264 (GPL-2.0-or-later) içerir; ilgili kaynak, derleme betikleri ve lisans dosyaları
              uygulama kaynaklarının media-tools dizinindedir.
            </p>
            <p className="muted">
              Resmî bir CapCut ürünü değildir. CapCut'a ait tescilli kod, kütüphane veya materyal içermez.
            </p>
          </div>
          <footer>
            <button className="primary" onClick={() => setModal(null)}>
              Kapat
            </button>
          </footer>
        </ModalShell>
      )}
      {modal === "settings" && (
        <ModalShell title="Ayarlar ve son projeler" onClose={() => setModal(null)}>
          <div className="modal-body">
            <h3>Yerel oluşturma motoru</h3>
            <div className={`engine-status ${system.ffmpeg ? "ready" : ""}`}>
              {system.ffmpeg ? <CheckCircle2 size={18} /> : <Info size={18} />}
              <div>
                <strong>
                  {system.ffmpeg ? "FFmpeg hazır" : "FFmpeg / FFprobe bulunamadı"}
                </strong>
                <span>
                  {system.ffmpegVersion ??
                    "Uygulamanın eksiksiz olduğunu kontrol edin veya buradan özel FFmpeg / FFprobe seçin."}
                </span>
              </div>
            </div>
            <p className="muted small">
              {system.ffmpegPath ?? "macOS kurulumu varsayılan olarak yerleşik motoru kullanır; ayrıca kurulum gerekmez."}
            </p>
            <div className="button-row">
              <button
                onClick={() =>
                  void safe(async () => {
                    await window.editorAPI?.chooseMediaTool("ffmpeg");
                    await refreshSystem();
                  })
                }
              >
                FFmpeg seç
              </button>
              <button
                onClick={() =>
                  void safe(async () => {
                    await window.editorAPI?.chooseMediaTool("ffprobe");
                    await refreshSystem();
                  })
                }
              >
                FFprobe seç
              </button>
            </div>
            <UpdateSettings updater={updater} />
            <h3>Son projeler</h3>            {recent.length === 0 ? (
              <p className="muted small">Proje kaydettiğinizde veya açtığınızda burada görünür.</p>
            ) : (
              <div className="recent-list">
                {recent.map((p) => (
                  <button
                    key={p.path}
                    onClick={() =>
                      void safe(async () => {
                        if (!confirmReplace()) return;
                        const result =
                          await window.editorAPI?.openRecentProject(p.path);
                        if (result) {
                          s.setProject(result.project, result.path);
                          setModal(null);
                        }
                      })
                    }
                  >
                    <FolderOpen size={16} />
                    <div>
                      <strong>{p.name}</strong>
                      <span>{p.path}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="future-feature">
              <CloudOff size={16} />
              <div>
                <strong>Bulut ve API yapay zekâsı</strong>
                <p>Henüz bağlı değil; bu sürüm yalnızca yerel düzenleme yapar.</p>
              </div>
            </div>
          </div>
          <footer>
            <button onClick={() => setModal("about")}>Hakkında</button>
            <button className="primary" onClick={() => setModal(null)}>
              Tamam
            </button>
          </footer>
        </ModalShell>
      )}
      {recover && (
        <ModalShell
          title="Son düzenlemeyi geri yükle"
          onClose={() => {
            setRecover(null);
          }}
        >
          <div className="modal-body">
            <p>
              Bu cihazda otomatik kaydedilmiş proje: <strong>{recover.name}</strong> · içinde{" "}
              {recover.clips.length} klip var.
            </p>
            <p className="muted">Geri yükledikten sonra düzenlemeye devam edebilir ve proje dosyası olarak kaydedebilirsiniz.</p>
          </div>
          <footer>
            <button onClick={() => setRecover(null)}>Boş proje oluştur</button>
            <button
              className="primary"
              onClick={() => {
                s.setProject(recover);
                setRecover(null);
                notify("Son düzenleme geri yüklendi");
              }}
            >
              Projeyi geri yükle
            </button>
          </footer>
        </ModalShell>
      )}
      <input
        ref={subtitleInput}
        type="file"
        style={{ display: "none" }}
        accept={subtitleAction === "draft" ? ".json" : ".srt,.vtt"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void safe(async () => {
              const text = await file.text();
              if (subtitleAction === "draft") {
                const imported = importCapcutDraft(text);
                s.setProject(imported.project);
                notify(imported.warnings.join(" "));
              } else {
                const cues = parseSubtitles(text);
                if (!cues.length) throw new Error("Altyazı dosyasında geçerli altyazı yok");
                s.addSubtitles(cues);
              }
            });
          e.target.value = "";
        }}
      />
    </div>
  );
  async function relink(asset: MediaAsset) {
    if (!window.editorAPI) return;
    const projectId = useEditorStore.getState().project.id;
    const result = await window.editorAPI.relinkAsset(asset);
    if (!result) return;
    // A separated audio layer still references the same video source. Relink every
    // reference together, preserving its role and identity within the project.
    let source = result;
    if (
      result.kind === "audio" &&
      useEditorStore
        .getState()
        .project.assets.some((a) => a.path === asset.path && a.kind === "video")
    )
      source = (await window.editorAPI.importMedia([result.path]))[0] ?? result;
    const current = useEditorStore.getState();
    if (current.project.id !== projectId) return;
    if (current.project.assets.some((a) => a.id === asset.id))
      current.commit({
        ...current.project,
        assets: current.project.assets.map((a) =>
          a.path === asset.path
            ? {
                ...source,
                id: a.id,
                name: a.name,
                kind: a.kind,
                ...(a.kind === "audio"
                  ? { width: 0, height: 0, thumbnail: undefined }
                  : {}),
              }
            : a,
        ),
      });
  }
}
