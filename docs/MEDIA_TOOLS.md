# Yerleşik medya araçları

macOS v0.2.1 paketi yerleşik FFmpeg ve FFprobe içerir; Homebrew, sistem FFmpeg ya da Jianying gerekmez. `Contents/Resources/media-tools/` altındadırlar, bağımsız alt süreçler olarak çalışırlar. Ayarlar'da seçilen özel araç ya da `CEVIKEDIT_FFMPEG` / `CEVIKEDIT_FFPROBE` ortam değişkenleri önceliklidir; kapama yoksa yerleşik araç kullanılır. Yerleşik dosya eksikse açıkça hata verir, geliştirme makinesini gizlice kullanmaz.

## Kaynak ve lisans

Sabit FFmpeg 9.0.2 ve x264 `b35605ace3ddf7c1a5d67a2eb553f034aef41d55` resmi kaynak; üst kaynak değiştirilmez. `--enable-gpl --enable-libx264` ile derlenir, bu yüzden medya araçları GPL-2.0-or-later'tır; ilgili kaynak, orijinal lisans, build betiği ve liste her paketle birlikte sunulur. CevikEdit'in kendi kodu MIT lisanslıdır. [Üçüncü taraf beyanları](../THIRD_PARTY_NOTICES.md) ve [FFmpeg üst lisans açıklaması](https://ffmpeg.org/legal.html) bakın.

Build `nonfree` etmedi. Üçüncü taraf kod çözücüler statik bağlı; çalışma bağımlılığı yalnızca macOS sistem kütüphanesi/çerçevesi. Ağ protokolleri yerleşik build'te kapalı; uygulamanın orijinal yerel dosya protokol limiti korunur. Mevcut H.264/AAC dışa aktarma ve test edilmiş yerel medya işlemi desteklenir; x265 enkodu dahil değil, HEVC decode ve H.264 proxy gerçek doğrulandı.

## Yeniden build

Makineye native macOS host, Xcode komut satırı araçları ve gerekli Node.js kurundan sonra:

```sh
npm ci
npm run media:build
npm run dist:mac:installer
```

İlk indirme ve sabit kaynak doğrulaması, izole pkgconf, x264 ve FFmpeg build. pkgconf yalnızca build aracı, aynı zamanda kaynağını sunar. İndirme önbelleği ve ara dosyalar ignore'li `.media-build/`; son medya kaynakları ignore'li `media-tools/darwin-<arch>/`. Paket hook'ı aynı doğrulama/build akışını otomatik çalıştırır, eksik kaynak olmaz; çapraz mimari desteklenmez. Şu an yalnızca arm64 kabul edildi; x64 build'i NASM ister, henüz doğrulanmadı.

Tüm üst kaynak arşivleri, indir URL'si, SHA-256, derleme parametreleri ve lisans yolları paket içi `manifest.json` / `sources/` / `licenses/` içinde. Depo masumlaştırılmış [build listesi](media-tools-build.json) ile kalır. Listenin `buildSHA256` imzadan önceki parmak izi; uygulama imzası çalıştırılabilir dosya baytlarını değiştirebilir; son imza sonrası parmak iz ayrı kaydedilir [doğrulama özeti](validation-summary.json).

Kaynak geliştirme makinede sistemde kurulu araçları kullanmaya devam edebilir; Windows/Linux paketlerinde bu platform medya araçları henüz dahil değil. Makine macOS'undaki doğrulamayı bu platformlarda dışa aktarma hakkında söyleme.
