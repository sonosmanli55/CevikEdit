# 本地 Whisper 自动字幕

ReaCut 的自动字幕完全在本机运行：先用本机 FFmpeg 把所选片段的声音提取为 16 kHz 单声道 WAV，再调用本地的 [whisper.cpp](https://github.com/ggml-org/whisper.cpp) 命令行程序和 GGML 模型，最后把结果写成时间线文字片段。音频不会上传，也不会自动下载程序或模型。

这是独立实现，不包含剪映的代码、模型、字体或模板，也不把剪映的语音识别结果当作输入。

## 准备工具

需要两样本机文件：

1. **whisper.cpp 可执行文件**：新版程序名为 `whisper-cli`（Windows 为 `whisper-cli.exe`），旧版构建可能叫 `main`。
2. **GGML 模型文件**：例如 `ggml-base.bin`、`ggml-small.bin`、`ggml-medium.bin`。文件通常从 whisper.cpp 项目的模型说明或 Hugging Face 的 `ggerganov/whisper.cpp` 仓库手动下载。

另外需要 FFmpeg。macOS 安装包已内置；Windows / Linux 开发环境需要在“设置”里选择 FFmpeg，或让 `ffmpeg` 出现在 `PATH` 中。

模型体积和速度差异明显：`base` 适合快速草稿，`small` / `medium` 更准确但更慢。模型文件的使用、分发和再分发须遵守其来源许可；本仓库不附带模型。

## 放在哪里

Whisper 程序按以下顺序查找；前一项明确存在时不会向后回退，避免悄悄换用另一个程序。模型优先使用已保存或环境变量指定的有效文件，否则从下列目录收集。

**Whisper 可执行文件**

1. 字幕面板中手动选择并保存的路径（用户数据目录的 `transcription-tools.json`）
2. 环境变量 `REACUT_WHISPER`
3. 内置媒体工具目录：
   - `media-tools/whisper-cli.exe` / `media-tools/whisper-cli`
   - `media-tools/whisper/whisper-cli.exe`、`media-tools/whisper/whisper.exe`、`media-tools/whisper/main.exe`（macOS / Linux 对应无 `.exe` 的名字）
4. `PATH` 中的 `whisper-cli` / `whisper-cli.exe`；macOS / Linux 还会检查 `/opt/homebrew/bin`、`/usr/local/bin`、`/usr/bin`

`PATH` 中的通用 `whisper` **不会**被自动采用。这个命令通常是 OpenAI 的 Python Whisper CLI，参数和输出格式与 whisper.cpp 不同；如果误用，转写会失败。若确实使用 whisper.cpp 但程序名不同，请在字幕面板中手动选择。

**GGML 模型**

1. 字幕面板中手动选择并保存的 `.bin` 路径
2. 环境变量 `REACUT_WHISPER_MODEL`
3. 内置目录 `media-tools/models/*.bin`、`media-tools/whisper/models/*.bin`
4. 用户数据目录的 `whisper-models/*.bin`

只接受扩展名为 `.bin`、大小大于 0 且不超过 8 GB 的普通文件。最多列出 32 个模型。模型选择会写入 `transcription-tools.json`，下次启动继续使用。

可选环境变量：

- `REACUT_WHISPER_DIR`：额外扫描一个媒体工具目录，适合开发时把 `whisper-cli` 和模型放在仓库外。
- `REACUT_WHISPER` / `REACUT_WHISPER_MODEL`：显式指定程序或模型；手动选择保存后，保存路径优先。

## 在界面中使用

1. 在时间线中选择一个含声音的音频或视频片段；没有选中时，播放头所在的含声音片段会被作为来源。
2. 打开“字幕”面板，在“自动字幕”中确认来源、语言和模型。
3. 语言可选“自动检测”、土耳其语、英语、德语、法语、西班牙语、阿拉伯语或俄语。自动检测依赖模型本身。
4. 点击“生成字幕”。进度会显示提取音频、识别语音和整理字幕阶段，可随时取消。
5. 完成后自动创建名为“字幕”的文字轨，并写入识别出的句子。整个写入是一次撤销操作。

如果来源片段使用变速，提取的是原始速度下的对应源区间；生成后会按速度换算回时间线位置。片段在时间线上的位置、源入点和时长都会参与计算。

## 处理规则

- 支持 whisper.cpp 的 JSON 输出（`transcription[]`、`segments[]` 或裸数组），读取 `offsets` 毫秒值；也接受 `timestamps` 字符串和 SRT 回退。
- 清理 `[Müzik]`、`(music)`、`[BLANK_AUDIO]`、`♪` 等非语音标记，但不删除括号内的正常对白。
- 超过约 90 字的识别文字会按词或字符拆分，目标每条约 6 秒；拆分时间按文字长度比例分配。若文字本身不足以拆分，会保留原时间窗，不重复或编造文字。
- 结果会移到片段在时间线上的起点，裁掉片段范围外的部分，按项目帧率对齐，并避免相邻字幕重叠。连续重复的短句会合并。
- 单次最多生成 2000 条字幕。超过限制会提示分段转写，不会写入半成品。
- 每个字幕片段至少保留一帧；若边界对齐后不足一帧，会扩展或丢弃。

## 隐私与安全边界

- 不调用云端接口，不上传音频、模型或识别结果，没有遥测。
- 不自动下载 whisper.cpp 或模型。缺少工具时只显示选择和安装提示。
- 音频只从已导入并授权的素材路径读取；模型必须来自发现列表或用户通过系统文件对话框选择。
- FFmpeg 和 Whisper 都使用参数数组启动，不经过 shell；FFmpeg 的输入协议限制为本地 `file,pipe`。
- 提取文件放在用户数据目录的临时子目录，任务结束、取消或应用关闭时清理。输出 JSON/SRT 限制为 64 MB，识别进程有超时，同一时间只运行一个任务。
- 窗口关闭和应用退出会终止正在运行的提取/识别子进程。

## 限制

- 只接 whisper.cpp 命令行程序，不接 OpenAI Python `whisper`、云端 API 或其他语音服务。
- 一次只处理一个时间线片段，只读取该素材的第一条音频流；不做整条时间线的混音转写。
- 不做逐词卡拉 OK 高亮、说话人分离、自动翻译或字幕样式自动匹配。
- 识别质量取决于模型、语言、噪声和片段长度；自动字幕仍应在字幕面板中校对。
- 真实转写速度取决于本机 CPU/GPU 和模型大小；过长的片段可能触发超时，建议分段。
- 当前仓库的开发检查没有在本机安装真实 whisper.cpp 可执行文件与模型，因此真实识别质量和真实 FFmpeg 音频提取仍需在目标机器上验收；详见 [VALIDATION.md](VALIDATION.md)。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| “找不到 Whisper” | 选择 `whisper-cli`，或设置 `REACUT_WHISPER`；确认文件有执行权限 |
| “所选 Whisper 不可用” | 重新选择程序；检查路径是否被移动 |
| “Whisper 执行失败” | 确认不是 OpenAI Python `whisper`；查看错误摘要中的参数/模型提示 |
| “Whisper 没有识别到语音” | 确认片段有声音、没有静音；尝试更大模型或明确语言 |
| “自动字幕为空” | 检查片段时间范围和源入点；确认音频不是纯音乐 |
| 模型列表为空 | 选择 `.bin` 文件，或放入用户数据的 `whisper-models` 目录 |
| 超时 | 缩短片段、降低模型大小或提高本机性能 |

## 验证

相关测试与手动检查记录见 [VALIDATION.md](VALIDATION.md)。核心解析和时间语义测试位于 `tests/transcription.test.ts`，工具发现测试位于 `tests/transcriptionTools.test.ts`，Unix 下的合成进程回归位于 `tests/transcriptionRunner.test.ts`（Windows 跳过）。
