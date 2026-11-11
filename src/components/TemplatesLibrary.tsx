import { useEffect, useMemo, useState } from "react";
import { Download, LayoutTemplate, Plus, Save, Trash2, Upload } from "lucide-react";
import { useEditorStore } from "../editor/store";
import { BUILTIN_TEMPLATES } from "../core/builtinTemplates";
import {
  instantiateTemplate,
  templateCover,
  templateFromProject,
  templateSummary,
  type CevikEditTemplate,
  type TemplateSummary,
} from "../core/templates";
import type { MediaAsset } from "../core/types";
import "./TemplatesLibrary.css";

const ipcMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = "Error invoking remote method ";
  if (!message.startsWith(prefix)) return message;
  const separator = message.indexOf(": ");
  if (separator < 0) return message;
  const detail = message.slice(separator + 2);
  return detail.startsWith("Error: ") ? detail.slice(7) : detail;
};

const seconds = (value: number) =>
  `${Math.floor(value / 60).toString().padStart(2, "0")}:${Math.floor(value % 60)
    .toString()
    .padStart(2, "0")}`;

export default function TemplatesLibrary() {
  const project = useEditorStore((state) => state.project);
  const [userTemplates, setUserTemplates] = useState<CevikEditTemplate[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [active, setActive] = useState<CevikEditTemplate | null>(null);
  const [projectName, setProjectName] = useState("");
  const [mediaChoice, setMediaChoice] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const api = window.editorAPI;

  const templates = useMemo<TemplateSummary[]>(
    () => [
      ...BUILTIN_TEMPLATES.map((item) => templateSummary(item, true)),
      ...userTemplates.map((item) => templateSummary(item)),
    ],
    [userTemplates],
  );

  async function refresh() {
    if (!api) return;
    try {
      const store = await api.listTemplates();
      setUserTemplates(store.templates);
      setWarnings(store.warnings);
    } catch (caught) {
      setError(ipcMessage(caught));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  function choose(summary: TemplateSummary) {
    const template =
      BUILTIN_TEMPLATES.find((item) => item.id === summary.id) ??
      userTemplates.find((item) => item.id === summary.id) ??
      null;
    if (!template) return;
    setActive(template);
    setProjectName(`${template.name} · ${new Date().toLocaleDateString("tr-TR")}`);
    setMediaChoice({});
    setTexts(
      Object.fromEntries(template.texts.map((slot) => [slot.key, slot.text])),
    );
    setNotice("");
    setError("");
  }

  async function create() {
    if (!active) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const media: Record<string, MediaAsset> = {};
      for (const slot of active.media) {
        const choice = mediaChoice[slot.key];
        if (!choice) continue;
        if (choice.startsWith("builtin:")) {
          if (!api) throw new Error("Yerleşik medya yalnızca masaüstü sürümde kullanılabilir.");
          media[slot.key] = await api.importBuiltinAsset(choice.slice(8));
        } else {
          const asset = project.assets.find((item) => item.id === choice);
          if (asset) media[slot.key] = asset;
        }
      }
      const result = instantiateTemplate(active, {
        name: projectName.trim() || active.name,
        media,
        texts,
      });
      useEditorStore.getState().setProject(result.project);
      setNotice(
        `“${result.project.name}” oluşturuldu. ${result.project.clips.length} klip, ${result.project.tracks.length} kanal.`,
      );
      if (result.warnings.length) setWarnings(result.warnings);
      setActive(null);
    } catch (caught) {
      setError(ipcMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    setError("");
    setNotice("");
    if (!saveName.trim()) {
      setError("Şablon için bir ad girin.");
      return;
    }
    if (!api) {
      setError("Şablon kaydetme yalnızca masaüstü sürümde kullanılabilir.");
      return;
    }
    setBusy(true);
    try {
      const template = templateFromProject(project, {
        name: saveName.trim(),
        description: saveDescription.trim(),
        cover: templateCover(project, saveName.trim()),
      });
      const store = await api.saveTemplate(template);
      setUserTemplates(store.templates);
      setWarnings(store.warnings);
      setSaving(false);
      setSaveName("");
      setSaveDescription("");
      setNotice(`“${template.name}” şablon olarak kaydedildi.`);
    } catch (caught) {
      setError(ipcMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(template: CevikEditTemplate) {
    if (!api) return;
    if (!window.confirm(`“${template.name}” şablonu silinsin mi?`)) return;
    try {
      const store = await api.deleteTemplate(template.id);
      setUserTemplates(store.templates);
      setWarnings(store.warnings);
      if (active?.id === template.id) setActive(null);
      setNotice("Şablon silindi.");
    } catch (caught) {
      setError(ipcMessage(caught));
    }
  }

  async function importTemplate() {
    if (!api) {
      setError("Şablon içe aktarma yalnızca masaüstü sürümde kullanılabilir.");
      return;
    }
    try {
      const store = await api.importTemplate();
      if (!store) return;
      setUserTemplates(store.templates);
      setWarnings(store.warnings);
      setNotice("Şablon içe aktarıldı.");
    } catch (caught) {
      setError(ipcMessage(caught));
    }
  }

  async function exportTemplate(template: CevikEditTemplate) {
    if (!api) return;
    try {
      const file = await api.exportTemplate(template.id);
      if (file) setNotice("Şablon dosyası kaydedildi.");
    } catch (caught) {
      setError(ipcMessage(caught));
    }
  }

  return (
    <section className="templates-panel" aria-label="Şablon kitaplığı">
      <div className="templates-heading">
        <h3><LayoutTemplate size={14} />Şablonlar</h3>
        <span>{templates.length} şablon</span>
      </div>
      <p className="templates-hint">
        Mevcut projeyi yeniden kullanılabilir şablon olarak kaydedin; yeni projede
        medya ve metinleri tek seferde değiştirin. Şablonlar yalnızca bu bilgisayarda
        saklanır.
      </p>
      <div className="templates-actions">
        <button className="small-button" onClick={() => { setSaving(!saving); setActive(null); }}>
          <Save size={14} />Projeyi şablon yap
        </button>
        <button className="small-button" onClick={() => void importTemplate()}>
          <Upload size={14} />İçe aktar
        </button>
      </div>

      {saving && (
        <div className="templates-save">
          <label>
            Şablon adı
            <input
              aria-label="Şablon adı"
              value={saveName}
              maxLength={120}
              onChange={(event) => setSaveName(event.target.value)}
            />
          </label>
          <label>
            Açıklama
            <textarea
              aria-label="Şablon açıklaması"
              rows={2}
              maxLength={600}
              value={saveDescription}
              onChange={(event) => setSaveDescription(event.target.value)}
            />
          </label>
          <p className="templates-hint">
            {project.assets.filter((asset) => project.clips.some((clip) => clip.assetId === asset.id)).length} medya yer tutucusu ·{" "}
            {project.clips.filter((clip) => clip.text).length} metin alanı · medya yolları şablona yazılmaz.
          </p>
          <div className="templates-row">
            <button className="primary small-button" disabled={busy} onClick={() => void saveCurrent()}>
              <Save size={14} />Şablonu kaydet
            </button>
            <button className="small-button" onClick={() => setSaving(false)}>Vazgeç</button>
          </div>
        </div>
      )}

      {active && (
        <div className="templates-fill">
          <div className="templates-fill-heading">
            <strong>{active.name}</strong>
            <button className="small-button" onClick={() => setActive(null)}>Kapat</button>
          </div>
          <p className="templates-hint">{active.description || "Açıklama yok."}</p>
          <label className="templates-field">
            Yeni proje adı
            <input
              aria-label="Yeni proje adı"
              value={projectName}
              maxLength={200}
              onChange={(event) => setProjectName(event.target.value)}
            />
          </label>
          {active.media.map((slot) => (
            <label className="templates-field" key={slot.key}>
              {slot.label} ({slot.kind === "audio" ? "ses" : slot.kind === "video" ? "video" : "görsel"})
              <select
                aria-label={`Yer tutucu: ${slot.label}`}
                value={mediaChoice[slot.key] ?? ""}
                onChange={(event) =>
                  setMediaChoice({ ...mediaChoice, [slot.key]: event.target.value })
                }
              >
                <option value="">{slot.optional ? "Boş bırak (klip eklenmez)" : "Seçin"}</option>
                {slot.builtinId && (
                  <option value={`builtin:${slot.builtinId}`}>Yerleşik varsayılan</option>
                )}
                {project.assets
                  .filter((asset) =>
                    slot.kind === "audio"
                      ? asset.kind === "audio"
                      : slot.kind === "video"
                        ? asset.kind === "video" || asset.kind === "image"
                        : asset.kind === "image" || asset.kind === "video",
                  )
                  .map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          {active.texts.map((slot) => (
            <label className="templates-field" key={slot.key}>
              {slot.label}
              <input
                aria-label={`Metin: ${slot.label}`}
                value={texts[slot.key] ?? ""}
                maxLength={20000}
                onChange={(event) => setTexts({ ...texts, [slot.key]: event.target.value })}
              />
            </label>
          ))}
          <button className="primary small-button templates-create" disabled={busy} onClick={() => void create()}>
            <Plus size={14} />Bu şablonla proje oluştur
          </button>
        </div>
      )}

      <div className="templates-grid">
        {templates.map((summary) => {
          const template =
            BUILTIN_TEMPLATES.find((item) => item.id === summary.id) ??
            userTemplates.find((item) => item.id === summary.id);
          return (
            <article className={`template-card ${active?.id === summary.id ? "active" : ""}`} key={summary.id}>
              <button className="template-open" onClick={() => choose(summary)}>
                {summary.cover ? (
                  <img src={summary.cover} alt="" />
                ) : (
                  <span className="template-empty"><LayoutTemplate size={22} /></span>
                )}
                <strong>{summary.name}</strong>
                <small>
                  {summary.width}×{summary.height} · {seconds(summary.duration)} ·{" "}
                  {summary.mediaCount} medya · {summary.textCount} metin
                  {summary.builtin ? " · yerleşik" : ""}
                </small>
              </button>
              {!summary.builtin && template && (
                <div className="template-tools">
                  <button
                    aria-label={`Şablonu dışa aktar: ${summary.name}`}
                    title="Şablon dosyası olarak kaydet"
                    onClick={() => void exportTemplate(template)}
                  >
                    <Download size={13} />
                  </button>
                  <button
                    aria-label={`Şablonu sil: ${summary.name}`}
                    title="Şablonu sil"
                    onClick={() => void remove(template)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {error && <p className="templates-error" role="alert">{error}</p>}
      {notice && <p className="templates-notice" role="status">{notice}</p>}
      {warnings.length > 0 && (
        <ul className="templates-warnings">
          {warnings.slice(0, 6).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
