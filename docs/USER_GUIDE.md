# Kullanım kılavuzu

## İlk proje

Masaüstü uygulamasını başlatın, "Ayarlar" bölümünde FFmpeg / FFprobe'in kullanılabilir olduğunu doğrulayın. macOS paketi araçları yerleşiktir, ekstra kurulum gerekmez; ayrıca ayrıca özel çalıştırılabilir dosyalar seçilebilir. Yeni proje varsayılan olarak 1920×1080, 30 fps'tir; hiçbir parça seçili değilse, sağ taraftaki proje parametreleri isim, tuval oranı, boyut, kare hızı ve arka planı değiştirilebilir.

"İçe aktar" düğmesiyle yerel video, resim veya ses seçin; aynı zamanda dosyaları pencereye sürükle bırakabilirsiniz. Malzama çift tıklama ya da malzamanın ekleme düğmesi zaman çizelgesine ekler; belirli düzenlenebilir kanala sürükle bırakarak konum seçilebilir. İçe aktarma gerekebilir, tespit, kısaltma veya yerel ön izleme aracı dönüşümü.

Normal projelerde malzamanın mutlak yolları saklanır. Kaynak dosyayı taşıyıp sildikten sonra malzama kaybolma gösterilir, malzama işlemleriyle yeniden bağlanma gerekir. Proje dosyası kendisi video, ses veya resim içermez; klasörler arası taşıma için aşağıdaki "Projeyi topla" kullanılır.

## Önce önizle, sonra böl

Medya kartına tıklayarak orta bölümde video, ses veya resmi ön izleyebilirsiniz. Video / ses oynatma, kare başına ilerleme ve giriş / çıkış noktası ayarı destekler; odak kaynak ön izleme alanındaysa, `I` / `O` işaretçisi şu konumu işaret eder, boşluk seçili parçayı oynatır. "Eklenen seçili parçayı ekle" ile mevcut zaman çizelgesi oynatma başı konumuna ekler, kaynak malzamanın girişini korur, bir kez geri alınabilir. Kartın çift tıklaması ya da artı düğmesi hâlâ tüm malzemeyi ekler.

Kaynak ön izlemeyi kapatın ya da zaman çizelgesine tıklayın, proje oynatıcısına dönün. Kilitli kanal parça alamaz, otomatik olarak başka uygun kanalı seçer ya da yeni kanal oluşturur. Seçili parça en az proje bir çerçevesi kadar olmalıdır; kayıp ya da çözülemez malzaman önce işlenmelidir.

Malzama bölmesi, oynatmaç ve sağ taraftaki özellik bölmesi arasındaki ayraç yatay olarak sürükle bırakılarak genişletilebilir, yerleşim otomatik hatırlanır. Ayraç odağa gelince yukarı / aşağı ok tuşlarıyla mikro ayar (Shift hızlandırma) yapılabilir; çift tıklama ya da Home tuşu varsayılana döndürür. Pencere küçültülürse her bölümün minimum kullanılabilir genişliği korunur, yerleşim düzenimi proje geri alma geçmişini etkilemez.

## Zaman çizelgesi

Parça seçili, platform çoklu seçim kısayoluyla birden fazla parça seçilebilir; sürükleme parçayı değiştirir ya da uygun kanala yerleştirir. Sürükleme parçanın iki yanından kırpılır; oynatma başı parçada konumlandırılırsa, bölme düğmesi ya da `⌘/Ctrl+B` kullanılır. Kopyalama, yapıştırma, parça kopyalama ve silme geri alınabilir.

