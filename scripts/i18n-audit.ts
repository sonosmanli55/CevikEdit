/**
 * Turkish language-pack coverage audit.
 *
 * Extracts every Simplified Chinese string that can reach the DOM — quoted
 * literals and JSX text children — and reports the ones `translateText` still
 * leaves untranslated. Run it after changing UI copy:
 *
 *   npx tsx scripts/i18n-audit.ts
 *
 * Findings are written to `.test-output/i18n-audit.txt` (UTF-8, so the CJK is
 * readable on Windows consoles too). An empty report means full coverage of the
 * statically extractable strings; strings assembled at runtime are covered by
 * the pattern list in `src/i18n/locales/tr-patterns.ts`.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { translateText } from "../src/i18n/translate";

const root = process.cwd();

/** Extract quoted string literals (minus template holes) and JSX text runs. */
function extract(source: string) {
  const literals = new Set<string>();
  const jsxText = new Set<string>();
  let index = 0;
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;
  let buffer = "";
  let current: string | null = null;

  const pushLiteral = () => {
    if (!quote || !buffer.trim()) return;
    if (quote === "`" && buffer.includes("$")) return;
    if (translateNeeded(buffer.trim())) literals.add(buffer.trim());
  };
  const flush = () => {
    if (current === null) return;
    const joined = current
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    // Dropping everything before the last `>` removes JS code that the run
    // scan picked up from comparison operators and arrow functions.
    const tail = joined.split(">").slice(-1)[0].trim();
    const start = joined.replace(/^[\s\S]*[>};)=,|&](?=\s*[\u4e00-\u9fff])/, "").trim();
    for (const candidate of [joined, start, tail])
      if (candidate && translateNeeded(candidate)) jsxText.add(candidate);
    current = null;
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      index += 1;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }
    if (quote) {
      if (char === "\\") {
        const escape = source[index + 1];
        const map: Record<string, string> = {
          n: "\n",
          t: "\t",
          r: "\r",
          '"': '"',
          "'": "'",
          "`": "`",
          "\\": "\\",
        };
        buffer += map[escape] ?? escape ?? "";
        index += 2;
        continue;
      }
      if (char === quote) {
        pushLiteral();
        quote = null;
        buffer = "";
        index += 1;
        continue;
      }
      buffer += char;
      index += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      buffer = "";
      index += 1;
      continue;
    }
    if (current !== null) {
      if (char === "<" || char === "{") {
        flush();
        index += 1;
        continue;
      }
      current += char;
      index += 1;
      continue;
    }
    if (char === ">") {
      current = "";
      index += 1;
      continue;
    }
    index += 1;
  }
  flush();
  return { literals, jsxText };
}

/** True when the string still contains Chinese after translation. */
function translateNeeded(value: string): boolean {
  return /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(value) &&
    translateText(value) === value;
}

/** Code that leaked into an extracted run rather than rendered UI copy. */
const codeNoise = /[;{}]|=>|^(set|void|detail|const|return|import|export)\b/;

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      files.push(...(await walk(full)));
    } else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
};

const files = (await walk(path.join(root, "src"))).filter(
  (file) => !path.relative(root, file).startsWith(`src${path.sep}i18n`),
);
const missingLiteral = new Map<string, string[]>();
const missingJsx = new Map<string, string[]>();

/**
 * Independent regex pass over single-line string literals. The state machine
 * above tracks braces and can lose a literal after an unusual JSX run; this
 * pass is deliberately dumb so a missed string cannot hide from the audit.
 */
function quotedLiterals(source: string): Set<string> {
  const found = new Set<string>();
  const decode = (value: string) =>
    value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, escape: string) =>
      escape.startsWith("u")
        ? String.fromCharCode(parseInt(escape.slice(1), 16))
        : ({ n: "\n", t: "\t", r: "\r" } as Record<string, string>)[escape] ?? escape,
    );
  for (const match of source.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.){2,300})\1/g)) {
    const raw = match[2];
    if (raw.includes("${")) continue;
    const value = decode(raw).trim();
    if (!value || codeNoise.test(value)) continue;
    if (translateNeeded(value)) found.add(value);
  }
  return found;
}

for (const file of files) {
  const source = await readFile(file, "utf8");
  const relative = path.relative(root, file);
  const { literals, jsxText } = extract(source);
  for (const value of quotedLiterals(source)) literals.add(value);
  const candidates = [...jsxText].filter((value) => !codeNoise.test(value));
  // Multi-line JSX runs also produce their own lines; keep only the longest.
  const pruned = candidates.filter(
    (value) => !candidates.some((other) => other !== value && other.startsWith(value)),
  );
  for (const value of literals)
    missingLiteral.set(value, [...(missingLiteral.get(value) ?? []), relative]);
  for (const value of pruned)
    if (!candidates.some((other) => other !== value && other.startsWith(value)))
      missingJsx.set(value, [...(missingJsx.get(value) ?? []), relative]);
}

const report = [
  `# untranslated literals: ${missingLiteral.size}`,
  ...[...missingLiteral]
    .sort()
    .map(([value, where]) => `  ${value}   <- ${[...new Set(where)].join(", ")}`),
  "",
  `# untranslated JSX text: ${missingJsx.size}`,
  ...[...missingJsx]
    .sort()
    .map(([value, where]) => `  ${value}   <- ${[...new Set(where)].join(", ")}`),
  "",
];
await mkdir(path.join(root, ".test-output"), { recursive: true });
const output = path.join(root, ".test-output", "i18n-audit.txt");
await writeFile(output, report.join("\n"), "utf8");
console.log(`untranslated: ${missingLiteral.size} literals, ${missingJsx.size} JSX texts`);
console.log(`report: ${output}`);
process.exitCode = missingLiteral.size + missingJsx.size > 0 ? 1 : 0;
