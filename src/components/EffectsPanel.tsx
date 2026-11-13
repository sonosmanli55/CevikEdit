import { useState } from "react";
import {
  Check,
  ChevronRight,
  Film,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Waves,
} from "lucide-react";
import type { Adjustments, Clip, TrackKind, Project } from "../core/types";
import { DEFAULT_ADJUSTMENTS } from "../core/defaults";
import "./EffectsPanel.css";
import { MotionLibrary } from "./CreativeLibrary";
import { motionPatch } from "../core/creativePresets";
import PresetPreview from "./PresetPreview";
import { writePresetDrag } from "./Timeline";

export interface EffectsPanelProps {
  clip?: Clip;
  project?: Pick<Project, "width" | "height">;
  kind?: TrackKind;
  locked?: boolean;
  onApply: (patch: Partial<Clip>) => void;
}
export interface ColorPreset {
  id: string;
  name: string;
  description: string;
  colors: string;
  adjustments: Partial<Adjustments>;
}
export const COLOR_PRESETS: ColorPreset[] = [
  {
    id: "original",
    name: "Doğal renk",
    description: "Medyanın doğal renklerini geri yükler",
    colors: "#526658,#baac84,#65828d",
    adjustments: { ...DEFAULT_ADJUSTMENTS },
  },
  {
    id: "cinema",
    name: "Sinema",
    description: "Derin kontrast, düşük doygunluk atmosferi",
    colors: "#243744,#b49868,#406d7a",
    adjustments: {
      brightness: -0.04,
      contrast: 1.22,
      saturation: 0.78,
      temperature: -0.08,
      blur: 0,
    },
  },
  {
    id: "warm",
    name: "Sıcak güneş",
    description: "Sıcak ve parlak; günlük kayıtlar için",
    colors: "#927b51,#ead092,#c4a570",
    adjustments: {
      brightness: 0.05,
      contrast: 1.05,
      saturation: 1.1,
      temperature: 0.3,
      blur: 0,
    },
  },
  {
    id: "cool",
    name: "Soğuk mavi",
    description: "Berrak soğuk ton, görüntü katmanlarını öne çıkarır",
    colors: "#2c5367,#86acbc,#55788e",
    adjustments: {
      brightness: 0.015,
      contrast: 1.12,
      saturation: 0.9,
      temperature: -0.35,
      blur: 0,
    },
  },
  {
    id: "mono",
    name: "Siyah beyaz",
    description: "Saf siyah beyaz, ışık-gölge ayrıntılarını korur",
    colors: "#343839,#bebdb4,#6d7270",
    adjustments: {
      brightness: 0,
      contrast: 1.15,
      saturation: 0,
      temperature: 0,
      blur: 0,
    },
  },
  {
    id: "vintage",
    name: "Retro",
    description: "Soluk sıcak tonlu film hissi",
    colors: "#686a4c,#c5b680,#8c987d",
    adjustments: {
      brightness: 0.045,
      contrast: 0.86,
      saturation: 0.72,
      temperature: 0.22,
      blur: 0,
    },
  },
  {
    id: "vivid",
    name: "Canlı",
    description: "Parlak ve doygun, zengin renkler sunar",
    colors: "#45836b,#f6cf72,#679baa",
    adjustments: {
      brightness: 0.02,
      contrast: 1.1,
      saturation: 1.45,
      temperature: 0,
      blur: 0,
    },
  },
  {
    id: "soft",
    name: "Yumuşak odak",
    description: "Yumuşak ayrıntılar, puslu bir doku yaratır",
    colors: "#8d9d9b,#d6c9af,#a4aeb9",
    adjustments: {
      brightness: 0.03,
      contrast: 0.95,
      saturation: 0.9,
      temperature: 0.05,
      blur: 2,
    },
  },
];
export function presetPatch(preset: ColorPreset, clip?: Clip): Partial<Clip> {
  return {
    adjustments: {
      ...DEFAULT_ADJUSTMENTS,
      ...clip?.adjustments,
      ...preset.adjustments,
    },
  };
}
export function fadePatch(
  kind: "visual" | "audio",
  direction: "in" | "out" | "both" | "none",
  seconds: number,
  duration = Infinity,
): Partial<Clip> {
  const value = Math.max(
    0,
    Math.min(seconds, duration / (direction === "both" ? 2 : 1)),
  );
  const incoming = direction === "in" || direction === "both" ? value : 0;
  const outgoing = direction === "out" || direction === "both" ? value : 0;
  return kind === "visual"
    ? { fadeIn: incoming, fadeOut: outgoing }
    : { audioFadeIn: incoming, audioFadeOut: outgoing };
}
export default function EffectsPanel({
  clip,
  project = { width: 1920, height: 1080 },
  kind,
  locked = false,
  onApply,
}: EffectsPanelProps) {
  const [tab, setTab] = useState<"color" | "fade" | "motion">("color");
  const [seconds, setSeconds] = useState(0.5);
  const [query, setQuery] = useState("");
  const active = COLOR_PRESETS.find((p) =>
    Object.entries(p.adjustments).every(
      ([key, value]) =>
        Math.abs(clip?.adjustments[key as keyof Adjustments]! - Number(value)) <
        0.001,
    ),
  );
  const disabled = !clip || locked;
  const colorDisabled = disabled || kind === "audio" || kind === "text";
  return (
    <section className="effects-panel" aria-label="Yerel efekt kitaplığı">
      <div className="effects-title">
        <Sparkles size={15} />
        <strong>Efekt ön ayarları · 16</strong>
        <span>Yerel işleme</span>
      </div>
      <div className="effects-tabs" role="tablist" aria-label="Efekt türü">
        <button
          role="tab"
          aria-selected={tab === "color"}
          className={tab === "color" ? "is-active" : ""}
          onClick={() => setTab("color")}
        >
          <SlidersHorizontal size={13} /> Renk ön ayarları
        </button>
        <button
          role="tab"
          aria-selected={tab === "motion"}
          className={tab === "motion" ? "is-active" : ""}
          onClick={() => setTab("motion")}
        >
          <Sparkles size={13} /> Hareketli efektler
        </button>
        <button
          role="tab"
          aria-selected={tab === "fade"}
          className={tab === "fade" ? "is-active" : ""}
          onClick={() => setTab("fade")}
        >
          <Waves size={13} /> Yumuşak giriş/çıkış
        </button>
      </div>
      <div className="effects-content">
        <div className={`effects-selection ${disabled ? "is-empty" : ""}`}>
          <Film size={14} />
          <span>
            {clip
              ? `${clip.name}${locked ? " · kanal kilitli" : ""}`
              : "Önce zaman çizelgesinden bir klip seçin"}
          </span>
          {clip && <ChevronRight size={12} />}
        </div>
        {tab === "motion" ? (
          <MotionLibrary
            disabled={disabled || kind === "audio"}
            onApply={(motion) => {
              if (clip) onApply(motionPatch(clip, motion, project));
            }}
          />
        ) : tab === "color" ? (
          <>
            <p className="effects-help">
              {kind === "audio"
                ? "Ses kliplerinde ses değişimi \"Yumuşak giriş/çıkış\" bölümünden ayarlanır."
                : kind === "text"
                  ? "Metin stili sağdaki özelliklerden düzenlenir; \"Yumuşak giriş/çıkış\" metnin görünme değişimini ayarlar."
                  : "Ön ayar seçildiğinde klibe uygulanır. Sağdaki özelliklerden ince ayar yapabilirsiniz."}
            </p>
            <label className="creative-search">
              <input
                aria-label="Renk ön ayarı ara"
                placeholder="Renk ön ayarı ara"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="effects-grid">
              {COLOR_PRESETS.filter((p) =>
                (p.name + p.description).includes(query.trim()),
              ).map((preset) => (
                <article
                  className="creative-card"
                  key={preset.id}
                  data-preset-id={preset.id}
                  draggable
                  title="Bir klibin üzerine sürükleyin"
                  onDragStart={(event) =>
                    writePresetDrag(event.dataTransfer, {
                      kind: "effect",
                      id: preset.id,
                    })
                  }
                >
                  <PresetPreview
                    adjustments={preset.adjustments}
                    label={preset.name}
                  />
                  <div>
                    <span>
                      {preset.name}
                      <small>{preset.description}</small>
                    </span>
                    <button
                      disabled={colorDisabled}
                      onClick={() => onApply(presetPatch(preset, clip))}
                      aria-label={`${preset.name} renk ayarını uygula`}
                      aria-pressed={!!clip && active?.id === preset.id}
                    >
                      <Check size={12} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <button
              className="effects-reset"
              disabled={colorDisabled}
              onClick={() =>
                onApply({ adjustments: { ...DEFAULT_ADJUSTMENTS } })
              }
            >
              <RotateCcw size={12} /> Renk ayarını sıfırla
            </button>
          </>
        ) : (
          <>
            <p className="effects-help">
              Klip kenarlarına yumuşak bir geçiş ekler. Görüntü ve ses ayrı ayrı ayarlanabilir.
            </p>
            <label className="effects-duration">
              <span>Değişim süresi</span>
              <input
                aria-label="Yumuşak giriş/çıkış süresi"
                type="number"
                min="0.05"
                max="10"
                step="0.05"
                value={seconds}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  if (Number.isFinite(n))
                    setSeconds(Math.max(0.05, Math.min(10, n)));
                }}
              />
              <span>sn</span>
            </label>
            {(["visual", "audio"] as const)
              .filter((channel) =>
                channel === "visual" ? kind !== "audio" : kind !== "text",
              )
              .map((kind) => (
                <div className="effects-fade-group" key={kind}>
                  <h3>
                    {kind === "visual" ? "Görüntü" : "Ses"}
                    <span>
                      {clip
                        ? `${kind === "visual" ? clip.fadeIn.toFixed(2) : clip.audioFadeIn.toFixed(2)}s / ${kind === "visual" ? clip.fadeOut.toFixed(2) : clip.audioFadeOut.toFixed(2)}s`
                        : "Giriş / Çıkış"}
                    </span>
                  </h3>
                  <div className="effects-fade-grid">
                    {(["in", "out", "both"] as const).map((direction) => (
                      <button
                        key={direction}
                        disabled={disabled}
                        onClick={() =>
                          onApply(
                            fadePatch(kind, direction, seconds, clip?.duration),
                          )
                        }
                      >
                        <span
                          className={`effects-fade-shape shape-${direction}`}
                        />
                        <span>
                          {direction === "in"
                            ? "Yumuşak giriş"
                            : direction === "out"
                              ? "Yumuşak çıkış"
                              : "Yumuşak giriş/çıkış"}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="effects-reset"
                    disabled={disabled}
                    onClick={() => onApply(fadePatch(kind, "none", 0))}
                  >
                    <RotateCcw size={11} /> Kaldır
                    {kind === "visual" ? "Görüntü" : "Ses"}Yumuşak giriş/çıkış
                  </button>
                </div>
              ))}
            <p className="effects-note">
              Süre değişikliği klip uzunluğuyla sınırlıdır; toplam yumuşak giriş ve çıkış klibin yarısını aşamaz.
            </p>
          </>
        )}
      </div>
      <div className="effects-footer">
        <Check size={11} /> Önizleme ve dışa aktarma aynı parametreleri kullanır
      </div>
    </section>
  );
}
