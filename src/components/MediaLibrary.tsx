import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  AudioLines,
  Check,
  FileImage,
  Film,
  FolderOpen,
  Grid2X2,
  Image,
  List,
  LoaderCircle,
  MoreHorizontal,
  Music2,
  Plus,
  Play,
  Search,
  Trash2,
  Upload,
  X,
  Eye,
} from "lucide-react";
import type { MediaAsset, MediaKind, Project } from "../core/types";
import { ASSET_DRAG_TYPE, ASSET_IDS_DRAG_TYPE } from "./Timeline";
import "./MediaLibrary.css";

export interface MediaLibraryProps {
  project: Project;
  onImport: (paths?: string[]) => void;
  onAddAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  importing?: boolean;
  onImportFiles?: (files: File[]) => void;
  /** Append several library assets to the timeline in one action. */
  onAddAssets?: (ids: string[]) => void;
  onDropFiles?: (files: File[]) => void;
  onRevealAsset?: (assetId: string) => void;
  onPreviewAsset?: (assetId: string) => void;
}
export function formatMediaDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
function KindIcon({ kind, size = 12 }: { kind: MediaKind; size?: number }) {
  return kind === "audio" ? (
    <Music2 size={size} />
  ) : kind === "image" ? (
    <Image size={size} />
  ) : (
    <Film size={size} />
  );
}

