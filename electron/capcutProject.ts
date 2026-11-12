import { posix, win32 } from "node:path";

/** These limits apply to sidecars, not media or the actual timeline payload. */
export const CAPCUT_SIDECAR_MAX_BYTES = 256 * 1024;
export const CAPCUT_MAX_TIMELINES = 256;

export interface CapcutProjectSelection {
  projectDirectory: string;
  manifestPath: string;
  layoutPath: string;
  directDraftPath: string;
  /** Present only when the user selected a particular timeline file/directory. */
  selectedTimelineId?: string;
}

export interface CapcutTimelineChoice {
  id: string;
  name: string;
  draftPath: string;
  isMain: boolean;
  isActive: boolean;
}

export interface CapcutProjectImportPlan {
  selection: CapcutProjectSelection;
  kind: "single-draft" | "multi-timeline";
  timelines: CapcutTimelineChoice[];
  mainTimelineId?: string;
  activeTimelineId?: string;
  recommendedTimelineId?: string;
  selectedTimelineId?: string;
  requiresTimelineChoice: boolean;
  warnings: string[];
}

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function pathApi(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\")
    ? win32
    : posix;
}

function timelineId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)
  )
    throw new Error("CapCut zaman çizelgesi kimliği güvenli bir klasör adı değil");
  return value;
}

/** No filesystem access. The caller must resolve symlinks before reading these paths. */
export function describeCapcutProjectSelection(
  selectedPath: string,
  selectedKind: "file" | "directory",
): CapcutProjectSelection {
  if (
    typeof selectedPath !== "string" ||
    selectedPath.includes("\0") ||
    selectedPath.length > 4096 ||
    (selectedKind !== "file" && selectedKind !== "directory")
  )
    throw new Error("CapCut proje seçimi geçersiz");
  const paths = pathApi(selectedPath);
  if (!paths.isAbsolute(selectedPath))
    throw new Error("CapCut projesinin yerel tam yolunu seçin");
  const normalized = paths.normalize(selectedPath);
  const folder =
    selectedKind === "directory" ? normalized : paths.dirname(normalized);
  let projectDirectory = folder;
  let selectedTimelineId: string | undefined;
  if (paths.basename(paths.dirname(folder)) === "Timelines") {
    selectedTimelineId = timelineId(paths.basename(folder));
    projectDirectory = paths.dirname(paths.dirname(folder));
  } else if (paths.basename(folder) === "Timelines") {
    projectDirectory = paths.dirname(folder);
  }
  const filename = selectedKind === "file" ? paths.basename(normalized) : "";
  const sidecarSelected =
    selectedKind === "file" &&
    ((filename === "project.json" && paths.basename(folder) === "Timelines") ||
      filename === "timeline_layout.json");
  return {
    projectDirectory,
    manifestPath: paths.join(projectDirectory, "Timelines", "project.json"),
    layoutPath: paths.join(projectDirectory, "timeline_layout.json"),
    directDraftPath:
      selectedKind === "file" && !sidecarSelected
        ? normalized
        : paths.join(
            selectedTimelineId ? folder : projectDirectory,
            "draft_info.json",
          ),
    ...(selectedTimelineId ? { selectedTimelineId } : {}),
  };
}

function readSidecar(value: unknown, description: string): JsonObject {
  let serialized: string;
  try {
    serialized = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    throw new Error(`${description} okunabilir JSON değil`);
  }
  if (
    typeof serialized !== "string" ||
    Buffer.byteLength(serialized, "utf8") > CAPCUT_SIDECAR_MAX_BYTES
  )
    throw new Error(`${description} okuma boyutu sınırını aşıyor`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`${description} okunabilir JSON değil`);
  }
  if (!object(parsed)) throw new Error(`${description} bir JSON nesnesi olmalı`);
  return parsed;
}

/**
 * Builds a read-only selection plan from modern project/layout sidecars.
 * Observed schema: Jianying 11.0.12922, project version 0. This does not decode
 * draft payloads, discover files, read source media, or follow sidecar path fields.
 * A modern manifest replaces root draft selection; multiple timelines require a
 * user's explicit choice, even when main/active IDs suggest an initial choice.
 */
