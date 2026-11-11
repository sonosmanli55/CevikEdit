# 本机验证记录

## 收尾：贝塞尔、惯性/小地图、VAD、4K 限流、HDR 与草稿交换（2026-11-11）

上一轮列出的六项缺口按“可验证、可解释”的方式逐项落地，每项都有单元测试和真实桌面/FFmpeg 证据。

### 自由贝塞尔缓动

钥匙帧可选 `bezier: {x1,y1,x2,y2}`，存在时优先于具名预设。`src/core/bezier.ts` 用 Newton 迭代求 `x(t)=ratio`，失败时退化为二分；Y 允许 −1～2 以表达“先回拉再冲过”。动画页新增“Özel Bézier”选项、可拖动的两个控制点、四个数值输入和四个预设（Yumuşak/Hızlı/Geri çek/Doğrusal）。预览按公式求值，导出把同一条曲线离散为 24 段折线写进 FFmpeg 表达式；`validateProject` 拒绝越界句柄和 `x1 > x2`。

- `tests/bezier.test.ts` 7 项：端点与单调性、线性近似、真实过冲、非法句柄拒绝、缓动优先级、工程校验、导出表达式与预览在 0–100 数值范围内的最大误差 < 1（不到 1%）。
- `tests/model.test.ts` 41 项保持通过；`tests/keyframe-electron.ts` 曲线、拖动、复制、精确输入与 90 帧预览/导出比对全部通过。

### 时间线惯性滚动与迷你地图

`src/core/timelineMotion.ts` 提供帧率无关的指数衰减滑行（0.92/帧、6 px/s 停止、6000 px/s 上限）、指针速度估计、迷你地图归一化几何与点击居中。中键/Alt 拖动后会继续滑行并在边缘停止；时间线底部新增 22 px 迷你地图，显示全部片段条、可视窗口与播放头，点击跳转，工具栏“Harita”可开关。

- `tests/timelineMotion.test.ts` 7 项：减速、帧率无关、上限/异常 delta、速度估计、几何、空时间线与点击居中。
- `tests/timeline-view-electron.ts` 12 项（新增 2 项）：快速甩动后 `scrollLeft` 继续增加、迷你地图点击跳转与开关；原有缩放锚定、钳制、适配等检查全部保持。

### 离线 VAD 驱动的自动压低

`src/core/vad.ts` 用 20 ms 窗口能量、10% 分位噪声底、+8 dB 相对阈值与 ±2 dB 迟滞判定语音，合并小于 0.35 s 的停顿、丢弃小于 0.25 s 的爆音，并按 `sourceIn`/`speed` 映射回时间线。主进程 `analyze-speech` 将片段区间解码为 16 kHz 单声道 f32 后复用同一检测器。音频面板新增“Konuşma aralıklarını algıla”和“Yalnızca gerçek konuşma”；`prepareDucking` 接受可选 `ranges`，只在这些区间内压低，未提供时保持原来的整段行为。

- `tests/vad.test.ts` 12 项：三段爆发、桥接短停顿、忽略点击、恒定噪声不误判、阈值随噪声底变化、异常参数、分帧、时间线映射、仅按检测区间压低、区间裁剪、非法区间拒绝、旧行为不变。
- `tests/vad.integration.test.ts` 3 项真实 FFmpeg：合成三段语音状爆发全部在 150 ms 内定位、静音段不误报、导出的音乐包络在 1.5 s 与 6.5 s 压低而在 2.6 s 恢复。
- `tests/audio-tools-electron.ts` 8 项：常量音调被正确判为“未找到语音”而不是盲目压低，原有测量/归一化/压低/重开检查保持通过。

### 4K 与大工程限流

`src/core/limits.ts` 给出软阈值（300 片段、2000 关键帧、300 文本、40 轨道、1 小时）、导出内存估算与土耳其语提示。时间线在片段数超过 240 时只渲染可视切片（两侧各留 25% 余量），小工程仍渲染全部以保证选中与无障碍语义。导出对话框显示帧数、峰值内存估算与提示，超出内存预算时阻止开始。

- `tests/limits.test.ts` 6 项：指标、正常工程无告警、4K 说明、各阈值告警、内存估算与拒绝、可视裁剪（含跨窗口长片段）、2000 片段时纯计算耗时。
- `tests/limits-electron.ts` 5 项真实桌面：401 片段 4K 工程 978 ms 打开且仅绘制 14 个、滚到末端能画出远端片段、缩放 260 ms、导出预览显示 `90.120 kare · 443 MB tepe bellek tahmini · 401 klip` 与两条提示、保存后 401 片段完整。

### HDR 与色彩管理

`src/core/colorManagement.ts` 依据 FFprobe 的 `color_transfer`/`color_primaries`/位深判定 SDR、PQ、HLG（bt2020 且 ≥10 bit 视为 PQ），导入时写入素材元数据并在媒体库显示 HDR/HLG 徽标。导出对 HDR 图层先 `zscale`→线性→`tonemap=hable`→BT.709，再进入几何/合成；输出显式标记 `bt709` 三件套。对话框说明“HDR 源会映射到 SDR”。

- `tests/colorManagement.test.ts` 4 项：分类、滤镜链（HLG 先展开）、输出标记、徽标与警告文案。
- `tests/hdr.integration.test.ts` 4 项真实 FFmpeg：带 PQ/bt2020 标签的源被识别为 HDR、导出后不再是 smpte2084/bt2020、SDR 源行为不变、再次打开工程保留元数据。
- `tests/export.integration.test.ts` 24 项与 `tests/app-electron.ts` 15 项保持通过（BT.709 标记未破坏既有像素断言）。

### 草稿交换导出（不做剪映写回）

`src/core/draftExchange.ts` 输出**开放的纯文本**草稿文档：`materials.videos/audios/texts`、`tracks[].segments`（微秒 `target_timerange`/`source_timerange`、speed、volume），并附带完整工程作为无损侧信道。文件菜单“Taslak değişim dosyasını dışa aktar (JSON)”写入用户选择的位置，提示明确说明**这不是剪映加密草稿、剪映无法直接打开**。

**刻意不实现剪映加密草稿写回**：该格式为第三方专有，载荷密钥属于其应用，向其存储写入属于超出本项目授权范围的操作（AGENTS.md 的保守边界）。本项以“可往返的开放交换格式”交付，而非修改第三方文件。

- `tests/draftExchange.test.ts` 5 项：文档结构、经现有明文导入器往返后时间/速度/文本一致、侧信道不改源工程、校验与拒绝、自定义名称。
- `tests/draft-electron.ts` 3 项真实桌面：菜单导出并落盘、导出文件重新导入得到 2 个片段且界面无中文残留、源 `.cevikedit` 未被修改。

### 综合结果

- 整套 `npm test`：**458 项，452 通过、6 跳过、0 失败**（49 个文件）。
- `npm run typecheck`、`npm run build` 通过；`npx tsx scripts/i18n-audit.ts` 0 未翻译。审计脚本新增独立的字面量正则扫描，修复了此前依赖括号状态机而漏报的问题。
- Windows 打包候选升级为 **0.6.1**：`release/CevikEdit Setup 0.6.1.exe` 已构建；`tests/package-win-electron.ts` 直接启动打包后的 `CevikEdit.exe`，确认版本号、八个资源页仅土耳其语、模板建工程、保存与 1920×1080 H.264 导出，5 项通过。
- 桌面回归：`app-electron` 15、`keyframe-electron` 7、`templates-electron` 7、`timeline-view-electron` 12、`limits-electron` 5、`audio-tools-electron` 8、`subtitle-electron` 15、`draft-electron` 3，均无 renderer 错误。

限制：贝塞尔在导出侧是 24 段折线近似（预览为精确解），极端句柄下误差仍小于动画量程 1%；4K 预览通过画布缩放而非独立代理渲染，超长 4K 时间线滚动仍受 Chromium 合成限制；VAD 面向 20 ms 能量的近场人声，音乐/强噪声场景需要人工调整或改用区间选择；HDR 统一映射到 SDR BT.709，不输出 HDR 成片，也不做峰值亮度元数据；草稿交换格式是 CevikEdit 自有格式，不保证任何第三方编辑器可读。全部验证仍只在 Windows 10 x64 与 FFmpeg 8.0 上完成，macOS/Linux 未实机复核。

## 模板与 0.6.0 候选包（2026-11-08）

### 可复用模板

新增 `src/core/templates.ts`（纯模型）与 `electron/templates.ts`（存储）、`TemplatesLibrary` 面板与“模板”资源页。**保存为模板**会把当前工程的画布、轨道、样式、动画和时间原样保留，但把每个被使用的素材替换为 `template://media/<slot>` 哨兵并登记为“媒体占位”；未被任何片段引用的素材直接丢弃，缩略图、预览地址、缓存字段全部清除。**从模板新建**会重新生成工程、轨道、片段和关键帧 ID，媒体从源 0 开始并按可用长度裁短（同时裁剪关键帧与淡化），文本占位按用户输入替换。缺失的可选占位只移除相关片段并在界面上给出警告，必需占位缺失则明确拒绝。模板可以导出为 `.cevikedit-template` 文件再导入；导入时先解析和校验，任何指向本机路径、越界 `template://` 路径、类型不符的占位、重复键、超过 100 个媒体/200 个文本占位、非图片封面都会被拒绝。

随包提供三套自主生成的示例模板（`src/core/builtinTemplates.ts`）：**Açılış kartı**（1920×1080，6 秒）、**Dikey sosyal video**（1080×1920，8 秒）、**Altyazı bloğu**（1920×1080，12 秒，三条顺序字幕）。三者各自带有封面、媒体占位、默认内置素材与文本占位，并复用本周的淡入淡出、x/y 关键帧与文字动画数据。

- `tests/templates.test.ts` 11 项：内置模板校验/摘要、从模板实例化并保留时长、可选占位跳过并警告、必需占位与错误媒体类型拒绝、媒体短于片段时按帧裁短并裁剪关键帧、工程转模板不泄漏本机路径且不修改源工程、JSON 往返、被篡改的路径/封面/占位清单拒绝、100 个上限与重复键、两次实例化不共用 ID、摘要字段。
- `npx tsx tests/templates-electron.ts` 7 项真实桌面检查：模板页列出三套土耳其语内置模板；保存当前工程后写入一个不含本机路径的 `.cevikedit-template`；重开编辑器后库仍在；选中用户模板、替换媒体与文本后生成新工程（3 个片段）；导出模板文件；删除后文件消失、再导入恢复；把导出文件里的素材路径改成 `C:\gizli\video.mp4` 后再导入会被拒绝并显示土耳其语错误。renderer 无错误。