Zaman çizelgesi özgür şekilde ölçeklenip kaydırılabilir: araç çubuğundaki büyütme / küçültme düğmeleri ya da kaydırıcı ile 2–1600 px/s aralığında ayarlanır; `Ctrl/⌘ + tekerlek` fare konumunda sabit tutarak ölçekler, `Shift + tekerlek` ya da dokunmatik tarayıcı yatay hareketi yatay kaydırır, orta tuş sürüklenmesi yatay ve dikey kaydı eşler, serbest bırakılınca yerçekimi kayar; zaman çizelgesinin altındaki mini harita tüm parça çubuklarını, görünen pencereyi ve oynatma başını gösterir, tıklama ile atlar; araç çubuğundaki "Harita" aç / kapat. Araç çubuğunun sağında mevcut görünen süre gösterilir; "Uyarlama" görünen genişlikle tam projeyi doldurur, "Oynatma başı" oynatma başını görünen alanın merkezine taşır. Ölçeklendirme ve kaydırma yalnızca görünümü değiştirir, parçayı ya da geri alma adımını etkilemez.

Önizleme sırasında alt tabloda "Giriş yolu" seçilen yöntemin seçili aralığın zaman çizelgesine nasıl eklendiğini belirler: **Son uca ekle** hedef kanalın sonuna koyar; **Ekle ve sonları kaydır** oynatma başında koyar, kesişen parçayı böler ve aynı kanalda sonraki parçaları sağa kaydırır; **Geçerli konuma yaz** oynatma başındaki aynı kanaldaki aralığı değiştirir, kesilen parçaların iki yanı kalan kısmı korur. Üç yöntemden yalnızca hedef kanalı etkiler, ayrı ayrı geri alınabilir; kilitli kanal reddeder.

"Audio" sayfasındaki "Ses ayrıştırma" ayrı bir ses kanalı oluşturur ve kaynak video sessizleştirilir. Ayrılma sonrası iki parça bağ kurulu kalır: taşıma, kırpma, bölme, silme, kopyala / yapıştırma veya parça kopyalama birlikte değişir. Sağ taraftaki "Audio" sayfasındaki "Bağlı parçalar" açıklaması görünür; "Bağlantıyı kes" ile bağ kopar, iki taraf ayrı ayrı düzenlenir; kopma ve sonraki taşıma geri alınabilir. Ayrıştırılmış ses kanalı orijinal parçanın ses seviyesi, ses anahtar kareleri ve ses fade'ini kullanmaya devam eder, ayrı ayrı ayarlanabilir.

"Audio" sayfasının altında yerel ses araçları gelir (arayüz tamamen Türkçe). Sesli parça seçildiğinde "Ses düzeyini ölç" ile parçanın gürültü (LUFS), gerçek en yüksek değer (dBTP) ve gürültü aralığı ölçülür; sonra hedef seçilir (sosyal medya −14, çevrimiçi video −16, diyalog −18, yayın −23) ve "Ses düzeyini normalleştir" ile kazanım parçanın ses seviyesine ve mevcut ses anahtar karelerine yazılır, gerçek en yüksek değer −1 dBTP ile sıkıştırılır. Ölçüm ve yazma tamamen yerel yapılır, ses yüklenmez.

Müzik baskılması: önce "Konuşma" ve "Müzik" listelerine "Seçileni ekle" ile sesli ve müzik parçalarını ekleyin, Kısma miktarı (negatif dB) ve Geçiş süresi (saniye) ayarlayın, "Müziği konuşma altında kıs" tuşuna basın. Sadece gerçekten konuşulan yerlerde baskı istiyorsanız önce "Konuşma aralıklarını algıla": uygulama parçayı yerelde çözer ve çevrimdışı konuşma algılama (gürültü tabanı, gecikme, birleşme, patlama atma) yapar, algılanan aralıklar "X aralık algılandı" olarak gösterilir ve "Yalnızca gerçek konuşma" ile hangi aralıklarda baskı yapılacağına karar verilir; kapalıysa bütün parça bazında baskıya dönülür. Müzik konuşma aralıkları içinde düşürülür, konuşma öncesi/sonrası geçiş süresiyle orijinal ses seviyesine döner; sonuç normal ses anahtar karelerine yazılır, "Animasyon" sayfasından düzenlenebilir; önizleme ve dışa aktarma aynı sayı kullanır. Seçili müzik ile konuşma aralığı örtüşmüyorsa ya da müzik kanalı kilitliyse değişiklik reddedilir. Detay: [Yerel doğrulama](VALIDATION.md).

