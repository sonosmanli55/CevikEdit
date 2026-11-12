# Yerel Whisper otomatik altyazı

CevikEdit'in otomatik altyazısı tamamen yerel çalışır: önce yerel FFmpeg, seçili parçanın sesini 16 kHz mono WAV'e çıkarır; ardından yerel [whisper.cpp](https://github.com/ggml-org/whisper.cpp) komut satırı programı ve GGML modelini çağırır; sonunda sonucu zaman çizelgesine yazan metin parçasına yazar. Ses yüklenmez, otomatik indirilmez.

Tamamen bağımsız bir uygulama; ClipCut kodu, model, yazı tipi veya şablon içermez; ClipCut'un ses tanıma sonuçları girdi olarak kabul edilmez.

## Hazırlık araçları

İki makine dosyası gerekir:

1. **Whisper çalıştırılabilir dosyası**: yeni sürüm `whisper-cli` adlıdır (Windows'ta `whisper-cli.exe`), eski derlemeler `main` diyebilir.
2. **GGML model dosyası**: örneğin `ggml-base.bin`, `ggml-small.bin`, `ggml-medium.bin`. Dosyalar genellikle whisper.cpp projesinin model açıklamasından veya Hugging Face `ggerganov/whisper.cpp` deposundan manuel indirilir.

Ayrıca FFmpeg gerekir. macOS paketi yerleşiktir; Windows / Linux geliştirme ortamında "Ayarlar"dan FFmpeg seçimi yapılabilir ya da `ffmpeg`'nin `PATH`'te bulunması yeterlidir.

Model boyutu ve hızı arasındaki fark belirgindir: `base` hızlı bir taslak için uygundur; `small` / `medium` daha doğru ama daha yavazdır. Model dosyasının kullanımı, dağıtımı ve yeniden dağıtımı kaynağının lisansını takip etmelidir; bu depo modeli içermez.

## Nerede

Whisper programı şu sırayla arar; önceki adım açıkça mevcutsa geriye dönmez, sessizce başka bir programa geçilmez. Model önce kaydedilmiş ya da ortam değişkeniyle belirtilen geçerli dosyayı kullanır, yoksa aşağıdaki dizillerden toplar.

**Whisper çalıştırılabilir dosyası**

1. Altyazı panelinde manuel olarak seçili ve kaydedilen yol (`transcription-tools.json` dosyasındaki kullanıcı veri dizini)
2. Ortam değişkeni `CEVIKEDIT_WHISPER`
3. Yerleşik medya araçları dizini:
   - `media-tools/whisper-cli.exe` / `media-tools/whisper-cli`
   - `media-tools/whisper/whisper-cli.exe`, `media-tools/whisper/whisper.exe`, `media-tools/whisper/main.exe` (macOS / Linux için `.exe` adlı olmayan dosyalar)
4. `PATH` içindeki `whisper-cli` / `whisper-cli.exe`; macOS / Linux `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin` dosyalarını da kontrol eder.

`PATH` içindeki genel `whisper` **otomatik olarak kullanılmaz**. Bu komut genellikle OpenAI Python Whisper CLI'sudur; parametreleri ve çıktı formatı whisper.cpp ile farklıdır; yanlış kullanılırsa tanıma başarısız olur. Eğer gerçek whisper.cpp kullanılıyorsa ama program adı farklıysa, altyazı panelinden manuel olarak seçin.

**GGML model**

1. Altyazı panelinden manuel seçili ve kaydedilen `.bin` yolu
2. Ortam değişkeni `CEVIKEDIT_WHISPER_MODEL`
3. Yerleşik dizin `media-tools/models/*.bin`, `media-tools/whisper/models/*.bin`
4. Kullanıcı veri dizini `whisper-models/*.bin`

Yalnızca `.bin` uzantılısı, boyutu sıfırdan büyük ve 8 GB'ı aşmayan normal dosyaları kabul eder. En fazla 32 model listelenir. Model seçimi `transcription-tools.json` dosyasına yazılır ve bir sonraki başlatma aynı modeli kullanır.

İsteğe bağlı ortam değişkenleri:

- `CEVIKEDIT_WHISPER_DIR`: geliştirme sırasında `whisper-cli` ve modeli depolarda olmayan bir medya araç dizini için ek tarama yapar.
- `CEVIKEDIT_WHISPER` / `CEVIKEDIT_WHISPER_MODEL`: program veya modeli açıkça belirtir; manuel seçim kaydedildiyse kaydedilen yol önceliklidir.

## Arayüzde kullanım

1. Zaman çizelgesinde sesli bir ses veya video parçası seçin; hiçbir şey seçilmezse oynatma başındaki sesli parça kaynak olarak alınır.
2. "Altyazı" panelini açın, "Otomatik altyazı" bölümünde kaynak, dil ve modeli doğrulayın.
3. Dil seçenekleri: otomatik algılama, Türkçe, İngilizce, Almanca, Fransızca, İspanyolca, Arapça veya Rusça. Otomatik algılama modelin kendisine bağlıdır.
4. "Otomatik altyazı oluştur" düğmesine basın. İlerleme aşamaları (ses çıkarımı, tanıma, altyazı düzeltme) gösterilir ve iptal edilebilir.
5. Bitince adında "Altyazı" yazı kanalı otomatik oluşturulur ve tanınan cümleler yazılır. Tüm yazma tek bir geri alma işlemi olarak gerçekleştirilir.

Eğer kaynak parça hız içeriyorsa, çıkarım orijinal hızdaki karşılık gelen kaynak aralığını kullanır; üretim sonrası hızla zaman çizelgesine çevirilir. Parçanın zaman çizelgesindeki konumu, kaynak girişi ve süresi hesaba katılır.

## İşlem kuralları

- whisper.cpp JSON çıktısını destekler (`transcription[]`, `segments[]` veya ham dizi), `offsets` milisaniye değerlerini okur; `timestamps` dizeleri ve SRT geri dönüşü de kabul eder.
- `[Müzik]`, `(music)`, `[BLANK_AUDIO]`, `♪` gibi konuşma olmayan işaretleri temizler; parantez içindeki normal diyaloğu silmez.
- Yaklaşık 90 karakteri aşan tanınan metinler kelime veya karaktera göre ayrılır, hedef her biri yaklaşık 6 saniye; ayrım zamanı metin uzunluğuna oranla dağıtılır. Metin ayrılamıyorsa orijinal zaman penceresi korunur, tekrar ya da uydurma yapılmaz.
- Sonuç parçanın zaman çizelgesindeki başlangıcına taşınır, parça aralığının dışındaki kısmı kırpar, proje kare hızına göre hizlar ve komşu altyazıları örtüşmeden önler. Sürekli tekrar eden kısa cümleler birleştirilir.
- Tek seferde en fazla 2000 altyazı üretilir. Sınırı aşarsa bölme ile tanıma önerilir; yarım ürün yazılmaz.
- Her altyazı parçası en az bir çerçeveyi korur; sınır hizalanmışsa bir çerçeve eksikse genişletilir ya da atılır.

## Gizlilik ve güvenlik sınırları

- Bulut arayüz çağrısı yok, ses, model veya tanıma sonucu yüklenmez, telemetri yok.
- whisper.cpp veya model otomatik indirilmez. Araç eksikse yalnızca seçme ve kurulum ipucu gösterilir.
- Ses yalnızca içe aktarılmış ve yetkilendirilmiş medya yollarından okunur; model keşif listesinden ya da kullanıcının sistem dosya diyaloğundan seçilmiş olmalıdır.
- FFmpeg ve Whisper parametre dizileri ile başlatırlar, shell geçmez; FFmpeg giriş protokolü yalnızca yerel `file,pipe`.
- Çıkarım dosyaları kullanıcı veri dizinindeki geçici alt dizine konur, görev biter, iptal olur ya da uygulama kapatılır temizlenir. Çıktı JSON / SRT sınırı 64 MB; tanıma süreci zaman aşımı vardır, aynı anda tek görev çalıştırılır.
- Pencere kapatma ve uygulama çıkışı sırasında çalışan çıkarım / tanıma süreci sonlandırılır.

## Sınırlar

- Yalnızca whisper.cpp komut satırı programını kabul eder; OpenAI Python `whisper`, bulut API veya diğer ses servislerini kabul etmez.
- Tek seferde tek zaman çizelgesi parçası işlenir ve yalnızca o medyanın ilk ses akımı okunur; zaman çizelgesinin tamamı karıştırılmış tanıma yapılmaz.
- Kelime seviyesi Kara OK vurgulama, konuşmacı ayrımı, otomatik çeviri veya altyazı stili otomatik eşleme yapılmaz.
- Tanıma kalitesi model, dil, gürültü ve parça uzunluğuna bağlı; otomatik altyazı hâlâ altyazı panelinde doğrulanmalıdır.
- Tanıma gerçek hızı yerel CPU/GPU ve model boyutuna bağlı; uzun parçalar zaman aşımına yol açabilir, bölme önerilir.
- Bu depo üzerindeki geliştirme kontrollerinde gerçek whisper.cpp çalıştırılabilir dosyası ve model kurulmadığı için gerçek tanıma kalitesi ve gerçek FFmpeg ses çıkarma hâlâ hedef makinede kabul edilmelidir; [VALIDATION.md](VALIDATION.md) içinde.

## Sorun giderme

| Belirti | Çözüm |
| --- | --- |
| "Whisper bulunamadı" | `whisper-cli` seçin ya da `CEVIKEDIT_WHISPER` ayarlayın; dosyanın çalıştırma izninin olduğundan emin olun |
| "Seçili Whisper kullanılamıyor" | Programı yeniden seçin; yol taşındıysa kontrol edin |
| "Whisper çalıştırılamıyor" | OpenAI Python `whisper` değil; hata özetindeki parametre / model ipuçlarını görün |
| "Whisper konuşma bulamadı" | Parçanın sesli olduğundan emin olun, sessiz değil; daha büyük model veya açık dil deneyin |
| "Otomatik altyazı boş" | Parça zaman aralığını ve kaynak girişini kontrol edin; sesin saf müzik olmadığından emin olun |
| Model listesi boş | `.bin` dosyası seçin ya da kullanıcı veritabanındaki `whisper-models` dizinine koyun |
| Zaman aşımı | Parçayı kısalttı, model boyutunu azalt ya da yerel performansı artır |

## Doğrulama

İlgili testler ve manuel kontroller [VALIDATION.md](VALIDATION.md) içinde. Çekirdek çözümleme ve zaman semanti testleri `tests/transcription.test.ts`, araç keşfi testleri `tests/transcriptionTools.test.ts`, Unix sentetik süreç regresyonu `tests/transcriptionRunner.test.ts` içinde (Windows atlanır).