### 30 秒端到端演示

`scripts/generate-showcase.ts` 用同一套核心模型拼出 30 秒 1280×720 影片：三幕合成风景（渐变、太阳、四层山脊、颗粒线）各带缓慢推近的 `easeInOut` 缩放、标题与淡入淡出；五条土耳其语字幕经 `prepareSubtitleEdit` 统一应用“上滑 + 呼吸 + 淡出”，其中一条先按播放头拆分再合并，验证拆分/合并规则；音轨由合成“人声”和“音乐”组成，先对音乐做真实 `loudnorm` 测量（本机测得 −29.1 LUFS / −18.5 dBTP），按 −20 LUFS 归一化，再用 `prepareDucking` 在 30 秒人声全程把音乐压低 11 dB、过渡 0.5 秒；开头标题复用内置“Açılış kartı”模板实例化后的样式与动画。最后用真实导出管线渲染，并把这个工程本身再存成模板，验证往返。

结果：`showcase.mp4` 1280×720、恰好 30.0 秒、H.264 + AAC；导出的音轨不是静音（首 2 秒 PCM RMS > 0.005）；工程里 6 个文本片段与 5 个媒体占位全部通过 `validateProject`；同名模板中的素材全部为占位路径。产物已复制到 `docs/media/hafta-demosu.mp4`（2.3 MB）、`hafta-demosu.cevikedit`、`hafta-demosu.cevikedit-template` 与三张预览帧，来源说明见 `docs/media/KAYNAK.txt`。

- `tests/showcase.test.ts` 1 项（约 32 秒）：完整生成、导出、探针校验分辨率/时长/音视频流、PCM 能量、文本与关键帧数量、模板占位路径与产物大小。

### Windows 0.6.0 候选包

`package.json`/`package-lock.json` 升到 **0.6.0**，`npm run dist` 生成 `release/CevikEdit Setup 0.6.0.exe`（129 MB，NSIS，x64）与 `release/win-unpacked`。新增 `tests/package-win-electron.ts` 直接驱动打包后的 `CevikEdit.exe`（隔离用户目录、默认土耳其语、无 `CEVIKEDIT_LOCALE` 覆盖）：确认 `getSystemInfo()` 返回 0.6.0 / win32、八个资源页无任何中日韩字符、用内置模板与随包素材创建工程（3 个片段）、保存为 `.cevikedit`、通过原生对话框导出，并用 FFprobe 核对 1920×1080 H.264、6.0 秒。renderer 无错误。

限制（**必须如实说明**）：本轮只在 Windows 10 x64 上构建和启动候选包。本机没有 macOS 环境，`dist:mac`/DMG 未构建、未签名、未运行；因此不能声称 macOS 候选包已完成或“真实机器已验证”。macOS 侧仍沿用 2026-10-13 的 v0.5.0 包记录，与本周功能不一致。

## 跨平台回归与主进程本地化修复（2026-11-07）

此前整套测试长期保留 15 项失败，均被当作“环境问题”记录。本次逐项定位后发现其中 4 项是测试自身只适用于 macOS，**1 项是真实产品缺陷**：

- **CLI 脚本无法在 Windows 启动（真实缺陷）**：`assistantBackend` 直接 `spawn` 用户选择的可执行文件。macOS 上带 `#!` 的脚本由内核执行；Windows 没有 shebang 支持，因此 `spawn` 返回 `ENOENT`。新增 `assistantLaunch`：在 Windows 读取文件头，若为 `#!` 则解析解释器（`/usr/bin/env node`、指向 node 的路径都映射到当前 Node 运行时），以 `spawn(interpreter, [script, ...args])` 启动，仍然 `shell: false`，不引入 shell 注入面。`--version` 探测与实际会话使用同一启动描述。无法解析解释器时明确拒绝并提示选择原生 `.exe`。
- `tests/mediaTools.test.ts` 以 `platform: "darwin"` 在 Windows 上运行，导致 PATH 被 `:` 拆分而丢失盘符；改为使用当前平台与 `.exe` 后缀，断言真实行为。
- `tests/portableProject.test.ts` 用 `JSON.stringify(project).toContain(绝对路径)` 断言，Windows 反斜杠被 JSON 转义；改为比较解析后的 `assets[0].path`。符号链接逃逸用例在 Windows 需要开发者模式，改为目录 junction（无需提权）验证同一 `realpath` 边界。
- `tests/assistantBackend.test.ts` 比较 `path.dirname(cwd)` 与 `realpath(folder)`，但 `os.tmpdir()` 在 Windows 返回 8.3 短路径；两侧都取 `realpath` 后再比较。

结果：`npm test` **398 项，392 通过、6 跳过、0 失败**（首次全绿）。此前记录的 `assistantBackend` 12、`portableProject` 2、`mediaTools` 1 全部消失，且没有任何测试被跳过或断言被削弱。

主进程本地化：桌面版默认土耳其语后，渲染层字典只覆盖 `src/`，主进程 `electron/*.ts` 的 181 条中文错误仍可能经 IPC 显示为中文。本次新增 150 余条词条与约 40 个运行时模式，覆盖助手校验、CapCut 导入、导出校验、文件桥接、可搬移项目、媒体工具与转写错误；`tests/mainLocale.test.ts` 会扫描 `electron/` 中所有中文字面量，只允许 4 个内部模板（提示词包装、派生素材名、进度计数）例外。助手提示词本身也改为土耳其语，模型现在被要求用土耳其语回答。可搬移包内的 `KULLANIM.txt` 与 `<ad>-medya-paketi-<id>` 文件夹名改为土耳其语，项目入口文件统一为 `proje.cevikedit`。

- `tests/mainLocale.test.ts` 3 项：扫描主进程词条、验证组合错误（片段/素材/FFmpeg/CLI/CapCut）均可翻译为无中文的土耳其语、确认助手提示词为土耳其语且保留 JSON 契约。
- `npx tsx tests/assistant-assets-electron.ts` 13 项通过：内置素材导入、Codex/Claude 合成 CLI 协议、参数篡改拦截、真实子进程取消、导出带音频与中文标题成片。
- `npx tsx tests/portable-range-electron.ts` 6 项、`audio-tools-electron` 7 项、`placement-electron` 5 项、`linked-electron` 5 项、`timeline-view-electron` 10 项、`subtitle-electron` 15 项全部通过。
- `npx tsx scripts/i18n-audit.ts` 0 未翻译；`npm run typecheck`、`npm run build` 通过。

限制：主进程错误依赖“渲染时翻译”，即 DOM 文本节点与 `title`/`aria-label` 属性；若未来新增原生对话框文案，必须继续用 `tr()` 包裹，否则会绕过该机制。Windows 上仍不支持 `.cmd`/`.bat`/`.ps1` 包装器（安全考虑，必须选择原生 `.exe`）；无法识别的 shebang 解释器会被拒绝。全部验证仍只在 Windows 开发机的 FFmpeg 8.0 上完成，未在 macOS/Linux 实机或打包安装包复核。

## 时间线缩放与自由平移（2026-11-06）

时间线视图改成独立的纯计算模块 `src/core/timelineView.ts`，工具栏、滚轮和平移都走同一组函数，缩放范围为 **2–1600 px/s**（此前上限 400）。新增交互：

- **Ctrl/⌘ + 滚轮**：以光标所在时间为锚点缩放，光标下的帧保持不动；滚轮步长为 1.15 且互为倒数，放大一格再缩小一格回到原比例。
- **Shift + 滚轮 / 触控板横向手势**：按像素自由左右平移，不改变比例。
- **中键拖动**（以及空白天区的 Alt + 左键拖动）：同时平移横向与纵向，拖动时显示抓手光标；在有片段、标尺或轨道头上不加拦截，避免与拖动片段/定位冲突。
- **适配 / 播放头**：适配按当前可视宽度和工程末尾计算比例并回到起点；播放头按钮把播放头居中。
- 工具栏额外显示当前**可见时长**（`00:00:09 可见`），滑块范围随新的上下限扩大到 2–1600，到达边界时对应按钮禁用。

缩放和平移只写入视图状态，不进入工程或撤销栈；`setZoom` 用同一 `clampPps` 限制范围。

- `tests/timelineView.test.ts` 8 项：比例上限/非数值回退、滚轮互逆与边界、光标锚定公式（含光标位于轨道头时不动）、可见区间（含窗口窄于轨道头、比例为 0）、适配比例与异常时长回退、平移边界、播放头跟随仅在离开舒适区时滚动。
- `tests/timeline-view-electron.ts` 10 项真实桌面检查：默认 60 与可见时长可见；工具栏放大/缩小可逆（75→60）；在距左 240 px 处 Ctrl+滚轮放大后光标下时间漂移 < 0.35 秒；Shift+滚轮向右平移；中键拖动后 `scrollLeft` 增加；滑块到 1600/2 时对应按钮禁用；适配后滚动归零且比例低于默认；播放头按钮可用；可见时长读示为 `02:05:09 görünür`；保存后的片段 id/起点/时长/入点与工程完全一致；重开后历史为空。renderer 无错误。
- `tests/app-electron.ts`（15 项）、`tests/track-electron.ts`（8 项，含纵向滚动后播放头手柄保持可见）保持通过，说明新平移层未破坏拖动、选中与轨道操作。
- 整套 `npm test` 共 395 项：374 通过、6 跳过、15 失败，失败仍全部是既有环境问题（`assistantBackend` 12、`portableProject` 2、`mediaTools` 1），本次未修改这些模块。

限制：浏览器 QA 脚本 `tests/timeline-browser.ts` 需要本机 Playwright Chromium；该机器未安装浏览器二进制，按离线范围不自动下载，因此本次未运行该脚本，改用真实 Electron 桌面用例覆盖同一交互。触控板双指缩放依赖操作系统的 Ctrl+滚轮映射；未实现惯性滑动、滚动条内嵌小地图或按关键帧密度自适应缩放。

