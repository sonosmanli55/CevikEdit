/**
 * Render the landing page in a real Electron window and capture desktop and
 * mobile screenshots, plus report console errors and layout overflow.
 *
 * Run: npx tsx tests/site-visual.ts   (expects `node scripts/serve-site.mjs site 4319`)
 */
import { _electron as electron, expect } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const output = path.join(root, ".test-output", "site-visual");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// The page is served from this process so the check never depends on a
// separately started background server.
const port = 4321;
const server = spawn(process.execPath, ["scripts/serve-site.mjs", "site", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("site server did not start")), 10_000);
  server.stdout.on("data", (chunk) => {
    if (String(chunk).includes("site on")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.once("error", reject);
});

const url = `http://127.0.0.1:${port}/`;
const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
delete env.ELECTRON_RUN_AS_NODE;

const app = await electron.launch({
  args: [path.join(root, "dist-electron/main.cjs"), "--site-preview"],
  env,
});
const errors: string[] = [];
const pages: string[] = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  const shoot = async (name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(900);
    // Reveal everything and force lazy images to load before the capture.
    await page.evaluate(async () => {
      document.querySelectorAll("[data-reveal]").forEach((node) => node.classList.add("is-visible"));
      document.querySelectorAll("img[loading='lazy']").forEach((img) => img.setAttribute("loading", "eager"));
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 500));
      window.scrollTo(0, 0);
    });
    await page.waitForFunction(
      () => [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      undefined,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(400);
    const file = path.join(output, `${name}.png`);
    await page.screenshot({ path: file, fullPage: name !== "hero" });
    pages.push(file);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${name} horizontal overflow`).toBeLessThanOrEqual(1);
  };

  await shoot("hero", 1440, 900);
  await shoot("desktop", 1440, 900);
  await shoot("mobile", 390, 844);

  // The signature interaction: dragging handle 1 must change the readout.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(400);
  const before = await page.locator("#curve-values").textContent();
  const handle = page.locator("#handle-1");
  await handle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 46, box.y - 34, { steps: 12 });
  await page.mouse.up();
  const after = await page.locator("#curve-values").textContent();
  if (before === after) throw new Error("curve drag did not change values");

  // Presets work and mark themselves pressed.
  await page.getByRole("button", { name: "Geri çek", exact: true }).click();
  await expect(page.getByRole("button", { name: "Geri çek", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Keyboard support on a handle.
  await page.locator("#handle-2").focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");

  // Download links resolve to the release repository (the hero primary link is
  // an in-page anchor down to the install section).
  for (const selector of ["a[data-bootstrap]", "a[data-installer]"]) {
    const hrefs = await page.locator(selector).evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href") ?? ""),
    );
    if (!hrefs.length) throw new Error(`${selector} missing`);
    const external = hrefs.filter((href) => href.startsWith("http"));
    if (!external.length) throw new Error(`${selector} has no external download`);
    for (const href of external)
      if (!href.startsWith("https://github.com/sonosanli55/CevikEdit"))
        throw new Error(`${selector} href is ${href}`);
  }

  await expect(page.locator("h1")).toContainText("bilgisayarınızda");
  console.log(
    JSON.stringify(
      {
        pages: pages.map((file) => path.relative(root, file)),
        curve: { before, after },
        errors,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify({ passedAt: new Date().toISOString(), url, pages, curve: { before, after }, errors }, null, 2),
  );
} finally {
  await app.close();
  server.kill();
}
