/** Developer-only local MCP Apps host for manual UI validation; never shipped. */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import path from 'node:path';
const output = path.resolve('.test-output/plugin-harness');
await mkdir(output, { recursive: true });
const child = spawn(path.resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), [process.cwd(), '--cevikedit-plugin'], { env: { ...process.env, CEVIKEDIT_USER_DATA: path.join(output, `user-data-${Date.now()}`) }, stdio: ['pipe','pipe','inherit'] });
let seq = 0;
const pending = new Map<number, (r: any) => void>();
createInterface({ input: child.stdout }).on('line', line => { try { const r = JSON.parse(line); pending.get(r.id)?.(r.result); pending.delete(r.id); } catch {} });
function rpc(method: string, params = {}) { return new Promise<any>(resolve => { const id = ++seq; pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); }); }
const tool = (name: string, args = {}) => rpc('tools/call', { name, arguments: args });
await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'validation', version: '1' } });
let state = (await tool('cevikedit_open')).structuredContent;
if (!state.clips.length) {
  state = (await tool('cevikedit_import', { builtinId: 'bg-ocean' })).structuredContent;
  await tool('cevikedit_edit', { revision: state.revision, actions: [{ type: 'setProject', name: 'MCP App yerel etkileşim kabulü', width: 640, height: 360 }, { type: 'addAsset', assetId: state.assets[0].id, start: 0, duration: 5 }, { type: 'addText', text: 'Codex içinde kurgula', start: 0, duration: 5, fontSize: 48 }] });
}
const ui = (await rpc('resources/read', { uri: 'ui://cevikedit/editor-v1.html' })).contents[0].text;
const js = (await build({ entryPoints: ['tests/plugin-harness-client.ts'], bundle: true, platform: 'browser', format: 'esm', write: false })).outputFiles[0].text;
const token = randomBytes(16).toString('hex'), base = `/${token}/`;
let origin = '';
const server = createServer(async (req, res) => {
  if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || !req.url?.startsWith(base)) { res.writeHead(403).end(); return; }
  if (req.method === 'POST' && req.url === base + 'rpc') {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 100000) { res.writeHead(413).end(); return; } }
    try {
      const p = JSON.parse(body);
      if (!['cevikedit_frame','cevikedit_input'].includes(p.name)) throw new Error('App-only test bridge');
      const result = await tool(p.name, p.arguments);
      if (p.name === 'cevikedit_input') await writeFile(path.join(output, 'state.json'), JSON.stringify((await tool('cevikedit_state')).structuredContent, null, 2));
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
    } catch { res.writeHead(400).end(); }
    return;
  }
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  res.setHeader('Content-Type', req.url === base + 'host.js' ? 'text/javascript' : 'text/html');
  if (req.url === base + 'widget') res.end(await readFile('dist/plugin.html', 'utf8'));
  else if (req.url === base + 'host.js') res.end(js);
  else if (req.url === base) res.end('<!doctype html><meta charset="utf-8"><title>CevikEdit MCP App — yerel doğrulama ana makinesi</title><style>body{margin:0;background:#111;color:white;font:12px system-ui}p{margin:0;padding:6px}iframe{border:0;width:100%;height:calc(100vh - 28px)}</style><p>Yerel MCP Apps doğrulama ana makinesi · gerçek düzenleyici · Codex dışı ana makine kabulü</p><iframe title="CevikEdit MCP App"></iframe><script type="module" src="host.js"></script>');
  else res.writeHead(404).end();
});
server.listen(0, '127.0.0.1', async () => { origin = `http://127.0.0.1:${(server.address() as any).port}`; const url = origin + base; await writeFile(path.join(output, 'url.txt'), url); console.log(url); });
function stop() { child.stdin.end(); server.close(); setTimeout(() => process.exit(), 1500); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
