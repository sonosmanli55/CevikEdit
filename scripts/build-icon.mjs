/**
 * Build every application icon from one 1024×1024 source.
 *
 * The source artwork has white corners around a rounded tile, so the script
 * applies a squircle-ish alpha mask, then writes:
 *  - build/icon.png        (1024 PNG, transparent corners)
 *  - build/icon.ico        (multi-size PNG entries: 16…256)
 *  - build/icon.icns       (macOS: 128/256/512/1024 PNG entries)
 *  - public/icons/cevikedit.png  (runtime/README preview)
 *
 * Run: npm run icons
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const root = process.cwd();
const SIZE = 1024;
/** Corner radius as a fraction of the tile; keeps the artwork's own rounding. */
const RADIUS = 0.185;

const source = await loadImage(
  path.join(root, process.env.CEVIKEDIT_ICON_SOURCE ?? "build/cevikedit-source.webp"),
);

function masked() {
  const canvas = createCanvas(SIZE, SIZE);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, SIZE, SIZE);
  const radius = Math.round(SIZE * RADIUS);
  // Rounded rectangle path, then clip before drawing the artwork.
  context.beginPath();
  context.moveTo(radius, 0);
  context.lineTo(SIZE - radius, 0);
  context.quadraticCurveTo(SIZE, 0, SIZE, radius);
  context.lineTo(SIZE, SIZE - radius);
  context.quadraticCurveTo(SIZE, SIZE, SIZE - radius, SIZE);
  context.lineTo(radius, SIZE);
  context.quadraticCurveTo(0, SIZE, 0, SIZE - radius);
  context.lineTo(0, radius);
  context.quadraticCurveTo(0, 0, radius, 0);
  context.closePath();
  context.clip();
  context.drawImage(source, 0, 0, SIZE, SIZE);
  return canvas;
}

const base = masked();

async function png(size) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(base, 0, 0, size, size);
  return canvas.toBuffer("image/png");
}

/** Windows ICO with PNG-compressed entries (Vista and later). */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(16 * entries.length);
  let offset = 6 + directory.length;
  entries.forEach((entry, index) => {
    const at = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at + 1);
    directory.writeUInt8(0, at + 2);
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(entry.data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.data.length;
  });
  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
}

/** macOS ICNS with PNG payloads (ic07/ic08/ic09/ic10). */
function icns(entries) {
  const chunks = entries.map(({ type, data }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

const build = path.join(root, "build");
await mkdir(build, { recursive: true });
const publicIcons = path.join(root, "public", "icons");
await mkdir(publicIcons, { recursive: true });

const full = await png(1024);
await writeFile(path.join(build, "icon.png"), full);
await writeFile(path.join(publicIcons, "cevikedit.png"), full);

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoEntries = [];
for (const size of icoSizes) icoEntries.push({ size, data: await png(size) });
await writeFile(path.join(build, "icon.ico"), ico(icoEntries));

const icnsEntries = [];
for (const [type, size] of [
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
])
  icnsEntries.push({ type, data: await png(size) });
await writeFile(path.join(build, "icon.icns"), icns(icnsEntries));

// Keep the macOS iconset folder in sync for anyone rebuilding with iconutil.
const iconset = path.join(build, "icon.iconset");
await mkdir(iconset, { recursive: true });
for (const [name, size] of [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
])
  await writeFile(path.join(iconset, name), await png(size));

console.log("icons written:", ["build/icon.png", "build/icon.ico", "build/icon.icns", "public/icons/cevikedit.png"].join(", "));
console.log("ico bytes", (await readFile(path.join(build, "icon.ico"))).length);
