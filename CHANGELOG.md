# Değişiklik günlüğü

## 0.12.0 - 2026-11-14

Proje medyasında serbest seçim.

- **Karta tıklamak artık seçer, önizleme açmaz**: Önceden bir medya kartına tıklamak sol paneli kaynak önizlemesine çeviriyordu; bu yüzden ikinci bir öğe seçilemiyordu. Artık tıklama yalnızca seçim yapar ve kitaplık görünür kalır.
- **Ctrl/⌘ + tıklama** seçime öğe ekler veya seçili öğeyi çıkarır; **Shift + tıklama** aralık seçer. Seçili kartlar yeşil çerçeveyle işaretlenir.
- **Tümünü seç / Seçimi temizle** düğmesi kitaplık başlığına eklendi.
- **Kaynak önizlemesi ayrı düğmede**: Her kartın üzerinde göz simgeli bir önizleme düğmesi var; Space tuşu ve sağ tık menüsündeki "Medyayı önizle" de aynı işi yapar. Böylece seçim ile önizleme birbirini engellemez.
- **Toplu ekleme korunuyor**: Birden çok öğe seçiliyken "+ N medyayı ekle" düğmesi görünür; medya türüne göre doğru kanala yerleşir.
- **Doğrulama**: Yeni `tests/media-select-electron.ts` 8 gerçek masaüstü kontrolü (tıklayarak seçim, Ctrl ile ekleme/çıkarma, Shift aralığı, ayrı önizleme düğmesi, tümünü seç, toplu ekleme, seçim temizleme) geçti. Tam paket: 477 test (471 geçti, 6 atlandı), 9 masaüstü regresyon betiği.

## 0.11.0 - 2026-11-13

Sürükle-bırakta otomatik kanal yönlendirmesi.

- **Kanala nişan almanız gerekmiyor**: Proje medyasından bir video sürükleyip ses kanalının üzerine bıraksanız bile klip doğru yere, yani bir video kanalına yerleşir. Ses dosyası video kanalına bırakılırsa ses kanalına gider, görseller video kanalına yerleşir.
- **Yönlendirme kuralı**: İmlecin bulunduğu kanal yalnızca bir ipucudur. Kanal türü uyuyorsa oraya, uymuyorsa dikey olarak en yakın uygun ve kilitli olmayan kanala bırakılır. Hiç uygun kanal yoksa uygulama yenisini oluşturur.
- **Karışık seçim tek bırakmada dağılır**: Birden çok medya seçip tek bir kanala bıraktığınızda ses dosyaları ses kanalına, video ve görseller video kanalına ayrı ayrı yerleşir; her kanal kendi zaman imlecini ilerletir, böylece parçalar üst üste binmez.
- **Boş alana bırakma**: Kanalların altındaki boş alana bırakma da çalışır; medya yine uygun kanala yerleşir.
- **Bırakma önizlemesi doğru kanalı gösterir**: Sürüklerken vurgulanan kanal, öğenin gerçekten yerleşeceği kanaldır — yanlış kanalda bıraktığınızda "hiçbir şey olmadı" hissi kalmaz.
- **Yerleşik malzeme**: Çıkartma, arka plan ve ses efektleri içe aktarıldıktan sonra türlerine göre yönlendirilir.
- **Doğrulama**: `tests/timelineDrop.test.ts` 7 birim testi (yönlendirme tablosu, yakın kanal seçimi, kilitli kanal atlama, karışık gruplama) ve `tests/drop-routing-electron.ts` 4 gerçek masaüstü kontrolü (video→ses kanalı, ses→video kanalı, boş alana bırakma, karışık toplu bırakma) geçti. Tam paket: 477 test (471 geçti, 6 atlandı), 9 masaüstü regresyon betiği.

## 0.10.0 - 2026-11-13

Düzenleme etkileşimleri: önizlemede ölçekleme, toplu medya ekleme ve kütüphaneden sürükle-bırak.

