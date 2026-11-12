# İkinci tur: yerel taslak biçimi ve bağımsız içe aktarma

Araştırma tarihi: 2026-10-13. Yalnızca bu sefer üretilen test malzemeleri ve özel test taslakları kullanıldı. Hedefin `CFBundleShortVersionString` değeri `11.0.12922`, `CFBundleVersion` değeri `11.1.0-beta3`'tür; iki alanın anlamı farklıdır. Sonuçlar bu kontrollü örnekler ve karşılık gelen ikili dosyayla sınırlıdır; tüm CapCut, CapCut sürümleri, bulut taslakları veya geçmiş sürümlere genellenemez.

## Kanıtlar ve denetlenebilir sınırlar

| Kanıt | Gözlem | Sınır |
| --- | --- | --- |
| `LOCAL-NATIVE-005` ve sonraki LLVM ARM64 statik parçaları | Taslak okuma, dosya IO, decode çağrıları ve sabit tablosu; Crypto++ GCM/Rijndael tür bilgisi | Statik yol; çalışma zamanı çağrı izlemesi değil, REA sözde kodu sonucu da değil |
| REA + Ghidra resmî Evidence (aşağıdaki tablo) | Varsayılan otomatik analiz tamamlandıktan sonra üç hedef fonksiyonun sözde kodu ve 48 baytlık sabit tablosu başarıyla döndü | Statik decompile; özgün kaynak kodu veya çalışma zamanı yürütme kanıtı değil |
| `LOCAL-GHIDRA-001` | Ghidra 12.1.4 ile üç fonksiyonun noktasal decompile işlemi başarılı oldu; sabit tablosu ve key/IV parametreleri LLVM çıkarımıyla tutarlı | Standart `-noanalysis` artı noktasal disassemble/DecompInterface; doğrudan Ghidra tamamlaması, REA Evidence değil |
| `LOCAL-ENVELOPE-001` | İki kontrollü varyant taslak AES-GCM doğrulamasından geçti ve doğrudan JSON elde edildi; sıkıştırma adımı yok | Etkin zaman çizelgesi ve boş ana zaman çizelgesi |
| `LOCAL-WITNESS-002` | 32 anlamsal iddia bağımsız olarak doğrulandı; diğer iki eski kontrollü yük de kimlik doğrulamasından geçti | Eski güncel dosya boş; açıkça seçilen geçmiş `.bak` dosyasında video var, bu "güncel dosya" olarak adlandırılamaz |
| `LOCAL-NATIVE-EXPORT-001` | Özgün uygulamanın normal arayüzüyle kendi ürettiğimiz örnek klip dışa aktarıldı; H.264 1280×720, 30 fps, 90 kare, 3 saniye, AAC 44.1 kHz çift kanal | Özgün çözünürlük menüsü etkileşimi başarılı olmadı; gerçek seçim 720P oldu, ölçümde 640×360'a normalleştirildi |
| Ürün doğrulaması | Aynı kontrollü etkin taslak, bağımsız ürün decoder/importer'ı, malzeme probu ve MP4 dışa aktarımıyla geçti | İçe aktarıcı hâlâ kayıplı dönüşüm yapar; yazı tipi/karmaşık efektler birebir korunmaz |

Özgün dylib SHA-256: `f9de2acbfc1f6187cf7cbce1551cbc8c2d10cdc444f814801f78c1069206d0d7`. Salt okunur çıkarılan ARM64 slice SHA-256: `f96ec6ff6b26155f2f84591d302cf352da3a0fdddd81ebb0bf847235195984d3`. Kurulu uygulama değiştirilmedi.

REA 6.4.0, yukarıdaki exact ARM64 slice üzerinde Ghidra 12.1.4 varsayılan otomatik analizini tamamladı; izole JDK 21 ve yerelde derlenen ARM64 decompiler kullanıldı. Resmî sonuçlar aşağıdadır; analiz profile digest değeri `20565088524a2d0359b9b96f46ac48e679d774c7b0092c56abc06de8fdbec11c`'dir.

