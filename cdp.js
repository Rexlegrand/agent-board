// Mini client Chrome DevTools (headless) pour les tests d'interface et les captures. Aucune dépendance en plus de `ws`.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function open(url, { width = 1600, height = 1000, port = 9333 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  let list;
  for (let i = 0; i < 100 && !list; i++) {
    await new Promise(r => setTimeout(r, 150));
    try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch {}
  }
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  let id = 0; const pending = new Map(); const errors = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pending.has(j.id)) { const p = pending.get(j.id); pending.delete(j.id); j.error ? p.rej(new Error(j.error.message)) : p.res(j.result); }
    if (j.method === 'Runtime.exceptionThrown') errors.push(j.params.exceptionDetails.exception?.description || j.params.exceptionDetails.text);
    if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errors.push(j.params.args.map(a => a.value || a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expr, ms = 10000) => {
    const t = Date.now();
    while (Date.now() - t < ms) { try { if (await ev(`return !!(${expr})`)) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
    throw new Error('attente dépassée : ' + expr);
  };
  await send('Page.navigate', { url });
  await waitFor('window.__ready', 15000);
  return {
    ev, waitFor, errors, send,
    async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); },
    async click(sel) { return ev(`const e=document.querySelector(${JSON.stringify(sel)}); if(!e) throw new Error('absent: ${sel.replace(/'/g, '')}'); e.click(); return true`); },
    async mouse(type, x, y, extra = {}) { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra }); },
    async key(key, extra = {}) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, ...extra }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, ...extra }); },
    async type(text) { await send('Input.insertText', { text }); },
    async close() { // attendre la vraie fin de Chrome, puis effacer son profil jetable (sinon il reste des process et des dossiers)
      try { await Promise.race([send('Browser.close'), new Promise(r => setTimeout(r, 2000))]); } catch {}
      if (proc.exitCode === null) { proc.kill(); await new Promise(r => { proc.once('exit', r); setTimeout(r, 4000); }); }
      try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} // Chrome peut écrire encore une fraction de seconde
    },
  };
}
module.exports = { open };