- **Oynatıcıdan ölçekleme**: Seçili görüntü veya metin klibi önizlemede ince bir çerçeveyle gösterilir. Dört köşe tutamacından biri sürüklenerek klip büyütülüp küçültülür; tutamaç odaklanıp ok tuşlarıyla da %5 adımlarla ayarlanabilir. Ölçek yüzdesi çerçevenin üstünde görünür ve değişiklik anahtar karelerdeki ölçek değerlerine orantılı uygulanır; tek geri alma ile döner.
- **Toplu medya seçimi ve ekleme**: Proje medyasında Ctrl/⌘ + tıklama tek tek seçer, Shift + tıklama aralık seçer. Seçim varken üstte "N medyayı ekle" düğmesi çıkar; tümü oynatma konumundan başlayarak arka arkaya zaman çizelgesine eklenir. Seçili öğeleri sürüklemek de tüm seçimi birlikte taşır.
- **Cetvelden sürükleyerek ölçekleme**: Zaman cetvelinde sol tuşla sağa sürüklemek zaman ölçeğini genişletir, sola sürüklemek daraltır (imlecin altındaki an sabit kalır). Cetvele sadece tıklamak eskisi gibi oynatma konumunu değiştirir.
- **Kare ekleme düğmesi**: Medya kartındaki `+` düğmesi artık yamuk daire değil, 23×23 px kare (5 px köşe yarıçapı) olarak çizilir; liste görünümünde de aynı.
- **Geçiş, efekt, hareket ve metin şablonlarını sürükle-bırak**: Geçiş kitaplığındaki kart bir klibin üzerine bırakıldığında geçiş o klibe (varsa bitişiğindeki klibe) uygulanır; renk efektleri ve hareket ön ayarları bırakılan klibi düzenler; metin şablonu bırakılan anda yeni metin klibi oluşturur. Sürükleme sırasında hedef klip vurgulanır.
- **Yerleşik malzeme sürükle-bırak**: Çıkartma, arka plan ve ses efekti kartları doğrudan zaman çizelgesine sürüklenebilir; medya içe aktarılır ve bırakılan noktaya yerleştirilir.
- **Doğrulama**: 470 birim testi (464 geçti, 6 atlandı), 9 masaüstü regresyon betiği ve yeni `tests/interactions-electron.ts` (9 kontrol: önizleme ölçekleme, ok tuşu ölçekleme, geçiş/efekt/metin bırakma, toplu ekleme, kare düğme, cetvel sürükleme ve cetvele tıklayarak konumlanma) geçti.

## 0.9.0 - 2026-11-13

Medya içe aktarma ve sürükle-bırak düzeltmeleri.

- **"ffprobe bulunamadı" hatası giderildi**: Kurulum paketi artık FFmpeg 8.0 ve FFprobe'u kendi içinde taşıyor (`resources/media-tools`). Araç keşfi sırayla gömülü dizinlere, `CEVIKEDIT_FFMPEG`/`CEVIKEDIT_FFPROBE` ayarına, `PATH`'e ve bilinen kurulum konumlarına bakar. Windows'ta WinGet paketleri, WinGet Links, Chocolatey, Scoop ve `C:\ffmpeg\bin`; Linux/macOS'ta Homebrew, `/usr/local/bin`, `/usr/bin`, `/snap/bin` otomatik bulunur. Arayüzden başlatılan uygulamalar geliştirici kabuğunun `PATH`'ini devralmadığı için bu konum taraması zorunluydu.
- **Bozuk paket artık uygulamayı kilitlemiyor**: Gömülü araç eksikse çalışan bir sistem FFmpeg'ine düşülür; daha önce bu durumda hiçbir medya içe aktarılamıyordu.
- **Sürükle-bırak sağlamlaştırıldı**: Dosya yolu taşımayan bırakmalar (tarayıcıdan, arşivden veya kısıtlı kabuktan gelen dosyalar) için bayt tabanlı içe aktarma eklendi; dosyalar profil klasörüne içerik adresli olarak kopyalanır, özgün dosya adı korunur. Sürükleme sırasında pencere üzerinde "Medyayı bırakın" katmanı görünür.
- **Medya kitaplığına bırakma** da aynı yolu kullanır; böylece pencere geneline bırakma ile kitaplık üzerine bırakma aynı davranır.
- **Doğrulama**: 470 test (464 geçti, 6 atlandı), 9 masaüstü regresyon betiği, boş `PATH` altında gerçek sürükle-bırak + 1920×1080 H.264/AAC render testi ve paketlenmiş uygulama kontrolleri geçti.