Kanal yeniden adlandırılabilir, sıralanabilir, silinebilir, kilitlenebilir, sessize alınabilir ya da gizlenebilir. Parçalı kanal silinmeden önce onay istenir, malzama kitaplığı korunur ve kanal ile parçalar bir kez geri alınabilir; kilitli kanal silme / yeniden adlandırma / taşımayı reddeder, taşıma komşu kilitli kanalları değiştirmez. Kilitli kanal değişikliği reddedilir, oynatma ve dışa aktarmada yine de katılır; gizlenen görsel yalnızca video katmanını gizler, ses hâlâ duyulur, ayrı ayrı sessize alınabilir. Ses kanalları resim olarak çizilmez. Üstteki ayracın sürükle bırakılarak yükseklik ayarı yapılabilir, odak ayracında da ok tuşları ile ayar yapılabilir.

Asitleştirme parça kenarlarını zaman çizelgesi işaretleri veya diğer kenarlara yaklaştığında eşleştirir. Mıknatıs silme işleminde aynı kanaldaki sonraki parçaları sıkıştırır; tüm ClipCut ana kanal mıknatısı davranışının tam uygulaması değildir. Aynı kanalda örtüşen parçalar farklı alt satırlar halinde gösterilir, örtüşmeyi seçmek güçleşmesin diye.

## Görsel, ses ve animasyon

Görsel parça seçildiğinde sağ taraftan konum, ölçek, döndürme, çevirme ve opaklık ayarlanır. Oynatıcıda seçili görseli sürüklemek konum değişimini gerçek zamanlı ön izler; bu özelliğe anahtar kare varsa yol boyunca birlikte hareket eder, bırakma tek geri alma oluşturur. Oynatma başı proje sonuna geldiğinde son kare saklanır. "Ayarlar" ya da yerel etki ön ayarları parlaklık, kontrast, doygunluk, renk sıcaklığı ve bulanıklığı kontrol eder.

"Audio" sesi, sessize alma ve ses fade'ini kontrol eder; görsel fade'leri ve ses fade'leri ayrı ayrı ayarlanır. Sesli video, ses ayrıştırma işlemiyle ayrı ses kanalı oluşturabilir; orijinal video sessizleşir. Normal hız aralığı 0,1–8 kat; süre hızla değişir, ses yüksekliğini koruyan işlem kullanılır.

Video parçası seçildiğinde "Hız" sayfasındaki "Parça araçları" ile geri sarma veya dondurma yapılabilir. Geri sarma yalnızca parçada kullanılan kaynak aralığını işler, yerel önbellek MP4 üretir ve parçayı değiştirir; video ve orijinal ses birlikte ters çevrilir, zaman çizelgesi başlangıcı, süresi, hızı, anahtar kareleri ve fade'ler değişmez, orijinal malzama kitaplığında kalır. İşlem ilerleme gösterir ve iptal edilebilir; bellek bütçesi kısıtı, 1080p30 parçası yaklaşık 34 s, 4K30 yaklaşık 13 s'yi izler; daha uzun parça önce bölünmelidir. Dondurma için oynatma başının seçili parçada olduğuna gerek vardır; "Durdurma süresi" ayarlandıktan sonra "Şu çerceveyi dondur" ile, metin kanalının altında ve normal video kanalının üstünde ayrı resim parçası oluşturulur, mevcut görselin konumunu, ölçü, renk ayarı, kırpma, kesme ve maskeyi miras alır, sonrasında "Görsel" sayfasındaki "Parça süresi" ile süre ayarlanabilir. Dondurma resmi kendi sesi taşımaz, altta video sesi çalışmaya devam eder. İki türetilmiş dosya kullanıcı veri dizinindeki `reverse-media` ve `freeze-frames` alt dizinlerine konur; proje kaydedildiğinde referans verilir; kullanılma sırasında önbellek dosyaları elle silinmemelidir.

