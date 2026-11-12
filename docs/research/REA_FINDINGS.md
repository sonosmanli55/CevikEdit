# Jianying macOS: bağımsız uygulama inceleme kaydı

Bu sayfa ilk tur gözlemlerini tutar; taslak kod çözme, çağrı zinciri ve yetkilendirilmiş dışa aktarma ile ilgili yeni sonuçlar [İkinci tur raporu](DRAFT_FORMAT_ROUND2.md) içinde; aşağıdaki “çözülemeyenler” gibi durumlar ilk turun kısıtlarıdır.

İnceleme tarihi: 2026-10-13 (Asia/Shanghai). Hedef: `/Applications/VideoFusion-macOS.app`, `com.lemon.lvpro`, `CFBundleShortVersionString=11.0.12922`, `CFBundleVersion=11.1.0-beta3`. Amaç davranış ve veri modeli ipuçlarını kaydetip bağımsız uygulama geliştirmeyi yönlendirmekti; Jianying kaynak kodu, ikili dosya, ikon, yazı tipi veya şablon malzemesi açık kaynak ürüne katılmadı.

## Kanıt endeksi

| ID | Kaynak, sınır | Kanıt türü | Saklanma yeri |
| --- | --- | --- | --- |
| `ev_4d96321be94ace4c66327aae2b2b4b85c451ccc7715184016221868a86b4fd4e` | REA 6.4.0 `inspect-artifact`; kurulu uygulamanın tüm dizini | shipped-artifact, statik paket envanteri | `.research/evidence/rea-artifact.json` (dosya adı json, içerik aslında CLI TOON) |
| `ev_39a244b8a17ae7ea0995c8fca9dd2dbed1269953dd7d6e956e96a8cf7b5b2649` | Yukarıdaki incelemenin `inventory_artifact` alt adımı | Statik paket grafiği | Aynı |
| `agm_ffc5574cc4d3ebed49d4f8a82825f8fda8435fb6185663707b0a6d6650634791` | REA graf yapı manifesti | 4.610 düğüm, 6.537 ortam, 6.335 kenar | Aynı |
| `ev_53fbb85e7d8aea3467e3957a4f5527ba926599e3391c706023d7335a823cc7e8` | REA `observe-native-ui`; çalışan PID 88567, açıkken pencere 8230, işlem adımları verilmedi | Çalışma zamanı pencere ekran görüntüsü / AX ağacı | `.research/evidence/rea-native-ui-editor.json`, `.png` |
| `ev_25f346811fe7ba3c1f873a283bd562e989acda7bf13b5b9fc06ed18729733a87` | REA MCP `observe_native_ui`; PID 88567/pencere 8230, 1280x720 piksel, 77 AX düğümü, işlem adımları yok | Çalışma zamanı gözlem: boş zaman çizelgesi üzerinde sentetik medya ön izleme | MCP sakladı; ekran görüntüsü SHA-256 `8c6183ff9ac894a10f20472a853367256b45ba8c52dccfcfc5e4f64bcbbe1027` |
| `ev_fb4bec800eef26b4b0e58f1202a0b52b5b46dec3970fb5784740916491ca3981` | REA MCP `observe_native_ui`; PID 88567/pencere 8230, işlem yok, kontrol edilen sentetik üç saniyelik parça “Zaman çizelgesi” 2'de | Çalışma zamanı gözlem: zaman çizelgesi parçası, dönüşüm kulakları ve özellikler | MCP sakladı; ekran görüntüsü SHA-256 `e0af3115ce35189a7f60f7a34bd306b6f3ff47530ad4e280d1f21cc0731d6d98` |
| `LOCAL-DRAFT-001` | Sadece yetkilendirilmiş yeni test taslağı 2026-10-13: dosya adları, boyutlar, dijital benzerlikler ve JSON çözülebilirliği | Yerel dosya gözlemi, kod çözme / şifre çözme yok | `.research/evidence/test-draft-inventory.json` |
| `LOCAL-INV-001` | `Contents` dizinindeki normal dosyalar ve Info.plist; 4.827 dosya; yerel ek supplement listesi, sayım yöntemi REA grafiğinden farklı | Orijinal dosya meta verisi gözlemi | `.research/evidence/local-inventory.json` |
| `LOCAL-STR-001` | `Contents/Frameworks/libvideoeditor.dylib`; 10 belirtilen literal, her biri en fazla 40 string | Literal var olma kanıtı, çalıştırma yok | `.research/evidence/native-model-strings.json` |
| `LOCAL-STR-002` | Aynı dylib; 8 belirtilen JSON literal, her biri en fazla 5 yer, her yerde en fazla 23 satır bağlam | Gömülü schema / örnek metin gözlemi, çalıştırma yok | `.research/evidence/model-contexts.json` |
| `LOCAL-STR-003` | Aynı dylib; 20 belirtilen işlev literal, her biri en fazla 20 satır, tek satır 400 karakteri geçmiyor | Literal var olma kanıtı, çalıştırma yok | `.research/evidence/feature-strings.json` |

