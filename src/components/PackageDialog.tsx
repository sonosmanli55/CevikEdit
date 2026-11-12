import { useEffect, useRef, useState } from "react";
import type { ExportProgress, Project } from "../core/types";
import { FolderOpen, Package, X } from "lucide-react";
export default function PackageDialog({ project, onClose }: { project: Project; onClose(): void }) {
  const [progress, setProgress] = useState<ExportProgress | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const job = useRef<string | null>(null);
  const alive = useRef(true), requested = useRef(false);
  useEffect(() => {
    alive.current = true;
    const unsubscribe = window.editorAPI?.onPackageProgress(event => {
    if (!requested.current) return;
    if (job.current && job.current !== event.jobId) return;
    setProgress(event);
    if (["complete", "error", "cancelled"].includes(event.status)) { requested.current = false; setBusy(false); if (event.status === "error") setError(event.message ?? "Paketleme başarısız"); }
    });
    return () => { alive.current = false; unsubscribe?.(); if (requested.current && job.current) void window.editorAPI?.cancelPackage(job.current); };
  }, []);
  const start = async () => {
    if (!window.editorAPI) { setError("Proje medyasını toplamak için masaüstü sürümü gerekir"); return; }
    if (requested.current) return;
    requested.current = true;
    setBusy(true); setError(""); setProgress(null); job.current = null;
    try {
      const result = await window.editorAPI.packageProject(project);
      if (!alive.current) { if (result) void window.editorAPI.cancelPackage(result.jobId); return; }
      if (result) { job.current = result.jobId; setProgress(current => current ?? { jobId: result.jobId, status: "preparing", progress: 0, message: "Medya denetleniyor" }); }
      else { requested.current = false; setBusy(false); }
    }
    catch (e) { requested.current = false; if (alive.current) { setBusy(false); setError(String(e)); } }
  };
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Proje medyasını topla"><header><h2><Package size={18} /> Proje medyasını topla</h2><button aria-label="Medya paketlemeyi kapat" disabled={busy} onClick={onClose}><X size={18} /></button></header><div className="modal-body"><h3>{project.name}</h3><p>Proje ve {project.assets.length} öğe özgün medya yeni bir klasöre kopyalanır; klasörün tamamını taşıdığınızda düzenlemeye devam edebilirsiniz.</p><p className="muted small">Medya kitaplığındaki tüm medyayı içerir; paylaşılan dosyalar yalnızca bir kez kopyalanır. Özgün proje ve medya yerinde kalır; önizleme önbelleği paketlenmez. Özel sistem yazı tipleri hedef bilgisayara kurulmalıdır.</p>{progress && <div className="export-progress"><p>{progress.status === "complete" ? "Medya paketi tamamlandı" : progress.status === "cancelled" ? "Paketleme iptal edildi" : progress.message}</p><progress max={1} value={progress.progress} /><p>{Math.round(progress.progress * 100)}%</p></div>}{error && <p role="alert" className="inline-warning">{error}</p>}</div><footer>{busy ? <button disabled={!job.current} onClick={() => { if (job.current) void window.editorAPI?.cancelPackage(job.current); }}>Paketlemeyi iptal et</button> : progress?.status === "complete" ? <><button onClick={() => void window.editorAPI?.revealPath(progress.path!)}><FolderOpen size={15}/>Medya paketini göster</button><button className="primary" onClick={onClose}>Tamam</button></> : <><button onClick={onClose}>İptal</button><button className="primary" onClick={() => void start()}>Klasör seç ve paketle</button></>}</footer></section></div>;
}
