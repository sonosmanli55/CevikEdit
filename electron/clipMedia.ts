import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { probeFile, runMediaTool } from "./media";
import { findMediaTool } from "./mediaTools";
import type { ReverseProgress } from "../src/core/types";

interface ReverseJob {
  child?: ChildProcess;
  cancelled: boolean;
  completion: Promise<void>;
  finish: () => void;
}

export interface ReverseMediaOptions {
  jobId: string;
  source: string;
  sourceIn: number;
  duration: number;
  destination: string;
  onProgress?: (progress: number, status: ReverseProgress["status"]) => void;
}

const jobs = new Map<string, ReverseJob>();
const cancelledJobs = new Set<string>();
let shuttingDown = false;

const number = (value: number) => String(Number(value.toFixed(6)));
const frameRate = (raw?: string): number => {
  if (!raw) return 0;
  const [a, b = "1"] = raw.split("/");
  const value = Number(a) / Number(b);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

function mediaDuration(info: Awaited<ReturnType<typeof probeFile>>): number {
  const video = info.streams.find((stream) => stream.codec_type === "video");
  const audio = info.streams.find((stream) => stream.codec_type === "audio");
  const values = [
    Number(info.format.duration),
    Number(video?.duration),
    Number(audio?.duration),
  ].filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : 0;
}

async function reportFileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reverse an exact source range into a reusable local MP4.
 *
 * FFmpeg's reverse filter buffers the whole selected range in memory. The
 * duration limit below keeps a malformed or extremely long selection from
 * exhausting the editor's memory; callers should split longer clips first.
 */
export async function reverseClipMedia(
  options: ReverseMediaOptions,
): Promise<void> {
  if (shuttingDown) throw new Error("Uygulama kapanıyor.");
  if (cancelledJobs.delete(options.jobId)) throw new Error("Ters oynatma iptal edildi");
  if (jobs.size > 0) throw new Error("Zaten çalışan bir ters oynatma görevi var");

  let finish!: () => void;
  const completion = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const job: ReverseJob = { cancelled: false, completion, finish };
  jobs.set(options.jobId, job);
  const progress = options.onProgress ?? (() => {});
  const temporary = `${options.destination}.${randomUUID()}.tmp.mp4`;
  let child: ChildProcess | undefined;

  try {
    progress(1, "preparing");
    const info = await probeFile(options.source);
    if (job.cancelled) throw new Error("Ters oynatma iptal edildi");
    const video = info.streams.find((stream) => stream.codec_type === "video");
    if (!video) throw new Error("Bu medyada ters çevrilecek görüntü yok");
    const duration = mediaDuration(info);
    if (
      !Number.isFinite(options.sourceIn) ||
      !Number.isFinite(options.duration) ||
      options.sourceIn < 0 ||
      options.duration <= 0 ||
      options.sourceIn + options.duration > duration + 0.08
    )
      throw new Error("Ters oynatma aralığı kaynak medyanın dışında");

    const fps = frameRate(video.avg_frame_rate ?? video.r_frame_rate) || 30;
    const width = Math.max(1, Number(video.width) || 1920);
    const height = Math.max(1, Number(video.height) || 1080);
    const frameBytes = width * height * 1.5;
    const maxSeconds = Math.max(
      1,
      (3 * 1024 * 1024 * 1024) / (frameBytes * fps),
    );
    if (options.duration > maxSeconds)
      throw new Error(
        `Ters oynatılacak klip çok uzun: bu çözünürlükte en fazla ${maxSeconds.toFixed(1)} sn; klibi önce bölün.`,
      );

    await mkdir(path.dirname(options.destination), { recursive: true });
    const hasAudio = info.streams.some(
      (stream) => stream.codec_type === "audio",
    );
    const executable = await findMediaTool("ffmpeg");
    if (job.cancelled) throw new Error("Ters oynatma iptal edildi");
    progress(3, "rendering");

    child = spawn(
      executable,
      [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-progress",
        "pipe:1",
        "-nostats",
        "-protocol_whitelist",
        "file,pipe",
        "-ss",
        number(options.sourceIn),
        "-t",
        number(options.duration),
        "-i",
        options.source,
        "-map",
        "0:v:0",
        ...(hasAudio
          ? [
              "-map",
              "0:a:0",
              "-af",
              "areverse,asetpts=PTS-STARTPTS",
            ]
          : ["-an"]),
        "-vf",
        "reverse,setpts=PTS-STARTPTS",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        ...(hasAudio
          ? [
              "-c:a",
              "aac",
              "-b:a",
              "192k",
              "-ar",
              "48000",
              "-ac",
              "2",
            ]
          : []),
        "-metadata:s:v:0",
        "rotate=0",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        temporary,
      ],
      { shell: false, windowsHide: true },
    );
    job.child = child;
    let diagnostic = "";
    let output = "";
    let lastProgress = 3;
    child.stderr?.on("data", (chunk) => {
      diagnostic = (diagnostic + String(chunk)).slice(-12_000);
    });
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
      let lineEnd = output.indexOf("\n");
      while (lineEnd >= 0) {
        const line = output.slice(0, lineEnd).trim();
        output = output.slice(lineEnd + 1);
        const match = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (match) {
          const seconds = Number(match[1]) / 1_000_000;
          const next = Math.max(
            3,
            Math.min(99, (seconds / options.duration) * 100),
          );
          if (next >= lastProgress + 1) {
            lastProgress = next;
            progress(next, "rendering");
          }
        }
        lineEnd = output.indexOf("\n");
      }
    });
    child.once("error", (error) => {
      diagnostic = error.message;
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        job.cancelled = true;
        child?.kill("SIGTERM");
        reject(new Error("Ters oynatma zaman aşımına uğradı; klibi kısaltıp tekrar deneyin."));
      }, Math.min(30 * 60_000, Math.max(2 * 60_000, Math.ceil(options.duration * 5000))));
      timeout.unref();
      child!.once("close", (code) => {
        clearTimeout(timeout);
        if (job.cancelled) reject(new Error("Ters oynatma iptal edildi"));
        else if (code !== 0)
          reject(
            new Error(
              `FFmpeg ters oynatma hatası: ${diagnostic.trim() || `çıkış kodu ${code}`}`,
            ),
          );
        else resolve();
      });
    });
    if (job.cancelled) throw new Error("Ters oynatma iptal edildi");
    if (!(await reportFileExists(temporary)))
      throw new Error("Ters oynatma çıktı dosyası oluşturmadı");
    await rename(temporary, options.destination);
    progress(99, "rendering");
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
    jobs.delete(options.jobId);
    finish();
  }
}

