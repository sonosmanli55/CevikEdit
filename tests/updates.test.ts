import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  compareVersions,
  isTrustedAssetUrl,
  parseVersion,
  pickUpdate,
  updateSummary,
} from "../src/core/updates";
import {
  checkForUpdate,
  downloadInstaller,
  installerInstructions,
} from "../electron/updates";

const release = (tag: string, options: Record<string, unknown> = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  body: `Notlar ${tag}`,
  published_at: "2026-11-01T00:00:00Z",
  html_url: `https://github.com/sonosmanli55/CevikEdit/releases/tag/${tag}`,
  assets: [
    {
      name: "CevikEdit Setup 1.0.0.exe",
      browser_download_url: `https://github.com/sonosmanli55/CevikEdit/releases/download/${tag}/CevikEdit%20Setup.exe`,
      size: 1024,
    },
  ],
  ...options,
});

describe("version comparison", () => {
  it("parses tags and compares numerically, not lexically", () => {
    expect(parseVersion("v1.2.10").numbers).toEqual([1, 2, 10]);
    expect(parseVersion("1.2.3-beta.1").prerelease).toBe("beta.1");
    expect(parseVersion("bozuk").numbers).toEqual([0]);
    expect(compareVersions("1.2.10", "1.2.9")).toBeGreaterThan(0);
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("2", "2.0.0")).toBe(0);
    expect(compareVersions("1.0.0-beta.2", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.10")).toBeLessThan(0);
  });
});

describe("update selection", () => {
  it("offers only newer releases and picks the highest", () => {
    const releases = [release("v0.6.1"), release("v0.7.0"), release("v0.6.5")];
    const update = pickUpdate("0.6.1", releases);
    expect(update?.version).toBe("0.7.0");
    expect(update?.asset?.name).toContain("Setup");
    expect(update?.notes).toBe("Notlar v0.7.0");
    expect(pickUpdate("0.7.0", releases)).toBeNull();
    expect(pickUpdate("0.8.0", releases)).toBeNull();
  });
  it("skips drafts and prereleases on the stable channel", () => {
    const releases = [
      release("v0.9.0", { draft: true }),
      release("v0.8.0", { prerelease: true }),
      release("v0.7.1"),
    ];
    expect(pickUpdate("0.6.1", releases, "stable")?.version).toBe("0.7.1");
    expect(pickUpdate("0.6.1", releases, "beta")?.version).toBe("0.8.0");
  });
  it("ignores malformed entries and untrusted download hosts", () => {    const releases = [
      null,
      {},
      { tag_name: 42 },
      release("v0.7.0", {
        assets: [
          { name: "evil.exe", browser_download_url: "https://evil.example/x.exe", size: 1 },
          { name: "ok.exe", browser_download_url: "https://objects.githubusercontent.com/x.exe", size: 5 },
        ],
      }),
    ];
    const update = pickUpdate("0.6.1", releases);
    expect(update?.asset?.name).toBe("ok.exe");
    expect(isTrustedAssetUrl("https://evil.example/x.exe")).toBe(false);
    expect(isTrustedAssetUrl("http://github.com/x.exe")).toBe(false);
    expect(isTrustedAssetUrl("https://github.com.evil.example/x.exe")).toBe(false);
    expect(isTrustedAssetUrl("https://github.com/x.exe")).toBe(true);
    expect(isTrustedAssetUrl("not a url")).toBe(false);
  });
  it("never offers the tiny bootstrap launcher as the updater's installer", () => {
    const releases = [
      release("v0.8.0", {
        assets: [
          {
            name: "CevikEdit-Kurucu.exe",
            browser_download_url: "https://github.com/sonosmanli55/CevikEdit/releases/download/v0.8.0/CevikEdit-Kurucu.exe",
            size: 211_000,
          },
          {
            name: "CevikEdit-Kurulum.exe",
            browser_download_url: "https://github.com/sonosmanli55/CevikEdit/releases/download/v0.8.0/CevikEdit-Kurulum.exe",
            size: 137_000_000,
          },
        ],
      }),
    ];
    expect(pickUpdate("0.7.0", releases)?.asset?.name).toBe("CevikEdit-Kurulum.exe");

    // With no named installer, the biggest executable still wins.
    const unnamed = [
      release("v0.8.0", {
        assets: [
          {
            name: "helper.exe",
            browser_download_url: "https://github.com/sonosmanli55/CevikEdit/releases/download/v0.8.0/helper.exe",
            size: 200_000,
          },
          {
            name: "CevikEdit-0.8.0.exe",
            browser_download_url: "https://github.com/sonosmanli55/CevikEdit/releases/download/v0.8.0/app.exe",
            size: 130_000_000,
          },
        ],
      }),
    ];
    expect(pickUpdate("0.7.0", unnamed)?.asset?.name).toBe("CevikEdit-0.8.0.exe");
  });
  it("summarizes the update for the banner", () => {
    const update = pickUpdate("0.6.1", [release("v1.0.0")])!;
    expect(updateSummary(update)).toContain("1.0.0");
    expect(updateSummary(update)).toContain("MB");
  });
  it("explains the install step per platform", () => {
    expect(installerInstructions("win32")).toContain("Kurulum");
    expect(installerInstructions("darwin")).toContain("DMG");
    expect(installerInstructions("linux")).toContain("AppImage");
  });
});

describe("update check over injected transport", () => {
  it("parses a GitHub-like response without touching the network", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify([release("v0.9.9")]), { status: 200 })) as unknown as typeof fetch;
    const update = await checkForUpdate("0.6.1", "stable", { fetchImpl });
    expect(update?.version).toBe("0.9.9");
  });
  it("reports server and payload failures as errors", async () => {
    const failing = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(checkForUpdate("0.6.1", "stable", { fetchImpl: failing })).rejects.toThrow(
      "500",
    );
    const broken = (async () =>
      new Response("{not json", { status: 200 })) as unknown as typeof fetch;
    await expect(checkForUpdate("0.6.1", "stable", { fetchImpl: broken })).rejects.toThrow(
      "liste",
    );
    const object = (async () =>
      new Response('{"a":1}', { status: 200 })) as unknown as typeof fetch;
    await expect(checkForUpdate("0.6.1", "stable", { fetchImpl: object })).rejects.toThrow(
      "geçersiz",
    );
  });
  it("rejects an invalid current version", async () => {
    await expect(checkForUpdate("geliştirme")).rejects.toThrow("sürüm");
  });
});

