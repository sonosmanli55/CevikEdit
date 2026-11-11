/**
 * Crop the landing-page detail images to the panel they actually document, so
 * the reader can read the UI instead of squinting at a full-window screenshot.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { copyFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const ffmpeg =
  process.env.CEVIKEDIT_FFMPEG ??
  "C:\\Users\\Muhammed Eren Efendi\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0-full_build\\bin\\ffmpeg.exe";

const root = process.cwd();
const temporary = mkdtempSync(path.join(tmpdir(), "cevikedit-crops-"));
try {
  const jobs = [
    // [source, output, crop w:h:x:y, target width]
    ["docs/screenshots/subtitle-editor.png", "site/assets/subtitles.png", "600:1600:18:96", 900],
    ["docs/screenshots/electron-audio-tools.png", "site/assets/audio.png", "470:900:14:44", 900],
    ["docs/screenshots/timeline-components.png", "site/assets/timeline.png", "1000:520:20:20", 1000],
  ];
  for (const [source, output, crop, width] of jobs) {
    const temp = path.join(temporary, path.basename(output));
    execFileSync(ffmpeg, [
      "-v", "error", "-y",
      "-i", path.join(root, source),
      "-vf", `crop=${crop},scale=${width}:-2:flags=lanczos`,
      temp,
    ]);
    copyFileSync(temp, path.join(root, output));
    console.log("cropped", output);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
