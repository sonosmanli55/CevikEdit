# v0.4.0 tamamlama kaydı

2026-10-13. Mevcut yetkili arayüz ekran görüntüleri, mevcut özellik matrisi ve gerçek düzenleyici kabulü; günlük düzenleme yollarındaki farklılıklara öncelik verildi. Arayüz kodu, ikon ve malzama bu proje tarafından ayrı uygulandı; bu tur özel proje ya da üçüncü parti hizmetle çalışma izni olmadan çalışma.

| Tur başlangıç farklılığı | Tur teslim |
| --- | --- |
| Kaynak sırası ve özellik sınıflandırması farklı, görünüm araçları tek katman | Malzama/ses/metin/sticker/etki/geçiş/altyazı; görünüm/ses/speed/animasyon/düzenleme ana sınıfları; görünüm altı temel/kırpma/renk kadranı/maske |
| Panel katmanı ve seçim stili büyük farklı | Nötr koyu gri, cyan vurgu, ortak başlık yüksekliği, beyaz parça seçimi, kahverengi metin kanalı; kaydırıcı ve sayı senkron |
| Üç sütun genişliği sabit | Ayıraç sürüklenme, klavye mikro ayarı, ilk başlangıç hatırlaması, çift tıklama/Home kurtarma; küçük pencere en az geçerli genişliği korumalı |
| Malzama yalnızca doğrudan zaman çizelgesine konabilir | Kaynak ön izlemede tıklama, oynatma/çerçeve, I/O giriş/çıkış noktası, parça ekleme; çift tıklama tam parça ekleme |
| Altyazı çoğunlukla zaman çizelgesinde tek tek değiştiriliyordu | Altyazı listesi, arama, çoklu seçim, tek tek konum/düzenleme, toplu kaydırma/değişiklik/stil; kilit, eksik plan koruması ve bir geri al |
| Proje orijinal dosya mutlak yollarına bağımlıydı | Proje ve tüm orijinal malzemeleri topla, tekrarı kırp, göreli yol, taşınma yeniden açma, devam eden kaydetme; yeni içe aktarılanlar otomatik toplanır |
| Yalnızca tam film dışa aktarılabiliyordu | Tam film, seçili parça kaplama aralığı, özel aralık; bu bölgeki tüm görsel katmanları ve sesleri koru |

Bağımsız inceleme üç sorunu da düzeltti: paket içi malzama kaybında diğer düzenlemeler kaydedilemiyordu; yeni malzama paket içi kopyası var ama dış kaynak kopmuşken kaydedilemiyordu; Escape ya da native menü çalışma zamanı paketleme diyaloğunu değiştirebilirdi. Eksik malzama yine de yeniden bağlanmadan oynatılamaz/ dışa aktarılamaz, sahte kurtarma üretmiyordu.

## Gerçek doğrulama

- 22 test dosyası, 270 test geçti, 1 x265 sentez kodu eksikliğinden atlandı; tip kontrolü ve üretim build'i geçti.
- Mevcut yedi masaüstü iş akışı regresyonu geçti: düzenleme dışa aktarma, görsel araçlar, kaydetme kurtarma, oynatıcı, ses, kanal, üst üste bindirme ve taslak içe aktarma.
- Son DMG salt mount edilip kopyalanan uygulama, yedi masaüstü kabul seti; toplam **45 kontrol** geçti: temel paket 7, malzama/CLI sentetik protokol 12, altyazı düzenleme 8, malzama paketi/aralık 6, kaynak malzama ön izleme 4, üç sütun yerleşimi 5, 300 cümle altyazı projesi 3.
- Tüm paket setleri boş `PATH` ve izole kullanıcı dizininde; dışa aktarma paket içi FFmpeg/FFprobe ile; temel set gerçek 1280×720, 9 sn Çinli başlık + karıştırılmış sesli dışa aktarma; kaynak ön izleme ve aralık ayrı ayrı bir sn mavi kaynak görseli ve duyulabilir ses dışa aktardı. Malzama paketi taşındı ve orijinallar kullanılamaz kaldı, yine ön izleme/satın/alabiliyor; eksik paket içi kullanılmayan malzama ile bile kaydetme düzenlemeleri geçti.
- 15 dakika, 300 cümle sentetik altyazı projesi arama konumu, toplu kaydırma/kaydetme ve bir geri al geçirdi; tek seferlik otomasyon süresi: başlangıçtan zaman çizelgesine 542ms, arama 46ms, kontrol/uygula/kaydet 230ms, geri al/kaydet 150ms; otomasyon etkileşimi dahil.
- DMG doğrulaması, ZIP bütünlüğü, sıkı ad-hoc imza ve imge/ dış içi ASAR parmak iz tutarlılığı geçti; parmak izleri için [doğrulama kaydı](VALIDATION.md).

## Hâlâ var olan farklılıklar

Arayüz ve yaygın iş akışları yaklaşılsa da, Jianying'ın tam işlevi ya da piksel başına birebir eşleşmesi hedeflenmiyordu. Çok zaman çizelgesi düzenleme, eğri hız değiştirme, ters çevirme, profesyonel renk yönetimi, tam animasyon/geçiş kütüphanesi hâlâ uygulanmadı. Altyazı konuşma tanıması yok; karmaşık WebVTT stilleri tam olarak korunmadı.

Malzama paketi sistem yazı tiplerini toplamıyor, ilk SHA-256 listesi kaydedildikten sonra güncellenmiyordu. Aralık dışa aktarma orijinal zaman çizelgesi sentez anlamını korur, uzun zaman çizelgesi son parça dışa aktarma performansı daha da iyileştirilmeyi gerektiriyordu. 300 cümle altyazı doğrulaması çoklu yüksek çözünürlüklü video, uzun düzenleme ya da ani kesinti kapsamında değildi.

Jianying taslağı hâlâ kapsamı doğrulanmış biçimde zararlı salt okunur içe aktarma. Windows/Linux, Developer ID imzası, noter ve GitHub CI bu tur doğrulaması kapsamında değildi; SaaS, bulut senkronizasyon, hesap ve doğrudan API AI hâlâ boş tutuldu. Git'e commit etme, push etme ya da yayınlama yapılmadı.

Bu tur yeni masaüstü seti GitHub Actions'ın macOS işinde eklendi, yapılandırma yalnızca yerelde güncellendi; uzakt CI tetiklenmedi.
