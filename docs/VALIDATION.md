# Makine doğrulama kaydı

> Tarihsel kayıt notu: bu dosyadaki 2026-11-11 öncesi bölümler, o tarihte yürürlükte olan doğrulama adımlarını olduğu gibi aktarır. 0.7.0 ile çalışma zamanı çeviri katmanı (`src/i18n/`, `electron/locale.ts`, `scripts/i18n-audit.ts`) ve `CEVIKEDIT_LOCALE` anahtarı kaldırıldı; kayıtlarda geçen `npx tsx scripts/i18n-audit.ts` ve `i18n 0 eksik` ifadeleri bugünkü komut setine değil, geçmiş turlara aittir. Güncel kaynak denetimi `tests/turkish-source.test.ts` ile yapılır.

## 0.9.0: gömülü FFmpeg, medya aracı keşfi ve sürükle-bırak (2026-11-13)

**Bildirilen hata**: Windows kurulumunda bir video içe aktarılırken `ffprobe bulunamadı. Geliştirme ortamında FFmpeg kurun veya ayarlardan bir çalıştırılabilir dosya seçin.` uyarısı çıkıyordu.

**Kök neden**: Windows paketi hiç medya aracı taşımıyordu (`extraResources` yalnızca macOS için tanımlıydı) ve `setBundledMediaToolsDirectory` yalnızca `app.isPackaged && darwin` koşulunda çağrılıyordu. Arayüzden başlatılan bir uygulama geliştirici kabuğunun `PATH`'ini devralmadığı için WinGet/Chocolatey ile kurulmuş FFmpeg de görünmüyordu.

