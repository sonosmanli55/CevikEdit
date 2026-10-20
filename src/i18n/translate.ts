import { tr } from "./locales/tr";
import { trPatterns } from "./locales/tr-patterns";

/**
 * Characters that mark a string as worth translating: CJK ideographs plus the
 * CJK/full-width punctuation that frequently forms its own DOM text node when
 * JSX splits a label around an input (for example `删除「{name}」？`).
 */
export const CJK =
  /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

export type PatternReplacement = string | ((match: RegExpMatchArray) => string);

const dictionary = new Map<string, string>(
  Object.entries(tr).map(([source, target]) => [source.trim(), target]),
);

/**
 * Translate a single rendered string. Whitespace around a match is preserved so
 * JSX interpolation such as `<span>{count} 秒</span>` keeps its spacing.
 */
export function translateText(input: string): string {
  if (!input || !CJK.test(input)) return input;

  const exact = dictionary.get(input);
  if (exact !== undefined) return exact;

  const trimmed = input.trim();
  if (trimmed !== input) {
    const hit = dictionary.get(trimmed);
    if (hit !== undefined) {
      const start = input.indexOf(trimmed);
      return input.slice(0, start) + hit + input.slice(start + trimmed.length);
    }
  }

  for (const [pattern, replacement] of trPatterns as Array<[RegExp, PatternReplacement]>) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const replaced =
      typeof replacement === "function" ? replacement(match) : trimmed.replace(pattern, replacement);
    const start = input.indexOf(trimmed);
    return input.slice(0, start) + replaced + input.slice(start + trimmed.length);
  }

  return input;
}