| Adres / işlem | REA Evidence ID |
| --- | --- |
| `0x3252504` decode fonksiyonu sözde kodu | `ev_1cd60edbb52cc41d99d6e7df3e5a0510eac2b634cd1427c1bde7753dbbad230c` |
| `0x31a1b94` taslak okuma giriş noktası sözde kodu | `ev_e4916e2c23fb6dcbe3f7a246012b30cf64ff6c2e9f4283d00b3923f95ad804ea` |
| `0x3159bb8` dosya okuma sözde kodu | `ev_89db773066ca03b85994d1c59abb48b884afa889569f78b577e6168b22b9fb96` |
| `0x45cbbb8` sabit tablosu okuma, 48/48 bayt | `ev_ba2ef158da58e36b9e4777db15dcfabb06a1f01df04f00b417b46c9217c5447f` |

Okuma giriş noktası `DraftIO::createIO` çağırır ve sanal yöntem üzerinden okur; dosya uygulaması `EncryptUtils::maybeEncrypted/decrypt` çağırır; decode fonksiyonu on iki kez dört bayt çıkarma, Base64 decoder ve `SetKeyWithIV` için 32/16 baytlık parametreleri gösterir. Ara factory/wrapper bağlantıları için ayrıca LLVM statik kanıtı vardır; bu üç fonksiyonun sözde kodu eksiksiz dinamik çağrı izlemesi olarak tanımlanmaz.

Dört kaydın tamamı makinedeki yok sayılan `.research/round2/rea-evidence/round2-ghidra-bundle.json` dizinine aktarıldı. İlk analiz 30 dakikalık başlatma süresi nedeniyle tamamlanmadı; sonrasında başlatma süresi uzatılarak başarıldı; sağlayıcı veya hedef ikili dosya değiştirilmedi. Ghidra tüm kütüphane analiz günlüğünde kısmi analiz uyarıları vardır, hedef fonksiyonların tümü sözde kod döndürdü. Decompiler'ın türleri, dönmeyen fonksiyon işaretlemeleri ve denetim akışı hâlâ bozuk olabilir; aracın özgün limitations ifadeleri korunmuştur. `close_binary` süreç temizliği onay hatası döndürdü (macOS `sysctl_errno_22`); ardından bu JVM'in çıktığı doğrulandı, SDK normal biçimde kapatıldı ve yalnızca bu oturuma ait artık dizinler temizlendi, özgün ikili dosya parmak izi değişmedi.

Bağımsız tamamlayıcı Ghidra noktasal decompile işlemi de başarılı oldu: decode fonksiyonu 777 komut, okuma giriş noktası 63 komut, dosya okuma 865 komut; hiçbiri zaman aşımına uğramadı. Standart `-noanalysis` artı noktasal disassemble/DecompInterface kullanıldı; tam çıktı özel `focused-ghidra/` altında olup resmî REA Evidence'tan ayrı olarak işaretlendi. Yukarıdaki statik yollarda hedef kütüphane çalıştırılmadı.

Ham yükler, disassembly, cihaz alanları içerebilen decode edilmiş JSON, uygulama ekran görüntüleri ve araç çalışma dizinleri yalnızca yok sayılan `.research/` dizininde tutulur. Herkese açık kaynak kodu ve testler bu ham verileri içermez.

## Doğrulanmış taşıyıcı kuralları

Dosyanın tamamı sözcüksel olarak Base64 gibi görünebilir, ancak tam dize doğrudan tek bir Base64 alanı olarak alınamaz.

1. Ham ASCII metnin mutlak karakter ofsetleri `0, 7, 20, 33, 40, 47, 59, 66, 76, 89, 99, 127` konumlarında dörder karakter alınır.
2. Sırayla birleştirilerek 48 ham ASCII baytı elde edilir; ilk 32 bayt AES-256 key, son 16 bayt GCM IV olarak kullanılır.
3. Bu on iki parça metinden çıkarılır; kalan metin standart Base64'tür. Decode edildikten sonra son 16 bayt GCM tag, ön kısım ciphertext'tir.
4. Ek AAD yoktur; kimlik doğrulamalı decode sonrası UTF-8 JSON nesnesi elde edilir. Kontrollü örneklerde sıkıştırma decode'u gerekmez.

