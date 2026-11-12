import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AudioLines, Brackets, ChevronLeft, ChevronRight, CircleAlert, Pause, Play, Plus, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import type { MediaAsset } from "../core/types";
import type { PlacementMode } from "../core/placement";
import { formatTime } from "../core/model";
import "./SourcePreview.css";

export interface SourcePreviewProps {
  asset: MediaAsset;
  fps: number;
  onClose: () => void;
  onAddRange: (sourceIn: number, duration: number, mode: PlacementMode) => void;
  mode: PlacementMode;
  onModeChange: (mode: PlacementMode) => void;
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A new asset owns a fresh media element and range, so delayed media events cannot affect another source. */
export default function SourcePreview(props: SourcePreviewProps) {
  return <SourcePreviewSession key={`${props.asset.id}:${props.asset.url}:${props.asset.previewUrl ?? ""}`} {...props} />;
}
function SourcePreviewSession({ asset, fps, onClose, onAddRange, mode, onModeChange }: SourcePreviewProps) {
  const media = useRef<HTMLMediaElement | null>(null);
  const panel = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const image = asset.kind === "image";
  const frameRate = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const frame = 1 / frameRate;
  const knownDuration = Number.isFinite(asset.duration) && asset.duration > 0 ? asset.duration : 0;
  const [duration, setDuration] = useState(image ? knownDuration || 5 : knownDuration);
  const [sourceIn, setSourceIn] = useState(0);
  const [sourceOut, setSourceOut] = useState(image ? knownDuration || 5 : knownDuration);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const outRef = useRef(sourceOut);
  outRef.current = sourceOut;
  const sourceUrl = asset.previewUrl || asset.url;
  const minLength = Math.min(frame, duration);
  const unavailable = !!asset.missing || !!error || !ready || (!image && duration < frame - 1e-8);
  const quantize = (value: number) => Math.round(value * frameRate) / frameRate;

  useEffect(() => {
    alive.current = true;
    const element = media.current;
    // React development StrictMode may replay effects while retaining the element.
    if (element && !element.getAttribute("src")) { element.setAttribute("src", sourceUrl);element.load(); }
    return () => {
      alive.current = false;
      if (element) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const element = media.current;
      if (!element || !alive.current) return;
      if (element.currentTime >= outRef.current) {
        element.pause();
        element.currentTime = outRef.current;
        setTime(outRef.current);
        setPlaying(false);
        return;
      }
      setTime(element.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const pause = () => { media.current?.pause(); setPlaying(false); };
  const seek = (value: number) => {
    if (!Number.isFinite(value)) return;
    const next = clamp(quantize(value), 0, duration);
    pause();
    if (media.current && ready) media.current.currentTime = next;
    setTime(next);
  };
  const setIn = (value: number) => {
    if (!Number.isFinite(value)) return;
    const next = clamp(quantize(value), 0, Math.max(0, sourceOut - minLength));
    setSourceIn(next);seek(next);
  };
  const setOut = (value: number) => {
    if (!Number.isFinite(value)) return;
    const next = clamp(quantize(value), sourceIn + minLength, duration);
    setSourceOut(next);seek(next);
  };
  const playPause = async () => {
    const element = media.current;
    if (!element || unavailable) return;
    if (!element.paused) { pause(); return; }
    if (element.currentTime < sourceIn || element.currentTime >= sourceOut - 1e-6) {
      element.currentTime = sourceIn;setTime(sourceIn);
    }
    try { await element.play(); }
    catch (reason) {
      if (alive.current && !(reason instanceof DOMException && reason.name === "AbortError")) {
        setError("Bu medya oynatılamıyor; biçimi kontrol edin veya önizleme vekili oluşturmak için yeniden içe aktarın.");
      }
    }
  };
  const metadata = () => {
    const value = media.current?.duration ?? 0;
    if (!Number.isFinite(value) || value <= 0) { setError("Medya süresi okunamıyor."); return; }
    const end = knownDuration > 0 ? Math.min(knownDuration, value) : value;
    setDuration(end);setSourceOut(end);setReady(true);
  };
  const mediaError = () => {
    if (!alive.current) return;
    setPlaying(false);setReady(false);
    setError("Medya önizlemesi çözülemiyor. Vekil oluşturmak için yeniden içe aktarın veya kaynak dosyanın kullanılabilir olduğunu kontrol edin.");
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]") || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === " " && target.closest("button")) { event.stopPropagation();return; }
    if (key === "escape") { event.preventDefault();event.stopPropagation();pause();onClose();return; }
    if (image || unavailable || !["i", "o", " ", "arrowleft", "arrowright"].includes(key)) return;
    event.preventDefault();event.stopPropagation();
    if (key === "i") setIn(media.current?.currentTime ?? time);
    else if (key === "o") setOut(media.current?.currentTime ?? time);
    else if (key === " ") { if (!event.repeat) void playPause(); }
    else seek(time + (key === "arrowleft" ? -frame : frame));
  };
  const add = () => {
    if (unavailable) return;
    pause();
    onAddRange(image ? 0 : sourceIn, image ? duration : sourceOut - sourceIn, mode);
  };
  return (
    <section ref={panel} className="source-preview player-panel panel" aria-label="Medya kaynak önizlemesi" tabIndex={0} onKeyDown={keyDown}
      onPointerDown={event => { if (!(event.target as HTMLElement).closest("button, input, select")) panel.current?.focus({ preventScroll: true }); }}>
      <header className="panel-heading source-heading">
        <div><span>Medya önizlemesi</span><strong title={asset.name}>{asset.name}</strong></div>
        <button aria-label="Zaman çizelgesi oynatıcısına dön" title="Zaman çizelgesi oynatıcısına dön · Esc" onClick={() => { pause();onClose(); }}><X size={16} /></button>
      </header>
      <div className="source-stage">
        {asset.missing || error ? <div className="source-message source-error" role="alert"><CircleAlert size={26} /><strong>{asset.missing ? "Medya dosyası eksik" : "Önizleme kullanılamıyor"}</strong><p>{asset.missing ? "Dosyayı medya işlemleri menüsünden yeniden bağlayın." : error}</p></div> : image ?
          <img src={sourceUrl} alt={asset.name} onLoad={() => setReady(true)} onError={mediaError} /> : asset.kind === "video" ?
          <video ref={element => { media.current = element; }} src={sourceUrl} preload="auto" playsInline muted={muted} onLoadedMetadata={metadata} onError={mediaError} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false);setTime(duration); }} /> :
          <><audio ref={element => { media.current = element; }} src={sourceUrl} preload="auto" muted={muted} onLoadedMetadata={metadata} onError={mediaError} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false);setTime(duration); }} />
            <div className="source-audio"><AudioLines size={38} /><strong>{asset.name}</strong><div className="source-waveform" aria-hidden="true">{Array.from({length: 80}, (_, i) => <i key={i} style={{height: `${10 + clamp(asset.waveform?.[Math.floor(i / 80 * asset.waveform.length)] ?? .25, 0, 1) * 85}%`}} />)}</div></div></>}
        {!asset.missing && !error && !ready && <div className="source-loading">Medya okunuyor…</div>}
      </div>
      {!image && <>
        <div className="source-seek">
          <div className="source-range-highlight" aria-hidden="true" style={{left: `${duration > 0 ? sourceIn / duration * 100 : 0}%`,width: `${duration > 0 ? (sourceOut-sourceIn)/duration*100 : 100}%`}} />
          <input aria-label="Medya önizleme ilerlemesi" type="range" min={0} max={duration || 1} step={frame} value={time} disabled={unavailable} onChange={event => seek(Number(event.target.value))} />
        </div>
        <div className="source-controls">
          <span className="timecode"><strong>{formatTime(time,frameRate)}</strong><span> / {formatTime(duration,frameRate)}</span></span>
          <div className="source-transport"><button aria-label="Kaynak medyada önceki kare" disabled={unavailable} onClick={() => seek(time-frame)}><ChevronLeft size={16} /></button><button aria-label={playing ? "Medyayı duraklat" : "Medyayı oynat"} disabled={unavailable} onClick={() => void playPause()}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button aria-label="Kaynak medyada sonraki kare" disabled={unavailable} onClick={() => seek(time+frame)}><ChevronRight size={16} /></button></div>
          <button aria-label={muted ? "Kaynak medya sesini aç" : "Kaynak medyayı sessize al"} onClick={() => setMuted(!muted)} disabled={unavailable}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        </div>
      </>}
      <footer className="source-range">
        {!image && <div className="source-marks">
          <label><button title="Geçerli konumu giriş noktası yap · I" aria-label="Kaynak medya giriş noktasını işaretle" disabled={unavailable} onClick={() => setIn(time)}>Giriş noktası <kbd>I</kbd></button><input aria-label="Kaynak medya giriş noktası" type="number" min={0} max={Math.max(0,sourceOut-minLength)} step={frame} value={Number(sourceIn.toFixed(6))} disabled={unavailable} onChange={event => {if(event.target.value !== "") setIn(Number(event.target.value));}} /><span>sn</span></label>
          <label><button title="Geçerli konumu çıkış noktası yap · O" aria-label="Kaynak medya çıkış noktasını işaretle" disabled={unavailable} onClick={() => setOut(time)}>Çıkış noktası <kbd>O</kbd></button><input aria-label="Kaynak medya çıkış noktası" type="number" min={sourceIn+minLength} max={duration} step={frame} value={Number(sourceOut.toFixed(6))} disabled={unavailable} onChange={event => {if(event.target.value !== "") setOut(Number(event.target.value));}} /><span>sn</span></label>
          <button title="Tam medyaya sıfırla" aria-label="Kaynak medya aralığını sıfırla" disabled={unavailable} onClick={() => {setSourceIn(0);setSourceOut(duration);seek(0);}}><RotateCcw size={14} /></button>
        </div>}
        <div className="source-add-row"><span>{image ? `${asset.width} × ${asset.height} · görsel` : <><Brackets size={12} /> Seçili {formatTime(Math.max(0, sourceOut-sourceIn),frameRate)}</>}</span><label className="source-mode">Yerleştirme biçimi<select aria-label="Yerleştirme biçimi" value={mode} onChange={event => onModeChange(event.target.value as PlacementMode)}><option value="append">Sona ekle</option><option value="insert">Araya ekle ve kaydır</option><option value="overwrite">Geçerli aralığı kapla</option></select></label><button className="primary" disabled={unavailable} onClick={add}><Plus size={14} />{image ? "Görsel ekle" : "Seçili klibi ekle"}</button></div>
        <p className="source-tip">Sona ekleme mevcut klipleri korur; araya ekleme oynatma konumundaki sonraki klipleri sağa kaydırır ve gerektiğinde klibi ikiye böler; kaplama aynı kanaldaki aralığı değiştirir. Üç yöntem de tek adımda geri alınır.</p>
        {!image && <p className="source-tip">Önizlemeye odaklanıp I / O ile işaretleyin, boşlukla seçimi oynatın, ← / → ile kare kare gezinin</p>}
        {!image && ready && duration < frame - 1e-8 && <p className="source-error">Medya projenin bir karesinden kısa olduğu için şu anda eklenemiyor.</p>}
      </footer>
    </section>
  );
}