**Düzeltme**:
- `scripts/fetch-media-tools-win.mjs` sabitlenmiş Gyan.dev FFmpeg 8.0 `essentials_build` arşivini indirir (SHA-256 GitHub'ın yayınladığı `digest` ile doğrulanır), yalnızca `ffmpeg.exe` ve `ffprobe.exe` çıkarır ve `media-tools/win32-x64` altına manifest ile yazar. libx264 mevcut.
- `scripts/prepare-media-tools.cjs` Windows paketlemesinde bu adımı çalıştırır; `package.json` → `build.win.extraResources` araçları `resources/media-tools` içine kopyalar.
- `electron/mediaTools.ts` keşfi sırayla dener: kayıtlı ayar → gömülü klasörler (birden fazla) → `PATH` → bilinen konumlar. Windows'ta `%LOCALAPPDATA%\Microsoft\WinGet\Packages\*ffmpeg*` (sürüm alt klasörleri dahil), WinGet `Links`, Chocolatey, `C:\ffmpeg\bin`, Program Files, Scoop shims; macOS/Linux'ta Homebrew, `/usr/local/bin`, `/usr/bin`, `/snap/bin`, `~/.local/bin`.
- Gömülü araç bozuksa çalışan sistem aracına düşülür; önceki davranış hiçbir medyayı içe aktarmayı reddediyordu.

**Sürükle-bırak**:
- `import-dropped-media` IPC'si eklendi: dosya yolu taşımayan bırakmaların baytları profil klasörüne içerik adresli yazılır (SHA-256, ilk 20 karakter), 100 dosya ve 4 GB sınırı, uzantı beyaz listesi uygulanır, özgün dosya adı geri yazılır.
- Pencere geneli ve medya kitaplığı aynı `importDropped` akışını kullanır; `getPathForFile` boş dönerse bayt yolu devreye girer.
- Sürükleme sırasında `drop-overlay` katmanı görünür.

**Doğrulama**:

- `tests/mediaTools.test.ts` 7 test: gömülü önceliği, kullanıcı ayarı önceliği, **bozuk pakette sistem aracına düşme** (hatayı doğuran senaryo), çoklu gömülü dizin sırası, geçersiz ayar reddi, `PATH` keşfi, hiçbir araç yokken Türkçe yönlendirme.
- `tests/drop-electron.ts` gerçek masaüstü, **tamamen boş `PATH`**: (1) sürükleme sırasında katman görünür, (2) yolu olmayan 2 dosya proje medyasına dönüşür, (3) baytlar profil klasörüne kopyalanır, (4) Türkçe dosya adları korunur, (5) 1920×1080 H.264 + AAC gerçek dışa aktarma. `errors: []`.
- `tests/package-win-electron.ts` artık `PATH=""`, `CEVIKEDIT_FFMPEG`/`CEVIKEDIT_FFPROBE` yok: paketlenmiş uygulama 0.9.0 sürümüyle şablon projesi oluşturdu, kaydetti ve 6,0 sn 1920×1080 H.264 dışa aktardı; 5 kontrol geçti. Bu, hatanın paket düzeyinde kapandığını gösterir.
- Tam `npx vitest run`: **470 test, 464 geçti, 6 atlandı, 0 başarısız** (49 dosya).
- `npm run check:desktop`: 9 betik geçti (düzenleme/dışa aktarma, görsel araçlar, depolama, oynatıcı, ses ayırma, kanal, geçiş, CapCut içe aktarma, anahtar kare).
- `tests/subtitle-electron.ts` 15 kontrol geçti.
- Güncelleme akışı canlı doğrulandı: `checkForUpdate("0.8.0")` → `0.9.0` ve `asset: CevikEdit-Kurulum.exe (189 044 095 bayt)`; `checkForUpdate("0.9.0")` → güncelleme yok.

**Sınırlar**: macOS kurulumu bu turda yeniden derlenmedi ve macOS/Linux paketleri medya aracı taşımaz (sistem FFmpeg'i veya ayarlardan seçim gerekir). Windows kurulumu ~180 MB'dir çünkü FFmpeg gömülüdür. Kurulum imzası yerel ad-hoc; resmi kod imzası yok.

## Kapanış: Béssel geçişi, zaman çizelgesi inişli kayma ve mini harita, VAD, 4K limiti, HDR ve taslak değişimi (2026-11-11)

Önceki turda sıralanan altı eksik, “doğrulanabilir ve açıklanabilir” biçimde ayrı ayrı ele alındı; her biri için birim test ve gerçek masaüstü/FFmpeg kanıtı vardı.

### Serbest Béssel geçişi

Anahtar kare opsiyonel `bezier: {x1,y1,x2,y2}` tutar; mevcut ön ayar varsa onun yerine geçer. `src/core/bezier.ts`, Newton yinelemesi ile `x(t)=ratio` çözümünü bulur, başarısız olursa ikili aramaya düşer; Y −1~2 aralığı “önce geri çekilip sonra geç” anlamına gelir. Animasyon sayfasına “Özel Béssel” seçeneği, kaydırılabilir iki kontrol noktası, dört sayısal alan ve dört ön ayar (Yumuşak/Hızlı/Geri çek/Doğrusal) eklendi. Önizleme formülle hesaplıyor, dışa aktarma aynı eğriyi 24 parçaya bölünmüş çizgi olarak FFmpeg ifadesine yazıyor; `validateProject` sınır dışı tutamcıları ve `x1 > x2` durumunu reddediyor.

- `tests/bezier.test.ts` 7 test: uç nokta ve monotonluk, yaklaşık çizgi, gerçek aşırı geçiş, geçersiz tutamacı reddi, geçiş önceliği, proje doğrulama, dışa aktarma ifadesi ve önizleme 0–100 aralığında en yüksek hatası < 1 (yani < %1).
- `tests/model.test.ts` 41 test geçti; `tests/keyframe-electron.ts` geçiş, sürüklenme, kopyalama, tam sayı girişi ve 90 kare ön izleme/ dışa aktarma karşılaştırması hepsi geçti.

### Zaman çizelgesi inişli kayma ve mini harita

`src/core/timelineMotion.ts`, fps’e duyarlı exponansiyel azalan kayma (0.92/frame, 6 px/s durma, 6000 px/s üst sınır), parmak uçları hızı tahmini, mini harita normalize geometrisi ve tıklama merkezi sağlar. Ortacık/Alt+ sürüklenme sonrası kayma devam eder ve kenarlarda durur; zaman çizelgesinin altına 22 px yüksekliğinde mini harita eklendi; tüm parça çubuklarını, görünen pencereyi ve oynatma başını gösterir, tıklama atlar, araç çubuğundan “Harita” ile aç/kapa.

- `tests/timelineMotion.test.ts` 7 test: azalma, fps’e duyarlılık, üst sınır/hatalı delta, hız tahmini, geometri, boş zaman çizelgesi ve tıklama merkezi.
- `tests/timeline-view-electron.ts` 12 test (yeni 2): hızlı sarsılma sonrası `scrollLeft` devam ediyor, mini harita tıklama atlama ve aç/kapa; eski ölçek çipinleme, sıkma, uyumlama kontrolleri hepsi geçti.

### Çevrimdışı VAD ile otomatik müzik baskısı

`src/core/vad.ts`, 20 ms pencere enerjisi, %10 kuantil gürültü tabanı, +8 dB göreli eşik ve ±2 dB gecikmeli sinyalle anlar (voice); 0.35 s alt duruşları birleştirir, 0.25 s alt patlamaları atar ve `sourceIn`/`speed` ile zaman çizelgesine eşler. Ana süreç yalnızca 16 kHz mono PCM’e decode eder; Ducking opsiyonel anlama aralıkları kabul eder.

- `tests/vad.test.ts` 12 test: üç patlama, köprü kısa duruş, tıklama yok sayımı, sabit gürültü kararlılığı, eşik gürültü tabanına değişim, anomali parametresi, çerçeve, zaman çizelgesi eşlemesi, yalnızca tespit aralığında baskı, aralık kırpma, geçersiz aralık reddi, eski davranışın değişmemesi.
- `tests/vad.integration.test.ts` 3 test gerçek FFmpeg: sentetik üç sesli patlama 150 ms içinde bulundu, sessizlik dizileri yanlış alarm vermedi, dışa aktarılan müzik zarfı 1.5 s ve 6.5 s’de baskılı, 2.6 s’de geri döndü.
- `tests/audio-tools-electron.ts` 8 test: sabit ton gerçek anlamla karar verdi, sessizlik sanımı yok; mevcut ölçüm/norme/baskı/tekrar kontrolleri geçti.

### 4K ve büyük proje limitleri

`src/core/limits.ts` yumuşak eşikler (300 parça, 2000 kare, 300 metin, 40 kanal, 1 saat), dışa aktarma bellek tahmini ve Türkçe uyarı verir. Zaman çizelgesi 240 parçadan fazla ise yalnızca görünen dilimleri çizer (her iki taraf %25 pay bırakır); küçük proje yine tümünü çizsin diye seçim ve erişilebilirlik anlama dikkat.

- `tests/limits.test.ts` 6 test: metrikler, normal proje uyarı yok, 4K açıklaması, eşik uyarıları, bellek tahmini ve reddi, görünen kırpma (pencere genişliğinden uzun parça dahil), 2000 parçada saf hesap süresi.
- `tests/limits-electron.ts` 5 test gerçek masaüstü: 401 parçalı 4K proje 978 ms içinde açıldı ve yalnızca 14 çizildi, sonda kaydırınca uzaktaki parçalar çizildi, 260 ms ölçekleme, dışa aktarma ön izlemesi `90.120 kare · 443 MB üst bellek tahmini` olarak doğrulandı.

### HDR ve renk yönetimi

`src/core/colorManagement.ts`, FFprobe `color_transfer`/`color_primaries`/bit derinliğine göre SDR, PQ, HLG (bt2020 ve ≥10 bit PQ sayılır) belirler; içe aktarımda medya meta verisine yazar ve medya kitaplığında HDR/HLG rozeti gösterir. Dışa aktarımda HDR katmanları için önce `zscale`→doğrusal→`tonemap=hable`→BT.709, sonra geometri/sentez; çıktı açıkça `bt709` üçlüsünü işaretler. Diyalog açıklaması: “HDR kaynak SDR’e çevrilecek”.

- `tests/colorManagement.test.ts` 4 test: sınıflandırma, filtre zinciri (HLG önce açılır), dışa aktarma etiketi, rozet ve uyarı metni.
- `tests/hdr.integration.test.ts` 4 test gerçek FFmpeg: PQ/bt2020 etiketli kaynak HDR sayıldı, dışa aktarma sonrası smpte2084/bt2020 değil; SDR kaynak davranışı değişmedi; proje yeniden açılışta meta veri korundu.
- `tests/export.integration.test.ts` 24 test ve `tests/app-electron.ts` 15 test geçti (BT.709 etiketi mevcut piksel iddialarını bozmadı).

### Taslak değişim dışa aktarma (KısaFilm yazımı yok)

`src/core/draftExchange.ts`, **açık metin** taslak belgesi üretir: `materials.videos/audios/texts`, `tracks[].segments` (mikrosaniye `target_timerange`/`source_timerange`, speed, volume), ve tam proje bir kayıp tarafı sinyali olarak ekler. Menü “Taslak değişim dosyasını dışa aktar (JSON)” kullanıcı seçtiği yere yazar, açıklama **KısaFilm şifreli taslak ya da KısaFilm’a doğrudan açılmayan açık JSON** olduğunu açıkça söyler.

**KısaFilm şifreli taslak yazımı bilinçli olarak yapılmadı**: bu biçim üçüncü taraf özelidir, taşıma anahtarı onun uygulamasındadır; onun içine yazma işlemi bu projenin yetki kapsamı dışındadır (AGENTS.md’nin ihtiyatlı sınırı). Bu bölüm “gidiş-gidiş açık değişim biçimi” olarak teslim edildi, üçüncü taraf dosyası değiştirilmedi.

- `tests/draftExchange.test.ts` 5 test: belge yapısı, mevcut açık alan içe aktarıcıyla gidiş-gidiş sonra zaman/speed/metin tutarlılığı, yan kanal değişmediği, doğrulama ve reddi, özel isimler.
- `tests/draft-electron.ts` 3 test gerçek masaüstü: menü dışa aktarma ve diske yazma, dışa aktarma dosyası yeniden içe aktarıldı, 2 parça, arayüzde Çinli kalıntı yok; kaynak `.cevikedit` değişmedi.

### Genel sonuç

- Tam `npm test`: **458 test, 452 geçti, 6 atlandı, 0 başarısız** (49 dosya).
- `npm run typecheck`, `npm run build` geçti; `npx tsx scripts/i18n-audit.ts` 0 eksik. Denetim scripti ek bağımsız literal regex taraması ekledi, önce parantez durum makinesine bağlı olduğu için kaçırdığı sorunu düzeltti.
- Windows paket sürümü **0.6.1** olarak yükseltildi: `release/CevikEdit Setup 0.6.1.exe` build edildi; `tests/package-win-electron.ts` paketlenmiş `CevikEdit.exe`’i doğrudan başlattı, sürüm, sekiz kaynak sekmesi yalnızca Türkçe, şablon ile proje, kaydetme ve 1920×1080 H.264 dışa aktarımı doğrulandı, 5 test geçti.
- Masaüstü regresyonları: `app-electron` 15, `keyframe-electron` 7, `templates-electron` 7, `timeline-view-electron` 12, `limits-electron` 5, `audio-tools-electron` 8, `subtitle-electron` 15, `draft-electron` 3; renderer hataları yok.

Sınırlar: Béssel dışa aktarımda 24 parçaya bölünmüş çizgi yaklaşımı (ön izleme kesin çözüm), en uç tutamcıda hatası hâlâ animasyon aralığının %1’i altında; 4K ön izleme ayrı bir proxy yerine çizge ölçeklendirmesiyle yapıldı, uzun 4K zaman çizelgesinde kaydırma çelişkili stiller üretmiyor; VAD 20 ms enerjisi yakın saha insan sesi için; müzik/şiddetli gürültü senaryoları elle ayar ya da aralık seçimi gerekir; HDR tüm SDR BT.709’e çevriliyor, HDR çıktı üretmiyor, peak luminance meta verisi de üretmiyor; taslak değişim biçimi CevikEdit’in kendi formatıdır, üçüncü parti editöre garanti yok. Tüm doğrulamalar yalnızca Windows 10 x64 ve FFmpeg 8.0 üzerinde tamamlandı, macOS/Linux gerçek donanımda yeniden denendi değil.

## Şablonlar ve 0.6.0 aday paketi (2026-11-08)

### Tekrar kullanılabilir şablonlar

`src/core/templates.ts` (saf model) ve `electron/templates.ts` (depolama), `TemplatesLibrary` paneli ve “Şablon” kaynak sayfası eklendi. **Şablon olarak kaydetme**, mevcut projenin çizge, kanal, stil, animasyon ve zamanı aynen korur; kullanılan her malzemeyi `template://media/<slot>` göndergesiyle değiştirip “Medya konumu” olarak kaydeder; hiçbir parça tarafından başvurulmayan malzemeyi atlar, küçük görünüm, ön izleme adresi, önbellek alanı temizlenir. **Şablondan yeni** proje, kanal, parça ve kare kimliklerini yeniden üretir, medyayı kaynaktan sıfıra alır ve kullanılabilir uzunluğa göre kısar (aynı zamanda kare ve fade penaltılarını kırpar); metin konumları kullanıcı girdisiyle değiştirilir. Eksik opsiyonel konumlar yalnızca ilgili parçaları çıkarır ve arayüzde uyarı verir; zorunlu konum eksikse açıkça reddeder. Şablon `.cevikedit-template` dosyası olarak dışa aktarılıp içe aktarılabilir; içe aktarma önce çözüm ve doğrulama yapar, herhangi bir yere yaslı yeri, taşma `template://` yolu, tip uyumsuzluğu, tekrar anahtarı, 100 medya/200 metin konumu, resimsiz kapak reddedilir.

Paket içinde üç tane bağımsız üretilmiş örnek şablon (`src/core/builtinTemplates.ts`): **Açılış kartı** (1920×1080, 6 sn), **Dikey sosyal video** (1080×1920, 8 sn), **Altyazı bloğu** (1920×1080, 12 sn, üç adet sıralı altyazı). Hepsinde kapak, medya konumu, varsayılan yerleşik malzeme ve metin konumu vardır; bu haftanın fade-in/fade-out, x/y kare ve metin animasyonu verileri yeniden kullanılır.

- `tests/templates.test.ts` 11 test: yerleşik şablon doğrulama/özet, şablondan yeni ve süreklilik, opsiyonel konum atlama ve uyarı, zorunlu konum ve hatalı medya tipi reddi, medya parçadan kısa ise kareye göre kırp, proje→şablon kaydetmede yerel yol sızdırmaz ve kaynak projeyi değiştirmez, JSON gidiş-gidiş, değiştirilmiş yol/kapak/konum listesi reddi, 100 üst sınırı ve tekrar anahtarı, iki kez yeni kurma kimlik paylaşımı yok, özet alanları.
- `npx tsx tests/templates-electron.ts` 7 gerçek masaüstü kontrolü: şablon sayfası üç Türkçe yerleşik şablonu listeler; mevcut projeyi kaydedince yerel yol içermeyen `.cevikedit-template` yazar; yeniden açınca kütüphane var; kullanıcı şablonu seçip medya/metni değiştirince yeni proje üretir (3 parça); şablon dosyası dışa aktarır; silinince kaybolur, tekrar içe aktarır; dışa aktardaki malzeme yollarını `C:\gizli\video.mp4` yapıp tekrar içe aktarınca reddedilir ve Türkçe hata gösterilir. Renderer hatası yok.

### 30 saniyelik uçtan uca demo

`scripts/generate-showcase.ts`, aynı çekirdek modeli kullanarak 30 sn 1280×720 video kurar: üç mansı sentetik manzara (gradyan, güneş, dört katmanlı sır, granül çizgi) her biri yavaş yakınlaşan `easeInOut` ölçekli, başlık ve fade-in/fade-out; beş Türkçe altyazı `prepareSubtitleEdit` ile “yükseliş + nefes alma + kayma çıkışı” uygulanır, bunlardan biri önce oynatma başına bölünüp birleşir, bölme/birleşme kuralı doğrulanır; ses zinciri sentetik “insan sesi” ve “müzik”; önce müzik için gerçek `loudnorm` ölçümü (makine −29.1 LUFS / −18.5 dBTP), −20 LUFS’e normalizasyon, sonra `prepareDucking` ile 30 sn insan sesi süresince müzik 11 dB bastırılır, geçiş 0.5 sn; başlık “Açılış kartı” şablon konumundan üretilen biçimde yeniden kullanılır. Gerçek dışa aktarma hattıyla render edilir, bu proje kendisi şablon olarak kaydedilir ve gidiş-gidiş doğrulanır.

Sonuç: `showcase.mp4` 1280×720, tam 30.0 sn, H.264 + AAC; dışa aktarılan ses sessiz değildi (ilk 2 sn PCM RMS > 0.005); projedeki 6 metin parçası ve 5 medya konumu `validateProject` geçti; aynı adlı şablondaki malzemeler hepsi konum/placeholder idi. Üretim `docs/media/hafta-demosu.mp4` (2.3 MB), `hafta-demosu.cevikedit`, `hafta-demosu.cevikedit-template` ve üç önizleme çerçevesi olarak kopyalandı; kaynak açıklaması `docs/media/KAYNAK.txt`.

- `tests/showcase.test.ts` 1 test (yaklaşık 32 sn): tam üretim, dışa aktarma, FFprobe doğrulaması (boyut/süre/video- ses akışı), PCM enerjisi, metin ve kare sayısı, şablon konumları ve ürün boyutu.

### Windows 0.6.0 aday paketi

`package.json`/`package-lock.json` **0.6.0**’a çıkarıldı, `npm run dist` `release/CevikEdit Setup 0.6.0.exe` (129 MB, NSIS, x64) ve `release/win-unpacked` üretti. `tests/package-win-electron.ts` ekledi; paketlenmiş `CevikEdit.exe`’i (izole kullanıcı dizini, varsayılan Türkçe, `CEVIKEDIT_LOCALE` kapaması yok) doğrudan çalıştırdı: `getSystemInfo()` 0.6.0 / win32 döndürdü, sekiz kaynak sekmesi hiçbir Çinli/Japon/Hangari olmadan Türkçe idi, yerleşik şablon ve paket içi malzeme ile proje (3 parça) oluşturup `.cevikedit` olarak kaydetti, native diyalogla dışa aktardı, FFprobe ile 1920×1080 H.264, 6.0 sn doğrulandı; renderer hatası yok.

Sınırlar (**mutlaka açıklanmalı**): bu tur yalnızca Windows 10 x64 üzerinde aday paketi build edip başlattı. Makinede macOS ortamı yok, `dist:mac`/DMG build edilmedi, imzalanmadı, çalıştırılmadı; bu yüzden macOS aday paketi “tamamlandı” ya da “gerçek makine doğrulandı” sayılmamalı. macOS tarafı hâlâ 2026-10-13 tarihli v0.5.0 paketi kaydıyla aynı.

## Çapraz platform regresyonu ve ana süreç yerelleştirme düzeltmesi (2026-11-07)

Önceki tam test seti uzun süre 15 başarısızta kaldı, hepsi “çevresel sorun” olarak kaydedildi. Bu tur tek tek çözümle; bunlardan 4 tanesi testin kendisinin yalnızca macOS için geçerli olduğu, **1 tanesi gerçek ürün hatasıydı**:

- **CLI betiği Windows’ta başlatılamıyordu (gerçek ürün hatası)**: `assistantBackend`, kullanıcı seçtiği çalıştırılabilir dosyayı doğrudan `spawn` ediyordu. macOS’te `#!` içeren betik çekirdek tarafından çalıştırılıyordu; Windows’ta shebang desteklemiyordu, bu yüzden `spawn` `ENOENT` döndürüyordu. `assistantLaunch` eklendi: Windows’ta dosya başlığını okur, `#!` ise yorumlayıcıyı çözümler (`/usr/bin/env node`, node yolunu gösterenler mevcut Node çalışma zamanına map edilir), `spawn(interpreter, [script, ...args])` ile başlatır, yine `shell: false` ile shell enjekte yüzeyi açmaz; `--version` algılama ve gerçek oturum aynı başlatma tanımı kullanır. Yorumlayıcı çözülemezse açıkça reddeder ve yerel `.exe` seçmesini önerir.
- `tests/mediaTools.test.ts` Windows’ta `platform: "darwin"` ile çalışıyordu, PATH `:` ayrıştırılarak sürücü adını kaybetti; şimdi mevcut platform ve `.exe` uzantısı kullanılıyor, gerçek davranış doğrulanıyor.
- `tests/portableProject.test.ts`, `JSON.stringify(project).toContain(absolutePath)` ile Windows geri bölüşümleri JSON’da kaçıyor diye assert ediyordu; artık çözülen `assets[0].path` ile karşılaştırılıyor. Windows’ta geliştirici modu gerekmedi, dizin bağlantısı (junction) ile aynı `realpath` sınırı doğrulanıyor.
- `tests/assistantBackend.test.ts`, `path.dirname(cwd)` ile `realpath(folder)` karşılaştırıyordu, `os.tmpdir()` Windows’ta 8.3 kısaltılmış yolda döndürüyor; iki taraf da `realpath` alındıktan sonra karşılaştırılıyor.

Sonuç: `npm test` **398 test, 392 geçti, 6 atlandı, 0 başarısız** (ilk tam yeşil). Önceki kayıtlardaki `assistantBackend` 12, `portableProject` 2, `mediaTools` 1 hepsi kayboldu; hiçbir test atlanmadı ya da assert kırpılmadı.

Ana süreç yerelleştirmesi: masaüstü varsayılanı Türkçe olduktan sonra render katmanı sözlüğü yalnızca `src/`’i kapsıyordu; ana süreç `electron/*.ts` içindeki 181 Çinli hata yine IPC üzerinden Çinli görünebiliyordu. Bu tur 150’dan fazla sözlük ve yaklaşık 40 çalışma modu ekledi; asistan doğrulama, CapCut içe aktarma, dışa aktarma doğrulama, dosya köprüsü, taşınabilir proje, medya araçları ve transkript hatalarını kapsıyordu; `tests/mainLocale.test.ts`, `electron/` içindeki tüm Çinli literal’leri tarıyor ve yalnızca 4 iç kaynak şablonu (istemci sarmalama, türetilmiş malzeme adları, ilerleme sayımı) muaf bırakıyor. Asistan istemcisi de artık Türkçe; model artık Türkçe cevap vermesini istiyor. Taşınabilir paket içi `KULLANIM.txt` ve `<ad>-medya-paketi-<id>` dizin adları Türkçe; proje giriş dosyası `proje.cevikedit`.

- `tests/mainLocale.test.ts` 3 test: ana süreç sözlüklerini tarar, kombinasyon hatalarını doğrular (parça/malzama/FFmpeg/CLI/CapCut) ve hepsinin Türkçe olacak şekilde çevrilebileceğini doğruler; asistan istemcisinin Türkçe ve JSON sözleşmesini koruduğunu doğruler.
- `npx tsx tests/assistant-assets-electron.ts` 13 test geçti: yerleşik malzeme içe aktarma, Codex/Claude sentetik CLI protokolü, parametre müdahale reddi, gerçek alt süreç iptali, sesli dışa aktarma ve Çinli başlıklı video.
- `npx tsx tests/portable-range-electron.ts` 6, `audio-tools-electron` 7, `placement-electron` 5, `linked-electron` 5, `timeline-view-electron` 10, `subtitle-electron` 15 test hepsi geçti.
- `npx tsx scripts/i18n-audit.ts` 0 eksik; `npm run typecheck`, `npm run build` geçti.

Sınırlar: ana süreç hataları “render zamanı çevirisi” üzerine bağlı; yeni native diyalog metni eklenecekse `tr()` ile sarmak zorunda kalınır, aksi halde bu mekanizmayı atlar. Windows’ta hâlâ `.cmd`/`.bat`/`.ps1` wrapper’ı desteklenmiyor (güvenlik nedeniyle native `.exe` seçilmeli); tanınmayan shebang yorumlayıcıları reddedilir. Tüm doğrulamalar yalnızca Windows geliştirme makinesindeki FFmpeg 8.0 ile tamamlandı, macOS/Linux gerçek donanımda ya da paketlenmiş kurulumda yeniden denendi değil.

## Zaman çizelgesi ölçeklendirme ve özgür kayma (2026-11-06)

Zaman çizelgesi görünümü ayrı saf hesap modülü `src/core/timelineView.ts` oldu; araç çubuğı, kaydırma ve kayma aynı fonksiyonlarla; ölçek aralığı **2–1600 px/s** (önceki üst sınır 400). Yeni etkileşimler:

- **Ctrl/⌘ + kay): fare zaman çizelgesinde odağı sabitleyerek ölçekle.
- **Shift + kay): piksellerle özgürçe yatay kaydır.
- **Orta tuş sürüklenme** (ve boş alanın Alt + sol tıklaması): yatay ve dikey kaydır.
- **Uyarlama / oynatma başı**: uyarlama mevcut görünen genişlik ve proje sonuna göre oran bulup başa döner; oynatma başı düğmesi başı merkeze alır.
- Araç çubuğuna **görünen süre** (`00:00:09 görünür`) eklendi; kaydırıcı aralığı yeni üst/alt sınırlara yayıldı, eşe uyan düğüm devre dışı bırakıldı.

