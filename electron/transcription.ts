import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildSubtitleCues,
  parseWhisperOutput,
  type TranscriptionCue,
} from "../src/core/transcription";
import type {
  Subtitle,
} from "../src/core/subtitles";
import type {
  TranscriptionModel,
  TranscriptionRequest,
  TranscriptionStage,
  TranscriptionStatus,
} from "../src/core/types";
import { findMediaTool } from "./mediaTools";

interface WhisperOptions {
  bundledDirectories?: string[];
  userDataDirectory?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** Path explicitly picked by the user; it takes precedence over everything. */
  savedExecutable?: string;
  savedModel?: string;
}

interface RunningJob {
  child?: ChildProcess;
  cancelled: boolean;
  completion: Promise<void>;
  finish: () => void;
}

interface ProcessOptions {
  job: RunningJob;
  timeout: number;
  label: "FFmpeg" | "Whisper";
  onData?: (chunk: string) => void;
}

const jobs = new Map<string, RunningJob>();
const cancelledJobs = new Set<string>();
let shuttingDown = false;

function primaryExecutableNames(platform: NodeJS.Platform): string[] {
  return platform === "win32" ? ["whisper-cli.exe"] : ["whisper-cli"];
}

function bundledExecutableNames(platform: NodeJS.Platform): string[] {
  return [
    ...primaryExecutableNames(platform),
    platform === "win32" ? "whisper.exe" : "whisper",
    platform === "win32" ? "main.exe" : "main",
  ];
}

