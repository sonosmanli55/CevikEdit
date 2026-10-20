import type { MenuItemConstructorOptions } from "electron";
import { translateText } from "../src/i18n/translate";

export type Locale = "zh" | "tr";

let mainLocale: Locale = "zh";

/**
 * The packaged desktop app ships with the Turkish language pack enabled.
 * Development runs, the desktop test harness and the plugin host keep the
 * original Simplified Chinese strings so existing workflows and assertions
 * stay valid. Set `REACUT_LOCALE=tr` (or `zh`) to force a locale.
 */
export function resolveLocale(isPackaged: boolean, env: NodeJS.ProcessEnv = process.env): Locale {
  const override = env.REACUT_LOCALE;
  if (override === "tr" || override === "zh") return override;
  return isPackaged ? "tr" : "zh";
}

export function setMainLocale(locale: Locale): void {
  mainLocale = locale;
}

export function getMainLocale(): Locale {
  return mainLocale;
}

/** Translate a main-process string when the Turkish locale is active. */
export function tr(text: string): string {
  return mainLocale === "tr" ? translateText(text) : text;
}

/** Translate every label in a native menu template. */
export function translateMenu(
  template: MenuItemConstructorOptions[],
): MenuItemConstructorOptions[] {
  if (mainLocale !== "tr") return template;
  return template.map(item => ({
    ...item,
    label: item.label ? tr(item.label) : item.label,
    submenu: Array.isArray(item.submenu)
      ? translateMenu(item.submenu as MenuItemConstructorOptions[])
      : item.submenu,
  }));
}