Bu kural statik çıkarımdan gelir ve gerçek kontrollü yüklerin kimlik doğrulamalı decode edilmesiyle doğrulanmıştır. Ghidra sabit tablosu adresi `0x45cbbb8`, on iki kez dört bayt çıkarma ve `SetKeyWithIV` için 32/16 parametrelerini geri kazandı; tablo içeriği ayrıca aynı exact carrier üzerinden doğrulandı. `GCM_Final<Rijndael>` tür bilgisi algoritma ipucunu doğrular. Filtre oluşturma çağrısındaki `0x10` flags değeridir, açık tag uzunluğu olarak alınamaz; 16 baytlık tag kimlik doğrulama deneyiyle doğrulanmıştır. Anahtar malzemesi yükün kendisindedir; hesaba, sunucuya, parolaya veya lisansa bağlı değildir. GCM doğrulaması eşleşmeyen veya bozuk yükleri reddetmek için kullanılır; dosyanın güvenilir bir yayıncı tarafından üretildiğini kanıtlamaz.

Bağımsız uygulama `electron/capcutCodec.ts` içindedir ve yalnızca standart Node.js crypto kullanır. Girdiyi 20 MiB ile sınırlar; kurallı Base64, tam kimlik doğrulama, katı UTF-8 ve JSON nesnesi ister; başarısızlıkta kimlik doğrulanmamış açık metin sunmaz. Testlerdeki sabit bilinen yanıtlar ve anormal taşıyıcılar kendi tarafımızdan üretilmiştir; özgün uygulamanın kodu veya kullanıcı verisi değildir. Bu uygulama yalnızca salt okunur içe aktarma yapar, CapCut biçimine geri yazmaz.

## Veri modeli ve görüntü doğrulaması

- Modern projelerde `Timelines/project.json` ana zaman çizelgesini ve alt zaman çizelgelerini listeler; `timeline_layout.json` içindeki `activeTimeline` önerilen seçenektir. Kök dizindeki yük yalnızca boş ana zaman çizelgesi olabilir ve etkin zaman çizelgesinin yerine geçmez. Birden çok zaman çizelgesi olduğunda kullanıcı açıkça seçer; bozuk dosyanın yerine eski yedek otomatik aranmaz.
- Geçerli bir boş zaman çizelgesi `tracks` alanını atlayabilir. Dönüştürücü yalnızca geçerli kimlik, sürüm, tuval, boş malzeme ve sıfır/atlanmış süre taşıyan bu tür yapıları boş track olarak işler; `tracks` içermeyen diğer veriler yine reddedilir.
- Kontrollü video kaynağı 640×360, 30 fps, 3 saniyedir. `source_timerange.duration=3000000`, `target_timerange.duration=2000000` değerleri 1.5 kat hızla tutarlıdır; metin 3000000 mikrosaniye sürer. Bu nedenle proje süresi 3 saniye, video 2. saniyede biter.
- Doğrusal ses düzeyi `0.6025595664978027` yaklaşık −4.4 dB'ye karşılık gelir; birleşik ölçek 0.75, döndürme 30°'dir.
- Saklanan konum kaydırması `(0.125, -0.125)`, özgün arayüzde `(80, -45)` gösterilir. Yerel dışa aktarım tuval kaydırması `(40, +22.5)` destekler, yani `x = raw.x × width / 2`, `y = -raw.y × height / 2`. Arayüzdeki sayılar doğrudan işleme pikseli olarak alınamaz.
- Yerel dışa aktarım 640×360'a normalleştirildiğinde videonun sol ve sağ uçtaki renkli kenarları yaklaşık `(86,198–199)` ve `(633,205–207)` olur; yukarıdaki formül köşe noktalarını `(84.65,199.41)` ve `(635.35,205.59)` olarak öngörür, fark raster kenarı/ölçekleme aralığındadır. Tam çerçeve koordinat yorumunun diğer biçimi dışa aktarımla uyuşmaz.
- `track_render_index` değeri daha büyük olan metin track'i video track'inin üzerindedir. CevikEdit bunu kendi yukarıdan aşağıya track sırasına eşler; aynı track'teki kliplerin katman çakışması durumunda uyarı verilir. Açık katman bilgisi yoksa özgün track dizisi sırası yedek olarak kullanılır; tüm serbest katman birleşimlerinin birebir korunacağı taahhüt edilmez.
- Tuval arka planı olmayan kontrollü dışa aktarım siyahtır; özel arka plan yapılandırması olduğunda henüz eşlenmez ve uyarı verilir. Tuval boyutu yoksa ilk gerçekten içe aktarılabilir görsel klipten çıkarılır; bu da mümkün değilse varsayılan boyut açıkça bildirilir.
- Metin malzemesi iç içe JSON içerir ve `text` alanı korunur. Yerel `size=15` normalleştirilmiş karede yaklaşık 275×50 piksel glif alanı oluşturur; doğrudan 15 tuval pikseliyle eşitlenemez. Bu turda özgün yazı tipi kopyalanmaz; CevikEdit'in varsayılan yazı tipi ve stili kullanılır ve kayıp bildirilir.

