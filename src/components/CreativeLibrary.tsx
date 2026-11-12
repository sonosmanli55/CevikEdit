import { useState } from "react";
import { Plus, Search, Type } from "lucide-react";
import {
  MOTION_PRESETS,
  TEXT_PRESETS,
  TEXT_PRESET_CATEGORIES,
  TRANSITION_PRESETS,
  type MotionId,
  type TextPreset,
  type TransitionId,
} from "../core/creativePresets";
import PresetPreview from "./PresetPreview";
import "./CreativeLibrary.css";
function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <label className="creative-search">
      <Search size={14} />
      <input
        aria-label="Ön ayar ara"
        placeholder="Ad veya kullanım amacı ara"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Footer() {
  return (
    <footer className="creative-footer">Özgün geliştirme · MIT lisansı · çevrimdışı kullanılabilir</footer>
  );
}
export function TextLibrary({
  onAdd,
  onBlank,
}: {
  onAdd: (preset: TextPreset) => void;
  onBlank: () => void;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("Tümü");
  const needle = query.toLowerCase().trim();
  const presets = TEXT_PRESETS.filter(
    (p) =>
      (category === "Tümü" || category === p.category) &&
      [p.name, p.style.text, ...(p.keywords ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(needle),
  );
  const countFor = (name: string) =>
    name === "Tümü"
      ? TEXT_PRESETS.length
      : TEXT_PRESETS.filter((p) => p.category === name).length;
  return (
    <section className="creative-library" aria-label="Metin şablonu kitaplığı">
      <header>
        <strong>
          Metin şablonları <small>{TEXT_PRESETS.length}</small>
        </strong>
        <button onClick={onBlank}>
          <Type size={12} /> Metin ekle
        </button>
      </header>
      <SearchBox value={query} onChange={setQuery} />
      <div className="creative-tabs" role="tablist" aria-label="Metin şablonu kategorisi">
        {["Tümü", ...TEXT_PRESET_CATEGORIES].map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
            <span className="creative-tab-count" aria-hidden="true">
              {countFor(c)}
            </span>
          </button>
        ))}
      </div>
      <div className="creative-scroll">
        <p className="creative-help">
          Oynatma başlığı konumuna ekler; içerik, yazı tipi, kontur, satır yüksekliği, köşe yuvarlaklığı ve animasyon düzenlenebilir.
        </p>
        <div className="creative-grid">
          {presets.map((p) => (
            <article className="creative-card" key={p.id} data-preset-id={p.id}>
              <PresetPreview text={p} label={p.name} />
              <div>
                <span title={p.style.text}>
                  {p.name}
                  <small>
                    {p.category}
                    {p.motion ? " · animasyon" : " · düzenlenebilir metin"}
                  </small>
                </span>
                <button
                  aria-label={`${p.name} şablonunu ekle`}
                  onClick={() => onAdd(p)}
                >
                  <Plus size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {!presets.length && (
          <p className="creative-empty">Eşleşen metin şablonu yok</p>
        )}
      </div>
      <Footer />
    </section>
  );
}
export function MotionLibrary({
  disabled,
  onApply,
}: {
  disabled: boolean;
  onApply: (motion: MotionId) => void;
}) {
  const [query, setQuery] = useState("");
  const presets = MOTION_PRESETS.filter((p) =>
    (p.name + p.description).includes(query.trim()),
  );
  return (
    <>
      <SearchBox value={query} onChange={setQuery} />
      <p className="creative-help">
        Seçili görüntüye veya metne uygular. İlgili özelliğin anahtar karelerinin üzerine yazar; diğer özellikler korunur ve geri alınabilir.
      </p>
      <div className="creative-grid">
        {presets.map((p) => (
          <article className="creative-card" key={p.id} data-preset-id={p.id}>
            <PresetPreview motion={p.id} label={p.name} />
            <div>
              <span title={p.description}>
                {p.name}
                <small>Anahtar kare animasyonu</small>
              </span>
              <button
                disabled={disabled}
                aria-label={`${p.name} efektini uygula`}
                onClick={() => onApply(p.id)}
              >
                <Plus size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!presets.length && <p className="creative-empty">Eşleşen animasyon yok</p>}
    </>
  );
}
export function TransitionLibrary({
  disabled,
  onApply,
}: {
  disabled: boolean;
  onApply: (transition: TransitionId, seconds: number) => void;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("Tümü"),
    [seconds, setSeconds] = useState(0.5);
  const presets = TRANSITION_PRESETS.filter(
    (p) =>
      (category === "Tümü" || category === p.category) &&
      (p.name + p.description).includes(query.trim()),
  );
  return (
    <section className="creative-library" aria-label="Geçiş kitaplığı">
      <header>
        <strong>
          Görüntü geçişleri <small>{TRANSITION_PRESETS.length}</small>
        </strong>
        <span>Yerel olarak oluşturulur</span>
      </header>
      <SearchBox value={query} onChange={setQuery} />
      <div className="creative-tabs" role="tablist" aria-label="Geçiş kategorisi">
        {["Tümü", "Temel", "Kamera hareketi", "Dinamik"].map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <label className="creative-duration">
        Geçiş süresi
        <input
          type="number"
          aria-label="Geçiş süresi"
          min={0.05}
          max={5}
          step={0.05}
          value={seconds}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value))
              setSeconds(Math.max(0.05, Math.min(5, value)));
          }}
        />
        sn
      </label>
      <div className="creative-scroll">
        <p className="creative-help">
          Aynı kanaldaki bitişik görüntülerden öncekini seçin. Süre, kare ve klip uzunluğuyla sınırlıdır; "Arka plandan geçiş" dışındakilerde sonraki klip öne bindirilir. Kamera hareketleri sonraki klibin başındaki ilgili anahtar kareleri değiştirir.
        </p>
        <div className="creative-grid">
          {presets.map((p) => (
            <article className="creative-card" key={p.id} data-preset-id={p.id}>
              <PresetPreview transition={p.id} label={p.name} />
              <div>
                <span title={p.description}>
                  {p.name}
                  <small>
                    {p.category} · {p.description}
                  </small>
                </span>
                <button
                  disabled={disabled}
                  className="transition-apply"
                  aria-label={`${p.name} geçişini uygula`}
                  onClick={() => onApply(p.id, seconds)}
                >
                  <Plus size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {!presets.length && <p className="creative-empty">Eşleşen geçiş yok</p>}
      </div>
      <Footer />
    </section>
  );
}