Ölçek ve kayma yalnızca görünüm durumunu yazıyor, proje ya da geri alma yığınına girmez; `setZoom` aynı `clampPps` ile sınırlandırır.

- `tests/timelineView.test.ts` 8 test: oran üst sınırı/eksi sayı, kaydırma tersleme ve sınırlar, fare sabitleme formülü (fare kirişi başlığına takılmadığında hareket etmez), görünen aralık (pencere başlığı aşımına kadar dar, oran 0), uyarlama oranı ve anormal süre sonucu, kaydırma sınırları, oynatma başı yalnızca konfor bölgesini terk edince kayar.
- `tests/timeline-view-electron.ts` 10 gerçek masaüstü kontrolü: varsayılan 60 ve görünen süre; araç çubuğu büyütme/azaltma tersi (75→60); sol 240 px’de Ctrl+kay ile büyütme sonrası fare altı süre sapması < 0.35 sn; Shift+kay sağa kaydır; orta tuş sürüklenme sonrası `scrollLeft` artıyor; 1600/2’de kaydırıcı eşik düğümü devre dışı; uyarlamadan sonra kayma sıfır ve oran varsayılanın altında; oynatma başı düğümü kullanılabilir; görünen süre okuma `02:05:09 görünür`; kaydedilen parça id/ başlangıç/ süre/ giris ile proje birebir aynı; yeniden açınca geçmiş boş. Renderer hatası yok.
- `tests/app-electron.ts` (15), `tests/track-electron.ts` (8, dikey kaydırma sonrası oynatma başı eli görünür kalıyor) geçti; yeni kaydırma katmanı sürüklemeyi, seçimi ve kanal işlemlerini bozmadı.
- Tam `npm test` 395 test: 374 geçti, 6 atlandı, 15 başarısız; başarısızlar yine mevcut çevresel senaryolardı (`assistantBackend` 12, `portableProject` 2, `mediaTools` 1); bu modüller değiştirilmedi.

Sınırlar: tarayıcı QA betiği `tests/timeline-browser.ts` makinede Playwright Chromium gerektirir; bu makineye tarayıcı çıktısı kurulu değil, çevresel kapsamda otomatik indirilmediği için bu tur betiği çalıştırılmadı, aynı etkileşim gerçek Electron masaüstü senaryolarıyla kapandı. Dokunmatik takla yatay kaydırmayı Ctrl+kay eşlemesi bekler; inişli kayma, kaydırıcı içine yerleştirilmiş mini harita ya da kare yoğunluğuna göre örülmüş ölçek gibi yetiler yok.

## Arayüz dili (2026-11-06)

Masaüstü artık varsayılan Türkçe kullanır; paket kararına değil: `resolveLocale`, geliştirme ve paket ortamında `tr` döner; ana süreç menüleri, yerel diyaloglar ve IPC hataları tek yerel söz kurma paketiyle; render katmanı aynı paketi kullanır. `CEVIKEDIT_LOCALE=zh` artık kullanıcıya değil, Çinli doğrulama betiklerine yönelikti; `tests/locale.test.ts` 4 test varsayılan dil, Çinli geri dönüşü, yeni ses/altyazı metinleri ve çalışma-zamanı birleştirme mesajlarını kapsar; `npx tsx scripts/i18n-audit.ts` 0 eksik literal ve 0 JSX metni raporlar. Gerçek masaüstü ses akışında Medya / Ses / Metin / Çıkartma / Efekt / Geçiş / Altyazı tek tek değiştiriliyor, sayfa metninde Çinli/Japon/Hangari karakteri olmadığı doğrulanıyor.

## Zaman çizelgesi ekleme/üzerine yazma ve ses-video bağlantısı (2026-11-06)

Kaynak malzeme ön izlemesi net giriş yolları ekledi: **sona ekle**, **eşleşsin ve kaydır**, **şimdi üzerine yaz**. Üçü o da `src/core/placement.ts` içindeki `placeClip` ile tam proje üzerinde hesaplayıp tek commit ile gönderir; kilit, geçersiz mod, zaman çizelgisinin dışı reddedilir. Ekleme/üst yazma yalnızca hedef kanalı etkiler, diğer kanallar, metin parçaları ve çakışmayan parçalar aynen kalır.

Ayrıştırılmış ses artık paylaşılan `linkId` yazıyor: kaynak video ve ayrıştırılmış ses kanalı birlikte taşınıyor, kırpılıyor, bölünüyor, siliniyor, kopyalanıp yapıştırılıyor ve tekrarlanıyor; tekrar/yapıştırma yeniden eşleştirme kimliğini haritalıyor. `linkId` opsiyonel parça alanı olarak `validateProject` tarafından doğrulanır, eski projeler bu alanı olmadan geçerli.

- `tests/placement.test.ts` 8 test: sona ekleme hareket ettirmiyor, ekleme/bırakma parçayı kesip sonrasını kaydırır, boşlukta ekleme kırpmaz, üst yazma sol tarafı kırpar, tam üst yazma diğer kanalı korur, kilit/geçersiz/ dışı reddi, store üzerinden ekleme/üst yazma ayrı ayrı geri alma, kimlik benzersiz ve proje doğrulama.
- `tests/linkedClips.test.ts` 5 test: paylaşılan linkId ve sessizlik, senkron taşıma, senkron kırpma/bölme/silme, bağlantı kopunca bağımsız taşıma ve iki adımlık geri alma, ayrıştırılmış kanal ses seviyesini korur.
- `tests/placement-electron.ts` 5 gerçek masaüstü kontrolü: 4 sn parçanın içinde 2 sn aralığında 2 sn seç parçası ekle; kayıt `[0,2][2,2][4,2][8,3]`; sağ parça `sourceIn=2`; bir geri alma `[first 0/4][second 6/3]` getirir; 1 sn üzerine 3 sn yaz orta parçayı `[0,1]` yapar ve 6 sn parçayı korur; sona ekleme 9 sn’e gelir; yeniden açınca 4 parça ve geçmiş boş.
- `tests/linked-electron.ts` 5 gerçek masaüstü kontrolü: ayrıştırma sonrası iki parça paylaşılan linkId, kaynak video sessiz; `Alt+→` tek kare kaydırma sesi senkron taşır; bir geri alma aynı anda geri getirir; bağlantı kopınca video taşır ses değil; yeniden açınca linkId yok ve geçmiş boş.

Sınırlar: ekleme/üst yazma tek hedef parçayı kapsar, çok kanal etkileşimi ya da “tüm kanallarla ekleme” yok; üst yazma bir kare altı kalıntıyı kırpır, korumaz. Bağlantı yalnızca “ayrıştırılmış ses” üretimli video/ ses çiftini kapsar, elle yerleştirilmiş parçalar otomatik bağlanmaz; bağlantı kopunca yeniden kurulamaz.

## Ses gürültü ve otomatik müzik baskısı (2026-10-24)

“Ses” sayfasına `AudioTools` paneli eklendi. Sesli parça seçilince ana süreç `analyze-loudness` çağırır: yetkilendirmeli malzemenin yerel yolunu okur, FFmpeg `loudnorm=I=-16:TP=-1.5:LRA=11` ile parçadaki kaynak aralığını analiz eder, yalnızca stderr’deki EBU R128 özetini (integrated LUFS, true peak dBTP, LRA) çözer, diske yazmaz, yükü yok. Özet almak için araç yürütme yolu `runMediaToolWithDiagnostics` ile açılır, normal çağrı stdout’ü döndürür.

Normalizasyon `hedef LUFS − ölçülen gürültü` kazanım hesabı, `−1 dBTP − ölçülen gerçek en yüksek` ile sıkılaşturulur, −30~+30 dB aralığında; sonuç parça ses seviyesine ve mevcut tüm ses karelerine çarpılır, 400%’nin üzerindeyse sessiz kırpma yapmadan reddeder. Sessiz malzeme (`-inf`) açıkça reddedilir. Müzik baskısı için kullanıcı parçayı açıkça “insan” ve “müzik” listelerine ekler, `prepareDucking` insan aralıklarını iki kat geçiş uzunluğuna göre birleştirir, kare basınca yazım anahtar karelerine uygular: 0 s sabit orijinal ses seviyesi (kare değeri ilk kareye başlangıç), insan öncesi geçiş uzunluğuyla geri dönme, insan aralığında baskı, bitiş sonrası yükselme. Tüm değişiklikler altyazı ile aynı “plan bağlı JSON anı + uygulama zamanı doğrulama” desenini kullanır, bir geri alma/yeniden kullanma adımı tam geri getirir.

- `tests/audioMix.test.ts` 10 test: loudnorm JSON çözümleme (`-inf`, eksik alan, bozuk değer), kazanım ve en yüksek sıkma, ses/kare ölçekleme ve diğer özelliklerin bozulmaması, kilit/ sessiz/ >400%/eski plan reddi, 0 s baz kare ve insan aralık zarfı, yakın aralık birleştirme ve zarf kırpma, video sessizliğinin insan kabulü ve eski karelerin değiştirilmesi, örüntü/kilit/ tekrar/ yok örüntü/parametre aralığı reddi, store bir geri alma.
- `tests/export.integration.test.ts` 2 yeni gerçek FFmpeg kontrolü: 2 sn 600 Hz müzik için gürültü sınırlı ve negatifti, −23 LUFS normalizasyonu sonrası kazanım < 1, kareler aynı oranda; dışa aktarma sonrası ses vardı; 440 Hz insan sesi 1–2.5 sn, müzik 0–4 sn, −12 dB/0.2 sn geçişle dışa aktarıldı, insan kadranının 600 Hz enerjisi insan öncesi ve sonrasının yarısından altıydı, 440 Hz hâlâ ölçülebildi.
- `npx tsx tests/audio-tools-electron.ts` 7 gerçek masaüstü kontrolü: Türkçe panel görünür, yedi kaynak sekmesi Çinli yok, gerçek ölçüm `-21.6 LUFS · -18.1 dBTP`, normalizasyon kareye yazılıp bir geri alma, baskı yalnızca müzik karelerini değiştirir (zamanlar 0/0.8/1/2.5/2.7, baskı `10^(-12/20)`), geri alma/yeniden kullanma ayrı ayrı bir adım, yeniden açınca zarf hâlâ orada ve geçmiş boş; renderer hatası yok.
- `npm run typecheck`, `npm run build` geçti; `npx tsx scripts/i18n-audit.ts` 0 eksik.
- Tam `npm test` 387 test: 366 geçti, 6 atlandı, 15 başarısız; başarısızlar mevcut çevresel senaryolardı: `assistantBackend` 12 (boşluklu geçici dizinde CLI fixture spawn/edilemiyordu ve protokol senaryoları da), `portableProject` 2 (Windows yol dizgilemesi ve bağlantı noktası `EPERM`), `mediaTools` 1 (PATH sürücü ön eki/büyük/küçük harf). Bu tur yeni modüller ve dışa aktarma/masaüstü senaryoları geçti; başarısız modüller değiştirilmedi; tam sonuç tam yeşil sayılamaz.