Oynatma başına taşınır, özelliklerin yanındaki diamant düğmesiyle anahtar kare eklenir; mevcut anahtar kare özelliklerine sonrasında yazma yapılır. "Animasyon" sayfasında çizgi ve tüm parça anahtar kare listesi ile anahtar kareleri görüntülenir: çizgide tıklama oynatma başını bulur, noktayla sürüklenme zaman ve değeri eşler, ya da seçilip hassas zaman ve değer girilir; kopyalama, oynatma başına yapıştırma, atlama veya silme yapılabilir. İlerleme seçenekleri: lineer, giren, çıkan, giren-çıkan; çizgi, ön izleme ve dışa aktarma için aynı pencereleme formülü kullanılır. Bölme, kırpma ve hız değişimi ile çizgi ve fade paketini korur; fade parametreleri yeniden ayarlanırsa mevcut parça için yeni paket oluşturulur. Adlandırılmış ön ayarlar veya "Özel Bézier" ile iki kontrol noktası sürüklenebilir ya da X1/Y1/X2/Y2 girilir; Y 0–1 dışında kullanılarak geri çekme ve aşırı geçiş üretilebilir, X tek monoton olmalıdır. Önizleme kesin çözümü, dışa aktarma 24 parçaya bölünmüş çizgi yaklaşımını kullanır.

Metin alanı 25 düzenlenebilir şablon içerir, başlık, alttan üçte, altyazı, etiket, animasyon ve sosyal medya kategorilerine göre; artı düğmesi oynatma başına ekler, sağ taraftan devam edilir. Etkiler bölgesi 8 renk ve 8 animasyon efekti içerir, animasyonlar ilgili özelliğe anahtar kareı üzerine yazar, diğer parametreler korunur. Geçiş bölgesi 8 ön ayar içerir, önce aynı kanalda komşu parçanın önceki bölümünü seçip sonra süre ayarlayıp artı basılır; "arka planda" dışındaki son bölüm önceden örtüşür, kaynak malzama kırpılmaz. Geçişler arasında boşlukta geçmez, kilitli kanal ve sonraki parçayla çakışma reddedilir, süre iki parça için yarım çerçeve sınırında tutulur. Kısa görüntü veya klavye odağı ön izleme yapabilir, ekleme ve uygulama bir kez geri alınabilir. Parça fade'leri etkiler bölgesinde tutulur. Detay: [Yaratıcı malzama](CREATIVE_LIBRARY.md). Sağ taraftaki "Görsel" altındaki "Kırpma" kaynak uzaklık oranında keser; "Kesme" RGB renk, benzerlik ve geçişle seçili rengi kaldırır; "Maske" dikdörtge / elips, boyut, yumuşatma ve ters seçim sağlar. Bu özellikler varsayılan kapalıdır, temizleme işlemi kaldırdığı etkiyi kaldırır, kilitli kanalda değişiklik reddedilir. Gerçek ön izleme ve dışa aktarma doğrulamaları vardır, ticari AI karakter kesme veya tam maske sistemi değildir.

## Metin ve altyazı

"Metin" ekleme düğmesiyle metin veya yerel stil şablonu eklenir. Sağ taraftan içerik, boyut, yerleşik Noto Sans SC ya da yerel yazı tipi, renk, kalınlık, hizalama, çizgi, arka plan ve yerleşim satır yüksekliği, iç kenar boşluğu, köşe radyosu ve metin gölgesi düzenlenir. Şablonlar bu projede kendisi tanımlıdır, ClipCut yazı tipleri veya şablon malzemeleri içermez.

"Altyazı" SRT veya temel WebVTT içe aktarır. Altyazı yazı kanalındaki düzenlenebilir parça olur, zaman proje kare hızına göre işlenir. Dışa aktarılan altyazı SRT üretir, projedeki metin parçalarını içerir; altyazı dosyası yalnızca zaman ve metni kaydeder, stil, görsel konum veya metin animasyonu kaydedilmez, bu etkiler gerekirse video dışa aktarılmalıdır.