## Henüz kapsanmayanlar

Karmaşık efektler, anahtar kareler, eğrisel hız değişimi, geçişler, süslü metin, yazı tipi dizgisi, özel ses işleme ve tuval arka planı tam olarak eşlenmedi; geri yazma, bulut eşitleme veya API'ye bağlı AI desteklenmez. Windows/Linux dosya yolu kuralları otomasyonla kapsanmıştır, ancak gerçek masaüstü ve paket kabulü yalnızca bu makinede macOS arm64 üzerinde yürütüldü.

### Dışa aktarma zamanlama regresyonu

Yerel ve ilk sürüm CevikEdit dışa aktarımlarının ikisi de 90 kare, 3 saniyedir; video 60. karede biter; geometrik dışbükey örtü IoU medyanı yaklaşık %98.44, raster kenar farkı yaklaşık 1–2 pikseldir. 0.2–1.8 saniye aralığında ses RMS farkı yaklaşık −0.00257 dB, 440 Hz perde ve bitiş sonrası sessizlik tutarlıdır. Yazı tipi, kontur ve dizgi farklılıkları hâlâ açık dönüşüm kaybıdır.

Kare kare inceleme, 1.5 kat hızda yarım kare konumlarında kare seçim farkı olduğunu gösterdi; bu nedenle dışa aktarıcı, kaynak kare çıktı zaman damgalarını yukarı yuvarlayacak biçimde değiştirildi; böylece önceki kaynak kare, sonraki kare kullanılabilir olana kadar korunur. Tam kare olmayan kırpmalarda varsayılan giriş seek'i önceki görüntüyü attığı için, görünür videonun sıfır olmayan giriş noktasında keyframe seek ve negatif PTS korunur, ardından çıktı sıfır anından örneklenir; ses hâlâ kesin giriş noktasına göre kırpılır. On gerçek kare kare kimlik testi 1.5 kat, 0.5 kat, 24→30, 30→24 fps, hizalı ve hizasız kırpmalar, uzun GOP/B karelerde orta-son seek, VFR büyük aralıklar ve düzensiz örneklemeyi kapsar. Ayrıca özel sentetik deneyle 120 saniyelik kaynak, sıfır olmayan kapsayıcı başlangıcı, ses zamanı/perdesi ve dönüşüm/animasyon/solma kontrol edildi; toplam 24 test geçti. Kapsam hâlâ testlerdeki kodek, zaman damgası ve kapsayıcı birleşimleriyle sınırlıdır; keyfî bozuk veya olağan dışı medyada kare kare birebir doğruluk taahhüt edilemez.
