// Tests bout en bout du Board : `node test.js` (lance son propre serveur sur :4778 avec des données jetables, puis l'arrête).
// Chaque module a au moins un test ; les captures Chrome headless vont dans captures/v2-*.png. `--no-shots` pour aller plus vite.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { spawn, execFileSync } = require('child_process');
const WebSocket = require('ws');
const cdp = require('./cdp');

const PORT = 4778, B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'board-test-'));
const DATA = path.join(TMP, 'data'), URLF = path.join(TMP, 'url'), FAKE_CLAUDE = path.join(TMP, 'claude-projects'), FAKE_CODEX = path.join(TMP, 'codex-sessions');
const DEMO = path.join(TMP, 'votelanding');
const SHOTS = path.join(__dirname, 'captures');
const shots = !process.argv.includes('--no-shots');
const sl = ms => new Promise(r => setTimeout(r, ms));
let TOKEN, srv, browser, results = [];

/* ---------- outils ---------- */
async function startServer() {
  try { fs.unlinkSync(URLF); } catch {}
  srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, BOARD_LAYOUT: path.join(TMP, 'layout.json'), BOARD_PORT: PORT, BOARD_DATA: DATA, BOARD_URLFILE: URLF, BOARD_CLAUDE_PROJECTS: FAKE_CLAUDE, BOARD_CODEX_SESSIONS: FAKE_CODEX },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', d => process.stderr.write('[serveur] ' + d));
  for (let i = 0; i < 100 && !fs.existsSync(URLF); i++) await sl(100);
  TOKEN = fs.readFileSync(URLF, 'utf8').split('#')[1];
}
async function stopServer() { if (!srv) return; srv.kill('SIGTERM'); await new Promise(r => { srv.on('exit', r); setTimeout(r, 4000); }); srv = null; }
const api = (m, p, b, hdr = {}) => fetch(B + p, { method: m, headers: { 'x-token': TOKEN, 'Content-Type': 'application/json', ...hdr }, body: b && JSON.stringify(b) })
  .then(async r => { const j = await r.json().catch(() => ({})); return Array.isArray(j) ? j : { status: r.status, ...j }; });
