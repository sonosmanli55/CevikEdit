# CevikEdit

**Ürün gerçeği** — başka hiçbir belge bunu geçersiz kılmaz.

## Ne

Çevrimdışı çalışan masaüstü video editörü. Electron + React + TypeScript, medya işlemleri için yerel FFmpeg/FFprobe. Türkçe arayüz. Proje dosyası `.cevikedit` (JSON), taşınabilir paket ve şablon formatları açık.

## Kim için

Tek başına içerik üreten, internet olmadan çalışan, dosyalarını buluta yüklemek istemeyen kişiler. Amatör-orta seviye kurgu: kesme, çoklu kanal, altyazı, animasyon, ses düzenleme.

## Ne yapar (gerçek, doğrulanmış)

- Video/ses/görsel içe aktarma; FFprobe ile gerçek metadata, HDR tespiti
- Çoklu kanal, taşıma, kırpma, bölme, 0.1–8× hız (perde korunur)
- Anahtar kare animasyonu + serbest cubic-Bézier eğri; önizleme ve dışa aktarma aynı çözücü
- Altyazı: SRT/VTT içe aktarma, böl/birleştir, toplu stil, giriş/bekleme/çıkış animasyonu
- Ses: yerel loudnorm ölçümü, hedef LUFS normalleştirme, konuşma altında müzik kısma (yerel VAD)
- Zaman çizelgesi: 2–1600 px/s yakınlaştırma, ataletli kaydırma, mini harita
- Efekt: parlaklık/kontrast/doygunluk/sıcaklık/bulanıklık, kroma key, maske, kırpma, 8 geçiş
- Ters oynatma ve kare dondurma (yerel FFmpeg, önbellekli)
- 3 hazır şablon; kendi şablonunu kaydet, medya/metin yer tutucularını tek seferde değiştir
- MP4/MOV dışa aktarma (H.264/AAC), aralık seçimi, iptal
- 4K ve 400+ klipli projeler için görünür dilim çizimi ve dışa aktarma bellek uyarısı
- Uygulama içi güncelleme: GitHub sürümlerini denetler, tek tıkla indirir ve kurulumu başlatır

## Ne yapmaz (dürüst sınırlar)

- Bulut, hesap, telemetri, API AI yok
- HDR **çıktısı** yok: HDR kaynaklar SDR BT.709'a eşlenir
- macOS/Linux paketleri bu sürümde doğrulanmadı; imzalama/notarization yok
- CapCut'un şifreli taslaklarına **yazmaz**; açık JSON taslak değişimi verir
- Kare-hassas çoklu kamera senkronu, çoklu kullanıcı, eklenti mağazası yok

## Ton

Sakin, teknik, abartısız. Sayılar ve sınırlar öne çıkar; "AI destekli" gibi pazarlama yok. Türkçe konuşur.

## Teknik gerçekler

- Kurulum: Windows x64 NSIS (`CevikEdit Setup *.exe`), ~130 MB
- Bootstrap: 200 KB'lık `CevikEdit-Kurucu.exe`, en son sürümü GitHub'dan indirip başlatır
- Güncelleme API'si: `api.github.com/repos/sonosmanli55/CevikEdit/releases`
- Lisans: MIT (kaynak), gömülü Noto Sans SC OFL
