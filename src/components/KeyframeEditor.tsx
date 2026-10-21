import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ClipboardPaste, Copy, Crosshair, Diamond, Trash2 } from "lucide-react";
import type { Clip, Keyframe, Project } from "../core/types";
import {
  evaluateKeyframes,
  formatTime,
  id,
  snapToFrame,
} from "../core/model";
import { useEditorStore } from "../editor/store";
import "./KeyframeEditor.css";

type Property = Keyframe["property"];
type Easing = Keyframe["easing"];

const PROPERTIES: Property[] = [
  "x",
  "y",
  "scale",
  "rotation",
  "opacity",
  "volume",
];
const PROPERTY_LABELS: Record<Property, string> = {
  x: "位置 X",
  y: "位置 Y",
  scale: "缩放",
  rotation: "旋转",
  opacity: "透明度",
  volume: "音量",
};
const EASINGS: Easing[] = ["linear", "easeIn", "easeOut", "easeInOut"];
const EASING_LABELS: Record<Easing, string> = {
  linear: "线性",
  easeIn: "缓入",
  easeOut: "缓出",
  easeInOut: "缓入缓出",
};

const WIDTH = 320;
const HEIGHT = 170;
const PAD = { left: 30, right: 10, top: 14, bottom: 24 };
const PLOT_WIDTH = WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;
const SAMPLE_COUNT = 80;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function valueLimits(property: Property): { min: number; max: number } {
  if (property === "scale") return { min: 0.000001, max: 10 };
  if (property === "opacity") return { min: 0, max: 1 };
  if (property === "volume") return { min: 0, max: 4 };
  if (property === "rotation") return { min: -3600, max: 3600 };
  return { min: -100000, max: 100000 };
}

function valueStep(property: Property): number {
  if (property === "opacity" || property === "volume") return 0.01;
  if (property === "scale") return 0.01;
  return 1;
}

function clampValue(property: Property, value: number): number {
  const limits = valueLimits(property);
  return Number(
    clamp(value, limits.min, limits.max).toFixed(property === "scale" ? 3 : 2),
  );
}

function propertyValue(clip: Clip, property: Property): number {
  return property === "volume" ? clip.volume : clip.transform[property];
}

function graphDomain(
  property: Property,
  values: number[],
  current: number,
): { min: number; max: number } {
  const finite = [...values, current].filter((value) => Number.isFinite(value));
  if (!finite.length) finite.push(0);
  let min = Math.min(...finite),
    max = Math.max(...finite);
  if (property === "opacity") {
    min = 0;
    max = 1;
  } else if (property === "volume") {
    min = 0;
    max = Math.max(1, max);
  } else if (property === "scale") {
    min = 0;
    max = Math.max(1.5, max);
  } else {
    const span = Math.max(
      max - min,
      property === "rotation" ? 20 : 40,
    );
    (min -= span * 0.2), (max += span * 0.2);
  }
  if (max - min < 1e-6) max = min + 1;
  return { min, max };
}

function formatValue(property: Property, value: number): string {
  if (property === "scale") return `${value.toFixed(2)}×`;
  if (property === "opacity") return `${Math.round(value * 100)}%`;
  if (property === "rotation") return `${value.toFixed(0)}°`;
  if (property === "volume") return value.toFixed(2);
  return value.toFixed(0);
}

interface Props {
  clip: Clip;
  project: Project;
  playhead: number;
  visual: boolean;
  locked?: boolean;
  onUpdate: (patch: Partial<Clip>) => void;
}

