/**
 * In-app update checking and one-click updating.
 *
 * Deliberately dependency-free and offline-first in spirit: the app asks the
 * GitHub Releases API for this repository, compares semantic versions and can
 * download + hand off the new installer. Nothing is uploaded and no media or
 * project data leaves the machine.
 *
 * Pure parts live here so version comparison, asset selection and channel rules
 * are testable without network access.
 */
export type UpdateChannel = "stable" | "beta";

export interface UpdateAsset {
  name: string;
  url: string;
  size: number;
}

export interface UpdateInfo {
  version: string;
  notes: string;
  publishedAt: string;
  channel: UpdateChannel;
  asset?: UpdateAsset;
  pageUrl: string;
}

export const UPDATE_RELEASES_URL =
  "https://api.github.com/repos/sonosmanli55/CevikEdit/releases?per_page=20";
export const UPDATE_PAGE_URL = "https://github.com/sonosmanli55/CevikEdit/releases";

/** `1.2.3`, `v1.2.3`, `1.2.3-beta.1` → comparable numbers. */
export function parseVersion(value: string): {
  numbers: number[];
  prerelease: string;
} {
  const match = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(value.trim());
  if (!match) return { numbers: [0], prerelease: "" };
  return {
    numbers: match[1].split(".").map((part) => Number(part)),
    prerelease: match[2] ?? "",
  };
}

/** Semantic comparison: negative when a < b. Prereleases sort before stable. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.numbers.length, right.numbers.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0);
    if (diff !== 0) return diff;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  // Compare prerelease segments numerically where both are numbers so
  // `beta.10` sorts after `beta.2`.
  const leftParts = left.prerelease.split(".");
  const rightParts = right.prerelease.split(".");
  const segments = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < segments; index += 1) {
    const l = leftParts[index];
    const r = rightParts[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;
    const ln = Number(l);
    const rn = Number(r);
    if (Number.isFinite(ln) && Number.isFinite(rn)) return ln - rn;
    return l < r ? -1 : 1;
  }
  return 0;
}

/** Newer release for the given channel, or null when up to date. */
export function pickUpdate(
  current: string,
  releases: unknown[],
  channel: UpdateChannel = "stable",
): UpdateInfo | null {
  let best: UpdateInfo | null = null;
  for (const raw of releases) {
    if (!raw || typeof raw !== "object") continue;
    const release = raw as Record<string, unknown>;
    if (release.draft === true) continue;
    const tag = typeof release.tag_name === "string" ? release.tag_name : "";
    if (!tag) continue;
    const prerelease = release.prerelease === true;
    if (channel === "stable" && prerelease) continue;
    const info = describe(release, tag, prerelease ? "beta" : "stable");
    if (!info) continue;
    if (compareVersions(info.version, current) <= 0) continue;
    if (!best || compareVersions(info.version, best.version) > 0) best = info;
  }
  return best;
}

function describe(
  release: Record<string, unknown>,
  tag: string,
  channel: UpdateChannel,
): UpdateInfo | null {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asset = pickAsset(assets);
  const pageUrl =
    typeof release.html_url === "string" ? release.html_url : UPDATE_PAGE_URL;
  return {
    version: tag.replace(/^v/, ""),
    notes:
      typeof release.body === "string" ? release.body.slice(0, 20_000) : "",
    publishedAt:
      typeof release.published_at === "string" ? release.published_at : "",
    channel,
    ...(asset ? { asset } : {}),
    pageUrl,
  };
}

/**
 * Only a plain HTTPS URL on GitHub's release CDN is accepted. This keeps a
 * compromised or spoofed response from pointing the updater somewhere else.
 */
export function isTrustedAssetUrl(url: string): boolean {
  if (typeof url !== "string" || url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return (
      parsed.protocol === "https:" &&
      (host === "github.com" ||
        host.endsWith(".github.com") ||
        host === "githubusercontent.com" ||
        host.endsWith(".githubusercontent.com")) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function pickAsset(assets: unknown[]): UpdateAsset | undefined {
  const candidates: UpdateAsset[] = [];
  for (const raw of assets) {
    if (!raw || typeof raw !== "object") continue;
    const asset = raw as Record<string, unknown>;
    const name = typeof asset.name === "string" ? asset.name : "";
    const url =
      typeof asset.browser_download_url === "string"
        ? asset.browser_download_url
        : "";
    const size = typeof asset.size === "number" ? asset.size : 0;
    if (!name || !isTrustedAssetUrl(url)) continue;
    // The release also carries the tiny bootstrap launcher. Downloading that as
    // an "update" would run a launcher nested inside a launcher, so skip it.
    if (/kurucu|bootstrap|setup-?launcher/i.test(name)) continue;
    candidates.push({ name, url, size });
  }
  const byExtension = (extensions: string[]) =>
    candidates.filter((asset) =>
      extensions.some((extension) => asset.name.toLowerCase().endsWith(extension)),
    );
  const installers = byExtension([".exe", ".dmg", ".appimage", ".zip"]);
  // Prefer the named setup/kurulum artifact when the release offers several.
  const named = installers.find((asset) => /setup|kurulum|installer/i.test(asset.name));
  if (named) return named;
  // Otherwise take the largest: the real bundle dwarfs any helper executable.
  const sized = [...installers]
    .filter((asset) => asset.size > 0)
    .sort((a, b) => b.size - a.size)[0];
  return (
    sized ??
    candidates.find((asset) => asset.size > 0) ??
    candidates[0]
  );
}

/** Human summary used by the UI toast/banner. */
export function updateSummary(info: UpdateInfo): string {
  const size = info.asset?.size
    ? ` · ${(info.asset.size / 1024 / 1024).toFixed(0)} MB`
    : "";
  return `Yeni sürüm ${info.version}${size}`;
}