## 界面语言（2026-11-06）
桌面版默认使用土耳其语，不再依赖安装包判断：`resolveLocale` 在开发和打包环境都返回 `tr`，主进程菜单、IPC 错误与渲染层默认文案统一走同一语言包；`CEVIKEDIT_LOCALE=zh` 仅保留给以简体中文为断言的既有回归脚本。`tests/locale.test.ts` 4 项覆盖默认语言、中文回退开关、新增音频/字幕文案与运行时拼接消息；`npx tsx scripts/i18n-audit.ts` 报告 0 条未翻译字面量与 0 条 JSX 文本。真实桌面音频流程还会逐个切换 Medya / Ses / Metin / Çıkartma / Efekt / Geçiş / Altyazı，断言页面正文不含任何中日韩字符。

## 时间线插入/覆盖与音视频关联（2026-11-06）

源素材预览新增明确的入轨方式：**追加到末尾** 沿用轨道末尾；**插入并后移** 在播放头处切开跨点片段、把同轨起点不早于播放头的片段整体右移；**覆盖当前位置** 先按占用区间的两端切分，再裁掉被覆盖部分（完全被覆盖的片段直接移除）。三种方式都由 `src/core/placement.ts` 的 `placeClip` 在完整工程上计算并一次提交，锁轨、非法模式、超出时间线范围都会拒绝。覆盖和插入只影响目标轨道，其他轨道、文字片段与未相交片段保持原样。

音频分离现在写入共享的 `linkId`：源视频与分离音轨一起移动、裁剪、分割、删除、复制粘贴和重复；重复/粘贴会重新映射关联 ID，避免新旧片段互相牵连。`linkId` 作为可选片段字段参与 `validateProject` 校验，旧工程没有该字段仍然有效。右侧“Ses”页出现“关联片段”说明和“解除关联”按钮；解除后两侧独立编辑，撤销可恢复关联。

- `tests/placement.test.ts` 8 项：追加不移动既有片段、插入切开跨点片段并后移、间隙处插入不切分、覆盖裁掉左侧、整段覆盖并保留其他轨道、锁轨/非法模式/超出范围拒绝、经 store 的插入与覆盖各为一次撤销、ID 唯一且工程校验通过。
- `tests/linkedClips.test.ts` 5 项：共享 linkId 与静音、同步移动、同步裁剪/分割/删除、解除关联后独立移动并可两步撤销、分离音轨保留音量与音量关键帧。
- `tests/placement-electron.ts` 5 项真实桌面检查：在 4 秒片段内部 2 秒处插入 2 秒选段，保存结果为 `[0,2][2,2][4,2][8,3]`，右段 `sourceIn=2`；一次撤销恢复 `[first 0/4][second 6/3]`；1 秒处覆盖 3 秒把首段裁成 `[0,1]` 并保留 6 秒片段；追加落到 9 秒；重新打开为 4 个片段且历史为空。
- `tests/linked-electron.ts` 5 项真实桌面检查：分离音频后两条片段共享 linkId 且源视频静音；`Alt+→` 微移一帧时音频同步移动；一次撤销同时复原；解除关联后视频移动而音频不动；重开后无 linkId 且历史为空。
- 两项桌面检查均无 renderer 错误。

限制：插入/覆盖只处理目标片段所在的单条轨道，不实现跨轨联动或“所有轨道一起插入”；覆盖对小于一帧的残留采用裁剪而不是保留。关联只覆盖“分离音频”产生的视频/音频对，手动放置的片段不会自动关联；解除关联后无法重新建立。

## 音频响度与自动压低音乐（2026-10-24）

“Ses”页新增 `AudioTools` 面板。选中一个带声音的片段后可调用主进程 `analyze-loudness`：读取已授权素材的绝对路径，用 FFmpeg `loudnorm=I=-16:TP=-1.5:LRA=11` 分析片段对应的源区间，只解析 stderr 中的 EBU R128 汇总（integrated LUFS、true peak dBTP、LRA），不落盘、不上传。为拿到该汇总，工具执行路径拆出 `runMediaToolWithDiagnostics`，正常调用仍返回 stdout。

归一化按 `目标 LUFS − 测量响度` 计算增益，再用 `−1 dBTP − 测量真峰值` 收紧，限制在 −30～+30 dB；结果乘到片段音量与所有现有音量关键帧，超过 400% 时整体拒绝而不做静默截断。静音素材（`-inf`）会明确报错。压低音乐时，用户把片段显式加入“语音”和“音乐”两个列表，`prepareDucking` 合并相距小于两倍过渡时长的语音区间，按帧吸附写入音量关键帧：0 秒固定原音量（关键帧求值以首帧为起点），语音开始前一个过渡时长回落，语音区间保持压低值，结束后回升。所有修改沿用与字幕相同的“计划绑定 JSON 快照 + 应用时校验”模式，一次撤销/重做恢复整步。

- `tests/audioMix.test.ts` 10 项：loudnorm JSON 解析（含 `-inf`、缺字段、坏数值）、增益与峰值钳制、音量与关键帧缩放且不动其他属性、锁轨/无音频/超 400%/过时计划拒绝、0 秒基准帧与语音区间包络、相近区间合并且包络裁剪到音乐范围、视频带声作为语音且替换旧音量键、重叠/锁轨/重复/无重叠/参数范围拒绝、store 一次撤销。
- `tests/export.integration.test.ts` 新增 2 项真实 FFmpeg 检查：对 2 秒 600 Hz 音乐测得的响度有限且为负值，按 −23 LUFS 归一化后增益小于 1、关键帧同比例，导出后仍有声音；把 440 Hz 语音放在 1–2.5 秒、音乐 0–4 秒，−12 dB／0.2 秒过渡后导出，语音段 600 Hz 能量低于语音前和语音后的 1/2.5，同时 440 Hz 仍可测。
- `npx tsx tests/audio-tools-electron.ts` 7 项真实桌面检查：土耳其语面板可见、七个资源页无中文、真实测量显示 `-21.6 LUFS · -18.1 dBTP`、归一化写入音量并一次撤销、压低只改音乐关键帧（时间点 0/0.8/1/2.5/2.7，压低值 10^(-12/20)）、撤销/重做各一步、保存重开后包络仍在且历史为空；renderer 无错误。
- `npm run typecheck`、`npm run build` 通过；`npx tsx scripts/i18n-audit.ts` 为 0 未翻译。
- 整套 `npm test` 共 387 项：366 通过、6 跳过、15 失败。失败均为既有环境问题：`assistantBackend` 12 项（带空格临时目录下 CLI fixture 无法 spawn/发现并连带协议用例）、`portableProject` 2 项（Windows 路径序列化与符号链接 `EPERM`）、`mediaTools` 1 项（PATH 驱动器前缀断言）。本日新增模块与导出/桌面用例全部通过，未修改这些失败模块；整套结果不能视为全绿。

限制：响度是片段级离线测量，不是实时电平表，也不支持多轨总线/导出后整体响度；测量与归一化之间若有外部改动会按快照拒绝。压低只依据片段区间，不分析音频内容里真正的语音停顿，同一片段不能同时作为语音和音乐；过渡时长 0 时仍保留一帧斜坡以避免爆音。自动压低会替换音乐片段已有的全部音量关键帧，需要更细的手工包络时应在压低后继续在关键帧面板调整。全部验证在 Windows 开发机、合成音频与 FFmpeg 8.0 上完成，未在 macOS/Linux 实机或打包安装包复核。

## 可视化关键帧曲线与缓动（2026-10-22）

“动画”页新增独立实现的 `KeyframeEditor`：SVG 曲线和全片段关键帧列表可切换属性，点击曲线定位播放头，拖动圆点按项目帧率吸附时间并按属性范围限制数值；选中后可精确输入时间/数值、跳转、删除、复制并粘贴到播放头。拖动使用 store transaction，一次撤销恢复整个拖动。预设在原有 `linear`、`easeInOut` 上增加 `easeIn`、`easeOut`，四者共享 `keyframeEasingWindow`、`keyframeEasingCoefficients` 和 `keyframeEasedRatio`；预览、曲线采样、裁剪/分割和 FFmpeg 导出使用同一窗口化公式。裁剪和分割会把窗口重映射到剩余区间，保留曲线形状。

导出侧使用同一组系数生成 FFmpeg 表达式。新增回归覆盖动态缩放与透明度同时启用：先在稳定输入尺寸上应用 alpha，再执行逐帧缩放，避免 `alphamerge` 在帧尺寸变化时报告 `Invalid argument`；该组合此前会失败，现已能完成 90 帧导出。

- `tests/model.test.ts` 通过 41 项：包含缓入/缓出边界、重复时间戳、精确截断窗口，以及分割/裁剪后逐点数值一致的曲线连续性。
- `tests/export.integration.test.ts` 通过 21 项真实 FFmpeg/FFprobe 测试：新增缓入/缓出曲线截断后的实际帧比较，以及动态缩放 + 透明度组合的输出像素与 alpha 平面稳定性；原有动画、调色、淡化、音量与导出取消用例保持通过。
- `npx tsx tests/keyframe-electron.ts` 通过：用 160×90 合成图片建立缩放 1→2、位置 X 0→40、透明度 1→0.2 三组动画，在界面中完成曲线属性切换、拖动圆点并一次撤销、复制/粘贴/删除、精确时间输入和三种缓动设置；保存后重新打开，6 个关键帧的 ID、时间、数值、缓动与曲线窗口保持一致。随后顺序采集 0–89 帧预览，并对导出的 90 帧逐帧比较；32×18 采样平均绝对差最大约 6.42、平均约 1.18（阈值 18）。播放头第 3、30、57 帧对应时间码 `00:00:00:03`、`00:00:01:00`、`00:00:01:27`，与导出帧的平均差分别约 6.42、1.65、0.50，最佳匹配均在对应帧或相邻一帧内。结束帧蓝色通道低于 120，确认透明度动画生效；页面无 renderer error。
- `npm run typecheck`、`npm run build` 通过；`npx tsx scripts/i18n-audit.ts` 报告 0 条未翻译字面量与 0 条 JSX 文本。
- 最新整套 `npx vitest run` 共 347 项：326 通过、6 跳过、15 失败。失败仍集中在既有环境用例：`assistantBackend` 12 项（带空格的临时目录中 CLI fixture 无法 spawn/发现，后续协议用例被连带）、`portableProject` 2 项（Windows 路径序列化断言与符号链接创建 `EPERM`）、`mediaTools` 1 项（PATH 驱动器前缀/大小写断言）；本次关键帧模型、导出和新增桌面用例全部通过，未修改这些失败模块。整套结果不能视为全绿。