export function planCapcutProjectImport(
  selectedPath: string,
  selectedKind: "file" | "directory",
  manifest?: unknown,
  layout?: unknown,
): CapcutProjectImportPlan {
  const selection = describeCapcutProjectSelection(selectedPath, selectedKind);
  const warnings: string[] = [];
  if (manifest === undefined) {
    return {
      selection,
      kind: "single-draft",
      timelines: [],
      requiresTimelineChoice: false,
      warnings,
    };
  }
  const project = readSidecar(manifest, "CapCut zaman çizelgesi listesi");
  if (!Array.isArray(project.timelines))
    throw new Error("CapCut projesinde timelines zaman çizelgesi listesi yok");
  if (project.timelines.length > CAPCUT_MAX_TIMELINES)
    throw new Error("CapCut zaman çizelgesi sayısı içe aktarma sınırını aşıyor");
  if (project.version !== 0)
    warnings.push("Zaman çizelgesi listesi sürümü henüz doğrulanmadı; içe aktarmadan önce seçili zaman çizelgesini kontrol edin.");

  const seen = new Set<string>();
  const entries: { id: string; name: string }[] = [];
  for (const entry of project.timelines) {
    if (!object(entry)) throw new Error("CapCut zaman çizelgesi girdisi bir nesne değil");
    const id = timelineId(entry.id);
    if (seen.has(id.toLowerCase())) throw new Error("CapCut zaman çizelgesi kimliği yineleniyor");
    seen.add(id.toLowerCase());
    if (typeof entry.is_marked_delete !== "boolean")
      throw new Error("CapCut zaman çizelgesinde açık bir silinme durumu yok");
    if (entry.is_marked_delete) continue;
    if (entry.name !== undefined && typeof entry.name !== "string")
      throw new Error("CapCut zaman çizelgesi adı geçersiz");
    if (typeof entry.name === "string" && entry.name.length > 512)
      throw new Error("CapCut zaman çizelgesi adı çok uzun");
    entries.push({ id, name: (entry.name as string | undefined) || id });
  }
  if (!entries.length) throw new Error("CapCut projesinde içe aktarılabilir, silinmemiş zaman çizelgesi yok");

  const mainId =
    project.main_timeline_id === undefined
      ? undefined
      : timelineId(project.main_timeline_id);
  const mainTimelineId = entries.find((entry) => entry.id === mainId)?.id;
  if (mainId && !mainTimelineId)
    warnings.push("Ana zaman çizelgesi silinmiş veya listede yok; zaman çizelgesini elle seçin.");
  let activeTimelineId: string | undefined;
  if (layout !== undefined) {
    try {
      const data = readSidecar(layout, "CapCut zaman çizelgesi düzeni");
      const activeId =
        data.activeTimeline === undefined
          ? undefined
          : timelineId(data.activeTimeline);
      activeTimelineId = entries.find((entry) => entry.id === activeId)?.id;
      if (activeId && !activeTimelineId)
        warnings.push("Etkin zaman çizelgesi silinmiş veya listede yok; zaman çizelgesini elle seçin.");
    } catch {
      warnings.push("Zaman çizelgesi düzeni doğrulanamadı; etkin zaman çizelgesi ipucu yok sayıldı.");
    }
  }
  const selectedTimelineId = selection.selectedTimelineId;
  if (
    selectedTimelineId &&
    !entries.some((entry) => entry.id === selectedTimelineId)
  )
    throw new Error("Seçili zaman çizelgesi silinmiş veya proje listesinde yok");
  const paths = pathApi(selection.projectDirectory);
  return {
    selection,
    kind: "multi-timeline",
    timelines: entries.map((entry) => ({
      ...entry,
      draftPath: paths.join(
        selection.projectDirectory,
        "Timelines",
        entry.id,
        "draft_info.json",
      ),
      isMain: entry.id === mainTimelineId,
      isActive: entry.id === activeTimelineId,
    })),
    mainTimelineId,
    activeTimelineId,
    recommendedTimelineId:
      selectedTimelineId || activeTimelineId || mainTimelineId || entries[0].id,
    selectedTimelineId,
    requiresTimelineChoice: entries.length > 1 && !selectedTimelineId,
    warnings,
  };
}

/** Resolve only an explicit choice or the one unambiguous timeline. */
export function selectCapcutTimelineDraft(
  plan: CapcutProjectImportPlan,
  chosenTimelineId?: string,
): string {
  if (plan.kind === "single-draft") return plan.selection.directDraftPath;
  const selected = chosenTimelineId ?? plan.selectedTimelineId;
  if (selected === undefined && plan.requiresTimelineChoice)
    throw new Error("Bu CapCut projesinde birden fazla zaman çizelgesi var; içe aktarılacak olanı açıkça seçin");
  const choice =
    selected === undefined
      ? plan.timelines[0]
      : plan.timelines.find((timeline) => timeline.id === timelineId(selected));
  if (!choice) throw new Error("Seçili zaman çizelgesi içe aktarılabilir listede değil");
  return choice.draftPath;
}
