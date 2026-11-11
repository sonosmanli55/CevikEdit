/**
 * Compile the tiny bootstrap installer with the .NET Framework compiler that
 * ships with Windows, so the artifact stays small (tens of KB) and needs no
 * extra toolchain.
 *
 * Output: release/CevikEdit-Kurucu.exe
 */
import { execFileSync } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const wpf = "C:\\Windows\\Microsoft.NET\\Framework64";
const candidates = [
  path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
  path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
];
const csc = candidates.find((file) => existsSync(file));
void wpf;
if (!csc)
  throw new Error(
    "csc.exe bulunamadı. Windows .NET Framework 4.x gerekli; bootstrap yalnızca Windows'ta derlenir.",
  );

const outDir = path.join(root, "release");
await mkdir(outDir, { recursive: true });
const target = path.join(outDir, "CevikEdit-Kurucu.exe");

execFileSync(
  csc,
  [
    "/nologo",
    "/target:winexe",
    "/platform:anycpu",
    "/optimize+",
    "/out:" + target,
    "/win32icon:" + path.join(root, "build", "icon.ico"),
    "/reference:System.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Windows.Forms.dll",
    path.join(root, "bootstrap", "CevikEditSetup.cs"),
  ],
  { stdio: "inherit" },
);

const info = await stat(target);
console.log(`bootstrap: ${path.relative(root, target)} (${(info.size / 1024).toFixed(1)} KB)`);
if (info.size > 1024 * 1024)
  throw new Error("Bootstrap 1 MB sınırını aştı; bağımlılıkları azaltın.");