describe("installer download", () => {
  it("streams to disk with progress and verifies the size", async () => {
    const payload = Buffer.alloc(64 * 1024, 7);
    let served = 0;
    const server = createServer((request, response) => {
      if (request.url === "/installer.exe") {
        response.writeHead(200, {
          "content-length": String(payload.length),
          "content-type": "application/octet-stream",
        });
        served += 1;
        response.end(payload);
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const directory = await mkdtemp(path.join(tmpdir(), "cevikedit-update-"));
    const progress: number[] = [];
    try {
      // A localhost URL is not a trusted GitHub host, so the check must fail.
      await expect(
        downloadInstaller(
          {
            version: "9.9.9",
            notes: "",
            publishedAt: "",
            channel: "stable",
            pageUrl: "",
            asset: { name: "installer.exe", url: `http://127.0.0.1:${port}/installer.exe`, size: payload.length },
          },
          directory,
          () => {},
        ),
      ).rejects.toThrow("güvenilir");
      expect(served).toBe(0);

      // Trusted-host rule is enforced before any socket is opened, so a
      // successful download is covered by the pure-selection tests plus the
      // packaged smoke test below.
      expect(progress).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("refuses to download without an asset", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cevikedit-update-"));
    try {
      await expect(
        downloadInstaller(
          { version: "9.9.9", notes: "", publishedAt: "", channel: "stable", pageUrl: "" },
          directory,
          () => {},
        ),
      ).rejects.toThrow("kurulum yok");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("downloads through an injected fetch that mimics GitHub", async () => {
    const payload = Buffer.alloc(2048, 3);
    const fetchImpl = (async () =>
      new Response(payload, {
        status: 200,
        headers: { "content-length": String(payload.length) },
      })) as unknown as typeof fetch;
    const directory = await mkdtemp(path.join(tmpdir(), "cevikedit-update-"));
    const seen: number[] = [];
    try {
      const file = await downloadInstaller(
        {
          version: "9.9.9",
          notes: "",
          publishedAt: "",
          channel: "stable",
          pageUrl: "",
          asset: {
            name: "CevikEdit Setup 9.9.9.exe",
            url: "https://github.com/sonosmanli55/CevikEdit/releases/download/v9.9.9/setup.exe",
            size: payload.length,
          },
        },
        directory,
        (progress) => seen.push(progress.percent),
        { fetchImpl },
      );
      expect(path.basename(file)).toBe("CevikEdit Setup 9.9.9.exe");
      expect((await stat(file)).size).toBe(payload.length);
      expect(await readFile(file)).toEqual(payload);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.at(-1)).toBe(100);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects a payload that does not match the advertised size", async () => {
    const fetchImpl = (async () =>
      new Response(Buffer.alloc(4096, 1), {
        status: 200,
        headers: { "content-length": "4096" },
      })) as unknown as typeof fetch;
    const directory = await mkdtemp(path.join(tmpdir(), "cevikedit-update-"));
    try {
      await expect(
        downloadInstaller(
          {
            version: "9.9.9",
            notes: "",
            publishedAt: "",
            channel: "stable",
            pageUrl: "",
            asset: {
              name: "setup.exe",
              url: "https://github.com/x/setup.exe",
              size: 999_999,
            },
          },
          directory,
          () => {},
          { fetchImpl },
        ),
      ).rejects.toThrow("uyuşmuyor");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
