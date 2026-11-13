import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, LoaderCircle, Pause, Play, Plus, Search, X } from "lucide-react";
import { BUILTIN_ASSETS, BUILTIN_CATEGORIES, builtinAssetUrl, filterBuiltinAssets, type BuiltinAsset, type BuiltinAssetCategory } from "../core/builtinAssets";
import { BUILTIN_DRAG_TYPE } from "./Timeline";
import "./AssetLibrary.css";
export interface AssetLibraryProps {
  onAdd: (asset: BuiltinAsset) => void | Promise<void>;
  addingId?: string | null;
}
export default function AssetLibrary({ onAdd, addingId }: AssetLibraryProps) {
  const [category, setCategory] = useState<BuiltinAssetCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [recent, setRecent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { audio.current?.pause(); if (addedTimer.current) clearTimeout(addedTimer.current); }, []);
  useEffect(() => { audio.current?.pause(); audio.current = null; setPlaying(null); }, [category, query]);
  const filtered = filterBuiltinAssets(category, query);
  const busy = addingId || pending;
  const previewSound = async (asset: BuiltinAsset) => {
    audio.current?.pause();
    if (playing === asset.id) { audio.current = null; setPlaying(null); return; }
    const element = new Audio(builtinAssetUrl(asset));
    element.volume = 0.55;
    audio.current = element;
    element.onended = () => { if (audio.current === element) setPlaying(null); };
    element.onerror = () => { if (audio.current === element) { setPlaying(null); setError("Ses efekti şu anda oynatılamıyor, tekrar deneyin."); } };
    try { await element.play(); if (audio.current === element) setPlaying(asset.id); } catch { if (audio.current === element) setError("Ses efekti şu anda oynatılamıyor, tekrar deneyin."); }
  };
  const add = async (asset: BuiltinAsset) => {
    if (busy) return;
    setPending(asset.id); setError("");
    try {
      await onAdd(asset); setRecent(asset.id);
      if (addedTimer.current) clearTimeout(addedTimer.current);
      addedTimer.current = setTimeout(() => setRecent(null), 1800);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Medya eklenemedi, tekrar deneyin."); }
    finally { setPending(null); }
  };
  return <section className="builtin-library" aria-label="Özgün medya kitaplığı">
    <header className="builtin-header"><div><strong>İlham medyası</strong><span>{BUILTIN_ASSETS.length} özgün · çevrimdışı kullanılabilir</span></div><span className="builtin-offline">Yerleşik</span></header>
    <label className="builtin-search"><Search size={14} /><input aria-label="Özgün medya ara" placeholder="Çıkartma, arka plan, ses efekti ara…" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Medya aramasını temizle" onClick={() => setQuery("")}><X size={13}/></button>}</label>
    <div className="builtin-categories" role="tablist" aria-label="Özgün medya kategorisi">
      {[{id: "all" as const, name: "Tümü"}, ...BUILTIN_CATEGORIES].map(item => <button key={item.id} role="tab" aria-selected={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</button>)}
    </div>
    {error && <p className="builtin-error" role="alert">{error}</p>}
    <div className="builtin-results">
      {category === "titles" && <p className="builtin-hint">Saydam zemin videonun üzerine eklenebilir, ardından düzenlenebilir metin ekleyin.</p>}
      {filtered.length === 0 ? <div className="builtin-empty"><Search size={25}/><strong>Medya bulunamadı</strong><span>"Yıldız ışığı", "Seyahat" veya "Geçiş" deneyin</span><button onClick={() => {setQuery("");setCategory("all");}}>Tümünü gör</button></div> : <div className="builtin-grid">{filtered.map(asset => <article className={`builtin-card builtin-${asset.category}`} key={asset.id} data-builtin-id={asset.id} draggable title="Zaman çizelgesine sürükleyin" onDragStart={event => { event.dataTransfer.setData(BUILTIN_DRAG_TYPE, asset.id); event.dataTransfer.effectAllowed = "copy"; }}>
        {asset.kind === "audio" ? <button className="builtin-preview builtin-audio" aria-label={`${playing === asset.id ? "Durdur" : "Önizle"} ${asset.name}`} onClick={() => void previewSound(asset)}><AudioLines size={32}/><span className="builtin-play">{playing === asset.id ? <Pause size={13}/> : <Play size={13}/>}</span><small>{asset.duration.toFixed(2)}s</small></button> : <div className={`builtin-preview ${asset.transparent ? "builtin-alpha" : ""}`}><img src={builtinAssetUrl(asset)} alt={asset.name} loading="lazy" draggable={false}/>{asset.transparent && <small>Saydam</small>}</div>}
        <div className="builtin-card-footer"><div><strong title={asset.name}>{asset.name}</strong><span>{asset.kind === "audio" ? "Sentezlenmiş ses efekti" : asset.category === "titles" ? "Saydam zemin" : asset.category === "backgrounds" ? "1920 × 1080" : "Saydam çıkartma"}</span></div><button aria-label={`${asset.name} ekle`} title="Oynatma konumuna ekle" disabled={!!busy} onClick={() => void add(asset)}>{busy === asset.id ? <LoaderCircle size={15} className="builtin-spin"/> : recent === asset.id ? <Check size={15}/> : <Plus size={15}/>}</button></div>
      </article>)}</div>}
    </div>
    <footer className="builtin-footer"><span>{filtered.length} medya</span><span>Özgün · MIT lisansı · videolarda kullanılabilir</span></footer>
  </section>;
}
