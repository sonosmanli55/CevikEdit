/**
 * Remove regenerable build and test artifacts without touching sources, the
 * packaged installer, user data or any project file.
 *
 * Run: npm run clean
 */
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const targets = [
  ".test-output",
  "release/win-unpacked",
  "dist",
  "dist-electron",
];

async function size(target) {
  try {
    const info = await stat(target);
    if (!info.isDirectory()) return info.size;
    let total = 0;
    for (const entry of await readdir(target, { withFileTypes: true }))
      total += await size(path.join(target, entry.name));
    return total;
  } catch {
    return 0;
  }
}
let freed = 0;
for (const target of targets) {
  const full = path.join(root, target);
  const before = await size(full);
  if (!before) continue;
  await rm(full, { recursive: true, force: true });
  freed += before;
  console.log(`removed ${target} (${(before / 1024 / 1024).toFixed(1)} MB)`);
}
console.log(`freed ${(freed / 1024 / 1024).toFixed(1)} MB`);