Sınırlar: gürültü parça düzeyinde çevrimdışı ölçüm, gerçek zamanlı seviye tablası ya da çok kanal toplu gürültü değil; ölçüm ve normalizasyon arasında dış değişiklik snapshot ile reddedilir. Baskı yalnızca parça aralığına dayanır, insan konuşma duruşunu gerçek içerik analiz etmez; aynı parça insan ve müzik olarak iki yönle kullanılamaz; geçiş 0 iken bile bir kare rampası korunur. Baskı mevcut müzik parçasının tüm karelerini değiştirir, daha ince elle kare paketi gerekirse baskı sonrası kare panelinden ayar edilir. Tüm doğrulamalar Windows geliştirme makinesinde, sentetik ses ve FFmpeg 8.0 ile tamamlandı, macOS/Linux gerçek donanımda ya da paketlenmiş kurulumda yeniden denendi değil.

## Görsel kare eğrisi ve geçiş (2026-10-22)

Animasyon sayfasına ayrı uygulanan `KeyframeEditor` eklendi: SVG eğrisi ve tüm parça kare listesi özellik seçimi yapabiliyor; eğriye tıklama oynatma başını konumlandırır, noktayı sürüklenme parça fps’sine göre zaman sabitler ve özellik aralığına göre sayı sınırlar; seçiliyken tam sayı/ zaman girişi, atlama, silme, kopyalayıp yapıştırma (oynatma başına) mümkün. Sürüklenme store transaction kullanır, bir geri alma sürüklemeyi geri getirir. Ön ayarlar `linear`, `easeInOut` üzerine `easeIn`, `easeOut` eklendi, dörtü `keyframeEasingWindow`, `keyframeEasingCoefficients` ve `keyframeEasedRatio` paylaşır; önizleme, eğri örnekleme, kırpma/bölme ve FFmpeg dışa aktarma aynı pencereleme formülünü kullanır; kırpma/bölme pencereleri kalan aralığa yeniden haritalandırılır, eğri şekli korunur.

Dışa aktarma aynı katsayılarla FFmpeg ifadesi üretir. Dinamik ölçekleme ve opaklık birlikte açıkken önce sabit boyutlu girdide alpha uygular, sonra kare başına ölçekle; böylece `alphamerge` kare boyutu değişiminde hata vermez; bu kombinasyon önce artık geçmedi, 90 kare dışa aktarımı tamamlandı.

- `tests/model.test.ts` 41 test geçti: kademeli giriş/çıkış sınırları, tekrarlanan zaman damgaları, tam kesme pencereleri ve kırpma/bölme sonrası nokta başına tutarlılık.
- `tests/export.integration.test.ts` 21 gerçek FFmpeg/FFprobe testi geçti: yeni kademeli giriş/çıkış kırpma sonrası gerçek kare karşılaştırması, dinamik ölçekleme + opaklık kombinasyonunun dışa aktarma pikselleri ve alpha düzeyi; eski animasyon, renk, fade, ses ve dışa aktarma iptali senaryoları hâlâ geçti.
- `npx tsx tests/keyframe-electron.ts` geçti: 160×90 sentetik resimle ölçek 1→2, konum X 0→40, opaklık 1→0.2 üç animasyon kurdu; eğri özelliği değiştirme, sürüklenme, bir geri alma, kopyala/yapıştır/sil, tam zaman girişi ve üç ön ayar ile animasyon sayfasında tamam; kayıttan sonra yeniden açınca kare kimlikleri, zamanlar, değerler, ön ayarlar ve pencere tutarlı; ardından 0–89 kare ön izlemesi alındı, dışa aktarılan 90 kare kare başına karşılaştırıldı; 32×18 örneklemde en yüksek ortalama mutlak fark ~6.42, ortalama ~1.18 (sınırdı 18); oynatma başı 3, 30, 57 kare `00:00:00:03`, `00:00:01:00`, `00:00:01:27` zaman kodları, dışa aktarma karelerindeki ortalama farklar sırasıyla ~6.42, 1.65, 0.50; en iyi eşleşme ilgili kare ya da bir sonraki kare içinde; son kare mavi kanalı 120’nin altında kaldı, opaklık animasyonu etkin; sayfa renderer hatası yok.
- `npm run typecheck`, `npm run build` geçti; `npx tsx scripts/i18n-audit.ts` 0 eksik literal ve 0 JSX metni.
- Son tam `npx vitest run` 347 test: 326 geçti, 6 atlandı, 15 başarısız. Başarısızlar mevcut çevresel senaryolardı: `assistantBackend` 12 (çoklu boşluklu geçici dizinde CLI fixture spawn/edilemedi ve protokol senaryoları da), `portableProject` 2 (Windows yol dizgisi doğrulaması ve bağlantı noktası `EPERM`), `mediaTools` 1 (PATH sürücü ön eki/büyük/küçük harf); bu tur kare modeli, dışa aktarma ve yeni masaüstü senaryoları geçti, başarısız modüller değiştirilmedi; tam sonuç tam yeşil sayılamaz.

Sınırlar: şimdilik üç tip sabit ön ayar var, özgür Béssel kontrol noktası ya da eğri ön ayar kütüphanesi yok. Kopyalama/ yapıştırma tamponu şu animasyon paneli örneğinde kalıyor; paneli boşaltma (örneğin geri alma) ile panel kalkarsa temizleniyor, proje arası panoya uygulunmaz. Önizleme/ dışa aktarma örneklem düzeneği ve toleransla; H.264 kaybı kodlaması ve çizge sentezi nedeniyle pikseller tam aynı olamaz; testler yalnızca makinede Windows FFmpeg 8.0, sentetik resim ve 160×90/30 fps projesiyle çalıştı, macOS/Linux gerçek donanımda ya da paketlenmiş kurulumda yeniden denendi değil. Aynı özellik tam sayı girişinde tekrarlanan zaman damgası üretirse değerlendirme son sıraki karei korur, arayüzde otomatik birleştirme yok.

## Altyazı bölme/birleştirme, toplu düzenlenebilir stiller ve metin animasyonu (2026-10-23)

Altyazı paneli “Böl / Birleştir” ve “Metin animasyonu” sekmeleri ekledi, mevcut “Genel stil”i genişletti: font, boyut, metin/çizgi/arka plan rengi, çizgi genişliği, satır yüksekliği, iç kenar boşluğu, köşe radyosu, kalınlık, arka plan ve hizalama doğrudan düzenlenebilir; referans altyazısından kopyalayıp tek alanı değiştirebilir. Tüm işlemler `prepareSubtitleEdit` ile klon üzerinde plan üretir, plan oluşturma anındaki JSON anına bağlanır; `applySubtitleEdit` değişen projeyi reddeder, sonrası yapılan düzenlemeleri korur. Yalnızca `TextStyle`’in düzenlenebilir alt kümesini kabul eder, metin, zaman, konum ve animasyon aynen kalır.

- Bölme: parça fps’sine göre oynatma başına dayanır, sol parça `[başlangıç, oynatma başı)`, sağ parça `[oynama başı, bitiş)`; iki taraf en az bir kare bırakır. Metin karakter oranına göre yakın noktalara göre keser, yoksa oran karakter konumuna düşer. `splitClip` zaman, kaynak aralığı, kareler ve fade penaltarını birlikte kırpar, yerel animasyon devam eder.
- Birleştirme: aynı kanalda ve devam eden/örtüşen altyazıları kabul eder; zaman en erken başlangıçtan en geç bitişe kadardır, metin satır sonuna göre birleştirilir, stil ve yerel animasyon en eski altyazıdan alınır. Birleşme sonrası eski kırpma/fade penaltarını kaldırır, yalnızca bir kısmının görünmemesi; döndürme/ ses kareleri korur.
- Animasyon: giriş `none|fade|slideUp|scale`, durağanlık `none|pulse`, çıkış `none|fade|slideDown|scale`; giriş/çıkış süreleri kareye asitleştirilir ve her altyazı için yarısından fazla tutulmaz. Mevcut `fadeIn`/`fadeOut` ve x/y/ölçek/opaklık karelerine doğrudan üretir, önizleme ve FFmpeg dışa aktarma aynı `evaluateFade`/`evaluateKeyframes` yolunu kullanır; bu özellikler değiştirilirken eski x/y/ölçek/opaklık kareleri kaldırılır, döndürme ve ses kareleri korunur.
- Dışa aktarma sınırı: SRT/WebVTT yalnızca zaman ve metin kaydeder, stil, konum veya animasyon taşımaz. Altyazı paneli sabit uyarı, dışa aktarma sonrası uyarı da açık; animasyonlu hali varsa video dışa aktar.

Doğrulama:

- `tests/subtitleEdits.test.ts` 38 test geçti: eski offset/değişiklik/tek tek düzenleme/kilit/eski plan/referans stili senaryoları, bölme sınırları ve noktalama konumlandırması, birleşme boşluk/ devam etmeyen/örtüşen kuralları, bölme/birleşme bir geri alma, doğrudan stil alanı doğrulama ve içerik/dönüşüm/zaman korunması, referans stili ve üst yazma kombinasyonu, giriş/ durağanlık/çıkış `evaluateFade`/`evaluateKeyframes` değerleri, eski görsel karelerin yeniden yazımı ve döndürme korunması, kısa altyazı süresi üst sınırı ve geçersiz ayarların kaynak projeyi değiştirmemesi.
- `tests/export.integration.test.ts` yeni gerçek FFmpeg senaryosu geçti: 2 sn altyazıya “yükseliş + nefes alma + kayma çıkışı (0.5 sn)” uygulandı, 20 fps dışa aktarıldı, örnekleme yapıldı, durağanlık parçasında parlak piksel sayısı 300’ün üzerindeydi ve giriş/çıkış karelerinden en az iki katıydı; dışa aktarma tarafının aynı animasyonu yaptığını gösterdi. Bu dosya tamamı FFmpeg 8.0 ortamında 22 testle geçti.
- `npx tsx tests/subtitle-electron.ts` 15 gerçek masaüstü kontrolü geçti, renderer hatası yok: Çinli ve İngilizce sentetik SRT (uzun cümle ve örtüşen zaman) içe aktarıldıktan sonra mevcut başlıklarla karışmadı; doğrudan değişiklik ve bir geri alma; toplu offset kareya dayalı; tek tek metin/zaman kaydetme; kilit ve eski plan koruma; referans stili; oynatma başına bölme (4.0–5.5 sn 4.0–4.5 ve 4.5–5.5 yapar, metin “tek tek”/“düzeltme altyazısı”) ve bir geri alma; birleşme (7.033–13.033 sn, metin satır sonuna göre birleşir) ve bir geri alma; doğrudan stil yalnızca seçili kaydı değiştirir; animasyon fade ve y/ölçek karelerine yazar; oynatıcı giriş, durağanlık, çıkış zamanlarındaki parlak piksel karşılaştırması; animasyon uygulama/geri alma/yeniden kullanma ayrı ayrı bir adım; SRT dışa aktarma yalnızca metin içerir ve ipucu stili/ konum/animasyon içermez; kayıt yeniden açınca 3 altyazı ve 4 zaman çizelgesi parçası korunur, geçmiş boş.
- `npx tsx scripts/i18n-audit.ts` 0 eksik; `npm run typecheck`, `npm run build` geçti; yeni altyazı/animasyon/stil alanları Türkçe sözlükte.
- Tam `npm test` (makinede FFmpeg 8.0 PATH) 358 test: 337 geçti, 6 atlandı, 15 başarısız; başarısızlar mevcut çevresel senaryolardı: `assistantBackend` 12, `portableProject` 2, `mediaTools` 1. Bu tur altyazı modeli, dışa aktarma ve masaüstü senaryoları geçti, bu modüller değiştirilmedi; tam sonuç tam yeşil sayılamaz. FFmpeg PATH’de yoksa medya/dışa aktarma testleri önce “ffmpeg bulunamadı” diye raporlar, bu çevresel eksiklik değil bu tur regresyonu.

