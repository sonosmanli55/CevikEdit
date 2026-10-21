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
          aria-label={`${label}滑块`}
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
          title={`添加 ${label} 关键帧`}
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
  onReverse,
  onCancelReverse,
  reversing = false,
  reverseProgress,
  onFreezeFrame,
  freezing = false,
}: Props) {
  const [freezeDuration, setFreezeDuration] = useState(2);
  const [tab, setTab] = useState("画面"),
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
        ? "文本"
        : project.assets.find((a) => a.id === clip?.assetId)?.kind === "audio"
          ? "音频"
          : "画面",
    );
  }, [clip?.id, !!clip?.text]);
  if (!clip)
    return (
      <aside className="inspector panel">
        <div className="panel-heading">
          <span>项目参数</span>
          <SlidersHorizontal size={16} />
        </div>
        <div className="inspector-content">
          <h3>画布设置</h3>
          <label className="stacked-label">
            项目名称
            <input
              value={project.name}
              onFocus={() => useEditorStore.getState().beginTransaction()}
              onBlur={() => useEditorStore.getState().endTransaction()}
              onChange={(e) => onProjectUpdate({ name: e.target.value })}
            />
          </label>
          <label className="property-row">
            <span>画面比例</span>
            <select
              aria-label="画面比例"
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
                  自定义
                </option>
              )}
              <option value="1920:1080">16:9 · 横屏</option>
              <option value="1080:1920">9:16 · 竖屏</option>
              <option value="1080:1080">1:1 · 方形</option>
              <option value="1440:1080">4:3 · 经典</option>
              <option value="2560:1440">16:9 · 2K</option>
              <option value="3840:2160">16:9 · 4K</option>
            </select>
          </label>
          <NumberField
            label="宽度"
            value={project.width}
            min={16}
            max={7680}
            step={2}
            suffix="px"
            onChange={(width) => onProjectUpdate({ width })}
          />
          <NumberField
            label="高度"
            value={project.height}
            min={16}
            max={7680}
            step={2}
            suffix="px"
            onChange={(height) => onProjectUpdate({ height })}
          />
          <label className="property-row">
            <span>帧率</span>
            <select
              aria-label="帧率"
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
            <span>背景颜色</span>
            <input
              aria-label="背景颜色"
              type="color"
              value={project.background}
              onChange={(e) => onProjectUpdate({ background: e.target.value })}
            />
            <code>{project.background}</code>
          </label>
          <div className="inspector-guide">
            <Image size={30} />
            <p>选择时间线片段</p>
            <span>在这里调整画面、音频、文字和动画</span>
          </div>
          <div className="offline-note">
            <span className="status-dot" />
            素材留在本机，项目完全离线
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
  const pictureTabs = ["画面", "裁剪", "抠像", "蒙版"];
  const pictureActive = pictureTabs.includes(tab);
  const tabs = clip.text
    ? ["文本", "画面", "动画", "速度"]
    : visual
      ? ["画面", "音频", "速度", "动画", "调色"]
      : ["音频", "速度", "动画"];
  const tabLabel = (value: string) =>
    value === "速度" ? "变速" : value === "调色" ? "调整" : value;
  return (
    <aside className="inspector panel">
      <div className="inspector-tabs">
        <nav className="inspector-main-tabs" aria-label="片段属性">
          {tabs.map((t) => (
            <button
              key={t}
              aria-label={t}
              aria-pressed={tab === t || (t === "画面" && pictureActive)}
              className={tab === t || (t === "画面" && pictureActive) ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {tabLabel(t)}
            </button>
          ))}
        </nav>
        {visual && !clip.text && (
          <nav className="inspector-picture-tabs" aria-label="画面工具" hidden={!pictureActive}>
            {pictureTabs.map((t) => (
              <button
                key={t}
                aria-label={t === "画面" ? "基础画面" : t}
                aria-pressed={tab === t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t === "画面" ? "基础" : t}
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
          <div className="inline-warning">轨道已锁定，解锁后可编辑</div>
        )}
        <fieldset disabled={locked}>
          {["裁剪", "抠像", "蒙版"].includes(tab) && (
            <VisualTools
              mode={
                tab === "裁剪" ? "crop" : tab === "抠像" ? "chroma" : "mask"
              }
              clip={clip}
              asset={asset}
              onUpdate={onUpdate}
              locked={locked}
            />
          )}
          {tab === "画面" && (
            <>
              <div className="section-title">
                <h3>位置大小</h3>
                <button
                  title="重置变换"
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
                label="缩放"
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
                label="位置 X"
                value={evaluated.transform.x}
                onChange={(v) => animate("x", v)}
                diamond={() => key("x", evaluated.transform.x)}
              />
              <NumberField
                label="位置 Y"
                value={evaluated.transform.y}
                onChange={(v) => animate("y", v)}
                diamond={() => key("y", evaluated.transform.y)}
              />
              </div>
              <NumberField
                label="旋转"
                value={evaluated.transform.rotation}
                min={-3600}
                max={3600}
                suffix="°"
                onChange={(v) => animate("rotation", v)}
                diamond={() => key("rotation", evaluated.transform.rotation)}
              />
              <NumberField
                label="不透明度"
                value={evaluated.transform.opacity * 100}
                min={0}
                max={100}
                suffix="%"
                onChange={(v) => animate("opacity", v / 100)}
                diamond={() => key("opacity", evaluated.transform.opacity)}
              />
              <div className="property-row">
                <span>翻转</span>
                <div className="segmented">
                  <button
                    className={clip.transform.flipX ? "active" : ""}
                    title="水平翻转"
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
                    title="垂直翻转"
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
              <h3>画面淡入淡出</h3>
              <NumberField
                label="画面淡入"
                value={clip.fadeIn}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(fadeIn) => onUpdate({ fadeIn })}
              />
              <NumberField
                label="画面淡出"
                value={clip.fadeOut}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(fadeOut) => onUpdate({ fadeOut })}
              />
              {asset?.kind === "image" && (
                <>
                  <h3>片段时长</h3>
                  <NumberField
                    label="片段时长"
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
                    定格画面或图片在时间线上的持续时间。
                  </p>
                </>
              )}
            </>
          )}
          {tab === "音频" && (
            <>
              <h3>音量</h3>
              <NumberField
                label="音量"
                value={evaluated.volume * 100}
                min={0}
                max={400}
                suffix="%"
                onChange={(v) => animate("volume", v / 100)}
                diamond={() => key("volume", evaluated.volume)}
              />
              <label className="toggle-property">
                <span>片段静音</span>
                <input
                  aria-label="片段静音"
                  type="checkbox"
                  checked={clip.muted}
                  onChange={(e) => onUpdate({ muted: e.target.checked })}
                />
              </label>
              <h3>声音淡入淡出</h3>
              <NumberField
                label="声音淡入"
                value={clip.audioFadeIn}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(audioFadeIn) => onUpdate({ audioFadeIn })}
              />
              <NumberField
                label="声音淡出"
                value={clip.audioFadeOut}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(audioFadeOut) => onUpdate({ audioFadeOut })}
              />
              {!asset?.hasAudio && (
                <p className="muted">这段素材没有音频流。</p>
              )}
              {asset?.kind === "video" && asset.hasAudio && onSeparateAudio && (
                <div className="audio-separate">
                  <h3>分离音频</h3>
                  <button
                    className="small-button"
                    disabled={separating}
                    onClick={onSeparateAudio}
                  >
                    <AudioLines size={14} />
                    {separating ? "正在分离音频…" : "分离音频"}
                  </button>
                  <p className="muted small">
                    将视频中的声音写成独立音频片段，原片段自动静音，可单独调整。
                  </p>
                </div>
              )}
            </>
          )}
          {tab === "调色" && (
            <>
              <div className="section-title">
                <h3>基础调整</h3>
                <button
                  title="重置调色"
                  onClick={() =>
                    onUpdate({ adjustments: { ...DEFAULT_ADJUSTMENTS } })
                  }
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <Slider
                label="亮度"
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
                label="对比度"
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
                label="饱和度"
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
                label="色温"
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
                label="模糊"
                value={clip.adjustments.blur}
                min={0}
                max={100}
                step={1}
                onChange={(v) =>
                  onUpdate({ adjustments: { ...clip.adjustments, blur: v } })
                }
              />
              <p className="field-hint">
                预览与导出使用相同的 RGB
                调整模型，编码与色彩转换可能产生轻微差异。
              </p>
            </>
          )}
          {tab === "文本" && clip.text && (
            <>
              <h3>文字内容</h3>
              <textarea
                aria-label="文字内容"
                value={clip.text.text}
                rows={4}
                onFocus={() => useEditorStore.getState().beginTransaction()}
                onBlur={() => useEditorStore.getState().endTransaction()}
                onChange={(e) =>
                  onUpdate({
                    name: e.target.value.slice(0, 30) || "文本",
                    text: { ...clip.text!, text: e.target.value },
                  })
                }
              />
              <label className="property-row">
                <span>字体</span>
                <select
                  aria-label="字体"
                  value={clip.text.fontFamily}
                  onChange={(e) =>
                    onUpdate({
                      text: { ...clip.text!, fontFamily: e.target.value },
                    })
                  }
                >
                  <option value="sans-serif">系统默认</option>
                  {fonts
                    .filter((f) => f !== "sans-serif")
                    .map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                </select>
              </label>
              <NumberField
                label="字号"
                value={clip.text.fontSize}
                min={1}
                max={1000}
                suffix="px"
                onChange={(fontSize) =>
                  onUpdate({ text: { ...clip.text!, fontSize } })
                }
              />
              <label className="property-row">
                <span>文字颜色</span>
                <input
                  aria-label="文字颜色"
                  type="color"
                  value={clip.text.color}
                  onChange={(e) =>
                    onUpdate({ text: { ...clip.text!, color: e.target.value } })
                  }
                />
                <button
                  className={clip.text.bold ? "active" : ""}
                  title="加粗"
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
                <span>对齐</span>
                <div className="segmented">
                  {(["left", "center", "right"] as const).map((align, i) => (
                    <button
                      key={align}
                      title={["左对齐", "居中", "右对齐"][i]}
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
              <h3>描边与背景</h3>
              <label className="property-row">
                <span>描边颜色</span>
                <input
                  aria-label="描边颜色"
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
                label="描边宽度"
                value={clip.text.strokeWidth}
                min={0}
                max={100}
                onChange={(strokeWidth) =>
                  onUpdate({ text: { ...clip.text!, strokeWidth } })
                }
              />
              <label className="toggle-property">
                <span>文字背景</span>
                <input
                  type="checkbox"
                  aria-label="文字背景"
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
                  aria-label="文字背景颜色"
                  value={clip.text.background}
                  onChange={(e) =>
                    onUpdate({
                      text: { ...clip.text!, background: e.target.value },
                    })
                  }
                />
              )}
              <h3>排版与阴影</h3>
              <Slider
                label="行高"
                value={clip.text.lineHeight ?? 1.3}
                min={0.9}
                max={2.4}
                step={0.05}
                onChange={(lineHeight) =>
                  onUpdate({ text: { ...clip.text!, lineHeight } })
                }
              />
              <Slider
                label="内边距"
                value={clip.text.padding ?? 0.25}
                min={0}
                max={1.2}
                step={0.05}
                onChange={(padding) =>
                  onUpdate({ text: { ...clip.text!, padding } })
                }
              />
              <Slider
                label="圆角"
                value={clip.text.radius ?? 0}
                min={0}
                max={1}
                step={0.05}
                onChange={(radius) =>
                  onUpdate({ text: { ...clip.text!, radius } })
                }
              />
              <label className="toggle-property">
                <span>文字阴影</span>
                <input
                  type="checkbox"
                  aria-label="文字阴影"
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
                    <span>阴影颜色</span>
                    <input
                      aria-label="阴影颜色"
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
                    label="阴影模糊"
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
                    label="阴影偏移 X"
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
                    label="阴影偏移 Y"
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
          {tab === "速度" && (
            <>
              <h3>常规变速</h3>
              <NumberField
                label="播放速度"
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
                更改变速会保留源素材范围并调整片段时长。音频保持音高。
              </p>
              <h3>时间范围</h3>
              <NumberField
                label="开始时间"
                value={clip.start}
                min={0}
                step={1 / project.fps}
                suffix="s"
                onChange={(start) => onUpdate({ start })}
              />
              <NumberField
                label="源素材入点"
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
                在时间线上拖动片段两侧，可以裁剪入点和出点。
              </p>
              {asset?.kind === "video" && onReverse && onFreezeFrame && (
                <div className="clip-tools">
                  <h3>片段工具</h3>
                  <div className="clip-tool-row">
                    <button
                      className="small-button"
                      disabled={reversing || locked}
                      onClick={onReverse}
                    >
                      <RotateCcw size={14} />
                      {reversing
                        ? `正在倒放… ${Math.round(reverseProgress ?? 0)}%`
                        : "倒放片段"}
                    </button>
                    {reversing && onCancelReverse && (
                      <button
                        className="small-button"
                        onClick={onCancelReverse}
                      >
                        取消
                      </button>
                    )}
                  </div>
                  {reversing && (
                    <progress
                      className="clip-tool-progress"
                      max={100}
                      value={reverseProgress ?? 0}
                      aria-label="倒放进度"
                    />
                  )}
                  <p className="muted small">
                    视频与原有声音一起倒放。系统会生成独立媒体，原素材不会被覆盖。
                  </p>
                  <h3>定格画面</h3>
                  <NumberField
                    label="定格时长"
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
                    {freezing ? "正在生成定格画面…" : "定格当前帧"}
                  </button>
                  <p className="muted small">
                    {playheadInside
                      ? "从当前播放头生成独立画面，可在画面属性中调整持续时长。"
                      : "请先把播放头移到当前视频片段范围内。"}
                  </p>
                </div>
              )}
            </>
          )}
          {tab === "动画" && (
            <>
              <h3>关键帧</h3>
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
