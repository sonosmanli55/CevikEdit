# Asistan

CevikEdit v0.3 asistanı ayrı bir uygulamadır. REA + Ghidra, Jianying masaüstü asistanının gözlem ve çıkarım sınırlarını [araştırma kaydı](research/ASSISTANT_RESEARCH.md) içinde bulur. Bu asistan, makinede kurulu Codex CLI ya da Claude Code kullanarak konuşma ve düzenleme önerisi üretir; Jianying'in hizmetini, kodunu ya hesabını kullanmaz.

Sağ üst köşedeki “Asistan” düğmesine bas, backend seç; otomatik keşif yoksa “CLI seç” diyerek çalıştırılabilir dosya belirleyebilirsin. Önce CLI'yı kendin kur ve terminalde normal giriş yapmış olmalı. CLI kendisi ya abonelikle gelmez; DMG'ye dahil değildir; kullanılabilirlik, fatura ve kullanım limitleri ilgili sağlayıcı tarafından yönetilir. Paketteki medya düzenleme, malzama ve dışa aktarma yalnızca yerel kullanılabilir.

Kullanıcı gönder'e bastığında uygulama soruyu, son konuşmayı ve sınırlı zaman çizelgesi özetini seçili CLI hizmetine verir. Özet parça/malzama adları, altyazı metni, zaman ve düzenleme parametrelerini içerir; medya dosyası, yol ya thumbnail içermez. Asistan video izleyemez, sesi duyamaz ya da altyazıyı otomatik tanımlamaz. Proje içi konuşmalar makine kullanıcı veri dizininde kalır, `.cevikedit` dosyasına gömülü değildir.

Asistan şu düzenlemeleri destekler: metin ekleme, mevcut malzama kullanma, kırpma, bölme, taşıma, silme, normal hız değiştirme, ses, statik dönüşüm, fade ve çerçeve ayarları. Gelen öneriler önce proje kopyasında tek tek incelenir, somut liste gösterilir, kullanıcı “Uygula"'ya bastığında zaman çizelgesine yazılır; bir geri al toplu düzenlemeyi geri getirir. Üretim sırasında proje değişirse eski öneri uygulanamaz. Asistanı kapatma, proje değiştirme veya iptal düğmesine basma oturumu bitirir; tarihsel konuşma düzenlemeleri otomatik tekrar oynatılmaz.

CLI bağımsız geçici dizinde çalışır; komut, dosya düzenleme ve harici araçlar devre dışıdır; zaman aşımı, çıktı uzunluğu ve düzenleme eylemleri sınırlandırılır. Destek durumu CLI sürümüne bağlı; uyumsuz parametre ya araç çağrısı tespit edilirse durur, otomatik azaltmaz. Herhangi bir gelecek sürüm ya yönetici konumundaki CLI yapılandırmasının aynı davranış göstermesi garanti edilmez.

Makinede gerçek Codex CLI sentetik istekleri geçerli öneri döndürdü. Claude Code protokol adaptasyonu sentetik süreç testiyle doğrulandı; makinede gerçek çağrı giriş/ kimlik doğrulama hatalı döndü; bu yüzden Claude gerçek hizmet yanıtı geçmişe yazılmadı. Codex şu anki exec protokolü mesaj olaylarında metin sağlar, arayüz çalıştırma durumunu gösterir, aşırı token akışı iddiası yok; Claude adaptasyonu kısmi metin olaylarını destekler.
