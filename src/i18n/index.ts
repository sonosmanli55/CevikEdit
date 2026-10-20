import { CJK, translateText } from "./translate";

export { translateText } from "./translate";

const ATTRS = ["title", "placeholder", "aria-label", "alt", "label", "aria-valuetext"];

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "INPUT"]);

function shouldSkip(element: Element): boolean {
  if (SKIP_TAGS.has(element.tagName)) return true;
  if (element.closest("[data-no-i18n]")) return true;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  return false;
}

function translateElementAttributes(element: Element): void {
  for (const attribute of ATTRS) {
    const value = element.getAttribute(attribute);
    if (!value || !CJK.test(value)) continue;
    const next = translateText(value);
    if (next !== value) element.setAttribute(attribute, next);
  }
}

function translateNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue;
    if (!text || !CJK.test(text)) return;
    const parent = node.parentElement;
    if (parent && shouldSkip(parent)) return;
    const next = translateText(text);
    if (next !== text) node.nodeValue = next;
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  translateElementAttributes(element);
  if (shouldSkip(element)) return;
  for (const child of Array.from(element.childNodes)) translateNode(child);
}

let observer: MutationObserver | null = null;

/** Translate the current document and keep translating future renders. */
export function installI18n(root?: ParentNode): void {
  const target = root ?? document.documentElement;
  translateNode(target as unknown as Node);

  if (root) return;
  if (observer) return;

  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") {
        translateNode(record.target);
        continue;
      }
      if (record.type === "attributes") {
        translateElementAttributes(record.target as Element);
        continue;
      }
      for (const added of Array.from(record.addedNodes)) translateNode(added);
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}

/** Stop translating future renders (already applied text is left as is). */
export function uninstallI18n(): void {
  observer?.disconnect();
  observer = null;
}
