import { execFileSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Downscale the landing-page raster assets so the site stays light.
 * Requires a local ffmpeg (same one the app uses).
 */
const ffmpeg =
  process.env.CEVIKEDIT_FFMPEG ??
  "C:\\Users\\Muhammed Eren Efendi\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0-full_build\\bin\\ffmpeg.exe";

const targets = [
  ["app-icon.png", 256],
  ["demo-01.png", 960],
  ["demo-03.png", 960],
  ["demo-05.png", 960],
  ["editor.png", 1400],
  ["audio.png", 1000],
  ["subtitles.png", 1000],
  ["visual.png", 1000],
  ["timeline.png", 1000],
];

const directory = path.join(process.cwd(), "site", "assets");
const temporary = mkdtempSync(path.join(tmpdir(), "cevikedit-site-"));
try {
  for (const [name, width] of targets) {
    const source = path.join(directory, name);
    const output = path.join(temporary, name);
    execFileSync(ffmpeg, [
      "-v", "error", "-y",
      "-i", source,
      "-vf", `scale='min(${width},iw)':-2:flags=lanczos`,
      output,
    ]);
    execFileSync(process.execPath, [
      "-e",
      `require('node:fs').copyFileSync(${JSON.stringify(output)}, ${JSON.stringify(source)})`,
    ]);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
for (const file of await readdir(directory)) {
  const info = await stat(path.join(directory, file));
  console.log(`${file}  ${(info.size / 1024).toFixed(0)} KB`);
}
