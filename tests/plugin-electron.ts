import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const output = path.join(root, '.test-output/plugin-electron');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const binary = process.env.CEVIKEDIT_TEST_APP;
const launcher = process.env.CEVIKEDIT_TEST_LAUNCHER;
const env: NodeJS.ProcessEnv = { ...process.env, CEVIKEDIT_USER_DATA: path.join(output, 'user-data'), VITE_DEV_SERVER_URL: '' };
if (binary) { env.PATH = ''; delete env.CEVIKEDIT_FFMPEG; delete env.CEVIKEDIT_FFPROBE; }
if (launcher && binary) env.CEVIKEDIT_APP = binary;
const child = spawn(launcher ? (process.env.CEVIKEDIT_TEST_PYTHON || '/usr/bin/python3') : binary || path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  launcher ? [launcher] : binary ? ['--cevikedit-plugin'] : [root, '--cevikedit-plugin'],
  { env, stdio: ['pipe','pipe','pipe'] });
let errors = '';
child.stderr.on('data', b => { errors += b.toString(); });
let nextId = 0;
const pending = new Map<number, { resolve: (r: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
createInterface({ input: child.stdout }).on('line', line => {
  try { const r = JSON.parse(line); const item = pending.get(r.id); if (!item) return; clearTimeout(item.timer); pending.delete(r.id); r.error ? item.reject(new Error(JSON.stringify(r.error))) : item.resolve(r.result); } catch { /* Electron logging */ }
});
const rpc = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out ${method}: ${errors.slice(-1000)}`)); }, 70000);
  pending.set(id, { resolve, reject, timer });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = (name: string, args: object = {}) => rpc('tools/call', { name, arguments: args });
const checks: string[] = [];
try {
  const init = await rpc('initialize', { protocolVersion: '2025-11-25', clientInfo: { name: 'CevikEdit test', version: '1' }, capabilities: {} });
  assert.equal(init.serverInfo.name, 'cevikedit');
  const tools = (await rpc('tools/list')).tools;
  assert.equal(tools.length, 9);
  assert.deepEqual(tools.find((t: any) => t.name === 'cevikedit_frame')._meta.ui.visibility, ['app']);
  const resource = await rpc('resources/read', { uri: 'ui://cevikedit/editor-v1.html' });
  assert.match(resource.contents[0].text, /中文 \/ 粘贴/);
  assert.equal(resource.contents[0]._meta['openai/ui'].preferredDisplayMode, 'fullscreen');
  checks.push('MCP initialization, tools, app-only visibility, bundled fullscreen resource');
  let state = (await call('cevikedit_open')).structuredContent;
  assert(state && state.clips.length === 0);
  const firstRevision = state.revision;
  let result = await call('cevikedit_edit', { revision: firstRevision, actions: [
    { type: 'setProject', name: 'Codex 插件验收', width: 640, height: 360 },
    { type: 'addText', text: '在 Codex 内剪辑', start: 0, duration: 5, fontSize: 50 },
  ] });
  assert.equal(result.isError, undefined);
  state = result.structuredContent;
  assert.equal(state.clips.length, 1);
  assert.equal(state.name, 'Codex 插件验收');
  assert((await call('cevikedit_edit', { revision: firstRevision, actions: [{ type: 'deleteClip', clipId: state.clips[0].id }] })).isError);
  assert((await call('cevikedit_edit', { revision: state.revision, actions: [{ type: 'setProject', name: 'Must roll back' }, { type: 'execute', code: 'bad' }] })).isError);
  assert.equal((await call('cevikedit_state')).structuredContent.name, 'Codex 插件验收');
  assert.equal((await call('cevikedit_control', { command: 'undo' })).structuredContent.clips.length, 0);
  state = (await call('cevikedit_control', { command: 'redo' })).structuredContent;
  assert.equal(state.clips.length, 1);
  checks.push('Revision conflict, atomic invalid batch, undo and redo');
  const catalog = await call('cevikedit_catalog');
  assert(catalog.structuredContent.assets.some((a: any) => a.id === 'bg-ocean'));
  state = (await call('cevikedit_import', { builtinId: 'bg-ocean' })).structuredContent;
  assert(state.assets.length === 1);
  state = (await call('cevikedit_edit', { revision: state.revision, actions: [{ type: 'addAsset', assetId: state.assets[0].id, start: 0, duration: 5 }] })).structuredContent;
  assert.equal(state.clips.length, 2);
  assert((await call('cevikedit_import', { paths: ['relative.mp4'] })).isError);
  assert((await call('cevikedit_input', { type: 'mouseDown', x: -1, y: 0 })).isError);
  assert((await call('cevikedit_input', { type: 'key', key: 'x', shell: 'bad' })).isError);
  checks.push('Bundled media import and timeline insert; invalid paths and input rejected');
  await call('cevikedit_control', { command: 'seek', time: 1 });
  await new Promise(r => setTimeout(r, 1200));
  let frame = (await call('cevikedit_frame')).structuredContent;
  assert.equal(frame.width, 1440); assert(frame.data.length > 10000);
  await writeFile(path.join(output, 'editor.jpg'), Buffer.from(frame.data, 'base64'));
  const screenshot = await call('cevikedit_screenshot');
  assert.equal(screenshot.content[0].type, 'image');
  await call('cevikedit_input', { type: 'menu', command: 'export' });
  await new Promise(r => setTimeout(r, 400));
  frame = (await call('cevikedit_frame')).structuredContent;
  await writeFile(path.join(output, 'export.jpg'), Buffer.from(frame.data, 'base64'));
  checks.push('Actual hidden-window editor capture and export dialog via app bridge');
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify({ checks, init, toolNames: tools.map((t: any) => t.name), state }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, output }, null, 2));
} finally {
  child.stdin.end();
  const killer = setTimeout(() => child.kill('SIGKILL'), 10000);
  await new Promise(resolve => child.once('exit', resolve));
  clearTimeout(killer);
  await writeFile(path.join(output, 'stderr.log'), errors);
}

const recovered = JSON.parse(await readFile(path.join(output, 'user-data/autosave.cevikedit'), 'utf8'));
assert.equal(recovered.name, 'Codex 插件验收');
assert.equal(recovered.clips.length, 2);
console.log('Disconnect flushed the latest project and terminated the editor.');