Altyazı panelindeki "Otomatik altyazı", yerel whisper.cpp ile seçili parçanın sesi tanır, buluta gitmez. Sesli parça seçilirse (hiçbir şey seçilmezse oynatma başındaki parça), dil ve GGML modeli ile "Otomatik altyazı oluştur" basılır; FFmpeg yalnızca parçada ilgili kaynak aralığını çıkarır, tanıma sonucu parça başlangıcı, hız ve proje kare hızına göre yeni "Altyazı" yazı kanalına yazar, tüm yazma tek geri alma, süreç iptal edilebilir. whisper.cpp'nin `whisper-cli` ve `.bin` modeli kendisi hazırlanmalıdır; uygulama ses yüklemez, otomatik indirme yapmaz. Keşif sırası, yerleşim, gizlilik sınırları ve kısıtlar için [Yerel Whisper otomatik altyazı](TRANSCRIPTION.md) bakın.

Altyazı panelinde ayrıca yazı kanalı seçimi, arama, çoklu seçim, tıklama konumlandırma ve içerik ile başlangıç / bitiş saniyesi düzenlenebilir. Toplu işlemler: oynatma başına bölme, seçili altyazıların birleştirilmesi, zaman kaydırması, metin bul ve değiştirme, tek tip stil ve metin animasyonu; önce inceleme yapılıp sonra uygulanır, tek geri alma geri getirir. Zaman proje kare hızına göre hizalanır, kilitli kanalda değişiklik reddedilir; düzenleme durumu değiştiğinde toplu plan yeniden kontrol edilmelidir. Tek tip stil her cümlenin metnini, zamanı, konumunu ve animasyonunu korur, zaman kaydırması parça içindeki animasyonu korur.

Bölme, seçili altyazının içinde olduğuna ve iki yanında en az bir çerçeve bırakılması gerektiğine bağlıdır: sol bölüm `[başlangıç, oynatma başı)`, sağ bölüm `[oynatma başı, bitiş)`; metin karakter oranında kesilir, yakın noktaya / satır sonuna / boşluğa öncelikle seçilir. Birleştirme yalnızca aynı yazı kanalında ve devam eden / örtüşen altyazıları kabul eder, zaman en erken başlangıçtan en geç bitişe kadardır, metin satır sonuna göre birleştirilir, stil ve yerel animasyon en eski altyazıdan alınır; boşluk varsa önce zaman ayarlanır sonra birleştirilir. Bölme ve birleştirme anında uygulanır, ayrı ayrı geri alınır.

"Tek stil" doğrudan font, boyut, metin / çizgi / arka plan rengi, çizgi kalınlığı, satır yüksekliği, kenar boşluğu, köşe radyosu, kalınlık, arka plan ve hizalama değiştirebilir; önce bir referans altyazısından stil kopyalanıp tek alan üzerine yazılabilir. Yalnızca stili değiştirir, her altyazının metnini, zaman aralığını, konumunu ve animasyonunu değiştirmez. Tek altyazının tam stilini değiştirmek istiyorsa, o altyazı seçiliyse sağ taraftaki "Metin" panelinden düzenlenebilir.

"Metin animasyonu" seçili altyazı için giriş (yok, fade, yükseliş, ölçek), kalıcılık (sakin, nefes) ve çıkış (yok, fade, iniş, ölçek) ayarlar ve giren / çıkış sürelerini doldurur. Süreler kareye hizalanır ve her altyazının giriş ve çıkışı o altyazının süresinin yarısından fazla tutulmaz, kısa altyazılar otomatik kısılır. Animasyon, seçili altyazının mevcut konum, ölçek ve opaklık anahtar karelerini değiştirir, döndürme ve ses anahtar karelerini korur; parça parça farklı animasyonlar sağ taraftaki anahtar kare panelinden devam ettirilebilir. Altyazı dosyası animasyonu kaydetmez, ön izleme ve dışa aktarılan video etkileri korur.

## Şablonlar ve toplu değiştirme

