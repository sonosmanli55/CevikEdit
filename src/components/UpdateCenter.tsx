import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Download, RefreshCw, RotateCw, Sparkles } from "lucide-react";
import type { UpdateDownloadProgress, UpdateState } from "../core/types";
import type { UpdateInfo } from "../core/updates";
import { updateSummary } from "../core/updates";
import "./UpdateCenter.css";

/**
 * Update banner + settings block.
 *
 * The banner appears when a check finds a newer release, shows the release notes
 * and offers one button: download (with progress) then install. Nothing runs
 * without an explicit click, and the installer path is verified in the main
 * process.
 */
export function useUpdater(enabled = true) {
  const [state, setState] = useState<UpdateState | null>(null);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [installer, setInstaller] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const started = useRef(false);

  const check = useCallback(async () => {
    if (!window.editorAPI) return;
    setBusy(true);
    setError("");
    try {
      const result = await window.editorAPI.checkForUpdates();
      setState(result);
      if (result.error) setError(result.error);
      if (result.available) setDismissed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    // Check once shortly after startup so the first paint is never blocked.
    const timer = setTimeout(() => void check(), 2500);
    return () => clearTimeout(timer);
  }, [enabled, check]);

  useEffect(() => {
    if (!window.editorAPI) return;
    return window.editorAPI.onUpdateProgress((event) => {
      setProgress(event);
      if (event.status === "ready" && event.path) setInstaller(event.path);
      if (event.status === "error" && event.message) setError(event.message);
    });
  }, []);

  const download = useCallback(async () => {
    if (!window.editorAPI) return;
    setBusy(true);
    setError("");
    setProgress({ received: 0, total: 0, percent: 0, status: "downloading" });
    try {
      const file = await window.editorAPI.downloadUpdate();
      setInstaller(file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const install = useCallback(async () => {
    if (!window.editorAPI || !installer) return;
    setError("");
    try {
      await window.editorAPI.installUpdate(installer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [installer]);

  const openPage = useCallback(() => {
    void window.editorAPI?.openUpdatePage();
  }, []);

  return {
    state,
    available: state?.available ?? null,
    progress,
    installer,
    busy,
    error,
    dismissed,
    dismiss: () => setDismissed(true),
    check,
    download,
    install,
    openPage,
  };
}

export type Updater = ReturnType<typeof useUpdater>;

export function UpdateBanner({ updater }: { updater: Updater }) {
  const { available, progress, installer, busy, dismissed, error } = updater;
  if (!available && !error) return null;
  if (dismissed && !installer) return null;
  if (!available) return null;
  return (
    <aside className="update-banner" role="status" aria-label="Güncelleme bildirimi">
      <div className="update-banner-icon">
        {installer ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}
      </div>
      <div className="update-banner-copy">
        <strong>
          {installer
            ? `CevikEdit ${available.version} hazır`
            : `CevikEdit ${available.version} yayınlandı`}
        </strong>
        <span>
          {error
            ? error
            : installer
              ? "Kurulumu başlatmak için tek tıkla devam edin."
              : progress?.status === "downloading"
                ? `İndiriliyor… %${progress.percent}`
                : updateSummary(available)}
        </span>
        {progress?.status === "downloading" && (
          <div className="update-progress" aria-hidden="true">
            <i style={{ width: `${progress.percent}%` }} />
          </div>
        )}
        {!installer && !progress && available.notes && (
          <details className="update-notes">
            <summary>Yenilikler</summary>
            <pre>{available.notes.slice(0, 1200)}</pre>
          </details>
        )}
      </div>
      <div className="update-banner-actions">
        {installer ? (
          <button className="primary small-button" onClick={() => void updater.install()}>
            <RotateCw size={13} />Kur ve yeniden başlat
          </button>
        ) : (
          <button
            className="primary small-button"
            disabled={busy || progress?.status === "downloading"}
            onClick={() => void updater.download()}
          >
            <Download size={13} />
            {progress?.status === "downloading" ? `%${progress.percent}` : "Güncelle"}
          </button>
        )}
        {!installer && (
          <button className="small-button" onClick={updater.openPage}>
            Sürüm notları
          </button>
        )}
        <button className="update-dismiss" aria-label="Bildirimi kapat" onClick={updater.dismiss}>
          ×
        </button>
      </div>
    </aside>
  );
}

export function UpdateSettings({ updater }: { updater: Updater }) {
  const { state, available, progress, installer, busy, error } = updater;
  return (
    <div className="update-settings">
      <h3>Güncellemeler</h3>
      <div className={`engine-status ${installer ? "ready" : ""}`}>
        {installer ? <CheckCircle2 size={18} /> : <RefreshCw size={18} />}
        <div>
          <strong>
            {installer
              ? `Sürüm ${available?.version ?? ""} indirildi`
              : available
                ? `Yeni sürüm ${available.version} mevcut`
                : "CevikEdit güncel"}
          </strong>
          <span>
            Yüklü sürüm {state?.currentVersion ?? "—"}
            {state?.checkedAt
              ? ` · son denetim ${new Date(state.checkedAt).toLocaleTimeString("tr-TR")}`
              : ""}
          </span>
        </div>
      </div>
      <div className="button-row">
        <button disabled={busy} onClick={() => void updater.check()}>
          <RefreshCw size={14} />Şimdi denetle
        </button>
        {available && !installer && (
          <button className="primary" disabled={busy || progress?.status === "downloading"} onClick={() => void updater.download()}>
            <Download size={14} />
            {progress?.status === "downloading" ? `İndiriliyor %${progress.percent}` : "Güncellemeyi indir"}
          </button>
        )}
        {installer && (
          <button className="primary" onClick={() => void updater.install()}>
            <RotateCw size={14} />Kur ve yeniden başlat
          </button>
        )}
        <button onClick={updater.openPage}>
          <ArrowRight size={14} />Sürüm notları
        </button>
      </div>
      {available?.notes && (
        <details className="update-notes">
          <summary>Bu sürümdeki yenilikler</summary>
          <pre>{available.notes.slice(0, 4000)}</pre>
        </details>
      )}
      {error && <p className="update-error" role="alert">{error}</p>}
      <p className="muted small">
        Güncellemeler GitHub sürümlerinden denetlenir; proje ve medya yüklenmez.
        Kurulum yalnızca siz butona bastığınızda başlar.
      </p>
    </div>
  );
}
