import { translateText } from "../translate";

type PatternReplacement = string | ((match: RegExpMatchArray) => string);

/**
 * Pattern translations for strings that are assembled at runtime with
 * interpolated values (counts, names, durations, ...). Each entry runs against
 * the trimmed rendered text after the exact-match dictionary misses.
 * Order matters: more specific patterns come first. Captured groups that may
 * themselves hold UI text are passed through `translateText` again.
 */
export const trPatterns: Array<[RegExp, PatternReplacement]> = [
  // Multi-line timeline tooltips.
  // Multi-line timeline tooltips: "<name>\n<start> · <duration> 秒[\n轨道已锁定]".
  [
    /^([\s\S]+?)\n([^\n]+) · ([\d.,]+) 秒\n轨道已锁定$/,
    m => `${translateText(m[1])}\n${m[2]} · ${m[3]} sn\nKanal kilitli`,
  ],
  [
    /^([\s\S]+?)\n([^\n]+) · ([\d.,]+) 秒$/,
    m => `${translateText(m[1])}\n${m[2]} · ${m[3]} sn`,
  ],
  [/^([\s\S]+)\n轨道已锁定$/, m => `${translateText(m[1])}\nKanal kilitli`],

  // Composed clip descriptions.
  [/^(.+)s · (.+)s · 字号 (.+) · (.+) · 位置 \((.+)\)$/, m =>
    `${m[1]}s · ${m[2]}s · yazı boyutu ${m[3]} · ${m[4]} · konum (${m[5]})`],
  [/^(.+) · 轨道“(.+)”$/, m => `${m[1]} · kanal "${m[2]}"`],
  [/^· 轨道“(.+)”$/, m => `· kanal "${m[1]}"`],
  [/^画面淡入 (.+) · 淡出 (.+) · 声音淡入 (.+) · 淡出 (.+)$/, "Görüntü girişi $1 · çıkış $2 · ses girişi $3 · çıkış $4"],
  [/^已添加 (.+) 秒叠化（后片段提前重叠）$/, "$1 sn çapraz geçiş eklendi (sonraki klip öne bindirildi)"],
  [/^已添加 (.+) 秒转场，可撤销$/, "$1 sn geçiş eklendi, geri alınabilir"],
  [/^(.+)% · 静音$/, "$1% · sessiz"],
  [/^(.+)% · 取消静音$/, "$1% · sesi açık"],
  [/^([\d.]+:[\d.]+) · (.+)$/, m => `${m[1]} · ${translateText(m[2])}`],
  [/^(缩放|旋转|透明度) (.+)$/, m => `${translateText(m[1])} ${m[2]}`],

  // Counts.
  [/^已选择 (\d+) 个片段$/, "$1 klip seçildi"],
  [/^移动 (\d+) 个片段 · (.+)$/, "$1 klip taşındı · $2"],
  [/^已修改 (\d+) 条字幕，可一次撤销$/, "$1 altyazı değiştirildi, tek adımda geri alınabilir"],
  [/^已合并 (\d+) 条字幕，可一次撤销$/, "$1 altyazı birleştirildi, tek adımda geri alınabilir"],
  [/^播放头 (.+) · 已选 (\d+) 条$/, "Oynatma konumu $1 · $2 seçili"],
  [/^当前字幕 (.+) — (.+)$/, "Geçerli altyazı $1 — $2"],
  [/^不支持的字幕样式字段“(.+)”$/, m => `Desteklenmeyen altyazı stili alanı: "${m[1]}"`],
  [/^(.+)须在 (.+)～(.+) 之间$/, m => `${translateText(m[1])} ${m[2]}–${m[3]} arasında olmalıdır`],
  [/^将修改 (\d+) 条字幕，可一次撤销。$/, "$1 altyazı değiştirilecek, tek adımda geri alınabilir."],
  [/^应用 (\d+) 条修改$/, "$1 değişikliği uygula"],
  [/^应用 (\d+) 项修改$/, "$1 değişikliği uygula"],
  [/^已生成 (\d+) 条自动字幕$/, "$1 otomatik altyazı oluşturuldu"],
  [/^自动字幕超过 (\d+) 条，请分段转写$/, "Otomatik altyazı $1 kaydı aşıyor; lütfen parçalara ayırın"],
  [/^已导入 (\d+) 个素材$/, "$1 medya içe aktarıldı"],
  [/^已导入 (\d+) 条字幕$/, "$1 altyazı içe aktarıldı"],
  [/^(\d+) 个片段$/, "$1 klip"],
  [/^(\d+) 项$/, "$1 öğe"],
  [/^(\d+) 条$/, "$1 kayıt"],
  [/^(\d+) 层$/, "$1 katman"],
  [/^(\d+) 款原创 · 离线可用$/, "$1 özgün · çevrimdışı kullanılabilir"],

  // Status / error prefixes.
  [/^正在倒放… (\d+)%$/, "Ters oynatılıyor… %$1"],
  [/^倒放片段过长：当前分辨率下最多 ([\d.]+) 秒，请先分割片段。$/, "Klip ters oynatma için çok uzun: bu çözünürlükte en fazla $1 saniye. Önce klibi bölün."],
  [/^倒放失败：([\s\S]+)$/, m => `Ters oynatma başarısız: ${translateText(m[1])}`],
  [/^生成定格画面失败：([\s\S]+)$/, m => `Donmuş kare oluşturulamadı: ${translateText(m[1])}`],
  [/^FFmpeg 倒放失败：([\s\S]+)$/, m => `FFmpeg ters oynatma hatası: ${m[1]}`],
  [/^(.+) · 倒放$/, m => `${translateText(m[1])} · ters`],
  [/^(.+) · 定格画面$/, m => `${translateText(m[1])} · donmuş kare`],
  [/^无法启动 (Whisper|FFmpeg)：(.+)$/, "$1 başlatılamadı: $2"],
  [/^(Whisper|FFmpeg) 执行失败：(.+)$/, "$1 çalıştırılamadı: $2"],
  [/^无法读取 (.+)$/, "$1 okunamıyor"],
  [/^启动项目无法打开：(.+)$/, "Başlangıç projesi açılamıyor: $1"],
  [/^自动保存失败：(.+)$/, "Otomatik kaydetme başarısız: $1"],
  [/^对话保存失败：(.+)$/, "Konuşma kaydedilemedi: $1"],
  [/^建议未通过检查，项目未修改：(.+)$/, "Öneri denetimi geçemedi, proje değiştirilmedi: $1"],
  [/^已检测到 (.+)$/, "$1 algılandı"],
  [/^预览与导出使用相同参数$/, "Önizleme ve dışa aktarma aynı parametreleri kullanır"],
  [/^预览(.+)$/, m => `${translateText(m[1])} önizle`],
  [/^(.+)无效（最多 20000 字）$/, m => `${translateText(m[1])} geçersiz (en fazla 20000 karakter)`],
  [/^(.+)必须是有限数值$/, m => `${translateText(m[1])} sonlu bir sayı olmalıdır`],
  [/^片段“(.+)”没有可用的音频$/, m => `"${m[1]}" klibinde kullanılabilir ses yok`],
  [/^请至少选择一条(.+)片段$/, m => `En az bir ${translateText(m[1])} klibi seçin`],
  [/^每次最多处理 (\d+) 条(.+)片段$/, m => `Her işlemde en fazla ${m[1]} ${translateText(m[2])} klibi işlenebilir`],
  [/^(.+)片段不能重复$/, m => `${translateText(m[1])} klipleri yinelenemez`],
  [/^(.+)片段无效$/, m => `${translateText(m[1])} klibi geçersiz`],
  [/^无法解析响度测量结果（(.+)）$/, m => `Ses düzeyi ölçüm sonucu çözümlenemedi (${m[1]})`],
  [/^项目 (.+) 无效$/, m => `Proje geçersiz: ${translateText(m[1])}`],

  // CapCut import notes.
  [/^帧率 (.+) 不受支持，已改为 30 fps。$/, "Kare hızı $1 desteklenmiyor; 30 fps olarak değiştirildi."],
  [/^素材类型 (.+) 不受支持，相关片段已跳过。$/, "Medya türü $1 desteklenmiyor; ilgili klipler atlandı."],
  [/^素材 (.+) 没有本地路径，相关片段已跳过。$/, "$1 medyasının yerel yolu yok; ilgili klipler atlandı."],
  [/^轨道类型 (.+) 不受支持，已跳过。$/, "Kanal türü $1 desteklenmiyor; atlandı."],
  [/^片段引用的素材 (.+) 不存在，已跳过。$/, "Klibin başvurduğu $1 medyası yok; atlandı."],
  [/^片段速度 (.+) 超出 0\.1–8 倍范围，已跳过。$/, "Klip hızı $1, 0,1–8 kat aralığının dışında; atlandı."],
  [/^草稿没有有效画布尺寸，已由首个可导入视觉片段推断为 (\d+) × (\d+)；请核对画布比例。$/, "Taslakta geçerli tuval boyutu yok; ilk içe aktarılabilir görsel klipten $1 × $2 olarak tahmin edildi. Tuval oranını kontrol edin."],
  [/^未转换的附加设置：(.+)。请核对相关效果。$/, "Dönüştürülmeyen ek ayarlar: $1. İlgili efektleri kontrol edin."],

  // Library / preset actions.
  [/^添加(.+)模板$/, m => `${translateText(m[1])} şablonunu ekle`],
  [/^应用(.+)特效$/, m => `${translateText(m[1])} efektini uygula`],
  [/^应用(.+)转场$/, m => `${translateText(m[1])} geçişini uygula`],
  [/^应用(.+)调色$/, m => `${translateText(m[1])} renk ayarını uygula`],
  [/^停止 (.+)$/, m => `Durdur: ${translateText(m[1])}`],
  [/^试听 (.+)$/, m => `Önizle: ${translateText(m[1])}`],
  [/^添加 (.+) 到时间线$/, m => `${translateText(m[1])} medyasını zaman çizelgesine ekle`],
  [/^添加 (.+) 关键帧$/, m => `${translateText(m[1])} anahtar karesi ekle`],
  [/^添加 (.+)$/, m => `${translateText(m[1])} ekle`],

  // Media item descriptions.
  [/^(.+)，音频，文件丢失$/, "$1, ses, dosya eksik"],
  [/^(.+)，图片，文件丢失$/, "$1, görsel, dosya eksik"],
  [/^(.+)，视频，文件丢失$/, "$1, video, dosya eksik"],
  [/^(.+)，音频$/, "$1, ses"],
  [/^(.+)，图片$/, "$1, görsel"],
  [/^(.+)，视频$/, "$1, video"],
  [/^(视频|画面|图片|音频|文字) (\d+)$/, m => `${translateText(m[1])} ${m[2]}`],
  [/^(.+) × (.+) · 图片$/, "$1 × $2 · görsel"],
  [/^(.+)[，,]\s*([\d.,]+) 秒$/, m => `${translateText(m[1])}, ${m[2]} sn`],
  [/^(.+) 操作$/, m => `${translateText(m[1])} işlemleri`],
  [/^(.+) 入点$/, m => `${translateText(m[1])} giriş noktası`],
  [/^(.+) 出点$/, m => `${translateText(m[1])} çıkış noktası`],
  [/^裁剪入点 · (.+)$/, "Giriş noktası kırpılıyor · $1"],
  [/^裁剪出点 · (.+)$/, "Çıkış noktası kırpılıyor · $1"],
  [/^删除「(.+)」？$/, "\"$1\" kanalı silinsin mi?"],
  [/^(.+) · 双击重命名$/, m => `${translateText(m[1])} · yeniden adlandırmak için çift tıklayın`],
  [/^(.+) · 轨道已锁定$/, m => `${translateText(m[1])} · kanal kilitli`],

  // Track row controls.
  [/^解锁(.+)$/, m => `${translateText(m[1].trim())} kanalının kilidini aç`],
  [/^锁定(.+)$/, m => `${translateText(m[1].trim())} kanalını kilitle`],
  [/^显示(.+)$/, m => `${translateText(m[1].trim())} kanalını göster`],
  [/^隐藏(.+)$/, m => `${translateText(m[1].trim())} kanalını gizle`],
  [/^取消静音(.+)$/, m => `${translateText(m[1].trim())} kanalının sesini aç`],
  [/^静音(.+)$/, m => `${translateText(m[1].trim())} kanalını sessize al`],
  [/^(.+)轨道操作菜单$/, m => `${translateText(m[1])} kanal işlemleri menüsü`],
  [/^(.+)轨道操作$/, m => `${translateText(m[1])} kanal işlemleri`],

  // Durations.
  [/^([\d.,]+) 秒$/, "$1 sn"],

  // Native dialogs.
  [
    /^未找到 (.+) CLI。请先安装并在终端登录，或选择 CLI 可执行文件$/,
    m => `${m[1]} CLI bulunamadı. Önce kurup terminalden giriş yapın veya CLI çalıştırılabilir dosyasını seçin.`,
  ],
  [/^选择 (.+) CLI$/, "$1 CLI seç"],
  [/^选择 (.+) 可执行文件$/, "$1 çalıştırılabilir dosyasını seç"],
  [/^重新链接 (.+)$/, "$1 yeniden bağla"],
  [/^(.+) 可执行文件$/, "$1 çalıştırılabilir dosyası"],

  // Assistant / inspector composed labels.
  [/^分离音频失败：([\s\S]+)$/, m => `Ses ayırma başarısız: ${translateText(m[1])}`],
  [/^(.+) 超出支持范围$/, m => `${translateText(m[1])} desteklenen aralığın dışında`],
  [/^(.+) 无效$/, m => `${translateText(m[1])} geçersiz`],
  [/^“(.+)”所在轨道已锁定$/, "\"$1\" klibinin kanalı kilitli"],
  [/^轨道“(.+)”已锁定，请先解锁$/, "\"$1\" kanalı kilitli, önce kilidini açın"],
  [/^名称“(.+)”$/, "Ad \"$1\""],
  [/^画布 (\d+)×(\d+)$/, "Tuval $1×$2"],
  [/^背景 (.+)$/, "Arka plan $1"],
  [/^起点 ([\d.,]+)s$/, "Başlangıç $1s"],
  [/^终点 ([\d.,]+)s$/, "Bitiş $1s"],
  [/^(.+)滑块$/, m => `${translateText(m[1])} kaydırıcısı`],
  [/^关键帧 (.+) 值$/, m => `Anahtar kare ${translateText(m[1])} değeri`],
  [/^(.+)关键帧曲线$/, m => `${translateText(m[1])} anahtar kare eğrisi`],
  [/^当前 (.+)$/, m => `Şu an ${m[1]}`],
  [/^选择字幕：(.+)$/, "Altyazı seç: $1"],
  [/^素材 (.+)$/, m => `Medya: ${translateText(m[1])}`],
  [/^轨道 (.+)$/, m => `Kanal: ${translateText(m[1])}`],
  [/^(.+) 偏移$/, m => `${translateText(m[1])} kaydırma`],
  [/^(.+) 原始时长$/, m => `${translateText(m[1])} özgün süre`],
  [/^(.+) 淡入$/, m => `${translateText(m[1])} yumuşak giriş`],
  [/^(.+) 淡出$/, m => `${translateText(m[1])} yumuşak çıkış`],
];
