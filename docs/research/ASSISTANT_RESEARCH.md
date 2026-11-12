# Masaüstü kurgu asistanı araştırması ve bağımsız uygulama sınırları

Araştırma tarihi: 2026-10-13. Amaç, bu makinedeki CapCut kurulumuyla birlikte gelen asistan yapısını anlamak ve CevikEdit için bağımsız bir uygulamaya yön vermek; bu rapor, ticari CapCut özelliklerinin tamamen kopyalandığının veya bulut modeli davranışının kanıtı değildir.

## Kapsam ve kaynaklar

Kullanıcı bu makinedeki CapCut kurulumunu açıkça seçti ve "CapCut asistanı"nın araştırılmasını istedi. Bu turda yalnızca `/Applications/VideoFusion-macOS.app` uygulamasının kaynakları ve yerel kütüphaneleri salt okunur biçimde incelendi; REA 6.4.0 ile statik JavaScript analizi, REA + Ghidra 12.1.4 ile yerel kod decompile işlemi kullanıldı. Analiz edilen JavaScript/yerel kütüphaneler çalıştırılmadı; özel projeler açılmadı, hesap önbelleği okunmadı, CapCut bulut sohbetine istek gönderilmedi ve paket içindeki sunucu arayüzleri çağrılmadı. Uygulama ikilisi değiştirilmedi ve üyelik atlatma yolları incelenmedi.

`Info.plist` dosyasında gerçekte `CFBundleShortVersionString=11.0.12922` ve `CFBundleVersion=11.1.0-beta3` kayıtlıdır. Bu iki alan olduğu gibi kaydedilmiştir; bunlardan resmî yayın tarihi türetilemez.

| Taşıyıcı | SHA-256 | Kullanım |
| --- | --- | --- |
| `Resources/image_h5_smart_edit_chat_bot` dizini | `cd9732e18b3a90c949a8100bde94a8fa893b4075f4222fd3b95308808c0d7460` | REA statik uygulama grafiği |
| `static/js/chat-bot.52f2052e.js` | `0becc6e4ac4bad8a02a7986261d8f13cae1b25f08e0d402e5c13c6419cc7c607` | Yazma asistanı kaynağının belirlenmesi |
| `Frameworks/libDeepAgentsService.dylib` | `89fa7b46730f2cffd05e01f520a1e416a5e6ee585958b73ef423851b178e9d20` | Yerel servis köprüsü |
| Yukarıdaki yerel kütüphanenin salt okunur arm64 dilimi | `25d5160542fb62d115d4e45f3f55bea29dde9d5ca36469815655c598858150cc` | Ghidra analiz girdisi |
| `Frameworks/libVECreator.dylib` | `0af38474f1ea1ffa0ce99187b030c093b12afa39608ffd5ff341fa437e051961` | Sınırlı statik dize/kaynak yolu tespiti |
| `Frameworks/libdeepagents_capi.dylib` | `e119438b11646cb0d734b6378d12292e728983ecd64482600613c28dd09b58b2` | Sınırlı statik sembol ve dize tespiti |

Ham kanıtlar yalnızca makinedeki yok sayılan `.research/assistant-round3/` dizininde tutulur; tescilli sözde kod, tam dizeler ve kaynaklar herkese açık kaynak koduna veya kurulum paketine girmez. CevikEdit bu kütüphanelere bağlanmaz.

## Herkese açık yayın tarihinin doğrulanması

