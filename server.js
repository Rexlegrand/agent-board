// Board : tableau infini de terminaux d'agents (node-pty + ws). Écoute uniquement 127.0.0.1, jeton exigé partout.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');
const { execFile } = require('child_process');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');

const PORT = +process.env.BOARD_PORT || 4777;
const HOST = '127.0.0.1';
const DIR = __dirname;
const DATA = process.env.BOARD_DATA || path.join(DIR, 'data');
const URLFILE = process.env.BOARD_URLFILE || path.join(DIR, '.url');
const TOKEN = crypto.randomBytes(24).toString('hex');
const MAX_BUF = 200 * 1024; // ponytail: on rejoue les 200 derniers Ko à la reconnexion, pas tout l'historique
const HOME = os.homedir();
const MEMORY_VAULT = (process.env.BOARD_MEMORY_DIR || path.join(HOME, 'memoire')).replace(/^~(?=\/|$)/, HOME); // coffre Obsidian / mémoire partagée (lecture seule)
const CLAUDE_PROJECTS = process.env.BOARD_CLAUDE_PROJECTS || path.join(HOME, '.claude/projects'); // surchargé par les tests
const CODEX_SESSIONS = process.env.BOARD_CODEX_SESSIONS || path.join(HOME, '.codex/sessions');

for (const d of ['repos', 'archive', 'hooks', 'assets', 'diagrams', 'images', 'todos']) fs.mkdirSync(path.join(DATA, d), { recursive: true });

/* ---------- Catalogue des CLI ---------- */
const CATALOG = [
  { id: 'claude', label: 'Claude', vendor: 'Anthropic', cmd: 'claude', yolo: ['--dangerously-skip-permissions'] },
  { id: 'codex', label: 'Codex', vendor: 'OpenAI', cmd: 'codex', yolo: ['--dangerously-bypass-approvals-and-sandbox'] },
  { id: 'gemini', label: 'Gemini', vendor: 'Google', cmd: 'gemini', yolo: ['--yolo'] },
  { id: 'aider', label: 'Aider', vendor: 'aider', cmd: 'aider', yolo: ['--yes-always'] },
  { id: 'cursor', label: 'Cursor', vendor: 'cursor-agent', cmd: 'cursor-agent' },
  { id: 'qwen', label: 'Qwen Code', vendor: 'qwen', cmd: 'qwen', yolo: ['--yolo'] },
  { id: 'opencode', label: 'OpenCode', vendor: 'opencode', cmd: 'opencode' },
  { id: 'grok', label: 'Grok', vendor: 'xAI', cmd: 'grok' },
  { id: 'amp', label: 'Amp', vendor: 'Sourcegraph', cmd: 'amp' },
  { id: 'goose', label: 'Goose', vendor: 'Block', cmd: 'goose' },
  { id: 'cline', label: 'Cline', vendor: 'cline', cmd: 'cline' },
  { id: 'copilot', label: 'Copilot', vendor: 'GitHub', cmd: 'copilot' },
  { id: 'droid', label: 'Droid', vendor: 'Factory', cmd: 'droid' },
  { id: 'crush', label: 'Crush', vendor: 'Charm', cmd: 'crush' },
  { id: 'codebuff', label: 'Codebuff', vendor: 'codebuff', cmd: 'codebuff' },
  { id: 'continue', label: 'Continue', vendor: 'cn', cmd: 'cn' },
  { id: 'kilo', label: 'Kilo Code', vendor: 'kilocode', cmd: 'kilocode' },
  { id: 'kimi', label: 'Kimi', vendor: 'Moonshot', cmd: 'kimi' },
  { id: 'auggie', label: 'Auggie', vendor: 'Augment', cmd: 'auggie' },
  { id: 'shell', label: 'Shell', vendor: 'Default', cmd: null },
];
let installed = new Set(['shell']);
function detectInstalled() {
  const cmds = CATALOG.filter(c => c.cmd).map(c => c.cmd).join(' ');
  execFile(process.env.SHELL || '/bin/zsh', ['-l', '-c', `for c in ${cmds}; do command -v $c >/dev/null 2>&1 && echo $c; done`],
    { timeout: 15000 }, (e, out) => {
      const ok = new Set(String(out || '').split('\n').filter(Boolean));
      installed = new Set(['shell', ...CATALOG.filter(c => c.cmd && ok.has(c.cmd)).map(c => c.id)]);
      broadcast({ t: 'catalog', catalog: catalog() });
    });
}
const catalog = () => [...CATALOG, ...(state.custom || []).map(c => ({ ...c, custom: true }))]
  .map(c => ({ id: c.id, label: c.label, vendor: c.vendor || 'custom', custom: !!c.custom, installed: c.custom || installed.has(c.id) }));
const cliDef = id => CATALOG.find(c => c.id === id) || (state.custom || []).find(c => c.id === id);

/* ---------- État global + documents de repo ---------- */
const STATE = path.join(DATA, 'state.json');
let state = readJSON(STATE) || { repos: [], current: null, settings: {}, custom: [] };
state.settings = { maxAgents: 10, defaultCli: 'claude', yolo: false, hooks: true, ...state.settings };
function isDirSync(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function writeJSON(f, o) { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); }

const slug = p => path.basename(p).replace(/[^\w.-]/g, '_') + '-' + crypto.createHash('sha1').update(p).digest('hex').slice(0, 8);
const docs = new Map(); // repoPath -> doc
const docFile = p => path.join(DATA, 'repos', slug(p) + '.json');
function newWs(name) { return { id: crypto.randomUUID(), name, view: { x: 0, y: 0, z: 1 }, nodes: [] }; }
function getDoc(p) {
  if (docs.has(p)) return docs.get(p);
  const d = readJSON(docFile(p)) || { path: p, name: path.basename(p), workspaces: [newWs('Workspace 1')], agents: {}, thread: [] };
  d.agents ||= {}; d.thread ||= [];
  if (!d.workspaces.length) d.workspaces.push(newWs('Workspace 1'));
  if (!d.workspaces.find(w => w.id === d.active)) d.active = d.workspaces[0].id;
  docs.set(p, d);
  return d;
}
const saveT = new Map();
function saveDoc(d) { clearTimeout(saveT.get(d.path)); saveT.set(d.path, setTimeout(() => writeJSON(docFile(d.path), d), 300)); }
function saveState() { writeJSON(STATE, state); }
function flushAll() { for (const [p, t] of saveT) { clearTimeout(t); const d = docs.get(p); if (d) writeJSON(docFile(p), d); } saveState(); }

/* ---------- Noms automatiques ---------- */
const NAMES = ['Nova', 'Leo', 'Iris', 'Kai', 'Dax', 'Rafa', 'Bex', 'Mila', 'Zoe', 'Juno', 'Theo', 'Luna', 'Finn', 'Ivy', 'Remy', 'Sol', 'Tess', 'Ezra', 'Lina', 'Noor'];
function pickName(d, cli, base) {
  const used = new Set(Object.values(d.agents).map(a => a.name));
  if (!base) { base = NAMES.find(n => !used.has(n)); if (base) return base; base = NAMES[Object.keys(d.agents).length % NAMES.length]; }
  else base = base.replace(/ \d+$/, '');
  for (let i = 2; ; i++) if (!used.has(`${base} ${i}`)) return `${base} ${i}`;
}