## 0.8.0 - 2026-11-12

Ürün adı **CevikEdit** olarak sabitlendi; ilk herkese açık sürüm.

- **Yeniden markalama**: uygulama kimliği `org.cevikedit.editor`, proje uzantısı `.cevikedit`, medya şeması `cevikedit-media`, ortam değişkenleri `CEVIKEDIT_*`. Yeni uygulama ikonu (1024×1024 kaynaktan PNG/ICO/ICNS) üretilip pakete işlendi.
- **Tek tıkla kurulum**: ~200 KB'lık bağımlılıksız `CevikEdit-Kurucu.exe`, GitHub'daki en son sürümü bulur, kullanıcı onayıyla indirir ve kurulumu başlatır. Hiçbir şey tıklama olmadan indirilmez ya da kurulmaz; arka planda otomatik güncelleme yoktur.
- **Uygulama içi güncelleme merkezi**: yalnızca "Güncellemeleri denetle" düğmesine basıldığında `api.github.com` sürüm akışını okur; yeni sürüm varsa sürüm notlarını gösterir ve indirmeyi kullanıcı başlatır. Telemetri, bulut yükleme ya da hesap yok.
- **Tam Türkçe kaynak**: çalışma zamanı çeviri katmanı (`src/i18n/`, `electron/locale.ts`, `scripts/i18n-audit.ts`, `CEVIKEDIT_LOCALE`) kaldırıldı; 1.956 dizgi doğrudan Türkçe yazıldı ve ~60 el düzeltmesi yapıldı. `tests/turkish-source.test.ts`, `src` / `electron` / `plugin` / `site` altında CJK karakteri, `src/i18n` dizini ve yabancı dilli yerleşik malzeme adı bulunmadığını denetler.
- **Belgeler ve yerleşik malzeme**: README, `docs/` altındaki tüm kılavuzlar, 64 yerleşik malzemenin ad ve etiketleri ile eklenti arayüzü Türkçeye çevrildi; `docs/VALIDATION.md` tarihsel Çince kayıttan Türkçeye yeniden yazıldı.
- **Tanıtım sitesi**: GitHub Pages üzerinde yayınlanan sayfa (`https://sonosmanli55.github.io/CevikEdit/`) koyu zümrüt/altın palet, Bézier sürükleme demosu, kaydırmayla beliren bölümler ve azaltılmış hareket / saydamlık varyantları içerir.
- **Doğrulama**: 49 dosyada **462 test geçti, 6 atlandı, 0 başarısız**; `npm run typecheck` ve `npm run build` temiz; paketlenmiş Windows uygulaması 5 kontrolle doğrulandı (sürüm, yalnızca Türkçe sekmeler, şablonla proje, kaydetme, 1920×1080 H.264 dışa aktarma).

## 0.6.1 - 2026-11-11

Bir önceki turda sıralanan eksikler tamamlandı:

- **Serbest Bézier esnetimi**: anahtar kareler "Özel Bézier" ile değiştirilebilir, iki kontrol noktası sürüklenebilir ya da X1/Y1/X2/Y2 girilebilir; Y geri çekme ve aşırı geçişe izin verir, ön izleme kesin çözüm, dışa aktarma 24 parçaya bölünmüş çizgi yaklaşımı kullanır (hata, animasyon çığlığının 1%'inden az).
- **Zaman çizelgesi esnekliği ve mini harita**: orta / Alt ile kaydırma serbest bırakılınca kare hızına duyarlı azalan kayış; mini harita tüm parçaları, görünen pencereyi ve oynatma başını gösterir, tıklama ile atlar, araç çubuğundaki "Harita" aç / kapat.
- **Çevrimdışı konuşma algılama ile müzik baskılama**: "Konuşma aralıklarını algıla" makinede parçayı çözüp gerçek konuşma aralığını algılar, yalnızca bu aralıklar baskı yapılır; algılama başarısızsa açık uyarı verilir, bütün parça bilinçsizce baskılanmaz.
- **4K ve büyük proje sınırlandırması**: parça 240'tan fazlaysa zaman çizelgesi yalnızca görünen parçaları çizer; dışa aktarma diyaloğu çerçeve sayısı, en yüksek bellek tahmini, 4K ve kapasite uyarıları gösterir, bellek bütçesini aşarsa başlatmayı reddeder.
- **HDR ve renk yönetimi**: içe aktarım PQ/HLG tanır ve HDR rozetini gösterir, dışa aktarım otomatik olarak SDR BT.709'e ton eşleme yapar ve bt709 işaretini yazar; şu an HDR dışa aktarma üretmez.
- **Taslak değişim dışa aktarma**: "Taslak değişim dosyasını dışa aktar (JSON)" açık metin taslak değişim dosyası yazar (mikrosaniye zaman aralığı + tam proje), CevikEdit tarafından yeniden içe aktarılabilir. **ClipCut şifreli taslak yazma yapılmaz**: bu biçim üçüncü taraf özelidir, bu proje yetki kapsamının dışındadır, arayüz açıkça ClipCut'un doğrudan açamayacağını belirtir.
- **Düzeltme**: Türkçe kapsama denetim betiği bağımsız sözdizimi taraması ekledi, önce atlanan ifadeleri kapsadı.
- **Derleme**: Windows x64 NSIS adayı **CevikEdit Setup 0.6.1.exe** olarak yükseltildi ve paketlenmiş çalıştırılabilir dosyayla şablon, kaydetme ve dışa aktarma doğrulandı.

## 0.6.0 - 2026-11-08

Bu hafta (10/20–10/26) teslim edilen yetenekler ve sonraki regresyon düzeltmeleri ile paket:

- **Yeniden kullanılabilir şablonlar**: "Şablon" sayfası mevcut projeyi şablona kaydeder (medya yerleştirmesine çevrilir, kullanılmayan malzama ve önbellek atılır, kapak otomatik), şablondan yeni üretirken kanalları / parçaları / anahtar kare ID'lerini yeniden üretir, tek seferde tüm medya ve metin değiştirilebilir; kısa malzama kare basmasıyla kısılır ve anahtar kare / fade kırpar, opsiyonel yerleştirme eksikse uyarı verir. `.cevikedit-template` içe / dışa aktarma desteklenir, içe aktarmadan önce yerel yol / çarpanlı yerleştirme / tip uyumsuzluğu / tekrarlı anahtar / sınır reddedilir. Üç özgün yerleşik şablon: Açılış kartı, Dikey sosyal video, Altyazı bloğu.
- **Zaman çizelgesi**: kaynak aralığın "Son uca ekle / Ekle ve sonları kaydır / Geçerli konuma yaz" giriş yolları, her biri tek geri alınabilir; ayrıştırma ses ve video `linkId`'yi paylaşır, senkron taşıma / kırpma / bölme / silme / kopyala / yapıştırma; bağlantıyı kesme; 2–1600 px/s özgür ölçeklendirme, fare sabitli Ctrl/⌘+tekerlek, Shift+tekerlek ve orta tuş kaydırma, uyarlama ve oynatma başı konumlandırma, görünen süre okuma.
- **Altyazı**: oynatma başına bölme, komşu birleştirme, doğrudan düzenlenebilir toplu stil, tek tip "giriş / kalıcılık / çıkış" metin animasyonu; bölme / birleştirme, stil ve animasyon tek geri alınır, SRT dışa aktarımı stil / konum / animasyon içermediğini açıklar.
- **Ses**: yerel `loudnorm` gürültü ölçümü ve hedef LUFS normalizasyonu (−1 dBTP en yüksek), ses aralıkları içinde otomatik müzik baskılama zarfı; önizleme ve dışa aktarma aynı değerlendirme yolunu kullanır.
- **Arayüz dili**: uygulama yalnızca Türkçe sunar; ana süreç 181 hata ve çalışma zamanı birleşik mesajı yerel, asistan isteği ve yanıtı Türkçe, taşınabilir paket `proje.cevikedit` / `KULLANIM.txt`.
- **Düzeltme**: Windows'ta seçili CLI betiği için shebang ile başlatma (yorumlayıcı, shell yok); yalnızca macOS'a özgü test varsayımlarının düzeltilmesi (PATH ayraçları, JSON kaçışı, sembolik bağlantı, 8.3 kısa yol), tüm testler ilk kez tam yeşil.
- **Teslim**: 30 saniyelik 1280×720 demo video ve proje, şablon (`docs/media/`); Windows x64 NSIS adayı `CevikEdit Setup 0.6.0.exe`. macOS DMG / ZIP yeniden derlenmedi (macOS ortamı yok).

## 0.5.1 — Eklenti gerektiğiyle başlatma

- Eklenti bağlantısı, araç keşfi ve UI kaynak okuma artık Electron başlatmaz; ilk gerçek araç çağrısı tek editör örneğini başlatır; hata durumunda otomatik döngü başlatma yok.
- macOS arka plan uygulamasının Dock simgesini yükleme aşamasında gizler; doğrudan masaüstü sürümünde normal pencere ve Dock davranışını geri getirir.
- Başlatıcı yaşam döngüsü, uygulama yok keşfi, kaynak doğrulama ve paketlenmiş masaüstü Dock regresyon testleri eklendi.

## 0.5.0 — Codex eklenti

- Yerel stdio MCP eklenti eklendi; Codex sağ çubuğunda ve gerçek CevikEdit düzenleyicisinde çalışır.
- Proje okuma, özgün malzama, içe aktarma, sürüm doğrulama ile atomik düzenleme, oynatma konumlandırma, geri alma / yeniden kullanma ve ekran görüntüsü aracı eklendi.
- Eklenti ve masaüstü sürüm ayrı kurtarma dizinleri kullanır; orijinal medya yetkilendirmesi ve render izolasyonu korunur.
- macOS arka plan eklentisinin Dock simgesini de düzeltti; yalnızca aktif masaüstü pencere açıkken gösterilir, kapandıktan sonra arka planda kalır.
- portable / Codex uyumlu manifest, işlem skill'i, kurulum betiği ve eklenti ZIP derlemesi eklendi.
- README artık DMG ve Codex eklenti iki giriş noktasını, yan çubuk gerçek zamanlı görüntüsünün sınırını açıklar.

## 0.4.2 — 2026-10-13

- Tam kapsamlı yerel metin / etki / geçiş malzama girişi eklendi: 16 düzenlenebilir metin şablonu, 8 anahtar kare animasyonu, 8 geçiş; mevcut 8 renk / hareket ön ayarı artık gerçek görüntü ön izlemesi.
- Sıralama, arama, hover / klavye odağı ile dinamik ön izleme, tek uygulama ve geri alma; geçişler kare bazında süre sınırı, komşu parça, kilitli kanal ve sonraki çakışma koruması.
- Tüm ön ayarlar MIT lisanslı bağımsız parametre formüllerinden üretilir, yerleşik özgün grafikler ve OFL yazı tiplerini kullanır, üçüncü taraf şablon indirmez.
- FFmpeg dinamik ölçekleme girdi boyutuna döndüğünde dışa aktarmayı başarısız edebileceği sorunu düzeltti, tüm animasyon ve geçişlerin gerçek piksel render regresyonunu ekledi.

## 0.4.1 — 2026-10-13

- Yerel malzama 34'ten 64'e genişti: 12 sticker, 8 arka plan, 6 şeffaf başlık tabanı ve 4 sentetik ses efekti eklendi.
- Tüm yeni malzama yerel SVG / PCM ile üretildi, MIT lisansı, kaynak dosya ve SHA-256 listesi eklendi.
- Malzama kaynakları ve lisans açıklamaları eklendi, proje malzama paketi, kullanıcı içe aktarılan medya ve yazı tipi lisansları ayrıldı.
- Üretici malzama betiği tam ve yeni malzama ön izlemelerini üretir.

## 0.4.0 — 2026-10-13

- Sol çapraz şerit ikonuna güncelleme, uygulama ve kurulum paketlerinin ikonu; orta koyu gri üç sütunlu düzenleyici, kaynak sırası ve özellik grupları, küçük pencere yerleşimi.
- Üç sütun genişliği sürüklenebilir / klavye ile ayarlanabilir, başlangıçta hatırlama, çift tıklama varsayılana dönüş, pencere küçültülürken oynatıcı ve özellik alanı korunur.
- Kaynak malzama tıklaması ön izleme, video / ses kare başına ve I/O seçimiyle ekleme; çift tıklama hâlâ tüm malzemeyi ekler.
- Altyazı listesi cümle başına konumlandırma ve düzenleme, toplu zaman kaydırması / değiştirme, tek tip stil; ön izleme, kilitli kanal koruması ve tek geri alma.
- Proje toplama ve orijinal malzama taşınabilir klasöre dönüştürüldü; kaldırma, göreli yol, iptal temizleme, taşıma yeniden açma ve devam eden kaydetme. Paket içi malzama kaybı ve dışarıdan kopyalanan kaynak kopması sonrası kaydetme düzeltildi.
- Tamam, seçili parça kaplama aralığı ve özel aralık dışa aktarma, aralıktaki çok kanal görüntü ve ses korunur.
- Kurulum paketi yerel medya araçlarını içermeye devam eder; bulut / SaaS / API AI boş bırakılmadı.

## 0.3.0

- Özgün açık yeşil / mercanlı çapraz şerit ikon.
- 34 özgün yerel malzama: şeffaf sticker, arka plan, başlık tabanı ve sentetik ses efekti, kaynak ve lisans ile; kategori, arama, deneyim ve ekleme.
- İsteğe bağlı Codex CLI / Claude Code kurgu asistanı: yerel proje diyaloğu, durum, iptal, tarih; sınırlı düzenleme önerileri adım adım doğrulandı, kullanıcı uyguladıktan sonra tek geri alınabilir; proje değişiminde eski öneri uygulanmadı.
- macOS DMG yerel FFmpeg / FFprobe derlemesini, yazı tipi ve lisans ile içermeye devam eder.
- ClipCut masasüstü asistanı REA + Ghidra araştırması tamamlandı, gözlem ve bağımsız uygulama ayrımı; özel servis ve kaynak kopyalanmadı.

## 0.2.1 — 2026-10-13

- macOS kurulum paketi yerel FFmpeg 9.0.2 / FFprobe ve x264 ile yerleşik, ek medya araç kurulumu gerekmez.
- Karşılık gelen kaynak, derleme betiği, kaynak parmak izi ve GPL lisansı eklendi; paket hook'ı otomatik derler ve sistem dışı dinamik bağımlılıkları kontrol eder.
- Özel araç ayarları korundu; yerleşik araç yoksa açık hata verilir, geliştirme makinesine sessiz geri dönüş yok.

## 0.2.0 — 2026-10-13

- Masaüstünde doğrulanmış yerel ClipCut opak taslak okunmaya başlandı, doğrulama sonrası bağımsız CevikEdit projesine dönüştürüldü. Açık JSON hâlâ desteklenir; orijinal proje değiştirilmez ya da ClipCut biçimine yazma yapılmaz.
- Proje klasörü içe aktarma ve açık zaman çizelgesi seçimi eklendi, geçerli zaman çizelgesi öncelikli önerildi, boş ana zaman çizelgesi yerine geçmedi. Kontrollü modern boş zaman çizelgesi yapısı ve orijinal tuval boyutu tahmini desteklendi.
- Kontrollü yerel dışa aktarma ile metin / video katmanları, varsayılan arka plan ve sabit hızlı alandan sonraki kırpma öncesi kayan resmi düzeltti; kayıp ek ayarlarının içe aktarım ipuçları toplandı.
- Sabit sentetik taşıyıcı, gerçek dosya okuma, kare başına medya ve masaüstü iş akışı doğrulamaları eklendi; orijinal çıkarım ve özel taslak kaynak kod ya da kurulum paketine dağıtılmadı.

Doğrulama, paket bilgileri ve bilinen sınırlar için [Doğrulama kaydı](docs/VALIDATION.md) bakın. Yazı tipi yerleşimi ve karmaşık etki hâlâ kayıplıdır; SaaS, bulut ve API AI boş bırakılmadı.

## 0.1.0

Bağımsız yerel düzenleyici ilk sürümü: medya içe aktarma, zaman çizelgesi düzenlemesi, çok kanal, metin / altyazı, temel ses-video dönüşümleri, kırpma / kesme / maske, anahtar kare / fade / katlama, yerel proje kaydı ve H.264 / AAC dışa aktarma. macOS arm64 gerçek masaüstü ve kurulum paketi doğrulandı; Windows / Linux derleme yapılandırması korundu, yerelde doğrulanmadı.