"Şablon" sayfası sık kullanılan yerleşimleri yeniden kullanılabilir başlangıçlara dönüştürür. **Projeyi şablona kaydet** mevcut projeyi şablona çevirir: tuval, kanallar, stiller, animasyonlar ve zaman tam korunur; medya yalnızca "Medya yerleştirmesi" olarak kaydedilir (yerel yol yazılmaz, dosya kopyalanmaz), hiçbir parça tarafından kullanılmayan medya atılır. Paket içinde üç tane özgün şablon vardır: **Açılış kartı** (yatay 6 sn açılış), **Dikey sosyal video** (9:16, 8 sn), **Altyazı bloğu** (yatay 12 sn, üç sıralı altyazı).

Şablon seçilince yeni proje adı girilir, her bir medya (isteğe bağlı "Yerleşik varsayılan" ile yerleşik malzama ya da mevcut projedeki malzama kitaplığından dosya) ve tüm metinler aynı forma girilir, sonra **Bu şablonla proje oluştur**: üretilen bağımsız yeni projedir, kanallar, parçalar ve anahtar kare kimlikleri yeniden üretilir, orijinal şablon değiştirilmez. Yeni malzama kendi başlangıcıyla saati başlatır; şablon parçası kısa ise parça kare basmasıyla kısılır ve anahtar kare / fade ile senkron kırpar, uyarı verir. Opsiyonel yerleştirme boş bırakılırsa ilgili parçalar atılır ve uyarı verilir; zorunlu yerleştirme boş bırakılırsa oluşturma reddedilir.

**İçe aktar / dışa aktar** `.cevikedit-template` dosyalarının bilgisayarlar arasında paylaşılması içindir. İçe aktarmadan önce tam doğrulama yapılır: yerel yol içeren malzama, çarpanlı yerleştirme yolları, medya tip uyumsuzluğu, tekrarlı yerleştirme anahtarları, 100 malya / 200 metin yerleştirmesinden fazla, resimsiz kapak reddedilir ve Türkçe neden gösterilir. Şablonlar kullanıcı veri dizinindeki `templates/` altında durur, şablon silme yalnızca o dosyayı siler.

## ClipCut yerel projesi içe aktarma

Masaüstünde "Dosya" menüsünde "ClipCut projesi klasörünü içe aktar" ya da "ClipCut taslak dosyasını içe aktar" seçilir. Proje klasöründe birden fazla zaman çizelgesi varsa, son geçerli zaman çizelgesi öncelikli önerilir; isim doğrulandıktan sonra içe aktarılır, boş ana zaman çizelgesi otomatik olarak geçerli zaman çizelgesini değiştirmez. Belirli bir zaman çizelgesinin taslak dosyası da seçilebilir.

Açık JSON ve bu tur doğrulanan yerel opak taşıyıcı desteklenir. Dosya biçim ve bütünlük kontrolünden geçmelidir, başarısız olursa mevcut düzenleme korunur. Tüm süreç orijinal taslak değiştirmez; içe aktarımdan sonra `.cevikedit` olarak kaydedilir. Taşınmış kaynak medya yeniden bağlanmalıdır.

Bu kayıtsız bir içe aktarımdır: temel video, ses, metin ve normal dönüşümler dönüştürülebilir; yazı tipi yerleşimi, karmaşık etkiler uyarı gösterir. Görüntüyü, sesi ve dışa aktarmayı doğrulayın; sürüm kapsamı için [İkili çalışma](CAPCUT_INTEROP.md) bakın. Tarayıcı ön izlemesi yalnızca açık dosyaları destekler, tam klasör seçimi ve çözüm için masaüstü istemcisine gerek vardır.

## Kaydetme, kurtarma ve dışa aktarma

`⌘/Ctrl+S` ile `.cevikedit` projesini kaydedin. "Dosya" açma, kaydetme ya da yeni proje yapabilir. Son proje ayarlarda gösterilir. Yerel otomatik kaydetme gecikmeli yazma kullanır, başlatma sırasında kurtarılabilir proje bulunduğunda kurtarma isteği gösterilir; işlem sonrası yine de kendi dosya konumuna kaydedilmelidir.

