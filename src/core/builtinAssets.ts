/** Original CevikEdit assets. Files are generated locally by scripts/generate-assets.ts. */
export type BuiltinAssetCategory = "stickers" | "backgrounds" | "titles" | "sounds";
export interface BuiltinAsset {
  id: string;
  name: string;
  category: BuiltinAssetCategory;
  kind: "image" | "audio";
  fileName: string;
  width: number;
  height: number;
  duration: number;
  tags: string[];
  transparent: boolean;
}
const image = (id: string, name: string, category: Exclude<BuiltinAssetCategory, "sounds">, tags: string[]): BuiltinAsset => ({
  id, name, category, kind: "image", fileName: `${id}.png`,
  width: category === "stickers" ? 512 : 1920,
  height: category === "stickers" ? 512 : 1080,
  duration: 5, tags, transparent: category !== "backgrounds",
});
const sound = (id: string, name: string, duration: number, tags: string[]): BuiltinAsset => ({
  id, name, category: "sounds", kind: "audio", fileName: `${id}.wav`,
  width: 0, height: 0, duration, tags, transparent: false,
});
export const BUILTIN_ASSETS: readonly BuiltinAsset[] = [
  image("sparkle", "Dört köşe yıldız ışığı", "stickers", ["Yıldız", "Parıltı", "sparkle"]),
  image("burst", "Enerjik patlama çıkartması", "stickers", ["Patlama", "Vurgu", "burst"]),
  image("heart", "Mercan kalp", "stickers", ["Kalp", "Beğeni", "heart"]),
  image("arrow-curved", "Elle çizilmiş kıvrık ok", "stickers", ["Ok", "Yönlendirme", "arrow"]),
  image("arrow-left", "Sola geri sarma", "stickers", ["Geri sar", "Ok", "reverse"]),
  image("play", "Nane oynat düğmesi", "stickers", ["Oynat", "Video", "play"]),
  image("check", "Onay işareti", "stickers", ["Başarılı", "Tamam", "check"]),
  image("pin", "Seyahat konumu", "stickers", ["Seyahat", "Konum", "pin"]),
  image("speech", "Konuşma balonu", "stickers", ["Diyalog", "Metin", "speech"]),
  image("quote", "Alıntı işareti", "stickers", ["Röportaj", "Alıntı", "quote"]),
  image("film", "Mini film şeridi", "stickers", ["Sinema", "Film", "film"]),
  image("clap", "Klaket", "stickers", ["Klaket", "Sinema", "clap"]),
  image("sun", "Gün ışığı güneşi", "stickers", ["Hava durumu", "Güneş ışığı", "sun"]),
  image("rainbow", "Yumuşak renkli gökkuşağı", "stickers", ["Gökkuşağı", "Yaşam", "rainbow"]),
  image("confetti", "Kutlama konfetisi", "stickers", ["Kutlama", "Festival", "confetti"]),
  image("focus", "Vizör çerçevesi", "stickers", ["Kamera", "Odak", "focus"]),
  image("bg-midnight", "Gece yarısı degradesi", "backgrounds", ["Koyu mavi", "Degrade", "dark"]),
  image("bg-sunrise", "Gün doğumu mercanı", "backgrounds", ["Sıcak ton", "Degrade", "warm"]),
  image("bg-mint", "Nane ışıltısı", "backgrounds", ["Ferah", "Yeşil", "mint"]),
  image("bg-paper", "Sıcak beyaz kâğıt dokusu", "backgrounds", ["Kâğıt", "Minimal", "paper"]),
  image("bg-grid", "Koyu koordinat ızgarası", "backgrounds", ["Teknoloji", "Izgara", "grid"]),
  image("bg-orbit", "Mavi-mor yörünge", "backgrounds", ["Teknoloji", "Halka", "orbit"]),
  image("title-mint", "Nane kişi şeridi", "titles", ["Kişi", "Alt bant", "Röportaj"]),
  image("title-coral", "Mercan altyazı şeridi", "titles", ["Altyazı", "Alt bant", "Başlık"]),
  image("title-glass", "Koyu bilgi kartı", "titles", ["Bilgi", "Kart", "Başlık"]),
  image("title-frame", "İnce sinema çerçevesi", "titles", ["Çerçeve", "Sinema", "Başlık"]),
  image("title-corner", "Köşe etiketi ve yan çubuk", "titles", ["Köşe etiketi", "Sütun", "Başlık"]),
  image("title-ribbon", "Vurgu şeridi", "titles", ["Vurgu", "Şerit", "Başlık"]),
  sound("sound-pop", "Hafif baloncuk", 0.25, ["Baloncuk", "Geçiş", "pop"]),
  sound("sound-click", "Yumuşak dokunuş", 0.12, ["Tıklama", "Arayüz", "click"]),
  sound("sound-chime", "Berrak bildirim", 1.2, ["Zil sesi", "Bildirim", "chime"]),
  sound("sound-rise", "Yukarı kaydırma sesi", 0.65, ["Yükseliş", "Geçiş", "rise"]),
  sound("sound-whoosh", "Hava süpürmesi", 0.8, ["Süpürme", "Geçiş", "whoosh"]),
  sound("sound-complete", "Üçlü tamamlanma sesi", 1.4, ["Başarılı", "Tamam", "complete"]),
  image("bolt", "Şimşek vurgusu", "stickers", ["Şimşek", "Enerji", "bolt"]),
  image("cloud", "Yumuşak bulut", "stickers", ["Hava durumu", "Gökyüzü", "cloud"]),
  image("moon", "Ay ışığı yıldızları", "stickers", ["Ay", "Gece", "moon"]),
  image("leaf", "Filiz yaprakları", "stickers", ["Bitki", "Doğa", "leaf"]),
  image("flame", "Ateş alevi", "stickers", ["Alev", "Trend", "flame"]),
  image("camera", "Seyahat kamerası", "stickers", ["Fotoğrafçılık", "Seyahat", "camera"]),
  image("headphones", "Taşınabilir kulaklık", "stickers", ["Müzik", "Dinleme", "headphones"]),
  image("microphone", "Podcast mikrofonu", "stickers", ["Kayıt", "Röportaj", "microphone"]),
  image("coffee", "Kahve zamanı", "stickers", ["Yaşam", "İçecek", "coffee"]),
  image("paw", "Sevimli pati izi", "stickers", ["Hayvan", "Evcil hayvan", "paw"]),
  image("medal", "Başarı madalyası", "stickers", ["Ödül", "Başarı", "medal"]),
  image("clock", "Zamanlayıcı", "stickers", ["Saat", "Geri sayım", "clock"]),
  image("bg-aurora", "Kutup ışığı gecesi", "backgrounds", ["Kutup ışığı", "Gece manzarası", "aurora"]),
  image("bg-ocean", "Deniz mavisi dalgalar", "backgrounds", ["Okyanus", "Mavi", "ocean"]),
  image("bg-lavender", "Lavanta ışıması", "backgrounds", ["Mor", "Rüya gibi", "lavender"]),
  image("bg-peach", "Şeftali geometri", "backgrounds", ["Pembe", "Geometri", "peach"]),
  image("bg-sand", "Çöl kumulları", "backgrounds", ["Çöl", "Doğa", "sand"]),
  image("bg-dots", "Krem puantiyeli", "backgrounds", ["Puantiye", "Sevimli", "dots"]),
  image("bg-blueprint", "Mühendislik planı", "backgrounds", ["Plan", "Teknoloji", "blueprint"]),
  image("bg-comic", "Çizgi roman ışınları", "backgrounds", ["Çizgi roman", "Vurgu", "comic"]),
  image("title-pill", "Yuvarlak köşeli isim etiketi", "titles", ["Kişi", "Yuvarlak köşe", "pill"]),
  image("title-news", "Haber çift şerit", "titles", ["Haber", "Haberler", "news"]),
  image("title-split", "İki renkli bölüm kartı", "titles", ["Bölüm", "Bölünmüş ekran", "split"]),
  image("title-subtitle", "Yumuşak koyu altyazı zemini", "titles", ["Altyazı", "Degrade", "subtitle"]),
  image("title-tape", "Not kâğıdı bandı", "titles", ["Günlük", "Bant", "tape"]),
  image("title-chapter", "Minimal bölüm çizgisi", "titles", ["Bölüm", "Minimal", "chapter"]),
  sound("sound-shutter", "Elektronik deklanşör", 0.22, ["Fotoğrafçılık", "Deklanşör", "shutter"]),
  sound("sound-impact", "Düşük frekans vurgusu", 0.5, ["Davul vuruşu", "Vurgu", "impact"]),
  sound("sound-twinkle", "Yıldız bildirimi", 1.5, ["Bildirim", "Yıldız ışığı", "twinkle"]),
  sound("sound-fall", "Aşağı kaydırma sesi", 0.65, ["Düşüş", "Geçiş", "fall"]),
];
export const BUILTIN_CATEGORIES: { id: BuiltinAssetCategory; name: string }[] = [
  { id: "stickers", name: "Çıkartma" }, { id: "backgrounds", name: "Arka plan" },
  { id: "titles", name: "Başlık zemini" }, { id: "sounds", name: "Ses efekti" },
];
export function findBuiltinAsset(id: string): BuiltinAsset | undefined {
  return BUILTIN_ASSETS.find((asset) => asset.id === id);
}
export function filterBuiltinAssets(category: BuiltinAssetCategory | "all", query: string): BuiltinAsset[] {
  const text = query.trim().toLocaleLowerCase();
  return BUILTIN_ASSETS.filter((asset) => (category === "all" || asset.category === category) &&
    `${asset.name} ${asset.tags.join(" ")}`.toLocaleLowerCase().includes(text));
}
export function builtinAssetUrl(asset: BuiltinAsset): string {
  return `${import.meta.env.BASE_URL}builtin-assets/${asset.fileName}`;
}
