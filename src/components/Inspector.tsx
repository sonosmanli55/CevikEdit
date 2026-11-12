import { useEffect, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AudioLines,
  ChevronDown,
  Diamond,
  FlipHorizontal2,
  FlipVertical2,
  Image,
  RotateCcw,
  SlidersHorizontal,
  Type,
  Volume2,
  WandSparkles,
} from "lucide-react";
import type { Clip, Keyframe, Project } from "../core/types";
import { DEFAULT_TRANSFORM, DEFAULT_ADJUSTMENTS } from "../core/defaults";
import { evaluateKeyframes, formatTime, id } from "../core/model";
import VisualTools from "./VisualTools";
import KeyframeEditor from "./KeyframeEditor";
import "./Inspector.css";
import { useEditorStore } from "../editor/store";
interface Props {
  project: Project;
  clip?: Clip;
  playhead: number;
  onUpdate: (patch: Partial<Clip>) => void;
  onProjectUpdate: (patch: Partial<Project>) => void;
  onSeparateAudio?: () => void;
  separating?: boolean;
  onDetachLink?: () => void;
  onReverse?: () => void;
  onCancelReverse?: () => void;
  reversing?: boolean;
  reverseProgress?: number;
  onFreezeFrame?: (duration: number) => void;
  freezing?: boolean;
}
function NumberField({
  label,
  value,
  min = -100000,
  max = 100000,
  step = 1,
  onChange,
  suffix,
  diamond,
  range = false,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
  diamond?: () => void;
  range?: boolean;
}) {
  return (
    <label className="property-row">
      <span>{label}</span>
      {range && (
        <input
          className="property-range"
          aria-label={`${label} kaydırıcısı`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onPointerDown={() => useEditorStore.getState().beginTransaction()}
          onPointerUp={() => useEditorStore.getState().endTransaction()}
          onPointerCancel={() => useEditorStore.getState().endTransaction()}
          onKeyDown={() => useEditorStore.getState().beginTransaction()}
          onKeyUp={() => useEditorStore.getState().endTransaction()}
          onBlur={() => useEditorStore.getState().endTransaction()}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      )}
      <div className="numeric-field">
        <input
          aria-label={label}
          type="number"
          value={Number(value.toFixed(3))}
          min={min}
          max={max}
          step={step}
          onFocus={() => useEditorStore.getState().beginTransaction()}
          onBlur={() => useEditorStore.getState().endTransaction()}
          onChange={(e) => {
            if (e.target.value === "") return;
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
          }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
      {diamond && (
        <button
          className="diamond-btn"
          title={`${label} anahtar karesi ekle`}
          onClick={(e) => {
            e.preventDefault();
            diamond();
          }}
        >
          <Diamond size={12} />
        </button>
      )}
    </label>
  );
}
function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="slider-property">
      <div>
        <label>{label}</label>
        <span>{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => useEditorStore.getState().beginTransaction()}
        onPointerUp={() => useEditorStore.getState().endTransaction()}
        onPointerCancel={() => useEditorStore.getState().endTransaction()}
        onKeyDown={() => useEditorStore.getState().beginTransaction()}
        onKeyUp={() => useEditorStore.getState().endTransaction()}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
export default function Inspector({
  project,
  clip,
  playhead,
  onUpdate,
  onProjectUpdate,
  onSeparateAudio,
  separating = false,
  onDetachLink,
  onReverse,
  onCancelReverse,
  reversing = false,
  reverseProgress,
  onFreezeFrame,
  freezing = false,
}: Props) {
  const [freezeDuration, setFreezeDuration] = useState(2);
  const [tab, setTab] = useState("Görüntü"),
    [fonts, setFonts] = useState<string[]>([
      "Noto Sans SC",
      "sans-serif",
      "PingFang SC",
      "Arial",
      "Georgia",
    ]);
  useEffect(() => {
    void window.editorAPI
      ?.getFontFamilies()
      .then((fonts) => setFonts(fonts))
      .catch(() => {});
  }, []);
  useEffect(() => {
    setTab(
      clip?.text
        ? "Metin"
        : project.assets.find((a) => a.id === clip?.assetId)?.kind === "audio"
          ? "Ses"
          : "Görüntü",
    );
  }, [clip?.id, !!clip?.text]);
  if (!clip)
    return (
      <aside className="inspector panel">
        <div className="panel-heading">
          <span>Proje parametreleri</span>
          <SlidersHorizontal size={16} />
        </div>
        <div className="inspector-content">
          <h3>Tuval ayarları</h3>
          <label className="stacked-label">
            Proje adı
            <input
              value={project.name}
              onFocus={() => useEditorStore.getState().beginTransaction()}
              onBlur={() => useEditorStore.getState().endTransaction()}
              onChange={(e) => onProjectUpdate({ name: e.target.value })}
            />
          </label>
          <label className="property-row">
            <span>Görüntü oranı</span>
            <select
              aria-label="Görüntü oranı"
              value={`${project.width}:${project.height}`}
              onChange={(e) => {
                const [width, height] = e.target.value.split(":").map(Number);
                onProjectUpdate({ width, height });
              }}
            >
              {![
                "1920:1080",
                "1080:1920",
                "1080:1080",
                "1440:1080",
                "2560:1440",
                "3840:2160",
              ].includes(`${project.width}:${project.height}`) && (
                <option value={`${project.width}:${project.height}`}>
                  Özel
                </option>
              )}
              <option value="1920:1080">16:9 · yatay</option>
              <option value="1080:1920">9:16 · dikey</option>
              <option value="1080:1080">1:1 · kare</option>
              <option value="1440:1080">4:3 · klasik</option>
              <option value="2560:1440">16:9 · 2K</option>
              <option value="3840:2160">16:9 · 4K</option>
            </select>
          </label>
          <NumberField
            label="Genişlik"
            value={project.width}
            min={16}
            max={7680}
            step={2}
            suffix="px"
            onChange={(width) => onProjectUpdate({ width })}
          />
          <NumberField
            label="Yükseklik"
            value={project.height}
            min={16}
            max={7680}
            step={2}
            suffix="px"
            onChange={(height) => onProjectUpdate({ height })}
          />
          <label className="property-row">
            <span>Kare hızı</span>
            <select
              aria-label="Kare hızı"
              value={project.fps}
              onChange={(e) => onProjectUpdate({ fps: Number(e.target.value) })}
            >
              {[24, 25, 30, 50, 60].map((fps) => (
                <option key={fps} value={fps}>
                  {fps} fps
                </option>
              ))}
            </select>
          </label>
          <label className="property-row">
            <span>Arka plan rengi</span>
            <input
              aria-label="Arka plan rengi"
              type="color"
              value={project.background}
              onChange={(e) => onProjectUpdate({ background: e.target.value })}
            />
            <code>{project.background}</code>
          </label>
          <div className="inspector-guide">
            <Image size={30} />
            <p>Zaman çizelgesinden klip seçin</p>
            <span>Görüntü, ses, metin ve animasyon ayarlarını buradan yapın</span>
          </div>
          <div className="offline-note">
            <span className="status-dot" />
            Medya yerelde kalır, proje tamamen çevrimdışı
          </div>
        </div>
      </aside>
    );
  const track = project.tracks.find((t) => t.id === clip.trackId)!,
    asset = project.assets.find((a) => a.id === clip.assetId);
  const local = Math.max(0, Math.min(clip.duration, playhead - clip.start)),
    evaluated = evaluateKeyframes(clip, local),
    locked = track.locked,
    playheadInside =
      playhead >= clip.start - 1e-9 &&
      playhead <= clip.start + clip.duration + 1e-9;
  const key = (property: Keyframe["property"], value: number) => {
    const at = Math.min(
      clip.duration,
      Math.round(local * project.fps) / project.fps,
    );
    const existing = clip.keyframes.find(
      (k) =>
        k.property === property && Math.abs(k.time - at) < 0.5 / project.fps,
    );
    onUpdate({
      keyframes: existing
        ? clip.keyframes.filter((k) => k.id !== existing.id)
        : [
            ...clip.keyframes,
            { id: id(), property, time: at, value, easing: "linear" },
          ],
    });
  };
  const animate = (property: Keyframe["property"], value: number) => {
    if (clip.keyframes.some((k) => k.property === property)) {
      const at = Math.min(
          clip.duration,
          Math.round(local * project.fps) / project.fps,
        ),
        existing = clip.keyframes.find(
          (k) =>
            k.property === property &&
            Math.abs(k.time - at) < 0.5 / project.fps,
        );
      onUpdate({
        keyframes: existing
          ? clip.keyframes.map((k) =>
              k.id === existing.id ? { ...k, value } : k,
            )
          : [
              ...clip.keyframes,
              { id: id(), property, time: at, value, easing: "linear" },
            ],
      });
    } else if (property === "volume") onUpdate({ volume: value });
    else onUpdate({ transform: { ...clip.transform, [property]: value } });
  };
  const visual = asset?.kind !== "audio";
  const pictureTabs = ["Görüntü", "Kırpma", "Kroma key", "Maske"];
  const pictureActive = pictureTabs.includes(tab);
  const tabs = clip.text
    ? ["Metin", "Görüntü", "Animasyon", "Hız"]
    : visual
      ? ["Görüntü", "Ses", "Hız", "Animasyon", "Renk ayarı"]
      : ["Ses", "Hız", "Animasyon"];
  const tabLabel = (value: string) =>
    value === "Hız" ? "Hız değiştirme" : value === "Renk ayarı" ? "Ayar" : value;
  return (
    <aside className="inspector panel">
      <div className="inspector-tabs">
        <nav className="inspector-main-tabs" aria-label="Klip özellikleri">
          {tabs.map((t) => (
            <button
              key={t}
              aria-label={t}
              aria-pressed={tab === t || (t === "Görüntü" && pictureActive)}
              className={tab === t || (t === "Görüntü" && pictureActive) ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {tabLabel(t)}
            </button>
          ))}
        </nav>
        {visual && !clip.text && (
          <nav className="inspector-picture-tabs" aria-label="Görüntü araçları" hidden={!pictureActive}>
            {pictureTabs.map((t) => (
              <button
                key={t}
                aria-label={t === "Görüntü" ? "Temel görüntü" : t}
                aria-pressed={tab === t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t === "Görüntü" ? "Temel" : t}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div className="inspector-content">
        <div className="clip-info">
          <strong>{clip.name}</strong>
          <span>
            {track.name} · {formatTime(clip.duration, project.fps)}
          </span>
        </div>
        {locked && (
          <div className="inline-warning">Kanal kilitli; düzenlemek için kilidini açın</div>
        )}
        <fieldset disabled={locked}>
          {["Kırpma", "Kroma key", "Maske"].includes(tab) && (
            <VisualTools
              mode={
                tab === "Kırpma" ? "crop" : tab === "Kroma key" ? "chroma" : "mask"
              }
              clip={clip}
              asset={asset}
              onUpdate={onUpdate}
              locked={locked}
            />
          )}
          {tab === "Görüntü" && (
            <>
              <div className="section-title">
                <h3>Konum ve boyut</h3>
                <button
                  title="Dönüşümü sıfırla"
                  onClick={() =>
                    onUpdate({
                      transform: { ...DEFAULT_TRANSFORM },
                      keyframes: clip.keyframes.filter(
                        (k) => k.property === "volume",
                      ),
                    })
                  }
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <NumberField
                label="Ölçek"
                range
                value={evaluated.transform.scale * 100}
                min={1}
                max={1000}
                suffix="%"
                onChange={(v) => animate("scale", v / 100)}
                diamond={() => key("scale", evaluated.transform.scale)}
              />
              <div className="position-fields">
              <NumberField
                label="Konum X"
                value={evaluated.transform.x}
                onChange={(v) => animate("x", v)}
                diamond={() => key("x", evaluated.transform.x)}
              />
              <NumberField
                label="Konum Y"
                value={evaluated.transform.y}
                onChange={(v) => animate("y", v)}
                diamond={() => key("y", evaluated.transform.y)}
              />
              </div>
              <NumberField
                label="Döndürme"
                value={evaluated.transform.rotation}
                min={-3600}
                max={3600}
                suffix="°"
                onChange={(v) => animate("rotation", v)}
                diamond={() => key("rotation", evaluated.transform.rotation)}
              />
              <NumberField
                label="Opaklık"
                value={evaluated.transform.opacity * 100}
                min={0}
                max={100}
                suffix="%"
                onChange={(v) => animate("opacity", v / 100)}
                diamond={() => key("opacity", evaluated.transform.opacity)}
              />
              <div className="property-row">
                <span>Çevir</span>
                <div className="segmented">
                  <button
                    className={clip.transform.flipX ? "active" : ""}
                    title="Yatay çevir"
                    onClick={() =>
                      onUpdate({
                        transform: {
                          ...clip.transform,
                          flipX: !clip.transform.flipX,
                        },
                      })
                    }
                  >
                    <FlipHorizontal2 size={17} />
                  </button>
                  <button
                    className={clip.transform.flipY ? "active" : ""}
                    title="Dikey çevir"
                    onClick={() =>
                      onUpdate({
                        transform: {
                          ...clip.transform,
                          flipY: !clip.transform.flipY,
                        },
                      })
                    }
                  >
                    <FlipVertical2 size={17} />
                  </button>
                </div>
              </div>
              <h3>Görüntü yumuşak giriş/çıkışı</h3>
              <NumberField
                label="Görüntü yumuşak girişi"
                value={clip.fadeIn}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(fadeIn) => onUpdate({ fadeIn })}
              />
              <NumberField
                label="Görüntü yumuşak çıkışı"
                value={clip.fadeOut}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(fadeOut) => onUpdate({ fadeOut })}
              />
              {asset?.kind === "image" && (
                <>
                  <h3>Klip süresi</h3>
                  <NumberField
                    label="Klip süresi"
                    value={clip.duration}
                    min={1 / project.fps}
                    max={Math.max(1 / project.fps, 86400 - clip.start)}
                    step={1 / project.fps}
                    suffix="s"
                    onChange={(duration) => {
                      const next = Math.max(
                        1 / project.fps,
                        Math.min(duration, 86400 - clip.start),
                      );
                      onUpdate({
                        duration: next,
                        fadeIn: Math.min(clip.fadeIn, next),
                        fadeOut: Math.min(clip.fadeOut, next),
                        keyframes: clip.keyframes.filter(
                          (keyframe) => keyframe.time <= next,
                        ),
                      });
                    }}
                  />
                  <p className="muted small">
                    Donmuş karenin veya görselin zaman çizelgesindeki süresi.
                  </p>
                </>
              )}
            </>
          )}
          {tab === "Ses" && (
            <>
              <h3>Ses düzeyi</h3>
              <NumberField
                label="Ses düzeyi"
                value={evaluated.volume * 100}
                min={0}
                max={400}
                suffix="%"
                onChange={(v) => animate("volume", v / 100)}
                diamond={() => key("volume", evaluated.volume)}
              />
              <label className="toggle-property">
                <span>Klibi sessize al</span>
                <input
                  aria-label="Klibi sessize al"
                  type="checkbox"
                  checked={clip.muted}
                  onChange={(e) => onUpdate({ muted: e.target.checked })}
                />
              </label>
              <h3>Ses yumuşak giriş/çıkışı</h3>
              <NumberField
                label="Ses yumuşak girişi"
                value={clip.audioFadeIn}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(audioFadeIn) => onUpdate({ audioFadeIn })}
              />
              <NumberField
                label="Ses yumuşak çıkışı"
                value={clip.audioFadeOut}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(audioFadeOut) => onUpdate({ audioFadeOut })}
              />
              {!asset?.hasAudio && (
                <p className="muted">Bu medyada ses akışı yok.</p>
              )}
              {clip.linkId && onDetachLink && (
                <div className="audio-separate">
                  <h3>Bağlı klip</h3>
                  <p className="muted small">
                    Bu klip ayrılan sesle bağlantılıdır: taşıma, kırpma, bölme ve silme işlemleri diğer klibe de uygulanır.
                  </p>
                  <button className="small-button" onClick={onDetachLink}>
                    Bağlantıyı çöz
                  </button>
                </div>
              )}
              {asset?.kind === "video" && asset.hasAudio && onSeparateAudio && (
                <div className="audio-separate">
                  <h3>Sesi ayır</h3>
                  <button
                    className="small-button"
                    disabled={separating}
                    onClick={onSeparateAudio}
                  >
                    <AudioLines size={14} />
                    {separating ? "Ses ayrılıyor…" : "Sesi ayır"}
                  </button>
                  <p className="muted small">
                    Videodaki sesi ayrı bir ses klibine dönüştürür; asıl klip otomatik sessize alınır ve ayrı ayrı ayarlanabilir.
                  </p>
                </div>
              )}
            </>
          )}
          {tab === "Renk ayarı" && (
            <>
              <div className="section-title">
                <h3>Temel ayar</h3>
                <button
                  title="Renk ayarını sıfırla"
                  onClick={() =>
                    onUpdate({ adjustments: { ...DEFAULT_ADJUSTMENTS } })
                  }
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <Slider
                label="Parlaklık"
                value={clip.adjustments.brightness}
                min={-1}
                max={1}
                onChange={(v) =>
                  onUpdate({
                    adjustments: { ...clip.adjustments, brightness: v },
                  })
                }
              />
              <Slider
                label="Kontrast"
                value={clip.adjustments.contrast}
                min={0}
                max={3}
                onChange={(v) =>
                  onUpdate({
                    adjustments: { ...clip.adjustments, contrast: v },
                  })
                }
              />
              <Slider
                label="Doygunluk"
                value={clip.adjustments.saturation}
                min={0}
                max={3}
                onChange={(v) =>
                  onUpdate({
                    adjustments: { ...clip.adjustments, saturation: v },
                  })
                }
              />
              <Slider
                label="Renk sıcaklığı"
                value={clip.adjustments.temperature}
                min={-1}
                max={1}
                onChange={(v) =>
                  onUpdate({
                    adjustments: { ...clip.adjustments, temperature: v },
                  })
                }
              />
              <Slider
                label="Bulanıklık"
                value={clip.adjustments.blur}
                min={0}
                max={100}
                step={1}
                onChange={(v) =>
                  onUpdate({ adjustments: { ...clip.adjustments, blur: v } })
                }
              />
              <p className="field-hint">
                Önizleme ve dışa aktarma aynı RGB
                ayar modelini kullanır; kodlama ve renk dönüşümü küçük farklar oluşturabilir.
              </p>
            </>
          )}
          {tab === "Metin" && clip.text && (
            <>
              <h3>Metin içeriği</h3>
              <textarea
                aria-label="Metin içeriği"
                value={clip.text.text}
                rows={4}
                onFocus={() => useEditorStore.getState().beginTransaction()}
                onBlur={() => useEditorStore.getState().endTransaction()}
                onChange={(e) =>
                  onUpdate({
                    name: e.target.value.slice(0, 30) || "Metin",
                    text: { ...clip.text!, text: e.target.value },
                  })
                }
              />
              <label className="property-row">
                <span>Yazı tipi</span>
                <select
                  aria-label="Yazı tipi"
                  value={clip.text.fontFamily}
                  onChange={(e) =>
                    onUpdate({
                      text: { ...clip.text!, fontFamily: e.target.value },
                    })
                  }
                >
                  <option value="sans-serif">Sistem varsayılanı</option>
                  {fonts
                    .filter((f) => f !== "sans-serif")
                    .map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                </select>
              </label>
              <NumberField
                label="Yazı boyutu"
                value={clip.text.fontSize}
                min={1}
                max={1000}
                suffix="px"
                onChange={(fontSize) =>
                  onUpdate({ text: { ...clip.text!, fontSize } })
                }
              />
              <label className="property-row">
                <span>Metin rengi</span>
                <input
                  aria-label="Metin rengi"
                  type="color"
                  value={clip.text.color}
                  onChange={(e) =>
                    onUpdate({ text: { ...clip.text!, color: e.target.value } })
                  }
                />
                <button
                  className={clip.text.bold ? "active" : ""}
                  title="Kalın"
                  onClick={() =>
                    onUpdate({
                      text: { ...clip.text!, bold: !clip.text!.bold },
                    })
                  }
                >
                  <b>B</b>
                </button>
              </label>
              <div className="property-row">
                <span>Hizalama</span>
                <div className="segmented">
                  {(["left", "center", "right"] as const).map((align, i) => (
                    <button
                      key={align}
                      title={["Sola hizala", "Ortala", "Sağa hizala"][i]}
                      className={clip.text!.align === align ? "active" : ""}
                      onClick={() =>
                        onUpdate({ text: { ...clip.text!, align } })
                      }
                    >
                      {i === 0 ? (
                        <AlignLeft size={16} />
                      ) : i === 1 ? (
                        <AlignCenter size={16} />
                      ) : (
                        <AlignRight size={16} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <h3>Kontur ve arka plan</h3>
              <label className="property-row">
                <span>Kontur rengi</span>
                <input
                  aria-label="Kontur rengi"
                  type="color"
                  value={clip.text.stroke}
                  onChange={(e) =>
                    onUpdate({
                      text: { ...clip.text!, stroke: e.target.value },
                    })
                  }
                />
              </label>
              <NumberField
                label="Kontur kalınlığı"
                value={clip.text.strokeWidth}
                min={0}
                max={100}
                onChange={(strokeWidth) =>
                  onUpdate({ text: { ...clip.text!, strokeWidth } })
                }
              />
              <label className="toggle-property">
                <span>Metin arka planı</span>
                <input
                  type="checkbox"
                  aria-label="Metin arka planı"
                  checked={clip.text.background !== "transparent"}
                  onChange={(e) =>
                    onUpdate({
                      text: {
                        ...clip.text!,
                        background: e.target.checked
                          ? "#15151c"
                          : "transparent",
                      },
                    })
                  }
                />
              </label>
              {clip.text.background !== "transparent" && (
                <input
                  type="color"
                  aria-label="Metin arka plan rengi"
                  value={clip.text.background}
                  onChange={(e) =>
                    onUpdate({
                      text: { ...clip.text!, background: e.target.value },
                    })
                  }
                />
              )}
              <h3>Düzen ve gölge</h3>
              <Slider
                label="Satır yüksekliği"
                value={clip.text.lineHeight ?? 1.3}
                min={0.9}
                max={2.4}
                step={0.05}
                onChange={(lineHeight) =>
                  onUpdate({ text: { ...clip.text!, lineHeight } })
                }
              />
              <Slider
                label="İç boşluk"
                value={clip.text.padding ?? 0.25}
                min={0}
                max={1.2}
                step={0.05}
                onChange={(padding) =>
                  onUpdate({ text: { ...clip.text!, padding } })
                }
              />
              <Slider
                label="Yuvarlak köşe"
                value={clip.text.radius ?? 0}
                min={0}
                max={1}
                step={0.05}
                onChange={(radius) =>
                  onUpdate({ text: { ...clip.text!, radius } })
                }
              />
              <label className="toggle-property">
                <span>Metin gölgesi</span>
                <input
                  type="checkbox"
                  aria-label="Metin gölgesi"
                  checked={!!clip.text.shadow}
                  onChange={(e) =>
                    onUpdate({
                      text: {
                        ...clip.text!,
                        shadow: e.target.checked
                          ? {
                              color: "#000000",
                              blur: 12,
                              offsetX: 0,
                              offsetY: 4,
                            }
                          : undefined,
                      },
                    })
                  }
                />
              </label>
              {clip.text.shadow && (
                <>
                  <label className="property-row">
                    <span>Gölge rengi</span>
                    <input
                      aria-label="Gölge rengi"
                      type="color"
                      value={clip.text.shadow.color}
                      onChange={(e) =>
                        onUpdate({
                          text: {
                            ...clip.text!,
                            shadow: {
                              ...clip.text!.shadow!,
                              color: e.target.value,
                            },
                          },
                        })
                      }
                    />
                  </label>
                  <Slider
                    label="Gölge bulanıklığı"
                    value={clip.text.shadow.blur}
                    min={0}
                    max={80}
                    step={1}
                    format={(v) => `${v.toFixed(0)}`}
                    onChange={(blur) =>
                      onUpdate({
                        text: {
                          ...clip.text!,
                          shadow: { ...clip.text!.shadow!, blur },
                        },
                      })
                    }
                  />
                  <NumberField
                    label="Gölge kayması X"
                    value={clip.text.shadow.offsetX}
                    min={-200}
                    max={200}
                    onChange={(offsetX) =>
                      onUpdate({
                        text: {
                          ...clip.text!,
                          shadow: { ...clip.text!.shadow!, offsetX },
                        },
                      })
                    }
                  />
                  <NumberField
                    label="Gölge kayması Y"
                    value={clip.text.shadow.offsetY}
                    min={-200}
                    max={200}
                    onChange={(offsetY) =>
                      onUpdate({
                        text: {
                          ...clip.text!,
                          shadow: { ...clip.text!.shadow!, offsetY },
                        },
                      })
                    }
                  />
                </>
              )}
            </>
          )}
          {tab === "Hız" && (
            <>
              <h3>Normal hız değiştirme</h3>
              <NumberField
                label="Oynatma hızı"
                value={clip.speed}
                min={0.1}
                max={8}
                step={0.1}
                suffix="×"
                onChange={(speed) => onUpdate({ speed })}
              />
              <div className="speed-presets">
                {[0.25, 0.5, 1, 1.5, 2, 4].map((speed) => (
                  <button
                    key={speed}
                    className={clip.speed === speed ? "active" : ""}
                    onClick={() => onUpdate({ speed })}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
              <p className="field-hint">
                Hızı değiştirmek kaynak medya aralığını korur ve klip süresini ayarlar. Ses perdesi korunur.
              </p>
              <h3>Zaman aralığı</h3>
              <NumberField
                label="Başlangıç zamanı"
                value={clip.start}
                min={0}
                step={1 / project.fps}
                suffix="s"
                onChange={(start) => onUpdate({ start })}
              />
              <NumberField
                label="Kaynak medya giriş noktası"
                value={clip.sourceIn}
                min={0}
                max={Math.max(
                  0,
                  (asset?.duration ?? 0) - clip.duration * clip.speed,
                )}
                step={1 / project.fps}
                suffix="s"
                onChange={(sourceIn) => onUpdate({ sourceIn })}
              />
              <p className="muted small">
                Kırpma giriş ve çıkış noktalarını ayarlamak için zaman çizelgesinde klibin kenarlarını sürükleyin.
              </p>
              {asset?.kind === "video" && onReverse && onFreezeFrame && (
                <div className="clip-tools">
                  <h3>Klip araçları</h3>
                  <div className="clip-tool-row">
                    <button
                      className="small-button"
                      disabled={reversing || locked}
                      onClick={onReverse}
                    >
                      <RotateCcw size={14} />
                      {reversing
                        ? `Ters oynatılıyor… ${Math.round(reverseProgress ?? 0)}%`
                        : "Klibi ters oynat"}
                    </button>
                    {reversing && onCancelReverse && (
                      <button
                        className="small-button"
                        onClick={onCancelReverse}
                      >
                        İptal
                      </button>
                    )}
                  </div>
                  {reversing && (
                    <progress
                      className="clip-tool-progress"
                      max={100}
                      value={reverseProgress ?? 0}
                      aria-label="Ters oynatma ilerlemesi"
                    />
                  )}
                  <p className="muted small">
                    Video ve varsa özgün ses birlikte ters çevrilir. Ayrı bir medya oluşturulur; özgün medyanın üzerine yazılmaz.
                  </p>
                  <h3>Donmuş kare</h3>
                  <NumberField
                    label="Donmuş kare süresi"
                    value={freezeDuration}
                    min={1 / project.fps}
                    max={600}
                    step={0.1}
                    suffix="s"
                    onChange={setFreezeDuration}
                  />
                  <button
                    className="small-button"
                    disabled={freezing || locked || !playheadInside}
                    onClick={() => onFreezeFrame(freezeDuration)}
                  >
                    <Image size={14} />
                    {freezing ? "Donmuş kare oluşturuluyor…" : "Geçerli kareyi dondur"}
                  </button>
                  <p className="muted small">
                    {playheadInside
                      ? "Geçerli oynatma başlığından ayrı bir görüntü oluşturur; süresini görüntü özelliklerinden ayarlayabilirsiniz."
                      : "Önce oynatma başlığını geçerli video klibinin aralığına taşıyın."}
                  </p>
                </div>
              )}
            </>
          )}
          {tab === "Animasyon" && (
            <>
              <h3>Anahtar kare</h3>
              <KeyframeEditor
                clip={clip}
                project={project}
                playhead={playhead}
                visual={visual}
                locked={locked}
                onUpdate={onUpdate}
              />
            </>
          )}
        </fieldset>
      </div>
    </aside>
  );
}
