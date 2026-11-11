import { useEffect, useMemo, useState } from "react";
import { AudioLines, Gauge, Mic2, Music2, Plus, Volume2, X } from "lucide-react";
import { useEditorStore } from "../editor/store";
import {
  applyAudioEdit,
  prepareAudioNormalization,
  prepareDucking,
} from "../core/audioMix";
import { mapIntervalsToTimeline, type SpeechInterval } from "../core/vad";
import type { Clip, LoudnessMeasurement, Project } from "../core/types";
import "./AudioTools.css";

const TARGETS = [
  ["-14", "Sosyal medya · -14 LUFS"],
  ["-16", "Çevrimiçi video · -16 LUFS"],
  ["-18", "Konuşma · -18 LUFS"],
  ["-23", "Yayın · -23 LUFS"],
] as const;

function hasAudio(project: Project, clip: Clip): boolean {
  const asset = project.assets.find((item) => item.id === clip.assetId);
  return !!asset && asset.kind !== "image" && asset.hasAudio !== false;
}

const ipcMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = "Error invoking remote method ";
  if (!message.startsWith(prefix)) return message;
  const separator = message.indexOf(": ");
  if (separator < 0) return message;
  const detail = message.slice(separator + 2);
  return detail.startsWith("Error: ") ? detail.slice(7) : detail;
};

const clipLabel = (clip: Clip) =>
  `${clip.name} · ${clip.start.toFixed(2)}–${(clip.start + clip.duration).toFixed(2)} s`;