Sınırlar: birleşme aynı kanalda ve seçili parçalar arasında kalan ortadaki altyazıları yok sayar; farklı metin kanalları arasında birleştirme yapmaz; bölme yalnızca karakter oranı ve yakın noktalara dayanır, kelime seviyesi ya da sözcük eşlemesi (Çarap OK) yok. Animasyon sabit ön ayarlardan ibaret, farklı eğrileri karıştırılamaz, metin şablonundan bağımsız özgür Béssel yok; `pulse`, çok kısa altyazılarda atlanır. Dosya biçimi kendisi stili/animasyon kaydetmez, SRT dışa aktarımdan içe aktarma bunları kaybetir; görsel alan karşılaştırması parlak piksel örneklemesi ve H.264 kaybı kodlamasıyla, pikseller tam aynı değildir. Tüm doğrulamalar Windows makinesinde, sentetik altyazı ve FFmpeg 8.0 ile tamamlandı, macOS/Linux gerçek donanımda ya da paketlenmiş kurulumda yeniden denendi değil.

## Video geri sarma ve sabit kare (2026-10-21)

Video geri sarma ve sabit kare ayrı uygulandı. Geri sarma seçili video parçasının gerçek kaynak aralığını (`sourceIn` ile `sourceIn + duration × speed`) alır, makinede FFmpeg ile ayrı cache MP4 üretir; video `reverse,setpts=PTS-STARTPTS`, ses varsa `areverse,asetpts=PTS-STARTPTS`, bu yüzden orijinal sesı görselle birlikte ters çevrilir. Bitince parçanın malzeme referansını değiştirip `sourceIn`’i sıfırlar, zaman çizelgesi başlangıç, süre, hız, kareler ve fade penaltarını korur; orijinal malzeme proje, medya kitaplığı ve diskte kalır. Cache kullanıcı veri dizinindeki `reverse-media` içerik adresli cache’idir, kaynak yol, boyut, değiştirilme zamanı, giriş ve süre hash’iyle yeniden kullanılır. Ana süreç yetkilendirmeli malzemeyi doğrular, aralığı ve sayıları ister, FFmpeg parametre dizisi ile başlatır; ilerleme `-progress pipe:1`’den gelir, iptal alt süreci bitirir ve geçici dosyayı siler.

Sabit kare oynatma başını kaynak video zamanına çevrilir, FFmpeg tek kare PNG’i `freeze-frames` içerik adresli cache’e çıkarır. Yeni parça metin kanalından sonra, normal video kanalından önce ayrı video kanalında durur, zaman çizelgesini değiştirmez; mevcut değerlendirme sonrası dönüşümü, renk, kırpma ve maskeyi miras alır, kareler ve fade penaltarını temizler, süre parça özelliklerinden değiştirilebilir. Sabit görüntü kendi sesi yok, altta video sesi aynen oynar.

- `tests/clipTools.test.ts` 7 test: geri sarma malzeme değişimi, kaynak aralığı koruması, cache malzeme yeniden kullanımı, kilit/ video/ süre/ orijinal ses reddi; sabit kanal düzeyi, mevcut dönüşüm ve efekt mirası, karelerin temizlenmesi, süre ve cache yeniden kullanımı, oynatma başı ve süre sınırları.
- `tests/clipMedia.integration.test.ts` 4 test gerçek FFmpeg 8.0: 3 sn 10 fps sentetik video 0.5 sn giriş, 1 sn süre geri sarıldı, çıktı kare sırası kaynak kareleri ters olarak karşıladı, süre ~1 sn ve ses korundu; kaynak dosya içeriği değişmedi ve yeniden içe aktarıldı; 0.75 sn sabit PNG doğru kaynak kareini işaret ediyor ve resim malzemesine içe aktarıldı; çalışırken 720p geri sarma iptal edilebiliyor, alt süreç bitince hedef dosya kalmaz.
- `npx tsx tests/clip-tools-electron.ts` masaüstü akışı geçti: kare bazlı renk sentez video içe aktarıldı, arayüzde geri sarma sonrası oynatıcı çizgisinde o aralık kareleri çizdi (tek kare sınırı toleransı), sonra kaydetme, geri alma/yeniden kullanma, oynatma başı 1 sn’de 1 sn sabit, kaydetmeden yeniden açma ve dışa aktarma. Dışa aktarma 90 kare; 0.5 ve 2.5 sn geri sarma sonrası kuyruk ve ilk kare, 1.25/1.5/1.75 sn aynı sabit kare, 2.25 sn geri sarmayı getiriyor; orijinal video SHA-256 değişmedi, sayfa hatalı yok.
- `npm run typecheck`, `npm run build` geçti; `npx tsx scripts/i18n-audit.ts` 0 eksik.

Sınırlar: FFmpeg `reverse` seçili aralığı bellek içinde tutuyor, bu proje 3 GiB tahmini üst sınır; 1080p30 ~34 sn, 4K30 ~13 sn, ötesinde önce bölme istenir; disk tabanlı kırpma cache yok. Geri sarma cache’i otomatik temizlemiyor, proje tarafından referanslanan cache silinirse yeniden açmada eksik malzeme olur. Şu an yalnızca Windows makinede sistem FFmpeg 8.0 ile doğrulandı, macOS/Linux gerçek donanımda yeniden denendi değil, paketlenmiş kurulumda yeniden build edilmedi. Sabit kare resim katmanı, kırpıp ileri sarma değil, bu yüzden altta ses ve sonrası görsel zamanı değişmez; sessizlik gerekirse altta ayrı işlem.

## Yerel Whisper otomatik altyazı (2026-10-20)

Yerel otomatik altyazı ayrı uygulandı: altyazı panelinde zaman çizelgesi sesli parça seçilir, makinede FFmpeg 16 kHz mono WAV çıkarır, yerel whisper.cpp CLI ve GGML modeli çağırır, JSON (`transcription[]`, `segments[]` ya da düz dizi) ya da SRT çöz, insan etiketlerini temizler, uzun cümleleri böl, parça başlangıcı, hız ve proje fps’sine göre yeni “Altyazı” metin kanalına yazar. Yazma mevcut `addSubtitles` reutilize eder, bir geri alma; bulut yok, program ya da model otomatik indirilmez.

- `tests/transcription.test.ts` 11 test: üç JSON şekli, milisaniye ofseti ve zaman dizileri, SRT geri dönüşü, gürültü etiket temizliği, uzun cümle bölme, hız çevrimi, parça aralığı ve zaman çizelgesi başlangıcı, kare hizalaması, örtüşmeyle işleme, tekrar eden cümle birleştirme ve 2000 üst sınırı.
- `tests/transcriptionTools.test.ts` 7 test: kaydetme seçimi, ortam değişkenleri, yerleşik dizin ve PATH önceliği; model bulma, geçersiz yol ve eksik araç; PATH’deki genel `whisper` (OpenAI Python CLI) otomatik seçilmez diye geriye dönük doğrulama.
- `tests/transcriptionRunner.test.ts` 2 yeni Unix sentetik süreç testi: başarılı çıktı ve iptal/temizlik; makinede Windows’ta atlandı, Unix gerçek donanımda çalıştırılmadı.
- `npx tsc --noEmit` ve `npm run build` geçti; `npx tsx scripts/i18n-audit.ts` 0 eksik.
- Son tam `npx vitest run` 343 test: 322 geçti, 6 atlandı, 15 başarısız. Başarısızlar 3 mevcut çevresel senaryo dosyasındaydı: `assistantBackend` 12, `portableProject` 2, `mediaTools` 1; bu tur geri sarma/sabit kare senaryoları geçti, bu modeller değiştirilmedi; tam sonuç tam yeşil sayılamaz.
- Windows sentetik uçtan uca kontrol: geçici derlenmiş sahte `whisper-cli.exe` ve sahte `ffmpeg.exe` ile Electron başlattı, bir 12 sn sesli proje içe aktardı, altyazı panelinde “Altyazı oluştur” düğmesine bastı; “1 otomatik altyazı oluşturuldu”, yeni “Altyazı” metin kanalı ve 1.8 sn “Merhaba dünya” parçası (30 fps’te 00:00:01:24) gözlendi; arayüz hatası yok. Bu kontrol UI → preload → ana süreç doğrulama → sonuç çözümleme → zaman çizelgesi yazma zincirini doğruladı, ama sahte FFmpeg WAV üretmedi, sahte Whisper sesi okumadı; gerçek çıkarım/ tanıma kalitesi kanıtlanmadı.
- Türkçe arayüz kontrolü: Whisper eksikliğinde ve sahte çalıştırılabilir/ model seçiminde bulanan durumlar ekran görüntülenildi; hazır durumda “Altyazı oluştur” düğmesi kullanılabilir; kontrolde global `.small-button` `.primary` arka planını kapattı, ayrı `.subtitle-generate` stil ile düzeltilip tekrar vurgu rengi olarak doğrulandı.

Kapsam dışı: makinede whisper.cpp çıkarımı ve GGML modeli yoktu, FFmpeg da yoktu; gerçek ses çıkarma, gerçek whisper.cpp tanıma ve kalite değerlendirmesi yapılmadı; macOS/Linux gerçek donanımda yeniden denendi değil; paketlenmiş kurulum yeniden build edilmedi. Sentetik betikler `.test-output/` içinde, depo testi değildir.

## Başlık şablonu genişletmesi ve metin yerleşimi (2026-10-20)

Metin şablonları 16’dan 25’e çıkarıldı, “Altlık üçte bir” ve “Sosyal medya” kategorileri eklendi, satır yüksekliği, iç kenar boşluğu, köşe radyosu ve metin gölgeleme eklendi. Önizleme çizgesi ve dışa aktarma PNG’leri `src/core/textLayout.ts` ile aynı geometri hesabını kullandı, gölge için şeffaf pay bıraktı.

- Proje doğrulayıcı `lineHeight` 0.8–3, `padding` 0–1.5, `radius` 0–2, gölge bulanıklığı 0–200 ve ofset ±200 kabul ediyor; 25 şablon parametresi bu aralıkta; eski projeler bu alanları 1.3/0.25/0 varsayılanla geri aldı, geometri sonuçları eski sürümle aynı.
- Yeni `tests/text-layout.test.ts`, `tests/text-templates.test.ts` ve `tests/text-render.test.ts`: varsayılan geometri uyumluluğu, çok satır ve hizalama, köşe toparlanması, gölge payı, şablon benzersizliği ve kategori kapsamı, çözünürlük ölçekleme, kare üretimi; `@napi-rs/canvas` ile asıl çizim, köşe arka planı ve gölge ile katman.
- `npx tsc --noEmit` ve üretim build geçti; `npx vitest run` 312 test: 293 geçti, 4 atlandı, 15 başarısız — hepsi makinede mevcut olan (assistantBackend 12, portableProject 2, mediaTools 1); bu turla ilgili değil. `npx tsx scripts/i18n-audit.ts` 0 eksik.
- `npm run test:creative` masaüstü akışı 5 kontrol geçti: 25 şablon kartı ve kategori sayısı, hover animasyonu ön izleme, arama boş durumu, veri kartı `radius` 0.2 / `padding` 0.4 ile proje yazıp bir geri alma, Çinli başlıklı 5 sn MP4 gerçek dışa aktarma.
- Ek olarak Electron’da “İsim alt üçte bir”, “Veri kartı”, “Neon etiket” ön izlemesi ve oynatıcı gösterimi elle doğrulandı, metin özelliklerinde satır yüksekliği ve gölgeyi ayarlayıp kaydetti; proje JSON’i `lineHeight` 1.5 ve gölge parametrelerini taşıyor.

Kapsam dışı: bu tur paketlenmiş kurulum yeniden build etmedi, 4K görsel çıktısı için ayrıca gölge payı dışa aktarma denemesi yapılmadı; macOS/Linux gerçek donanımda yeniden denendi değil.

## v0.5.1 eklenti tekrar başlatma düzeltmesi (2026-10-19)

Kullanıcı kısa süreli CevikEdit açılmasını rapor etti. Süreç kanıtı önceki Dock düzeltme sürümünün çalıştığını; fakat her MCP bağlantısında koşullu olmayan Electron alt süreci oluşturuluyordu; aynı konak aynı süreç içinde birden fazla bağlantı kurulabiliyordu. Önce yalnızca uygulama JavaScript’inde Dock gizlemesi ile bağlantı öncesi başlangıç evresi kapsanmadı.