REA kök dizini SHA-256: `c2bf999306e3e4416f08e6233b9cbe7e86f499663b7cac9e9b07ff6053770022`. REA sağlayıcı: `rea-artifact-graph` v1. CLI izole `npx -y -p node@24 -p rea-agents@6.4.0 rea ...` kullanır; REA aracı kaynakları ya da kullanıcı MCP yapılandırması değiştirilmedi. Paket incelemesi açıkça kısıtlı: uygulama çalıştırılmadı, format özelinde anlama analizi tamamlanmadı. `complete-within-substeps` yalnızca paket envanteri alt adımını açıklıyor, bu inceleme tam kapsamı kapsamıyor anlamına gelmez.

## Gözlenen gerçekler

1. **Paket yapısı**: Qt Core/Qml/Quick, Chromium Embedded Framework, `libvideoeditor.dylib`, `libVECreator.dylib`, `libavcodec.dylib` ve `libonnxruntime` içerir. Kaynak Qt QML, Lua, shader/Metal, JSON yapılandırması; ayrıca bağımsız H5 metin şablonu yayını, akıllı sunum, dışa aktarma yayını içerir. Kanıt: REA envanteri / manifest, `LOCAL-INV-001`. Bu yalnızca bileşen varlığını doğrular, çağrı yolu, yetkilendirme politikası ya da algoritma yeteneğini buna göre yargılamaz.
2. **Proje / taslak adlandırma ipuçları**: statik dizilerde `draft_content.json`, `draft_info.json`, `material_id`, `source_timerange`, `target_timerange`, `canvas_config` vardı. Kanıt: `LOCAL-STR-001`. Kullanıcının mevcut özel taslağı okunmadı; yalnızca bu özel yeni test taslağı incelendi.
3. **Zaman çizelgesi yapısı ipuçları**: gömülü JSON örnekleri proje `fps`, `duration`, `canvas_config`, `tracks`; track içinde `id`, `attribute`, `segments`; yapılandırmada `video_mute`, `maintrack_adsorb`, `export_range`; çerçeve yapılandırması `width`, `height`, `ratio`, `background` içerir. Kanıt: `LOCAL-STR-002`. Bu, doğrulanmış dış dosya biçimi standardı değildir.
4. **Zaman birimi ipuçları**: şema dizilerinde `duration*1000000`, `audio_effect.duration*1000000`, `int64_t` vardı. Kanıt: `LOCAL-STR-002`. Bu alanlardaki mikrosaniye çıkarımı, özel test taslağıyla doğrulanmalıydı; “tüm zaman alanları mikrosaniyededir” iddiası genişletilemez.
5. **Düzenleme yeteneği ipuçları**: `common_keyframes`, `audio_fades`, `blend_mode`, `crop`, `subtitle_sync` ve dışa aktarma sesi ile ilgili semboller vardı; karıştırma, renk geçişleri, renk kadranı, bulanıklık, dönüşüm gibi etki kaynakları içeriyordu. Kanıt: `LOCAL-STR-003` ve envanter. Bu, arayüz kullanılabilirliği ya da doğrulanmış çalıştırma anlamına gelmiyordu.