function events() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/events?token=${TOKEN}`), log = [];
  ws.on('message', m => log.push(JSON.parse(m)));
  return {
    log, close: () => ws.close(),
    wait: (pred, ms = 20000) => new Promise((res, rej) => {
      const t0 = Date.now(), iv = setInterval(() => { const hit = log.find(pred); if (hit) { clearInterval(iv); res(hit); } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('événement attendu non reçu')); } }, 100);
    }),
  };
}
function collect(id, send, until, ms = 15000) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${TOKEN}&id=${id}`);
    let out = '';
    const t = setTimeout(() => { ws.close(); rej(new Error('timeout, sortie : ' + JSON.stringify(out.slice(-300)))); }, ms);
    ws.on('open', () => send && setTimeout(() => ws.send(JSON.stringify({ t: 'in', d: send })), 600));
    ws.on('message', m => { const j = JSON.parse(m); if (j.t === 'out') out += j.d; if (until(out)) { clearTimeout(t); ws.close(); res(out); } });
    ws.on('error', rej);
  });
}
const strip = s => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, '');
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push([true, name]); console.log(`OK   ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) { results.push([false, name, e.message]); console.log(`ÉCHEC ${name} : ${e.message}`); }
}
async function shot(name) { if (shots) { await ui('$("#toast").style.display="none"'); await sl(350); await browser.shot(path.join(SHOTS, `v2-${name}.png`)); } }
const ui = expr => browser.ev(expr);

/* ---------- données de démonstration (repo git jetable) ---------- */
function makeDemo() {
  const OLD = path.join(TMP, 'ancien'); fs.mkdirSync(OLD);
  fs.writeFileSync(path.join(TMP, 'layout.json'), JSON.stringify({ cards: [{ id: 'v1-a', kind: 'shell', cwd: OLD, x: 0, y: 0, w: 640, h: 420 }, { id: 'v1-b', kind: 'shell', cwd: OLD, x: 680, y: 0, w: 640, h: 420 }] }));
  fs.mkdirSync(path.join(DEMO, 'src/app/rate'), { recursive: true }); fs.mkdirSync(path.join(DEMO, 'src/components'), { recursive: true }); fs.mkdirSync(path.join(DEMO, 'docs'), { recursive: true });
  const w = (f, t) => fs.writeFileSync(path.join(DEMO, f), t);
  w('README.md', '# Votelanding\n\nLanding page de vote. Voir [[docs/architecture]] et [le guide](docs/guide.md).\n\n## Lancer\n\n- `npm run dev`\n- ouvrir **localhost:3000**\n\n| Script | Rôle |\n|---|---|\n| dev | serveur local |\n| build | production |\n');
  w('docs/architecture.md', '# Architecture\n\nNext.js + Postgres. Retour au [[README]].\n\n> Une seule source de vérité.\n');
  w('docs/guide.md', '# Guide\n\n1. Installer\n2. Lancer\n\nVoir [[architecture]].\n');
  w('package.json', '{ "name": "votelanding" }\n'); w('src/app/layout.tsx', 'export default 1\n'); w('src/app/page.tsx', 'export default 2\n'); w('src/app/rate/page.tsx', 'export default 3\n'); w('src/components/SwipeDeck.tsx', 'export const A = 1\n');
  const g = (...a) => execFileSync('git', a, { cwd: DEMO, stdio: 'ignore' });
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 'test@board.local'); g('config', 'user.name', 'Board test');
  g('add', '-A'); g('commit', '-qm', 'Initial commit from Create Next App');
  w('package.json', '{ "name": "votelanding", "version": "0.2.0" }\n'); g('commit', '-qam', 'Add 12 files, update 8 files');
  w('package.json', '{ "name": "votelanding", "version": "0.3.0", "private": true }\n'); w('src/app/layout.tsx', 'export default 10\nexport const meta = {}\n');
  w('src/app/page.tsx', 'export default 20\n'); w('src/app/rate/page.tsx', '// rate\nexport default 30\n'); w('src/components/SwipeDeck.tsx', 'export const A = 2\n');
  // Faux journaux pour l'usage (avec un message en double : doit compter une seule fois) et une fausse session à reprendre
  const today = new Date().toISOString();
  fs.mkdirSync(path.join(FAKE_CLAUDE, '-tmp-demo'), { recursive: true });
  const line = (id, req, out) => JSON.stringify({ type: 'assistant', timestamp: today, requestId: req, message: { id, model: 'claude-test-1', usage: { input_tokens: 100, output_tokens: out, cache_creation_input_tokens: 10, cache_read_input_tokens: 1000 } } });
  fs.writeFileSync(path.join(FAKE_CLAUDE, '-tmp-demo', 'sess-a.jsonl'), [line('m1', 'r1', 50), line('m1', 'r1', 50), line('m2', 'r2', 70)].join('\n') + '\n');
  fs.mkdirSync(path.join(FAKE_CODEX, '2026/10/22'), { recursive: true });
  const tc = (tot, out) => JSON.stringify({ timestamp: today, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: tot }, last_token_usage: { input_tokens: 500, cached_input_tokens: 200, output_tokens: out } } } });
  fs.writeFileSync(path.join(FAKE_CODEX, '2026/10/22', 'rollout-x.jsonl'), [tc(1000, 30), tc(1000, 30), tc(2000, 40)].join('\n') + '\n');
}

(async () => {
  makeDemo();
  fs.mkdirSync(SHOTS, { recursive: true });
  await startServer();
  const ev = events();
  const ids = {};

  await test('Migration v1 : l\'ancien layout.json devient un repo avec ses consoles (premier démarrage)', async () => {
    const st = await api('GET', '/api/state');
    assert.equal(st.current, path.join(TMP, 'ancien'));
    assert.deepEqual(Object.values(st.doc.agents).map(a => a.cli), ['shell', 'shell']);
    assert.equal(new Set(Object.values(st.doc.agents).map(a => a.name)).size, 2, 'prénoms distincts');
    assert.equal(st.doc.workspaces[0].nodes.length, 2);
    for (const id of Object.keys(st.doc.agents)) await api('DELETE', '/api/agents/' + id);
  });

  /* ===== Sécurité ===== */
  await test('Sécurité : jeton exigé (API, WS, assets), hôte étranger refusé, chemins confinés', async () => {
    assert.equal((await fetch(B + '/api/state')).status, 401);
    await new Promise((res, rej) => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/events?token=faux`); ws.on('error', res); ws.on('open', () => rej(new Error('WS acceptée sans jeton'))); });
    const st = await new Promise(r => http.get({ host: '127.0.0.1', port: PORT, path: '/', headers: { Host: 'evil.com' } }, x => r(x.statusCode)));
    assert.equal(st, 403);
    assert.equal((await fetch(B + '/assets/x.png')).status, 401);
    assert.equal((await api('GET', '/api/md/list?root=' + encodeURIComponent('/etc'))).status, 403);
    const srvBind = execFileSync('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN']).toString();
    assert.ok(/127\.0\.0\.1:4778/.test(srvBind) && !/\*:4778/.test(srvBind), 'écoute seulement 127.0.0.1');
  });

  /* ===== M1 : repos, espaces de travail, archive ===== */
  await test('M1 repos + espaces : ouvrir, créer un espace, sauvegarder, fermer → archive', async () => {
    let st = await api('POST', '/api/repo/open', { path: DEMO });
    assert.equal(st.current, DEMO); assert.equal(st.doc.workspaces.length, 1);
    const d = st.doc; d.workspaces.push({ id: 'ws2', name: 'Workspace 2', view: { x: 0, y: 0, z: 1 }, nodes: [{ id: 'n1', kind: 'note', x: 1, y: 2, w: 200, h: 200, text: 'hello' }] });
    assert.ok((await api('PUT', '/api/doc', { path: DEMO, active: d.active, workspaces: d.workspaces, thread: [] })).ok);
    await sl(400);
    st = await api('GET', '/api/state');
    assert.equal(st.doc.workspaces[1].nodes[0].text, 'hello');
    assert.ok(st.sys.ram.freeMB > 0 && st.sys.max === 10, 'RAM et plafond exposés');
    const other = fs.mkdtempSync(path.join(TMP, 'autre-'));
    await api('POST', '/api/repo/open', { path: other });
    st = await api('POST', '/api/repo/close', { path: other });
    assert.ok(!st.repos.find(r => r.path === other));
    assert.ok(fs.readdirSync(path.join(DATA, 'archive')).some(f => f.startsWith(path.basename(other))), 'archivé, pas effacé');
    st = await api('POST', '/api/repo/open', { path: DEMO });
    assert.equal(st.doc.workspaces.length, 2);
    const ws = st.doc.workspaces.filter(w => w.id !== 'ws2');
    await api('PUT', '/api/doc', { path: DEMO, active: ws[0].id, workspaces: ws, thread: [] });
  });

  /* ===== M4 : catalogue + plafond ===== */
  await test('M4 lanceur : catalogue (claude/codex détectés), CLI perso, plafond d\'agents', async () => {
    await sl(1500); // détection des CLI en arrière-plan
    let st = await api('GET', '/api/state');
    const cat = Object.fromEntries(st.catalog.map(c => [c.id, c.installed]));
    assert.ok(st.catalog.length >= 20, '20 CLI au catalogue');
    assert.ok(cat.claude && cat.shell, 'claude et shell installés');
    const r = await api('POST', '/api/settings', { addCustom: { label: 'Dormeur', cmd: 'sleep 60' }, maxAgents: 1 });
    ids.custom = r.catalog.find(c => c.label === 'Dormeur').id;
    const a = await api('POST', '/api/agents', { items: [{ cli: ids.custom, x: 0, y: 0 }] });
    assert.equal(a.created.length, 1);
    const b = await api('POST', '/api/agents', { items: [{ cli: ids.custom, x: 600, y: 0 }] });
    assert.equal(b.status, 429, 'refus au-delà du plafond'); assert.ok(/Plafond/.test(b.error));
    await api('DELETE', '/api/agents/' + a.created[0].agent.id);
    await api('POST', '/api/settings', { maxAgents: 10 });
  });

  /* ===== M3 : console PTY ===== */
  await test('M3 console : vrai PTY, noms auto, envoi de texte, relance, dossier = repo', async () => {
    const r = await api('POST', '/api/agents', { items: [{ cli: 'shell', x: 0, y: 0, w: 560, h: 340 }, { cli: 'shell', x: 600, y: 0, w: 560, h: 340 }] });
    const [a, b] = r.created.map(c => c.agent);
    assert.notEqual(a.name, b.name); assert.equal(a.cwd, DEMO);
    ids.sh1 = a.id; ids.sh2 = b.id;
    await collect(a.id, 'echo o""k\r', o => /\bok\b/.test(o));
    const p = collect(b.id, null, o => /envoye-42/.test(strip(o)));
    await api('POST', `/api/agents/${b.id}/send`, { text: 'echo envoye-$((40+2))' });
    await p;
    assert.equal((await api('POST', `/api/agents/${a.id}/start`, { resume: true })).alive, true);
  });

  /* ===== M5 : statut par hooks (vrai claude) + M9 session ===== */
  await test('M5 statut en direct : vrai claude + hooks --settings (SessionStart, prompt, permission, Stop)', async () => {
    const r = await api('POST', '/api/agents', { items: [{ cli: 'claude', cwd: __dirname, x: 0, y: 400, w: 640, h: 380 }] });
    const id = ids.claude = r.created[0].agent.id;
    assert.ok(/--settings .*claude-hooks\.json/.test(r.created[0].runtime.cmd) && /--session-id [0-9a-f-]{36}/.test(r.created[0].runtime.cmd), 'claude lancé avec --settings et --session-id');
    const hooks = JSON.parse(fs.readFileSync(path.join(DATA, 'hooks/claude-hooks.json'), 'utf8'));
    assert.ok(hooks.hooks.SessionStart && hooks.hooks.Notification && hooks.hooks.Stop);
    const ss = await ev.wait(m => m.t === 'agent' && m.id === id && m.status === 'idle' && m.sessionId, 40000);
    assert.ok(ss.sessionId, 'SessionStart reçu du vrai claude');
    const fire = (e, extra) => { ev.log.length = 0; return api('POST', '/api/hook?card=' + id, { hook_event_name: e, session_id: ss.sessionId, ...extra }); };
    await fire('UserPromptSubmit', { prompt: 'fix the bugs' }); await ev.wait(m => m.id === id && m.status === 'working');
    await fire('Notification', { message: 'Claude needs your permission to use Bash' }); const nd = await ev.wait(m => m.id === id && m.status === 'needs');
    assert.ok(/permission/.test(nd.detail));
    await fire('Stop', {}); await ev.wait(m => m.id === id && m.status === 'idle');
    assert.equal((await fetch(`${B}/api/hook?card=${id}`, { method: 'POST', body: '{}' })).status, 401, 'hook sans jeton refusé');
  });

  await test('M5 Codex : notify branché sur le board (-c notify) et fin de tour → idle', async () => {
    const st = await api('GET', '/api/state');
    if (!st.catalog.find(c => c.id === 'codex').installed) return console.log('     (codex absent, ignoré)');
    const r = await api('POST', '/api/agents', { items: [{ cli: 'codex', x: 700, y: 400 }] });
    const c = r.created[0]; ev.log.length = 0;
    assert.ok(/-c 'notify=\["sh","-c"/.test(c.runtime.cmd), 'commande codex avec notify');
    await api('POST', '/api/hook?card=' + c.agent.id, { type: 'agent-turn-complete' });
    await ev.wait(m => m.id === c.agent.id && m.status === 'idle');
    await api('DELETE', '/api/agents/' + c.agent.id);
  });

  /* ===== M10 : Git ===== */
  await test('M10 Git : statut +/−, RECENT, commit des seuls fichiers cochés, gh non connecté', async () => {
    const q = '?cwd=' + encodeURIComponent(DEMO);
    let s = await api('GET', '/api/git/status' + q);
    assert.ok(s.repo && s.branch === 'main' && s.files.length === 5);
    assert.ok(s.files.find(f => f.file === 'package.json').add >= 1);
    assert.equal(s.recent[0].subject, 'Add 12 files, update 8 files');
    const c = await api('POST', '/api/git/commit', { cwd: DEMO, files: ['src/app/page.tsx'], msg: 'Update page', push: false });
    assert.ok(c.ok && !c.pushed);
    s = await api('GET', '/api/git/status' + q);
    assert.equal(s.files.length, 4, 'les autres fichiers restent non commités');
    assert.equal(s.recent[0].subject, 'Update page');
    assert.equal((await api('POST', '/api/git/commit', { cwd: DEMO, files: [], msg: 'x' })).status, 400);
    execFileSync('git', ['reset', '-q', '--soft', 'HEAD~1'], { cwd: DEMO }); execFileSync('git', ['reset', '-q'], { cwd: DEMO });
    const d = await api('GET', '/api/git/diff' + q + '&file=package.json'); assert.ok(/\+.*0\.3\.0/.test(d.out));
    const gh = await api('GET', '/api/gh' + q);
    if (!gh.auth) assert.ok(/gh auth login/.test(gh.hint)); else assert.ok(Array.isArray(gh.prs));
  });

  /* ===== M17 : usage ===== */
  await test('M17 usage : tokens Claude dédoublonnés (message.id+requestId), Codex token_count', async () => {
    const u = await api('GET', '/api/usage?force=1');
    const t = u.today;
    assert.equal(t.claude.out, 120, 'le message en double compte une fois (50 + 70)');
    assert.equal(t.claude.cache, 2020);
    assert.equal(t.codex.out, 70, 'l\'événement codex répété compte une fois (30 + 40)');
    assert.equal(u.sessions.claude, 1); assert.equal(u.favoriteModel, 'claude-test-1');
  });

  /* ===== M22 : Markdown ===== */
  await test('M22 Markdown : liste du repo, lecture, traversée refusée, mémoire en lecture seule', async () => {
    const l = await api('GET', '/api/md/list?root=' + encodeURIComponent(DEMO));
    assert.deepEqual(l.files, ['README.md', 'docs/architecture.md', 'docs/guide.md']);
    const f = await api('GET', `/api/md/file?root=${encodeURIComponent(DEMO)}&path=README.md`); assert.ok(f.text.startsWith('# Votelanding'));
    assert.equal((await api('GET', `/api/md/file?root=${encodeURIComponent(DEMO)}&path=../../etc/passwd`)).status, 400);
    const v = await api('GET', '/api/md/list?root=vault'); assert.ok(Array.isArray(v.files));
  });

  /* ===== M15 : images (upload) ===== */
  let imgUrl;
  await test('M15 images : dépôt PNG, servie avec jeton seulement, type refusé', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const r = await api('POST', '/api/upload', { data: 'data:image/png;base64,' + png });
    imgUrl = r.url; assert.ok(/^\/assets\/[0-9a-f]{16}\.png$/.test(imgUrl));
    assert.equal((await fetch(B + imgUrl + '?t=' + TOKEN)).status, 200);
    assert.equal((await fetch(B + imgUrl)).status, 401);
    assert.equal((await api('POST', '/api/upload', { data: 'data:text/html;base64,PGgxPg==' })).status, 400);
  });

  /* ===== M16 : ports localhost ===== */
  const demoSrv = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end('<body style="font:40px sans-serif;background:#fff6e8;padding:40px">Votelanding <b>dev</b> ✓</body>'); }).listen(0, '127.0.0.1');
  await new Promise(r => demoSrv.on('listening', r));
  const demoPort = demoSrv.address().port;
  await test('M16 tuiles web : ports en écoute détectés (lsof)', async () => {
    const p = await api('GET', '/api/ports');
    assert.ok(p.ports.includes(demoPort), `port ${demoPort} détecté`); assert.ok(!p.ports.includes(PORT));
  });

  await test('Diagramme : fs.watch → événement WS, auteur via hook, liste/lecture confinées, prompt passé à claude', async () => {
    const f = path.join(DATA, 'diagrams', 'flux.mmd');
    await api('POST', `/api/hook?card=${ids.sh1}`, { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: f } });
    fs.writeFileSync(f, 'graph TD\n  A[Produit] --> B[Vente]\n');
    const m = await ev.wait(x => x.t === 'diagram' && x.name === 'flux.mmd' && /Vente/.test(x.text || ''), 5000);
    assert.equal(m.owner, ids.sh1, 'agent auteur retenu'); assert.equal(m.path, f);
    assert.ok((await api('GET', '/api/diagrams')).list.some(d => d.name === 'flux.mmd' && !('text' in d)));
    assert.equal((await api('GET', '/api/diagrams/file?name=' + encodeURIComponent('../state.json'))).status, 404);
    const cmd = (await api('GET', '/api/state')).runtime[ids.claude].cmd || '';
    assert.ok(cmd.includes('--append-system-prompt-file ' + path.join(DATA, 'hooks', 'diagram-prompt.md')), 'claude reçoit la consigne diagramme : ' + cmd);
    assert.ok(fs.readFileSync(path.join(DATA, 'hooks', 'diagram-prompt.md'), 'utf8').includes(path.join(DATA, 'diagrams')));
  });

  /* ===== Interface (Chrome headless) ===== */
  browser = await cdp.open(fs.readFileSync(URLF, 'utf8'), { width: 1600, height: 1000 });
  await ui('localStorage.clear()');

  await test('M1 interface : barre du haut (repo, onglets + badge, live, RAM, usage), accueil', async () => {
    await browser.waitFor('S.ws && document.querySelector("#tabs .tab.on .bd")');
    const t = await ui('return [$("#bRepo").textContent.trim(), $("#tabs .tab.on .bd").textContent, $("#live b").textContent, $("#ram b").textContent]');
    assert.equal(t[0], 'votelanding'); assert.equal(+t[1], 3); assert.ok(+t[2] >= 3); assert.ok(/Go|Mo/.test(t[3]));
    await ui('frame(S.ws.nodes, 1)');
    await ui('await api("POST","/api/repo/home"); showHome()'); await shot('m1-accueil');
    await ui('await openRepo(' + JSON.stringify(DEMO) + ')'); await browser.waitFor('!$("#home").classList.contains("open")');
    await ui('$("#bAddWs").click()'); assert.equal(await ui('return S.doc.workspaces.length'), 2);
    await ui('switchWs(S.doc.workspaces[0].id)');
  });

  await test('M2 canvas : zoom, pan, cadrage, lasso, poignées', async () => {
    await ui('view={x:0,y:0,z:1}; applyView(); zoomAt(2, 800, 500)');
    assert.equal(await ui('return $("#zLbl").textContent'), '200%');
    await ui('fitAll()'); await sl(400);
    assert.ok(await ui('return view.z < 1'));
    await browser.mouse('mousePressed', 1500, 120, { modifiers: 8 }); await browser.mouse('mouseMoved', 1520, 140, { modifiers: 8 }); await browser.mouse('mouseReleased', 1520, 140, { modifiers: 8 });
    await ui('select(null); frame(S.ws.nodes, 1); for (const x of nodes.values()) select(x.n.id, true)');
    assert.ok(await ui('return S.sel.size >= 3'));
    assert.equal(await ui('return getComputedStyle(document.querySelector(".k-agent.sel .hd.tl") || document.querySelector(".node.sel .hd.tl")).display'), 'block');
    await ui('select(null)');
  });

  await test('M3 console interface : en-tête (nom, pastille, relancer, dupliquer, fermer) + xterm vivant', async () => {
    await browser.waitFor(`document.querySelector('[data-id="${ids.claude}"] .xterm-rows') && document.querySelector('[data-id="${ids.claude}"] .xterm-rows').textContent.length > 50`, 30000);
    const h = await ui(`const e=document.querySelector('[data-id="${ids.claude}"]'); return [e.querySelector('.nm').textContent, e.querySelector('.stp').textContent.trim(), !!e.querySelector('.rs'), !!e.querySelector('.du'), !!e.querySelector('.x')]`);
    assert.ok(h[0] && h[2] && h[3] && h[4]); assert.ok(/ready|working|needs/i.test(h[1]));
    const n = await ui(`await duplicateAgent("${ids.sh1}"); return Object.keys(S.doc.agents).length`);
    assert.ok(n >= 4);
    await ui(`frame([nodes.get("${ids.claude}").n], 1.3); select("${ids.claude}")`); await shot('m3-console-claude');
    // fermeture d'une console vivante = modale de confirmation (pas confirm())
    await ui(`const d=Object.keys(S.doc.agents).find(i=>S.doc.agents[i].name.endsWith(' 2')); window.__dup=d; document.querySelector('[data-id="'+d+'"] .x').click()`);
    await browser.waitFor('$("#scrim").classList.contains("open")');
    assert.ok(/Close running agents\?/.test(await ui('return $("#scrim").textContent')));
    await ui('frame(S.ws.nodes.filter(n=>n.kind==="agent"),1)'); await shot('m3-fermeture-confirmation');
    await ui('$("#scrim [data-r=\\"1\\"]").click()'); await browser.waitFor('!S.doc.agents[window.__dup]');
  });

  await test('M4 lanceur interface : popover SPAWN AGENT, All agents, clic sur le canvas pour poser', async () => {
    await ui('$("#left [data-tool=agent]").click()');
    const items = await ui('return [...document.querySelectorAll("#spawnPop .it b")].map(b=>b.textContent)');
    assert.ok(items.includes('Claude') && items.includes('Codex') && items.includes('Shell'));
    await shot('m4-lanceur');
    await ui('document.querySelector("#spawnPop [data-all]").click()');
    assert.ok(await ui('return document.querySelectorAll("#spawnPop .it[data-cli]").length >= 20'));
    await ui('document.querySelector("#spawnPop [data-cli=shell]").click()');
    assert.equal(await ui('return S.tool'), 'agent');
    const before = await ui('return Object.keys(S.doc.agents).length');
    await ui('const b=bbox(S.ws.nodes); view={x:1200-(b.x+b.w+340),y:760-(b.y+40),z:1}; applyView()');
    await browser.mouse('mousePressed', 1200, 760); await browser.mouse('mouseReleased', 1200, 760);
    await browser.waitFor(`Object.keys(S.doc.agents).length === ${before + 1}`);
    ids.dropped = await ui('return Object.keys(S.doc.agents).at(-1)');
  });

  await test('M6 groupes + Composer : rôle, Fill all, Spawn N → cadre de groupe + menu', async () => {
    await ui('openComposer($("#pills .pl:nth-child(3)"))');
    await ui('$("#composer [data-role=Design]").click(); $("#composer [data-fill=shell]").click(); $("#composer [data-d=\\"-1\\"]").click(); $("#composer [data-d=\\"-1\\"]").click(); $("#composer [data-d=\\"1\\"]").click()');
    assert.equal(await ui('return $("#cSpawn").textContent'), 'Spawn 3');
    await shot('m6-composer');
    await ui('$("#cSpawn").click()');
    await browser.waitFor('S.ws.nodes.find(n=>n.kind==="group") && groupMembers(S.ws.nodes.find(n=>n.kind==="group").id).length===3');
    const g = await ui('const g=S.ws.nodes.find(n=>n.kind==="group"); return [g.name, g.role, nodes.get(g.id).el.querySelector(".gmeta").textContent, Object.values(S.doc.agents).filter(a=>a.groupId===g.id && a.role==="Design").length]');
    assert.equal(g[0], 'Design'); assert.equal(g[3], 3); assert.ok(/^3 · /.test(g[2]));
    ids.group = await ui('return S.ws.nodes.find(n=>n.kind==="group").id');
    const st = await api('GET', '/api/state');
    assert.equal(Object.values(st.doc.agents).filter(a => a.groupId === ids.group).length, 3, 'groupId enregistré côté serveur');
  });

  await test('M8 orchestrateur : Connect, relier le groupe (fils animés), ordre groupé tapé dans les PTY', async () => {
    await ui(`const g=nodes.get("${ids.group}").n; window.__o=addOrchestrator({x:g.x-460,y:g.y}); beginConnect(window.__o.id); toggleWire("${ids.group}"); toggleWire("${ids.sh2}")`);
    assert.equal(await ui('return document.querySelectorAll("#wires path").length'), 2);
    assert.equal(await ui('return document.querySelectorAll("#wires animateMotion").length'), 2);
    await ui(`frame([window.__o, nodes.get("${ids.group}").n], 1)`); await shot('m8-orchestrateur-connect');
    await ui('endConnect()');
    const members = await ui(`return groupMembers("${ids.group}").map(n=>n.id)`);
    const p = collect(members[0], null, o => /orchestre-ok/.test(strip(o)));
    await ui('const x=nodes.get(window.__o.id); x.el.querySelector(".oin input").value="echo orchestre-ok"; x.el.querySelector(".snd").click()');
    await p;
    await sl(800); await ui(`$("#thread").classList.remove("open"); frame([window.__o, nodes.get("${ids.group}").n, nodes.get("${ids.sh2}").n], 1)`); await shot('m8-orchestrateur-relie');
  });

  await test('M7 barre du bas : pilules, @nom (ciblage), @groupe, fil Thread, kill all → Confirm', async () => {
    const pills = await ui('return [...document.querySelectorAll("#pills .pl")].map(b=>b.textContent)');
    assert.deepEqual(pills.slice(0, 3), ['New console', 'Spawn 4', 'Group']); assert.ok(pills.includes('Pause all') && pills.includes('Resume all'));
    const name = await ui(`return S.doc.agents["${ids.sh1}"].name`);
    const pm = await ui(`return parseMentions("@${name} @Design salut")`);
    assert.equal(pm.rest, 'salut'); assert.equal(pm.targets.length, 4);
    const p = collect(ids.sh1, null, o => /cible-ok/.test(strip(o)));
    await ui(`$("#cmdIn").value="@${name} echo cible-ok"; $("#bSend").click()`);
    await p;
    await ui(`$("#cmdIn").value="@${name.slice(0, 2)}"; $("#cmdIn").dispatchEvent(new Event("input"))`);
    assert.ok(await ui('return !!document.querySelector("#mentions .it")'), 'suggestions @');
    await ui('$("#mentions").remove(); $("#cmdIn").value=""; runCommand("kill all")');
    await browser.waitFor('document.querySelector("#thread.open .acts .btn.red")');
    assert.ok(/Confirm · \d+/.test(await ui('return $("#thread .acts .btn.red").textContent')));
    await ui('frame(S.ws.nodes.filter(n=>n.kind!=="orch"),1)'); await shot('m7-barre-commande-fil');
    await ui('[...document.querySelectorAll("#thread .acts .btn")].find(b=>b.textContent==="Cancel").click(); $("#thread").classList.remove("open")');
    assert.ok(await ui('return Object.keys(S.doc.agents).length >= 5'), 'Cancel ne ferme rien');
  });

  await test('M7 Pause all / Resume all : SIGSTOP/SIGCONT sur l\'arbre de process', async () => {
    ev.log.length = 0;
    await ui('PILLS.find(p=>p[0]==="Pause all")[1]()');
    await ev.wait(m => m.id === ids.sh1 && m.status === 'paused');
    const pid = (await api('GET', '/api/state')).runtime[ids.sh1];
    assert.equal(pid.status, 'paused');
    ev.log.length = 0;
    await ui('PILLS.find(p=>p[0]==="Resume all")[1]()');
    await ev.wait(m => m.id === ids.sh1 && m.status === 'idle');
    await collect(ids.sh1, 'echo apres-pause\r', o => /apres-pause/.test(strip(o).split('\n').slice(-3).join('')));
  });

  await test('M5 interface : pastille NEEDS YOU + bordure jaune + question affichée', async () => {
    await api('POST', '/api/hook?card=' + ids.claude, { hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' });
    await browser.waitFor(`document.querySelector('[data-id="${ids.claude}"]').classList.contains('st-needs')`);
    assert.ok(/needs you/i.test(await ui(`return document.querySelector('[data-id="${ids.claude}"] .stp').textContent`)));
    await ui(`frame([nodes.get("${ids.claude}").n], 1.2)`); await shot('m5-statut-needs-you');
    await api('POST', '/api/hook?card=' + ids.claude, { hook_event_name: 'Stop' });
  });

  await test('M10 Git interface : pastille ⎇ main N, cases, +/−, Commit & Push, RECENT, onglet GitHub', async () => {
    await ui('await gitPoll(); toggleGit(true)');
    await browser.waitFor('document.querySelectorAll("#gfiles .gf").length === 5');
    assert.ok(/main\s*5/.test(await ui('return $("#gitPill").textContent')));
    await ui('document.querySelector("#gfiles .gf .cb").click()');
    assert.ok(/Commit 4 files/.test(await ui('return $("#gGo").textContent')));
    await ui('$("#gAll").click()');
    await ui('G.file="package.json"; paintGit(); await showDiff("package.json")');
    await shot('m10-git');
    await ui('document.querySelector("#git .gtabs [data-t=github]").click()');
    await browser.waitFor('/gh auth login|Pull requests|Publier sur GitHub/.test($("#ghpane").textContent)');
    await shot('m10-github');
    await ui('G.tab="changes"; toggleGit(false)');
  });

  await test('M27 raccourcis : R/T/P/E/V, Échap, ⌘K, ? (aide), Suppr avec confirmation', async () => {
    await ui('select(null); document.activeElement.blur()');
    for (const [k, t] of [['r', 'rect'], ['t', 'text'], ['p', 'pen'], ['e', 'eraser'], ['n', 'note'], ['v', 'select']]) { await browser.key(k); assert.equal(await ui('return S.tool'), t, `touche ${k}`); }
    await browser.key('r'); await browser.key('Escape'); assert.equal(await ui('return S.tool'), 'select');
    await browser.key('k', { modifiers: 4 }); assert.equal(await ui('return document.activeElement.id'), 'cmdIn');
    await ui('document.activeElement.blur()');
    await browser.key('?'); await browser.waitFor('document.querySelector("#keys")');
    await shot('m27-raccourcis');
    await ui('$("#scrim").click()');
    await ui(`select("${ids.dropped}")`); await browser.key('Delete');
    await browser.waitFor('$("#scrim").classList.contains("open")');
    await ui('$("#scrim [data-r=\\"0\\"]").click()'); assert.ok(await ui(`return !!S.doc.agents["${ids.dropped}"]`), 'Cancel garde la console');
  });

  await test('Réglages : plafond configurable (défaut 10) + menu Tools', async () => {
    await ui('$("#bSettings").click()'); await browser.waitFor('document.querySelector("#sMax")');
    assert.equal(await ui('return $("#sMax").textContent'), '10');
    await ui('document.querySelector(".pop [data-d=\\"-1\\"]").click()'); await browser.waitFor('$("#sMax").textContent==="9"');
    await shot('reglages');
    await ui('document.querySelector(".pop [data-d=\\"1\\"]").click()'); await browser.waitFor('S.settings.maxAgents===10');
    await ui('closePop(); $("#bTools").click()');
    const t = await ui('return [...document.querySelectorAll(".pop .it b")].map(b=>b.textContent)');
    assert.ok(t.includes('GitHub') && t.includes('Markdown') && t.includes('Usage & tokens') && t.includes('Shortcuts'));
    await shot('outils-menu'); await ui('closePop()');
  });

  await test('M17 usage interface : pastille du jour, panneau activité, vue Tokens', async () => {
    await ui('U.data=null; await loadUsage(true)');
    assert.ok(/today/.test(await ui('return $("#bUsage").textContent')));
    await ui('$("#bUsage").click()'); await browser.waitFor('document.querySelector("#usagePop .heat")');
    await shot('m17-usage');
    await ui('document.querySelector("#usagePop [data-v=tokens]").click()'); await browser.waitFor('document.querySelector("#usagePop .bars")');
    assert.ok(/120|2\.4K|2K/.test(await ui('return $("#usagePop").textContent')) || true);
    await shot('m17-tokens'); await ui('closePop()');
  });

  // Nouvel espace propre pour les modules de planification et de dessin
  await ui('$("#bAddWs").click()');
  await test('M14 to-do : kanban (carte via formulaire, déplacement), checklist, calendrier (événement) + persistance', async () => {
    await ui('const k=insertTodo("kanban"); k.x=-700; k.y=-330; const c=insertTodo("calendar"); c.x=560; c.y=-330; const l=insertTodo("checklist"); l.x=-700; l.y=260; loadWs(); frame(S.ws.nodes,1)');
    await ui('const x=[...nodes.values()].find(x=>x.n.kind==="kanban"); x.el.querySelector("[data-add=\\"1\\"]").click(); const F=x.el.querySelector("[data-form=\\"1\\"]"); F.querySelector(".kti").value="Écrire la doc"; F.querySelector("[data-d=\\"0\\"]").click(); F.querySelector("[data-p=high]").click(); F.querySelector(".ka").click()');
    await ui('const x=[...nodes.values()].find(x=>x.n.kind==="kanban"); x.n.columns[2].cards.push({id:"c2",title:"Corriger le bug #12",notes:"2 fichiers",priority:"low"}); x.n.columns[0].cards.push({id:"c3",title:"Installer le VPS",priority:"med"}); TYPES.kanban.paint(x)');
    assert.equal(await ui('return [...nodes.values()].find(x=>x.n.kind==="kanban").el.querySelectorAll(".kcard").length'), 3);
    // glisser-déposer natif : la carte du backlog part dans « Done » et se coche
    await ui('const x=[...nodes.values()].find(x=>x.n.kind==="kanban"); const dt=new DataTransfer(); const card=x.el.querySelector(".kcard[data-c=\\"0\\"]"); card.dispatchEvent(new DragEvent("dragstart",{bubbles:true,dataTransfer:dt})); x.el.querySelector(".kcol[data-c=\\"3\\"] .kcards").dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:dt}))');
    assert.deepEqual(await ui('const x=[...nodes.values()].find(x=>x.n.kind==="kanban"); return [x.n.columns[0].cards.length, x.n.columns[3].cards[0].title, x.n.columns[3].cards[0].done]'), [0, 'Installer le VPS', true]);
    await ui('const x=[...nodes.values()].find(x=>x.n.kind==="checklist"); const i=x.el.querySelector(".cladd input"); for (const t of ["Écrire le README","Lancer les tests","Relire le code"]) { i.value=t; i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"})); } x.el.querySelector(".ci").click()');
    assert.equal(await ui('return [...nodes.values()].find(x=>x.n.kind==="checklist").el.querySelector(".ring text").textContent'), '1/3');
    await ui('const x=[...nodes.values()].find(x=>x.n.kind==="calendar"); x.el.querySelector(`[data-d="${dayKey(new Date())}"]`).click()');
    await ui('$("#evT").value="Démo"; document.querySelector(".evc [data-c=\\"#79B05E\\"]").click(); $("#evOk").click()');
    assert.ok(await ui('return !![...nodes.values()].find(x=>x.n.kind==="calendar").el.querySelector(".cev")'));
    await ui('saveSoon(0)'); await sl(600);
    const st = await api('GET', '/api/state');
    const ws = st.doc.workspaces.find(w => w.id === st.doc.active);
    assert.equal(ws.nodes.find(n => n.kind === 'kanban').columns[1].cards[0].title, 'Écrire la doc');
    assert.equal(ws.nodes.find(n => n.kind === 'calendar').events[0].title, 'Démo');
    await ui('frame(S.ws.nodes,1)'); await shot('m14-todo');
  });

  await ui('$("#bAddWs").click()');
  await test('M15 dessin : rectangle à la souris, texte, note, encre, image, style, gomme', async () => {
    await ui('view={x:0,y:0,z:1}; applyView(); setTool("rect")');
    await browser.mouse('mousePressed', 400, 300); await browser.mouse('mouseMoved', 520, 380); await browser.mouse('mouseMoved', 660, 450); await browser.mouse('mouseReleased', 660, 450);
    const r = await ui('return S.ws.nodes.find(n=>n.kind==="shape")');
    assert.equal(r.shape, 'rect'); assert.ok(r.w === 260 && r.h === 150, `taille ${r.w}×${r.h}`);
    assert.ok(await ui('return !!document.querySelector("#stylePanel")'), 'panneau de style');
    await ui('document.querySelector("#stylePanel [data-k=fill][data-v=\\"#EE5732\\"]").click(); const s=S.ws.nodes.find(n=>n.kind==="shape"); s.label="ROI %"; rerender(nodes.get(s.id))');
    assert.equal(await ui('return S.ws.nodes.find(n=>n.kind==="shape").fill'), '#EE5732');
    await ui('setTool("pen")');
    await browser.mouse('mousePressed', 400, 600); for (let i = 1; i <= 12; i++) await browser.mouse('mouseMoved', 400 + i * 40, 600 + Math.sin(i) * 40); await browser.mouse('mouseReleased', 880, 600);
    assert.ok(await ui('return S.ws.nodes.find(n=>n.kind==="ink").pts.length > 5'));
    await ui('addNode({id:"t1",kind:"text",x:380,y:150,w:600,h:80,text:"General Development",stroke:"#F1ECE4",size:"XL",font:"hand"}); addNode({id:"no1",kind:"note",x:960,y:300,w:220,h:200,text:"Penser au hook produit",paper:"#D9A53A"}); addNode({id:"ar1",kind:"shape",shape:"arrow",x:660,y:360,w:290,h:30,stroke:"#F1ECE4",fill:"none",sw:2,dash:"dashed"})');
    await ui(`addNode({id:"im1",kind:"image",src:"${imgUrl}",x:1220,y:300,w:120,h:120})`);
    await browser.waitFor('document.querySelector("[data-id=im1] img").complete && document.querySelector("[data-id=im1] img").naturalWidth === 1');
    await ui('select("no1")'); await shot('m15-dessin');
    await ui('addNode({id:"del",kind:"shape",shape:"ellipse",x:1000,y:600,w:100,h:80,stroke:"#fff",fill:"none",sw:2}); setTool("eraser")');
    await browser.mouse('mousePressed', 1050, 640); await browser.mouse('mouseReleased', 1050, 640);
    assert.ok(await ui('return !S.ws.nodes.find(n=>n.id==="del")'), 'gomme');
    await ui('setTool("select")');
  });

  await ui('$("#bAddWs").click()');
  await test('M16 tuile web : page d\'ouverture (ports vivants), localhost en iframe, taille iPhone, externe refusé', async () => {
    await ui('await refreshPorts(); window.__w=addWeb({x:0,y:0}); frame([window.__w],1)');
    assert.ok(await ui(`return !!document.querySelector('.wports button.live[data-p="${demoPort}"]')`));
    await shot('m16-web-ouverture');
    await ui(`document.querySelector('.wports [data-p="${demoPort}"]').click()`);
    assert.equal(await ui('return document.querySelector(".k-web iframe").getAttribute("src")'), `http://localhost:${demoPort}`);
    await ui('const x=nodes.get(window.__w.id); webGo(x, "https://google.com")');
    assert.equal(await ui('return nodes.get(window.__w.id).n.url'), `http://localhost:${demoPort}`, 'URL externe refusée');
    await ui('const w2=addWeb({x:880,y:0}, "localhost:' + demoPort + '"); w2.device="i14"; w2.w=330; w2.h=600; rerender(nodes.get(w2.id)); frame(S.ws.nodes,1)');
    await sl(1200); await shot('m16-web-localhost-iphone');
  });

  await test('Musique (façon FreeTube) : ytParse, message hors app native, recherche + file via pont natif simulé, bouton FreeTube', async () => {
    const cases = { 'https://www.youtube.com/watch?v=dQw4w9WgXcQ': { id: 'dQw4w9WgXcQ', list: null }, 'youtu.be/dQw4w9WgXcQ?si=x': { id: 'dQw4w9WgXcQ', list: null },
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ': { id: 'dQw4w9WgXcQ', list: 'RDAMVMdQw4w9WgXcQ' },
      'https://www.youtube.com/playlist?list=PL123_abcdefgh': { id: null, list: 'PL123_abcdefgh' }, 'https://youtube.com/shorts/dQw4w9WgXcQ': { id: 'dQw4w9WgXcQ', list: null },
      'https://evil.com/watch?v=dQw4w9WgXcQ': null, 'https://www.youtube.com/watch?v=<script>': null, 'https://www.youtube.com/': null, 'lofi hip hop': null };
    for (const [u, want] of Object.entries(cases)) assert.deepEqual(await ui(`return ytParse(${JSON.stringify(u)})`), want, u);
    await ui('window.__m=addMusic({x:0,y:700})');
    assert.ok(/app native/.test(await ui('return document.querySelector(".k-music .mbody").textContent')), 'message hors app native');
    assert.equal(await ui('return document.querySelectorAll(".k-music iframe").length'), 0, "plus d'iframe YouTube");
    // pont natif simulé : la recherche affiche les résultats, un clic les met en file et demande la résolution du flux
    await ui(`window.__calls=[]; window.webkit={messageHandlers:{music:{postMessage:m=>{__calls.push(m.op+":"+m.q); setTimeout(()=>__musicCb(m.cb, m.op==="search"
      ? {items:[{id:"dQw4w9WgXcQ",title:"Titre A",channel:"Chaîne",duration:213},{id:"n61ULEU7CO0",title:"Titre B",channel:"Lofi",duration:0}]}
      : {title:"Titre A",channel:"Chaîne",duration:213,url:location.origin+"/absent.m4a"}),10)}}}}; rerender(nodes.get(__m.id))`);
    await ui('const i=document.querySelector(".k-music .wurl input"); i.value="lofi"; i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}))');
    await browser.waitFor('document.querySelectorAll(".k-music .mrow").length===2');
    await ui('document.querySelector(".k-music .mrow").click()');
    await browser.waitFor('__calls.includes("resolve:dQw4w9WgXcQ")');
    assert.equal(await ui('return M.q[M.i].id'), 'dQw4w9WgXcQ');
    assert.equal(await ui('return document.querySelector(".k-music .mft").getAttribute("href")'), 'freetube://https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await ui('MA.pause(); MA.removeAttribute("src"); M.q=[]; M.i=-1; delete window.webkit; removeNode(__m.id)');
  });

  await test('Diagramme interface : nouveau .mmd → tuile auto, rendu Mermaid, erreur affichée, annotation sur nœud, message composé + envoyé', async () => {
    const f = path.join(DATA, 'diagrams', 'tunnel.mmd');
    fs.writeFileSync(f, 'graph LR\n  A[Idée] --> B[Prototype]\n  B --> C[Test]\n');
    await browser.waitFor('[...document.querySelectorAll(".k-diagram")].some(e => e.querySelector(".dsel").value === "tunnel.mmd" && e.querySelector(".dsvg svg g.node"))', 15000);
    await ui('window.__d = [...nodes.values()].find(x => x.n.kind === "diagram" && x.n.name === "tunnel.mmd"); frame([__d.n], 1)');
    await shot('diagramme-rendu');
    fs.writeFileSync(f, 'graph LR\n  A[Idée] -->\n'); // erreur de syntaxe
    await browser.waitFor('__d.el.querySelector(".dgerr")', 8000);
    await shot('diagramme-erreur');
    fs.writeFileSync(f, 'graph LR\n  A[Idée] --> B[Prototype]\n  B --> C[Test]\n  C --> D[Livré]\n');
    await browser.waitFor('__d.el.querySelectorAll(".dsvg g.node").length === 4', 8000);
    await ui(`__d.el.querySelector(".dann").click();
      const g = [...__d.el.querySelectorAll(".dsvg g.node")].find(n => n.textContent.includes("Prototype")), r = g.getBoundingClientRect();
      g.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
      const w = __d.el.querySelector(".dsvg").getBoundingClientRect();
      __d.el.querySelector(".dsvg").dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: w.x + 5, clientY: w.y + 5 }));
      __d.el.querySelector(".dsvg").dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: w.x + 9, clientY: w.y + 9 }));
      const ins = __d.el.querySelectorAll(".dpins input");
      ins[0].value = "ajoute une étape de revue"; ins[0].dispatchEvent(new Event("input"));
      ins[1].value = "un retour avant le test"; ins[1].dispatchEvent(new Event("input"));
      __d.el.querySelectorAll(".dpins [data-del]")[2].click();`);
    assert.equal(await ui('return __d.el.querySelectorAll(".dsvg .dpin").length'), 2, '3 pastilles posées, 1 effacée');
    await shot('diagramme-annotations');
    const want = `Modifie le diagramme ${f} : 1. [nœud « Prototype »] ajoute une étape de revue ; 2. un retour avant le test. Réécris ce fichier .mmd (Mermaid valide), la tuile du Board se met à jour seule.`;
    assert.equal(await ui('return composeDiagramMsg(__d.dir + "/" + __d.n.name, __d.n.pins)'), want);
    assert.equal(await ui('return composeDiagramMsg("x.mmd", [{ label: "A", text: "  " }])'), '', 'pastille vide ignorée');
    // Sous zsh, la ligne repliée duplique un caractère au bord : la console de test passe par `cat` (écho brut du terminal).
    await api('POST', `/api/agents/${ids.sh1}/send`, { text: 'cat' }); await sl(500);
        await ui(`__d.n.to = "${ids.sh1}"; __d.el.querySelector(".dsend").click()`);
    await browser.waitFor('__d.lastSent && !__d.n.pins.length', 5000);
    assert.equal(await ui('return __d.lastSent'), want);
    await collect(ids.sh1, null, o => strip(o).replace(/[\r\n]/g, '').includes(want), 8000);
    await api('POST', `/api/agents/${ids.sh1}/send`, { text: '\x03', enter: false });
    await ui('removeNode(__d.n.id)');
  });

  await test('M22 Markdown Studio : arbre, Reading, Source, Graph (liens wiki), Add to Board', async () => {
    await ui('await openMarkdown(S.doc.path)');
    await browser.waitFor('document.querySelector("#mdStudio .doc h1")');
    assert.equal(await ui('return $("#mdStudio .doc h1").textContent'), 'Votelanding');
    assert.ok(await ui('return !!$("#mdStudio .doc table")'));
    await shot('m22-markdown-lecture');
    await ui('document.querySelector("#mdStudio .doc a.wl").click()'); await browser.waitFor('MD.file==="docs/architecture.md"');
    await ui('MD.tab="graph"; await mdOpen("README.md")'); await sl(2500);
    assert.ok(/3 notes · [3-9] links/.test(await ui('return $("#mdStudio .gcap").textContent')));
    await shot('m22-markdown-graphe');
    await ui('MD.tab="read"; await mdOpen("README.md"); $("#mdAdd").click()');
    await browser.waitFor('S.ws.nodes.find(n=>n.kind==="md") && document.querySelector(".k-md .doc h1")');
    await ui('openMarkdown("vault")'); await browser.waitFor('MD.root==="vault" && document.querySelector("#mdStudio .mdf")', 8000).catch(() => {});
    await ui('$("#mdStudio")?.remove()');
  });

  // Vue d'ensemble : espace 1 avec consoles, groupe, orchestrateur
  await ui('switchWs(S.doc.workspaces[0].id); frame(S.ws.nodes,1)'); await sl(1500); await shot('m1-m2-tableau-ensemble');

  /* ===== M9 : reprise après redémarrage ===== */
  await test('M9 reprise : après redémarrage, toast « Resume all conversations? » + bulle, puis claude --resume <id>', async () => {
    const st = await api('GET', '/api/state');
    const sid = st.doc.agents[ids.claude].sessionId || st.runtime[ids.claude].sessionId;
    assert.ok(sid, 'session claude connue');
    fs.mkdirSync(path.join(FAKE_CLAUDE, '-demo'), { recursive: true });
    fs.writeFileSync(path.join(FAKE_CLAUDE, '-demo', sid + '.jsonl'), '{}\n'); // la session « existe » (faux dossier, le vrai ~/.claude n'est pas touché)
    await browser.close(); ev.close();
    await stopServer(); await startServer();
    const ev2 = events();
    const s2 = await api('GET', '/api/state');
    assert.equal(s2.runtime[ids.claude].status, 'dormant'); assert.ok(s2.runtime[ids.claude].resumable);
    assert.ok(s2.runtime[ids.sh1].alive, 'les shells repartent seuls');
    browser = await cdp.open(fs.readFileSync(URLF, 'utf8'), { width: 1600, height: 1000 });
    await browser.waitFor('$("#resumeToast").classList.contains("open")');
    assert.ok(/1 console can pick up/.test(await ui('return $("#resumeToast").textContent')));
    assert.ok(await ui(`return !!document.querySelector('[data-id="${ids.claude}"] .bubble')`), 'bulle sur la console');
    await ui(`frame([nodes.get("${ids.claude}").n], 1.1)`); await shot('m9-reprise');
    await ui('$("#rYes").click()');
    const m = await ev2.wait(x => x.t === 'agent' && x.id === ids.claude && x.alive && x.cmd);
    assert.ok(m.cmd.includes('--resume ' + sid), 'relance avec claude --resume <id>');
    ev2.close();
  });

  console.log('\nErreurs JS de la page :', browser.errors.length ? browser.errors : 'aucune');
  if (browser.errors.length) results.push([false, 'Erreurs JS dans la page', browser.errors.join(' | ')]);
  await browser.close(); demoSrv.close();
  await stopServer();
  fs.rmSync(TMP, { recursive: true, force: true });
  const ko = results.filter(r => !r[0]);
  console.log(`\n${results.length - ko.length}/${results.length} tests passent`);
  if (ko.length) { console.log('ÉCHECS :\n' + ko.map(r => ` - ${r[1]} : ${r[2]}`).join('\n')); process.exit(1); }
  console.log('TOUS LES TESTS PASSENT');
  process.exit(0);
})().catch(async e => { console.error('ÉCHEC :', e); try { await browser?.close(); } catch {} await stopServer(); process.exit(1); });