- Python launcher artık isteğe bağlı proxy: initialize, ping, tools/list, resources/list, resources/templates/list ve sabit UI kaynağı okuma uygulamayı başlatmaz; ilk gerçek tools/call’ta bir alt süreç başlatır; hata sonrası otomatik yeniden başlatma ya da yeniden oynatma yapılmaz.
- macOS uygulama `LSUIElement=true` bildirimi; normal masaüstü başlangıcı açıkça regular politikasını geri getirir, eklenti accessory kalır. İmza sıkı doğrulaması geçti.
- `python3 tests/plugin-launcher.py` altı regresyon testi geçti: sürekli bulma ve kaynak okuma uygulama başlatmaz, ilk araç çağrısı bir kez başlatır, EOF ve SIGTERM kayıtları kurtarır ve çıkışı, hata alt süreci yeniden başlatmaz, bozuk kaynak reddeder, uygulama yokken araç bulunur.
- Gerçek 0.5.1 paketlenmiş uygulama yeni launcher ile tam eklenti protokolü, içe aktarma, düzenleme, çakışma reddi, geri alma/yeniden kullanma, ekran görüntüsü ve kopma kaydı regresyonunu geçti. Boş PATH’deki masaüstü başlangıç, Dock ikonı, font/ön izleme ve 9 sn Çinli metinli+sessizli video dışa aktarımı geçti; renderer hatası yok. Üretim build ve tip kontrolü geçti.
- Dock yaşam döngüsü özel testi geçti, 20 arası ekran görüntüsü penceresi ya da Dock göstermiyor. Makinede eklenti 0.5.1’e güncellendi, eski kayıt girişi yeni isteğe bağlı launcher ile senkronize edildi, eski örnekler normal çıkış isteği gönderip kurtarma verisi korudu.

Makineye uygulama: `release/v0.5.1-lazy/mac-arm64/CevikEdit.app`. Bu yerel düzeltme, GitHub v0.5.0’un yayın ekiyle değiştirilmedi. Windows/Linux gerçek donanımda yeniden denendi değil.

## v0.5.0 GitHub ön izleme paketi (2026-10-13)

Yayın eki gerçek Apple Silicon makinede yeniden build edildi, arka plan eklenti Dock düzeltmesi içeriyor. Eki ad-hoc imzalı, Apple resmi olmadı; Windows/Intel Mac/Linux bu ikili yayın kapsamında değil.