// Migration de l'ancien layout.json (v1) : ses cartes deviennent des consoles du repo de la 1re carte.
const LAYOUT_V1 = process.env.BOARD_LAYOUT || path.join(DIR, 'layout.json');
if (!fs.existsSync(STATE) && fs.existsSync(LAYOUT_V1)) {
  const old = readJSON(LAYOUT_V1);
  const repo = (old?.cards || []).map(c => c.cwd).find(isDirSync) || DIR;
  const d = getDoc(repo); const ws = d.workspaces[0];
  for (const c of old?.cards || []) {
    const id = c.id, name = pickName(d, c.kind === 'claude' ? 'claude' : 'shell');
    d.agents[id] = { id, cli: c.kind === 'claude' ? 'claude' : 'shell', name, cwd: c.cwd, ws: ws.id, cols: c.cols, rows: c.rows };
    ws.nodes.push({ id, kind: 'agent', x: c.x, y: c.y, w: c.w, h: c.h });
  }
  state.repos = [repo]; state.current = repo; writeJSON(docFile(repo), d); saveState();
}

/* ---------- Sessions PTY ---------- */
const sessions = new Map(); // agentId -> { a, repo, pty, buf, alive, sockets, status, detail, since, hooked }
const findAgent = id => { for (const d of docs.values()) if (d.agents[id]) return [d, d.agents[id]]; return []; };
const shq = s => /^[\w@%+=:,./-]+$/.test(s) ? s : "'" + String(s).replace(/'/g, `'\\''`) + "'";

function cleanEnv(extra) {
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', SHELL_SESSIONS_DISABLE: '1', ...extra };
  // Root (VPS) : sans IS_SANDBOX, --dangerously-skip-permissions refuse de démarrer.
  if (process.getuid && process.getuid() === 0) env.IS_SANDBOX = '1';
  // Un `claude` lancé depuis un process Claude Code se croirait imbriqué : on retire ces variables.
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE')) delete env[k];
  return env;
}

// Hooks Claude Code : fichier de settings propre au board, passé par --settings (jamais ~/.claude/settings.json).
const HOOKS_FILE = path.join(DATA, 'hooks', 'claude-hooks.json');
const HOOK_CMD = 'if [ -n "$BOARD_HOOK_URL" ]; then curl -s -m 2 -X POST -H "x-token: $BOARD_TOKEN" -H "Content-Type: application/json" --data-binary @- "$BOARD_HOOK_URL" >/dev/null 2>&1; fi; true';
const hk = { hooks: [{ type: 'command', command: HOOK_CMD, timeout: 5 }] };
writeJSON(HOOKS_FILE, { hooks: {
  SessionStart: [hk], UserPromptSubmit: [hk], PreToolUse: [{ matcher: '*', ...hk }], PostToolUse: [{ matcher: '*', ...hk }],
  Notification: [hk], Stop: [hk], SessionEnd: [hk],
} });

// Diagrammes : les Claude du Board écrivent un .mmd ici, le serveur surveille et pousse en WS ; la tuile Diagramme l'affiche.
const DIAG = path.join(DATA, 'diagrams');
const DIAG_PROMPT = path.join(DATA, 'hooks', 'diagram-prompt.md');
fs.writeFileSync(DIAG_PROMPT, `Board (interface de l'utilisateur) : pour lui montrer un diagramme, écris un fichier Mermaid dans ${DIAG}/<nom-court>.mmd (chemin absolu, Mermaid valide uniquement, sans bloc \`\`\`). Le Board l'ouvre aussitôt dans une tuile et le redessine à chaque écriture. Pour le modifier, réécris le même fichier. Quand tu reçois « Modifie le diagramme <chemin> : 1. … » (ses annotations numérotées, avec le libellé du nœud visé), applique-les à ce fichier.\n`);
const diagOwner = {}; // nom.mmd -> id de la console qui l'a écrit (vu par les hooks PreToolUse/PostToolUse)
const diagName = n => /^[\w.-]+\.mmd$/.test(n || '') ? n : null;
function diagInfo(name) {
  const f = path.join(DIAG, name);
  try { return { name, path: f, text: fs.readFileSync(f, 'utf8').slice(0, 200000), mtime: fs.statSync(f).mtimeMs, owner: diagOwner[name] || null }; } catch { return null; }
}
const diagT = {};
fs.watch(DIAG, (e, name) => { // ponytail: fs.watch du dossier (pas de sous-dossiers), suffit pour un dossier plat
  if (!diagName(name)) return;
  clearTimeout(diagT[name]);
  diagT[name] = setTimeout(() => broadcast({ t: 'diagram', ...(diagInfo(name) || { name, gone: true }) }), 150);
});

// Images : un Claude enregistre ses images dans data/images/<lot>/ ; la tuile Images s'ouvre et les montre en grille.
const IMG = path.join(DATA, 'images');
fs.appendFileSync(DIAG_PROMPT, `Pour lui montrer des images (générées, captures, références), enregistre-les dans ${IMG}/<lot-court>/ (un sous-dossier par lot, png/jpg/webp/gif ou vidéos mp4/webm/mov, chemin absolu ; une URL : télécharge-la avec curl -o ; vidéos : seulement la sélection utile, 12 max par lot, jamais des dizaines). Le Board ouvre aussitôt une tuile Images en grille sur ce lot. Ne refais pas de page/artefact pour les montrer. Quand tu reçois « Images du lot … », ses n° renvoient aux fichiers de ce dossier (images de référence à utiliser).\n`);
const IMG_RE = /\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|m4v)$/i; // images et vidéos
let imgOwner = null; // dernière console dont un outil a touché data/images (hooks)
const albumOf = rel => rel.includes('/') ? rel.split('/')[0] : '';
function imgList(album) {
  const d = inside(IMG, album || '');
  if (!d) return null;
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return []; }
  return ents.filter(e => e.isFile() && IMG_RE.test(e.name) && !e.name.startsWith('.'))
    .map(e => { try { const st = fs.statSync(path.join(d, e.name)); return { name: e.name, mtime: st.mtimeMs, size: st.size }; } catch { return null; } })
    .filter(Boolean).sort((a, b) => a.mtime - b.mtime);
}
const imgT = {};
try {
  fs.watch(IMG, { recursive: true }, (e, rel) => { // un push par lot, après 600 ms de calme (rafales de générations)
    if (!rel || !IMG_RE.test(rel) || rel.split(path.sep).length > 2) return;
    const album = albumOf(rel.split(path.sep).join('/'));
    clearTimeout(imgT[album]);
    imgT[album] = setTimeout(() => broadcast({ t: 'images', album, owner: imgOwner }), 600);
  });
} catch (e) { console.error('watch images:', e.message); }

function claudeSessionExists(sid) {
  if (!sid) return false;
  const root = CLAUDE_PROJECTS;
  try { return fs.readdirSync(root).some(d => fs.existsSync(path.join(root, d, sid + '.jsonl'))); } catch { return false; }
}
function codexSessionExists(sid) {
  if (!sid) return false;
  try { return findFiles(CODEX_SESSIONS, f => f.includes(sid) && f.endsWith('.jsonl'), 4).length > 0; } catch { return false; }
}
function findFiles(dir, test, depth = 6, out = []) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth > 0 && e.name !== 'node_modules' && e.name !== '.git') findFiles(p, test, depth - 1, out); }
    else if (test(p)) out.push(p);
  }
  return out;
}
const resumable = a => a.cli === 'claude' ? claudeSessionExists(a.sessionId) : a.cli === 'codex' ? codexSessionExists(a.sessionId) : false;

// To-do : un Claude écrit data/todos/<nom>.json (checklist, kanban, calendrier) ; la tuile s'ouvre, l'utilisateur coche, la tuile réécrit le fichier.
const TODO = path.join(DATA, 'todos');
fs.appendFileSync(DIAG_PROMPT, `To-do du Board : quand l'utilisateur demande une checklist, un board (= kanban) ou un calendrier, écris un JSON dans ${TODO}/<nom-court>.json (chemin absolu, JSON valide). Le Board ouvre aussitôt la tuile et la redessine à chaque réécriture. L'utilisateur coche et modifie dans la tuile, qui réécrit le fichier : relis-le toujours avant de le modifier, et réécris le même fichier pour mettre à jour (ls ${TODO} montre ceux qui existent). Formats :
- checklist : {"kind":"checklist","title":"…","items":[{"text":"…","done":false}]} (done:true = barré, déjà fait).
- board : {"kind":"kanban","title":"…","columns":[{"name":"To do","cards":[{"title":"…","notes":"","due":"AAAA-MM-JJ","priority":"low|med|high","done":false}]}]} (colonnes Backlog, To do, In progress, Done sauf demande contraire).
- calendrier : {"kind":"calendar","title":"…","month":"AAAA-MM","events":[{"title":"Launch","date":"AAAA-MM-JJ","notes":""}]}.
« Checklist de ce qui reste » : reprends tout ce qui était prévu, done:true pour ce qui est fait (vérifié), done:false pour le reste.\n`);
const todoOwner = {};
const todoName = n => /^[\w.-]+\.json$/.test(n || '') ? n : null;
function todoInfo(name) {
  const f = path.join(TODO, name);
  try { return { name, path: f, data: JSON.parse(fs.readFileSync(f, 'utf8')), mtime: fs.statSync(f).mtimeMs, owner: todoOwner[name] || null }; } catch { return null; }
}
const todoT = {};
fs.watch(TODO, (e, name) => {
  if (!todoName(name)) return;
  clearTimeout(todoT[name]);
  todoT[name] = setTimeout(() => { const i = todoInfo(name); if (i) broadcast({ t: 'todo', ...i }); }, 150); // JSON à moitié écrit : on attend la réécriture suivante
});

// Rôle d'une console : data/roles/<Nom>.md (« Nova 2 » prend Nova.md), ajouté à la consigne diagrammes.
const ROLES_DIR = path.join(DATA, 'roles');
function agentPrompt(a) {
  let role; try { role = fs.readFileSync(path.join(ROLES_DIR, a.name.replace(/ \d+$/, '') + '.md'), 'utf8'); } catch { return DIAG_PROMPT; }
  const f = path.join(DATA, 'hooks', `prompt-${a.id}.md`);
  fs.writeFileSync(f, fs.readFileSync(DIAG_PROMPT, 'utf8') + '\n' + role);
  return f;
}

function buildCmd(a, resume) {
  const def = cliDef(a.cli);
  if (!def || !def.cmd) return null; // shell
  if (def.custom || !CATALOG.includes(def)) return def.cmd; // exécutable perso : tel quel
  const args = [];
  if (a.cli === 'claude') {
    if (resume && claudeSessionExists(a.sessionId)) args.push('--resume', a.sessionId);
    else { a.sessionId = crypto.randomUUID(); args.push('--session-id', a.sessionId); }
    if (state.settings.hooks) args.push('--settings', HOOKS_FILE);
    args.push('--append-system-prompt-file', agentPrompt(a));
    // Pont Chrome : pilote le Chrome de ton ordinateur (extension Claude in Chrome) même depuis le VPS. BOARD_CHROME=0 pour couper.
    if (process.env.BOARD_CHROME !== '0') args.push('--chrome');
  }
  if (a.cli === 'codex') {
    if (resume && codexSessionExists(a.sessionId)) args.push('resume', a.sessionId);
    if (state.settings.hooks) args.push('-c', 'notify=' + JSON.stringify(['sh', '-c', 'curl -s -m 2 -X POST -H "x-token: $BOARD_TOKEN" -H "Content-Type: application/json" --data "$1" "$BOARD_HOOK_URL" >/dev/null 2>&1; true', 'sh']));
  }
  if (a.yolo && def.yolo) args.push(...def.yolo);
  return [def.cmd, ...args].map(shq).join(' ');
}

function setStatus(s, status, detail = '') {
  if (s.status !== status) s.since = Date.now();
  s.status = status; s.detail = String(detail || '').slice(0, 80);
  broadcast({ t: 'agent', ...runtime(s.a.id) });
}
function runtime(id) {
  const s = sessions.get(id);
  const [, a] = findAgent(id);
  if (!s) return { id, alive: false, status: 'dormant', resumable: a ? resumable(a) : false, sessionId: a?.sessionId };
  return { id, alive: s.alive, status: s.status, detail: s.detail, since: s.since, sessionId: s.a.sessionId, cmd: s.cmd };
}
const liveAgents = () => [...sessions.values()].filter(s => s.alive && s.a.cli !== 'shell').length;

function spawnAgent(d, a, resume) {
  const old = sessions.get(a.id);
  if (old && old.pty) { const p = old.pty; old.pty = null; try { p.kill(); } catch {} }
  const shell = process.env.SHELL || '/bin/zsh';
  const cmd = buildCmd(a, resume);
  const args = cmd ? ['-l', '-i', '-c', cmd] : ['-l'];
  const s = old || { buf: '', sockets: new Set() };
  Object.assign(s, { a, cmd: cmd || 'shell', repo: d.path, alive: true, hooked: false, status: 'starting', detail: '', since: Date.now(), paused: false });
  s.buf += resume && cmd ? `\r\n\x1b[2m${cliDef(a.cli).label} lane — picking up your last chat.\x1b[0m\r\n` : '';
  const env = cleanEnv({ BOARD_CARD_ID: a.id, BOARD_TOKEN: TOKEN, BOARD_HOOK_URL: `http://${HOST}:${PORT}/api/hook?card=${a.id}` });
  const p = s.pty = pty.spawn(shell, args, {
    name: 'xterm-256color', cols: a.cols || 100, rows: a.rows || 30, cwd: isDir(a.cwd) ? a.cwd : HOME, env,
  });
  p.onData(dt => {
    if (s.pty !== p) return;
    s.buf += dt;
    if (s.buf.length > MAX_BUF) s.buf = s.buf.slice(-MAX_BUF);
    for (const ws of s.sockets) ws.send(JSON.stringify({ t: 'out', d: dt }));
    // Repli sans hook : sortie récente = travaille, 2,5 s de silence = au repos.
    if (!s.hooked && !s.paused) {
      if (s.status !== 'working') setStatus(s, 'working');
      clearTimeout(s.idleT); s.idleT = setTimeout(() => !s.hooked && s.alive && !s.paused && setStatus(s, 'idle'), 2500);
    }
  });
  p.onExit(({ exitCode }) => {
    if (s.pty !== p) return;
    s.alive = false; clearTimeout(s.idleT);
    for (const ws of s.sockets) ws.send(JSON.stringify({ t: 'exit', code: exitCode }));
    setStatus(s, 'exited');
  });
  sessions.set(a.id, s);
  saveDoc(d);
  for (const ws of s.sockets) ws.send(JSON.stringify({ t: 'restart' }));
  broadcast({ t: 'agent', ...runtime(a.id) }); sys();
  return s;
}

function killAgent(id) {
  const s = sessions.get(id);
  if (!s) return;
  const p = s.pty; s.pty = null; s.alive = false; clearTimeout(s.idleT);
  try { p && p.kill(); } catch {}
  for (const ws of s.sockets) ws.close();
  sessions.delete(id);
}

// Pause : SIGSTOP sur le process et tous ses descendants (le CLI tourne souvent dans son propre groupe).
function signalTree(pid, sig) {
  return new Promise(res => execFile('ps', ['-axo', 'pid=,ppid='], (e, out) => {
    const kids = new Map();
    for (const l of String(out).trim().split('\n')) { const [a, b] = l.trim().split(/\s+/).map(Number); if (!kids.has(b)) kids.set(b, []); kids.get(b).push(a); }
    const all = [], q = [pid];
    while (q.length) { const x = q.shift(); all.push(x); q.push(...(kids.get(x) || [])); }
    for (const x of all) try { process.kill(x, sig); } catch {}
    res(all.length);
  }));
}

// Au chargement d'un repo : les shells et les CLI sans conversation à reprendre redémarrent ; les autres attendent « Resume ? ».
function wakeRepo(d) {
  for (const a of Object.values(d.agents)) {
    if (sessions.has(a.id)) continue;
    if (a.cli === 'shell' || !resumable(a)) spawnAgent(d, a, false);
  }
}

/* ---------- RAM libre (vm_stat : libre + inactive + spéculative) ---------- */
let ram = { freeMB: Math.round(os.freemem() / 1048576), totalMB: Math.round(os.totalmem() / 1048576) };
function readRam() {
  if (process.platform === 'linux') { // VPS : MemAvailable
    try { const m = /MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8')); if (m) ram.freeMB = Math.round(+m[1] / 1024); } catch {}
    return sys();
  }
  execFile('vm_stat', (e, out) => {
    if (e) return;
    const ps = +(/page size of (\d+)/.exec(out) || [])[1] || 16384;
    const g = k => +((new RegExp(k + ':\\s+(\\d+)')).exec(out) || [])[1] || 0;
    ram.freeMB = Math.round((g('Pages free') + g('Pages inactive') + g('Pages speculative') + g('Pages purgeable')) * ps / 1048576);
    sys();
  });
}
const liveAll = () => [...sessions.values()].filter(s => s.alive).length;
function sys() { broadcast({ t: 'sys', ram, live: liveAll(), agents: liveAgents(), max: state.settings.maxAgents }); }

/* ---------- Git ---------- */
function run(cmd, args, cwd, timeout = 60000) {
  return new Promise(res => execFile(cmd, args, { cwd, maxBuffer: 8 * 1024 * 1024, timeout },
    (err, stdout, stderr) => res({ ok: !err, out: String(stdout), err: String(stderr || (err && err.message) || '') })));
}
const git = (cwd, args) => run('git', args, cwd);
function remoteInfo(url) {
  const m = /github\.com[:/]([^/]+)\/(.+?)(\.git)?$/.exec(url || '');
  return m ? { owner: m[1], repo: m[2], web: `https://github.com/${m[1]}/${m[2]}` } : url ? { web: null, repo: url } : null;
}

/* ---------- Usage / tokens (journaux locaux) ---------- */
let usageCache = null, usageBusy = null;
const dayOf = ts => { const d = new Date(ts); return isNaN(d) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
async function scanUsage() {
  const days = {}; // date -> { claude:{in,out,cache}, codex:{...} }
  const models = {}, sessionsN = { claude: 0, codex: 0 };
  const add = (date, cli, i, o, c) => {
    if (!date) return;
    const x = (days[date] ||= {})[cli] ||= { in: 0, out: 0, cache: 0 };
    x.in += i; x.out += o; x.cache += c;
  };
  const seen = new Set(); // dédoublonnage message.id + requestId (un message apparaît sur plusieurs lignes)
  for (const f of findFiles(CLAUDE_PROJECTS, p => p.endsWith('.jsonl'), 4)) {
    let any = false;
    const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
    for await (const l of rl) {
      if (!l.includes('"usage"')) continue;
      let j; try { j = JSON.parse(l); } catch { continue; }
      const u = j.message && j.message.usage;
      if (j.type !== 'assistant' || !u) continue;
      const k = j.message.id + ':' + j.requestId;
      if (seen.has(k)) continue; seen.add(k); any = true;
      add(dayOf(j.timestamp), 'claude', u.input_tokens || 0, u.output_tokens || 0, (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0));
      if (j.message.model && !j.message.model.startsWith('<')) models[j.message.model] = (models[j.message.model] || 0) + (u.output_tokens || 0);
    }
    if (any) sessionsN.claude++;
  }
  for (const f of findFiles(CODEX_SESSIONS, p => p.endsWith('.jsonl'), 4)) {
    let prev = -1, any = false;
    const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
    for await (const l of rl) {
      if (!l.includes('token_count')) continue;
      let j; try { j = JSON.parse(l); } catch { continue; }
      const info = j.payload && j.payload.info;
      if (!info || !info.last_token_usage) continue;
      const tot = info.total_token_usage ? info.total_token_usage.total_tokens : -2;
      if (tot === prev) continue; prev = tot; any = true; // le même événement est parfois émis deux fois
      const u = info.last_token_usage;
      add(dayOf(j.timestamp), 'codex', (u.input_tokens || 0) - (u.cached_input_tokens || 0), (u.output_tokens || 0), (u.cached_input_tokens || 0) + (u.cache_write_input_tokens || 0));
    }
    if (any) sessionsN.codex++;
  }
  const dates = Object.keys(days).sort();
  const sum = (filter) => {
    const r = {};
    for (const dt of dates) if (filter(dt)) for (const [cli, x] of Object.entries(days[dt])) {
      const y = r[cli] ||= { in: 0, out: 0, cache: 0 }; y.in += x.in; y.out += x.out; y.cache += x.cache;
    }
    for (const y of Object.values(r)) y.total = y.in + y.out + y.cache;
    return r;
  };
  const cut = dayOf(Date.now() - 29 * 864e5);
  const tot = dt => Object.values(days[dt]).reduce((s, x) => s + x.in + x.out + x.cache, 0);
  const last30 = dates.filter(d => d >= cut);
  // Séries de jours actifs
  let longest = 0, run1 = 0, prevD = null;
  for (const dt of dates) { run1 = prevD && (new Date(dt) - new Date(prevD)) === 864e5 ? run1 + 1 : 1; longest = Math.max(longest, run1); prevD = dt; }
  let current = 0; for (let t = Date.now(); days[dayOf(t)]; t -= 864e5) current++;
  return {
    scannedAt: Date.now(), days, today: days[dayOf(Date.now())] || {},
    last30: sum(dt => dt >= cut), allTime: sum(() => true),
    busiestDay: last30.sort((a, b) => tot(b) - tot(a))[0] || null,
    favoriteModel: Object.entries(models).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    sessions: sessionsN, activeDays: dates.length, firstDay: dates[0] || null, longestStreak: longest, currentStreak: current,
  };
}
function getUsage(force) {
  if (usageCache && !force && Date.now() - usageCache.scannedAt < 120000) return Promise.resolve(usageCache);
  return usageBusy ||= scanUsage().then(u => (usageCache = u)).finally(() => { usageBusy = null; });
}

// Limites du forfait Claude (% session 5 h et semaine, comme /usage) : API d'usage du compte, jeton OAuth du CLI (lu ici, jamais renvoyé au navigateur).
let limitsCache = null;
async function getLimits(force) {
  if (limitsCache && !force && Date.now() - limitsCache.fetchedAt < 60000) return limitsCache;
  let c; try { c = JSON.parse(fs.readFileSync(path.join(HOME, '.claude', '.credentials.json'), 'utf8')).claudeAiOauth; } catch {}
  if (!c?.accessToken) return { error: 'Pas de connexion Claude lisible ici (sur le Mac le jeton est dans le trousseau) : % visibles sur le Board VPS.', fetchedAt: Date.now() };
  if (c.expiresAt && c.expiresAt < Date.now()) return { error: 'Jeton Claude expiré : une console Claude active le renouvelle tout seul, réessaie dans une minute.', fetchedAt: Date.now() };
  try {
    const r = await fetch('https://api.anthropic.com/api/oauth/usage', { headers: { Authorization: 'Bearer ' + c.accessToken, 'anthropic-beta': 'oauth-2025-04-20' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), w = k => j[k] && { pct: j[k].utilization, resetsAt: j[k].resets_at };
    return limitsCache = { session: w('five_hour'), week: w('seven_day'), weekOpus: w('seven_day_opus'), weekSonnet: w('seven_day_sonnet'), plan: c.subscriptionType, fetchedAt: Date.now() };
  } catch (e) { return limitsCache && Date.now() - limitsCache.fetchedAt < 30 * 60e3 ? { ...limitsCache, stale: true } : { error: 'Lecture des limites impossible (' + e.message + ').', fetchedAt: Date.now() }; }
}

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.avif': 'image/avif', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
const STATIC = {
  '/vendor/xterm.js': 'node_modules/@xterm/xterm/lib/xterm.js',
  '/vendor/xterm.css': 'node_modules/@xterm/xterm/css/xterm.css',
  '/vendor/addon-fit.js': 'node_modules/@xterm/addon-fit/lib/addon-fit.js',
  '/vendor/mermaid.js': 'public/vendor/mermaid-11.17.2.min.js', // version figée, servie en local (hors ligne)
};
const EXTRA_PORTS = String(process.env.BOARD_TUNNEL_PORTS || '').split(',').filter(Boolean); // ports du tunnel SSH côté Mac (VPS)
const hostOk = h => [String(PORT), ...EXTRA_PORTS].some(p => h === `${HOST}:${p}` || h === `localhost:${p}`); // anti DNS-rebinding
const isDir = isDirSync;
function expand(p) {
  p = String(p || '~').trim();
  if (p === '~' || p.startsWith('~/')) p = path.join(HOME, p.slice(1));
  return path.resolve(p);
}
const inside = (root, p) => { const r = path.resolve(root), x = path.resolve(root, p); return x === r || x.startsWith(r + path.sep) ? x : null; };
function body(req, limit = 1e6) {
  return new Promise(r => {
    let b = '', n = 0;
    req.on('data', c => { n += c.length; if (n <= limit) b += c; });
    req.on('end', () => { if (n > limit) return r({ __tooBig: true }); try { r(JSON.parse(b || '{}')); } catch { r({}); } });
  });
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }

function stateOut() {
  const d = state.current ? getDoc(state.current) : null;
  if (d) wakeRepo(d);
  const rt = {};
  if (d) for (const id of Object.keys(d.agents)) rt[id] = runtime(id);
  return { repos: state.repos.map(p => ({ path: p, name: path.basename(p) })), current: state.current, settings: state.settings,
    catalog: catalog(), doc: d, runtime: rt, sys: { ram, live: liveAll(), agents: liveAgents(), max: state.settings.maxAgents }, home: HOME, vault: MEMORY_VAULT };
}

function createAgents(d, items) {
  const want = items.filter(i => (i.cli || 'claude') !== 'shell').length;
  if (liveAgents() + want > state.settings.maxAgents)
    return { error: `Plafond atteint : ${liveAgents()}/${state.settings.maxAgents} agents vivants (RAM libre ${ram.freeMB} Mo). Ferme des consoles ou monte le plafond dans Réglages.` };
  const out = [];
  for (const it of items) {
    const cli = cliDef(it.cli) ? it.cli : 'claude';
    const ws = d.workspaces.find(w => w.id === it.ws) || d.workspaces.find(w => w.id === d.active);
    const id = crypto.randomUUID();
    const a = { id, cli, name: it.name || pickName(d, cli, it.baseName), cwd: it.cwd && isDir(expand(it.cwd)) ? expand(it.cwd) : d.path, ws: ws.id,
      yolo: !!(it.yolo ?? state.settings.yolo), role: it.role || null, groupId: it.groupId || null, createdAt: Date.now() };
    d.agents[id] = a;
    const node = { id, kind: 'agent', x: Math.round(+it.x || 0), y: Math.round(+it.y || 0), w: +it.w || 560, h: +it.h || 360, groupId: a.groupId };
    ws.nodes.push(node);
    spawnAgent(d, a, false);
    out.push({ agent: a, node, runtime: runtime(id) });
  }
  saveDoc(d);
  return { created: out };
}

const server = http.createServer(async (req, res) => {
  if (!hostOk(req.headers.host)) { res.writeHead(403); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const q = k => url.searchParams.get(k);

  if (req.method === 'GET' && (p === '/' || STATIC[p] || /^\/[\w-]+\.(js|css)$/.test(p))) {
    const f = p === '/' ? 'public/index.html' : STATIC[p] || 'public' + p;
    if (!fs.existsSync(path.join(DIR, f))) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)], 'Cache-Control': 'no-store' });
    return fs.createReadStream(path.join(DIR, f)).pipe(res);
  }
  if (req.method === 'GET' && p.startsWith('/assets/')) { // images déposées (jeton en paramètre : <img> n'envoie pas d'en-tête)
    if (q('t') !== TOKEN) { res.writeHead(401); return res.end(); }
    const f = inside(path.join(DATA, 'assets'), p.slice(8));
    if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'max-age=86400' });
    return fs.createReadStream(f).pipe(res);
  }
  if (req.method === 'GET' && p.startsWith('/images/')) { // fichiers de data/images (jeton en paramètre, comme /assets)
    if (q('t') !== TOKEN) { res.writeHead(401); return res.end(); }
    const f = inside(IMG, decodeURIComponent(p.slice(8)));
    if (!f || !IMG_RE.test(f) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', size = fs.statSync(f).size;
    const rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || ''); // Range : lecture et avance rapide des vidéos
    if (rg) {
      const start = rg[1] ? +rg[1] : Math.max(0, size - +rg[2]), end = rg[1] && rg[2] ? Math.min(+rg[2], size - 1) : size - 1;
      if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-cache' });
      return fs.createReadStream(f, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    return fs.createReadStream(f).pipe(res);
  }
  if (!p.startsWith('/api/')) { res.writeHead(404); return res.end(); }
  if (req.headers['x-token'] !== TOKEN) return json(res, 401, { error: 'jeton invalide' });

  const b = ['POST', 'PUT'].includes(req.method) ? await body(req, p === '/api/upload' ? 20e6 : 5e6) : {};
  if (b.__tooBig) return json(res, 413, { error: 'trop gros' });
  const cur = state.current ? getDoc(state.current) : null;

  /* --- état, repos, espaces --- */
  if (p === '/api/state') return json(res, 200, stateOut());
  if (p === '/api/repo/open' && req.method === 'POST') {
    const dir = expand(b.path);
    if (!isDir(dir)) return json(res, 400, { error: `Dossier introuvable : ${dir}` });
    state.current = dir; state.repos = [dir, ...state.repos.filter(x => x !== dir)].slice(0, 20); saveState();
    return json(res, 200, stateOut());
  }
  if (p === '/api/repo/home' && req.method === 'POST') { state.current = null; saveState(); return json(res, 200, stateOut()); }
  if (p === '/api/repo/close' && req.method === 'POST') { // « Close » : le tableau part aux archives, jamais effacé
    const dir = expand(b.path || state.current);
    const d = getDoc(dir);
    for (const id of Object.keys(d.agents)) killAgent(id);
    clearTimeout(saveT.get(dir));
    writeJSON(path.join(DATA, 'archive', `${slug(dir)}-${Date.now()}.json`), d);
    try { fs.unlinkSync(docFile(dir)); } catch {}
    docs.delete(dir);
    state.repos = state.repos.filter(x => x !== dir); if (state.current === dir) state.current = null; saveState(); sys();
    return json(res, 200, stateOut());
  }
  if (p === '/api/doc' && req.method === 'PUT') {
    if (!cur || b.path !== cur.path || !Array.isArray(b.workspaces)) return json(res, 400, { error: 'document invalide' });
    const removedWs = cur.workspaces.filter(w => !b.workspaces.find(x => x.id === w.id)).map(w => w.id);
    cur.workspaces = b.workspaces.map(w => ({ id: String(w.id), name: String(w.name || 'Workspace'), view: w.view || { x: 0, y: 0, z: 1 }, nodes: Array.isArray(w.nodes) ? w.nodes : [] }));
    if (!cur.workspaces.length) cur.workspaces.push(newWs('Workspace 1'));
    cur.active = cur.workspaces.find(w => w.id === b.active) ? b.active : cur.workspaces[0].id;
    if (Array.isArray(b.thread)) cur.thread = b.thread.slice(-200);
    for (const a of Object.values(cur.agents)) { // les consoles sont à nous : une course ne doit pas en perdre une
      if (removedWs.includes(a.ws)) { killAgent(a.id); delete cur.agents[a.id]; continue; }
      const ws = cur.workspaces.find(w => w.id === a.ws) || cur.workspaces[0];
      const node = ws.nodes.find(n => n.id === a.id);
      if (!node) ws.nodes.push({ id: a.id, kind: 'agent', x: 0, y: 0, w: 560, h: 360 });
      else if ('groupId' in node) a.groupId = node.groupId || null;
    }
    saveDoc(cur); sys();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/settings' && req.method === 'POST') {
    const s = state.settings;
    if (Number.isFinite(+b.maxAgents) && b.maxAgents !== undefined) s.maxAgents = Math.max(1, Math.min(30, Math.round(+b.maxAgents)));
    if (typeof b.yolo === 'boolean') s.yolo = b.yolo;
    if (typeof b.hooks === 'boolean') s.hooks = b.hooks;
    if (b.defaultCli && cliDef(b.defaultCli)) s.defaultCli = b.defaultCli;
    if (b.addCustom && b.addCustom.label && b.addCustom.cmd) state.custom.push({ id: 'custom-' + crypto.randomBytes(3).toString('hex'), label: String(b.addCustom.label).slice(0, 30), cmd: String(b.addCustom.cmd).slice(0, 300) });
    saveState(); sys(); broadcast({ t: 'catalog', catalog: catalog() });
    return json(res, 200, { settings: s, catalog: catalog() });
  }

  /* --- consoles d'agents --- */
  const am = p.match(/^\/api\/agents\/([\w-]+)(\/(start|send|update))?$/);
  if (p === '/api/agents' && req.method === 'POST') {
    if (!cur) return json(res, 400, { error: 'aucun repo ouvert' });
    const r = createAgents(cur, Array.isArray(b.items) ? b.items : [b]);
    return json(res, r.error ? 429 : 200, r);
  }
  if (p === '/api/agents/signal' && req.method === 'POST') {
    let n = 0;
    for (const id of b.ids || []) {
      const s = sessions.get(id);
      if (!s || !s.alive || !s.pty) continue;
      await signalTree(s.pty.pid, b.op === 'pause' ? 'SIGSTOP' : 'SIGCONT');
      s.paused = b.op === 'pause';
      setStatus(s, s.paused ? 'paused' : 'idle'); n++;
    }
    return json(res, 200, { ok: true, n });
  }
  if (am && !am[2] && req.method === 'DELETE') {
    const [d] = findAgent(am[1]);
    killAgent(am[1]);
    if (d) { delete d.agents[am[1]]; for (const w of d.workspaces) w.nodes = w.nodes.filter(n => n.id !== am[1]); saveDoc(d); }
    sys(); return json(res, 200, { ok: true });
  }
  if (am && am[3] === 'start' && req.method === 'POST') {
    const [d, a] = findAgent(am[1]);
    if (!a) return json(res, 404, { error: 'console inconnue' });
    if (a.cli !== 'shell' && !sessions.get(a.id)?.alive && liveAgents() + 1 > state.settings.maxAgents)
      return json(res, 429, { error: `Plafond atteint (${state.settings.maxAgents} agents).` });
    if (b.cli && cliDef(b.cli)) { a.cli = b.cli; a.sessionId = null; }
    if (typeof b.yolo === 'boolean') a.yolo = b.yolo;
    spawnAgent(d, a, !!b.resume);
    return json(res, 200, runtime(a.id));
  }
  if (am && am[3] === 'update' && req.method === 'POST') {
    const [d, a] = findAgent(am[1]);
    if (!a) return json(res, 404, { error: 'console inconnue' });
    if (b.name) a.name = String(b.name).slice(0, 40);
    if ('role' in b) a.role = b.role || null;
    if ('groupId' in b) a.groupId = b.groupId || null;
    saveDoc(d); return json(res, 200, a);
  }
  if (am && am[3] === 'send' && req.method === 'POST') {
    const s = sessions.get(am[1]);
    if (!s || !s.alive || !s.pty) return json(res, 409, { error: 'console arrêtée' });
    const text = String(b.text || '');
    // Coller en mode « bracketed paste » puis Entrée à part : les TUI (claude, codex) traitent alors le texte comme une saisie.
    s.pty.write(text.includes('\n') ? `\x1b[200~${text}\x1b[201~` : text);
    if (b.enter !== false) setTimeout(() => s.pty && s.pty.write('\r'), 120);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/hook' && req.method === 'POST') {
    const s = sessions.get(q('card'));
    if (!s) return json(res, 404, {});
    const ev = b.hook_event_name || (b.type === 'agent-turn-complete' ? 'Stop' : b.type);
    if (b.session_id && s.a.cli === 'claude') { s.a.sessionId = b.session_id; const [d] = findAgent(s.a.id); d && saveDoc(d); }
    if (s.a.cli === 'claude') s.hooked = true;
    const fp = b.tool_input && b.tool_input.file_path;
    if (fp && path.dirname(path.resolve(String(fp))) === DIAG && diagName(path.basename(fp))) diagOwner[path.basename(fp)] = s.a.id;
    if (b.tool_input && JSON.stringify(b.tool_input).includes(IMG)) imgOwner = s.a.id;
    for (const m of b.tool_input ? JSON.stringify(b.tool_input).matchAll(new RegExp(TODO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/([\\w.-]+\\.json)', 'g')) : []) todoOwner[m[1]] = s.a.id;
    clearTimeout(s.idleT);
    if (ev === 'SessionStart' || ev === 'Stop') setStatus(s, 'idle', ev === 'Stop' ? (b['last-assistant-message'] || '') : '');
    else if (ev === 'UserPromptSubmit') setStatus(s, 'working', b.prompt);
    else if (ev === 'PreToolUse') setStatus(s, 'working', b.tool_name);
    else if (ev === 'PostToolUse') { if (s.status !== 'working') setStatus(s, 'working', b.tool_name); }
    else if (ev === 'Notification') /waiting for your input/i.test(b.message || '') ? setStatus(s, 'idle') : setStatus(s, 'needs', b.message);
    else if (ev === 'SessionEnd') setStatus(s, 'idle', 'session ended');
    return json(res, 200, { ok: true });
  }

  /* --- git + GitHub --- */
  if (p.startsWith('/api/git/')) {
    const cwd = expand(q('cwd') || b.cwd);
    if (!isDir(cwd)) return json(res, 400, { error: 'dossier introuvable' });
    const op = p.slice(9);
    if (op === 'status') {
      const top = await git(cwd, ['rev-parse', '--show-toplevel']);
      if (!top.ok) return json(res, 200, { repo: false });
      const root = top.out.trim();
      const [br, st, ab, num, log, rem] = await Promise.all([
        git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
        git(root, ['status', '--porcelain', '-uall']),
        git(root, ['rev-list', '--left-right', '--count', '@{u}...HEAD']),
        git(root, ['diff', 'HEAD', '--numstat']),
        git(root, ['log', '-3', '--format=%s%x09%cr']),
        git(root, ['remote', 'get-url', 'origin']),
      ]);
      const stats = {};
      for (const l of num.out.split('\n').filter(Boolean)) { const [a, dl, f] = l.split('\t'); stats[f] = { add: +a || 0, del: +dl || 0 }; }
      const [behind, ahead] = ab.ok ? ab.out.trim().split(/\s+/).map(Number) : [null, null];
      const files = st.out.split('\n').filter(Boolean).map(l => {
        let file = l.slice(3); if (file.includes(' -> ')) file = file.split(' -> ')[1];
        file = file.replace(/^"|"$/g, '');
        return { code: l.slice(0, 2), file, ...(stats[file] || { add: 0, del: 0 }) };
      });
      return json(res, 200, { repo: true, root, branch: br.out.trim(), ahead, behind, upstream: ab.ok, files,
        remote: rem.ok ? remoteInfo(rem.out.trim()) : null,
        recent: log.out.split('\n').filter(Boolean).map(l => { const [s, age] = l.split('\t'); return { subject: s, age }; }) });
    }
    if (op === 'diff') {
      const f = q('file');
      let r = await git(cwd, f ? ['diff', 'HEAD', '--', f] : ['diff', 'HEAD']);
      if (r.ok && !r.out && f) { // fichier non suivi : on montre son contenu
        const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).out.trim();
        const full = inside(root, f);
        try { r.out = fs.readFileSync(full, 'utf8').slice(0, 20000).split('\n').map(l => '+' + l).join('\n'); } catch {}
      }
      return json(res, 200, r);
    }
    if (op === 'commit' && req.method === 'POST') { // cases cochées seulement ; push seulement si demandé (confirmé côté page)
      const msg = String(b.msg || '').trim();
      const files = (b.files || []).map(String).filter(f => !f.startsWith('-'));
      if (!msg) return json(res, 400, { error: 'message vide' });
      if (!files.length) return json(res, 400, { error: 'aucun fichier coché' });
      const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).out.trim();
      const a = await git(root, ['add', '-A', '--', ...files]);
      if (!a.ok) return json(res, 200, a);
      const c = await git(root, ['commit', '-m', msg, '--', ...files]);
      if (!c.ok || !b.push) return json(res, 200, { ...c, pushed: false });
      const up = await git(root, ['rev-parse', '--abbrev-ref', '@{u}']);
      const pu = await git(root, up.ok ? ['push'] : ['push', '-u', 'origin', 'HEAD']);
      return json(res, 200, { ok: pu.ok, out: c.out + '\n' + pu.out, err: pu.err, pushed: pu.ok });
    }
    if (op === 'pull' && req.method === 'POST') return json(res, 200, await git(cwd, ['pull', '--ff-only']));
    if (op === 'push' && req.method === 'POST') return json(res, 200, await git(cwd, ['push']));
  }
  if (p === '/api/gh' || p === '/api/gh/publish') { // GitHub via `gh`, seulement si connecté
    const cwd = expand(q('cwd'));
    if (!isDir(cwd)) return json(res, 400, { error: 'dossier introuvable' });
    const auth = await run('gh', ['auth', 'status'], cwd, 10000);
    if (!auth.ok) return json(res, 200, { auth: false, hint: 'Connecte GitHub : tape `gh auth login`' });
    const user = (await run('gh', ['api', 'user', '--jq', '.login'], cwd, 10000)).out.trim();
    if (p === '/api/gh/publish' && req.method === 'POST') { // dépôt local -> nouveau dépôt GitHub PRIVÉ (confirmé côté client)
      const top = await git(cwd, ['rev-parse', '--show-toplevel']);
      if (!top.ok) return json(res, 200, { ok: false, err: 'pas un dépôt git' });
      const root = top.out.trim(), name = path.basename(root).replace(/[^\w.-]/g, '-');
      const r = await run('gh', ['repo', 'create', name, '--private', '--source', '.', '--remote', 'origin', '--push'], root, 120000);
      return json(res, 200, { ok: r.ok, out: r.out, err: r.err });
    }
    const rem = await run('git', ['remote'], cwd, 5000);
    if (!rem.out.trim()) return json(res, 200, { auth: true, user, noRemote: true, prs: [], issues: [], branches: [] });
    const [pr, is, br] = await Promise.all([
      run('gh', ['pr', 'list', '-L', '10', '--json', 'number,title,headRefName,url,author'], cwd, 20000),
      run('gh', ['issue', 'list', '-L', '10', '--json', 'number,title,url'], cwd, 20000),
      run('gh', ['api', 'repos/{owner}/{repo}/branches', '--jq', '[.[].name]'], cwd, 20000),
    ]);
    const pj = r => { try { return JSON.parse(r.out); } catch { return []; } };
    return json(res, 200, { auth: true, user, prs: pj(pr), issues: pj(is), branches: pj(br), err: [pr, is, br].filter(r => !r.ok).map(r => r.err.trim()).join('\n') });
  }

  /* --- usage, ports, fichiers, images --- */
  if (p === '/api/limits') return json(res, 200, await getLimits(q('force') === '1'));
  if (p === '/api/usage') return json(res, 200, await getUsage(q('force') === '1'));
  if (p === '/api/ports') {
    const r = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], HOME, 8000);
    const ports = new Set();
    for (const l of r.out.split('\n')) { const m = /(?:127\.0\.0\.1|\*|\[::1\]|\[::\]|localhost):(\d+) \(LISTEN\)/.exec(l); if (m && +m[1] !== PORT) ports.add(+m[1]); }
    return json(res, 200, { ports: [...ports].sort((a, b) => a - b) });
  }
  if (p === '/api/md/list' || p === '/api/md/file') {
    const root = q('root') === 'vault' ? MEMORY_VAULT : expand(q('root'));
    if (root !== MEMORY_VAULT && !state.repos.includes(root)) return json(res, 403, { error: 'racine non autorisée' });
    if (p === '/api/md/list') {
      const files = findFiles(root, f => /\.(md|markdown)$/i.test(f), 6).slice(0, 2000).map(f => path.relative(root, f)).sort();
      return json(res, 200, { root, files });
    }
    const f = inside(root, q('path') || '');
    if (!f || !/\.(md|markdown)$/i.test(f)) return json(res, 400, { error: 'chemin refusé' });
    try { return json(res, 200, { path: path.relative(root, f), text: fs.readFileSync(f, 'utf8').slice(0, 500000) }); }
    catch { return json(res, 404, { error: 'introuvable' }); }
  }
  if (p === '/api/diagrams') {
    const list = fs.readdirSync(DIAG).filter(diagName).map(diagInfo).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
    return json(res, 200, { dir: DIAG, list: list.map(({ text, ...r }) => r) });
  }
  if (p === '/api/diagrams/file') {
    const r = diagName(q('name')) && diagInfo(q('name'));
    return r ? json(res, 200, r) : json(res, 404, { error: 'diagramme introuvable' });
  }
  if (p === '/api/todos/file') {
    const name = todoName(q('name') || b.name);
    if (!name) return json(res, 400, { error: 'nom refusé' });
    if (req.method === 'POST') { if (!b.data || typeof b.data !== 'object') return json(res, 400, { error: 'data attendu' }); fs.writeFileSync(path.join(TODO, name), JSON.stringify(b.data, null, 1)); return json(res, 200, { ok: true }); }
    const r = todoInfo(name);
    return r ? json(res, 200, r) : json(res, 404, { error: 'introuvable' });
  }
  if (p === '/api/images') {
    const albums = [''].concat(fs.readdirSync(IMG, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name))
      .map(name => { const l = imgList(name) || []; return { name, count: l.length, mtime: Math.max(0, ...l.map(i => i.mtime)) }; })
      .filter(a => a.count || a.name).sort((a, b) => b.mtime - a.mtime);
    const list = q('album') == null ? null : imgList(q('album'));
    return json(res, 200, { dir: IMG, albums, list });
  }
  if (p === '/api/upload' && req.method === 'POST') {
    const m = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/.exec(b.data || '');
    if (!m) return json(res, 400, { error: 'image png/jpg/gif/webp attendue' });
    const buf = Buffer.from(m[2], 'base64');
    const name = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '.' + m[1].replace('jpeg', 'jpg');
    fs.writeFileSync(path.join(DATA, 'assets', name), buf);
    return json(res, 200, { url: `/assets/${name}` });
  }
  json(res, 404, { error: 'inconnu' });
});

/* ---------- WebSocket : terminaux + événements ---------- */
const wss = new WebSocketServer({ noServer: true });
const listeners = new Set();
function broadcast(m) { const s = JSON.stringify(m); for (const ws of listeners) ws.readyState === 1 && ws.send(s); }
server.on('upgrade', (req, sock, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const origin = req.headers.origin;
  if (!hostOk(req.headers.host) || url.searchParams.get('token') !== TOKEN ||
      (origin && !hostOk(origin.replace(/^https?:\/\//, '')))) { sock.destroy(); return; }
  if (url.pathname === '/ws/events') return wss.handleUpgrade(req, sock, head, ws => { listeners.add(ws); ws.on('close', () => listeners.delete(ws)); });
  const s = sessions.get(url.searchParams.get('id'));
  if (!s) { sock.destroy(); return; }
  wss.handleUpgrade(req, sock, head, ws => {
    s.sockets.add(ws);
    ws.send(JSON.stringify({ t: 'out', d: s.buf }));
    if (!s.alive) ws.send(JSON.stringify({ t: 'exit', code: null }));
    ws.on('message', raw => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (!s.pty || !s.alive) return;
      if (msg.t === 'in') s.pty.write(msg.d);
      else if (msg.t === 'resize' && msg.cols > 1 && msg.rows > 1) {
        s.pty.resize(Math.min(msg.cols, 500), Math.min(msg.rows, 200));
        s.a.cols = msg.cols; s.a.rows = msg.rows;
      }
    });
    ws.on('close', () => s.sockets.delete(ws));
  });
});

server.listen(PORT, HOST, () => {
  detectInstalled(); readRam(); setInterval(readRam, 5000);
  const url = `http://${HOST}:${PORT}/#${TOKEN}`;
  fs.writeFileSync(URLFILE, url, { mode: 0o600 });
  console.log(`Board prêt : ${url}`);
});

function shutdown() { flushAll(); for (const id of [...sessions.keys()]) killAgent(id); try { fs.unlinkSync(URLFILE); } catch {} process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