限制：当前是线性/缓入/缓出/缓入缓出四种预设，尚无自由贝塞尔控制手柄或曲线预设库。复制/粘贴缓冲保留在当前动画面板实例内；若选择清空导致面板卸载（例如撤销）会清空，未实现跨项目剪贴板。预览/导出比较使用采样网格和容差，H.264 有损编码与画布合成使结果不是逐像素完全相同；测试只在本机 Windows FFmpeg 8.0、合成图片和 160×90 / 30 fps 项目上执行，未在 macOS / Linux 实机或打包安装包复核。若同一属性在精确输入中产生重复时间戳，求值会保留排序后的最后一个同时间关键帧，界面暂不自动合并。

## 字幕拆分、合并、批量样式与文字动画（2026-10-23）
字幕面板新增“拆分 / 合并”“文字动画”页签，并扩展现有“统一样式”：可直接编辑字体、字号、文字/描边/背景颜色、描边宽度、行高、内边距、圆角、粗体、背景和对齐，也可从参考字幕复制后再覆盖单项字段。所有操作仍先由 `prepareSubtitleEdit` 在克隆并校验的工程上生成计划，计划绑定创建时的 JSON 快照；`applySubtitleEdit` 拒绝已变化的工程，避免覆盖随后编辑。编辑只接受 `TextStyle` 的可编辑子集，文案、时间、位置和动画保持不变。

- 拆分：按项目帧率吸附播放头，左段为 `[开始, 播放头)`，右段为 `[播放头, 结束)`，两侧至少一帧；文本按字符比例在附近标点、换行或空白处优先切开，否则退回到比例字符位置。`splitClip` 同时切分时间、源区间、关键帧与淡化窗口，局部动画继续有效。
- 合并：只接受同轨连续且相接或重叠的字幕；时间从最早开始到最晚结束，文本以换行拼接，样式、变换与局部动画沿用最早一条。合并后移除旧的裁剪淡化窗口，避免整条字幕只显示一部分；旋转/音量关键帧保留。
- 动画：入场 `none|fade|slideUp|scale`、停留 `none|pulse`、出场 `none|fade|slideDown|scale`，入/出场时长按帧吸附并限制在每条字幕一半以内。实现直接生成现有 `fadeIn`/`fadeOut` 与 x/y/缩放/透明度关键帧，预览与 FFmpeg 导出沿用同一 `evaluateFade` / `evaluateKeyframes` 路径；替换这些属性时清除旧的 x/y/缩放/透明度关键帧并保留旋转、音量关键帧。
- 导出限制：SRT/WebVTT 只保存时间与文本，不携带样式、画面位置或动画。字幕面板常驻提示，导出成功后的提示也明确说明；需要动画成片时导出视频。

验证结果：

- `tests/subtitleEdits.test.ts` 通过 38 项：原有偏移/替换/逐条编辑/锁轨/过时计划/参考样式用例，加上拆分边界与标点切分、合并间隙/非连续/重叠规则、拆分合并各一次撤销、直接样式字段校验与内容/变换/时间保留、参考样式与覆盖组合、入场/停留/出场在 `evaluateFade`/`evaluateKeyframes` 中的数值、旧视觉关键帧替换与旋转保留、短字幕时长上限和无效设置不修改源工程。
- `tests/export.integration.test.ts` 新增真实 FFmpeg 用例通过：对同一条 2 秒字幕应用“上滑 + 呼吸 + 淡出（0.5 秒）”，以 20 fps 导出后采样，停留段亮像素数超过 300，且至少是入场帧和出场帧各自的两倍，说明导出侧也执行了同一条动画。该文件整套 22 项在带 FFmpeg 8.0 的环境中通过。
- `npx tsx tests/subtitle-electron.ts` 通过 15 项真实桌面检查，renderer 错误为空：中英文合成 SRT（含长句与重叠时间）导入后不混入既有标题；字面替换与一次撤销；批次偏移按帧对齐；逐条文本/时间保存；锁轨与过时表单保护；参考样式；按播放头拆分（4.0–5.5 秒拆为 4.0–4.5 与 4.5–5.5，文本为“逐条”/“修订字幕”）并一次撤销；相接字幕合并（7.033–13.033 秒，文本换行拼接）并一次撤销；直接样式仅改所选条目；动画写入淡入淡出与 y/缩放关键帧；播放器在入场、停留、出场三个时间点的亮像素比较；动画应用/撤销/重做各一步；SRT 导出仅含文本且提示不含样式、位置或动画；保存后的工程重新打开仍保留 3 条字幕与 4 个时间线片段，历史为空。
- `npx tsx scripts/i18n-audit.ts` 报告 0 条未翻译字面量与 0 条 JSX 文本；新增字幕/动画/样式字段均在土耳其语语言包中。
- `npm run typecheck`、`npm run build` 通过。
- 整套 `npm test`（带本机 FFmpeg 8.0 的 PATH）共 358 项：337 通过、6 跳过、15 失败。失败仍全部是既有环境用例：`assistantBackend` 12 项（带空格临时目录中的 CLI fixture 无法 spawn/发现并连带协议用例）、`portableProject` 2 项（Windows 路径序列化与符号链接 `EPERM`）、`mediaTools` 1 项（PATH 驱动器前缀/大小写断言）。本次字幕模型、导出和桌面用例均通过，未修改这些失败模块；整套结果不能视为全绿。若运行时 PATH 中没有 FFmpeg，媒体/导出测试会先报“找不到 ffmpeg”，这是环境缺失而非本次功能回归。

限制：合并按整条字幕的轨道顺序判断连续性，不跨越未选中的中间字幕，也不处理不同文字轨之间的合并；拆分文本只按字符比例和附近标点近似，不实现逐字时间码（卡拉 OK）或词级对齐。动画是固定预设，不能逐条混搭不同曲线，也没有独立于文字模板的自定义贝塞尔；`pulse` 在过短的字幕上会被跳过。字幕文件格式本身不能保存样式与动画，导出 SRT 后重新导入会丢失这些效果；预览与导出的可见面积比较依赖亮像素采样与 H.264 有损编码，不是逐像素一致。全部验证在 Windows 开发机、合成字幕和 FFmpeg 8.0 上完成，未在 macOS/Linux 实机或打包安装包复核。

## 视频倒放与定格画面（2026-10-21）

新增独立实现的视频倒放与定格画面。倒放取选中视频片段的精确源区间（`sourceIn` 到 `sourceIn + duration × speed`），由本机 FFmpeg 生成独立缓存 MP4；视频使用 `reverse,setpts=PTS-STARTPTS`，存在音频时同时使用 `areverse,asetpts=PTS-STARTPTS`，因此原声随画面一起反向。完成后只替换片段的素材引用并把 `sourceIn` 归零，保留时间线起点、时长、速度、关键帧和淡化包络；原素材仍在项目、媒体库和磁盘中。缓存位于用户数据目录的 `reverse-media`，按源路径、大小、修改时间、入点和时长哈希复用。主进程校验授权素材、请求范围和数值，FFmpeg 使用参数数组启动；进度来自 `-progress pipe:1`，取消会终止子进程并删除临时文件。

定格画面从当前播放头换算到源视频时间，由 FFmpeg 提取单帧 PNG 到 `freeze-frames` 内容寻址缓存。新片段放在文字轨之后、普通视频轨之前的独立视频轨，避免改变原时间线；继承当前求值后的变换、调色、裁剪、抠像和蒙版，清除关键帧与淡化，持续时长可在画面属性中修改。定格图片没有自身音轨，底层视频声音继续播放。

- `tests/clipTools.test.ts` 通过 7 项：倒放素材替换、源区间保护、缓存素材复用、锁轨/非视频/时长不足/缺原声拒绝；定格轨道层级、当前变换与效果继承、关键帧清除、时长与缓存复用、播放头和时长边界。
- `tests/clipMedia.integration.test.ts` 通过 4 项，使用真实 FFmpeg 8.0：3 秒 10 fps 合成视频以 0.5 秒入点、1 秒时长倒放，输出帧顺序与源帧反向对应，时长约 1 秒且保留音频；源文件内容不变并可重新导入；0.75 秒定格 PNG 对应正确的源帧并可导入为图片素材；运行中的 720p 倒放可取消，子进程结束后不留下目标文件。
- `npx tsx tests/clip-tools-electron.ts` 桌面流程通过：导入逐帧变色视频，界面倒放后播放器画布解码出该倒放区间内的帧（允许一个帧边界误差），随后保存、撤销/重做、播放头 1 秒处生成 1 秒定格、保存重开并导出。导出为 90 帧；0.5 秒与 2.5 秒分别对应倒放后的尾帧和头帧，1.25/1.5/1.75 秒保持同一冻结帧，2.25 秒恢复播放；原视频 SHA-256 未变化，页面无错误。
- `npm run typecheck`、`npm run build` 通过；`npx tsx scripts/i18n-audit.ts` 报告 0 条未翻译字面量与 0 条 JSX 文本。

限制：FFmpeg `reverse` 需要把选中区间解码帧留在内存，本项目按 3 GiB 估算上限，1080p30 约 34 秒、4K30 约 13 秒，超出时提示先分割；没有实现分块磁盘缓存。倒放缓存不会自动清理，删除仍被项目引用的缓存会导致重开缺素材。当前仅在 Windows 开发机用系统 FFmpeg 8.0 验证，未在 macOS / Linux 实机复核，也未重新打包安装包。定格是图片叠加而非切分并推动后续片段，因此底层声音和后续画面时间不变；如需要静音，请单独处理底层片段。

## 本地 Whisper 自动字幕（2026-10-20）

新增独立实现的本地自动字幕：在字幕面板选择时间线音视频片段，经本机 FFmpeg 提取 16 kHz 单声道 WAV，调用本地 whisper.cpp CLI 与 GGML 模型，解析 JSON（`transcription[]`、`segments[]` 或裸数组）或 SRT，清理非语音标记、拆分过长句，并按片段起点、变速和项目帧率写入新的「字幕」文字轨。写入复用现有 `addSubtitles`，一次撤销；不调用云端，不自动下载程序或模型。