"Files → Projeyi topla..." ile hedef klasör seçilir, `proje.cevikedit`, `media/`, Türkçe `KULLANIM.txt` ve ilk toplama doğrulama listesi içeren yeni bir klasör oluşturulur (klasör adı "proje-adı-medya-paketi-numara"). Paylaşılan orijinal dosyalar yalnızca bir kez kopyalanır, medya kitaplığında zaman çizelgesinde kullanılmayan malzama içerir. Tüm klasör taşınırken içinde açılan proje düzenlemeye devam eder; doğrudan kaydetme göreli yolları korur, yeni içe aktarılan malzama da pakete kopyalanır. Paket içi eksik malzama kaydetme diğer düzenlemeyi engellemez, oynatma / dışa aktarma yine yeniden bağlanmalıdır. Önizleme önbelleği ve sistem yazı tipleri paketlenmez, sistem yazı tipi hedef bilgisayarda kurulmalıdır. `manifest.json` ilk toplamada kullanılan geçmiş doğrulama listesidir, düzenlemelerle güncellenmez.

Dışa aktarma kapsamı tamam, seçili parça veya özel başlangıç / bitiş saniyeli aralık destekler. Aralık o zaman dilimindeki tüm görünen katmanları ve sessiz olmayan sesleri, parçalar arasındaki boşlukları içerir; yalnızca seçili katman dışa aktarılmaz.

Dışa aktarma tuşuna basın, kaydetme konumu, çözünürlük, kare hızı, kalite ve MP4 / MOV seçilir. İki container şu anda H.264 / AAC ile kodlanır. Dışa aktarma orijinal malzama ve yerel FFmpeg kullanır, medya yüklenmez. İlerleme penceresi iptal edilebilir; yalnızca başarılı tamamlama hedefi değiştirir.

Dışa aktarma öncesi çerçeve sayısı, en yüksek bellek tahmini ve uyarılar gösterilir, projedeki HDR kaynakları listelenir; 4K ve çok büyük projelerde önce çözünürlük düşürme ya da bölme önerilir, bellek bütçesini aşarsa başlatma doğrudan reddedilir. HDR (PQ/HLG) malzama içe aktarıldıktan sonra HDR/HLG rozeti taşır, dışa aktarım sırasında otomatik olarak SDR BT.709'e ton eşleme yapar, dosya bt709 işareti yazar; şu an HDR dışa aktarmanız yapılmaz.

"Files → Taslak değişim dosyasını dışa aktar (JSON)" açık metin taslak değişim dosyasını yazar, CevikEdit tarafından yeniden içe aktarılabilir; ClipCut şifreli taslak değildir, ClipCut doğrudan açamaz.

Projenin kaynak zamanı dosya, malzama kaybı, metin katmanı çok büyük ya da parametreler destek aralığının dışındaysa dışa aktarma hata verir, önce proje düzeltilir sonra yeniden denenmelidir. Chromium ön izlemesi desteklenmeyen kodlamayı araçla deneyebilir; araç dönüşü başarısızsa arayüz ön izleme sorununu söyler, dışa aktarmanın kullanılabilirliği yine orijinal malzama ve FFmpeg yeteneğine bağlı kalır.

## Kısayollar

| İşlem | macOS / Windows, Linux |
| --- | --- |
| Oynat / duraklat | Space |
| Böl | ⌘ / Ctrl + B |
| Kopyala / yapıştır | ⌘ / Ctrl + C / V |
| Parça kopyala | ⌘ / Ctrl + D |
| Geri al / yinele | ⌘ / Ctrl + Z / Shift + Z |
| Tüm parçaları seç | ⌘ / Ctrl + A |
| Sil | Delete / Backspace |
| Önceki / sonraki çerçeve | ← / → |
| Önceki / sonraki 1 sn | Shift + ← / → |
| Proje yeni / aç / kaydet | ⌘ / Ctrl + N / O / S |
| İçe aktar / dışa aktar | ⌘ / Ctrl + I / E |
| Zaman çizelgesi ölçekle | + / − |

Girdi kutularında normal yazı giriş davranışı korunur. Tarayıcı ön izlemesi tam masaüstü dosya köprüsü, güvenilir çapraz oturum medya kurtarma veya FFmpeg video dışa aktarma desteklemez.
