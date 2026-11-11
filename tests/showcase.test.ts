import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateShowcase } from "../scripts/generate-showcase";
import { probeFile, runMediaTool } from "../electron/media";

/**
 * End-to-end showcase: one 30-second film that uses templates, keyframes,
 * subtitle split/merge, text animation, loudness normalization and ducking,
 * rendered by the real export pipeline.
 */
describe("weekly showcase film", () => {
  it(
    "renders a 30-second 720p film with audio and a reusable template",
    async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "cevikedit-showcase-"));
      try {
        const result = await generateShowcase(directory);
        expect(result.width).toBe(1280);
        expect(result.height).toBe(720);
        expect(result.duration).toBeGreaterThanOrEqual(29.5);
        expect(result.duration).toBeLessThanOrEqual(31);
        const probe = await probeFile(result.output);
        expect(
          probe.streams.filter((stream) => stream.codec_type === "video"),
        ).toHaveLength(1);
        expect(
          probe.streams.filter((stream) => stream.codec_type === "audio"),
        ).toHaveLength(1);
        // Real audio in the exported mix (not a silent track).
        const pcm = await runMediaTool("ffmpeg", [
          "-v", "error", "-i", result.output, "-t", "2",
          "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1",
        ]);
        let energy = 0;
        for (let index = 0; index < pcm.length; index += 4)
          energy += pcm.readFloatLE(index) ** 2;
        expect(Math.sqrt(energy / (pcm.length / 4))).toBeGreaterThan(0.005);
        const project = JSON.parse(
          await readFile(result.projectPath, "utf8"),
        ) as {
          clips: Array<{ text?: { text: string }; keyframes: unknown[]; fadeIn: number }>;
          tracks: unknown[];
        };
        // Subtitles present, animated and reduced to the merged cue count.
        const textClips = project.clips.filter((clip) => clip.text);
        expect(textClips.length).toBeGreaterThanOrEqual(6);
        expect(
          project.clips.every((clip) => clip.keyframes.length < 400),
        ).toBe(true);
        const template = JSON.parse(
          await readFile(result.templatePath, "utf8"),
        ) as { format: string; media: unknown[]; project: { assets: Array<{ path: string }> } };
        expect(template.format).toBe("cevikedit-template");
        expect(template.media.length).toBe(5);
        expect(
          template.project.assets.every((asset) =>
            asset.path.startsWith("template://media/"),
          ),
        ).toBe(true);
        expect((await stat(result.output)).size).toBeGreaterThan(100_000);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    600_000,
  );
});
