# Orijinal yerel malzama

Bu üç tür parametrik şablon (metin, renk / animasyon, geçiş) ayrıca [Yaratıcı malzama kütüphanesi](CREATIVE_LIBRARY.md) içinde; aşağıdaki 64 adet görüntü / ses dosyasına dahil değildir.

Yerel malzama kitaplığı 64 kaynak dosyayı içerir, bu kaynaklar bu proje tarafından çizildi ya da sentetik olarak üretildi; indirme, giriş ya da AI API gerektirmez:

| Kategori | Adet | Biçim ve kullanım |
| --- | --- | --- |
| Sticker | 28 | 512 × 512 saydam PNG; yıldız ışığı, ok, kalp, balon, film grafikleri |
| Arka plan | 14 | 1920 × 1080 opak PNG; geçiş, ızgara, soyut desen |
| Başlık tabanı | 12 | 1920 × 1080 saydam PNG; alttan üçte, sınır, rozet; ek metin düzenlenebilir |
| Kısa ses efekti | 10 | 48 kHz / 16-bit mono PCM WAV; tıklama, slide, ipucu, hava sesi |

![Orijinal malzama iletişim tablosu](screenshots/original-assets-contact.png)

Bu malzemeler SVG geometri ve deterministik ses sentezi ile üretildi; üçüncü parti video, fotoğraf, ses kaydı ya da başka uygulama malzemesi alınmadı. SVG kaynak dosyaları ve PNG aynı `public/builtin-assets/` altında; uygulama PNG kullanır, farklı medya motoru SVG desteği farklarını önler. Saydam sticker ve başlık tabanı gerçek alpha kanalını korur; kare dolgu yalnızca önizleme arayüzüdür.

Malzama proje MIT lisansını takip eder, tam lisans metni içerir, kişisel ve ticari video için kullanılabilir. `manifest.json` her dosyanın boyutunu, kullanımını, kaynağını ve SHA-256'i kaydeder; üretim yöntemi `original-programmatic` olarak sınıflandırılır, insan üretimli fotoğraf ya da AI görseli iddiası değildir. Ses sentetik kısa efekt, müzik kütüphanesi değildir.

Bu malzemeler “telifsiz” ya da kamu alanı (CC0) değildir. MIT bir kullanım lisansıdır; malzama dosyaları, SVG kaynak ya da malzama paketi yeniden dağıtılırken telif ve lisans bildirimi korunmalıdır; tam maddeler `public/builtin-assets/LICENSE.txt` içinde. Kullanıcının içe aktardığı video, fotoğraf, ses kaydı ve demo'da kullanılan üçüncü parti video bu malzama paketinin bir parçası değildir, ona MIT lisansı da verilmez. Noto Sans SC yazı tipi ayrı olarak SIL OFL 1.1 ile lisanslıdır.

## v0.4.1'te 30 yeni malzama

- 12 sticker: şimşek, bulut, ay yolculuğu, yeşil yaprak, alev, kamera, kulaklık, mikrofon, kahve, evcil hayvan izi, madalya, saat.
- 8 arka plan: aurora, dalga, lavanta ışığı, porta pembesi geometri, sahara, nokta, mavi harita, manga radyosu.
- 6 başlık tabanı: köşeli isim plaketi, haber çift tabanlı halka, çift renkli bölüm kartı, yumuşak altyazı tabanı, not defteri bantı, minimal bölüm çizgisi.
- 4 kısa ses efekti: elektronik obstrüktör, alçak frekans vurgu, yıldız ipucu, aşağı kayma slide.

![Yeni 30 malzama](screenshots/new-assets-contact.png)

Eski malzama kimlikleri, dosya adları ve üretim kuralları sabit kaldı; mevcut projeler eski malzemeye referans vermaya devam eder. Yeni malzemeler de SVG kaynak ya da ses sentez formülü ve liste parmak izi ile birlikte kaldı.

Malzama yeniden üretildi:

```sh
npx tsx scripts/generate-assets.ts
npx vitest run tests/builtinAssets.test.ts
```

İkonlar kullanıcının belirttiği Jianying karşıt yönüne göre vektörel geometri yeniden çizildi: çapraz bant uç noktası sola, mint camgöbeği gradyanı ile koyu grafit köşeli taban, köşe kısa çizgi geçişiyle. Kaynak `public/icons/cevikedit.svg` dosyası, bağımsız koordinat yollarıyla üretildi, üçüncü parti ikon biti gömülü değil; görsel yön izni başka bir şey anlamına gelmez. Yeniden üretim `npm run icons` ile yapıldı, macOS ICNS, Windows ICO, Linux PNG ve arayüz ikonu `public/icons/cevikedit.png` üretildi.

Malzama kaynakları Vite genel dosyaları olarak kopyalanır build'e girer. Masaüstünde ekleme yalnızca sabit liste içi ID'leri kabul eder, ana süreç yerel kurulum kaynaklarını çözer ve normal medya akışına girer; proje kaydı ve dışa aktarma normal yetkilendirmeli yerel malzama yollarını kullanmaya devam eder.