/** Extract one source frame as a PNG that the image pipeline can reuse. */
export async function extractFreezeFrame(
  source: string,
  time: number,
  destination: string,
): Promise<void> {
  if (shuttingDown) throw new Error("Uygulama kapanıyor.");
  const info = await probeFile(source);
  const video = info.streams.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error("Bu medyada dondurulacak görüntü yok");
  const duration = mediaDuration(info);
  if (!Number.isFinite(time) || time < 0) throw new Error("Kare dondurma zamanı geçersiz");
  const at = Math.max(0, Math.min(time, Math.max(0, duration - 0.001)));
  const temporary = `${destination}.${randomUUID()}.tmp.png`;
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await runMediaTool(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-ss",
        number(at),
        "-i",
        source,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-vf",
        "scale=w=ceil(iw*sar/2)*2:h=ih,setsar=1",
        "-c:v",
        "png",
        "-pix_fmt",
        "rgba",
        "-compression_level",
        "6",
        "-f",
        "image2",
        "-update",
        "1",
        temporary,
      ],
      120_000,
    );
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

export async function cancelReverseClip(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    // The IPC invoke may not have registered its job yet.
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

export function cancelAllClipMedia(): void {
  for (const job of jobs.values()) {
    job.cancelled = true;
    job.child?.kill("SIGTERM");
  }
}

export async function shutdownClipMedia(): Promise<void> {
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