export default function MediaLibrary({
  project,
  onImport,
  onAddAsset,
  onRemoveAsset,
  importing = false,
  onImportFiles,
  onDropFiles,
  onAddAssets,
  onRevealAsset,
  onPreviewAsset,
}: MediaLibraryProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MediaKind | "all">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<string[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const dragCounter = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Anchor for Shift+click range selection. */
  const rangeAnchor = useRef<string | null>(null);
  useEffect(() => {
    setSelected([]);
    setMenu(null);
    setQuery("");
    rangeAnchor.current = null;
  }, [project.id]);
  const filtered = project.assets.filter(
    (asset) =>
      (kind === "all" || asset.kind === kind) &&
      asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const selectedSet = new Set(selected);
  /** Click behaviour mirrors a file manager: plain replaces, Ctrl toggles, Shift extends. */
  const selectAsset = (
    id: string,
    event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => {
    if (event.shiftKey && rangeAnchor.current) {
      const from = filtered.findIndex((a) => a.id === rangeAnchor.current);
      const to = filtered.findIndex((a) => a.id === id);
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        setSelected(filtered.slice(start, end + 1).map((a) => a.id));
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        rangeAnchor.current = id;
        return [...next];
      });
      return;
    }
    rangeAnchor.current = id;
    setSelected([id]);
  };
  const startImport = () => {
    if (!window.editorAPI && onImportFiles) fileInput.current?.click();
    else onImport();
  };
  const receiveFiles = (files: File[]) => {
    if (!files.length) return;
    if (window.editorAPI) {
      if (onDropFiles) {
        onDropFiles(files);
        return;
      }
      const paths = files
        .map((file) => window.editorAPI!.getPathForFile(file))
        .filter(Boolean);
      if (paths.length) onImport(paths);
    } else onImportFiles?.(files);
  };
  const dropFiles = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setDraggingFiles(false);
    receiveFiles(Array.from(event.dataTransfer.files));
  };
  const item = (asset: MediaAsset) => {
    const inTimeline = project.clips.some((c) => c.assetId === asset.id);
    const isSelected = selectedSet.has(asset.id);
    return (
      <div
        key={asset.id}
        data-asset-id={asset.id}
        role="button"
        tabIndex={0}
        aria-label={`${asset.name}, ${asset.kind === "audio" ? "Ses" : asset.kind === "image" ? "Görsel" : "Video"}${asset.missing ? ", dosya eksik" : ""}`}
        aria-pressed={isSelected}
        className={`media-item media-item-${asset.kind} ${isSelected ? "is-selected" : ""} ${asset.missing ? "is-missing" : ""}`}
        draggable={!asset.missing}
        onDragStart={(event) => {
          // Dragging one item of a multi-selection carries the whole selection.
          const batch =
            isSelected && selected.length > 1 ? selected : [asset.id];
          event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
          event.dataTransfer.setData(ASSET_IDS_DRAG_TYPE, JSON.stringify(batch));
          event.dataTransfer.setData(
            `application/x-cevikedit-kind-${asset.kind}`,
            asset.kind,
          );
          event.dataTransfer.effectAllowed = "copy";
          if (!isSelected) {
            setSelected([asset.id]);
            rangeAnchor.current = asset.id;
          }
          setMenu(null);
        }}
        onClick={(event) => {
          // Selection is the primary action so several assets can be picked;
          // the preview lives on its own button and on Space / context menu.
          selectAsset(asset.id, event);
          setMenu(null);
        }}
        onDoubleClick={(event) => {
          if (
            !(event.target as HTMLElement).closest("button") &&
            !asset.missing
          )
            onAddAsset(asset.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!isSelected) {
            setSelected([asset.id]);
            rangeAnchor.current = asset.id;
          }
          setMenu(asset.id);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === " " && onPreviewAsset) {
            event.preventDefault();
            event.stopPropagation();
            setSelected([asset.id]);
            onPreviewAsset(asset.id);
          }
          if (event.key === "Enter" && !asset.missing) {
            event.preventDefault();
            onAddAsset(asset.id);
          }
          if (event.key === "Delete") {
            event.preventDefault();
            onRemoveAsset(asset.id);
          }
        }}
      >
        <div className="media-preview">
          {asset.kind !== "audio" &&
          (asset.thumbnail || asset.kind === "image") ? (
            <img
              src={asset.thumbnail || asset.url}
              alt=""
              draggable={false}
              loading="lazy"
            />
          ) : (
            <div className="media-placeholder">
              {asset.kind === "audio" ? (
                <AudioLines size={27} />
              ) : (
                <Film size={27} />
              )}
            </div>
          )}
          {asset.kind === "audio" && asset.waveform && (
            <div className="media-audio-wave" aria-hidden="true">
              {Array.from({ length: 40 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height: `${8 + (asset.waveform![Math.floor((i / 40) * asset.waveform!.length)] ?? 0.3) * 75}%`,
                  }}
                />
              ))}
            </div>
          )}
          <span className="media-kind">
            <KindIcon kind={asset.kind} />
          </span>
          {asset.hdr && (
            <span
              className="asset-badge-hdr"
              title={
                asset.hdrKind === "hlg"
                  ? "HLG kaynak: SDR BT.709'a ton eşlenir"
                  : "HDR kaynak: SDR BT.709'a ton eşlenir"
              }
            >
              {asset.hdrKind === "hlg" ? "HLG" : "HDR"}
            </span>
          )}
          <span className="media-time">
            {asset.kind === "image"
              ? "Görsel"
              : formatMediaDuration(asset.duration)}
          </span>
          {inTimeline && (
            <span className="media-used" title="Zaman çizelgesinde kullanılıyor">
              <Check size={10} />
            </span>
          )}
          {asset.missing && <span className="media-missing">Dosya eksik</span>}
          {onPreviewAsset && (
            <button
              className="media-preview-btn"
              aria-label={`${asset.name} medyasını önizle`}
              title="Kaynak önizlemesi · Space"
              onClick={(event) => {
                event.stopPropagation();
                setSelected([asset.id]);
                onPreviewAsset(asset.id);
              }}
            >
              <Eye size={14} />
            </button>
          )}
          <button
            className="media-add"
            aria-label={`${asset.name} medyasını zaman çizelgesine ekle`}
            title="Oynatma konumuna ekle · medyaya çift tıklayın"
            disabled={asset.missing}
            onClick={(event) => {
              event.stopPropagation();
              onAddAsset(asset.id);
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="media-info">
          <span className="media-name" title={asset.name}>
            {asset.name}
          </span>
          <span className="media-metadata">
            {asset.kind === "audio"
              ? "Ses"
              : `${asset.width} × ${asset.height}`}{" "}
            {asset.kind === "video" && asset.fps > 0
              ? `· ${Math.round(asset.fps * 100) / 100} fps`
              : ""}
          </span>
        </div>
        <button
          className="media-more"
          title="Medya işlemleri"
          aria-label={`${asset.name} İşlem`}
          aria-expanded={menu === asset.id}
          onClick={(event) => {
            event.stopPropagation();
            setMenu(menu === asset.id ? null : asset.id);
            setSelected([asset.id]);
          }}
        >
          <MoreHorizontal size={15} />
        </button>
        {menu === asset.id && (
          <div
            className="media-context"
            onClick={(event) => event.stopPropagation()}
          >
            {onPreviewAsset && <button onClick={() => { onPreviewAsset(asset.id);setMenu(null); }}><Play size={13} /> Medyayı önizle</button>}
            <button
              disabled={asset.missing}
              onClick={() => {
                onAddAsset(asset.id);
                setMenu(null);
              }}
            >
              <Plus size={13} /> Zaman çizelgesine ekle
            </button>
            {onRevealAsset && (
              <button
                onClick={() => {
                  onRevealAsset(asset.id);
                  setMenu(null);
                }}
              >
                <FolderOpen size={13} />{" "}
                {asset.missing ? "Medyayı yeniden bağla" : "Klasörde göster"}
              </button>
            )}
            <button
              className="media-context-remove"
              onClick={() => {
                onRemoveAsset(asset.id);
                setMenu(null);
                if (selectedSet.has(asset.id)) setSelected(selected.filter((id) => id !== asset.id));
              }}
            >
              <Trash2 size={13} /> Kitaplıktan kaldır
            </button>
          </div>
        )}
      </div>
    );
  };
  return (
    <section
      className={`media-library ${draggingFiles ? "is-file-drop" : ""}`}
      aria-label="Yerel medya kitaplığı"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          dragCounter.current++;
          setDraggingFiles(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          dragCounter.current--;
          if (dragCounter.current <= 0) setDraggingFiles(false);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={dropFiles}
    >
      <input
        ref={fileInput}
        className="media-file-input"
        type="file"
        multiple
        accept="video/*,audio/*,image/*,.mkv,.mov,.mp4,.webm,.mp3,.wav,.aac,.flac,.m4a,.ogg"
        onChange={(event) => {
          receiveFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <div className="media-top">
        <div className="media-top-title">
          <FolderOpen size={15} />
          <span>Proje medyası</span>
          <b>{project.assets.length}</b>
        </div>
        <button
          className="media-select-all"
          aria-label="Tüm medyayı seç veya seçimi temizle"
          title="Tüm medyayı seç"
          disabled={!project.assets.length}
          onClick={() => {
            setSelected(
              selected.length === project.assets.length
                ? []
                : project.assets
                    .filter((entry) => !entry.missing)
                    .map((entry) => entry.id),
            );
            rangeAnchor.current = null;
          }}
        >
          {selected.length === project.assets.length && project.assets.length > 0
            ? "Seçimi temizle"
            : "Tümünü seç"}
        </button>
        {selected.length > 1 && onAddAssets && (
          <button
            className="media-add-selected"
            onClick={() => {
              onAddAssets(
                selected.filter((id) =>
                  project.assets.some((a) => a.id === id && !a.missing),
                ),
              );
            }}
          >
            <Plus size={14} /> {selected.length} medyayı ekle
          </button>
        )}
        <button
          className="media-import"
          onClick={startImport}
          disabled={importing}
        >
          {importing ? (
            <LoaderCircle size={13} className="media-spin" />
          ) : (
            <Plus size={13} />
          )}{" "}
          {importing ? "İçe aktarılıyor" : "Medya içe aktar"}
        </button>
      </div>
      <div className="media-tools">
        <div className="media-search">
          <Search size={13} />
          <input
            aria-label="Medya ara"
            placeholder="Medya ara"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button aria-label="Aramayı temizle" onClick={() => setQuery("")}>
              <X size={12} />
            </button>
          )}
        </div>
        <div className="media-view">
          <button
            title="Izgara görünümü"
            aria-label="Izgara görünümü"
            className={view === "grid" ? "is-active" : ""}
            onClick={() => setView("grid")}
          >
            <Grid2X2 size={14} />
          </button>
          <button
            title="Liste görünümü"
            aria-label="Liste görünümü"
            className={view === "list" ? "is-active" : ""}
            onClick={() => setView("list")}
          >
            <List size={15} />
          </button>
        </div>
      </div>
      <div className="media-filters" role="tablist" aria-label="Medya türü">
        {(["all", "video", "audio", "image"] as const).map((value) => (
          <button
            role="tab"
            aria-selected={kind === value}
            key={value}
            className={kind === value ? "is-active" : ""}
            onClick={() => setKind(value)}
          >
            {value === "all"
              ? "Tümü"
              : value === "video"
                ? "Video"
                : value === "audio"
                  ? "Ses"
                  : "Görsel"}
            {value !== "all" && (
              <span>
                {project.assets.filter((a) => a.kind === value).length}
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        className={`media-content media-${view}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setMenu(null);
            setSelected([]);
          }
        }}
      >
        {filtered.length > 0 ? (
          filtered.map(item)
        ) : project.assets.length > 0 ? (
          <div className="media-empty">
            <Search size={26} />
            <strong>Eşleşen medya bulunamadı</strong>
            <p>Başka bir anahtar sözcük veya medya türü deneyin</p>
            <button
              onClick={() => {
                setQuery("");
                setKind("all");
              }}
            >
              Tüm medyayı gör
            </button>
          </div>
        ) : (
          <div className="media-empty">
            <div className="media-empty-illustration">
              <Film size={31} />
              <Music2 size={18} />
              <FileImage size={19} />
            </div>
            <strong>İlhamı buraya bırakın</strong>
            <p>
              Video, ses ve görsel içe aktar
              <br />
              veya yerel dosyaları buraya sürükleyin
            </p>
            <button
              className="media-empty-import"
              onClick={startImport}
              disabled={importing}
            >
              <Upload size={13} /> {importing ? "Medya okunuyor…" : "Medya içe aktar"}
            </button>
            <span>MP4, MOV, MP3, PNG ve benzeri biçimler desteklenir</span>
          </div>
        )}
      </div>
      <div className="media-footer">
        <span>{filtered.length} medya</span>
        <span>Eklemek için çift tıklayın · zaman çizelgesine sürükleyin</span>
      </div>
      {draggingFiles && (
        <div className="media-drop-overlay">
          <Upload size={31} />
          <strong>Medyayı içe aktarmak için bırakın</strong>
          <span>Dosyalar yerelde kalır; düzenlemeye istediğiniz an başlayın</span>
        </div>
      )}
    </section>
  );
}