CapCut hesabının **2026-09-20** tarihinde yayımladığı okunabilir resmî sayfa, açık biçimde CapCut Hub PC profesyonel sürümünün kapalı beta duyurusudur; "20 Eylül'deki bu yayın turu masaüstü akıllı üretimi kapsıyor" ifadesini destekler, ancak asistanın ilk kez o gün yayımlandığını tek başına kanıtlamaz. [CapCut Hub resmî duyurusu](https://jingxuan.douyin.com/m/video/7687570571546086702)

Başka bir CapCut hesabı sayfası **2026-04-24** tarihini taşır ve sohbet yoluyla toplu düzenleme, görüntü üretme, malzeme/özellik bulma özelliklerini zaten tanıtmaktadır. Bu nedenle bu rapor "asistan ilk kez 20 Eylül'de yayımlandı" demez ve farklı platformlardaki, farklı aşamalardaki yetenekleri tek bir doğrulanmış sürümde birleştirmez. [CapCut AI asistanı resmî duyurusu](https://jingxuan.douyin.com/m/video/7631940182882761957)

Resmî site günümüzde akıllı malzeme arama, akıllı sesli anlatım kurgusu gibi yetenekleri tanıtmakta, ancak bu turda gereken eksiksiz masaüstü asistanı araç protokolünü veya çevrimdışı davranış kurallarını sunmamaktadır. [CapCut resmî sitesi](https://www.jianying.com/)

## REA kanıtları ve sonuçlar

### Yazma asistanı ile masaüstü Agent farklı kanıt yüzeyleridir

REA, paketle gelen `image_h5_smart_edit_chat_bot` dizini üzerinde gerçekten statik analiz tamamladı; 8 ilgili dosya okundu, 4 JavaScript dosyası ayrıştırıldı, 874 modül tanımlandı ve sözdizimi ayrıştırma hatası oluşmadı. Ana Evidence `ev_2a8897b54698090e9945afa7ded823e5ce196cd5cc13f73cb63e80eaef4dd1ff`, özet `ev_39909e36eecb4dc670263a7c61e90771b32c5ecdd7c87636281c03e2712e12ae`, hedef dosya görünümü `ev_b7f0ac32bce3db1b722d2a9a85c9088ffe095106da95455195c2f2f06b2d1735`'tir.

Bu kaynaktaki arayüz metni "yazma asistanı"dır; statik kod model seçimi, akış halinde mesaj, iptal, alıntılanan metin, kopyalama ve sonucu metin düzenleyiciye gönderen köprü olaylarını içerir. Bu, genel bir sohbet arayüzünü açıklamaya uygundur, ama "yeni masaüstü Agent tamamen tersine mühendislikle çözüldü"yü kanıtlamaz. Bu tur bu ayrımı açıkça korur.

REA'nın tüm dizin için uygulama ilişkileri ve anlam grafiği kapsamı **partial** düzeyindedir: ilişkilerin bir kısmı sonuç bütçesini aştı, React anlam analizi çalışan işlem yığın sınırına ulaştı, bazı dosyaların anlam analizi başlatılmadı. Elde kalan statik olgular kullanılabilir; eksik ilişkiler yok sayılamaz. Bu bilinmeyenleri kapatmak için bundle yeniden çalıştırılmadı.

### Yerel Agent'ta model, araç ve oturum ayrımı

Yaklaşık 4 MB boyutundaki `libDeepAgentsService.dylib` için arm64 dilimi çıkarıldı ve REA'nın Ghidra sağlayıcısının varsayılan analizinden sonra aşağıdaki kanıtlar gerçekten elde edildi. Ghidra analysis profile digest değeri `20565088524a2d0359b9b96f46ac48e679d774c7b0092c56abc06de8fdbec11c`'dir.

| Soru | Yerel kanıt | Desteklenen sonuç |
| --- | --- | --- |
| Araçlar nasıl dağıtılıyor | `ev_8e1b57bee76e44367230a698d45158e1b520073312cc4c2865a225534c5bdcb6` dizesi, `ev_870deee2ed36f1b17b403d2553d93206ae2aa63b9d834f81c59bd156d0519a04` referansı, `ev_2414e62687dce11aed59b5627f62d78b348b245f563124d6d06f7330a84bc119` sözde kodu | `0x1ae683` adresindeki CallToolAsync günlüğüne `0x133324` tarafından referans verilir; ait olduğu `0x133264` fonksiyonu servis geçerlilik denetimi, eşzamansız geri çağırma ve köprü fonksiyonuna parametre aktaran bir yol içerir. "Ayrı bir araç dağıtım köprüsü var" görüşünü destekler; tüm araçların başarıyla çalıştırıldığını kanıtlamaz. |
| İptal açık bir arayüz mü | `ev_968e228c08d2a322950e46ef30bbc6a38643ccd25dfbde7960c19cf1ee4881ed` | Dışa aktarılan `_da_session_cancel` (`0x17857c`) önce başlatma sonucunu denetler, ardından fonksiyon tablosu üzerinden çağrı yaparak uygular ve durum döndürür. Buna dayanarak tüm araçların hemen iptal edilebildiği söylenemez. |
| Oturum geçmişi ve token yaşam döngüsü | `ev_10511a3ede3b056772bf773e8df72fdaf4e68d9262bc362a8b74f07de61d4810`, `ev_7e2ae4fd25ea49f2b3fae60f42ceca13cdd83be79d1c32d94277ac4aceb02062` | Yerel türler/dizeler geçmiş sayfalama, TokenStreamCancel ve ToolCallCancel içerir; bu, arayüzün varlığına dair kanıttır, çalışma testi değildir. |
| Araç sonuçları için özel işleme var mı | `ev_12b29b49c52bbc0b8345ff0c790033579890f553ca408199311fbc09e8719e20` referansı, `ev_3097e52d2b0b32c3d287836ed06a854c8de4ad155b5dba1bdaa82a988d5f5386` sözde kodu | `0x170930` fonksiyonu 12 karakterlik `material_asr` araç adını karşılaştırır ve özel bir dala yönelir. Araç türüne göre sonuç işleyen bir mekanizmanın varlığını destekler; ASR algoritması veya bulut servisi geri kazanılmadı. |

Araç dağıtımı sözde kodu raporunda tür yayılımı yakınsamamıştır; bazı dolaylı çağrıların ve yapı türlerinin belirsizliği sürmektedir. Rapor yalnızca çapraz doğrulanabilen dizeleri, referansları, dalları ve adlandırılmış dışa aktarımları kullanır; decompile edilmiş C kodunu özgün kaynak kodu olarak ele almaz.

Tam yerel Evidence özel `native-evidence-bundle.json` dosyasına aktarıldı; ardından `close_binary` çağrısıyla kendi oluşturduğumuz Ghidra oturumu normal biçimde kapatıldı ve bağımsız MCP ön ucu normal şekilde çıktı. Eski Hopper oturumu yeniden kullanılmadı.

### Masaüstü düzenleyici tarafındaki ek statik gözlemler

`libVECreator.dylib` üzerindeki sınırlı bayt araması belirli ofsetleri ve dosya parmak izlerini kaydetti, ancak bu bölüm **yerel statik dize gözlemidir ve REA decompile Evidence'ı gibi sunulmaz**:

- `qrc:/Agent/view/AgentChatView.qml` ve ana pencere kapsayıcı yolu, pakette özel bir masaüstü sohbet görünümünün varlığını destekler; tam QML ağacı geri kazanılmadı ve mevcut kullanıcı arayüzü giriş noktası doğrulanmadı.
- `LocalAgentChannel` için open/send/retry/cancel, token olayları, tool_start/tool_end ve oturum geçmişi kurtarma tanılama metinleri; aynı zamanda proje dizini kalıcılaştırma yolu çözümlemesine ilişkin tanılamalar görülür. Bunlar proje bağlamının sohbet yaşam döngüsüyle ilişkili olduğunu ima eder, ama somut diske yazma düzenini veya tüm çalışma dallarını kanıtlamaz.
- `LocalAgentToolDispatcher` bilinmeyen araç, gizli araçların doğrudan çağrılmasının reddedilmesi gibi tanılamalar içerir. Yalnızca günlük dizelerinden eksiksiz bir yetki politikası çıkarılamaz; bu dizeler bu denetimleri atlamak için bir giriş noktası olarak da kullanılamaz.
- Servis paketindeki türler `DeepAgentModelHost`, `DeepAgentToolHost` ve oturum ile akış gözlemcilerini içerir. Elde edilen araç dağıtımı sözde koduyla birlikte değerlendirildiğinde, model ile düzenleme araçlarının ayrıldığı mimari çıkarımı dayanaklıdır.

## CevikEdit için bağımsız tasarım önerileri

Aşağıdakiler, mevcut CevikEdit modeline ve bu turdaki kanıtlara dayanan bağımsız uygulama gereksinimleridir; CapCut'un iç protokolüyle uyumlu olduğu iddia edilmez:

1. Sohbeti geçerli projeye bağlayın; çalışıyor, tamamlandı, hata, iptal ve yeniden deneme durumları sunun. Proje değişimi, düzenleme değişikliği ve geç gelen eski isteklerde sonuçların yanlış projeye yazılmasını önleyin.
2. Kullanıcının yapılandırdığı Claude Code, Codex gibi CLI'ları model arka ucu olarak kullanın; istekleri parametre dizisi ve standart girdi ile iletin, shell komutu birleştirmeyin. CLI'nin kendisi ağa çıkabilir; arayüz hangi metinlerin gönderildiğini açıklamalı, medya veya özel yolları otomatik yüklememelidir.
3. Model, kendi tanımladığı sınırlı bir düzenleme planı üretsin; uygulama katmanı klip/malzeme referanslarını, sayısal değerleri ve geçerli proje sürümünü doğrulasın. Önce okunabilir değişiklikler gösterilsin, sonra düzenleyici transaction'ı ile uygulanıp tek bir geri alma korunsun; modelin döndürdüğü rastgele kod yürütülmesin.
4. Sohbet, araç ve model arayüzleri ayrılsın; böylece zaman çizelgesi yürütücüsü değişmeden CLI arka ucu değiştirilebilsin. Malzemeler, altyazılar ve metinler mevcut CevikEdit proje verilerini kullansın; harici video anlama, ASR, görüntü/video üretimi gibi uygulanmamış yetenekler açıkça sınır olarak gösterilsin.
5. Testler gerçek masaüstü giriş noktasını, sahte CLI protokolünü, iptali ve geç gelen yanıtları, araç planı doğrulamasını, uygulama ve geri almayı kapsamalıdır; kurulu gerçek CLI ile doğrulama, gerçek model sohbetinin yapılıp yapılmadığını ayrıca belirtmelidir; sürüm numarası veya sahte CLI testinin geçmesi bunun yerine geçmez.

## Hâlâ bilinmeyen veya kapsanmayanlar

CapCut bulut çıkarımı, modelleri ve eksiksiz araç listesi, üyelik/kademeli yayın koşulları, Skills'in eksiksiz yürütme semantiği, gerçek medya semantiği anlama veya sürümler arası tutarlılık test edilmedi. Bu turda CapCut'un tescilli kaynak kodunun kopyalandığı iddia edilmedi ve paketteki "yazma asistanı" doğrudan Eylül'de yayımlanan özelliğin eksiksiz uygulaması sayılmadı. CevikEdit'in CLI protokolü, düzenleme planı ve malzeme kütüphanesi kendi ürün tasarımıdır; bunların tamamlanma durumu ürün koduna ve masaüstü testlerine göre ayrıca kabul edilir.
