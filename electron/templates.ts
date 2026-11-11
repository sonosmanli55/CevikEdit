import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseTemplate,
  serializeTemplate,
  type CevikEditTemplate,
} from "../src/core/templates";
import type { TemplateStore } from "../src/core/types";

/**
 * User template storage.
 *
 * Files are plain JSON under `<userData>/templates/<id>.cevikedit-template` and are
 * written atomically. Reading a folder never trusts a file: each entry is
 * parsed and validated, and a broken file is reported as a warning instead of
 * failing the whole library.
 */
export const TEMPLATE_ID = /^[A-Za-z0-9_-]{1,100}$/;

export function templatePath(directory: string, id: string): string {
  if (!TEMPLATE_ID.test(id)) throw new Error("Şablon kimliği geçersiz");
  return path.join(directory, `${id}.cevikedit-template`);
}

export async function loadTemplates(directory: string): Promise<TemplateStore> {
  await mkdir(directory, { recursive: true });
  const warnings: string[] = [];
  const templates: CevikEditTemplate[] = [];
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".cevikedit-template"))
    .sort();
  if (names.length > 500)
    warnings.push("Şablon klasöründe çok fazla dosya var; ilk 500 okundu.");
  for (const name of names.slice(0, 500)) {
    try {
      const source = await readFile(path.join(directory, name), "utf8");
      if (source.length > 8 * 1024 * 1024) throw new Error("dosya çok büyük");
      templates.push(parseTemplate(source));
    } catch (error) {
      warnings.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  templates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { templates, warnings };
}

export async function writeTemplate(
  directory: string,
  input: unknown,
): Promise<void> {
  const template = parseTemplate(serializeTemplate(input as CevikEditTemplate));
  await mkdir(directory, { recursive: true });
  const target = templatePath(directory, template.id);
  const temporary = `${target}.${Date.now()}.tmp`;
  await writeFile(temporary, serializeTemplate(template), { mode: 0o600 });
  await rename(temporary, target);
}

export async function removeTemplate(
  directory: string,
  id: unknown,
): Promise<void> {
  if (typeof id !== "string" || !TEMPLATE_ID.test(id))
    throw new Error("Şablon kimliği geçersiz");
  await rm(templatePath(directory, id), { force: true });
}

export async function readTemplateFile(file: string): Promise<CevikEditTemplate> {
  const metadata = await readFile(file);
  if (metadata.length > 8 * 1024 * 1024)
    throw new Error("Şablon dosyası çok büyük");
  return parseTemplate(metadata.toString("utf8"));
}
