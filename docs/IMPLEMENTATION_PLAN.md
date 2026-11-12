# CevikEdit uygulama kaydı

2026-10-13. Kullanıcı yerel geliştirme ve doğrulamaya yerel izin verdi; macOS öncelikli, Windows / Linux de gözden geçirildi; GitHub'e henüz yayın yok. REA araştırmasıyla belirtilen Jianying kurulum paketleri ve özel test taslaflarının gözlemlenebilir davranışını kullanarak bağımsız uygulama geliştirildi. SaaS, bulut ve API AI boş bırakıldı; Jianying özel kodu, kütüphanesi, yazı tipi, ikon ya da şablon malzemesi kopyalanmadı ya da dağıtılmadı.

## Şu anki teslim kanıtları

- [x] REA CLI / MCP araştırma raporu; gözlem, çıkarım, bağımsız tasarım ve çözülmemiş maddeler ayrıldı.
- [x] Derlenmiş Electron düzenleyicisi yerel içe aktarma, düzenleme, kaydetme yeniden açma ve dışa aktarmayı çalıştırdı.
- [x] Çok kanal, taşıma, kırpma, bölme, çoklu seçim, kopyala / yapıştırma, kanal kilidi, mıknatıs / sürüklenme silme ve geri alma / yeniden kullanma.
- [x] Metin / temel altyazı, ses, normal değiştirme oranı, dönüşüm, RGB renk, kritik kare ve paketlenen fades ile geçiş.
- [x] Kaynak uzaklığı kırpma, RGB renk kadranı kırpma, dikdörtge / elips maske; gerçek arayüz ve dışa aktarma pikselleri doğrulandı.
- [x] Proje doğrulama, kaydetme açma, son proje ve yerel otomatik kurtarma; kaydetme yeniden açma masaüstü kabulüyle doğrulandı.
- [x] Gerçek FFmpeg dışa aktarması, ilerleme, iptal, hedef koruması ve medya süreç kapatma testleri.
- [x] v0.4.0'in 270 otomatik testi, 22 dosya geçti (1 atlandı); derleme sonrası çekirdek / görsel masaüstü akışı geçti.
- [x] Çift dilli README, MIT, orijinal bağımlılık notices, OFL yazı tipi kaynağı, derleme yapılandırması ve CI workflow.
- [x] Orijinal yerel demo üretim aracı ve gerçek medya dışa aktarması.
- [x] Son iki masaüstü kanıtı Noto'nun tarayıcı yüklemesini ve yerel yazı motorunu gerçek iddia sonuçları içeriyor.
- [x] Kanal silme / sıralama / yeniden adlandırma store uygulaması ve dört yeni regresyon testi.
- [x] Yeni kanal UI, ses ayrıştırma / yeniden linkleme, canlı Player ve tam paket yeniden çalıştırma.
- [x] Temiz `npm ci` kurulumu ve native modüller hazır; DMG / ZIP üretimi ve imge / sıkıştırma paketi / ad-hoc imza kontrolü.
- [x] Son gerçek `.app`, depo dışında başlatıldı, Noto, ön izleme ve dokuz saniyelik karıştırılmış dışa aktarma smoke.
- [x] Son DMG kopyası bağımsız cwd, font / native canvas, ön izleme ve dokuz saniyelik karıştırılmış dışa aktarma smoke; orijinal / imge ASAR tutarlılığı ve imza / ZIP / imge doğrulaması.
- [ ] Windows / Linux gerçek makinesi çalışması ve gerçek GitHub CI çalıştırılması (bu turda uygun ortam ya da yayın yok).

## Bu tur iyileştirmeleri

- [x] Mevcut yetkili UI ekran görüntülerini kullanarak yerleşim, kaynak sırası, özellik grupları, ölçek / konum kontrolleri ve zaman çizelgesi stili eşleştirmesi.
- [x] Kaynak malzamanın tıklaması ile ön izleme, I/O işaretleri, seçili parça ekleme ve tam parça çift tıklama ekleme.
- [x] Altyazı cümle düzeltmesi ve toplu düzenleme, atomik geri alma, kanal kilidi ve eski plan koruması.
- [x] Malzama paketi toplama, dedup, görecel referans, taşıma devamı ve eksik malzama işlemi.
- [x] Özel / seçili aralık dışa aktarma, kare çözümleme, gerçek piksel ve ses doğrulaması.
- [x] Proje doğrulama, kaydetme / açma, son proje ve yerel otomatik kurtarma uygulandı; kaydetme yeniden açma masaüstü kabulüyle doğrulandı.

## Şu anki kapsam

Bağımsız düzenleyicinin temel yerel iş akışı uygulandı ve doğrulandı. Ticari Jianying'in tüm özelliklerinin birebir eşleşmesi için tam kapsam kanıtı yoktur ve bu kapsamda tanımadık ya da geliştirilmedi. Taslak içe aktarma deneysel ve zararlı dönüşümdür; ikinci tur modern çok zaman çizelgesi dizinleri ve yerel yetkilendirmeli opak taslağın doğrulanmış decode ile ekledi; uyumluluk sınırı CAPCUT_INTEROP.md içinde. SaaS, hesap ve API AI eklenmedi; sahte buton ya da iddia ile uygulanmadı.

Tam kanıt, çalışma ortamı ve sınırlar için [VALIDATION.md](VALIDATION.md); özellik sınırları için [FEATURE_MATRIX.md](FEATURE_MATRIX.md). Son paket doğrulamasından sonra bu kayıt gerçek sonuçlara göre güncellenir; plan ya da test betiğindeki işaretler ile bitmeyen şeyler tamamlanmadığı anlamına gelmez.
