/**
 * Seed `.cache/media-tools/win32-<arch>` with the pinned, unmodified Gyan.dev
 * FFmpeg 8.0 essentials build (`ffmpeg.exe` + `ffprobe.exe`) so the Windows
 * installer can ship media tools the same way the macOS DMG does.
 *
 * Pinned release + SHA-256 keep the download reproducible; nothing is fetched
 * at runtime by the app itself.
 */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "8.0";
const target = `win32-${process.arch === "arm64" ? "arm64" : "x64"}`;
const archiveName = `ffmpeg-${version}-essentials_build.zip`;
const url = `https://github.com/GyanD/codexffmpeg/releases/download/${version}/${archiveName}`;
const sha256 =
  process.env.CEVIKEDIT_WIN_FFMPEG_SHA256 ||
  // Matches the `digest` field GitHub publishes for this pinned release asset.
  "647e467caf82b9fa200a562769b5ff4d736aaf725804ed2c64ea9752106fa569";
const downloads = path.join(root, ".cache", "media-tools");
const output = path.join(root, "media-tools", target);
const archive = path.join(downloads, archiveName);

const digest = (data) => createHash("sha256").update(data).digest("hex");

await fs.mkdir(downloads, { recursive: true });
let bytes;
try {
  bytes = await fs.readFile(archive);
} catch {
  console.log(`media-tools: indiriliyor ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`FFmpeg indirilemedi: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(archive, bytes);
}
const actual = digest(bytes);
if (actual !== sha256)
  throw new Error(
    `FFmpeg arşiv özeti uyuşmuyor.\nbeklenen: ${sha256}\ngerçek:   ${actual}`,
  );

// Extract only the two executables and the license using PowerShell's
// built-in zip support; no extra archive tool is required.
const stage = path.join(downloads, `${target}-extract`);
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(stage, { recursive: true });
const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('${archive.replace(/'/g, "''")}')
try {
  foreach ($entry in $zip.Entries) {
    if ($entry.FullName -match '^ffmpeg-${version}-essentials_build/bin/(ffmpeg|ffprobe)\\.exe$' -or
        $entry.FullName -match '^ffmpeg-${version}-essentials_build/(LICENSE|README\\.txt)$') {
      $name = Split-Path $entry.FullName -Leaf
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path '${stage.replace(/'/g, "''")}' $name), $true)
    }
  }
} finally { $zip.Dispose() }
`;
const result = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-NonInteractive", "-Command", script],
  { encoding: "utf8" },
);
if (result.status !== 0)
  throw new Error(`Arşiv açılamadı: ${result.stderr || result.stdout}`);

await fs.mkdir(output, { recursive: true });
const tools = [];
for (const name of ["ffmpeg.exe", "ffprobe.exe"]) {
  const file = path.join(stage, name);
  const data = await fs.readFile(file);
  await fs.writeFile(path.join(output, name), data);
  tools.push({ name, size: data.length, sha256: digest(data) });
}
for (const extra of ["LICENSE", "README.txt"]) {
  try {
    await fs.copyFile(path.join(stage, extra), path.join(output, extra));
  } catch {
    /* optional */
  }
}
const recipe = await fs.readFile(fileURLToPath(import.meta.url));
await fs.writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(
    {
      target,
      source: { project: "FFmpeg", version, vendor: "Gyan.dev", url, archiveSHA256: sha256 },
      license: "GPL-2.0-or-later (build includes libx264)",
      recipeSHA256: digest(recipe),
      tools,
    },
    null,
    2,
  ) + "\n",
);
console.log(`media-tools: ${target} hazır (${tools.map((t) => `${t.name} ${(t.size / 1048576).toFixed(1)} MB`).join(", ")})`);
