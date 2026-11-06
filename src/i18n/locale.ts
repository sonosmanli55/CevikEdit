import { translateText } from "./translate";

/**
 * Locale resolution order:
 *  1. `?locale=` query parameter (handy for the browser preview and for QA),
 *  2. the locale negotiated by the Electron main process,
 *  3. Turkish, the product's shipped language.
 */
export function activeLocale(): string {
  if (typeof window === "undefined") return "tr";
  const fromQuery = new URLSearchParams(window.location.search).get("locale");
  if (fromQuery) return fromQuery;
  return window.reacutLocale ?? "tr";
}

/**
 * Translate a string that lives in core data (default project and clip names,
 * default text content, ...) rather than in JSX. Outside the Turkish locale the
 * authoring-language string is returned unchanged.
 */
export function t(source: string): string {
  return activeLocale() === "tr" ? translateText(source) : source;
}