- `tests/transcription.test.ts` 通过 11 项：三种 JSON 形状、毫秒偏移与时间戳字符串、SRT 回退、噪声标记清理、长句拆分、变速换算、片段范围与时间线起点、帧对齐、重叠处理、重复句子合并和 2000 条上限。
- `tests/transcriptionTools.test.ts` 通过 7 项：保存选择、环境变量、内置目录与 PATH 的优先级；模型发现、非法路径和缺失工具；并回归确认 PATH 中的通用 `whisper`（OpenAI Python CLI）不会被自动采用。
- `tests/transcriptionRunner.test.ts` 新增 2 项 Unix 合成进程测试，覆盖成功输出与取消/清理；本机 Windows 跳过，未在 Unix 实机执行。
- `npx tsc --noEmit` 与 `npm run build` 通过。`npx tsx scripts/i18n-audit.ts` 报告 0 条未翻译字面量与 0 条 JSX 文本。
- 最新整套 `npx vitest run` 共 343 项：322 通过、6 跳过、15 失败。失败集中在 3 个本机既有环境用例文件：`assistantBackend` 12 项（带空格的临时目录中 CLI fixture 无法 spawn/发现，后续协议用例被连带）、`portableProject` 2 项（Windows 路径序列化断言与符号链接创建 `EPERM`）、`mediaTools` 1 项（PATH 驱动器前缀/大小写断言）；本次倒放/定格相关测试全部通过，未修改这些模块。整套结果不能视为全绿。
- Windows 合成端到端检查：用临时编译的假 `whisper-cli.exe` 和假 `ffmpeg.exe` 启动 Electron，导入一个 12 秒音频项目，从字幕面板点击「生成字幕」；观察到提示「1 otomatik altyazı oluşturuldu」、新增「Altyazı」文字轨和 1.8 秒的「Merhaba dünya」文字片段（30 fps 下显示 00:00:01:24），无界面错误。该检查验证了 UI → preload → 主进程校验 → 结果解析 → 时间线写入，但假 FFmpeg 没有生成 WAV、假 Whisper 没有读取音频，不能证明真实提取或识别质量。
- 土耳其语界面检查：分别截取缺少 Whisper 的引导状态和选中假可执行文件/模型的就绪状态；就绪状态下「Altyazı oluştur」按钮可用。检查中发现全局 `.small-button` 覆盖 `.primary` 的背景，已改用独立 `.subtitle-generate` 样式并复查为强调色。

未覆盖：开发机没有 whisper.cpp 可执行文件和 GGML 模型，也没有可用的 FFmpeg，因此未执行真实音频提取、真实 whisper.cpp 转写和识别质量评估；macOS / Linux 未实机验证；未重新打包安装包。合成脚本位于被忽略的 `.test-output/`，不属于仓库测试。

## 标题模板扩充与文字排版（2026-10-20）

文字模板由 16 款扩充到 25 款，新增「下三分之一」与「社媒」分类，并加入行高、内边距、圆角与文字阴影四项样式参数。预览画布与导出 PNG 改为共用 `src/core/textLayout.ts` 的同一套几何计算，阴影预留透明边距以免被图层边缘裁掉。

- 项目验证器接受 `lineHeight` 0.8–3、`padding` 0–1.5、`radius` 0–2、阴影模糊 0–200 与偏移 ±200；25 款模板的参数均在范围内，旧项目缺少这些字段时按 1.3 / 0.25 / 0 回退，几何结果与旧版一致。
- 新增 `tests/text-layout.test.ts`、`tests/text-templates.test.ts` 与 `tests/text-render.test.ts`：覆盖默认几何兼容、多行与对齐、圆角收敛、阴影边距、模板唯一性与分类覆盖、分辨率缩放、关键帧生成，以及使用 `@napi-rs/canvas` 实际绘制带圆角背景与阴影的图层。
- `npx tsc --noEmit` 与生产构建通过；`npx vitest run` 共 312 项，293 项通过、4 项跳过，15 项失败均为本机既有问题（assistantBackend 12、portableProject 2、mediaTools 1），与本次改动无关。`npx tsx scripts/i18n-audit.ts` 报告 0 条未翻译字面量与 0 条 JSX 文本。
- `npm run test:creative` 的桌面流程通过 5 项检查：25 张模板卡与分类数量、悬停动画预览、搜索空状态、数据卡以 `radius` 0.2 / `padding` 0.4 写入项目并一次撤销、含中文标题的 5 秒 MP4 实际导出。
- 另在 Electron 中人工检查「姓名下三分之一」「数据卡」「霓虹标签」的预览与播放器显示，并在文本属性中调整行高与阴影后保存，项目 JSON 记录 `lineHeight` 1.5 与阴影参数。

未覆盖：本次未重新打包安装包，也未单独导出 4K 分辨率画面核对阴影边距；Windows 之外的平台未实机验证。

## v0.5.1 插件重复启动修复（2026-10-19）

用户报告仍有 CevikEdit 短暂弹出。进程证据确认已运行此前 Dock 修复版，但每次 MCP 连接仍无条件创建 Electron 子进程；同一宿主短时间内建立多个连接。此前只在应用 JavaScript 中隐藏 Dock 的修复未覆盖连接前的应用启动阶段。

- Python 启动器改为按需代理：initialize、ping、tools/list、resources/list、resources/templates/list 和固定 UI 资源读取均不执行应用。首次实际 tools/call 才启动一个子进程；异常退出后不自动重启或重放操作。
- macOS 应用声明 `LSUIElement=true`，普通桌面启动显式设置 regular 策略；插件保持 accessory。签名严格校验通过。
- `python3 tests/plugin-launcher.py` 六项回归通过：连续发现和资源读取不启动、首次工具调用只启动一次、EOF 与 SIGTERM 保存退出、失败子进程不重启、损坏资源拒绝、缺少应用时仍可发现工具。
- 实际 0.5.1 打包应用通过新启动器执行完整插件协议、导入、编辑、冲突拒绝、撤销重做、截图与断连保存回归。空 PATH 的桌面启动、Dock 图标显示、字体/预览及 9 秒含中文文字与音频的视频导出通过；renderer errors 为空。生产构建与类型检查通过。
- Dock 生命周期专项通过，包括连续 20 次截图不显示窗口或 Dock。本机插件已更新到 0.5.1，旧版缓存入口同步换为按需启动器，旧实例已请求正常退出并保留恢复数据。

本机应用：`release/v0.5.1-lazy/mac-arm64/CevikEdit.app`。这是本地修复，未替换 GitHub v0.5.0 的已发布附件。Windows / Linux 尚未实机验证。

## v0.5.0 GitHub 预览版安装包（2026-10-13）

发布附件由本机 Apple Silicon 重新构建，包含后台插件 Dock 修复。安装包为 ad-hoc 签名，未 Apple 公证；Windows / Intel Mac / Linux 不在此次二进制发布范围内。