- Tip kontrolü ve üretim build geçti; aynı ürün kodunun temel regresyonu 293 test: 293 geçti, 1 libx265 eksikliği atlandı.
- Gerçek paketlenmiş uygulama depo dışı çalışma dizininde, boş `PATH` ve izole kullanıcı dizininde başladı, font, küçük görünüm, ön izleme, render izolasyonu ve yerleşik FFmpeg/FFprobe doğrulandı, 1280×720, 9 sn, Çinli altyazı ve karıştırılmış sesli video dışa aktardı; renderer hatası yok.
- Gerçek paketlenmiş uygulama eklenti protokolü, içe aktarma, atomik düzenleme, sürüm çakışması, geri alma/yeniden kullanma, ekran görüntüsü, kopma kaydı ve çıkış senaryoları geçti. Uygulama içi ana süreç, preload ve eklenti HTML’i bu build ile birebir aynı.
- `codesign --verify --deep --strict`, `hdiutil verify` ve eklenti ZIP bütünlüğü doğrulandı. Paket içinde medya araçları için kaynak, build betiği ve lisans; özel proje ya da araştırma örnekleri yok.
- GitHub ilk CI Linux çekirdeği geçti, macOS/Windows çekirdeği ve bulut build görevi hâlâ başarısız, çözülmedi; yerel paket doğrulaması CI tam yeşili yerine geçmez. Detay: [ilk çalıştırma](https://github.com/Xiangyu-CAS/rea-capcut/actions/runs/38387098585).

Eki ve SHA-256:

| Dosya | SHA-256 |
| --- | --- |
| `CevikEdit-0.5.0-arm64.dmg` | `ee23ae803a064d34e79ba68282959188fc7ff9b48649fee21b1aa0c0a8344849` |
| `CevikEdit-0.5.0-arm64-mac.zip` | `2586d1e187a9af0780ee8dc7a69a8a958b793fb6a0fc9926596db64de1f1c9ff` |
| `CevikEdit-plugin-0.5.0.zip` | `05abdeb012d46a44c3a2df5a0a3a59421634248b826673ea83ae2af77b324e8a` |

Makine kanıtı: `.test-output/package-electron/evidence.json`, `.test-output/plugin-electron/evidence.json`.

## macOS eklenti Dock düzeltmesi (2026-10-13)

Arka plan eklentisi accessory aktivasyon politikasına geçti; masaüstü penceresi gösterilirken normal, kapatılınca Dock ikonunu gizler ve düzenleyiciyi korur. `tests/plugin-dock-electron.ts`, izole dizinde üç durum ve 20 arası ekran yenilemesiyle pencerenin ya da Dock ikonunun gösterilmediğini doğruladı; tip kontrolü ve üretim build geçti. Düzeltme `release/plugin-dock-fix/mac-arm64/CevikEdit.app` içinde; paketlenen eklenti protokolü, malzeme içe aktarma, düzenleme, geri alma/yeniden kullanma, ekran görüntüsü ve kopma kaydı regresyonu geçti, sıkı imza doğrulaması geçti. Makinede eklenti yapılandırması düzeltilmiş uygulamaya işaret ediyor. Sonraki adım: eski bağlantının hâlâ eski uygulamada olup olmadığı, boş proje kayıtlı değişiklik yoksa normal çıkışın doğrulanması; düzeltilmiş sürümü Codex konakında yükleme son doğrulaması henüz alınmadı. Aşağıdaki bu turda üretilen DMG bu düzeltmeyi içermiyor.

## v0.4.2 metin / etki / geçiş kütüphanesi (2026-10-13)

16 düzenlenebilir metin şablonu, 8 kare animasyonu ve 8 geçiş; mevcut 8 renk ön ayarı küçük görünümü iyileştirdi. Tüm formüller bağımsız olarak yazıldı, ön izleme görselleri yerleşik orijinal malzeme; ayrıntılar `CREATIVE_LIBRARY.md`.

- Tip kontrolü ve üretim build geçti; yerleşik FFmpeg/FFprobe ile tüm birim ve entegre test, 24 dosyada **293 test geçti**, 1 libx265 eksikliği atlandı.
- Formül odaklı 23 test geçti: duyarlanabilir düzenlenebilir metin, kilitli yeni metin kanalı, atomik geri alma, kare koruma, geçiş süresi uyumu ve kısa parça/ boşluk/ sonrası çakışma koruması. Yumuşak geçişler geçiş sonrası sayısal değeri orijinal eğriyle aynı.
- Tüm 8 geçiş ve 8 animasyon için FFmpeg dışa aktarma resmi yapıldı, geçiş öncesi/sonrası ve orta pikseller, kayma yönü, üst üste bindirme parlaklığı, arka plan üzerinde, ölçek alanı ve animasyon kare değişimi kontrol edildi. Dinamik ölçek giriş boyutuna döndüğünde FFmpeg 9 filtre hataları bulunup, açık planya/packed RGB dönüşüyle renk ve alfa korundu.
- Mevcut masaüstü üst üste bindirme regresyonu geçti: orta kare RGB `[127,0,128]`, dışa aktarma `[127,0,127]`, karıştırılmış parlaklık tam; ses çapraz geçiş RMS ~0.06354; varsa fade penaltıları korunma doğrulaması.

Makineye uygulama `release/creative-library/CevikEdit-0.4.2-arm64.dmg`; SHA-256: `6e8861664176d5838f077cb9e453449bea90c10784248184b51ec6d3eea005e8`.

- Orijinal makine kanıtı: `.test-output/creative-final-tests.log`, `.test-output/creative-library-electron/evidence.json`, `.test-output/transition-electron/evidence.json`. Paket doğrulaması, üçüncü parti medya kombinasyonlarının tamamının kapsanmadığını söylemez.

## v0.4.1 yerleşik malzeme genişletmesi (2026-10-13)

Malzeme 34’ten 64’e çıkarıldı: 28 sticker, 14 arka plan, 12 başlık altı, 10 sentetik ses efekti. Orijinal 34 medyanın SHA-256’i öncekiyle aynı. Üretim kodu, SVG kaynak, ses sentezi formülü, lisans ve dosya listesi korundu; yeni malzeme ön izinleri `npm run assets` ile 64 malzeme ve iki ön izleme tablosu; `vitest run tests/builtinAssets.test.ts` 4 test geçti, tüm malzemelerin boyut/şeffaflık/dosya parmak izi/SVG dış kaynak kısıtı ve WAV biçimi/ süre/RMS/ peak/ baş- son fade kapsamında.

- Paket kurulumu `release/assets-expanded/CevikEdit-0.4.1-arm64.dmg`; SHA-256: `8a4dfd26a1ebbb159d3d9d1e4612f430a85ef9527420963841a063df02a12434`. Orijinal makine kayıtları `.test-output/builtin-assets/`, `.test-output/assistant-assets-electron/`, `.test-output/assets-expansion/` içindedir.

## Commit hazırlığı gözden geçirme (2026-10-13)

Yerleşik FFmpeg/FFprobe ile `npm run check` yeniden çalıştırıldı: tip kontrolü, üretim build geçti, 22 test dosyasında 270 test geçti, 1 libx265 sentetik test atlandı. Masaüstü temel iş akışı yeniden geçti, içe aktarma, oynatma, düzenleme, geri alma, metin/altyazı, kaydetme yeniden açma ve gerçek video dışa aktarımı kapsamında; renderer hataları ve medya başarısız listesi boştu.

Dışa aktarma ekran görüntüleri artık test, ekran görüntüsü alırken çıktı yolu kapatıyor, makine kullanıcı adı belgesine giremesin. Bu değişiklik yalnızca test ekran görüntüsü; uygulama dışa aktarma yolu ve davranışı aynen kaldı. Orijinal test sonuçları `.test-output/commit-prep/` ve `.test-output/app-electron/` içinde saklandı.

## İkon yönü güncellemesi (2026-10-13)

Kullanıcı isteği üzerine sol çapraz kapan tarzı ikon yeniden çizildi, PNG, SVG, ICNS ve ICO üretildi. `npm run icons` ve `npm run build` (tip kontrolü dahil) geçti. Gerçek paketlenmiş uygulamanın başlangıçta yeni ikon yüklenmesi doğrulandı, paket içi PNG/ICNS ve kaynak ürün kopyası baytlarında aynı; renderer hataları yok; uygulama sıkı derin imza doğrulaması ve DMG doğrulaması geçti. Bu tur ikon değişikliği yüzünden tam medya regresyonu tekrar çalıştırılmadı.

Yeni paket: `release/icon-refresh/CevikEdit-0.4.0-arm64.dmg`; SHA-256: `076053f5a303dba6eace0b13921c0ab49ded74f9ba3e1cbfd64a60b08ba359cd`. Aşağıdaki eski v0.4.0 paketi ve kaydı aynen. Yeni paket macOS arm64, yerel ad-hoc imza, Apple resmi olmadı. İkon özel denemesi: `.test-output/icon-refresh/verification.json`.

## v0.4.0 arayüz ve iş akışı paketi doğrulaması (2026-10-13)

22 test dosyasında 270 test geçti, 1 libx265 sentetik test atlandı; tip kontrolü ve üretim build geçti. Yeni özellikler ve farklar `IMPROVEMENTS_V040.md`, arayüz karşılaştırması `UI_PARITY.md`.

Son DMG salt mount edilip kopyalanan uygulama, yedi masaüstü kabul setinde **45 kontrol** geçti, renderer hataları yok: temel paket 7, malzeme/CLI sentetik protokol 12, altyazı düzenleme 8, malzeme paketi/ aralık 6, kaynak malzeme ön izleme 4, üç sütun yerleşimi 5, 300 cümle altyazı projesi 3. CLI sentetik protokolü Claude çevrimi çevrilmez; gerçek Codex’in mevcut kapanış halkası kanıtı ayrı.

Paket temel seti yerleşik FFmpeg/FFprobe 9.0.2, Noto ve native canvas ile gerçek dışa aktarma 1280×720, 9 sn Çinli başlık + karıştırılmış ses doğruladı; kaynak ön izleme ve aralık ayrı ayrı bir sn mavi kaynak görseli ve duyulabilir ses dışa aktardı. Malzeme paketi taşındı ve orijinal dosyalar kullanılamaz kaldı, yine ön izleme/satın/alabiliyor; eksik malzeme dışındaki diğer düzenlemeler kaydedildi.

Üç sütun sürüklenme/klavye mikro ayarı, uygulama yeniden başlatma hatırlaması, çift tıklama kurtarma, 1024×720 küçük pencere ve oynatıcı denetim sınırları geçti. 15 dakika, 300 cümle sentetik altyazı projesi toplu offset/kaydetme ve bir geri alma geçirdi; tek seferlik otomasyon süresi: başlangıçtan zaman çizelgesine 542ms, arama 46ms, kontrol/uygula/kaydet 230ms, geri alma/kaydet 150ms, otomasyon etkileşimi dahil.

DMG hdiutil doğrulaması VALID, ZIP bütünlüğü, sıkı ad-hoc imza ve imge/iç ASAR parmak izi tutarlılığı geçti; imzalar için [doğrulama kaydı](VALIDATION.md). İmza yerel ad-hoc, Apple resmi olmadı. Görüntü: ...

Tablo:

| Ürün | SHA-256 |
| `CevikEdit-0.4.0-arm64.dmg` | `ae577f3403d8d938ec689e50922b7dcf1c9dc0d741159ef7f34f308a6420e74c` |
| `CevikEdit-0.4.0-arm64-mac.zip` | `c17d23ef3f65151dda8fba167fbe4e5f049b972e6a29c3b63136bf955001e7d9` |

Makine kanıtı dizinleri: package-electron, assistant-assets-electron, subtitle-electron, portable-range-electron, source-preview-electron, workspace-electron, large-subtitles-electron; hepsi gitignore edilen `.test-output` içinde. Sekmiş eski masaüstü regresyonu da geçti; oynatıcı son yerleşim değişikliği sonrası ayrı regresyon yaptı. Windows/Linux ve ticari KısaFilm tam eşleşmesi bu tur kanıt kapsamında değil.

## v0.3.0 entegre paket doğrulaması (2026-10-13)

17 test dosyasında 209 test geçti, 1 libx265 sentetik test atlandı; tip kontrolü, build ve Git diff boş kontrolü geçti. 27 adet asistan düzenleme testi ve 18 CLI backend testi işle doğrulaması, atomik hata, kilit, özet alanı/bellek, tarih, iptal, protokol ve istisna kapsamında; çekirdek yeni bir kare float sınır regresyonu.

Son DMG `hdiutil verify` geçti, salt mount sonrası kopyalanan `.app` `codesign --verify --deep --strict` geçti. ZIP bütünlüğü geçti. Paket içi 4.090 ASAR kaydı araştırma örnekleri, test ya da analiz edilen özel kütüphane içermez. İmza yerel ad-hoc, Apple resmi olmadı.

DMG’ten kopyalanan uygulama boş `PATH` ve izole kullanıcı diziniyle başladı: orijinal paket seti 1280×720, 9 sn, Çinli başlık + karıştırılmış sesli video dışa aktardı; yeni malzeme/ asistan seti 12 test geçti, PNG/WAV içe aktarma, şeffaf üst üste bindirme, bir geri alma, iki CLI sentetik protokolü, öneri uygulama, proje değişince eski öneri reddi, tarih kurtarma, iptal ve sonraki istek; yeni kombinasyon arayüzden dışa aktarıldı, 640×360, 5 sn video; gerçek ayrıştırma ilk karede arka plan/sticker/metin; ilk saniye RMS ~0.146348; iki set render hataları ve medya hataları yok.

CLI sentetik süreç testi çevrimi çözmedi; gerçek Codex de “özet fonksiyonu → servis yanıtı → öneri doğrulama/uygulama” sentetik başlık kapanış halkasında geçti; Claude gerçek çağrısı giriş/ kimlik doğrulaması hatalı döndü, yalnızca protokol testi geçti. Kullanıcı CLI’yı kendisi kurup normal giriş yapmalı; paket CLI ya abonelik içermez. Detay: [Asistan](ASSISTANT.md).

[Masaüstü arayüz ekran görüntüsü](screenshots/assistant-assets.png). Özel yeniden üretilebilir kayıt: `.test-output/v030-check.log`, `package-electron/evidence.json`, `assistant-assets-electron/evidence.json`, `assistant-backend/real-codex-generated-context.json`.

| Paket | SHA-256 |
| `CevikEdit-0.3.0-arm64.dmg` | `9abe83a5b630e3bc7952dd50f9976d1923e7a7068edb3cd2b675a79c247cb662` |
| `CevikEdit-0.3.0-arm64-mac.zip` | `c27e36e1251a7095335cce36f2047da6afd29b7e12e4588cd18c621a739ff22a` |

Tarih: 2026-10-13, Asia/Shanghai. Bu kayıt yalnızca CevikEdit’in bağımsız uygulaması üzerinde makine kanıtı gösterir, ticari KısaFilm tam eşleşmesi kanıt etmez ya da KısaFilm’in statik dizelerini/test betiklerini/build yapılandırmalarını çalıştırılmış işlev sanmaz.

## v0.2.1: yerleşik FFmpeg paketi

2026-10-13, bağımsız build FFmpeg/FFprobe 9.0.2 ile `npm run check`: 14 dosyada 159 test geçti, 1 atlandı; tip kontrolü ve üretim build geçti. Atlanan test libx265 sentetik kod üretme gerektirir; paket x265 içermez. Ayrıca kendisi üretilen HEVC/AAC dosyaları ile yerleşik araçların gerçek keşfi, HEVC decode, H.264 ön izleme proxy’i, mavi kare piksi ve ses koruma doğrulamaları geçti.

Son DMG salt mount edilip kopyalanan uygulama, boş `PATH`, FFmpeg/FFprobe ortam kapaması ve izole kullanıcı diziniyle başladı; sistem bilgisi `.app/Contents/Resources/media-tools/` içindeki iki aracı döndürdü; gerçek küçük görünüm/ön izleme ve 1280×720, 9 sn, Çinli başlık + karıştırılmış sesli UI dışa aktarması geçti, renderer hataları yok. Dışa aktarma sonrası keşif de paket içi FFprobe kullandı. Paket içi taslak içe aktarma ayrıca 16 testle geçti.

Görüntü, ZIP bütünlüğü, sıkı ad-hoc imza ve imge/iç ASAR parmak izi tutarlılığı geçti; kaynak paket ve DMG kopyası uygulaması ASAR parmak izinde aynı. Medya araçları yalnızca `/usr/lib/` ve `/System/Library/` ile sınırlı, Homebrew dinamik kütüphane bağımlılığı yok. Üç kaynak arşivi ve build betiği SHA-256’lerle karşılaştırıldı, GPL lisansı ve ilgili kaynak paket içindeki lisanslarla; imza yerel ad-hoc, Apple resmi olmadı; şu an gerçek makinede macOS arm64.

| Ürün | Boyut | SHA-256 |
| `CevikEdit-0.2.1-arm64.dmg` | 192668253 | `e47d0472da3f78cf82684226579278109ee87d432b59328499b6aff270ac9a47` |
| `CevikEdit-0.2.1-arm64-mac.zip` | 192236273 | `f986bd2f3340243baa179b73a8dffeea1e3be174c20b3d5d9a66af15c03b7f41` |

[Yerleşik araç ve yeniden build](MEDIA_TOOLS.md) · [Build kaynak listesi](media-tools-build.json)

## v0.2 ikinci tur doğrulama (geçmiş)

2026-10-13, `npm run check`: **155 test geçti, 13 test dosyası geçti, sıra dışı yok**, tip kontrolü ve üretim build geçti.

Yeni doğrulamalar:

- `capcutCodec`: kendisi üretilen sabit bilinen cevaplar, bozma ve kırpma, sıkı Base64/UTF-8/nesne doğrulaması, boyut sınırları.
- `capcutProject` / `capcutProjectIO`: modern zaman çizelgesi dizini, etkin öneri, açık seçim, salt okunur kaynak, yol ve okuma sınırları, boş kök proje geri düşmesi yok.
- `capcut-import-electron`: 16 gerçek masaüstü kontrolü, opak girdiden çizge/ kaydetmeye zinciri, seyrek boş zaman çizelgesi, iptal/ eşzamanlılık/token yaşam döngüsü, kimlik doğrulaması başarısızlığında orijinal projenin korunması.
- `export.sampling`: her kare kimlik malzemesi doğrulaması 1.5×, 0.5×, 24→30, 30→24 fps, kare hizalanması/ yanlış kırpma, uzun GOP/B kare sonrası seek ve VFR büyük/ düzensiz örnekleme, 10 adet; gerçek medya her kare karşılaştırması, dizgi karşılaştırması değil test.
- Özel gizli kontrollü taslak kabul: normal dosya menüsü, açık etkin zaman çizelgesi, 640×360 çizge, video/metin katmanı, siyah köşe, gerçek medya keşfi, 0.5 sn görsel ve kaydetme parametresi; sayfa/medya hataları yok, orijinal yük SHA-256 değişmedi.
- KısaFilm dışı karşılaştırma: 90 kare/3 sn, 2 sn video ve 3 sn metin, 8 örnek kare hepsi aynı; video konvex IoU medyanı ~98.44%, ses RMS farkı ~−0.00257 dB. Font yerleşim sadakat söz konusu değil.

REA + Ghidra resmi tersine derleme Evidence, ek inceleme, kimlik doğrulama ve ürün testleri ayrı kayıtta. Özel kontrollü yük ve tam decode verileri yalnızca makinede ignore dizininde.

En son build ayrıca 8 masaüstü regresyonu tamamladı (düzenleme dışa aktarma, görsel araçlar, kaydetme kurtarma, oynatıcı, ses, kanal, geçiş, taslak içe aktarma), hepsi renderer hatalı yok. Son DMG salt mount edilip kopyalanan uygulama izole cwd/ kullanıcı dizininde başladı, 9 sn Çinli başlık/karıştırılmış sesli video dışa aktardı; aynı paket 16 adet taslak içe aktarma kontrolünden geçti, `packaged=true`.

v0.2 paketinin hdiutil doğrulaması, ZIP doğrulaması ve sıkı ad-hoc imza kontrolü geçti; imza yerel ad-hoc, Apple resmi olmadı. Paket içi 4.023 kayıt `.research`, test ya da analiz edilen özel kütüphane içermez; düzenleyici ters araç bağımlılığı yok.

| Yerel ürün | SHA-256 |
| `CevikEdit-0.2.0-arm64.dmg` | `a3d18dfba8b2abf5bc393cdb5eb90c2e9a91cfbfc3f665f7c031c88fa9089e2b` |
| `CevikEdit-0.2.0-arm64-mac.zip` | `f67ce443ebe5965587ea1f6364de0559909d211d92d2fedb59a6a411344f05c2` |
| `app.asar` (build ve DMG kopyası aynı) | `551bd5cf9f6706542574c861574f4de3a044efa5ab8e24b6eb8a388590db3333` |

[Zaman çizelgesi seçim ekran görüntüsü](screenshots/draft-timeline-choice.png) · [kontrol edilen taslak içe aktarma sonrası CevikEdit](screenshots/draft-import-editor.png)

## İlk tur v0.1 ortam ve çalıştırma kaydı (geçmiş)

Makine macOS arm64 idi; Node.js `26.11.1`, Electron `44.7.0`, Vitest `5.0.4`, electron-builder `26.15.3`. Sistem FFmpeg `9.0.2`, bağımsız süreç, uygulama ile dağıtılmadı. Uygulama kaynakları düzenlenmiş sonra TypeScript kontrolü ve Vite/Electron derlemesi; makinede TypeScript kontrolü ve Vite/Electron derlemesi geçti. Son tam test kaydı 05:28:34. İzole `.test-output/fresh-install/` içinde `npm ci` 405 paket kurdu, native canvas, esbuild ve Electron kullanılabilirliğini gerçek kontrol etti, salt var olan node_modules başarısız sayılmaz.

Vitest yapılandırması yalnızca `tests/**/*.test.ts` topluyor, `.research/` ve build dizinlerini dışlıyor. İlk tur kaydı **104 test geçti, 9 test dosyası geçti**; makinedeki Vitest önbelleğinde ilgili 9 `tests/` dosyası da başarısız yok. Eski önbellek daha önce araştırma araçları taramasıyla ilgili girdi olabilir, bu girdiler şu CevikEdit test kapsamına değildi.

## Temel ve gerçek render

| Doğrulama kaynağı | Kanıt kapsamı |
| `tests/model.test.ts` | Kaynak/ hedef zaman matematikleri, split/trim/speed, kilit, animasyon ve fade penaltaları, güvenilmeyen proje alan bazlı doğrulama, crop/key/mask opsiyonel alan sınırları |
| `tests/store.test.ts` | Geçmiş snapshot izolasyonu, geri alma/yeniden kullanma, transaction, kanal uyumluluğu, çoklu seçim hareketi, malzeme kümeleme, pano, manyetik aralık birleşimi ve fade sıfırlama |
| `tests/capcutImport.test.ts` | Sentetik classic boş metin JSON’in temel dönüşümü, uyarılar, yol ve sayı sınırları; mevcut KıpyFilm taslak uyumluluğu kanıt etmez |
| `tests/timeline.test.ts`, `tests/visual-ui.test.ts` | Zaman çizelgesi yerleşimi/ asitleme/ dalga çizgisi ve görsel parametre paneli temel anlama |
| `tests/export.integration.test.ts` | Gerçek FFprobe/FFmpeg içe aktarma, küçük görünüm/dalga/ proxy, kaynak giriş/ speed/ gecikme, yükseklik, görsel sentez, Çinli metin, kareler, renk, alpha, fade, ses/zil ve iptal hedef koruması |
| `tests/export.visual.test.ts` | Kaynak alan crop, RGB kırpma, dikdörtge/elips/ yumuşatma/ tersleme maske ve gerçek FFmpeg çıktı pikselleri; kaynak gösterim oranı ve alpha’lı malzeme dahil |
| `tests/export.offline.test.ts` | Yerel liste HTTP fragman içeriyorsa, FFprobe/FFmpeg erişim reddeder, test servisi istek sayısı sıfır |
| `tests/export.shutdown.test.ts` | Uygulama çıkışında medya/dışa aktarma süreçlerini durdurur ve geçici sonuçları temizler |

Dışa aktarma testleri kare çözümü, piksel karşılaştırması, FFprobe çıktı boyutu/süresi, ses RMS ve yükseklik kanıtı içerir, yalnızca süreç kodunu kontrol etmez. Video sıkıştırma, örnekleme ve niceleme testte bildirilen toleranslarla; tüm kare piksellerinin aynı olduğu söz konusu değil.

## Derlenmiş masaüstü iş akışı

`tests/app-electron.ts` derlenmiş Electron ana sürecini başlatır, izole `CEVIKEDIT_USER_DATA` ve kendisi üretilen medya kullanır. Dosya diyaloğu yalnızca test amaçlı Electron sürecinde değiştirilir, düzenleme gerçek sayfa kontrolleri ve kısayollarla yapılır.

Makine okuma `.test-output/app-electron/evidence.json` **2026-10-13 05:33:12 (Asia/Shanghai) geçti**, `errors` ve `mediaFailures` boş; gerçek kırmızı/mavi küçük görünüm piksi, oynatıcı decode/oynatma, zaman çizelgesi bölme kaynak girişi, geri alma, masaüstü kopyala/yapıştır kısayolu, ses özellik seçimi, metin kalıcılığı, renk/speed/kare, SRT içe aktarma, proje kaydetme/yeniden açma, medya yükleme, çizge boyutu ve gerçek video dışa aktarma; çıktı FFprobe ile **320×180, 5 sn** video olarak doğrulandı.

Ekran görüntüleri:

- [Masaüstü düzenleyici](screenshots/electron-editor.png)
- [Masaüstü dışa aktarma tamamlandı](screenshots/electron-export.png)

`tests/visual-ui-electron.ts`, izole Electron ortamında kırpma, renk kadranı ve maskeyi işler. `.test-output/visual-ui-electron/evidence.json` **2026-10-13 05:33:16 geçti**, renderer hataları yok; üç gerçek dışa aktarma video ayrı ayrı 320×180 doğrulandı:

- Dört quadrant resmi üst sol bölgeye kırpıldı, ön izleme ve dışa aktarma merkezini kırmızı korur.
- Elips maske tersleme sonrası, ön izleme ve dışa aktarma çizge arka planını gösterir.
- Yeşil arka plan/kırmızı ön plan malzemesi, ön izleme ve dışa aktarma yeşili çıkarıp kırmızılığı korur.

Testler yüzdeleri kaydetme, minimum geçerli genişlik, ilk devre dışı, temizleme etkisi, kilit devre dışı kontrolleri de doğruladı; ekran görüntüsü `electron-visual-tools.png` bakın. Bu MP4ler son çizge sentezi sonucudur, bağımsız alpha kanalı iddiası yok.

## Font, lisans ve araştırma kanıtı

Yerleşik orijinal Noto Sans SC fontu ve OFL dosyası byte sayımı, SHA-256 ve Git blob SHA-1 ile doğrulandı. `npm run licenses` **118 kayıt, 218 dosya** topladı, açık kalınan yok; sahiplik yolu ve SHA-256 liste doğrulandı, Electron/Chromium, canvas native bileşenleri, Skia ve font OFL dahil.

Son iki masaüstü evidence JSON `fonts.browserFaces=1`, `browserLoaded=true`, `browserCheck=true`, `nativeIncludesNoto=true` kaydını taşıyor: Chromium gerçekten yerleşik Noto Sans SC’i yükledi, native yazı motoru aynı font ailesini sundu. Bu, yerleşik build’te font kaydı ve gerçek tarayıcı yüklemesini kanıt eder, her işletim sisteminde font davranışı aynı olmadığı anlamına gelmez.

İlk tur: REA CLI ve MCP kurulum paketi ve özel yeni taslak üzerinde sınırlı araştırma; MCP gözlem yalnızca açıkça PID/window’a bağlandı, bitince kapatıldı. Malzeme ön izleme ve seçili üç saniyelik zaman çizelgesi örneği kanıt ID/ ekran görüntüsü parmak izi/ çıkarım/ bilinmeyenler `REA_FINDINGS.md` bakın. Özel mevcut kullanıcı taslakları okunmadı, opak taslaklar çözülmedi, ödenen/ hesap bazlı yetenek çağrılmadı.

## Ek masaüstü regresyonları

Yeni masaüstü regresyon kanıtları:

| Yerel kanıt | Makine geçişi | Kapsam |
| --- | --- | --- |
| `.test-output/storage-electron/evidence.json` | 05:35:43 | Kaydetme sırasında yeni düzenleme hâlâ dirty, çıkış iptali, son durum kaydetme, yeniden açma otomatik kurtarma, kaynak kayıp, yeniden bağlama aynı anda düzenleme, proje değiştirme kaydetmede eski yola takılma yok |
| `.test-output/audio-electron/evidence.json` | 05:32:39 | MKV yerel proxy, UI ayrıştırılmış ses, orijinal video sessiz ve türetilmiş ses duyulabilir, kaynak taşının sonra paylaşılan referans yeniden bağlanması, ID/isim/tip/proxy koruma, gerçek dışa aktarma tekrarsız karıştırma |
| `.test-output/track-electron/evidence.json` | 05:34:28 | Donduğu çapraz kanal sürüklenme geometrisi, yeniden adlandırma/ yukarı-aşağı taşıma App çağrıları, kilit ve komşu kilit kısıtları, boş kanal silme onayı ve kısaylık engelleme, malzeme koruma, bir geri alma kurtarma, dikey kaydırma sonrası sabit oynatma başı eli |
| `.test-output/player-electron/evidence.json` | 05:34:49 | Gerçek decode ön izleme, bırakmadan önce gerçek zamanlı görsel sürüklenme, kare yolunda birlikte hareket, bir geri alma, proje sonu son kare koruma |
| `.test-output/keyframe-electron/evidence.json` | 00:40:27 | Eğri/ liste seçimi, sürüklenme ve bir geri alma, kopyala/yapıştır/sil, tam zaman/ değer, üç ön ayar kaydetme/yeniden açma, 90 kare dışa aktarma ve tüm 90 kare ön izleme/ dışa aktarma örnekleme karşılaştırması |

Ses evidence gerçek GainNode ve dalga RMS içeriyor: ayrıştırma sonrası orijinal video gain=0/RMS=0, türetilen audio gain=1/RMS ~0.0603; kaynak taşınıp yeniden bağlandıktan sonra türetilen ses RMS ~0.0614, gerçek çıkış RMS ~0.0873. Bunlar gerçek oynatma/ dışa aktarma sırasında sesin var olduğunu ve orijinal video tekrar katmanı olmadığını gösterir, tüm ses cihazlarının doğrulamasını değiştirmez.

`tests/transition-electron.ts` ardından gerçek masaüstü üst üste bindirme ve dışa aktarma geçti: mevcut fade/ kırpma pencereli ön parça üstüne bindirme ile doğru kapatıldı, zaman çizelgesi örtüşme 0.5 sn. Orta kare ön izleme RGB `[127,0,128]`, gerçek dışa aktarma RGB `[127,0,127]`; karıştırılmış parlaklık tam, ses çapraz fade RMS ~0.06354, renderer hatalı yok. Kayıt `transition-electron/evidence.json`, yeniden üretim girişi `npm run test:transition`.

Makine okuma ve yerel medya mutlak yolları içermeyen doğrulama özeti `validation-summary.json` bakın.

## İlk tur v0.1 paket ve kapsam dışı sınırlar

Son macOS paket doğrulaması tamamlandı:

- `release/CevikEdit-0.1.0-arm64.dmg` ve `release/CevikEdit-0.1.0-arm64-mac.zip` üretildi. `hdiutil verify` VALID; salt mount ve CRC doğrulaması; `unzip -tq` hatasız.
- Son DMG’ten kopyalanan `.app` `.test-output/dmg-installed/CevikEdit.app` içine, `codesign --verify --deep --strict` exit 0. Yerel imza **ad-hoc**, Apple Developer ID değil, resmi olmadı.
- Kaynak `.app` ve DMG kopyası sürümü `app.asar` SHA-256 aynı: `6081e40acda576b6172a9ca36ea8f62c24ac00035985c51234c4c26faa80094b`. ASAR kayıt defteri 4.023; altı beklenen notices kaynağı var, `.research`, test, demo özel yolu veya electron-builder geliştirme build dosyası yok.
- `.test-output/package-electron/evidence.json` son **05:39:11 geçti**, `errors=[]`, `packaged=true`. Test gerçek DMG kopyası çalıştırılabilir dosyasını başlattı, izole cwd/ kullanıcı diziniyle, Noto tarayıcı gerçek yüklemesi ve native kaydı, native canvas, izole köprü, `.cevikedit` parametresi, 13 parça, manzara/küçük görünüm ön izlemesi ve gerçek dışa aktarma **1280×720, 9 sn, Çinli başlık + karıştırılmış sesli** video; çıktı FFprobe ile doğrulandı.
- Kök proxy ayrıca sekiz adım klavye ayarı zaman çizelgesi yüksekliği, sağ sütun viewport içinde, son [demo düzenleyici ekran görüntüsü](screenshots/demo-editor.png) dört kanal ve üç sütun tam görünür; dosya eşleştirme testi yalnızca başlangıç `.cevikedit` parametresi etkinliğini iddia etti, tüm Finder kayıt durumunu kapsamadı.

Sınırlar:

- **Windows/Linux gerçek donanımda değil**: kod ve CI matrisi hazırdı, ama makinede macOS başarısı bu sistemlerdeki çalışma, paketleme ya da font sonucunu kanıt etmez.
- **GitHub CI henüz çalıştırılmadı**: workflow resmi checkout/setup-node/upload-artifact v7, salt okunur izin, package işi DMG/ZIP yükler; yayın deposu ya da uzak çalıştırma kanıtı yok.
- Developer ID yayın imzası, resmi, otomatik güncelleme, bulut senkronizasyon, SaaS, hesap, API AI yok; tarayıcı ayrı modu tam masaüstü dosya köprüsü ve dışa aktarmayı taşımaz.
- Büyük proje, uzun süre düzenleme, anormal kesinti, tüm medya biçimleri, profesyonel HDR/renk yönetimi ve tüm ticari KıpyFilm işlevleri henüz doğrulanmadı ya da uygulanmadı.
- Taslak içe aktarma ikinci turu gerçek makinede kontrol edilen opak yüklendi; tüm KıpyFilm sürümü ya da tam uyumluluk kanıt etmez, detay `CAPCUT_INTEROP.md`.

## Geliştirme bağımlılığı denetimi

Makinedeki `.test-output/npm-audit-production.json` npm production ağacında **0 bilinen advisory**. Tam `.test-output/npm-audit.json` raporu **8 moderate geliştirme bağımlılık kaydı**, `sprintf-js` [GHSA-hp3w-g68c-fv3c] red edilen hizmet advisory `roarr → global-agent → @electron/get → electron-builder` gibi build zinciri üzerinden; `app-builder-lib`, `dmg-builder` ve Windows installer build bileşenleri dahil. Bunlar sekiz bağımsız advisory değil.

Bu zincir build/indirme aracı, proje production npm bağımlılığı değil ve düzenleyicinin çalışma zamanı npm modülü dağıtılmıyor; bu yüzden geliştirme bağımlılık raporunu sıfır yapmamalı. Güncel electron-builder 26.15.3, geliştirme bağımlılık raporu ilerideki bağımlılık bakımına için saklanıyor. npm audit o zamanki registry verisi ve npm bağımlılık grafiyesini yansıtır, sistem FFmpeg, tüm Electron/Chromium native kodu ya da bilinmeyen güvenlik açığı kapsamaz.

## Yeniden üretim komutları

```sh
npm ci
npm run check              # tip kontrolü + birim testleri + üretim derlemesi
npm run test:desktop
npm run test:keyframes
npm run test:timeline
npm run test:timeline-view
npm run test:visual
npm run test:storage
npm run test:player
npm run test:audio
npm run test:audio-tools
npm run test:tracks
npm run test:subtitles
npm run test:portable
npm run test:source
npm run test:workspace
npm run test:placement
npm run test:linked
npm run test:transition
npm run test:clip-tools
npm run test:templates
npm run test:creative
npm run test:capcut
npm run test:plugin
npm run test:plugin:launcher
npm run test:package:win   # paketlenmiş Windows uygulamasını doğrular
npm run licenses
npm run icons
npm run assets
npm run showcase
npm run dist               # Windows kurulum paketi
npm run clean
```

FFmpeg/FFprobe PATH'te olmalıdır; yoksa medya ve dışa aktarma testleri ortam eksikliğini bildirir. Çalıştırma sonuçları her bir gerçek çıktı ve üretilen `.test-output/` kayıtlarıyla. Sonraki yeniden build paket smoke testini yeniden çalıştırmalı ve parmak izlerini güncel etmeli; çapraz platform sonuçları yalnızca ilgili ortamda gerçekten çalıştırıldıktan sonra eklenmeli, komut ya da yapılandırma mevcut yazdıktan sonra geçmiş gibi yazılmamalı.

