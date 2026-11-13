# Codex'te CevikEdit kullanımı

CevikEdit iki giriş sunar: bağımsız DMG masaüstü uygulaması ile Codex masaüstü ekinin sağ kenar çubuğu paneli. İkisi aynı düzenleyiciyi ve yerel medya motorunu kullanır. Eklenti için **CevikEdit 0.11.0 veya üzeri** sürümü yerel olarak kurulu olmalıdır; bu bir bulut tabanlı video düzenleyici hizmeti değildir.

## Kurulum

1. [v0.11.0 sürümü](https://github.com/sonosmanli55/CevikEdit/releases/latest) dosyalarından Windows kurulum paketini ve eklenti ZIP'ini indirin. CevikEdit DMG'sini açıp uygulamayı “Uygulamalara” sürükleyin ve en az bir kez başlatarak sistem izninin verildiğini doğrulayın.
2. Codex masaüstü ekini ve CLI'sini kurun; terminalin `codex` çalıştığını ve Python 3 olduğunu doğrulayın.
3. CevikEdit kaynak dizininde ya da açılmış eklenti ZIP dizininde şu komutları çalıştırın:

```sh
sh scripts/install-plugin.sh
```

Uygulama başka bir konumdaysa:

```sh
sh scripts/install-plugin.sh --app /absolute/path/CevikEdit.app
```

Script önce uygulama sürümünü doğrular, ardından `codex plugin marketplace add` ve `codex plugin add` ile yerel eklentiyi kurar. Codex araç onaylama politikalarını değiştirmez. Belirli yollar `~/.config/cevikedit/plugin.json` dosyasına kaydedilir; `CEVIKEDIT_APP` ortam değişkeni bunu geçersiz kılabilir. Varsayılan arayüz `/Applications/CevikEdit.app` ve `~/Applications/CevikEdit.app` arar.

Plugin'i yeniden bağlayın ya da yeni bir Codex sohbeti açın; araç ve skill yüklenir, ardından şunu yazın:

> Sağ tarafta CevikEdit ile video düzenleyiciyi aç.

Ayrıca eklenti listesinde CevikEdit'i etkinleştirebilir, sonra `$cevikedit` kullanabilirsiniz.

## Doğrudan işle ve Codex'in kurguyu yapması

Sağ tarafta yerel CevikEdit'in gerçek zamanlı etkileşim görüntüsü gösterilir; tıklama, parça sürüklenmesi, tekerlek, klavye kısayolları desteklenir. Panel daha dar pencere için varsayılan olarak boyutlanır; **100%** tıklanarak orijinal boyutta kaydırma görüntülenebilir. Çinçe ya da uzun metin için önce düzenleyicinin giriş alanını, sonra alt kaydırıcı ile gönderin.

Üst araç çubuğu içe aktarma, açma, kaydetme ve dışa aktarmayı içerir. Dosya seçimi / kaydetme macOS sistem diyaloğu açar; başka bir pencere tarafından kapatılırsa “Masaüstü pencereğini göster”e tıklayın. Tam üretim, malzama, metin, etki, geçiş ve dışa aktarma iş akışı masaüstü sürümüyle aynıdır.

0.5.1'den itibaren bağlantı, araç listesi sorgulama ve kenar çubuğu kaynağı okuma CevikEdit'i başlatmaz. İlk gerçek araç çağrısı olduğunda uygulama başlar; aynı bağlantı bir örneği yeniden kullanır; uygulama hata durumunda otomatik döngü başlatmaz. macOS uygulaması yükleme aşamasında iptal modunda başlar; “Masaüstü pencereğini göster” tıklandıktan sonra Dock simgesi görünür. Bu pencereyi kapatmak simge gizler ama eklenti oturumunu korur. Doğrudan masaüstü sürümü hâlâ Dock'ta normal görünür.

Ayrıca şu şekilde de söyleyebilirsin:

> Bir 5 saniyelik başlık videosu yapayım, “Benim ilk videosum” olsun, sonra kontrol et.

Codex şu işlemleri yapabilir: mevcut projeyi okur, belirtilen malzemeleri içe aktarır, metin ve parça ekler, kırpma, bölme, taşıma, görsel / ses ayarlarını düzenler, oynatır, konumlandırır, geri alır ve yeniden yapar. Toplu düzenleme mevcut revizyonu taşır; arayüzde sen düzenledikten sonra eski öneri reddedilir, yeni düzenlemeyi kapamaz. Her toplu düzenleme tek geri alınabilir.

## Mevcut sınırlar

- [iPhone-use](https://github.com/zhongerxin/iPhone-use) benzeri bir MCP App gerçek zamanlı görüntü köprüsü kullanılır. Panel yaklaşık 6 fps; gerçek hız konak ve pencere boyutunu etkiler; bu bir etkileşim görüntüsüdür, orijinal kare hızlı video izleme değildir. Ses yerel CevikEdit tarafından çalar. İnce önizleme için masaüstü pencereyi gösterilebilir.
- Panel doğrudan Finder'dan dosya sürüklemeyi desteklemez; “Malzama içe aktar” kullanın ya da yol açıkça belirtin. Çince giriş için alt kaydırıcı girişi önerilir.
- Eklenti oturumu bağımsız çalışır; her bağlantı için kurtarma verileri `~/Library/Application Support/CevikEdit-Plugin/sessions/<konuşma>/` altında izole tutulur, `cevikedit_state` recoveryPath döndürür; yeniden bağlamadan sonra o `autosave.cevikedit` kurtarılabilir. Önemli projeler aktif olarak kaydedilmelidir. Uygulamanın kaydedilmemiş projelerini otomatik devralmaz; `.cevikedit` dosyaları ile kaydetme / açma aracılığıyla değişim yapılır.
- Yerel stdio eklenti Codex masaüstü ekine yöneliktir; Codex CLI araç kullanabilir, fakat grafik panel yoktur. ChatGPT web eklentisi değildir, henüz herkese açık eklenti diziniye gönderilmedi.
- İlk sürüm Apple Silicon macOS üzerinde doğrulandı. Windows / Linux için platform uygulama yolu ve bağımsız kabul gerekir.

## Veri ve izin

Eklenti HTTP hizmeti başlatmaz, telemetri, giriş, bulut senkronizasyon ya da doğrudan AI API eklemeyen bir araçtır. Medya ön izleme, kaydetme ve dışa aktarma yerel CevikEdit içinde çalışır; eklenti yalnızca kendi CevikEdit oturumunu başlatır, diğer uygulamaları yakalamaz.

Codex'e gönderilen veriler Codex tarafından aktif olarak okunan proje özetleri, metinler, işlem sonuçları ve açıkça istenen ekran görüntüleri içerir. Gerçek zamanlı kare aracı yalnızca panelden kullanılır. Veriler yine de Codex'in kendi veri işleme biçimine tabidir; bu yüzden her bilginin bu makineden çıkmadığı anlamına gelmez. İçe aktarma aracı yalnızca kullanıcının açıkça yetkilendirdiği dosyaları kullanmalıdır.

## Derleme ve doğrulama

Aşağıdaki derleme komutları kaynak depoda çalıştırılır; eklenti ZIP'i yalnızca kurulum gereken dosyaları içerir:

```sh
npm ci
npm run build
npm run test:plugin
npm run dist:mac:installer
npm run plugin:pack
```

DMG / uygulama Electron Builder tarafından üretilir; eklenti ZIP `release/CevikEdit-plugin-0.5.0.zip` çıktısına yazar. ZIP portable `plugin.json` / `mcp.json`, Codex uyumlulu manifestı, skill, Python başlatıcı ve kurulum betiğini içerir. Düzenleyici ve kendi kendine tutulan MCP App UI DMG ile dağıtılır; bu yüzden eklenti paketi artık video motorunu kopyalamaz.

Geliştirme protokol doğrulaması izole veri dizinleri kullanır. Paket doğrulaması `CEVIKEDIT_TEST_APP=/absolute/path/CevikEdit.app/Contents/MacOS/CevikEdit npm run test:plugin` ile gerçek program belirleyerek yapılabilir.

Protokol dayanağı: [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins) ve [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps). iPhone-use'in manifest, tam ekran kaynak ve gerçek zamanlı kare köprü yapısı referans alınır; CevikEdit'in düzenleme, giriş ve paketleme uygulaması bu projenin kendi kodudur.

## Yerel etkileşim doğrulaması ekranı

Aşağıdaki görüntü bağımsız yerel MCP Apps doğrulama konakında üretilir; gerçek CevikEdit düzenleyicisi ve eklenti arayüzünü gösterir; Codex konakından geçen bir ekran görüntüsü değildir.

![Yerel MCP App arayüz doğrulaması](screenshots/codex-plugin-local-host.jpg)