6. **Editör çalışma zamanı yerleşimi**: boş proje düzenleyici üst çubuğu malzama, ses, metin, sticker, etki, geçiş, altyazı, akıllı paketleme, filtre içeriyordu; üst bölge sol malzama, orta oynatıcı, sağ taslak parametreleri; alt bölge zaman çizelgesi. Bu yeni boş proje, mevcut konumda içe aktarma, özgür katman yapısı açık, mıknatıs / malzama karışımı / aracı modu kapalıydı. Kanıt: `ev_53fbb85e7d8aea3467e3957a4f5527ba926599e3391c706023d7335a823cc7e8` ekran görüntüsü. AX ağacı yalnızca az sayıda malzama menü etiketi kapsıyordu, boş metinle kontrol yokluğunu çıkarmazdı.

7. **Özel test taslağı dosyaları**: `LOCAL-DRAFT-001`, kök dizin ile zaman çizelgesi altındaki `draft_info.json` 1.176 baytlık yükünün çözülemez JSON olduğunu, iki SHA-256'nin aynı olduğunu, ayrıca çözülebilir `timeline_layout.json`, `Timelines/project.json` ve `template.tmp` vardığını gösterdi. Bu yalnızca testteki yük biçimini kanıtlıyor, çözülemez JSON'dan belirli şifreleme algoritması anlaşılmaz, ayrıca 11.0 taslağı biçimiyle uyum iddiası çıkarılamaz. Şifre çözme ya da erişim atlama denemesi yapılmadı.

8. **Malzama ön izleme ve zaman çizelgesi ayrımı**: REA MCP kanıtı `ev_25f346811fe7ba3c1f873a283bd562e989acda7bf13b5b9fc06ed18729733a87` yalnızca mevcut pencereyi gözlemledi: kendisinden üretilen `rea-test.mp4` artık malzama kitaplığında görünüp seçildi, orta malzama ön izlemesi renk çubuğu test sahnesi ve üç saniyelik parça gösteriyordu; zaman çizelgesinde hâlâ malzama sürüklemeye izin veriliyor, parça eklenmedi. Bu, boş zaman çizelgesinde malzama ön izlemenin mümkün olduğunu kanıtlıyordu, zaman çizelgesi oynatması, değiştirme oranı ya da dışa aktarma doğrulanmadı. Zaman çubuğu bilgisi sistem saat kanıtı değildi.

9. **Özel örnek taslağı zaman çizelgesi ve seçili özellikler**: üst aracı CUA, kendisinden üretilen malzemeler üzerinde “seçili malzemeye göre yeni zaman çizelgesi oluştur” eylemini gerçekleştirdi; REA MCP pasif gözlem kanıtı `ev_fb4bec800eef26b4b0e58f1202a0b52b5b46dec3970fb5784740916491ca3981` “Zaman çizelgesi 2”nin etkin olduğunu, `rea-test.mp4` sıfırda başlayan üç saniyelik parçasının gösterdiğini, malzama simgesinin “Eklendi” notu taşıdığını gösterdi. Orta ön izlemede dört köşe / kenarlık dönüşüm kulakları vardı; sağ tarafta görsel, ses, değiştirme oranı, animasyon, ayar, AI etki etiketleri; görsel içinde temel, renk kadranı, maske, güzelleştirme / vücut alt etiketleri vardı. Mevcut temel panelde ölçek 100%, orantılı ölçek açık, konum X/Y 0, dönme 0.00°, köşe 0, kritik kare kareli kare vardı. AX 135 düğüm döndürdü (pencere dahil, kırpılmamış), okunan değerler temel / renk kadranı / maske / güzelleştirme / vücut / orantılı ölçekti; geri kalan değerlar ekran görüntüsüne dayandırıldı. Sadece durum gözdü, bu parametreleri çalıştırmadı, belirli renk kadranı, değiştirme oranı ya da AI yeteneği doğrulamadı.

## Uygulama çıkarımları ve bağımsız tasarım

