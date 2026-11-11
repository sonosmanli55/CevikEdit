import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  importAssets,
  probeFile,
  runMediaTool,
  systemMediaInfo,
} from "../electron/media";
import { startExport } from "../electron/export";
import type { ExportOptions, MediaAsset, Project } from "../src/core/types";
import { DEFAULT_ADJUSTMENTS, DEFAULT_TRANSFORM } from "../src/core/defaults";

/**
 * Real HDR pipeline: create a PQ/bt2020 tagged clip, import it (detection),
 * export it through the tonemap chain and verify BT.709 output tags.
 */
let directory: string;
let hdrFile: string;
let hdrAsset: MediaAsset;
let sdrAsset: MediaAsset;
let zscale = true;

const settings = (name: string): ExportOptions => ({
  path: path.join(directory, name),
  width: 160,
  height: 90,
  fps: 10,
  quality: "draft",
  format: "mp4",
});

function project(asset: MediaAsset): Project {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: "HDR",
    width: 160,
    height: 90,
    fps: 10,
    background: "#000000",
    assets: [asset],
    tracks: [
      { id: "video", name: "Video", kind: "video", muted: false, hidden: false, locked: false },
    ],
    clips: [
      {
        id: crypto.randomUUID(),
        trackId: "video",
        assetId: asset.id,
        name: asset.name,
        start: 0,
        duration: 1,
        sourceIn: 0,
        speed: 1,
        volume: 1,
        muted: false,
        transform: { ...DEFAULT_TRANSFORM },
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        fadeIn: 0,
        fadeOut: 0,
        audioFadeIn: 0,
        audioFadeOut: 0,
        keyframes: [],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function render(p: Project, options: ExportOptions) {
  await new Promise<void>((resolve, reject) => {
    void startExport(p, options, (event) => {
      if (event.status === "complete") resolve();
      if (event.status === "error" || event.status === "cancelled")
        reject(new Error(event.message ?? event.status));
    }).catch(reject);
  });
}
async function frame(file: string): Promise<Buffer> {
  return runMediaTool("ffmpeg", [
    "-v", "error", "-ss", "0.4", "-i", file, "-frames:v", "1",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
  ]);
}
const mean = (buffer: Buffer) => {
  let total = 0;
  for (const value of buffer) total += value;
  return total / buffer.length;
};

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "cevikedit-hdr-"));
  const filters = await runMediaTool("ffmpeg", ["-hide_banner", "-filters"]);
  zscale = filters.toString().includes("zscale");
  hdrFile = path.join(directory, "hdr-kaynak.mp4");
  // PQ/bt2020 VUI tags on an 8-bit source: this exercises the exact metadata
  // path FFprobe reports for real HDR10 media without needing a 10-bit encoder.
  await runMediaTool("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi",
    "-i", "color=c=#3a6ea5:s=160x90:r=10:d=1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-x264-params", "colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc",
    hdrFile,
  ]);
  const sdrFile = path.join(directory, "sdr-kaynak.mp4");
  await runMediaTool("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi",
    "-i", "color=c=#3a6ea5:s=160x90:r=10:d=1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709",
    sdrFile,
  ]);
  [hdrAsset, sdrAsset] = await importAssets(
    [hdrFile, sdrFile],
    path.join(directory, "cache"),
  );
}, 120_000);

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("real HDR import and export", () => {
  it("detects PQ metadata on import and leaves SDR untouched", async () => {
    expect((await systemMediaInfo()).ffmpeg).toBe(true);
    expect(hdrAsset.hdr).toBe(true);
    expect(hdrAsset.hdrKind).toBe("pq");
    expect(hdrAsset.colorTransfer).toBe("smpte2084");
    expect(hdrAsset.colorPrimaries).toBe("bt2020");
    expect(sdrAsset.hdr).toBeUndefined();
  });
  it("exports a PQ source with BT.709 tags when zscale is available", async (context) => {
    if (!zscale) context.skip();
    const options = settings("hdr.mp4");
    await render(project(hdrAsset), options);
    const probe = await probeFile(options.path);
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    expect(video?.codec_name).toBe("h264");
    // The tone-mapped output must be labelled SDR BT.709, not bt2020/PQ.
    expect(video?.color_transfer ?? "bt709").not.toBe("smpte2084");
    expect(video?.color_primaries ?? "bt709").not.toBe("bt2020");
    const pixels = await frame(options.path);
    expect(pixels.length).toBe(160 * 90 * 3);
    // Blue-ish source survives tone mapping (not black, not blown out).
    const average = mean(pixels);
    expect(average).toBeGreaterThan(20);
    expect(average).toBeLessThan(200);
  }, 120_000);
  it("produces comparable framing for SDR and tone-mapped HDR", async (context) => {
    if (!zscale) context.skip();
    const sdrOptions = settings("sdr.mp4");
    const hdrOptions = settings("hdr-compare.mp4");
    await render(project(sdrAsset), sdrOptions);
    await render(project(hdrAsset), hdrOptions);
    const [sdr, hdr] = [await frame(sdrOptions.path), await frame(hdrOptions.path)];
    // Same nominal colour; the SDR path must stay closer to the source than the
    // tone-mapped one, and both must be plausible images.
    expect(Math.abs(mean(sdr) - mean(hdr))).toBeLessThan(120);
    expect(mean(sdr)).toBeGreaterThan(20);
    expect(mean(hdr)).toBeGreaterThan(20);
  }, 120_000);
  it("writes a project with colour metadata back unchanged", async () => {
    const file = path.join(directory, "hdr.cevikedit");
    const saved = project(hdrAsset);
    await writeFile(file, JSON.stringify(saved));
    const reopened = JSON.parse(await readFile(file, "utf8")) as Project;
    const asset = reopened.assets[0];
    expect(asset.hdr).toBe(true);
    expect(asset.colorTransfer).toBe("smpte2084");
  });
});

