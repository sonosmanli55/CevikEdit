// electron-builder runs this before collecting files, including direct CLI builds.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
exports.default = async context => {
  const platform = context.electronPlatformName;
  const projectDir = context.packager.projectDir;
  if (platform === 'darwin') {
    const architecture = { 1: 'x64', 3: 'arm64' }[context.arch];
    if (process.platform !== 'darwin' || architecture !== process.arch)
      throw new Error('Build the macOS installer on a matching native architecture for bundled media tools.');
    execFileSync(process.execPath, [path.join(projectDir, 'scripts/build-media-tools.mjs')], { stdio: 'inherit' });
    return;
  }
  if (platform === 'win32') {
    // The Windows installer ships the same pinned FFmpeg build the app expects.
    execFileSync(process.execPath, [path.join(projectDir, 'scripts/fetch-media-tools-win.mjs')], { stdio: 'inherit' });
  }
};
