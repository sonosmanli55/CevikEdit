# Jianying taslağı içe aktarma sınırları

CevikEdit kendi `.cevikedit` proje formatini kullanır. Masaüstü sürümü deneysel Jianying taslağı dosyası ve proje klasörü içe aktarma sunar: yerel taslağı okur, zaman çizelgesi seçer, doğrulanmış yükü çözer ve temel parçaları CevikEdit projesine çevirir. Dönüşüm zararlıdır, orijinali değiştirmez ve Jianying formatına yazma sunmaz.

## Doğrulanmış format kapsamı

İkinci tur araştırma, yerel Jianying `CFBundleShortVersionString = 11.0.12922`, `CFBundleVersion = 11.1.0-beta3` olan iki özel yetkilendirilmiş proje üzerinde dört yük ayrı ayrı doğrulanmış decode işlemi gerçekleştirdi ve kendinden üretilen medya, zaman aralığı, temel hız, ölçek, döndürme, ses ve metin içeriğini doğruladı. Bu sonuç, ilk tur “yük opak kaldı, henüz çözülemedi” sonucunu yerine getirir; yalnızca bu doğrulanmış taslağın uyumluluğunu kanıt eder, herhangi bir Jianying sürümü, bulut taslağı ya da başka sarmalamanın uyumluluğu kanıtlanmaz.

Şu anda bağımsız decodeçisi şu iki giriş tipini destekler:

- Metin JSON nesneleri; `tracks` ve `materials` ile organize edilen classic taslağın yanı sıra gözlemlenen modern boş zaman çizelgesi yapısı dahil.
- Bu tur doğrulanmış gömülü AES-256-GCM yükü: gerekli anahtar ve IV yükünün kendi on iki parçadan gelir, geri kalan Base64 içeriği şifre ve doğrulama etiketi içerir. Node.js standart şifreleme arayüzü ile bağımsız uygulanır, doğrulama başarısız ya da yük yapısı bilinmediyse içe aktarma reddedilir.

Decode Jianying native klibini çalıştırmaz, hesap bilgisini aramaz ve uzak servise çağrı yapmaz. Açık testler kendi oluşturduğu JSON ve sentetik yükleri kullanır; orijinal taslağın içeriği, tam decode JSON'i, cihaz tanımları ve örneklerdeki anahtar / IV'ler herkese açık depoya girmez. Statik keşif, bağımsız decode doğrulaması, arayüz gözleme ve henüz çözülmemiş ayrıntılar [İkinci tur taslak formatı araştırması](research/DRAFT_FORMAT_ROUND2.md) içinde kaydedildi. Bağımsız doğrulanmış decode, ek supplement Ghidra sabit nokta ters inceleme ve Jianying native dışa aktarma karşılaştırması ayrı ayrı kanıtlar; ayrıntılar araştırma raporunda.

## Proje ve zaman çizelgesi seçimi

Masaüstü sürümde “Dosya” menüsünde “Jianying proje klasörünü içe aktar” ile bir proje dizini seçilir; ya da “Jianying taslağı dosyasını içe aktar” ile taslak dosya seçilir ya da `Timelines/<zaman çizelgesi ID>/draft_info.json` açıkça seçilir.

Modern proje `Timelines/project.json` listesinden silinmemiş zaman çizelgesini tanımlar, `timeline_layout.json` ile mevcut düzenleyici zaman çizelgesini önermek için kullanılır. Projedeki zaman çizelgesi sayısı çoksa uygulama açık seçim ister; “mevcut düzenleme” ve “ana zaman çizelgesi” aynı olamaz, proje kökündeki taslağın gerçek parça içermeyebilir. Açık seçilen zaman çizelgesi kök taslağa ya da geçici yedeklere değiştirilemez; liste geçersiz, seçili dosya eksik ya da doğrulama başarısızsa hata raporlanır. Classic proje klasöründe `draft_info.json` yoksa `draft_content.json` dener; açık seçim bu geri dönüşü desteklemez.

Taslak ve zaman çizelgesi yan dosyaları yalnızca seçili proje dizini sınırları içinde okunur. Taslaftan referans verilen yerel medya masaüstü medya içe aktarma akışıyla denetlenir; eksik medya referansı korunur ve yeniden link gerektirir, uzak kaynak indirilmez. Tarayıcı sürümü yalnızca metin JSON dönüşünü korur, proje klasörü ve gömülü yük decode için masaüstü köprüsünü kullanır.

## Dönüşüm kuralları ve kayıplar

Zaman aralığı mikrosaniyeden CevikEdit saniyesine çevrilir, zaman çizelgesi başlangıcına, süresine, kaynak girişine, 0,1–8 kat temel hız, lineer ses, ortak ölçek, döndürme, şeffaflik ve ters çevirme; normalize konum CevikEdit çerçeve yarım genişliği / yarım yüksekliği birimine eşlenir, Y yönü tersine; bu geometri eşlemesi kontrollü ekran görüntüsü ve native dışa aktarma pikselleri ölçümü destekler, tüm görüntü için piksel eşleşmesi değildir. Alan eksikliğinde kullanılan varsayılanlar ve girdi doğrulaması bağımsız uygulama kararlarıdır, Jianying çalışma davranışının aşina gözleminin yerine geçmez.

Önce taslaftan geçerli çerçeve boyutu kullanılır. Boyut eksikse, ilk içe aktarılabilir görsel parçasından kayıt boyutundan türetmeye çalışılır ve doğrulanması istenir; türetilemezse 1920 × 1080 kullanılır. Kaynak süre eksikse parçalar üzerinden türetip uyarı verilir, kaynak aralığı açıkça aşan parçalar atılır. Malzama yolları yalnızca yerel mutlak yolları kabul eder.

Metin yalnızca temel içeriği korur, font, özel yazı, stil ve yerleşim CevikEdit'in kendi yazı tipi ve stili kullanır. Jianying kritik kareleri, çizgi değiştirme oranları, karmaşık etkinlikler, şablonlar, geçişler, kırpma, geri sarma, özel ses efektleri ve çerçeve arka planı tam eşleşmedi; içe aktarma uyarıları algılanan kayıplar listesini açar. Eşit oran dışındaki ölçek ortak ölçeğe dönüştürülür. Karmaşık proje decode bile olsa tam dönüşü ya da görsel etkilerin korunmasını garanti etmez.

İçe aktırdıktan sonra seçili zaman çizelgesi, çerçeve oranı, medya aralığı, metin ve etkiyi doğrulayın, sonra `.cevikedit` olarak kaydederek düzenlemeye devam edin. Jianying'e yazma desteklenmez, diğer sürüm uyumluluğu garanti edilmez, kontrollü ön izlemenin yaklaşıklığı ticari Jianying tam render uyumluluğuna yükseltilemez.

Hesap, bulut proje, SaaS ve API AI üzerindeki AI işlevleri hâlâ boş bırakıldı. Bu uygulama Jianying özel kodu, kütüphanesi, ikonunu, yazı tipini, şablonunu ya da malzemasını kopyalamadı ya da dağıtmadı; analiz aracı ve yerel özgün inceleme verileri CevikEdit ile dağıtılmıyor.

Çerçeve dışı kırpma, uzun GOP / B kare ve VFR alıntı gerçek zamanlı kare regresyonuna sahiptir; ikinci tur raporunda ayrıntılıdır; kapsam test medya kombinasyonlarıyla sınırlandırıldı.