- 类型检查及生产构建通过；此前同一产品代码的核心回归为 293 项通过、1 项缺少 libx265 跳过。
- 实际打包应用在仓库外工作目录、空 `PATH` 和隔离用户目录中启动，通过字体、缩略图、预览、渲染隔离及内置 FFmpeg / FFprobe 核对，导出 1280×720、9 秒、含中文字幕与混音的视频，renderer errors 为空。
- 实际打包应用通过插件协议、素材导入、原子编辑、版本冲突、撤销重做、截图、断连保存与退出测试。应用中的主进程、preload 和插件 HTML 与本次构建逐字节一致。
- `codesign --verify --deep --strict`、`hdiutil verify` 与插件 ZIP 完整性检查通过。包内含媒体工具对应源码、构建脚本和许可证；未包含私人项目或研究原始目录。
- GitHub 首轮 CI 的 Linux 核心任务通过，macOS / Windows 核心任务及云端打包任务存在失败，尚未解决；本地安装包验收不能代替 CI 全绿。详见 [首次运行](https://github.com/Xiangyu-CAS/rea-capcut/actions/runs/38387098585)。

附件与 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `CevikEdit-0.5.0-arm64.dmg` | `ee23ae803a064d34e79ba68282959188fc7ff9b48649fee21b1aa0c0a8344849` |
| `CevikEdit-0.5.0-arm64-mac.zip` | `2586d1e187a9af0780ee8dc7a69a8a958b793fb6a0fc9926596db64de1f1c9ff` |
| `CevikEdit-plugin-0.5.0.zip` | `05abdeb012d46a44c3a2df5a0a3a59421634248b826673ea83ae2af77b324e8a` |

本机证据：`.test-output/package-electron/evidence.json`、`.test-output/plugin-electron/evidence.json`。

## macOS 插件 Dock 修复（2026-10-13）

后台插件改用 accessory 激活策略；显示桌面窗口时切回 regular，关闭窗口后隐藏 Dock 图标并保留编辑器。`tests/plugin-dock-electron.ts` 在隔离目录内验证上述三种状态及连续 20 次画面刷新均不显示窗口或 Dock 图标；类型检查与生产构建通过。修复应用位于 `release/plugin-dock-fix/mac-arm64/CevikEdit.app`，打包后的插件协议、素材导入、编辑、撤销重做、截图及断连保存回归通过，严格签名检查通过。本机插件配置已指向修复应用。后续确认旧连接仍在使用原应用，核对空项目无未保存修改后正常退出；需重连插件加载修复应用，尚未取得修复版在 Codex 宿主内的最终确认。下文此前生成的 DMG 不含这次修复。

## v0.5.0 Codex 插件（2026-10-13）

新增 portable / Codex 兼容插件包、本地 stdio MCP 服务，以及 fullscreen MCP App 画面与输入桥接。插件在本机 Codex 中注册安装成功；后续通过插件工具打开侧栏，用户确认看到编辑器，并报告旧进程的 Dock 干扰问题。侧栏打开已获用户确认，完整宿主剪辑流程及 Dock 修复后的宿主表现仍待验收。以下是本地协议、真实编辑器与标准 MCP Apps 验证宿主的结果，不将它们等同于完整 Codex 宿主验收。

- 类型检查与生产构建通过。现有 24 个测试文件 **293 项通过、1 项缺少 libx265 跳过**。
- 实际 v0.5.0 macOS arm64 安装包在空 `PATH`、隔离用户目录下通过插件协议测试：initialize、9 个工具、fullscreen resource、app-only 帧权限、项目读取、原创素材导入、时间线插入、版本冲突、非法操作整批回滚、撤销/重做、无效路径和输入拒绝、真实画面与导出窗口。
- 断开 stdio 后核对最新项目已写入 autosave.cevikedit，编辑器正常退出。实际安装缓存中的 Python 启动器通过 MCP 通信；同时启动两个连接，恢复目录不同；EOF 与 SIGTERM 均刷新恢复数据并退出。
- 用 MCP Apps SDK 的独立本地验证宿主，通过 Computer Use 操作真实插件 UI，验证中文输入、全选替换、缩放坐标、片段拖动、快捷键撤销、系统保存对话框和真实导出。输出 H.264、640×360、5 秒 MP4，FFprobe 核对通过。发现并修复隐藏窗口的全选行为、CSS 缩放后的输入坐标以及离屏窗口无法切回桌面的问题。
- 改用可显示的隐藏窗口后，再次核对 MCP 截图与原生桌面界面；原有 renderer 隔离、CSP 和媒体授权保持启用。关闭插件的桌面窗口会收回到后台，不销毁侧栏编辑会话。
- Skill 校验、Python / shell 语法检查和 Git diff 空白检查通过。新增 MCP Apps SDK 及其实际打包依赖的原始许可声明；许可收集 122 条、无未解决项。
- 最终应用 `codesign --verify --deep --strict` 通过，DMG 的 `hdiutil verify` 为 VALID。仍为本地 ad-hoc 签名，未 Apple 公证。Windows / Linux 未实机验收。

安装包：`release/codex-plugin-final/CevikEdit-0.5.0-arm64.dmg`，SHA-256：`d54b16d6c6eb6221a133d3af8d3106156fd61b966bf9250c821e57d1605fde0f`。插件包：`release/CevikEdit-plugin-0.5.0.zip`。

本机证据：`.test-output/plugin-electron/evidence.json`、`.test-output/plugin-launcher.json`、`.test-output/plugin-harness/plugin-ui-export.mp4`、`.test-output/plugin-regression.log`。界面截图见 [插件说明](CODEX_PLUGIN.md#本地交互验收截图)。

## v0.4.2 文字 / 特效 / 转场库（2026-10-13）

提供 16 款可编辑文字模板、8 款关键帧动效和 8 款转场，保留并改善原有 8 款调色预设的缩略图。所有配方为自主代码，预览图来自内置原创素材；详情见 [CREATIVE_LIBRARY.md](CREATIVE_LIBRARY.md)。

- 最终类型检查与生产构建通过；使用内置 FFmpeg / FFprobe 执行全部单元与集成测试，24 个文件 **293 项通过、1 项因缺少 libx265 编码器跳过**。
- 配方专项 23 项通过：响应式可编辑文字、锁轨新建文字轨、原子撤销、关键帧保留、转场时长对齐及短片段/间隙/后续冲突保护。平滑曲线在转场边界后的数值与原始曲线一致。
- 实际执行全部 8 款转场和 8 款动效的 FFmpeg 导出图，检查转场前后和中间像素、滑入方向、叠化亮度、经过背景、缩放区域及动效帧变化。发现并修复动态缩放回到输入尺寸时 FFmpeg 9 的过滤错误，通过显式 planar / packed RGB 转换保持颜色与 alpha。
- 现有桌面叠化回归通过：中点预览 RGB `[127,0,128]`，导出 `[127,0,127]`，混音 RMS 约 0.06354；保留已有淡化包络的验证。
- 最终 macOS arm64 打包应用在空 `PATH`、隔离用户目录下运行 `tests/creative-library-electron.ts`，5 组完整流程检查通过。覆盖卡片数量、动态预览、文字分类/搜索、添加/撤销、调色/动效应用、转场时长/撤销和真实视频导出。输出 640×360、5 秒 MP4，包含中文动态文字、背景、呼吸缩放和缩放转场；白色文字像素 1,472，renderer errors 为空。
- 卡片布局随素材面板宽度自动调整列数。实际界面截图在本节所链接的素材文档中，均使用本项目生成的背景，没有用户视频。
- `codesign --verify --deep --strict` 通过，`hdiutil verify` 结果 VALID。仍为本地 ad-hoc 签名，未公证；Windows / Linux 未实机验收。

安装包：`release/creative-library/CevikEdit-0.4.2-arm64.dmg`；SHA-256：`6e8861664176d5838f077cb9e453449bea90c10784248184b51ec6d3eea005e8`。

原始本机证据：`.test-output/creative-final-tests.log`、`.test-output/creative-library-electron/evidence.json`、`.test-output/transition-electron/evidence.json`。安装包验证不代表全部第三方媒体组合均已覆盖。

## v0.4.1 离线素材扩充（2026-10-13）

素材从 34 款扩至 64 款：28 个贴纸、14 张背景、12 个标题底板、10 个合成音效。原有 34 个媒体文件的 SHA-256 与扩充前一致。生成代码、SVG 源、音频合成公式、许可与文件清单一同保留；新增素材预览见 [素材说明](ORIGINAL_ASSETS.md)。

- `npm run assets` 生成 64 款素材及两张预览表；`vitest run tests/builtinAssets.test.ts` 的 4 项测试通过，覆盖全部素材的尺寸、透明度、文件指纹、SVG 外部引用约束，以及 WAV 格式、时长、RMS、峰值与首尾淡化。
- `tsx tests/builtin-assets-browser.ts` 的 7 项检查通过：64 张素材卡、图片加载、添加回调、分类、旅行关键词匹配定位与新相机、星点音效试听及分类切换；renderer errors 为空。
- `npm run build` 含 TypeScript 检查与生产构建通过。macOS arm64 新打包应用在空 `PATH`、隔离用户目录下运行 `tests/assistant-assets-electron.ts`，13 项检查通过。验证新相机 / 姓名牌的本机导入与撤销，极光背景 / 星点音效保存，透明图层预览，以及内置 FFmpeg 实际导出 640×360、5 秒有声视频。首秒音频 RMS 约 0.08951，首帧背景、贴纸与文字像素检查通过；renderer errors、failedMedia 均为空。助手环节使用合成 CLI，不调用真实账号。
- 包内 64 个媒体文件全部匹配 manifest 指纹。`codesign --verify --deep --strict` 通过，DMG 经 `hdiutil verify` 为 VALID；签名仍为本地 ad-hoc，未公证。Windows / Linux 未新增实机验证。

安装包：`release/assets-expanded/CevikEdit-0.4.1-arm64.dmg`。SHA-256：`8a4dfd26a1ebbb159d3d9d1e4612f430a85ef9527420963841a063df02a12434`。原始本机记录位于被忽略的 `.test-output/builtin-assets/`、`.test-output/assistant-assets-electron/`、`.test-output/assets-expansion/`。

## 提交准备复核（2026-10-13）

使用内置 FFmpeg / FFprobe 重新运行 `npm run check`：类型检查、生产构建通过，22 个测试文件中 270 项通过、1 项 x265 造样测试跳过。桌面基础工作流重新通过，覆盖导入、播放、剪辑、撤销、文字/字幕、保存重开和实际视频导出，renderer errors 与媒体失败列表均为空。

公开导出截图现在由测试在截图时遮盖输出路径，避免把本机用户名带入文档。此改动只影响测试截图；应用导出路径和导出行为保持原样。原始测试结果保存在被忽略的 `.test-output/commit-prep/` 和 `.test-output/app-electron/`。

## 图标镜像方向更新（2026-10-13）

按用户要求重新绘制左向交叉带矢量图标，生成 PNG、SVG、ICNS 和 ICO。`npm run icons` 与 `npm run build`（含类型检查）通过。实际启动新打包应用，确认标题栏图标加载，包内 PNG / ICNS 与源产物字节一致，renderer errors 为空；应用严格深度签名校验和 DMG 校验通过。本轮为图标变更，未重复完整媒体回归。

新安装包：`release/icon-refresh/CevikEdit-0.4.0-arm64.dmg`；SHA-256：`076053f5a303dba6eace0b13921c0ab49ded74f9ba3e1cbfd64a60b08ba359cd`。下方原 v0.4.0 安装包及验收记录保留。新包仍为 macOS arm64、本地 ad-hoc 签名、未公证。图标专项证据：`.test-output/icon-refresh/verification.json`。

## v0.4.0 界面与工作流安装包验收（2026-10-13）

22 个文件、270 项通过，1 项 x265 造样测试跳过；类型检查和生产构建通过。新功能及差异分析见 [本轮完善记录](IMPROVEMENTS_V040.md)，UI 对照见 [界面一致性](UI_PARITY.md)。

最终 DMG 在只读挂载后复制到全新隔离目录。七套测试均实际启动这份应用，清空应用 PATH、移除媒体工具覆盖并使用独立用户目录，共 **45 项**检查通过，renderer errors 均为空：基础安装包 7、素材/CLI 合成协议 12、字幕编辑 8、素材包/区间 6、源素材预览 4、三栏布局 5、300 句字幕项目 3。CLI 合成协议不代表 Claude 在线登录成功；真实 Codex 的既有闭环证据另见助手记录。

安装包基础套件确认内置 FFmpeg/FFprobe 9.0.2、Noto 和 native canvas，实际导出 1280×720、9 秒中文标题混音。源预览与区间分别导出一秒蓝色源画面（中心 RGB 0/0/255）及可听声音。素材包搬移并让原文件不可用后仍可预览、保存与导出；缺失包内未用素材时仍能保存其他修改。原生菜单与 Escape 不会替换打包弹窗。

三栏拖动/键盘微调、应用重启记忆、双击恢复、1024×720 小窗口和播放器控件边界通过。15 分钟 300 句合成字幕项目通过整批偏移/保存与一次撤销；单次自动化时间为启动 542ms、搜索 46ms、检查/应用/保存 230ms、撤销/保存 150ms，包含自动化开销。

DMG 的 hdiutil 校验为 VALID，ZIP 无错误，复制应用通过严格深度代码签名校验。签名为本地 ad-hoc、未公证。镜像内外 app.asar SHA-256 均为 e3bd166abe6874f815746901a6b1cca7cba8e191e60c0f02778221c44447ecca。

| 产物 | SHA-256 |
| --- | --- |
| CevikEdit-0.4.0-arm64.dmg | ae577f3403d8d938ec689e50922b7dcf1c9dc0d741159ef7f34f308a6420e74c |
| CevikEdit-0.4.0-arm64-mac.zip | c17d23ef3f65151dda8fba167fbe4e5f049b972e6a29c3b63136bf955001e7d9 |

本机证据目录：package-electron、assistant-assets-electron、subtitle-electron、portable-range-electron、source-preview-electron、workspace-electron、large-subtitles-electron，均位于 gitignored .test-output 中。此前八套原有桌面回归也全部通过；播放器在最终布局变更后另行回归。Windows/Linux 和商业剪映完整行为对等不在本轮证明范围。

## v0.3.0 集成安装包验收（2026-10-13）

17 个测试文件通过，209 项通过、1 项依赖额外 x265 造样的测试跳过；类型检查、构建和 Git diff 空白检查通过。27 项助手编辑测试与 18 项 CLI 后端测试覆盖操作验证、原子失败、锁轨、摘要字段/容量、历史、取消、协议与异常；分割内核新增一帧浮点边界回归。

最终 DMG 通过 `hdiutil verify`，只读挂载后复制至隔离目录的 .app 通过 `codesign --verify --deep --strict`。ZIP 完整性检查通过。包内 4,090 个 ASAR 条目未包含研究原始证据、测试或被分析的专有库。签名仍为本地 ad-hoc，未公证。

从 DMG 复制的应用以空 PATH 和独立用户目录启动：原安装包套件完成 1280×720、9 秒、13 片段中文混音导出；新增素材/助手套件 12 项通过，包括 PNG/WAV 导入、透明叠加、一次撤销、两种 CLI 合成协议、提案应用、项目变化后拒绝旧建议、历史恢复、取消与后续请求。新组合经界面导出为 640×360、5 秒视频；真实解码首帧检出背景、贴纸和文字，首秒音频 RMS 为 0.146348。两个套件均无 renderer errors，媒体请求无失败。

CLI 合成进程测试不等于在线服务验证。真实 Codex 另已通过“摘要函数 → 服务回复 → 提案验证/应用”的自造标题闭环；Claude 真调用返回未登录/认证失效，仅协议适配测试通过。用户须自行安装、正常登录 CLI；安装包不含 CLI 或订阅。见 [助手说明](ASSISTANT.md)。

[集成界面截图](screenshots/assistant-assets.png)。私有可复现记录：`.test-output/v030-check.log`、`package-electron/evidence.json`、`assistant-assets-electron/evidence.json`、`assistant-backend/real-codex-generated-context.json`。

| 安装包 | SHA-256 |
| --- | --- |
| CevikEdit-0.3.0-arm64.dmg | `9abe83a5b630e3bc7952dd50f9976d1923e7a7068edb3cd2b675a79c247cb662` |
| CevikEdit-0.3.0-arm64-mac.zip | `c27e36e1251a7095335cce36f2047da6afd29b7e12e4588cd18c621a739ff22a` |


日期：2026-10-13，Asia/Shanghai。本记录只描述 CevikEdit 独立实现的本机证据，不证明与商业剪映完整对等，也不把剪映静态字符串、测试脚本或构建配置当成已执行的功能。

## v0.2.1：内置 FFmpeg 的安装包

2026-10-13，以独立构建的 FFmpeg/FFprobe 9.0.2 执行 `npm run check`：14 个文件、159 项通过、1 项跳过，类型检查及生产构建通过。跳过项需要 libx265 编码器生成 HEVC 测试源；本包不提供 x265 编码。另用自行生成的 HEVC/AAC 文件验证内置工具实际探测、HEVC 解码、H.264 预览代理、蓝色帧像素及保留声音，全部通过。

从最终 DMG 只读挂载并复制应用到带空格的独立目录，清空应用 PATH、移除 FFmpeg/FFprobe 环境覆盖，使用全新用户目录启动。系统信息明确返回 `.app/Contents/Resources/media-tools/` 内的两个工具；真实缩略图/预览及 1280×720、9 秒、中文标题与混音的 UI 导出通过，renderer errors 为空。导出后的探测也使用包内 FFprobe。包内草稿导入另通过 16 项检查。

镜像、ZIP、应用深度严格签名及两个媒体工具签名均通过；源包与 DMG 复制应用的 ASAR 指纹一致。媒体工具只依赖 `/usr/lib/` 和 `/System/Library/`，没有 Homebrew 动态库依赖。三份源码归档与构建脚本逐一核对 SHA-256，GPL 许可及对应源码随应用资源提供。签名仍为本地 ad-hoc、未公证；当前实测 macOS arm64。

| 产物 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `CevikEdit-0.2.1-arm64.dmg` | 192668253 | `e47d0472da3f78cf82684226579278109ee87d432b59328499b6aff270ac9a47` |
| `CevikEdit-0.2.1-arm64-mac.zip` | 192236273 | `f986bd2f3340243baa179b73a8dffeea1e3be174c20b3d5d9a66af15c03b7f41` |

[内置工具与重建说明](MEDIA_TOOLS.md) · [构建来源清单](media-tools-build.json)

## 第二轮 v0.2 验证（历史）

2026-10-13，`npm run check`：**155 项通过、13 个测试文件通过、零待办**，类型检查与生产构建成功。

新增验证包括：

- `capcutCodec`：自行生成的固定已知答案、篡改与截断、严格 Base64/UTF-8/对象校验、大小限制。
- `capcutProject` / `capcutProjectIO`：现代时间线目录、活动推荐、显式选择、只读源文件、路径和读取边界、不会误回退空根项目。
- `capcut-import-electron`：16 项真实桌面检查，涵盖不透明输入到画布/保存的完整链路、稀疏空时间线、取消/并发/token 生命周期，以及认证失败保留整个原项目。
- `export.sampling`：逐帧身份素材验证 1.5 倍、0.5 倍、24→30、30→24 fps 、帧对齐/非对齐裁剪、长 GOP/B 帧中后段 seek 及 VFR 大间隔/不规则采样，共十项；真实媒体逐帧比较，非字符串匹配测试。
- 额外的私有受控草稿验收：普通文件菜单、明确活动时间线、640×360 画布、视频/文字层级、黑色边角、实际媒体探测、0.5 秒画面及保存参数；无 page/media errors，原载荷 SHA-256 不变。
- 与剪映原生导出比较：90 帧/3 秒、2 秒视频和 3 秒文字，8 个抽样源帧全部一致；视频凸包 IoU 中位数约 98.44%，音频 RMS 差约 −0.00257 dB。它们不包含字体排版的保真承诺。

REA + Ghidra 正式反编译 Evidence、补充定点分析、认证解码和产品测试分别记录于 [第二轮研究](research/DRAFT_FORMAT_ROUND2.md)。原始受控载荷与完整解码数据只保留在本机忽略目录，公开测试使用合成数据。

最新构建另完整执行 8 套桌面回归（编辑导出、视觉工具、保存恢复、播放器、声音、轨道、转场、草稿导入），均无 renderer errors。最终 DMG 只读挂载后复制出的应用在独立 cwd/用户目录启动，完成九秒中文标题/混音导出；同一安装包再通过 16 项草稿导入检查，`packaged=true`。

v0.2 安装包的 `hdiutil verify`、ZIP 校验及严格代码签名检查通过。签名是本地 ad-hoc，未 Apple 公证。包内 4,023 个条目不含 `.research`、测试或被分析的专有库；运行编辑器不依赖逆向工具。

| 本地产物 | SHA-256 |
| --- | --- |
| `CevikEdit-0.2.0-arm64.dmg` | `a3d18dfba8b2abf5bc393cdb5eb90c2e9a91cfbfc3f665f7c031c88fa9089e2b` |
| `CevikEdit-0.2.0-arm64-mac.zip` | `f67ce443ebe5965587ea1f6364de0559909d211d92d2fedb59a6a411344f05c2` |
| `app.asar`（构建与 DMG 复制一致） | `551bd5cf9f6706542574c861574f4de3a044efa5ab8e24b6eb8a388590db3333` |

[时间线选择截图](screenshots/draft-timeline-choice.png) · [受控草稿导入后的 CevikEdit](screenshots/draft-import-editor.png)


## 首轮 v0.1 环境与执行记录（历史）

本机为 macOS arm64；Node.js `26.11.1`、Electron `44.7.0`、Vitest `5.0.4`、electron-builder `26.15.3`。系统 FFmpeg 为 `9.0.2`，独立进程调用，不随应用分发。应用源码统一格式化后，在本机通过 TypeScript 检查与 Vite/Electron 编译；最新完整测试记录为 05:28:34。独立 `.test-output/fresh-install/` 执行 `npm ci` 安装 405 个包成功，并实际检查 native canvas、esbuild 与 Electron 可用，不能只以原有 node_modules 成功代替干净安装。

当前 Vitest 配置只收集 `tests/**/*.test.ts`，排除 `.research/` 与构建目录。首轮记录的 `npm test` 结果为 **104 项通过、9 个测试文件通过**；本机 Vitest 缓存中对应九个 `tests/` 文件也均为未失败。旧缓存可能保留更早扫描研究工具时的条目，这些条目不属于当前 CevikEdit 测试范围。

## 核心及真实渲染

| 验证来源 | 证明的范围 |
| --- | --- |
| `tests/model.test.ts` | 源/目标时间数学、split/trim/变速、锁轨、动画及淡化窗口、不可信项目逐字段校验、crop/key/mask 可选参数边界 |
| `tests/store.test.ts` | 历史快照隔离、撤销/重做、transaction、轨道兼容、多选移动、素材去重、剪贴板、磁吸区间并集与 fade 重置 |
| `tests/capcutImport.test.ts` | 合成 classic 明文 JSON 的基础转换、警告、路径与数量限制；不证明当前剪映草稿兼容 |
| `tests/timeline.test.ts`、`tests/visual-ui.test.ts` | 时间线布局/吸附/波形和可视参数面板的核心语义 |
| `tests/export.integration.test.ts` | 真实 FFprobe/FFmpeg 导入、缩略图/波形/代理、源入点/速度/延迟、音高、画面合成、中文文字、关键帧、调色、alpha、淡化、音量/静音及取消目标保护 |
| `tests/export.visual.test.ts` | 源空间 crop、RGB 抠像、矩形/椭圆/羽化/反选蒙版与实际 FFmpeg 输出像素；包含源显示比例与有 alpha 的素材 |
| `tests/export.offline.test.ts` | 本地 playlist 含 HTTP 片段时，FFprobe/FFmpeg 拒绝获取，测试服务收到请求数为零 |
| `tests/export.shutdown.test.ts` | 应用退出时停止媒体/导出进程并清理临时结果 |

导出测试包含帧解码、像素比较、FFprobe 输出尺寸/时长、声音 RMS 和音高证据，并非只检查进程返回码。视频压缩、采样与量化采用测试中声明的容差，不能据此承诺所有帧逐像素相同。

## 编译后桌面工作流

`tests/app-electron.ts` 启动当前编译的 Electron 主进程，使用独立 `CEVIKEDIT_USER_DATA` 和自行生成的媒体。文件对话框只在测试专用 Electron 进程内替换，编辑通过实际页面控件及快捷键完成。

本地证据 `.test-output/app-electron/evidence.json` 当前记录 **2026-10-13 05:33:12（Asia/Shanghai）通过**，`errors` 与 `mediaFailures` 均为空。覆盖实际红/蓝缩略图像素、播放器解码与播放推进、时间线分割源入点、撤销、桌面复制粘贴快捷键、音频属性选择、文字持久化、调色/速度/关键帧、SRT 导入、项目保存及重新打开、媒体载入、画布尺寸和 UI 发起的真实视频导出。输出经 FFprobe 核实为 **320×180、5 秒**的视频。

截图：

- [桌面编辑器](screenshots/electron-editor.png)
- [桌面导出完成](screenshots/electron-export.png)

`tests/visual-ui-electron.ts` 在独立 Electron 环境中操作裁剪、抠像与蒙版。`.test-output/visual-ui-electron/evidence.json` 当前记录 **2026-10-13 05:33:16 通过**，无 renderer errors；三份实际导出视频均按 320×180 验证：

- 四象限图片裁剪为左上区域，预览及导出中心保留红色。
- 椭圆蒙版反选后，预览及导出中心显示画布背景。
- 绿色背景/红色前景素材，预览及导出都移除绿色、保留红色。

测试同时验证百分比参数保存、最小有效宽度、初始禁用、清除效果、锁轨禁用控件。截图见 [可视工具桌面验收](screenshots/electron-visual-tools.png)。这些 MP4 是最终画布合成结果，不宣称带有独立透明 alpha 通道。

## 字体、许可与研究证据

内置原版 Noto Sans SC 的字体与 OFL 文件均通过 byte count、SHA-256 和 Git blob SHA-1 验证。`npm run licenses` 已收集 **118 条记录、218 个文件**，未解决项为零；归属路径和 SHA-256 清单核查通过，包含 Electron/Chromium、canvas 原生组件、Skia 和字体 OFL。

最新两份桌面 evidence JSON 均记录 `fonts.browserFaces=1`、`browserLoaded=true`、`browserCheck=true`、`nativeIncludesNoto=true`：Chromium 真正加载内置 Noto Sans SC，原生文字引擎也暴露同一字体家族。它们证明本机构建中的字体注册和实际浏览器加载，不证明每个操作系统上的字体行为相同。

首轮：REA CLI 与 MCP 对安装包和本次专用新建草稿进行有限取证；MCP 观察只绑定明确 PID/window、完成后关闭绑定。素材预览及选中三秒时间线样片的证据 ID、截图指纹、推断与未知项见 [REA_FINDINGS.md](research/REA_FINDINGS.md)。未读取既有私人草稿、未解密不透明草稿，也未调用或绕过付费/账号能力。

## 额外桌面回归

新增桌面回归证据：

| 本地证据 | 本机通过时间 | 覆盖 |
| --- | --- | --- |
| `.test-output/storage-electron/evidence.json` | 05:35:43 | 保存快照期间新编辑仍为 dirty、关闭取消、保存最新状态、重启自动恢复、源丢失、重新链接保持同时编辑、保存时切换项目不挂旧路径 |
| `.test-output/audio-electron/evidence.json` | 05:32:39 | MKV 本地代理、UI 分离音频、原视频静音与派生音频可听、源移动后共享引用重新链接、保持 ID/名称/类型/代理、真实导出非重复混音 |
| `.test-output/track-electron/evidence.json` | 05:34:28 | 冻结跨轨拖动几何、重命名/上下移动 App 回调、锁轨及邻锁约束、非空轨删除确认和快捷键阻断、保留素材、一次撤销恢复、竖向滚动后的固定播放头手柄 |
| `.test-output/player-electron/evidence.json` | 05:34:49 | 实际解码预览、松开前实时画面拖动、关键帧路径一起移动、一次撤销、项目末尾保持最终帧 |
| `.test-output/keyframe-electron/evidence.json` | 00:40:27 | 曲线/列表选择、拖动与一次撤销、复制/粘贴/删除、精确时间/数值、三种缓动保存重开、90 帧导出及全部 90 帧预览/导出采样比较 |

音频 evidence 保留实际 GainNode 和 waveform RMS：分离后的原视频 gain=0/RMS=0，派生 audio gain=1/RMS 约0.0603；移动源文件并重新链接后派生音频 RMS 约0.0614，真实输出 RMS 约0.0873。它们证明这次实际播放/导出中声音存在且没有原视频重复叠加，不替代所有音频设备的验证。

`tests/transition-electron.ts` 随后通过实际桌面叠化与导出：已有淡出/裁切窗口的前片段被正确覆盖为叠化，时间线重叠 0.5 秒。中点预览 RGB `[127,0,128]`，真实导出 RGB `[127,0,127]`；混合亮度完整，声音交叉淡化 RMS 为 0.06354，renderer errors 为空。记录见本机 `.test-output/transition-electron/evidence.json`，复现入口为 `npm run test:transition`。

机器可读且去掉本机媒体绝对路径的摘要见 [validation-summary.json](validation-summary.json)。

## 首轮 v0.1 打包与未覆盖边界

最终 macOS 安装包验收已完成：

- 生成 `release/CevikEdit-0.1.0-arm64.dmg` 与 `release/CevikEdit-0.1.0-arm64-mac.zip`。`hdiutil verify` 为 VALID；镜像以只读方式挂载并验证 CRC；`unzip -tq` 无错误。
- 从最终 DMG 复制 `.app` 到 `.test-output/dmg-installed/CevikEdit.app`，严格签名校验 exit 0。本地签名为 **ad-hoc**，不是 Apple Developer ID，也未公证。
- 源 `.app` 与 DMG 复制版本的 `app.asar` SHA-256 完全一致：`6081e40acda576b6172a9ca36ea8f62c24ac00035985c51234c4c26faa80094b`。ASAR 包清单有 4,023 项；六份预期 notices 资源存在，未含 `.research`、测试、demo 私有路径或 electron-builder 开发构建文件。
- `.test-output/package-electron/evidence.json` 最新为 **05:39:11 通过**，`errors=[]`，`packaged=true`。测试执行最终 DMG 复制的真正可执行文件，并使用独立 cwd/用户目录，验证 Noto 浏览器真实加载与原生注册、native canvas、隔离桥接、启动 `.cevikedit` 参数、13 个片段、景观/缩略图预览和 UI 发起的 **1280×720、九秒、含 AAC 混音与中文标题**导出。
- 根代理另验证八步键盘调整时间线高度、右侧属性仍在 viewport 内，并检查最终 [演示编辑器截图](screenshots/demo-editor.png) 的四轨与三栏完整可见。文件关联测试在此只宣称启动 `.cevikedit` 参数实际生效，没有扩展为所有 Finder 注册状态已覆盖。

以下边界仍保留：
- **Windows/Linux 未实测**：代码及 CI matrix 已准备，但本机 macOS 成功不等于这些系统的运行、打包或字体结果。
- **GitHub CI 尚未运行**：workflow 使用官方 checkout/setup-node/upload-artifact v7、只读权限，package job 上传 DMG/ZIP；没有发布仓库或远程执行成功证据。
- Developer ID 发行签名、公证、自动更新、云同步、SaaS、账号、API AI 未实现；浏览器单独模式不具备完整桌面文件桥接与导出。
- 大项目、长时间编辑、异常断电、全部媒体格式、专业 HDR/颜色管理以及所有商业剪映功能尚未验证或实现。
- 草稿导入的第二轮已验证本机受控不透明载荷；仍不证明所有剪映版本或完整效果兼容，详见 [CAPCUT_INTEROP.md](CAPCUT_INTEROP.md)。

## 开发依赖审计

本机 `.test-output/npm-audit-production.json` 的 npm production tree 已报告 **0 项已知 advisory**。完整 `.test-output/npm-audit.json` 报告 **8 个 moderate 开发依赖条目**，均由 `sprintf-js` 的 [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) 拒绝服务 advisory 经 `roarr → global-agent → @electron/get → electron-builder` 等构建链传递，包含 `app-builder-lib`、`dmg-builder` 和 Windows installer 构建组件。它们不是八个独立 advisory。

该链属于构建/下载工具，不是本项目 production npm 依赖，也不随编辑器的运行时 npm 模块分发；不能因此把开发依赖报告写成零。当前使用 electron-builder 26.15.3，开发依赖报告保留供后续依赖维护。npm audit 只反映当时 registry 数据和 npm 依赖图，不覆盖系统 FFmpeg、全部 Electron/Chromium 原生代码或未知漏洞。

## 复现命令

```sh
npm ci
npm run check
npm run test:timeline
npm run test:desktop
npm run test:keyframes
npm run test:visual
npm run test:storage
npm run test:player
npm run test:audio
npm run test:tracks
npm run test:subtitles
npm run test:portable
npm run test:source
npm run test:workspace
npm run test:transition
npm run test:capcut
npm run licenses
npm run demo
npm run dist:mac:installer
npm run test:package
```

执行结果以各次真实输出及生成的 `.test-output/` 记录为准。后续重新构建应重新运行 package smoke 并更新指纹；跨平台结果只有在对应环境实际执行后追加，不把命令或配置存在写成已通过。
