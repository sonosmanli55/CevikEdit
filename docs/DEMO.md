# Orijinal demo projesi

Proje dizininde `npx tsx scripts/generate-demo.ts` çalıştırın, sonra CevikEdit'de «Aç" seçerek `.demo/demo.cevikedit` açın. Ya da doğrudan `.demo/demo.mp4` oynatın. Makine FFmpeg/FFprobe ve kurulu npm bağımlılıklarını gerektirir.

Örnek 1280×720, 30 fps, dokuz saniyelik tam yerel proje: üç orijinal manzara parçası, sürekli sentetik akorde, Çinli başlık, altyazı, etiket, konum ve ölçek kritik kareleri, renk, görsel ve ses fade-in/fade-out içerir. Malzeme yolları üretim zamanındaki makineye işaret eder; makine değişirse yeniden üretim komutu çalıştırın.

Tüm görseller `@napi-rs/canvas` tarafından çizilen gradyan, sırt, yansıma ve dalga; ses matematiksel sinüs sinyali sentezidir, dış kaynak malzama indirmez, Jianying kodu/malzama/online hizmet kullanmaz. Sabit manzara rastgele tohumu `0x524541`; proje UUID ve zaman damgaları her üretimde güncellenir. Üretici ve üretilen malzama MIT lisanslıdır.

Çinli metinler proje içi Noto Sans SC açık yazı tipiyle (SIL OFL); orijinal yazı tipi lisansı ve kayna kaydı `public/fonts/` içinde. Tarayıcı ve dışa aktarma bu yazı tipini kullanır, dışa aktarmada değişken font ağırlığı 400/700 açıkça ayarlanır.

Betik aynı zamanda gerçek dışa aktarma motorunu kullanarak MP4 üretir, FFprobe ile boyut, ses akışı ve dokuz saniyelik süre doğrulur, üç anlık `preview-1.png`, `preview-2.png`, `preview-3.png` kaydeder. `.demo/` yerel üretim dizini, Git'e dahil değildir.

Makinede bir kez 1280×720 / 30 fps / yüksek kalite dışa aktarma **4.46 s** (dokuz saniyelik zaman çizelgesi, 13 parça, karıştırma, üç renk grubu, ölçek/konum kritik kareleri, başlık ve altyazı) doğrulandı; üç video parçasının tamamı doyasızlık 3'e değiştirildi, dışa aktarma **7.70 s** oldu. Bu makine üzerinde tek gözlem, çapraz platform performans garantisi değildir. Statik maske ön rende Alpha PNG; normal doyasızlık 8 bit native matris, yüksek doyasızlık 16 bit matris ve LUT ile kullanılır, renk piksellerinde ayrıştırma ifadesi yok.
