import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { get } from "node:https";
import path from "node:path";
import {
  UPDATE_PAGE_URL,
  UPDATE_RELEASES_URL,
  isTrustedAssetUrl,
  pickUpdate,
  type UpdateChannel,
  type UpdateInfo,
} from "../src/core/updates";

/**
 * Network side of the updater. Only GitHub over HTTPS is contacted, the response
 * is size-limited, and the downloaded installer must match the advertised size
 * before it is handed to the OS.
 */
const MAX_JSON = 2 * 1024 * 1024;
const MAX_INSTALLER = 600 * 1024 * 1024;

interface FetchOptions {
  /** Injected in tests so no real socket is needed. */
  fetchImpl?: typeof fetch;
}

async function fetchText(url: string, options: FetchOptions): Promise<string> {
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "CevikEdit-Updater",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Güncelleme sunucusu ${response.status} döndü`);
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value?.length ?? 0;
    if (total > MAX_JSON) throw new Error("Güncelleme yanıtı çok büyük");
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

export async function checkForUpdate(
  currentVersion: string,
  channel: UpdateChannel = "stable",
  options: FetchOptions = {},
): Promise<UpdateInfo | null> {
  if (!/^\d+\.\d+\.\d+/.test(currentVersion))
    throw new Error("Geçerli uygulama sürümü okunamadı");
  const text = await fetchText(UPDATE_RELEASES_URL, options);
  let releases: unknown;
  try {
    releases = JSON.parse(text);
  } catch {
    throw new Error("Güncelleme listesi okunamadı");
  }
  if (!Array.isArray(releases)) throw new Error("Güncelleme listesi geçersiz");
  return pickUpdate(currentVersion, releases, channel);
}

export interface DownloadProgress {
  received: number;
  total: number;
  percent: number;
}

/**
 * Stream one installer to disk. Returns the local path. Rejects untrusted hosts,
 * oversized files, short reads and a size mismatch with the release metadata.
 */
export async function downloadInstaller(
  info: UpdateInfo,
  directory: string,
  onProgress: (progress: DownloadProgress) => void,
  options: FetchOptions = {},
): Promise<string> {
  if (!info.asset) throw new Error("Bu sürüm için indirilebilir kurulum yok");
  if (!isTrustedAssetUrl(info.asset.url))
    throw new Error("Güncelleme adresi güvenilir değil");
  const safeName = path
    .basename(info.asset.name)
    .replace(/[^\w.\- ()]/g, "_")
    .slice(0, 120);
  if (!safeName) throw new Error("Güncelleme dosya adı geçersiz");
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, safeName);
  await rm(target, { force: true });
  const failed = new Error("Güncelleme indirilemedi");

  const response = await (options.fetchImpl ?? fetch)(info.asset.url, {
    headers: { "User-Agent": "CevikEdit-Updater" },
    redirect: "follow",
    signal: AbortSignal.timeout(30 * 60_000),
  });
  if (!response.ok) throw new Error(`Güncelleme indirilemedi (${response.status})`);
  const declared =
    Number(response.headers.get("content-length")) || info.asset.size || 0;
  if (declared > MAX_INSTALLER) throw new Error("Güncelleme dosyası çok büyük");
  const reader = response.body?.getReader();
  if (!reader) throw failed;

  const temporary = `${target}.part`;
  const stream = createWriteStream(temporary, { mode: 0o600 });
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.length;
      if (received > MAX_INSTALLER) throw new Error("Güncelleme dosyası çok büyük");
      if (!stream.write(Buffer.from(value)))
        await new Promise<void>((resolve) => stream.once("drain", () => resolve()));
      onProgress({
        received,
        total: declared,
        percent: declared ? Math.min(100, (received / declared) * 100) : 0,
      });
    }
    await new Promise<void>((resolve, reject) => {
      stream.end(() => resolve());
      stream.once("error", reject);
    });
  } catch (error) {
    stream.destroy();
    await rm(temporary, { force: true });
    throw error;
  }
  const written = await stat(temporary).catch(() => null);
  if (!written || written.size < 1024) {
    await rm(temporary, { force: true });
    throw new Error("Güncelleme dosyası boş veya eksik");
  }
  if (info.asset.size && Math.abs(written.size - info.asset.size) > 1024) {
    await rm(temporary, { force: true });
    throw new Error("Güncelleme boyutu bildirilen boyutla uyuşmuyor");
  }
  await rename(temporary, target);
  return target;
}

/** Platform note shown next to the update button. */
export function installerInstructions(platform: NodeJS.Platform): string {
  if (platform === "win32")
    return "Kurulum dosyası indirildi; kurulumu başlatmak için butona basın. Uygulama kurulum sırasında kapanır.";
  if (platform === "darwin")
    return "DMG indirildi; açıp CevikEdit'i Applications klasörüne sürükleyin.";
  return "AppImage indirildi; çalıştırılabilir yapıp çalıştırın.";
}
