import { app, dialog, shell } from "electron";
import path from "node:path";
import {
  checkForUpdate,
  downloadInstaller,
  installerInstructions,
  type DownloadProgress,
} from "./updates";
import type {
  UpdateDownloadProgress,
  UpdateState,
} from "../src/core/types";
import type { UpdateInfo } from "../src/core/updates";

/**
 * In-app updater state. The main process owns the network call, the download
 * and the hand-off to the OS so the renderer never gets a file path it could
 * turn into an arbitrary installer.
 */
let lastAvailable: UpdateInfo | null = null;
let lastDownload: string | null = null;

export async function checkUpdates(
  channel: "stable" | "beta" = "stable",
): Promise<UpdateState> {
  const currentVersion = app.getVersion();
  try {
    const available = await checkForUpdate(currentVersion, channel);
    lastAvailable = available;
    if (!available) lastDownload = null;
    return {
      currentVersion,
      available,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      currentVersion,
      available: null,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function pendingUpdate(): UpdateInfo | null {
  return lastAvailable;
}

export async function downloadUpdate(
  directory: string,
  emit: (event: UpdateDownloadProgress) => void,
): Promise<string> {
  if (!lastAvailable) throw new Error("Önce güncellemeyi denetleyin");
  const progress = (value: DownloadProgress) =>
    emit({
      received: value.received,
      total: value.total,
      percent: Math.round(value.percent),
      status: "downloading",
    });
  try {
    const file = await downloadInstaller(lastAvailable, directory, progress);
    lastDownload = file;
    emit({
      received: 0,
      total: 0,
      percent: 100,
      status: "ready",
      path: file,
    });
    return file;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit({ received: 0, total: 0, percent: 0, status: "error", message });
    throw error;
  }
}

/**
 * Launch the downloaded installer. Only a path produced by `downloadUpdate` in
 * this session is accepted, so a renderer cannot ask us to run anything else.
 */
export async function installUpdate(installer: unknown): Promise<void> {
  if (typeof installer !== "string" || !lastDownload || path.resolve(installer) !== lastDownload)
    throw new Error("Kurulum dosyası bu oturumda indirilmedi");
  if (!/\.(exe|dmg|appimage|msi)$/i.test(installer))
    throw new Error("Kurulum dosyası türü desteklenmiyor");
  const confirmed = await dialog.showMessageBox({
    type: "question",
    buttons: ["Kurulumu başlat", "Vazgeç"],
    defaultId: 0,
    cancelId: 1,
    title: "CevikEdit güncellemesi",
    message: "Kurulum başlatılsın mı?",
    detail:
      "Kurulum sırasında CevikEdit kapanır. Projeniz otomatik kurtarma ile korunur; kaydetmediğiniz değişiklikler için önce kaydetmeniz önerilir.\n\n" +
      installerInstructions(process.platform),
  });
  if (confirmed.response !== 0) return;
  const error = await shell.openPath(installer);
  if (error) throw new Error(`Kurulum başlatılamadı: ${error}`);
  // Give the installer a moment before the app exits.
  setTimeout(() => app.quit(), 1200);
}

export async function openUpdatePage(): Promise<void> {
  await shell.openExternal(
    lastAvailable?.pageUrl ?? "https://github.com/sonosanli55/CevikEdit/releases",
  );
}