async function usableFile(
  file: string,
  platform: NodeJS.Platform,
): Promise<boolean> {
  try {
    if (!(await stat(file)).isFile()) return false;
    await access(
      file,
      platform === "win32" ? constants.F_OK : constants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate a local whisper.cpp executable. The selected path wins, then the
 * environment override, then bundled media tools, then PATH. Nothing is ever
 * downloaded or executed from a remote location.
 */
export async function resolveWhisperExecutable(
  options: WhisperOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  if (options.savedExecutable) {
    if (await usableFile(options.savedExecutable, platform))
      return path.resolve(options.savedExecutable);
    throw new Error("Seçili Whisper kullanılamıyor; çalıştırılabilir dosyayı yeniden seçin.");
  }
  if (env.CEVIKEDIT_WHISPER) {
    if (await usableFile(env.CEVIKEDIT_WHISPER, platform))
      return path.resolve(env.CEVIKEDIT_WHISPER);
    throw new Error("CEVIKEDIT_WHISPER ortam değişkeninin gösterdiği program kullanılamıyor.");
  }

  const bundledNames = bundledExecutableNames(platform);
  const candidates: string[] = [];
  for (const directory of options.bundledDirectories ?? []) {
    for (const name of primaryExecutableNames(platform))
      candidates.push(path.join(directory, name));
    for (const name of bundledNames)
      candidates.push(path.join(directory, "whisper", name));
  }

  const pathDirectories = (env.PATH ?? "")
    .split(platform === "win32" ? ";" : ":")
    .filter(Boolean);
  if (platform !== "win32")
    pathDirectories.push("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin");
  for (const directory of pathDirectories)
    for (const name of primaryExecutableNames(platform))
      candidates.push(path.join(directory, name));

  for (const candidate of candidates)
    if (await usableFile(candidate, platform)) return path.resolve(candidate);
  throw new Error(
    "Whisper bulunamadı. whisper.cpp kurun veya altyazı panelinden çalıştırılabilir dosyayı seçin.",
  );
}

async function binFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.bin$/i.test(entry.name))
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

/** Discover GGML model files without walking arbitrary directories. */
export async function discoverWhisperModels(
  options: WhisperOptions = {},
): Promise<TranscriptionModel[]> {
  const env = options.env ?? process.env;
  const candidates: string[] = [];
  const add = (file?: string) => {
    if (!file || !path.isAbsolute(file)) return;
    const resolved = path.resolve(file);
    if (!candidates.includes(resolved)) candidates.push(resolved);
  };
  add(options.savedModel);
  add(env.CEVIKEDIT_WHISPER_MODEL);

  const directories = new Set<string>();
  for (const base of options.bundledDirectories ?? []) {
    directories.add(base);
    directories.add(path.join(base, "whisper"));
    directories.add(path.join(base, "models"));
    directories.add(path.join(base, "whisper", "models"));
  }
  if (options.userDataDirectory)
    directories.add(path.join(options.userDataDirectory, "whisper-models"));
  for (const directory of directories)
    for (const file of await binFiles(directory)) add(file);

  const models: TranscriptionModel[] = [];
  for (const file of candidates) {
    try {
      const metadata = await stat(file);
      if (
        !metadata.isFile() ||
        metadata.size <= 0 ||
        metadata.size > 8 * 1024 * 1024 * 1024
      )
        continue;
      models.push({
        path: file,
        name: path.basename(file),
        size: metadata.size,
      });
    } catch {
      /* A stale saved model is simply not offered. */
    }
  }
  return models.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 32);
}

export async function whisperStatus(
  options: WhisperOptions = {},
): Promise<TranscriptionStatus> {
  const models = await discoverWhisperModels(options);
  const env = options.env ?? process.env;
  const preferred = [options.savedModel, env.CEVIKEDIT_WHISPER_MODEL]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => path.resolve(value))
    .find((value) => models.some((model) => path.resolve(model.path) === value));
  const selectedModel = preferred ?? models[0]?.path;
  try {
    const executable = await resolveWhisperExecutable(options);
    return { available: true, executable, models, selectedModel };
  } catch (error) {
    return {
      available: false,
      models,
      selectedModel,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function runProcess(
  executable: string,
  args: string[],
  options: ProcessOptions,
): Promise<void> {
  if (options.job.cancelled) return Promise.reject(new Error("Yazıya dökme iptal edildi"));
  return new Promise<void>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(
        new Error(
          `${options.label} başlatılamadı: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return;
    }
    options.job.child = child;
    let diagnostic = "";
    let failure: Error | undefined;
    let settled = false;
    const timeoutMessage =
      options.label === "Whisper"
        ? "Whisper zaman aşımına uğradı; klibi kısaltın veya daha küçük bir model kullanın."
        : "Ses çıkarma zaman aşımına uğradı; medya dosyasını denetleyin.";
    const timer = setTimeout(() => {
      failure = new Error(timeoutMessage);
      child.kill("SIGKILL");
    }, options.timeout);
    const consume = (data: Buffer) => {
      const text = String(data);
      diagnostic = (diagnostic + text).slice(-12_000);
      options.onData?.(text);
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);
    child.once("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      options.job.child = undefined;
      reject(
        new Error(
          `${options.label} başlatılamadı: ${error.message || String(error)}`,
        ),
      );
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      options.job.child = undefined;
      if (options.job.cancelled) reject(new Error("Yazıya dökme iptal edildi"));
      else if (failure) reject(failure);
      else if (code !== 0)
        reject(
          new Error(
            `${options.label} çalıştırılamadı: ${diagnostic.trim() || code}`,
          ),
        );
      else resolve();
    });
  });
}

async function readWhisperResults(prefix: string): Promise<string[]> {
  const results: string[] = [];
  for (const extension of [".json", ".srt"]) {
    const file = `${prefix}${extension}`;
    try {
      const metadata = await stat(file);
      if (!metadata.isFile()) continue;
      if (metadata.size > 64 * 1024 * 1024)
        throw new Error("Whisper çıktısı güvenlik sınırını aşıyor.");
      results.push(await readFile(file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") continue;
      throw error;
    }
  }
  return results;
}

/**
 * Extract the selected clip range to mono 16 kHz WAV, run whisper.cpp with an
 * argument array, parse its JSON/SRT output and turn it into timeline subtitles.
 */
export async function transcribeAudio(
  request: TranscriptionRequest,
  options: WhisperOptions & {
    onProgress?: (progress: number, stage: TranscriptionStage) => void;
  } = {},
): Promise<{ cues: Subtitle[] }> {
  if (shuttingDown) throw new Error("Uygulama kapanıyor.");
  if (cancelledJobs.delete(request.jobId)) throw new Error("Yazıya dökme iptal edildi");
  if (jobs.size > 0) throw new Error("Zaten çalışan bir yazıya dökme görevi var");

  let finish!: () => void;
  const completion = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const job: RunningJob = { cancelled: false, completion, finish };
  jobs.set(request.jobId, job);
  const progress = options.onProgress ?? (() => {});
  const directory = path.join(
    options.userDataDirectory ?? os.tmpdir(),
    "transcription",
    request.jobId,
  );

  try {
    await mkdir(directory, { recursive: true });
    progress(1, "preparing");

    const model = await stat(request.model).catch(() => null);
    if (
      !model?.isFile() ||
      model.size <= 0 ||
      model.size > 8 * 1024 * 1024 * 1024
    )
      throw new Error("Whisper model dosyası geçersiz");

    const ffmpeg = await findMediaTool("ffmpeg");
    if (job.cancelled) throw new Error("Yazıya dökme iptal edildi");
    const wav = path.join(directory, "audio.wav");
    const sourceSeconds = request.duration * request.speed;
    progress(4, "extracting");
    await runProcess(
      ffmpeg,
      [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-ss",
        String(request.sourceIn),
        "-t",
        String(sourceSeconds),
        "-i",
        request.source,
        "-map",
        "0:a:0",
        "-vn",
        "-sn",
        "-dn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        wav,
      ],
      {
        job,
        label: "FFmpeg",
        timeout: Math.min(
          10 * 60_000,
          Math.max(60_000, Math.ceil(sourceSeconds * 500)),
        ),
      },
    );
    if (job.cancelled) throw new Error("Yazıya dökme iptal edildi");

    const executable = await resolveWhisperExecutable(options);
    progress(8, "transcribing");
    const prefix = path.join(directory, "result");
    let lastProgress = 8;
    await runProcess(
      executable,
      [
        "-m",
        request.model,
        "-f",
        wav,
        "-l",
        request.language,
        "-oj",
        "-osrt",
        "-of",
        prefix,
        "-pp",
      ],
      {
        job,
        label: "Whisper",
        timeout: Math.min(
          60 * 60_000,
          Math.max(5 * 60_000, Math.ceil(sourceSeconds * 6000)),
        ),
        onData: (chunk) => {
          const match = /progress\s*=\s*(\d{1,3})\s*%/i.exec(chunk);
          if (!match) return;
          const value = Math.max(0, Math.min(100, Number(match[1])));
          const next = 8 + Math.round(value * 0.88);
          if (next < lastProgress + 1) return;
          lastProgress = next;
          progress(next, "transcribing");
        },
      },
    );
    if (job.cancelled) throw new Error("Yazıya dökme iptal edildi");

    progress(97, "parsing");
    const rawResults = await readWhisperResults(prefix);
    if (!rawResults.length) throw new Error("Whisper sonuç dosyası oluşturmadı.");
    let parsed: TranscriptionCue[] = [];
    for (const raw of rawResults) {
      try {
        parsed = parseWhisperOutput(raw);
      } catch {
        parsed = [];
      }
      if (parsed.length) break;
    }
    if (!parsed.length) throw new Error("Whisper konuşma algılamadı");

    const cues = buildSubtitleCues(parsed, {
      offset: request.start,
      speed: request.speed,
      limit: request.start + request.duration,
      fps: request.fps,
    });
    if (!cues.length)
      throw new Error("Otomatik altyazı boş; sesi denetleyin veya modeli değiştirin");
    if (job.cancelled) throw new Error("Yazıya dökme iptal edildi");
    progress(100, "complete");
    return { cues };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    jobs.delete(request.jobId);
    finish();
  }
}

export async function cancelTranscription(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    // The renderer can click cancel before the queued IPC call has registered
    // its job. Remember it briefly so the runner does not start anyway.
    cancelledJobs.add(jobId);
    const timer = setTimeout(() => cancelledJobs.delete(jobId), 30_000);
    timer.unref();
    return;
  }
  job.cancelled = true;
  const child = job.child;
  if (child) {
    child.kill("SIGTERM");
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }, 2000);
    timer.unref();
  }
  await Promise.race([
    job.completion,
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      timer.unref();
    }),
  ]);
}

/** Stop running jobs when the editor window closes. */
export function cancelAllTranscriptions(): void {
  for (const job of jobs.values()) {
    job.cancelled = true;
    job.child?.kill("SIGTERM");
  }
}

/** Stop and wait briefly for jobs during application shutdown. */
export async function shutdownTranscriptions(): Promise<void> {
  shuttingDown = true;
  const pending = [...jobs.values()];
  for (const job of pending) {
    job.cancelled = true;
    job.child?.kill("SIGTERM");
  }
  const killTimer = setTimeout(() => {
    for (const job of pending)
      if (
        job.child?.exitCode === null &&
        job.child?.signalCode === null
      )
        job.child?.kill("SIGKILL");
  }, 2000);
  killTimer.unref();
  await Promise.race([
    Promise.allSettled(pending.map((job) => job.completion)),
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      timer.unref();
    }),
  ]);
  clearTimeout(killTimer);
}