export default function KeyframeEditor({
  clip,
  project,
  playhead,
  visual,
  locked = false,
  onUpdate,
}: Props) {
  const [property, setProperty] = useState<Property>("x");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<Omit<Keyframe, "id"> | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  const duration = Math.max(clip.duration, 1 / project.fps);
  const localPlayhead = clamp(playhead - clip.start, 0, duration);
  const allKeys = useMemo(
    () => [...clip.keyframes].sort((a, b) => a.time - b.time),
    [clip.keyframes],
  );
  const keys = useMemo(
    () =>
      clip.keyframes
        .filter((key) => key.property === property)
        .sort((a, b) => a.time - b.time),
    [clip.keyframes, property],
  );
  const selected = keys.find((key) => key.id === selectedId) ?? null;
  const current = propertyValue(evaluateKeyframes(clip, localPlayhead), property);
  const domain = useMemo(
    () => graphDomain(property, keys.map((key) => key.value), current),
    [keys, property, current],
  );
  const samples = useMemo(() => {
    const result: number[] = [];
    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const time = (duration * index) / SAMPLE_COUNT;
      result.push(propertyValue(evaluateKeyframes(clip, time), property));
    }
    return result;
  }, [clip, property, duration]);

  useEffect(() => {
    const available = PROPERTIES.filter(
      (entry) => visual || entry === "volume",
    );
    const next =
      available.find((entry) =>
        clip.keyframes.some((key) => key.property === entry),
      ) ?? (visual ? "x" : "volume");
    setProperty(next);
    setSelectedId(
      clip.keyframes.find((key) => key.property === next)?.id ?? null,
    );
  }, [clip.id]);

  useEffect(() => {
    if (
      selectedId &&
      clip.keyframes.some(
        (key) => key.id === selectedId && key.property === property,
      )
    )
      return;
    setSelectedId(
      clip.keyframes.find((key) => key.property === property)?.id ?? null,
    );
  }, [clip.keyframes, property, selectedId]);

  useEffect(
    () => () => {
      if (dragging.current) {
        dragging.current = null;
        useEditorStore.getState().endTransaction();
      }
    },
    [],
  );

  const xFor = (time: number) =>
    PAD.left + (clamp(time, 0, duration) / duration) * PLOT_WIDTH;
  const yFor = (value: number) =>
    PAD.top +
    (1 - (value - domain.min) / (domain.max - domain.min)) * PLOT_HEIGHT;
  const curve = samples
    .map((value, index) => {
      const time = (duration * index) / SAMPLE_COUNT;
      return `${index ? "L" : "M"}${xFor(time).toFixed(2)},${yFor(value).toFixed(2)}`;
    })
    .join(" ");

  const updateKey = (keyId: string, patch: Partial<Keyframe>) => {
    if (locked) return;
    onUpdate({
      keyframes: clip.keyframes.map((key) =>
        key.id === keyId ? { ...key, ...patch } : key,
      ),
    });
  };

  const addKey = (nextProperty: Property) => {
    if (locked) return;
    const time = clamp(
      snapToFrame(localPlayhead, project.fps),
      0,
      duration,
    );
    const value = clampValue(
      nextProperty,
      propertyValue(evaluateKeyframes(clip, time), nextProperty),
    );
    const next: Keyframe = {
      id: id(),
      property: nextProperty,
      time,
      value,
      easing: "linear",
    };
    const existing = clip.keyframes.find(
      (key) =>
        key.property === nextProperty &&
        Math.abs(key.time - time) < 0.5 / project.fps,
    );
    onUpdate({
      keyframes: existing
        ? clip.keyframes.map((key) => (key.id === existing.id ? next : key))
        : [...clip.keyframes, next],
    });
    setProperty(nextProperty);
    setSelectedId(next.id);
  };

  const removeKey = (keyId: string) => {
    if (locked) return;
    onUpdate({
      keyframes: clip.keyframes.filter((key) => key.id !== keyId),
    });
    if (selectedId === keyId) setSelectedId(null);
  };

  const copyKey = () => {
    if (!selected) return;
    setClipboard({
      property: selected.property,
      time: selected.time,
      value: selected.value,
      easing: selected.easing,
      ...(selected.easingWindow
        ? { easingWindow: { ...selected.easingWindow } }
        : {}),
    });
  };

  const pasteKey = () => {
    if (!clipboard || locked) return;
    const time = clamp(
      snapToFrame(localPlayhead, project.fps),
      0,
      duration,
    );
    const next: Keyframe = {
      ...clipboard,
      id: id(),
      time,
      value: clampValue(clipboard.property, clipboard.value),
      ...(clipboard.easingWindow
        ? { easingWindow: { ...clipboard.easingWindow } }
        : {}),
    };
    onUpdate({
      keyframes: [
        ...clip.keyframes.filter(
          (key) =>
            !(
              key.property === next.property &&
              Math.abs(key.time - time) < 0.5 / project.fps
            ),
        ),
        next,
      ],
    });
    setProperty(next.property);
    setSelectedId(next.id);
  };

  const seekTo = (time: number) =>
    useEditorStore.getState().seek(clip.start + clamp(time, 0, duration));

  const pointerPosition = (event: { clientX: number; clientY: number }) => {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  const startDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
    key: Keyframe,
  ) => {
    if (locked) return;
    event.preventDefault();
    event.stopPropagation();
    svg.current?.setPointerCapture(event.pointerId);
    useEditorStore.getState().beginTransaction();
    dragging.current = key.id;
    setSelectedId(key.id);
  };

  const movePoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const keyId = dragging.current;
    if (!keyId) return;
    const position = pointerPosition(event);
    const time = clamp(
      snapToFrame(
        ((position.x - PAD.left) / PLOT_WIDTH) * duration,
        project.fps,
      ),
      0,
      duration,
    );
    const value =
      domain.max -
      ((position.y - PAD.top) / PLOT_HEIGHT) * (domain.max - domain.min);
    updateKey(keyId, { time, value: clampValue(property, value) });
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    dragging.current = null;
    useEditorStore.getState().endTransaction();
    if (svg.current?.hasPointerCapture(event.pointerId))
      svg.current.releasePointerCapture(event.pointerId);
  };

  const seekAt = (event: ReactPointerEvent<SVGRectElement>) => {
    const position = pointerPosition(event);
    seekTo(((position.x - PAD.left) / PLOT_WIDTH) * duration);
  };

  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => duration * ratio,
  );

  return (
    <div className="keyframe-editor">
      <p className="field-hint">
        拖动曲线点调整时间和数值；点击曲线定位播放头。选中关键帧后可精确输入、复制或粘贴。
      </p>
      <div className="keyframe-toolbar">
        <select
          aria-label="曲线属性"
          value={property}
          onChange={(event) => setProperty(event.target.value as Property)}
        >
          {PROPERTIES.filter((entry) => visual || entry === "volume").map(
            (entry) => (
              <option key={entry} value={entry}>
                {PROPERTY_LABELS[entry]}
              </option>
            ),
          )}
        </select>
        <button
          aria-label="复制关键帧"
          title="复制关键帧"
          disabled={!selected || locked}
          onClick={copyKey}
        >
          <Copy size={12} />
        </button>
        <button
          aria-label="粘贴关键帧"
          title="粘贴到播放头"
          disabled={!clipboard || locked}
          onClick={pasteKey}
        >
          <ClipboardPaste size={12} />
        </button>
        <span className="keyframe-current">
          当前 {formatValue(property, current)}
        </span>
      </div>
      <div className="keyframe-curve">
        <svg
          ref={svg}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${PROPERTY_LABELS[property]}关键帧曲线`}
          onPointerMove={movePoint}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <rect
            className="keyframe-plot-bg"
            x={PAD.left}
            y={PAD.top}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            onPointerDown={seekAt}
          />
          {[0, 0.5, 1].map((ratio) => {
            const y = PAD.top + PLOT_HEIGHT * ratio;
            return (
              <line
                key={`h-${ratio}`}
                className="keyframe-grid"
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
              />
            );
          })}
          {timeTicks.map((time) => {
            const x = xFor(time);
            return (
              <g key={`v-${time}`}>
                <line
                  className="keyframe-grid"
                  x1={x}
                  x2={x}
                  y1={PAD.top}
                  y2={HEIGHT - PAD.bottom}
                />
                <text
                  className="keyframe-axis"
                  x={x}
                  y={HEIGHT - 7}
                  textAnchor={
                    time === 0 ? "start" : time === duration ? "end" : "middle"
                  }
                >
                  {formatTime(time, project.fps).replace(/^00:/, "")}
                </text>
              </g>
            );
          })}
          <text className="keyframe-axis" x={4} y={PAD.top + 4}>
            {formatValue(property, domain.max)}
          </text>
          <text
            className="keyframe-axis"
            x={4}
            y={HEIGHT - PAD.bottom}
          >
            {formatValue(property, domain.min)}
          </text>
          {playhead >= clip.start &&
            playhead <= clip.start + clip.duration && (
              <line
                className="keyframe-playhead"
                x1={xFor(localPlayhead)}
                x2={xFor(localPlayhead)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
              />
            )}
          <path className="keyframe-curve-line" d={curve} />
          {keys.map((key) => (
            <circle
              key={key.id}
              className={`keyframe-point${selectedId === key.id ? " selected" : ""}`}
              cx={xFor(key.time)}
              cy={yFor(key.value)}
              r={selectedId === key.id ? 5.5 : 4}
              onPointerDown={(event) => startDrag(event, key)}
            >
              <title>
                {formatTime(key.time, project.fps)} ·{" "}
                {formatValue(property, key.value)}
              </title>
            </circle>
          ))}
        </svg>
      </div>
      {selected ? (
        <div className="keyframe-detail">
          <label>
            时间
            <input
              aria-label="精确关键帧时间"
              type="number"
              min={0}
              max={clip.duration}
              step={1 / project.fps}
              value={selected.time}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value))
                  updateKey(selected.id, {
                    time: clamp(value, 0, clip.duration),
                  });
              }}
            />
          </label>
          <label>
            数值
            <input
              aria-label="精确关键帧数值"
              type="number"
              min={valueLimits(property).min}
              max={valueLimits(property).max}
              step={valueStep(property)}
              value={selected.value}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value))
                  updateKey(selected.id, {
                    value: clampValue(property, value),
                  });
              }}
            />
          </label>
          <label>
            插值
            <select
              aria-label="关键帧插值"
              value={selected.easing}
              onChange={(event) =>
                updateKey(selected.id, {
                  easing: event.target.value as Easing,
                  easingWindow: undefined,
                })
              }
            >
              {EASINGS.map((easing) => (
                <option key={easing} value={easing}>
                  {EASING_LABELS[easing]}
                </option>
              ))}
            </select>
          </label>
          <button
            aria-label="跳转到关键帧"
            title="跳转到关键帧"
            onClick={() => seekTo(selected.time)}
          >
            <Crosshair size={12} />
          </button>
          <button
            aria-label="删除关键帧"
            title="删除关键帧"
            disabled={locked}
            onClick={() => removeKey(selected.id)}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ) : (
        <p className="keyframe-empty">
          在曲线或列表中选择一个关键帧，或把播放头移到目标时间后添加。
        </p>
      )}
      <div className="keyframe-add">
        {PROPERTIES.filter((entry) => visual || entry === "volume").map(
          (entry) => (
            <button
              key={entry}
              disabled={locked}
              onClick={() => addKey(entry)}
            >
              <Diamond size={11} />
              {PROPERTY_LABELS[entry]}
            </button>
          ),
        )}
      </div>
      <div className="keyframe-list" aria-label="关键帧列表">
        {!allKeys.length && <div className="quiet-empty">还没有关键帧</div>}
        {allKeys.map((key) => (
          <div
            key={key.id}
            className={`keyframe-row${selectedId === key.id ? " selected" : ""}`}
            onPointerDown={() => {
              setProperty(key.property);
              setSelectedId(key.id);
            }}
            onClick={() => {
              setProperty(key.property);
              setSelectedId(key.id);
            }}
          >
            <button
              className="keyframe-time"
              onClick={(event) => {
                event.stopPropagation();
                seekTo(key.time);
              }}
            >
              {formatTime(key.time, project.fps)}
            </button>
            <span>{PROPERTY_LABELS[key.property]}</span>
            <input
              aria-label={`关键帧 ${PROPERTY_LABELS[key.property]} 值`}
              type="number"
              step={valueStep(key.property)}
              min={valueLimits(key.property).min}
              max={valueLimits(key.property).max}
              value={key.value}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value))
                  updateKey(key.id, {
                    value: clampValue(key.property, value),
                  });
              }}
            />
            <select
              aria-label="关键帧插值"
              value={key.easing}
              onChange={(event) =>
                updateKey(key.id, {
                  easing: event.target.value as Easing,
                  easingWindow: undefined,
                })
              }
            >
              {EASINGS.map((easing) => (
                <option key={easing} value={easing}>
                  {EASING_LABELS[easing]}
                </option>
              ))}
            </select>
            <button
              aria-label="删除关键帧"
              disabled={locked}
              onClick={(event) => {
                event.stopPropagation();
                removeKey(key.id);
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