export default function AudioTools() {
  const project = useEditorStore((state) => state.project);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const [measurement, setMeasurement] = useState<LoudnessMeasurement | null>(
    null,
  );
  const [measuredClipId, setMeasuredClipId] = useState("");
  const [target, setTarget] = useState("-16");
  const [voiceIds, setVoiceIds] = useState<string[]>([]);
  const [musicIds, setMusicIds] = useState<string[]>([]);
  const [amount, setAmount] = useState("-12");
  const [fade, setFade] = useState("0.25");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  /** Detected speech intervals per voice clip, in timeline seconds. */
  const [speech, setSpeech] = useState<Record<string, SpeechInterval[]>>({});
  const [detecting, setDetecting] = useState(false);
  const [useSpeech, setUseSpeech] = useState(true);
  const api = window.editorAPI;

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => project.clips.find((clip) => clip.id === id))
        .filter((clip): clip is Clip => !!clip),
    [project, selectedIds],
  );
  const selectedAudio = selected.filter((clip) => hasAudio(project, clip));
  const measuredClip = project.clips.find((clip) => clip.id === measuredClipId);
  const voiceClips = voiceIds
    .map((id) => project.clips.find((clip) => clip.id === id))
    .filter((clip): clip is Clip => !!clip);
  const musicClips = musicIds
    .map((id) => project.clips.find((clip) => clip.id === id))
    .filter((clip): clip is Clip => !!clip);

  useEffect(() => {
    setMeasurement(null);
    setMeasuredClipId("");
    setVoiceIds([]);
    setMusicIds([]);
    setSpeech({});
    setNotice("");
    setError("");
  }, [project.id]);

  useEffect(() => {
    if (measuredClipId && !project.clips.some((clip) => clip.id === measuredClipId)) {
      setMeasurement(null);
      setMeasuredClipId("");
    }
    setVoiceIds((ids) => ids.filter((id) => project.clips.some((clip) => clip.id === id)));
    setMusicIds((ids) => ids.filter((id) => project.clips.some((clip) => clip.id === id)));
  }, [project, measuredClipId]);

  function add(kind: "voice" | "music") {
    setError("");
    setNotice("");
    const ids = selectedAudio.map((clip) => clip.id);
    if (!ids.length) {
      setError("Önce zaman çizelgesinde sesi olan bir veya daha fazla klip seçin.");
      return;
    }
    if (kind === "voice") {
      setVoiceIds((current) => [...new Set([...current, ...ids])]);
      setMusicIds((current) => current.filter((id) => !ids.includes(id)));
    } else {
      setMusicIds((current) => [...new Set([...current, ...ids])]);
      setVoiceIds((current) => current.filter((id) => !ids.includes(id)));
    }
  }

  async function measure() {
    setError("");
    setNotice("");
    if (!api) {
      setError("Bu özellik yalnızca masaüstü sürümde kullanılabilir.");
      return;
    }
    if (selectedAudio.length !== 1) {
      setError("Ses düzeyini ölçmek için tam olarak bir ses klibi seçin.");
      return;
    }
    const clip = selectedAudio[0];
    const asset = project.assets.find((item) => item.id === clip.assetId);
    if (!asset) {
      setError("Seçili klibin medyası bulunamadı.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.analyzeLoudness({
        source: asset.path,
        sourceIn: clip.sourceIn,
        duration: clip.duration,
        speed: clip.speed,
      });
      setMeasurement(result);
      setMeasuredClipId(clip.id);
      setNotice(
        `Ölçüm tamamlandı: ${result.inputI.toFixed(1)} LUFS · tepe ${result.inputTp.toFixed(1)} dBTP · aralık ${result.inputLra.toFixed(1)} LU`,
      );
    } catch (caught) {
      setError(ipcMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function normalize() {
    setError("");
    setNotice("");
    if (!measurement || !measuredClip) {
      setError("Önce normalleştirilecek ses klibini ölçün.");
      return;
    }
    const value = Number(target);
    try {
      const store = useEditorStore.getState();
      const plan = prepareAudioNormalization(
        store.project,
        measuredClip.id,
        measurement,
        value,
      );
      const gain = value - measurement.inputI;
      store.commit(applyAudioEdit(store.project, plan));
      setNotice(
        plan.changedIds.length
          ? `Yaklaşık ${gain.toFixed(1)} dB kazanç uygulandı; tek adımda geri alınabilir.`
          : "Ses düzeyi zaten hedef aralıkta; ses değiştirilmedi.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  /** Analyze every voice clip and remember the detected speech intervals. */
  async function detect() {
    setError("");
    setNotice("");
    if (!api) {
      setError("Konuşma algılama yalnızca masaüstü sürümde kullanılabilir.");
      return;
    }
    if (!voiceIds.length) {
      setError("Önce konuşma listesine en az bir klip ekleyin.");
      return;
    }
    setDetecting(true);
    try {
      const found: Record<string, SpeechInterval[]> = {};
      let speechSeconds = 0;
      let analyzed = 0;
      let floor = 0;
      let threshold = 0;
      for (const id of voiceIds) {
        const clip = project.clips.find((item) => item.id === id);
        if (!clip) continue;
        const asset = project.assets.find((item) => item.id === clip.assetId);
        if (!asset) continue;
        const result = await api.analyzeSpeech({
          source: asset.path,
          sourceIn: clip.sourceIn,
          duration: clip.duration,
          speed: clip.speed,
        });
        const ranges = mapIntervalsToTimeline(result.intervals, clip);
        if (!ranges.length) continue;
        found[id] = ranges;
        speechSeconds += ranges.reduce((sum, range) => sum + (range.end - range.start), 0);
        analyzed += result.analyzedSeconds;
        floor = Math.min(floor, result.noiseFloor);
        threshold = Math.max(threshold, result.threshold);
      }
      const count = Object.values(found).reduce((total, list) => total + list.length, 0);
      if (!count) {
        setSpeech({});
        setError("Konuşma bulunamadı; ses çok kısık olabilir. Klipleri kontrol edip yeniden deneyin.");
        return;
      }
      setSpeech(found);
      setUseSpeech(true);
      setNotice(
        `${count} konuşma aralığı algılandı (${speechSeconds.toFixed(1)} sn / ${analyzed.toFixed(0)} sn). Gürültü tabanı ${floor.toFixed(0)} dBFS, eşik ${threshold.toFixed(0)} dBFS.`,
      );
    } catch (caught) {
      setError(ipcMessage(caught));
    } finally {
      setDetecting(false);
    }
  }

  function duck() {
    setError("");
    setNotice("");
    const ranges = useSpeech ? speech : undefined;
    const settings = {
      amountDb: Number(amount),
      fade: Number(fade),
      ...(ranges && Object.keys(ranges).length ? { ranges } : {}),
    };
    try {
      const store = useEditorStore.getState();
      const plan = prepareDucking(
        store.project,
        voiceIds,
        musicIds,
        settings,
      );
      store.commit(applyAudioEdit(store.project, plan));
      setNotice(
        `${plan.changedIds.length} müzik klibinde ${settings.ranges ? "algılanan konuşma aralıklarına" : "konuşma aralıklarına"} göre ses kısıldı; tek adımda geri alınabilir.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section className="audio-tools" aria-label="Ses araçları">
      <div className="audio-tools-heading">
        <h3>Ses araçları</h3>
        <span>{selectedAudio.length} sesli klip seçili</span>
      </div>

      <div className="audio-card">
        <h4><Gauge size={14} />Ses düzeyi</h4>
        <p className="audio-hint">
          Seçili klibin konuşma/ses aralığını FFmpeg ile ölçer. Yerel çalışır,
          hiçbir ses yüklenmez.
        </p>
        <div className="audio-row">
          <button
            className="small-button"
            disabled={busy || selectedAudio.length !== 1}
            onClick={() => void measure()}
          >
            <AudioLines size={14} />
            {busy ? "Ölçülüyor…" : "Seçili sesi ölç"}
          </button>
          {measurement && (
            <span className="audio-reading">
              {measurement.inputI.toFixed(1)} LUFS · {measurement.inputTp.toFixed(1)} dBTP
            </span>
          )}
        </div>
        <label className="audio-field">
          Hedef ses düzeyi
          <select
            aria-label="Hedef ses düzeyi"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            {TARGETS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <button
          className="primary small-button audio-apply"
          disabled={!measurement || !measuredClip}
          onClick={normalize}
        >
          <Volume2 size={14} />
          Ses düzeyini normalleştir
        </button>
        <p className="audio-hint">
          Kazanç, parlaklık sınırı -1 dBTP korunarak klibin ses yüksekliğine ve
          varsa ses anahtar karelerine yazılır. Sonuç düzenlenebilir ve tek
          adımda geri alınabilir.
        </p>
      </div>

      <div className="audio-card">
        <h4><Mic2 size={14} />Konuşma altında müziği kıs</h4>
        <p className="audio-hint">
          Konuşma ve müzik kliplerini ayrı listelere ekleyin. Konuşma
          aralıklarında müziğin sesi azalır, konuşma bitince eski düzeye döner.
        </p>
        <div className="audio-groups">
          <div className="audio-group">
            <div className="audio-group-heading">
              <span><Mic2 size={12} />Konuşma</span>
              <button
                className="small-button"
                aria-label="Konuşma listesine ekle"
                onClick={() => add("voice")}
                disabled={!selectedAudio.length}
              >
                <Plus size={12} />Seçileni ekle
              </button>
            </div>
            {!voiceClips.length && <p className="audio-empty">Henüz konuşma klibi eklenmedi.</p>}
            {voiceClips.map((clip) => (
              <div className="audio-chip" key={clip.id}>
                <span title={clipLabel(clip)}>{clipLabel(clip)}</span>
                <button
                  aria-label={`Konuşmadan çıkar: ${clip.name}`}
                  title="Listeden çıkar"
                  onClick={() => setVoiceIds((ids) => ids.filter((id) => id !== clip.id))}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="audio-group">
            <div className="audio-group-heading">
              <span><Music2 size={12} />Müzik</span>
              <button
                className="small-button"
                aria-label="Müzik listesine ekle"
                onClick={() => add("music")}
                disabled={!selectedAudio.length}
              >
                <Plus size={12} />Seçileni ekle
              </button>
            </div>
            {!musicClips.length && <p className="audio-empty">Henüz müzik klibi eklenmedi.</p>}
            {musicClips.map((clip) => (
              <div className="audio-chip" key={clip.id}>
                <span title={clipLabel(clip)}>{clipLabel(clip)}</span>
                <button
                  aria-label={`Müzikten çıkar: ${clip.name}`}
                  title="Listeden çıkar"
                  onClick={() => setMusicIds((ids) => ids.filter((id) => id !== clip.id))}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="audio-row">
          <button
            className="small-button"
            disabled={detecting || !voiceIds.length}
            onClick={() => void detect()}
          >
            <Mic2 size={13} />
            {detecting ? "Konuşma algılanıyor…" : "Konuşma aralıklarını algıla"}
          </button>
          <label className="audio-toggle">
            <input
              type="checkbox"
              aria-label="Algılanan konuşma aralıklarını kullan"
              checked={useSpeech && Object.keys(speech).length > 0}
              disabled={!Object.keys(speech).length}
              onChange={(event) => setUseSpeech(event.target.checked)}
            />
            Yalnızca gerçek konuşma
          </label>
        </div>
        {Object.keys(speech).length > 0 && (
          <p className="audio-reading">
            {Object.values(speech).reduce((total, list) => total + list.length, 0)} aralık
            algılandı
          </p>
        )}
        <div className="audio-grid">
          <label className="audio-field">
            Kısma miktarı (dB)
            <input
              aria-label="Müzik kısma miktarı"
              type="number"
              min="-60"
              max="0"
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="audio-field">
            Geçiş süresi (s)
            <input
              aria-label="Müzik kısma geçiş süresi"
              type="number"
              min="0"
              max="5"
              step="0.05"
              value={fade}
              onChange={(event) => setFade(event.target.value)}
            />
          </label>
        </div>
        <button
          className="primary small-button audio-apply"
          disabled={!voiceIds.length || !musicIds.length}
          onClick={duck}
        >
          <Volume2 size={14} />
          Müziği konuşma altında kıs
        </button>
        <p className="audio-hint">
          Sonuç, müzik kliplerine normal ses anahtar kareleri olarak yazılır;
          önizleme ve dışa aktarma aynı değerleri kullanır. Anahtar kare
          panelinden sonradan düzenleyebilirsiniz.
        </p>
      </div>

      {error && <p className="audio-error" role="alert">{error}</p>}
      {notice && <p className="audio-notice" role="status">{notice}</p>}
    </section>
  );
}
