import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AudioLines,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Film,
  LockKeyhole,
  Magnet,
  MoreHorizontal,
  MousePointer2,
  Music2,
  Pencil,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Type,
  Undo2,
  UnlockKeyhole,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Clip, MediaAsset, Project, Track, TrackKind } from "../core/types";
import { snapToFrame } from "../core/model";
import {
  MAX_PPS,
  MIN_PPS,
  clampPps,
  clampScrollLeft,
  fitTimelinePps,
  panScrollLeft,
  visibleRange,
  wheelZoomPps,
  zoomedScrollLeft,
} from "../core/timelineView";
import {
  inertiaStep,
  minimapGeometry,
  minimapScrollLeft,
  pointerVelocity,
} from "../core/timelineMotion";
import { performanceNotes, visibleClips } from "../core/limits";
import "./Timeline.css";

export interface TimelineProps {
  project: Project;
  selectedIds: string[];
  playhead: number;
  playing: boolean;
  zoom: number;
  onSeek: (time: number) => void;
  onSelect: (ids: string[]) => void;
  onClipUpdate: (id: string, patch: Partial<Clip>) => void;
  onMoveClips: (ids: string[], delta: number, trackId?: string) => void;
  onTrim: (id: string, edge: "start" | "end", time: number) => void;
  onSplit: () => void;
  onDelete: () => void;
  onZoom: (zoom: number) => void;
  onTrackUpdate: (id: string, patch: Partial<Track>) => void;
  onAddTrack: (kind: TrackKind) => void;
  onTrackDelete?: (id: string) => void;
  onTrackMove?: (id: string, direction: "up" | "down") => void;
  onDropAsset?: (assetId: string, time: number, trackId: string) => void;
  /** Several library assets dropped at once; `index` preserves the library order. */
  onDropAssets?: (assetIds: string[], time: number, trackId: string) => void;
  /** A creative-library preset (transition, motion, effect or text template). */
  onDropPreset?: (
    preset: LibraryPreset,
    target: { clipId?: string; time: number; trackId?: string },
  ) => void;
  /** A bundled (offline) asset dropped from the inspiration library. */
  onDropBuiltin?: (builtinId: string, time: number, trackId: string) => void;
  snapping?: boolean;
  onSnappingChange?: (value: boolean) => void;
  magnetic?: boolean;
  onMagneticChange?: (value: boolean) => void;
  onDuplicate?: () => void;
  onAddText?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const GUTTER = 158;
const ROW = 70;
const RULER = 30;
export const ASSET_DRAG_TYPE = "application/x-cevikedit-asset";
export const ASSET_IDS_DRAG_TYPE = "application/x-cevikedit-assets";
export const PRESET_DRAG_TYPE = "application/x-cevikedit-preset";
export const BUILTIN_DRAG_TYPE = "application/x-cevikedit-builtin";
export type LibraryPresetKind = "transition" | "motion" | "effect" | "text";
export interface LibraryPreset {
  kind: LibraryPresetKind;
  id: string;
  /** Transition length in seconds when the preset carries one. */
  seconds?: number;
}
/** Serialises a library preset so the timeline can apply it on drop. */
export function writePresetDrag(
  transfer: DataTransfer,
  preset: LibraryPreset,
): void {
  transfer.setData(PRESET_DRAG_TYPE, JSON.stringify(preset));
  transfer.setData("text/plain", `${preset.kind}:${preset.id}`);
  transfer.effectAllowed = "copy";
}
export function readPresetDrag(transfer: DataTransfer): LibraryPreset | null {  const raw = transfer.getData(PRESET_DRAG_TYPE);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LibraryPreset>;
    if (
      !value ||
      typeof value.id !== "string" ||
      !["transition", "motion", "effect", "text"].includes(String(value.kind))
    )
      return null;
    return {
      kind: value.kind as LibraryPresetKind,
      id: value.id,
      seconds: typeof value.seconds === "number" ? value.seconds : undefined,
    };
  } catch {
    return null;
  }
}
export function formatTimelineTime(seconds: number, fps = 30) {
  const frames = Math.max(0, Math.round(seconds * fps));
  const secs = Math.floor(frames / fps);
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}:${String(frames % fps).padStart(2, "0")}`;
}
export function snapTimelineTime(
  time: number,
  candidates: number[],
  threshold: number,
) {
  let nearest = time;
  let distance = threshold;
  for (const candidate of candidates) {
    const diff = Math.abs(candidate - time);
    if (diff < distance) {
      nearest = candidate;
      distance = diff;
    }
  }
  return nearest;
}
export function formatRulerTime(seconds: number, fractional = false) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${fractional ? remainder.toFixed(1).padStart(4, "0") : String(Math.round(remainder)).padStart(2, "0")}`;
}
export function rulerInterval(pixelsPerSecond: number) {
  return (
    [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(
      (n) => n * pixelsPerSecond >= 76,
    ) ?? 1200
  );
}
/** Separate overlapping intervals into visual sublanes without changing project tracks. */
export function layoutTrackClips(clips: Clip[]) {
  const ends: number[] = [];
  const lanes = new Map<string, number>();
  for (const clip of [...clips].sort((a, b) => a.start - b.start)) {
    let lane = ends.findIndex((end) => end <= clip.start + 0.00001);
    if (lane < 0) lane = ends.length;
    ends[lane] = clip.start + clip.duration;
    lanes.set(clip.id, lane);
  }
  return {
    lanes,
    count: Math.max(1, ends.length),
    height: Math.max(ROW, ends.length * 62 + 8),
  };
}
export function canMoveToTrack(clip: Clip, track: Track, project: Project) {
  if (track.locked) return false;
  if (clip.text) return track.kind === "text";
  const kind =
    project.assets.find((a) => a.id === clip.assetId)?.kind ??
    project.tracks.find((t) => t.id === clip.trackId)?.kind;
  return kind === "audio"
    ? track.kind === "audio"
    : kind === "video"
      ? track.kind === "video"
      : kind === "image" && ["video", "image"].includes(track.kind);
}
export function waveformSamples(
  clip: Clip,
  waveform: number[],
  count: number,
  sourceDuration: number,
) {
  if (!waveform.length || sourceDuration <= 0)
    return Array.from({ length: count }, () => 0);
  return Array.from({ length: count }, (_, i) => {
    const at =
      clip.sourceIn + (i / Math.max(1, count - 1)) * clip.duration * clip.speed;
    const index = Math.max(
      0,
      Math.min(
        waveform.length - 1,
        Math.floor((at / sourceDuration) * waveform.length),
      ),
    );
    return waveform[index];
  });
}
/**
 * Mirrored peak bars. One path of vertical strokes keeps the DOM light, and the
 * non-scaling stroke keeps the bars readable at every zoom level.
 */
function Waveform({
  clip,
  asset,
  width,
}: {
  clip: Clip;
  asset: MediaAsset;
  width: number;
}) {
  const waveform = asset.waveform;
  if (!waveform?.length) return null;
  const samples = waveformSamples(
    clip,
    waveform,
    Math.min(520, Math.max(16, Math.round(width / 2.6))),
    asset.duration,
  );
  const bars = samples
    .map((value, index) => {
      const x = ((index + 0.5) / samples.length) * 1000;
      const half = Math.max(
        1.6,
        Math.min(34, Math.sqrt(Math.max(0, value)) * 32),
      );
      return `M${x.toFixed(1)},${(50 - half).toFixed(1)}V${(50 + half).toFixed(1)}`;
    })
    .join("");
  return (
    <svg
      className="tl-waveform"
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={bars} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function TrackIcon({ kind }: { kind: TrackKind }) {
  return kind === "audio" ? (
    <Music2 size={15} />
  ) : kind === "text" ? (
    <Type size={15} />
  ) : (
    <Film size={15} />
  );
}
type Gesture =
  | {
      kind: "move";
      ids: string[];
      delta: number;
      primaryId: string;
      trackId: string;
      targetTrackId: string;
    }
  | { kind: "trim"; id: string; edge: "start" | "end"; time: number }
  | { kind: "marquee"; x: number; y: number; width: number; height: number };

export default function Timeline(props: TimelineProps) {
  const { project, selectedIds, playhead, zoom, onSeek, onSelect } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLElement>(null);
  const frozenLayoutsRef = useRef<Array<
    ReturnType<typeof layoutTrackClips> & { id: string; top: number }
  > | null>(null);
  const renameDraftRef = useRef("");
  const renameCancelledRef = useRef(false);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    trackId: string;
    time: number;
  } | null>(null);
  const [trackActions, setTrackActions] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTrackId, setDeleteTrackId] = useState<string | null>(null);
  const [trackMenu, setTrackMenu] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [panning, setPanning] = useState(false);
  const [localSnap, setLocalSnap] = useState(true);
  const [localMagnetic, setLocalMagnetic] = useState(false);
  const snapping = props.snapping ?? localSnap;
  const magnetic = props.magnetic ?? localMagnetic;
  const pps = clampPps(zoom);
  const duration = Math.max(
    30,
    (viewportWidth - GUTTER) / pps,
    ...project.clips.map((c) => c.start + c.duration + 10),
    playhead + 8,
  );
  const bodyWidth = duration * pps;
  const interval = rulerInterval(pps);
  const view = visibleRange(scrollLeft, viewportWidth, GUTTER, pps);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const minimap = minimapOpen
    ? minimapGeometry({
        duration,
        pps,
        scrollLeft,
        viewportWidth,
        gutter: GUTTER,
        playhead,
        clips: project.clips.map((clip) => ({
          start: clip.start,
          duration: clip.duration,
          track: Math.max(
            0,
            project.tracks.findIndex((track) => track.id === clip.trackId),
          ),
        })),
      })
    : null;
  const ticks = Array.from(
    { length: Math.ceil(duration / interval) + 1 },
    (_, i) => i * interval,
  );
  const setActiveGesture = (g: Gesture | null) => {
    if (g && g.kind !== "marquee" && !frozenLayoutsRef.current)
      frozenLayoutsRef.current = trackLayouts.map((layout) => ({
        ...layout,
        lanes: new Map(layout.lanes),
      }));
    if (!g) frozenLayoutsRef.current = null;
    gestureRef.current = g;
    setGesture(g);
  };
  const displayClip = (clip: Clip) => {
    if (gesture?.kind === "move" && gesture.ids.includes(clip.id))
      return {
        ...clip,
        start: Math.max(0, clip.start + gesture.delta),
        trackId:
          gesture.targetTrackId !== gesture.trackId &&
          canMoveToTrack(
            clip,
            project.tracks.find((t) => t.id === gesture.targetTrackId)!,
            project,
          )
            ? gesture.targetTrackId
            : clip.trackId,
      };
    if (gesture?.kind === "trim" && gesture.id === clip.id)
      return gesture.edge === "start"
        ? {
            ...clip,
            start: gesture.time,
            duration: clip.start + clip.duration - gesture.time,
            sourceIn: clip.sourceIn + (gesture.time - clip.start) * clip.speed,
          }
        : { ...clip, duration: gesture.time - clip.start };
    return clip;
  };
  const clips = project.clips.map(displayClip);
  let trackTop = 0;
  const trackLayouts = project.tracks.map((track) => {
    const live = layoutTrackClips(clips.filter((c) => c.trackId === track.id));
    const frozen =
      gesture && gesture.kind !== "marquee"
        ? frozenLayoutsRef.current?.find((layout) => layout.id === track.id)
        : undefined;
    const layout = frozen
      ? {
          ...live,
          height: frozen.height,
          count: frozen.count,
          lanes: frozen.lanes,
        }
      : live;
    const result = { ...layout, id: track.id, top: trackTop };
    trackTop += layout.height;
    return result;
  });
  const tracksHeight = trackTop;
  const actionTrack = project.tracks.find(
    (track) => track.id === trackActions?.id,
  );
  const actionIndex = project.tracks.findIndex(
    (track) => track.id === actionTrack?.id,
  );
  const deletionTrack = project.tracks.find(
    (track) => track.id === deleteTrackId,
  );
  const deletionCount = project.clips.filter(
    (clip) => clip.trackId === deleteTrackId,
  ).length;
  const beginRename = (track: Track) => {
    if (track.locked) return;
    setTrackActions(null);
    renameDraftRef.current = track.name;
    renameCancelledRef.current = false;
    setRenamingId(track.id);
  };
  const finishRename = () => {
    const track = project.tracks.find((track) => track.id === renamingId);
    const name = renameDraftRef.current.trim();
    if (!renameCancelledRef.current && track && !track.locked && name)
      props.onTrackUpdate(track.id, { name });
    setRenamingId(null);
  };
  const requestTrackDelete = (track: Track) => {
    if (track.locked || !props.onTrackDelete) return;
    setTrackActions(null);
    if (project.clips.some((clip) => clip.trackId === track.id))
      setDeleteTrackId(track.id);
    else props.onTrackDelete(track.id);
  };
  useEffect(() => {
    renameCancelledRef.current = true;
    setRenamingId(null);
    setTrackActions(null);
    setDeleteTrackId(null);
    setTrackMenu(false);
    pointerCleanupRef.current?.();
    gestureRef.current = null;
    frozenLayoutsRef.current = null;
    setGesture(null);
    setSnapLine(null);
  }, [project.id]);
  useEffect(() => {
    if (!trackActions) return;
    actionsMenuRef.current
      ?.querySelector<HTMLButtonElement>("button:not([disabled])")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".tl-track-action-menu,.tl-track-more")
      )
        setTrackActions(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTrackActions(null);
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", key);
    };
  }, [trackActions]);
  useEffect(() => {
    if (!deleteTrackId) return;
    const key = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Tab") {
        const buttons = Array.from(
          confirmRef.current?.querySelectorAll<HTMLButtonElement>(
            "button:not([disabled])",
          ) ?? [],
        );
        const current = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (
          (event.shiftKey && current <= 0) ||
          (!event.shiftKey && current === buttons.length - 1)
        ) {
          event.preventDefault();
          buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDeleteTrackId(null);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [deleteTrackId]);
  useEffect(() => () => pointerCleanupRef.current?.(), []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportWidth(el.clientWidth));
    observer.observe(el);
    setViewportWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  const listenForGesture = (
    move: (event: PointerEvent) => void,
    finish: () => void,
  ) => {
    pointerCleanupRef.current?.();
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      pointerCleanupRef.current = null;
    };
    const end = () => {
      cleanup();
      finish();
    };
    const cancel = () => {
      cleanup();
      setActiveGesture(null);
      setSnapLine(null);
    };
    pointerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  };
  const locate = (clientX: number, clientY: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, clientX - rect.left + el.scrollLeft - GUTTER),
      y: clientY - rect.top + el.scrollTop - RULER,
    };
  };
  const targetTrack = (clientY: number) => {
    const y = locate(0, clientY).y;
    const index = trackLayouts.findIndex(
      (layout) => y < layout.top + layout.height,
    );
    return project.tracks[index < 0 ? project.tracks.length - 1 : index];
  };
  const snap = (time: number, excluded: string[], offset = 0) => {
    const candidates = [
      0,
      playhead,
      ...project.clips
        .filter((c) => !excluded.includes(c.id))
        .flatMap((c) => [c.start, c.start + c.duration]),
    ];
    const value = snapping
      ? snapTimelineTime(time + offset, candidates, 8 / pps) - offset
      : time;
    setSnapLine(Math.abs(value - time) > 0.0001 ? value + offset : null);
    return value;
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const syncScroll = () => setScrollLeft(el.scrollLeft);
    el.addEventListener("scroll", syncScroll, { passive: true });
    const wheel = (event: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {        // Pinch / ctrl-wheel zooms around the cursor so the frame under the
        // pointer stays under the pointer at every scale.
        event.preventDefault();
        const nextPps = wheelZoomPps(pps, event.deltaY);
        if (Math.abs(nextPps - pps) < 1e-9) return;
        const cursorX = event.clientX - rect.left;
        const target = zoomedScrollLeft({
          pps,
          nextPps,
          scrollLeft: el.scrollLeft,
          cursorX,
          gutter: GUTTER,
        });
        props.onZoom(nextPps);
        requestAnimationFrame(() => {
          if (!scrollRef.current) return;
          scrollRef.current.scrollLeft = clampScrollLeft(
            target,
            scrollRef.current.scrollWidth,
            scrollRef.current.clientWidth,
          );
          setScrollLeft(scrollRef.current.scrollLeft);
        });
        return;
      }
      if (event.shiftKey) {
        // Shift-wheel and horizontal trackpad gestures pan freely, without
        // changing the scale.
        const delta = event.deltaY || event.deltaX;
        if (!delta) return;
        event.preventDefault();
        el.scrollLeft = panScrollLeft(
          el.scrollLeft,
          delta,
          el.scrollWidth,
          el.clientWidth,
        );
        setScrollLeft(el.scrollLeft);
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("scroll", syncScroll);
      el.removeEventListener("wheel", wheel);
    };
  }, [pps, props.onZoom]);
  useEffect(() => {
    if (!props.playing || gestureRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = playhead * pps;
    if (x > el.scrollLeft + el.clientWidth - GUTTER - 32)
      el.scrollLeft = Math.max(0, x - (el.clientWidth - GUTTER) * 0.3);
    else if (x < el.scrollLeft) el.scrollLeft = x;
  }, [playhead, pps, props.playing]);

  /** Glide after a pan release, using the measured pointer velocity. */
  const glideRef = useRef<{ frame: number; velocity: number; last: number } | null>(null);
  const stopGlide = () => {
    if (glideRef.current) cancelAnimationFrame(glideRef.current.frame);
    glideRef.current = null;
  };
  useEffect(() => stopGlide, []);
  const glide = (velocity: number) => {
    stopGlide();
    const el = scrollRef.current;
    if (!el || Math.abs(velocity) < 80) return;
    const step = (now: number) => {
      const el2 = scrollRef.current;
      const state = glideRef.current;
      if (!el2 || !state) return;
      const deltaMs = Math.max(1, Math.min(100, now - state.last));
      state.last = now;
      const next = inertiaStep(state.velocity, deltaMs);
      const before = el2.scrollLeft;
      el2.scrollLeft = clampScrollLeft(
        before + next.offset,
        el2.scrollWidth,
        el2.clientWidth,
      );
      setScrollLeft(el2.scrollLeft);
      state.velocity = next.velocity;
      const atEdge = el2.scrollLeft === before && Math.abs(next.offset) > 0.5;
      if (next.done || atEdge) {
        glideRef.current = null;
        return;
      }
      state.frame = requestAnimationFrame(step);
    };
    glideRef.current = { frame: 0, velocity, last: performance.now() };
    glideRef.current.frame = requestAnimationFrame(step);
  };

  /** Middle-button drag (and Alt+drag over empty space) pans freely. */
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const middle = event.button === 1;
    const altLeft = event.button === 0 && event.altKey;
    if (!middle && !altLeft) return;
    if (
      altLeft &&
      (event.target as HTMLElement).closest(
        ".tl-clip, .tl-ruler-body, .tl-lane, .tl-track-header",
      )
    )
      return;
    const el = scrollRef.current;
    if (!el) return;
    event.preventDefault();
    stopGlide();
    const startX = event.clientX,
      startY = event.clientY,
      originLeft = el.scrollLeft,
      originTop = el.scrollTop;
    let previous = { x: event.clientX, time: performance.now() };
    let velocity = 0;
    setPanning(true);
    listenForGesture(
      (move) => {
        velocity = pointerVelocity(previous, {
          x: move.clientX,
          time: performance.now(),
        });
        previous = { x: move.clientX, time: performance.now() };
        el.scrollLeft = clampScrollLeft(
          originLeft - (move.clientX - startX),
          el.scrollWidth,
          el.clientWidth,
        );
        el.scrollTop = Math.max(0, originTop - (move.clientY - startY));
        setScrollLeft(el.scrollLeft);
      },
      () => {
        setPanning(false);
        // Only horizontal motion glides; vertical stays where it was dropped.
        glide(-velocity);
      },
    );
  };

  const startClip = (
    event: ReactPointerEvent,
    clip: Clip,
    trim?: "start" | "end",
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const track = project.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return;
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const ids = selectedIds.includes(clip.id)
      ? additive && !trim
        ? selectedIds.filter((id) => id !== clip.id)
        : selectedIds
      : additive
        ? [...selectedIds, clip.id]
        : [clip.id];
    onSelect(ids);
    if (additive && !ids.includes(clip.id)) return;
    const startX = event.clientX,
      startY = event.clientY;
    const movable = ids.filter(
      (id) =>
        !project.tracks.find(
          (t) => t.id === project.clips.find((c) => c.id === id)?.trackId,
        )?.locked,
    );
    const earliest = Math.min(
      ...project.clips
        .filter((c) => movable.includes(c.id))
        .map((c) => c.start),
    );
    const el = scrollRef.current!;
    const startScroll = el.scrollLeft;
    const move = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (e.clientX > rect.right - 28) el.scrollLeft += 12;
      if (e.clientX < rect.left + GUTTER + 20) el.scrollLeft -= 12;
      const delta = (e.clientX - startX + el.scrollLeft - startScroll) / pps;
      if (
        !gestureRef.current &&
        Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 3
      )
        return;
      if (trim) {
        let time = snap(
          (trim === "start" ? clip.start : clip.start + clip.duration) + delta,
          [clip.id],
        );
        time =
          trim === "start"
            ? Math.max(
                0,
                Math.min(clip.start + clip.duration - 1 / project.fps, time),
              )
            : Math.max(clip.start + 1 / project.fps, time);
        const asset = project.assets.find((a) => a.id === clip.assetId);
        if (asset && asset.kind !== "image") {
          if (trim === "start")
            time = Math.max(clip.start - clip.sourceIn / clip.speed, time);
          else
            time = Math.min(
              clip.start + (asset.duration - clip.sourceIn) / clip.speed,
              time,
            );
        }
        setActiveGesture({
          kind: "trim",
          id: clip.id,
          edge: trim,
          time: snapToFrame(time, project.fps),
        });
      } else {
        let adjusted = Math.max(-earliest, delta);
        const startSnap = snap(clip.start + adjusted, movable);
        if (Math.abs(startSnap - clip.start - adjusted) > 0.0001)
          adjusted = startSnap - clip.start;
        else {
          const endSnap = snap(clip.start + adjusted, movable, clip.duration);
          adjusted = endSnap - clip.start;
        }
        adjusted = Math.max(-earliest, adjusted);
        const candidate = targetTrack(e.clientY);
        const compatible =
          candidate && canMoveToTrack(clip, candidate, project);
        setActiveGesture({
          kind: "move",
          ids: movable,
          delta: snapToFrame(adjusted, project.fps),
          primaryId: clip.id,
          trackId: clip.trackId,
          targetTrackId: compatible ? candidate.id : clip.trackId,
        });
      }
    };
    const finish = () => {
      const g = gestureRef.current;
      if (
        g?.kind === "move" &&
        (Math.abs(g.delta) > 0.001 || g.targetTrackId !== g.trackId)
      )
        props.onMoveClips(
          g.ids,
          g.delta,
          g.targetTrackId !== g.trackId ? g.targetTrackId : undefined,
        );
      if (g?.kind === "trim") props.onTrim(g.id, g.edge, g.time);
      setActiveGesture(null);
      setSnapLine(null);
    };
    listenForGesture(move, finish);
  };
  const scrub = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSeek(Math.max(0, locate(event.clientX, event.clientY).x / pps));
    const move = (e: PointerEvent) =>
      onSeek(Math.max(0, locate(e.clientX, e.clientY).x / pps));
    const finish = () => {};
    listenForGesture(move, finish);
  };
  /**
   * Dragging on the ruler stretches or compresses the time scale, the way
   * desktop editors do it: pass right to zoom in, left to zoom out. A plain
   * click still seeks, so the ruler keeps its original scrubbing behaviour.
   */
  const startRulerDrag = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const scroller = scrollRef.current;
    if (!scroller) return scrub(event);
    const rect = scroller.getBoundingClientRect();
    const startX = event.clientX;
    const startPps = pps;
    const startScroll = scroller.scrollLeft;
    const cursorX = startX - rect.left;
    let moved = false;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < 4) return;
      moved = true;
      const nextPps = clampPps(startPps * Math.max(0.05, 1 + dx / 240));
      if (Math.abs(nextPps - startPps) < 1e-9) return;
      props.onZoom(nextPps);
      const target = zoomedScrollLeft({
        pps: startPps,
        nextPps,
        scrollLeft: startScroll,
        cursorX,
        gutter: GUTTER,
      });
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollLeft = clampScrollLeft(
          target,
          el.scrollWidth,
          el.clientWidth,
        );
        setScrollLeft(el.scrollLeft);
      });
    };
    const finish = () => {
      if (moved) return;
      onSeek(Math.max(0, (cursorX + startScroll - GUTTER) / startPps));
    };
    listenForGesture(move, finish);
  };
  const startSelection = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const start = locate(event.clientX, event.clientY);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const previous = additive ? selectedIds : [];
    let moved = false;
    const move = (e: PointerEvent) => {
      const current = locate(e.clientX, e.clientY);
      if (Math.abs(current.x - start.x) + Math.abs(current.y - start.y) < 5)
        return;
      moved = true;
      const x = Math.min(start.x, current.x),
        y = Math.min(start.y, current.y),
        width = Math.abs(start.x - current.x),
        height = Math.abs(start.y - current.y);
      setActiveGesture({ kind: "marquee", x, y, width, height });
      const found = project.clips
        .filter((c) => {
          const row = project.tracks.findIndex((t) => t.id === c.trackId);
          return (
            !project.tracks[row]?.locked &&
            c.start * pps < x + width &&
            (c.start + c.duration) * pps > x &&
            trackLayouts[row] &&
            trackLayouts[row].top +
              8 +
              (trackLayouts[row].lanes.get(c.id) ?? 0) * 62 +
              54 >
              y &&
            trackLayouts[row].top +
              8 +
              (trackLayouts[row].lanes.get(c.id) ?? 0) * 62 <
              y + height
          );
        })
        .map((c) => c.id);
      onSelect([...new Set([...previous, ...found])]);
    };
    const finish = () => {
      if (!moved) {
        onSeek(start.x / pps);
        if (!additive) onSelect([]);
      }
      setActiveGesture(null);
    };
    listenForGesture(move, finish);
  };
  const selectedUnlocked = selectedIds.some((id) => {
    const c = project.clips.find((c) => c.id === id);
    return c && !project.tracks.find((t) => t.id === c.trackId)?.locked;
  });
  const onDrop = (event: React.DragEvent, track: Track) => {
    event.preventDefault();
    setDropTarget(null);
    const time = snapToFrame(
      Math.max(0, locate(event.clientX, event.clientY).x / pps),
      project.fps,
    );
    const preset = readPresetDrag(event.dataTransfer);
    if (preset) {
      if (!track.locked) props.onDropPreset?.(preset, { time, trackId: track.id });
      return;
    }
    const builtin = event.dataTransfer.getData(BUILTIN_DRAG_TYPE);
    if (builtin) {
      if (!track.locked) props.onDropBuiltin?.(builtin, time, track.id);
      return;
    }
    const batch = event.dataTransfer.getData(ASSET_IDS_DRAG_TYPE);
    if (batch) {
      try {
        const ids = JSON.parse(batch) as unknown;
        if (Array.isArray(ids) && ids.length) {
          const usable = ids.filter((entry): entry is string => {
            if (typeof entry !== "string") return false;
            const candidate = project.assets.find((a) => a.id === entry);
            return (
              !!candidate &&
              !candidate.missing &&
              (candidate.kind === track.kind ||
                (candidate.kind === "image" && track.kind === "video"))
            );
          });
          if (usable.length && !track.locked)
            props.onDropAssets?.(usable, time, track.id);
          return;
        }
      } catch {
        /* fall through to the single asset path */
      }
    }
    const id =
      event.dataTransfer.getData(ASSET_DRAG_TYPE) ||
      event.dataTransfer.getData("assetid");
    const asset = project.assets.find((a) => a.id === id);
    if (
      asset &&
      !asset.missing &&
      !track.locked &&
      (asset.kind === track.kind ||
        (asset.kind === "image" && track.kind === "video"))
    )
      props.onDropAsset?.(id, time, track.id);
  };

  return (
    <section
      className="tl"
      aria-label="Çok kanallı zaman çizelgesi"
      style={
        {
          "--tl-row": `${ROW}px`,
          "--tl-gutter": `${GUTTER}px`,
        } as CSSProperties
      }
    >
      <div className="tl-toolbar">
        <div className="tl-toolbar-group">
          <button
            title="Geri al · ⌘Z"
            aria-label="Geri al"
            onClick={props.onUndo}
            disabled={!props.canUndo}
          >
            <Undo2 size={17} />
          </button>
          <button
            title="Yinele · ⇧⌘Z"
            aria-label="Yinele"
            onClick={props.onRedo}
            disabled={!props.canRedo}
          >
            <Redo2 size={17} />
          </button>
          <span className="tl-divider" />
          <span
            className="tl-tool-indicator"
            title="Seçim aracı · boş alanı sürükleyerek çerçeveyle seçin"
            aria-label="Seçim aracı"
          >
            <MousePointer2 size={16} />
          </span>
          <button
            title="Oynatma konumunda böl · ⌘B"
            aria-label="Klibi böl"
            onClick={props.onSplit}
            disabled={
              !project.clips.some(
                (c) =>
                  !project.tracks.find((t) => t.id === c.trackId)?.locked &&
                  (!selectedIds.length || selectedIds.includes(c.id)) &&
                  c.start < playhead &&
                  c.start + c.duration > playhead,
              )
            }
          >
            <Scissors size={17} />
          </button>
          <button
            title="Seçili klibi kopyala"
            aria-label="Seçili klibi kopyala"
            onClick={props.onDuplicate}
            disabled={!selectedUnlocked || !props.onDuplicate}
          >
            <Copy size={16} />
          </button>
          <button
            title="Seçili klibi sil · Backspace"
            aria-label="Seçili klibi sil"
            onClick={props.onDelete}
            disabled={!selectedUnlocked}
          >
            <Trash2 size={16} />
          </button>
          <span className="tl-divider" />
          <button
            className={magnetic ? "is-active" : ""}
            title={
              magnetic
                ? "Mıknatıslı silmeyi kapat (sildikten sonra boşlukları kapatır)"
                : "Mıknatıslı silmeyi aç (sildikten sonra boşlukları kapatır)"
            }
            aria-label="Mıknatıslı silme"
            aria-pressed={magnetic}
            onClick={() => {
              setLocalMagnetic(!magnetic);
              props.onMagneticChange?.(!magnetic);
            }}
          >
            <Magnet size={17} />
          </button>
          <button
            className={snapping ? "is-active" : ""}
            title={snapping ? "Zaman çizelgesi yapışmasını kapat" : "Zaman çizelgesi yapışmasını aç"}
            aria-label="Zaman çizelgesi yapışması"
            aria-pressed={snapping}
            onClick={() => {
              setLocalSnap(!snapping);
              props.onSnappingChange?.(!snapping);
            }}
          >
            <span className="tl-snap-icon">][</span>
          </button>
        </div>
        <div className="tl-toolbar-end">
          <span className="tl-duration">
            {formatTimelineTime(playhead, project.fps)} <i>/</i>{" "}
            {formatTimelineTime(
              Math.max(0, ...project.clips.map((c) => c.start + c.duration)),
              project.fps,
            )}
          </span>
          <span className="tl-viewport" title="Görünür zaman aralığı">
            {formatTimelineTime(view.span, project.fps)} görünür
          </span>
          <button
            title="Zaman çizelgesini uzaklaştır"
            aria-label="Zaman çizelgesini uzaklaştır"
            onClick={() => props.onZoom(clampPps(pps / 1.25))}
            disabled={pps <= MIN_PPS + 1e-9}
          >
            <ZoomOut size={16} />
          </button>
          <input
            aria-label="Zaman çizelgesi ölçeği"
            type="range"
            min={MIN_PPS}
            max={MAX_PPS}
            step="1"
            value={Math.round(pps)}
            onChange={(e) => props.onZoom(clampPps(Number(e.target.value)))}
          />
          <button
            title="Zaman çizelgesini yakınlaştır"
            aria-label="Zaman çizelgesini yakınlaştır"
            onClick={() => props.onZoom(clampPps(pps * 1.25))}
            disabled={pps >= MAX_PPS - 1e-9}
          >
            <ZoomIn size={16} />
          </button>
          <button
            className="tl-fit"
            title="Tüm projeye sığdır"
            onClick={() => {
              const el = scrollRef.current;
              const end = Math.max(
                10,
                ...project.clips.map((c) => c.start + c.duration),
              );
              props.onZoom(
                fitTimelinePps(el?.clientWidth ?? 900, GUTTER, end),
              );
              if (el) {
                el.scrollLeft = 0;
                setScrollLeft(0);
              }
            }}
          >
            Sığdır
          </button>
          <button
            className={`tl-fit ${minimapOpen ? "active" : ""}`}
            title="Küçük haritayı aç/kapat"
            aria-label="Küçük haritayı aç veya kapat"
            aria-pressed={minimapOpen}
            onClick={() => setMinimapOpen(!minimapOpen)}
          >
            Harita
          </button>
          <button
            className="tl-fit"
            title="Oynatma konumuna git"
            aria-label="Oynatma konumuna git"
            onClick={() => {
              const el = scrollRef.current;
              if (!el) return;
              const next = clampScrollLeft(
                playhead * pps - (el.clientWidth - GUTTER) / 2,
                el.scrollWidth,
                el.clientWidth,
              );
              el.scrollLeft = next;
              setScrollLeft(next);
            }}
          >
            Oynatma konumu
          </button>
        </div>
      </div>
      {minimap && (
        <div
          className="tl-minimap"
          role="img"
          aria-label="Zaman çizelgesi küçük haritası"
          title="Haritaya tıklayarak zaman çizelgesinde gezinin"
          onPointerDown={(event) => {
            const el = scrollRef.current;
            if (!el) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
            const next = minimapScrollLeft(
              ratio,
              duration,
              pps,
              el.clientWidth,
              GUTTER,
            );
            stopGlide();
            el.scrollLeft = clampScrollLeft(next, el.scrollWidth, el.clientWidth);
            setScrollLeft(el.scrollLeft);
          }}
        >
          {minimap.bars.map((bar, index) => (
            <span
              key={index}
              className="tl-minimap-bar"
              style={{
                left: `${bar.start * 100}%`,
                width: `${bar.width * 100}%`,
                top: `${2 + (bar.track % 3) * 5}px`,
              }}
            />
          ))}
          <span
            className="tl-minimap-window"
            style={{ left: `${minimap.left * 100}%`, width: `${minimap.width * 100}%` }}
          />
          <span
            className="tl-minimap-playhead"
            style={{ left: `${minimap.playhead * 100}%` }}
          />
        </div>
      )}
      <div
        className={`tl-scroll ${panning ? "is-panning" : ""}`}
        ref={scrollRef}
        onPointerDown={startPan}
        onAuxClick={(event) => event.preventDefault()}
      >
        <div
          className="tl-content"
          style={{
            width: bodyWidth + GUTTER,
            minWidth: "100%",
            minHeight: "100%",
          }}
        >
          <div className="tl-ruler" style={{ height: RULER }}>
            <div className="tl-ruler-label">
              Zaman çizelgesi <span>{project.fps} FPS</span>
            </div>
            <div
              className="tl-ruler-body"
              onPointerDown={startRulerDrag}
              title="Sürükleyerek zaman ölçeğini genişletin veya daraltın · tıklayarak konumlanın"
              style={{ width: bodyWidth }}
            >
              {ticks.map((t) => (
                <div className="tl-tick" key={t} style={{ left: t * pps }}>
                  <span>{formatRulerTime(t, interval < 1)}</span>
                  <i />
                </div>
              ))}
              <div
                className="tl-ruler-playhead"
                style={{ left: playhead * pps }}
              >
                <div
                  className="tl-playhead-handle"
                  role="slider"
                  tabIndex={0}
                  aria-label="Oynatma konumu"
                  aria-valuenow={playhead}
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuetext={formatTimelineTime(playhead, project.fps)}
                  onPointerDown={scrub}
                  onKeyDown={(event) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      onSeek(
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? Math.max(
                                0,
                                ...project.clips.map(
                                  (c) => c.start + c.duration,
                                ),
                              )
                            : Math.max(
                                0,
                                playhead +
                                  (event.key === "ArrowLeft" ? -1 : 1) *
                                    (event.shiftKey ? 1 : 1 / project.fps),
                              ),
                      );
                    }
                  }}
                />
              </div>
            </div>
          </div>
          {project.tracks.map((track, index) => (
            <div
              className={`tl-track tl-track-${track.kind} ${track.locked ? "is-locked" : ""} ${dropTarget?.trackId === track.id ? "is-drop-target" : ""}`}
              key={track.id}
              data-track-id={track.id}
              style={{ height: trackLayouts[index].height }}
            >
              <div className="tl-track-header">
                <div className="tl-track-title">
                  <TrackIcon kind={track.kind} />
                  {renamingId === track.id ? (
                    <input
                      className="tl-track-name-input"
                      aria-label="Kanal adı"
                      autoFocus
                      defaultValue={track.name}
                      maxLength={256}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => {
                        renameDraftRef.current = event.target.value;
                      }}
                      onBlur={finishRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.stopPropagation();
                          finishRename();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          renameCancelledRef.current = true;
                          setRenamingId(null);
                        }
                      }}
                    />
                  ) : (
                    <span
                      title={`${track.name}${track.locked ? "" : " · yeniden adlandırmak için çift tıklayın"}`}
                      onDoubleClick={() => beginRename(track)}
                    >
                      {track.name}
                    </span>
                  )}
                  <span className="tl-track-number">
                    {trackLayouts[index].count > 1
                      ? `${trackLayouts[index].count} katman`
                      : index + 1}
                  </span>
                </div>
                <div className="tl-track-controls">
                  <button
                    title={track.locked ? "Kanalın kilidini aç" : "Kanalı kilitle"}
                    aria-label={
                      track.locked
                        ? `${track.name} kanalının kilidini aç`
                        : `${track.name} kanalını kilitle`
                    }
                    className={track.locked ? "is-active" : ""}
                    onClick={() =>
                      props.onTrackUpdate(track.id, { locked: !track.locked })
                    }
                  >
                    {track.locked ? (
                      <LockKeyhole size={13} />
                    ) : (
                      <UnlockKeyhole size={13} />
                    )}
                  </button>
                  <button
                    title={track.hidden ? "Kanalı göster" : "Kanalı gizle"}
                    aria-label={
                      track.hidden
                        ? `${track.name} kanalını göster`
                        : `${track.name} kanalını gizle`
                    }
                    className={track.hidden ? "is-active" : ""}
                    onClick={() =>
                      props.onTrackUpdate(track.id, { hidden: !track.hidden })
                    }
                  >
                    {track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  {track.kind !== "text" && (
                    <button
                      title={track.muted ? "Sesi aç" : "Kanalı sessize al"}
                      aria-label={
                        track.muted
                          ? `${track.name} kanalının sesini aç`
                          : `${track.name} kanalını sessize al`
                      }
                      className={track.muted ? "is-active" : ""}
                      onClick={() =>
                        props.onTrackUpdate(track.id, { muted: !track.muted })
                      }
                    >
                      {track.muted ? (
                        <VolumeX size={13} />
                      ) : (
                        <Volume2 size={13} />
                      )}
                    </button>
                  )}
                  <button
                    className="tl-track-more"
                    title="Kanal işlemleri"
                    aria-label={`${track.name} kanal işlemleri`}
                    aria-expanded={trackActions?.id === track.id}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setTrackActions(
                        trackActions?.id === track.id
                          ? null
                          : {
                              id: track.id,
                              x: Math.min(
                                window.innerWidth - 180,
                                Math.max(8, rect.left),
                              ),
                              y: Math.min(
                                window.innerHeight - 180,
                                Math.max(8, rect.bottom + 4),
                              ),
                            },
                      );
                    }}
                  >
                    <MoreHorizontal size={13} />
                  </button>
                </div>
              </div>
              <div
                className="tl-lane"
                style={{
                  width: bodyWidth,
                  backgroundSize: `${interval * pps}px 100%`,
                }}
                onPointerDown={startSelection}
                onDragOver={(event) => {
                  const id =
                    event.dataTransfer.types.includes(ASSET_DRAG_TYPE) ||
                    event.dataTransfer.types.includes("assetid");
                  const sourceKind = (
                    ["audio", "video", "image"] as const
                  ).find((kind) =>
                    event.dataTransfer.types.includes(
                      `application/x-cevikedit-kind-${kind}`,
                    ),
                  );
                  if (
                    track.locked ||
                    !id ||
                    (sourceKind &&
                      !(
                        sourceKind === track.kind ||
                        (sourceKind === "image" && track.kind === "video")
                      ))
                  )
                    return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  setDropTarget({
                    trackId: track.id,
                    time: Math.max(
                      0,
                      locate(event.clientX, event.clientY).x / pps,
                    ),
                  });
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    setDropTarget(null);
                }}
                onDrop={(event) => onDrop(event, track)}
              >
                {(() => {
                  const trackClips = clips.filter((c) => c.trackId === track.id);
                  // Small projects keep every clip in the DOM (selection, tests,
                  // accessibility). Very large ones only draw what is on screen.
                  const draw =
                    clips.length > 240
                      ? visibleClips(
                          trackClips,
                          { start: view.start, end: view.end },
                          Math.max(1, view.span * 0.25),
                        )
                      : trackClips;
                  return draw;
                })().map((clip) => {
                    const original = project.clips.find(
                      (c) => c.id === clip.id,
                    )!;
                    const asset = project.assets.find(
                      (a) => a.id === clip.assetId,
                    );
                    const selected = selectedIds.includes(clip.id);
                    const dragging =
                      gesture?.kind === "move" && gesture.ids.includes(clip.id);
                    return (
                      <div
                        key={clip.id}
                        data-clip-id={clip.id}
                        className={`tl-clip tl-clip-${track.kind} ${selected ? "is-selected" : ""} ${dragging ? "is-dragging" : ""} ${track.hidden ? "is-hidden" : ""} ${asset?.missing ? "is-missing" : ""}`}
                        onDragOver={(event) => {
                          // Presets (transition, effect, motion, text) land on the clip
                          // under the pointer, not only on the empty lane.
                          if (!event.dataTransfer.types.includes(PRESET_DRAG_TYPE))
                            return;
                          event.preventDefault();
                          event.stopPropagation();
                          event.dataTransfer.dropEffect = "copy";
                          event.currentTarget.classList.add("is-preset-target");
                        }}
                        onDragLeave={(event) => {
                          event.currentTarget.classList.remove("is-preset-target");
                        }}
                        onDrop={(event) => {
                          const preset = readPresetDrag(event.dataTransfer);
                          if (!preset) return;
                          event.preventDefault();
                          event.stopPropagation();
                          event.currentTarget.classList.remove("is-preset-target");
                          if (track.locked) return;
                          props.onDropPreset?.(preset, {
                            clipId: clip.id,
                            time: clip.start,
                            trackId: track.id,
                          });                        }}
                        style={{
                          left: clip.start * pps,
                          width: Math.max(4, clip.duration * pps),
                          top:
                            8 +
                            (trackLayouts[index].lanes.get(clip.id) ?? 0) * 62,
                        }}
                        onPointerDown={(event) => startClip(event, original)}
                        onDoubleClick={() => onSeek(clip.start)}
                        title={`${clip.name}\n${formatTimelineTime(clip.start, project.fps)} · ${clip.duration.toFixed(2)} sn${track.locked ? "\nKanal kilitli" : ""}`}
                        tabIndex={0}
                        role="button"
                        aria-label={`${clip.name}, ${clip.duration.toFixed(1)} sn`}
                        aria-pressed={selected}
                        aria-disabled={track.locked}
                        aria-keyshortcuts="Enter Alt+ArrowLeft Alt+ArrowRight"
                        onKeyDown={(event) => {
                          if (
                            event.target !== event.currentTarget ||
                            track.locked
                          )
                            return;
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.stopPropagation();
                            onSelect(
                              event.shiftKey || event.metaKey || event.ctrlKey
                                ? [...new Set([...selectedIds, clip.id])]
                                : [clip.id],
                            );
                          }
                          if (
                            event.altKey &&
                            ["ArrowLeft", "ArrowRight"].includes(event.key)
                          ) {
                            event.preventDefault();
                            event.stopPropagation();
                            const ids = selected ? selectedIds : [clip.id];
                            onSelect(ids);
                            props.onMoveClips(
                              ids,
                              ((event.key === "ArrowLeft" ? -1 : 1) *
                                (event.shiftKey ? 10 : 1)) /
                                project.fps,
                            );
                          }
                        }}
                      >
                        {asset?.thumbnail && track.kind !== "audio" && (
                          <div
                            className="tl-filmstrip"
                            style={{
                              backgroundImage: `url("${asset.thumbnail.replace(/"/g, "%22")}")`,
                            }}
                          />
                        )}
                        <div className="tl-clip-title">
                          {track.kind === "audio" ? (
                            <AudioLines size={12} />
                          ) : track.kind === "text" ? (
                            <Type size={12} />
                          ) : (
                            <Film size={12} />
                          )}
                          <span>{clip.name}</span>
                          {clip.speed !== 1 && <b>{clip.speed}×</b>}
                          {(clip.muted || track.muted) && <VolumeX size={12} />}
                        </div>
                        {track.kind === "text" && (
                          <div className="tl-text-preview">
                            {clip.text?.text ?? clip.name}
                          </div>
                        )}
                        {asset?.waveform &&
                          (track.kind === "audio" ||
                            (asset.hasAudio && clip.duration * pps > 80)) && (
                            <Waveform
                              clip={clip}
                              asset={asset}
                              width={clip.duration * pps}
                            />
                          )}
                        {clip.fadeIn > 0 && (
                          <div
                            className="tl-fade-in"
                            style={{
                              width: Math.min(
                                (clip.duration * pps) / 2,
                                clip.fadeIn * pps,
                              ),
                            }}
                          />
                        )}
                        {clip.fadeOut > 0 && (
                          <div
                            className="tl-fade-out"
                            style={{
                              width: Math.min(
                                (clip.duration * pps) / 2,
                                clip.fadeOut * pps,
                              ),
                            }}
                          />
                        )}
                        {!track.locked && (
                          <>
                            <div
                              className="tl-trim tl-trim-start"
                              title="Giriş noktasını kırpmak için sürükleyin · ok tuşlarıyla kare kare ayarlayın"
                              role="slider"
                              tabIndex={selected ? 0 : -1}
                              aria-label={`${clip.name} Giriş noktası`}
                              aria-valuenow={clip.start}
                              aria-valuetext={formatTimelineTime(
                                clip.start,
                                project.fps,
                              )}
                              aria-valuemin={0}
                              aria-valuemax={
                                clip.start + clip.duration - 1 / project.fps
                              }
                              onKeyDown={(event) => {
                                if (
                                  ["ArrowLeft", "ArrowRight"].includes(
                                    event.key,
                                  )
                                ) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  props.onTrim(
                                    clip.id,
                                    "start",
                                    clip.start +
                                      (event.key === "ArrowLeft" ? -1 : 1) *
                                        (event.shiftKey ? 1 : 1 / project.fps),
                                  );
                                }
                              }}
                              onPointerDown={(event) =>
                                startClip(event, original, "start")
                              }
                            />
                            <div
                              className="tl-trim tl-trim-end"
                              title="Çıkış noktasını kırpmak için sürükleyin · ok tuşlarıyla kare kare ayarlayın"
                              role="slider"
                              tabIndex={selected ? 0 : -1}
                              aria-label={`${clip.name} Çıkış noktası`}
                              aria-valuenow={clip.start + clip.duration}
                              aria-valuetext={formatTimelineTime(
                                clip.start + clip.duration,
                                project.fps,
                              )}
                              aria-valuemin={clip.start + 1 / project.fps}
                              onKeyDown={(event) => {
                                if (
                                  ["ArrowLeft", "ArrowRight"].includes(
                                    event.key,
                                  )
                                ) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  props.onTrim(
                                    clip.id,
                                    "end",
                                    clip.start +
                                      clip.duration +
                                      (event.key === "ArrowLeft" ? -1 : 1) *
                                        (event.shiftKey ? 1 : 1 / project.fps),
                                  );
                                }
                              }}
                              onPointerDown={(event) =>
                                startClip(event, original, "end")
                              }
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                {dropTarget?.trackId === track.id && (
                  <div
                    className="tl-drop-marker"
                    style={{ left: dropTarget.time * pps }}
                  >
                    <Plus size={12} /> Medya ekle
                  </div>
                )}
                {track.locked && (
                  <span className="tl-lock-overlay">
                    <LockKeyhole size={12} /> Kanal kilitli
                  </span>
                )}
              </div>
            </div>
          ))}
          <div className="tl-track-add">
            <div className="tl-track-add-menu">
              <button
                onClick={() => setTrackMenu(!trackMenu)}
                aria-expanded={trackMenu}
              >
                <Plus size={13} /> Kanal ekle <ChevronDown size={11} />
              </button>
              {trackMenu && (
                <div className="tl-popup">
                  {(["video", "audio", "text"] as TrackKind[]).map((kind) => (
                    <button
                      key={kind}
                      onClick={() => {
                        props.onAddTrack(kind);
                        setTrackMenu(false);
                      }}
                    >
                      <TrackIcon kind={kind} />
                      {kind === "video"
                        ? "Video kanalı"
                        : kind === "audio"
                          ? "Ses kanalı"
                          : "Metin kanalı"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {project.clips.length === 0 && (
              <span className="tl-empty-hint">
                <Film size={16} /> Düzenlemeye başlamak için kitaplıktan video, görsel veya ses sürükleyin
              </span>
            )}
          </div>
          <div
            className="tl-playhead"
            style={{
              left: GUTTER + playhead * pps,
              top: RULER,
              height: Math.max(tracksHeight, ROW),
            }}
          >
            <i />
          </div>
          {snapLine !== null && (
            <div
              className="tl-snap-line"
              style={{
                left: GUTTER + snapLine * pps,
                top: RULER,
                height: tracksHeight,
              }}
            />
          )}
          {gesture?.kind === "marquee" && (
            <div
              className="tl-marquee"
              style={{
                left: GUTTER + gesture.x,
                top: RULER + gesture.y,
                width: gesture.width,
                height: gesture.height,
              }}
            />
          )}
        </div>
      </div>
      {trackActions && actionTrack && (
        <div
          ref={actionsMenuRef}
          className="tl-track-action-menu"
          role="menu"
          aria-label={`${actionTrack.name} kanal işlemleri menüsü`}
          style={{ left: trackActions.x, top: trackActions.y }}
          onKeyDown={(event) => {
            if (
              ["ArrowUp", "ArrowDown", "Home", "End", "Escape"].includes(
                event.key,
              )
            ) {
              event.preventDefault();
              event.stopPropagation();
              if (event.key === "Escape") {
                document
                  .querySelector<HTMLButtonElement>(
                    `[data-track-id="${CSS.escape(actionTrack.id)}"] .tl-track-more`,
                  )
                  ?.focus();
                setTrackActions(null);
                return;
              }
              const buttons = Array.from(
                actionsMenuRef.current?.querySelectorAll<HTMLButtonElement>(
                  "button:not([disabled])",
                ) ?? [],
              );
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              buttons[
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (index +
                        (event.key === "ArrowUp" ? -1 : 1) +
                        buttons.length) %
                      buttons.length
              ]?.focus();
            }
          }}
        >
          <button
            role="menuitem"
            disabled={actionTrack.locked}
            onClick={() => beginRename(actionTrack)}
          >
            <Pencil size={12} />
            Kanalı yeniden adlandır
          </button>
          <button
            role="menuitem"
            disabled={
              actionTrack.locked ||
              actionIndex <= 0 ||
              project.tracks[actionIndex - 1]?.locked ||
              !props.onTrackMove
            }
            onClick={() => {
              props.onTrackMove?.(actionTrack.id, "up");
              setTrackActions(null);
            }}
          >
            <ArrowUp size={12} />
            Kanalı yukarı taşı
          </button>
          <button
            role="menuitem"
            disabled={
              actionTrack.locked ||
              actionIndex >= project.tracks.length - 1 ||
              project.tracks[actionIndex + 1]?.locked ||
              !props.onTrackMove
            }
            onClick={() => {
              props.onTrackMove?.(actionTrack.id, "down");
              setTrackActions(null);
            }}
          >
            <ArrowDown size={12} />
            Kanalı aşağı taşı
          </button>
          <div className="tl-menu-divider" />
          <button
            role="menuitem"
            className="is-danger"
            disabled={actionTrack.locked || !props.onTrackDelete}
            onClick={() => requestTrackDelete(actionTrack)}
          >
            <Trash2 size={12} />
            Kanalı sil
          </button>
        </div>
      )}
      {deletionTrack && (
        <div
          className="tl-confirm-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setDeleteTrackId(null);
          }}
        >
          <section
            ref={confirmRef}
            className="tl-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Kanal silme onayı"
          >
            <h3>"{deletionTrack.name}" silinsin mi?</h3>
            <p>
              Bu kanaldaki {deletionCount}{" "}
              klip de silinecek. Medya kitaplığındaki özgün medya korunur; kanal ve klipler geri alınarak kurtarılabilir.
            </p>
            <footer>
              <button autoFocus onClick={() => setDeleteTrackId(null)}>
                İptal
              </button>
              <button
                className="is-danger"
                disabled={deletionTrack.locked}
                onClick={() => {
                  props.onTrackDelete?.(deletionTrack.id);
                  setDeleteTrackId(null);
                }}
              >
                Kanalı ve klipleri sil
              </button>
            </footer>
          </section>
        </div>
      )}
      <div className="tl-status">
        <span>
          {gesture?.kind === "move"
            ? `${gesture.ids.length} klip taşınıyor · ${gesture.delta > 0 ? "+" : ""}${gesture.delta.toFixed(2)}s`
            : gesture?.kind === "trim"
              ? `Kırpma${gesture.edge === "start" ? "Giriş noktası" : "Çıkış noktası"} · ${formatTimelineTime(gesture.time, project.fps)}`
              : selectedIds.length
                ? `${selectedIds.length} klip seçili`
                : "Taşımak/kırpmak için sürükleyin · ⇧ çoklu seçim · ⌥←/→ kare kare ince ayar"}
        </span>
        <span>
          {project.tracks.length} kanal <i>·</i> {project.clips.length} klip{" "}
          <i>·</i> {snapping ? "Yapışma açık" : "Yapışma kapalı"}
        </span>
      </div>
    </section>
  );
}
