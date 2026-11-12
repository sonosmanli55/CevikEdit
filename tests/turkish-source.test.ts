import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * CevikEdit ships a single language: Turkish. The UI used to be authored in
 * Simplified Chinese and translated at render time; that pipeline is gone, so
 * the sources themselves must stay free of Chinese text. This guard keeps a
 * future edit from reintroducing the old authoring language (or a stray
 * dictionary entry) without anyone noticing.
 */
const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

const roots = ["src", "electron", "plugin", "site"];
const skipDirs = new Set(["node_modules", "dist", "dist-electron", "assets", "fonts"]);

async function sourceFiles(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await sourceFiles(full, out);
    else if (/\.(ts|tsx|js|mjs|json|html|css|md)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("Turkish-only sources", () => {
  it("has no Chinese characters left in shipped source or site files", async () => {
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of await sourceFiles(path.join(process.cwd(), root))) {
        const text = await readFile(file, "utf8");
        const lines = text.split(/\r?\n/);
        lines.forEach((line, index) => {
          if (CJK.test(line)) {
            offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim().slice(0, 120)}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no longer carries a runtime translation dictionary", async () => {
    await expect(readdir(path.join(process.cwd(), "src", "i18n"))).rejects.toThrow();
  });

  it("keeps the built-in asset catalogue in Turkish", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(process.cwd(), "public", "builtin-assets", "manifest.json"), "utf8"),
    ) as { assets: Array<{ name: string; tags: string[] }> };
    expect(manifest.assets.length).toBeGreaterThan(0);
    for (const asset of manifest.assets) {
      expect(CJK.test(asset.name), asset.name).toBe(false);
      for (const tag of asset.tags) expect(CJK.test(tag), tag).toBe(false);
    }
  });
});
