import type { MenuItemConstructorOptions } from "electron";
import { translateText } from "../src/i18n/translate";

export type Locale = "zh" | "tr";

let mainLocale: Locale = "tr";

/**
 * The desktop app is Turkish by default. Simplified Chinese remains available
 * as the authoring source locale for the existing UI regression harnesses via
 * `CEVIKEDIT_LOCALE=zh`; users never need to switch the app to Chinese.
 */
export function resolveLocale(_isPackaged: boolean, env: NodeJS.ProcessEnv = process.env): Locale {
  return env.CEVIKEDIT_LOCALE === "zh" ? "zh" : "tr";
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
