# Masaüstü düzenleyici tutarlılığı

Tarih: 2026-10-13, Asia/Shanghai. Hedef: tanıdık Jianying masaüstü sürümünün kullanıcıları için temel alan ve işlem sınıflarına uyum; piksel bazlı kopyalama ya da tam işlev eşleşmesi ilan edilmez. CevikEdit orijinal ikon, marka ve malzama kullanır, arayüz bu proje tarafından bağımsız olarak uygulanır.

## Referans ve fark analizi

Referans, yetkili gözlemdeki boş düzenleyici ile kendinden üretilen medya dönüşümü ekranlarından gelir: yerel Jianying `11.0.12922` / derleme `11.1.0-beta3`. Özel kanıt yolu `.research/evidence/rea-native-ui-editor.png`, `.research/round2/variation/transform-final.png`; bu tur arayüzünde özel projelere ya da hesaba dayalı okumalara izin verilmedi, üçüncü parti uygulama tekrar çalıştırılmadı.

Ekranlarda doğrudan görülenler: malzama kategorileri sola, oynatıcı ortada, özellikler sağda; zaman çizelgesi alt boyutta; proje adı başlık çubuğunda merkezdir, dışa aktarma sağdadır; yüzey nötr koyu gri katmanlı, cyan mevcut kategori ve işlem için kullanılır; kaynak ikonları yazı ile birlikte; görüntü özellikleri birincil ve temel / renk kadranı / maske gibi ikincil kategoriler; ölçek kaydırıcı ve sayısal giriş; seçili zaman çizelgesi parçası açık renk sınırı, metin kanalı kahverengi / kırmızı. Bunlar ekran gözlemünden okunur, görülmemiş etkileşimler çıkarılamaz.

| Fark | Bu tur bağımsız uygulama | Hâlâ farklı |
| --- | --- | --- |
| Orijinal mavi-gri panel, zayıf katman | Nötr koyu gri, ortak 52px panel başlığı, 44px uygulama başlık çubuğu, cyan vurgu | Özel tema renkleri ve piksel koordinatları hedeflenmez |
| Üst kaynak kategori sırası | Malzama, ses, metin, sticker, etki, geçiş, altyazı | Bulut malzama, üyelik girişi, akıllı paketleme, ticari şablon kopyanmadı |
| Yerel malzama türü yatay | Geniş malzama panelinde sol kategori çubuğu, arama ve medya kartı sağda; dar panel yatay tutuldu | Kategori gerçek yerel medya türünü temsil eder, hayal edilmiş kaynak servisi üretilmedi |
| Görüntü araçları tek seviyede yatay kaydırma | Görüntü / ses / değiştirme oranı / animasyon / ayar ana kategorileri; görüntü altı temel / kırpma / renk kadranı / maske | Metin ve ses kategorileri gerçek destek kapasitesine göre; boş AI güzelleştirme gibi işlev gösterilmez |
| Tek sütun konum ve saf sayısal ölçek | Kaydırıcı ve sayı salgısal senkron; geniş panel X/Y yan yana, dar panel geri tek sütun; kritik kare kareli | Şu an orantılı ölçek, bağımsız X/Y oranı ya da görüntü köşesi yok |
| Zaman çizelgesi rengi ve seçim | Nötr kanal arka planı, beyaz seçim sınırı, kahverengi metin kanalı, daha sıkı araç çubuğu | Kanal yüksekliği ve kurgu modeli CevikEdit'e; çok zaman çizelgesi etiketleri, kapak kanalı henüz yok |
| Doğrudan malzama ekleme, kaynak seçim akışı yok | Kaynak ön izlemede tıklama, I/O işaretleri sonrası ekleme; çift tıklama tam parça, zaman çizelgesine tıklama proje önizlemesine dönüş | Yeni davranış bağımsız tasarım ve kabul, saf kısayol eşleşmesi ilan edilmedi |
| Üç sütun sabit oran | Ayraç sürüklenme, klavye mikro ayar, başlangıçta hatırlama, çift tıklama / Home kurtarma; küçük pencere en az kullanılabilir genişliği | Varsayılan oran CevikEdit araç yoğunluğunu dengeler, kullanıcı tercihine izin verir |
| Küçük pencere asistan alt sınırı | 1024×720'de giriş ve gönder düğmesi görünür | Konuşma bölgesi alanı sınırlı, zaman çizelgesini düşürülerek yükseklik artırılabilir |

## Doğrulama kapsamı

- `npm run typecheck`, `npm run build` geçti.
- Kaynak ön izleme bileşeni React StrictMode'da 8 grup tarayıcı medya kontrolünden geçti; gerçek Electron App doğrulaması I/O ekleme, kaydedilen sourceIn/duration, tek geri alma, 1024×720 kontrol görünürlüğü, bir saniyelik mavi görüntü ve duyulabilen sesli dışa aktarma içerdi. Masaüstü testleri 1024px'i kapsamak için asıl kontrol minimum genişliğini düşürdü; normal uygulama minimum genişliği hâlâ 1060px.
- Gerçek tarayıcı render kontrolü: 1440×900 ve 1024×720; kendinden üretilen görüntü / metin projeleri; temel, renk kadranı, değiştirme oranı geçişi; ölçek ve konum değerlerini düzenle, proje durumu değişti; gerçek kaydırıcı ile ölçek kaydırıcı çoklu giriş üretti, tek geri alma yalnızca bir kayıt üretti, geri alma orijinali getirdi; renderer hataları yok.
- 1024×720 ana düzenleyici üç sütun genişliği 280 / 434 / 280px, sağ sınır 1016px, yatay taşma yok. Asistan açıkken oynatıcı 404px, asistan sağ sınırı hâlâ 1016px.
- Boş proje asistanı gönder düğümü alt sınırı 367px, panel alt sınırı 374px, düğüm görünür panel içinde. Geometri doğrulaması ve ekran görüntüleri `.test-output/ui-parity/` altında saklandı.
- `tests/visual-ui-electron.ts` geçti: gerçek masaüstü kırpma, renk kadranı, maske, kanal kilidi ve üç gerçek medya dışa aktarması; renderer hataları yok.
- `tests/app-electron.ts` geçti: gerçek içe aktarma, oynatma, bölme geri al, metin özellikleri, ayar, değiştirme oranı, kritik kare, altyazı içe aktarma, kaydetme yeniden açma ve 5 saniyelik video dışa aktarması; renderer hataları ya da medya hataları yok.

Bu kontroller bu tur sonrası CevikEdit arayüzü yerleşimini ve varsayılan düzenleme işlevlerini doğruladı; Jianying ile piksel / davranış eşleşmesi sertifika üretmez, Windows / Linux doğrulaması da değildir. Sayısal özellik değerleri, orijinal `aria-label` ve otomasyon konumlandırma uyumu korunur: “Hız” kontrolü için uyumluk erişilebilir ad “Hız” bırakılır, “Düzenle” kontrolü için uyumluk erişilebilir ad “Düzenle” bırakılır.
