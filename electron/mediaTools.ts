import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";

type ToolName = "ffmpeg" | "ffprobe";

let bundledDirectories: string[] = [];

/** Directories the packaged (or development) app ships media tools in. */
export function setBundledMediaToolsDirectory(
  directory: string | string[] | undefined,
): void {
  bundledDirectories = (Array.isArray(directory) ? directory : directory ? [directory] : [])
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

export function bundledMediaToolDirectories(): string[] {
  return [...bundledDirectories];
}

/**
 * Well-known install locations for a system FFmpeg. Users who installed FFmpeg
 * with WinGet, Chocolatey, Scoop, Homebrew or a manual zip expect the app to
 * find it without touching settings; PATH is not enough because GUI launches on
 * Windows and macOS do not inherit a developer shell environment.
 */
async function wellKnownDirectories(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Promise<string[]> {
  const directories: string[] = [];
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA;
    const programFiles = env.ProgramFiles;
    const programFilesX86 = env["ProgramFiles(x86)"];
    const chocolatey = env.ChocolateyInstall ?? "C:\\ProgramData\\chocolatey";
    if (localAppData) {
      // WinGet keeps each package version in its own folder.
      const wingetPackages = path.join(
        localAppData,
        "Microsoft",
        "WinGet",
        "Packages",
      );
      directories.push(path.join(localAppData, "Microsoft", "WinGet", "Links"));
      try {
        for (const entry of await readdir(wingetPackages, { withFileTypes: true })) {
          if (!entry.isDirectory() || !/ffmpeg/i.test(entry.name)) continue;
          const packageRoot = path.join(wingetPackages, entry.name);
          for (const inner of await readdir(packageRoot, { withFileTypes: true })) {
            if (!inner.isDirectory()) continue;
            directories.push(path.join(packageRoot, inner.name, "bin"));
          }
          directories.push(path.join(packageRoot, "bin"));
        }
      } catch {
        /* no WinGet packages */
      }
    }
    directories.push(
      path.join(chocolatey, "bin"),
      "C:\\ffmpeg\\bin",
      "C:\\ProgramData\\chocolatey\\bin",
    );
    if (programFiles) directories.push(path.join(programFiles, "ffmpeg", "bin"));
    if (programFilesX86) directories.push(path.join(programFilesX86, "ffmpeg", "bin"));
    if (env.USERPROFILE)
      directories.push(path.join(env.USERPROFILE, "scoop", "shims"));
  } else {
    directories.push(
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/opt/local/bin",
      "/snap/bin",
      "/usr/local/opt/ffmpeg/bin",
    );
    if (env.HOME) directories.push(path.join(env.HOME, ".local", "bin"));
  }
  return directories;
}

export async function resolveMediaTool(
  name: ToolName,
  options: {
    bundledDirectory?: string | string[];
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    /** Set false to search only explicit paths (used by diagnostics and tests). */
    systemLocations?: boolean;
  } = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const override = env[name === "ffmpeg" ? "CEVIKEDIT_FFMPEG" : "CEVIKEDIT_FFPROBE"];
  const executable = platform === "win32" ? `${name}.exe` : name;
  const packaged = options.bundledDirectory ?? bundledDirectories;

  if (override) {
    const candidates = [override];
    for (const candidate of candidates) {
      try {
        if (!(await stat(candidate)).isFile()) continue;
        return candidate;
      } catch {
        /* unavailable */
      }
    }
    throw new Error(
      `Seçili ${name} kullanılamıyor; ayarlardan yeniden bir çalıştırılabilir dosya seçin.`,
    );
  }

  const fromPath = (env.PATH ?? "")
    .split(platform === "win32" ? ";" : ":")
    .filter(Boolean)
    .map((directory) => path.join(directory, executable));
  const wanted = [
    ...(Array.isArray(packaged) ? packaged : packaged ? [packaged] : []).map(
      (directory) => path.join(directory, executable),
    ),
    ...fromPath,
    ...(options.systemLocations === false
      ? []
      : (await wellKnownDirectories(env, platform)).map((directory) =>
          path.join(directory, executable),
        )),
  ];

  const seen = new Set<string>();
  for (const candidate of wanted) {
    const key = platform === "win32" ? candidate.toLowerCase() : candidate;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (!(await stat(candidate)).isFile()) continue;
      await access(
        candidate,
        platform === "win32" ? constants.F_OK : constants.X_OK,
      );
      return candidate;
    } catch {
      /* next candidate */
    }
  }

  if (packaged.length)
    throw new Error(
      `Gömülü ${name} eksik veya çalıştırılamıyor; uygulamayı eksiksiz yeniden kurun ya da ayarlardan bir çalıştırılabilir dosya seçin.`,
    );
  throw new Error(
    `${name} bulunamadı. FFmpeg kurun (WinGet, Chocolatey, Scoop veya Homebrew) ya da ayarlardan ffmpeg ve ffprobe çalıştırılabilir dosyalarını seçin.`,
  );
}

export function findMediaTool(name: ToolName): Promise<string> {
  return resolveMediaTool(name, { bundledDirectory: bundledDirectories });
}