- **Çıkarım (orta güven)**: Jianying projesi, segment'leri kanalda referans gösterirken kaynak malzama zamanı ve hedef zaman çizelgesi zamanını ayrı ayrı kaydediyor. Dayanak: `source_timerange`, `target_timerange`, `material_id` dizileri ve gömülü şema. Değiştirme oranı, geri sarma, geçiş ve özel kanalların hesap ilişkisi henüz dinamik doğrulanmadı.
- **Bağımsız tasarım**: açık kaynak uygulama kendi sürümlenmiş proje biçimini kullanır, şu an `version: 1`, malzama kitaplığı, kanal, parça, çerçeve, altyazı. Çekirdekte saniye birimini sabit kullanılır; dışa aktarmaya göre FFmpeg filtre grafiğine derlenir. Jianying alanlarını ya da Jianying taslağı uyumluluğunu taahhüt etmeye gerek yok.
- **Bağımsız tasarım**: parçalar `sourceIn`, `duration`, `start`, `speed` taşır; dış çıktı süresi kaynak süresinin speed'e bölünmesidir. Video / resim kanalı transform, şeffaflik ve temel renk işlemini destekler; kırpma henüz tamamlanmış yetenek olarak sayılmaz; ses kanalı gain, fades destekler; başlık / altyazı kendi tanımladığı metin ve stili kullanır.
- **Kapsam güncellemesi**: kullanıcı SaaS ve AI API yeteneklerinin de önceden boş bırakılmasını netleştirmiş, bu tur yalnızca istemci tarafından tamamlanabilir işleri uygulamayı kastetti. Yerel projeler kullanıcı seçtiği konumlarda saklanır, bulut senkronizasyon iddiası yoktur.

## Sorun listesi ve kararlı olmayan maddeler

| Orijinal soru | Durum | Sonraki önemli kanıt |
| --- | --- | --- |
| Hedef kimlik ve teknik bileşenler | Yanıtlandı (paket düzeyinde) | Tekrar envanter gerekmez |
| Yeni taslağın yapısı, zaman birimi, malzama referansları | Kısmen yanıtlandı: özel taslağın `draft_info.json` opak kaldı, classic şema doğrulanamadı | Şifre çözme yapılmadı; classic içe aktarma yalnızca sentetik veriyle test etti, mevcut 11.0 taslağı uyumluluğu söyleyemez |
| Standart düzenleyici yerleşimi ve menü | Yanıtlandı (boş proje ve kendinden üretilen örnek seçili yerleşim) | Altyazı, dışa aktarma durumu ayrı çalışma zamanı gözlemini gerektirir |
| Altyazı düzenleme / içe aktarma / dışa aktarma anlama | Kısmen yanıtlandı | Yalnızca test taslağı üzerindeki SRT işlemleri ve zaman çizelgesi gözleminde |
| Değiştirme oranı, ses, etki kayıtlarının ve dışa aktarmanın tutarlılığı | Çözülmedi | Yalnızca kendinden üretilen örnek ile dışa aktarma karşılaştırması yapıldı |
| Jianying'in tüm native çağrı grafiği, AI algoritması ve ücretli kaynaklar | Çözülmedi, bağımsız uygulama geliştirmesinin bağımlısı değil | Gerektiğinde belirli sınırlar çerçevesinde ayrıca incelenecek |
| Tüm ticari Jianying özelliklerinin birebir uyumluluğu | Çözülmedi | Bu turda tam kapsam kanıt yok, söyleyilemez |

Orijinal kanıt dizini repoya alınmadı; yalnızca bu rapordaki davranış / yapı sonuçlarını paylaşıldı. Hopper ters incelemesi başlatılmadı. Sonraki REA istekleri yalnızca hedef Mach-O'yu bağlayacak, çalışan pencereyi toplayacak ve `close_binary` ile bağlamı kapatacaktı. REA `observe-native-ui` isteği PID / pencere kimliği olmadan ilk kez schema tarafından reddetti; ardından yalnızca CoreGraphics ile netleştirilmiş PID / pencere kimliği ile başarılı pasif toplama, REA aracının UI işlemi çalıştırmadı.

Uygulama doğrulaması ve ters inceleme kanıtları ayrı tutuldu: çekirdek modeli testleri bağımsız uygulamanın split / kırpma / değiştirme oranı, kanal kilidi, geçmiş anlık görüntü ve eğrisel pencere doğrulamalarını yaptı; içe aktarma testleri sentetik classic JSON kullandı. Bu testler Jianying çalışma zamanı davranışı ya da mevcut taslağı uyumluluğunun kapsamını eklemek için değil, bağımsız uygulamanın kendi anlama doğrulamalarını güçlendirmek için kullanıldı; bu yüzden Jianying kapsamı iddia edilmez.
