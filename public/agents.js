/* Board : consoles d'agents (M3-M9) : console, lanceur, statut, reprise, groupes + Composer, barre du bas, orchestrateur */
const ROLES = ['Frontend', 'Backend', 'Testers', 'Reviewers', 'Design', 'Docs', 'Security', 'General'];
const roleColor = r => r ? `var(--role-${String(r).toLowerCase()})` : 'var(--role-general)';
const STATUS_TXT = { starting: 'starting', working: 'working', needs: 'needs you', idle: 'ready', exited: 'exited', paused: 'paused', dormant: 'asleep' };
const agentOf = id => S.doc?.agents?.[id];
const agentsInWs = () => (S.ws?.nodes || []).filter(n => n.kind === 'agent').map(n => n.id);
const rt = id => S.runtime[id] || { status: 'dormant' };

/* ---------- Console (nœud « agent ») ---------- */
TYPES.agent = {
  minW: 320, minH: 180, wireable: true,
  render(x) {
    const a = agentOf(x.n.id) || { name: '?', cli: 'shell' };
    x.el.innerHTML = `<header data-drag>
        <button class="cli" title="Menu de la console">${cliIcon(a.cli, 15)}${icon('chev', 'i chev')}</button>
        <span class="rdot"></span><span class="nm"></span>${a.yolo ? '<span class="yolo">YOLO</span>' : ''}<span class="sp"></span>
        <button class="ib fo" title="Focus">${icon('focus')}</button>
        <span class="stp"><i></i><span></span></span>
        <button class="ib rs" title="Relancer">${icon('refresh')}</button>
        <button class="ib du" title="Dupliquer">${icon('copy')}</button>
        <button class="ib x" title="Fermer">${icon('x')}</button>
      </header><div class="term"><div class="detail"></div></div>`;
    x.el.querySelector('.nm').textContent = a.name;
    x.el.querySelector('.nm').title = a.cwd || '';
    x.el.querySelector('.rdot').style.background = roleColor(a.role);
    x.el.classList.toggle('in-group', !!x.n.groupId);
    const H = x.el.querySelector('header');
    H.querySelector('.x').onclick = () => closeAgents([x.n.id]);
    H.querySelector('.rs').onclick = () => restartAgent(x.n.id);
    H.querySelector('.du').onclick = () => duplicateAgent(x.n.id);
    H.querySelector('.fo').onclick = () => frame([x.n], 1.6, true);
    H.querySelector('.cli').onclick = e => agentMenu(x, e.currentTarget);
    H.querySelector('.nm').ondblclick = () => renameAgent(x);
  },
  mount(x) {
    const term = new Terminal({
      fontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, Menlo, monospace', fontSize: 14, lineHeight: 1.2, cursorBlink: true,
      allowProposedApi: true, scrollback: 5000, macOptionIsMeta: true,
      theme: { background: '#11120E', foreground: '#E9E4DA', cursor: '#EE5732', selectionBackground: '#EE573255',
        black: '#1a1912', brightBlack: '#5c594e', red: '#ff6b5a', green: '#79B05E', yellow: '#F2B544', blue: '#7aa2ff', magenta: '#d68bff', cyan: '#5fd4e0', white: '#d8d2c6' },
    });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(x.el.querySelector('.term'));
    term.attachCustomKeyEventHandler(e => !(e.metaKey && ['Enter', 'g', '0', 'k'].includes(e.key)));
    term.onData(d => x.ws && x.ws.readyState === 1 && x.ws.send(JSON.stringify({ t: 'in', d })));
    Object.assign(x, { term, fit });
    paintStatus(x);
    if (rt(x.n.id).alive) connectTerm(x);
    requestAnimationFrame(() => refit(x, true));
  },
  unmount(x) { if (x.ws) { x.ws.onclose = null; x.ws.close(); } x.term && x.term.dispose(); clearTimeout(x.retry); },
  resized(x, end) { refit(x, end); },
};
function refit(x, now) {
  clearTimeout(x.fitT);
  x.fitT = setTimeout(() => {
    try { x.fit.fit(); } catch { return; }
    const { cols, rows } = x.term;
    if (x.ws && x.ws.readyState === 1) x.ws.send(JSON.stringify({ t: 'resize', cols, rows }));
  }, now ? 0 : 60);
}
function connectTerm(x) {
  if (x.ws && x.ws.readyState <= 1) return;
  const ws = new WebSocket(`ws://${location.host}/ws?token=${TOKEN}&id=${x.n.id}`);
  x.ws = ws;
  let first = true;
  ws.onopen = () => refit(x, true);
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'out') { if (first) { x.term.reset(); first = false; } x.term.write(m.d); }
    else if (m.t === 'restart') { x.term.write('\r\n\x1b[2m— relancé —\x1b[0m\r\n'); refit(x, true); }
  };
  ws.onclose = () => { if (nodes.get(x.n.id) === x && rt(x.n.id).alive) x.retry = setTimeout(() => connectTerm(x), 1500); };
}
function paintStatus(x) {
  const r = rt(x.n.id), st = r.status || 'dormant';
  const p = x.el.querySelector('.stp');
  p.className = 'stp ' + st;
  p.querySelector('span').textContent = STATUS_TXT[st] || st;
  p.title = r.detail || '';
  for (const c of [...x.el.classList]) if (c.startsWith('st-')) x.el.classList.remove(c);
  x.el.classList.add('st-' + st);
  x.el.querySelector('.detail').textContent = r.detail || '';
  // Bulle « Resume last conversation? » sur une console endormie qui a une conversation à reprendre
  let b = x.el.querySelector('.bubble');
  if (st === 'dormant' && r.resumable) {
    if (!b) {
      b = h(`<div class="bubble">${icon('history')}<span>Resume last conversation?</span><button class="yes">Yes</button><button class="no" title="Nouvelle conversation">${icon('x')}</button></div>`);
      b.querySelector('.yes').onclick = () => startAgent(x.n.id, true);
      b.querySelector('.no').onclick = () => startAgent(x.n.id, false);
      x.el.querySelector('.term').appendChild(b);
    }
  } else if (b) b.remove();
}
document.addEventListener('agent', e => {
  const m = e.detail, x = nodes.get(m.id);
  if (x && x.n.kind === 'agent') { paintStatus(x); if (m.alive) connectTerm(x); }
  for (const g of nodes.values()) if (g.n.kind === 'group' || g.n.kind === 'orch') g.t.paint && g.t.paint(g);
  updateResumeToast(); drawWires();
});

/* Actions sur une console */
async function startAgent(id, resume, extra = {}) {
  try { const r = await api('POST', `/api/agents/${id}/start`, { resume, ...extra }); S.runtime[id] = { ...S.runtime[id], ...r }; }
  catch (e) { toast(e.message, 1); }
}
async function restartAgent(id) {
  const r = rt(id);
  if (r.alive && r.status !== 'exited' && !(await ask(`Relancer ${agentOf(id)?.name} ?`, 'Le process en cours sera tué puis relancé. Claude et Codex reprennent leur conversation.', 'Relancer'))) return;
  startAgent(id, true);
}
async function closeAgents(ids) {
  const running = ids.filter(id => rt(id).alive && rt(id).status !== 'exited');
  if (running.length) {
    const names = running.map(id => agentOf(id)?.name).join(', ');
    if (!(await ask('Close running agents?', `${names} ${running.length > 1 ? 'are' : 'is'} running. Closing ends ${running.length > 1 ? 'their sessions' : 'its session'}.`, running.length > 1 ? `Close ${running.length} agents` : 'Close agent', true))) return false;
  }
  for (const id of ids) {
    await api('DELETE', '/api/agents/' + id).catch(e => toast(e.message, 1));
    delete S.doc.agents[id]; delete S.runtime[id];
    removeNode(id);
  }
  refreshGroups(); renderTabs();
  return true;
}
KEYS.closeAgents = closeAgents;
async function spawnAgents(items) {
  try {
    const r = await api('POST', '/api/agents', { items: items.map(i => ({ ws: S.ws.id, ...i })) });
    for (const c of r.created) {
      S.doc.agents[c.agent.id] = c.agent; S.runtime[c.agent.id] = c.runtime;
      const x = addNode(c.node, { silent: true });
      x && x.el.animate([{ transform: 'translateY(-24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1.2)' });
    }
    saveSoon(); renderTabs(); refreshGroups(); drawWires();
    return r.created;
  } catch (e) { toast(e.message, 1); return []; }
}
function freeSpot(w = 560, h = 360) { // à droite de tout ce qui est visible, sinon au centre de l'écran
  const c = toWorld(innerWidth / 2, innerHeight / 2 - 40);
  const list = S.ws.nodes.filter(n => n.kind !== 'group');
  if (!list.length) return { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2) };
  return findFree(Math.round(c.x - w / 2), Math.round(c.y - h / 2), w, h);
}
async function newConsole(cli = S.settings.defaultCli, at) {
  const p = at || freeSpot();
  const r = await spawnAgents([{ cli, x: p.x, y: p.y }]);
  if (r[0]) { select(r[0].node.id); if (!at) frame([r[0].node], 1, true); }
  return r;
}
KEYS.newConsole = newConsole;
async function duplicateAgent(id) {
  const a = agentOf(id), n = nodes.get(id).n;
  const p = findFree(n.x + n.w + 30, n.y, n.w, n.h);
  return spawnAgents([{ cli: a.cli, cwd: a.cwd, baseName: a.name, role: a.role, yolo: a.yolo, x: p.x, y: p.y, w: n.w, h: n.h }]);
}
KEYS.duplicate = () => { for (const id of S.sel) { const x = nodes.get(id); if (x?.n.kind === 'agent') duplicateAgent(id); else if (x) KEYS.dupNode && KEYS.dupNode(x); } };
function renameAgent(x) {
  const nm = x.el.querySelector('.nm');
  nm.contentEditable = 'true'; nm.focus();
  document.getSelection().selectAllChildren(nm);
  const fin = async () => {
    nm.contentEditable = 'false';
    const v = nm.textContent.trim();
    if (v && v !== agentOf(x.n.id).name) { agentOf(x.n.id).name = v; await api('POST', `/api/agents/${x.n.id}/update`, { name: v }); }
    else nm.textContent = agentOf(x.n.id).name;
  };
  nm.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); nm.blur(); } };
  nm.onblur = fin;
}
function agentMenu(x, anchor) {
  const a = agentOf(x.n.id), r = rt(x.n.id);
  const p = openPop(anchor, `<h4 class="caps">${esc(a.name)} · ${esc(cliDef(a.cli)?.label || a.cli)}</h4>
    <button class="it" data-a="rename">${icon('note')}<span class="t"><b>Renommer</b></span></button>
    <button class="it" data-a="fresh">${icon('plus')}<span class="t"><b>Nouvelle conversation</b><small>relance sans reprendre</small></span></button>
    ${r.alive && r.status !== 'paused' ? `<button class="it" data-a="pause">${icon('pause')}<span class="t"><b>Pause</b></span></button>` : ''}
    ${r.status === 'paused' ? `<button class="it" data-a="resume">${icon('play')}<span class="t"><b>Reprendre</b></span></button>` : ''}
    <button class="it" data-a="yolo">${icon('check')}<span class="t"><b>YOLO ${a.yolo ? 'off' : 'on'}</b><small>auto-approbation, relance la console</small></span></button>
    <button class="it" data-a="handoff">${icon('send')}<span class="t"><b>Hand off to…</b><small>passer la tâche à un autre agent</small></span></button>
    <div class="sepH"></div><h4 class="caps">Changer de CLI</h4>
    ${S.catalog.filter(c => c.installed).map(c => `<button class="it ${c.id === a.cli ? 'on' : ''}" data-cli="${c.id}">${cliIcon(c.id, 18)}<span class="t"><b>${esc(c.label)}</b></span>${c.id === a.cli ? `<span class="ck">${icon('check')}</span>` : ''}</button>`).join('')}`, 'below');
  if (!p) return;
  p.onclick = async e => {
    const b = e.target.closest('.it'); if (!b) return; closePop();
    const act = b.dataset.a;
    if (act === 'rename') renameAgent(x);
    else if (act === 'fresh') startAgent(x.n.id, false);
    else if (act === 'pause' || act === 'resume') signal([x.n.id], act);
    else if (act === 'yolo') { a.yolo = !a.yolo; await startAgent(x.n.id, true, { yolo: a.yolo }); rerender(x); }
    else if (act === 'handoff') { const t = await prompt2('Passer la tâche à…', 'codex', 'codex, claude ou @nom'); if (t) handoff(x.n.id, t); }
    else if (b.dataset.cli && b.dataset.cli !== a.cli) { a.cli = b.dataset.cli; a.sessionId = null; await startAgent(x.n.id, false, { cli: a.cli }); rerender(x); }
  };
}
async function signal(ids, op) {
  ids = ids.filter(id => rt(id).alive);
  if (!ids.length) return toast('Aucune console vivante');
  const r = await api('POST', '/api/agents/signal', { ids, op: op === 'pause' ? 'pause' : 'resume' });
  toast(`${op === 'pause' ? 'Pause' : 'Reprise'} : ${r.n} console(s)`);
}
async function sendTo(ids, text, enter = true) {
  const ok = [];
  for (const id of ids) { try { await api('POST', `/api/agents/${id}/send`, { text, enter }); ok.push(agentOf(id)?.name); } catch (e) { toast(`${agentOf(id)?.name} : ${e.message}`, 1); } }
  return ok;
}

/* ---------- Lanceur (M4) : popover SPAWN AGENT, puis clic sur le canvas ---------- */
TOOL_CLICK.agent = btn => {
  const list = all => S.catalog.filter(c => all || c.installed || ['claude', 'aider', 'cursor', 'qwen', 'codex', 'shell'].includes(c.id))
    .sort((a, b) => (b.installed - a.installed));
  const draw = all => `<h4 class="caps">Spawn agent</h4>${list(all).map(c => `<button class="it ${c.installed ? '' : 'off'}" data-cli="${c.id}" ${c.installed ? '' : 'title="Pas installé sur ce Mac"'}>${cliIcon(c.id, 26)}<span class="t"><b>${esc(c.label)}</b><small>${esc(c.vendor)}${c.installed ? '' : ' · pas installé'}</small></span>${c.id === S.settings.defaultCli ? `<span class="ck">${icon('check')}</span>` : ''}</button>`).join('')}
    ${all ? `<div class="sepH"></div><div class="row"><input class="in" id="cuL" placeholder="Nom" style="width:90px"><input class="in" id="cuC" placeholder="commande perso" style="flex:1"><button class="btn" id="cuAdd">${icon('plus')}</button></div>`
      : `<button class="it" data-all>${icon('grid4')}<span class="t"><b>All agents</b></span><span class="mono" style="color:var(--dim)">${S.catalog.length}</span>${icon('right')}</button>`}
    <div class="foot">then click the canvas to drop it</div>`;
  const p = openPop(btn, draw(false), 'right', 'spawnPop');
  if (!p) return;
  p.onclick = async e => {
    if (e.target.closest('[data-all]')) { p.innerHTML = draw(true); return placePop('right'); }
    if (e.target.closest('#cuAdd')) {
      const label = $('#cuL').value.trim(), cmd = $('#cuC').value.trim();
      if (!label || !cmd) return toast('Nom et commande requis');
      const r = await api('POST', '/api/settings', { addCustom: { label, cmd } }); S.catalog = r.catalog; p.innerHTML = draw(true); return;
    }
    const b = e.target.closest('[data-cli]'); if (!b) return;
    if (b.classList.contains('off')) return toast(`${b.querySelector('b').textContent} n'est pas installé sur ce Mac`, 1);
    closePop(); setTool('agent', b.dataset.cli); $('#left [data-tool=agent]').classList.add('on');
    toast(`Clique le canvas pour poser ${b.querySelector('b').textContent}`);
  };
};
TOOL_DOWN.agent = async (e, w) => {
  const cli = S.toolArg || S.settings.defaultCli;
  setTool('select');
  const r = await newConsole(cli, { x: Math.round(w.x - 280), y: Math.round(w.y - 20) });
};
KEYS.a = () => TOOL_CLICK.agent($('#left [data-tool=agent]'));

/* ---------- Reprise (M9) : toast global + bulle par console ---------- */
function dormantResumable() { return Object.keys(S.doc?.agents || {}).filter(id => rt(id).status === 'dormant' && rt(id).resumable); }
function updateResumeToast() {
  const ids = dormantResumable(), T = $('#resumeToast');
  if (!ids.length || store('noResume:' + S.doc?.path) === bootId) { T.classList.remove('open'); return; }
  T.innerHTML = `<span class="ic">${icon('history')}</span><span><b>Resume all conversations?</b><small>${ids.length} console${ids.length > 1 ? 's' : ''} can pick up ${ids.length > 1 ? 'their' : 'its'} last chat</small></span>
    <button class="btn pri" id="rYes">Yes</button><button class="btn" id="rNo" style="border:0">No</button>`;
  T.classList.add('open');
  $('#rYes').onclick = async () => { T.classList.remove('open'); for (const id of dormantResumable()) await startAgent(id, true); };
  $('#rNo').onclick = () => { T.classList.remove('open'); store('noResume:' + S.doc.path, bootId); };
}
const bootId = Math.random().toString(36).slice(2);
document.addEventListener('docloaded', updateResumeToast);

/* ---------- Groupes + Composer (M6) ---------- */
const groupMembers = gid => (S.ws?.nodes || []).filter(n => n.kind === 'agent' && n.groupId === gid);
function groupState(gid) {
  const m = groupMembers(gid), st = m.map(n => rt(n.id).status);
  const w = st.filter(s => s === 'working').length, nd = st.filter(s => s === 'needs').length;
  return { n: m.length, label: nd ? `${nd} need you` : w ? `${w} running` : st.every(s => s === 'paused') && m.length ? 'paused' : 'idle' };
}
TYPES.group = {
  noHandles: true, wireable: true,
  render(x) {
    x.el.innerHTML = `<header data-drag><span class="gdot"></span><span class="gname"></span><span class="gmeta"></span><button class="ib gm">${icon('chev')}</button></header><span class="wirechip">${icon('plus')}Click to wire group</span>`;
    x.el.querySelector('.gm').onclick = e => groupMenu(x, e.currentTarget);
    this.paint(x);
  },
  paint(x) {
    const s = groupState(x.n.id);
    x.el.querySelector('.gdot').style.background = roleColor(x.n.role);
    x.el.querySelector('.gname').textContent = x.n.name;
    x.el.querySelector('.gmeta').textContent = `${s.n} · ${s.label}`;
  },
};
function refreshGroups() {
  for (const x of nodes.values()) {
    if (x.n.kind !== 'group') continue;
    const m = groupMembers(x.n.id);
    if (!m.length) continue;
    const b = bbox(m), P = 22;
    Object.assign(x.n, { x: b.x - P, y: b.y - P, w: b.w + 2 * P, h: b.h + 2 * P });
    place(x); x.t.paint(x);
  }
}
function groupMenu(x, anchor) {
  const ids = groupMembers(x.n.id).map(n => n.id);
  const p = openPop(anchor, `<h4 class="caps">${esc(x.n.name)}</h4>
    <button class="it" data-a="rename">${icon('note')}<span class="t"><b>Renommer</b></span></button>
    <button class="it" data-a="role">${icon('grid4')}<span class="t"><b>Rôle</b><small>${esc(x.n.role || 'General')}</small></span></button>
    <button class="it" data-a="pause">${icon('pause')}<span class="t"><b>Pause</b></span></button>
    <button class="it" data-a="resume">${icon('play')}<span class="t"><b>Resume</b></span></button>
    <button class="it" data-a="frame">${icon('focus')}<span class="t"><b>Cadrer le groupe</b></span></button>
    <button class="it" data-a="dissolve">${icon('x')}<span class="t"><b>Dissoudre</b><small>garde les consoles</small></span></button>
    <button class="it" data-a="kill" style="color:#ff8a65">${icon('trash')}<span class="t"><b>Fermer tout</b></span></button>`);
  if (!p) return;
  p.onclick = async e => {
    const b = e.target.closest('.it'); if (!b) return; closePop();
    const a = b.dataset.a;
    if (a === 'rename') { const v = await prompt2('Nom du groupe', x.n.name); if (v) { x.n.name = v; x.t.paint(x); saveSoon(); } }
    if (a === 'role') { const v = await prompt2('Rôle (' + ROLES.join(', ') + ')', x.n.role || 'General'); const r = ROLES.find(R => R.toLowerCase() === (v || '').toLowerCase()); if (r) { x.n.role = r; for (const id of ids) { agentOf(id).role = r; api('POST', `/api/agents/${id}/update`, { role: r }); nodes.has(id) && rerender(nodes.get(id)); } x.t.paint(x); saveSoon(); } }
    if (a === 'pause' || a === 'resume') signal(ids, a);
    if (a === 'frame') frame([x.n], 1, true);
    if (a === 'dissolve') dissolve(x.n.id);
    if (a === 'kill') { if (await closeAgents(ids)) removeNode(x.n.id); }
  };
}
function dissolve(gid) {
  for (const n of groupMembers(gid)) { n.groupId = null; nodes.get(n.id)?.el.classList.remove('in-group'); }
  removeNode(gid); saveSoon();
}
KEYS.dissolve = dissolve;

let comp = { name: 'Team', role: 'General', count: 4, slots: [] };
function openComposer(anchor) {
  const installed = S.catalog.filter(c => c.installed);
  comp.slots = Array.from({ length: 12 }, (_, i) => comp.slots[i] || S.settings.defaultCli);
  const draw = () => `<div class="nameRow"><i style="background:${roleColor(comp.role)}"></i><input id="cName" value="${esc(comp.name)}"></div>
    <div class="roles">${ROLES.map(r => `<button class="role ${r === comp.role ? 'on' : ''}" data-role="${r}"><i style="background:${roleColor(r)}"></i>${r}</button>`).join('')}</div>
    <div class="slots">${comp.slots.slice(0, comp.count).map((c, i) => `<button class="slot ${c}" data-i="${i}" title="Clic : changer de CLI"><span class="ci">${cliIcon(c, 18)}</span>${esc(cliDef(c)?.label || c)}</button>`).join('')}</div>
    <div class="fill">Fill all ${['claude', 'codex', 'gemini', 'opencode', 'cursor', 'shell', 'aider', 'kimi', 'qwen', 'copilot'].map(cliDef).concat(S.catalog.filter(c => c.custom)).filter(Boolean).map(c => `<button class="${c.installed ? '' : 'off'}" data-fill="${c.id}" title="${esc(c.label)}${c.installed ? '' : ' (pas installé)'}">${cliIcon(c.id, 18)}</button>`).join('')}</div>
    <div class="cfoot"><div class="stepper"><button data-d="-1">−</button><span>${comp.count}</span><button data-d="1">+</button></div>
    <span class="mono" style="color:var(--dim);font-size:11.5px">${S.sys.agents ?? 0}/${S.sys.max} agents · RAM ${Math.round((S.sys.ram.freeMB || 0) / 102.4) / 10} Go</span>
    <button class="btn pri" id="cSpawn">Spawn ${comp.count}</button></div>`;
  const p = openPop(anchor, draw(), 'above', 'composer');
  if (!p) return;
  const redraw = () => { p.innerHTML = draw(); placePop('above'); };
  p.addEventListener('input', e => { if (e.target.id === 'cName') comp.name = e.target.value; });
  p.onclick = async e => {
    const r = e.target.closest('[data-role]'); if (r) { comp.role = r.dataset.role; comp.name = r.dataset.role === 'General' ? 'Team' : r.dataset.role; return redraw(); }
    const sl = e.target.closest('[data-i]');
    if (sl) { const i = +sl.dataset.i, k = installed.findIndex(c => c.id === comp.slots[i]); comp.slots[i] = installed[(k + 1) % installed.length].id; return redraw(); }
    const f = e.target.closest('[data-fill]');
    if (f) { if (f.classList.contains('off')) return toast('Pas installé sur ce Mac', 1); comp.slots = comp.slots.map(() => f.dataset.fill); return redraw(); }
    const d = e.target.closest('[data-d]'); if (d) { comp.count = Math.max(1, Math.min(12, comp.count + +d.dataset.d)); return redraw(); }
    if (e.target.closest('#cSpawn')) { closePop(); spawnGroup({ ...comp, slots: comp.slots.slice(0, comp.count) }); }
  };
  setTimeout(() => { const i = $('#cName'); i && (i.focus(), i.select()); }, 0);
}
async function spawnGroup({ name, role, slots }) {
  const gid = uid(), W = 480, Hh = 300, G = 24, cols = Math.min(4, Math.ceil(Math.sqrt(slots.length)));
  const o = freeSpot(cols * (W + G), Math.ceil(slots.length / cols) * (Hh + G));
  o.y += 40;
  const items = slots.map((cli, i) => ({ cli, role, groupId: gid, x: o.x + (i % cols) * (W + G), y: o.y + Math.floor(i / cols) * (Hh + G), w: W, h: Hh }));
  const gnode = { id: gid, kind: 'group', name, role, x: o.x, y: o.y, w: 10, h: 10 };
  S.ws.nodes.unshift(gnode); mountNode(gnode);
  const made = await spawnAgents(items);
  if (!made.length) { removeNode(gid); return []; }
  refreshGroups(); frame([gnode], 1, true); saveSoon();
  return made;
}

/* ---------- Orchestrateur (M8, partie locale) ---------- */
TYPES.orch = {
  minW: 300, minH: 260,
  render(x) {
    x.n.wired ||= [];
    x.el.innerHTML = `<header data-drag><span class="orb"></span><b>Orchestrator</b><span class="cnt"><i></i><span></span></span></header>
      <div class="sub"><span class="sum"></span><span class="sp"></span><button class="btn add" title="Ajouter une console reliée">${icon('plus')}</button><button class="btn conn">${icon('plug')}Connect</button></div>
      <div class="body scroll"></div>
      <div class="oin"><input placeholder=""><button class="snd">${icon('send')}</button></div>`;
    x.el.querySelector('.conn').onclick = () => S.connecting === x.n.id ? endConnect() : beginConnect(x.n.id);
    x.el.querySelector('.add').onclick = () => orchSpawn(x);
    const inp = x.el.querySelector('.oin input');
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && inp.value.trim()) { orchSend(x, inp.value.trim()); inp.value = ''; } };
    x.el.querySelector('.snd').onclick = () => { if (inp.value.trim()) { orchSend(x, inp.value.trim()); inp.value = ''; } };
    this.paint(x);
  },
  paint(x) {
    const ids = wiredAgents(x.n), conn = S.connecting === x.n.id;
    const busy = ids.filter(id => rt(id).status === 'working').length;
    x.el.querySelector('.cnt span').textContent = `${busy}/${ids.length}`;
    const groups = x.n.wired.filter(id => nodes.get(id)?.n.kind === 'group').length;
    x.el.querySelector('.sum').textContent = `${ids.length} agents · ${groups} group${groups === 1 ? '' : 's'}`;
    const cb = x.el.querySelector('.conn');
    cb.className = 'btn conn' + (conn ? ' pri' : ''); cb.innerHTML = conn ? `${icon('check')}Done` : `${icon('plug')}Connect`;
    x.el.querySelector('.oin input').placeholder = `Command ${ids.length} agents · @ to direct…`;
    const B = x.el.querySelector('.body');
    if (conn) {
      const gs = S.ws.nodes.filter(n => n.kind === 'group'), cs = S.ws.nodes.filter(n => n.kind === 'agent' && !n.groupId);
      B.innerHTML = `<div style="color:var(--dim);font-size:12.5px;padding:2px 2px 6px">Click consoles on the board, or wire them here. Tap Done when finished.</div>
        ${gs.length ? '<div class="caps lbl">Groups</div>' : ''}${gs.map(g => `<div class="orow ${x.n.wired.includes(g.id) ? 'on' : ''}" data-w="${g.id}">${icon('grid4')}<span>${esc(g.name)}</span><span class="n">${groupMembers(g.id).length}</span><span class="sp"></span>${icon(x.n.wired.includes(g.id) ? 'check' : 'plus')}</div>`).join('')}
        ${cs.length ? '<div class="caps lbl">Consoles</div>' : ''}${cs.map(c => `<div class="orow ${x.n.wired.includes(c.id) ? 'on' : ''}" data-w="${c.id}">${cliIcon(agentOf(c.id)?.cli, 15)}<span>${esc(agentOf(c.id)?.name)}</span><span class="sp"></span>${icon(x.n.wired.includes(c.id) ? 'check' : 'plus')}</div>`).join('')}`;
    } else if (!ids.length) {
      B.innerHTML = `<div class="empty"><span class="orb"></span><b>No agents wired</b><span>Spawn a fresh lane below, or tap Connect and pick consoles or groups on the board.</span><button class="btn pri sp1">${icon('plus')}Spawn agent</button></div>`;
      B.querySelector('.sp1').onclick = () => orchSpawn(x);
    } else {
      const lanes = ids.map((id, i) => { const a = agentOf(id) || {}, r = rt(id); const col = { working: 'var(--accent)', needs: 'var(--warn)', paused: 'var(--txt2)' }[r.status] || 'var(--idle)';
        return `<div class="orow" data-go="${id}"><span class="ci">${cliIcon(a.cli, 16)}<i style="background:${col}"></i></span><span>${esc(a.name)}</span><span class="n">${esc(cliDef(a.cli)?.label || '')} ${i + 1}</span><span class="sp"></span>
          <span class="acts"><button data-f="${id}" title="Focus">${icon('focus')}</button><button data-p="${id}" title="Pause">${icon('pause')}</button></span><span class="stp ${r.status}"><i></i>${STATUS_TXT[r.status] || r.status}</span></div>`; });
      B.innerHTML = lanes.join('');
    }
    B.onclick = e => {
      const w = e.target.closest('[data-w]'); if (w) return toggleWire(w.dataset.w);
      const f = e.target.closest('[data-f]'); if (f) return goTo(f.dataset.f);
      const pz = e.target.closest('[data-p]'); if (pz) return signal([pz.dataset.p], rt(pz.dataset.p).status === 'paused' ? 'resume' : 'pause');
      const g = e.target.closest('[data-go]'); if (g) select(g.dataset.go);
    };
  },
};
function wiredAgents(o) {
  const out = [];
  for (const id of o.wired || []) {
    const x = nodes.get(id); if (!x) continue;
    if (x.n.kind === 'group') out.push(...groupMembers(id).map(n => n.id));
    else if (x.n.kind === 'orch') { if (o.kind !== 'orch') out.push(...wiredAgents(x.n)); } // tuile Images → orchestrateur : ses consoles
    else out.push(id);
  }
  return [...new Set(out)];
}
// Fils : un orchestrateur se relie aux consoles/groupes ; une tuile Images aussi, et aux orchestrateurs.
const WIRE_SRC = ['orch', 'images', 'image'];
function canWire(n) { const src = nodes.get(S.connecting)?.n; return !!src && n.id !== src.id && (TYPES[n.kind]?.wireable || (src.kind !== 'orch' && n.kind === 'orch')); }
function beginConnect(oid) { S.connecting = oid; document.body.classList.add('connecting'); for (const x of nodes.values()) if (canWire(x.n)) x.el.classList.add('wire-pick'); repaintOrchs(); }
function endConnect() { S.connecting = null; document.body.classList.remove('connecting'); for (const x of nodes.values()) x.el.classList.remove('wire-pick'); repaintOrchs(); saveSoon(); }
KEYS.endConnect = endConnect;
function toggleWire(id) {
  const o = nodes.get(S.connecting); if (!o) return;
  const add = !o.n.wired.includes(id);
  o.n.wired = add ? [...o.n.wired, id] : o.n.wired.filter(w => w !== id);
  repaintOrchs(); drawWires(); saveSoon();
  if (add && o.n.kind === 'image') { // image libre reliée : son chemin tapé dans l'invite de la console (sans Entrée)
    const t = nodes.get(id)?.n, ids = !t ? [] : t.kind === 'group' ? groupMembers(id).map(m => m.id) : t.kind === 'orch' ? wiredAgents(t) : [id];
    imagePath(o.n).then(p => sendTo(ids, `Image : ${p} `, false)).then(ok => ok?.length && toast(`Image → ${ok.join(', ')} : finis la consigne dans la console`));
  }
}
function repaintOrchs() { for (const x of nodes.values()) if (x.n.kind === 'orch') x.t.paint(x); else if (x.n.kind === 'images' || x.n.kind === 'image') x.t.paintConn(x); }
async function orchSpawn(x) {
  const n = x.n;
  const made = await spawnAgents([{ cli: S.settings.defaultCli, x: n.x + n.w + 160, y: n.y + wiredAgents(n).length * 40, w: 480, h: 300 }]);
  if (made[0]) { n.wired.push(made[0].node.id); x.t.paint(x); drawWires(); saveSoon(); }
}
async function orchSend(x, text) {
  const ids = wiredAgents(x.n);
  const { targets, rest } = parseMentions(text, ids);
  const to = targets.length ? targets : ids;
  if (!to.length) return toast('Aucun agent relié : Connect d’abord', 1);
  const ok = await sendTo(to, rest);
  threadPush({ who: 'me', text }); threadPush({ who: 'bot', text: `Plan · tell → **${ok.join(', ')}**\n“${rest}”` });
}
function addOrchestrator(at, wired = []) {
  const p = at || freeSpot(340, 420);
  const n = { id: uid(), kind: 'orch', x: p.x, y: p.y, w: 340, h: 420, wired };
  addNode(n); drawWires(); select(n.id);
  return n;
}
TOOLS_MENU.push(['orbit', 'Orchestrator', () => { const n = addOrchestrator(); frame([n], 1, true); }]);

/* Fils animés orchestrateur → groupes / consoles */
function drawWires() {
  const svg = $('#wires'); if (!svg) return;
  let out = '';
  for (const o of nodes.values()) {
    if (!WIRE_SRC.includes(o.n.kind)) continue;
    for (const id of o.n.wired || []) {
      const t = nodes.get(id); if (!t) continue;
      const a = o.n, b = t.n, right = b.x > a.x + a.w / 2;
      const x1 = right ? a.x + a.w : a.x, y1 = a.y + a.h / 2;
      const x2 = right ? b.x : b.x + b.w, y2 = b.y + Math.min(b.h / 2, 120);
      const dx = Math.max(60, Math.abs(x2 - x1) / 2) * (right ? 1 : -1);
      const pid = `w-${o.n.id.slice(0, 6)}-${id.slice(0, 6)}`;
      out += `<path id="${pid}" ${o.n.kind !== 'orch' ? 'class="wimg"' : ''} d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/><circle r="3"><animateMotion dur="${2.4 + (id.charCodeAt(0) % 5) * .3}s" repeatCount="indefinite"><mpath href="#${pid}"/></animateMotion></circle>`;
    }
  }
  svg.innerHTML = out;
}

/* ---------- Relais entre agents (« pass this task to codex ») ---------- */
async function handoff(fromId, target) {
  const from = agentOf(fromId); if (!from) return;
  target = target.replace(/^@/, '').trim().toLowerCase();
  let toId = Object.keys(S.doc.agents).find(id => id !== fromId && agentOf(id).name.toLowerCase() === target && agentsInWs().includes(id));
  const cli = !toId && S.catalog.find(c => c.id === target || c.label.toLowerCase() === target);
  if (!toId && !cli) return threadPush({ who: 'bot', text: `Je ne connais pas « ${target} » (une CLI ou un @nom).` });
  const file = `.board/handoff-${from.name.replace(/\W+/g, '-').toLowerCase()}-${Date.now().toString(36)}.md`;
  await sendTo([fromId], `Write a handoff brief (what changed, what's left, how to verify) to ${file} (create the .board folder if needed), then stop.`);
  threadPush({ who: 'bot', text: `Plan · handoff **${from.name}** → **${toId ? agentOf(toId).name : cli.label}**\n1. ${from.name} écrit ${file}\n2. dès qu'il se pose, l'autre agent reprend.` });
  const wait = () => new Promise(res => {
    let sawWork = false;
    const f = e => { if (e.detail.id !== fromId) return; if (e.detail.status === 'working') sawWork = true; if (sawWork && e.detail.status === 'idle') { document.removeEventListener('agent', f); res(); } };
    document.addEventListener('agent', f);
    setTimeout(() => { document.removeEventListener('agent', f); res(); }, 10 * 60e3);
  });
  await wait();
  if (!toId) { const n = nodes.get(fromId).n; const m = await spawnAgents([{ cli: cli.id, cwd: from.cwd, x: n.x + n.w + 40, y: n.y, w: n.w, h: n.h }]); if (!m[0]) return; toId = m[0].node.id; await new Promise(r => setTimeout(r, 6000)); }
  await sendTo([toId], `Read ${file} and run git diff, then continue the task.`);
  threadPush({ who: 'bot', text: `Relais fait : **${agentOf(toId).name}** a reçu le brief.` });
}

/* ---------- Barre du bas (M7) : pilules + barre de commande + fil ---------- */
const PILLS = [['New console', () => newConsole()], ['Spawn 4', () => spawnAgents(Array.from({ length: 4 }, (_, i) => { const p = freeSpot(); return { cli: S.settings.defaultCli, x: p.x + (i % 2) * 520, y: p.y + Math.floor(i / 2) * 340, w: 500, h: 320 }; })).then(m => m.length && frame(m.map(c => c.node), 1, true))],
  ['Group', b => openComposer(b)], ['Orchestrator', () => { const n = addOrchestrator(); frame([n], 1, true); }],
  ['Pause all', () => signal(agentsInWs(), 'pause')], ['Resume all', () => signal(agentsInWs(), 'resume')]];
BOOT.push(() => {
  $('#pills').innerHTML = PILLS.map((p, i) => `<button class="pl" data-i="${i}">${p[0]}</button>`).join('');
  $('#pills').onclick = e => { const b = e.target.closest('.pl'); if (b) PILLS[+b.dataset.i][1](b); };
  $('#bThread').innerHTML = icon('up') + '<span class="unread"></span>';
  $('#bSend').innerHTML = icon('send');
  if (store('hintGone')) $('#hint').classList.add('hide');
  $('#hintX').onclick = () => { $('#hint').classList.add('hide'); store('hintGone', true); };
  $('#hint').querySelector('span').onclick = () => { $('#cmdIn').value = 'pass this task to codex'; $('#cmdIn').focus(); };
});
KEYS.git = () => toggleGit();

// @mentions : noms de consoles (les plus longs d'abord, « Nova 2 » avant « Nova ») et noms de groupes
function parseMentions(text, pool) {
  const ids = pool || agentsInWs();
  const names = ids.map(id => [agentOf(id)?.name || '', [id]]);
  for (const g of (S.ws?.nodes || []).filter(n => n.kind === 'group')) names.push([g.name, groupMembers(g.id).map(n => n.id)]);
  names.push(['all', ids]);
  names.sort((a, b) => b[0].length - a[0].length);
  const targets = new Set(); let rest = text, m;
  while ((m = /^\s*(?:,|and|et)?\s*@/i.exec(rest))) {
    const after = rest.slice(m[0].length);
    const hit = names.find(([n]) => n && after.toLowerCase().startsWith(n.toLowerCase()) && !/[\w]/.test(after[n.length] || ''));
    if (!hit) break;
    hit[1].forEach(i => targets.add(i)); rest = after.slice(hit[0].length);
  }
  return { targets: [...targets], rest: rest.replace(/^[\s,:]+/, '').trim() };
}
const cmdIn = $('#cmdIn');
cmdIn.addEventListener('keydown', e => {
  e.stopPropagation();
  const pop = $('#mentions');
  if (pop && ['ArrowDown', 'ArrowUp', 'Tab'].includes(e.key)) { e.preventDefault(); const its = $$('.it', pop); let i = its.findIndex(x => x.classList.contains('on')); its[i]?.classList.remove('on'); i = (i + (e.key === 'ArrowUp' ? -1 : 1) + its.length) % its.length; its[i].classList.add('on'); if (e.key === 'Tab') its[i].click(); return; }
  if (e.key === 'Enter') { e.preventDefault(); if (pop && $('.it.on', pop)) return $('.it.on', pop).click(); runCommand(cmdIn.value); }
  if (e.key === 'Escape') { cmdIn.blur(); pop && pop.remove(); }
});
cmdIn.addEventListener('input', () => {
  $('#mentions')?.remove();
  const m = /@([\w ]*)$/.exec(cmdIn.value.slice(0, cmdIn.selectionStart));
  if (!m) return;
  const q = m[1].toLowerCase();
  const opts = [...agentsInWs().map(id => ({ name: agentOf(id)?.name, cli: agentOf(id)?.cli, st: rt(id).status })),
    ...S.ws.nodes.filter(n => n.kind === 'group').map(g => ({ name: g.name, group: true }))].filter(o => o.name && o.name.toLowerCase().startsWith(q)).slice(0, 8);
  if (!opts.length) return;
  const p = h(`<div class="pop" id="mentions">${opts.map((o, i) => `<button class="it ${i ? '' : 'on'}" data-n="${esc(o.name)}">${o.group ? icon('grid4') : cliIcon(o.cli, 16)}<span class="t"><b>${esc(o.name)}</b></span>${o.st ? `<span class="stp ${o.st}"><i></i>${STATUS_TXT[o.st]}</span>` : ''}</button>`).join('')}</div>`);
  $('#bottom').appendChild(p);
  p.style.position = 'absolute'; p.style.left = '40px'; p.style.bottom = '64px'; p.style.top = 'auto';
  p.onmousedown = e => { e.preventDefault(); const b = e.target.closest('.it'); if (!b) return; const pos = cmdIn.selectionStart; const before = cmdIn.value.slice(0, pos).replace(/@[\w ]*$/, '@' + b.dataset.n + ' '); cmdIn.value = before + cmdIn.value.slice(pos); p.remove(); cmdIn.focus(); };
});
cmdIn.addEventListener('blur', () => setTimeout(() => $('#mentions')?.remove(), 150));
$('#bSend').onclick = () => runCommand(cmdIn.value);
$('#bThread').onclick = () => { $('#thread').classList.toggle('open'); $('#bThread').classList.remove('has'); renderThread(); };

// Planificateur local (sans IA, sans réseau) : @nom → taper dans la console ; sinon quelques ordres reconnus.
const TODO_FILLER = new Set("tu ouvre ouvre-moi ouvrir open opens new nouveau nouvelle nouvel crée créer create créé fais fais-moi fait fai add ajoute insert insère mets moi me m j je veux voudrais aimerais aimerai veut un une le la les l du de des a an the my mon ma please stp svp s il te plait plaît show montre affiche".split(' '));
const TODO_MAKE = new Set('fais fais-moi fait faire crée créer prépare prépare-moi note notes ajoute mets tâche tâches taches planning plan make create launch lancement'.split(' '));
const extraWords = (low, w) => low.replace(w, ' ').split(/[\s,.!?'’:]+/).filter(x => x && !TODO_FILLER.has(x));
// « - Nova, fais X - Leo, fais Y » sans @ : un message par console nommée (le début commun est joint à chacun).
function splitByNames(text) {
  const ids = agentsInWs(), esc = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = [];
  for (const id of ids) {
    const re = new RegExp(`(?:^|[\\s\\-–•*])(${esc(agentOf(id).name)})\\s*[,:]`, 'gi');
    for (const m of text.matchAll(re)) hits.push({ id, at: m.index + m[0].indexOf(m[1]) });
  }
  hits.sort((a, b) => a.at - b.at);
  if (!hits.length || (new Set(hits.map(h => h.id)).size < 2 && hits[0].at > 2)) return []; // 1 seul nom en plein milieu : simple mention, pas un destinataire
  const head = text.slice(0, hits[0].at).replace(/[\s\-–•*]+$/, '').trim();
  const out = new Map();
  hits.forEach((h, i) => {
    const seg = text.slice(h.at, hits[i + 1]?.at ?? text.length).replace(/[\s\-–•*]+$/, '').trim();
    out.set(h.id, [out.get(h.id), seg].filter(Boolean).join(' '));
  });
  return [...out].map(([id, seg]) => [id, head ? `${head} — ${seg}` : seg]);
}
// Console « Board » : reçoit ce que l'utilisateur dit à la barre sans viser personne. Réutilisée, sinon lancée (Claude).
async function boardAgent() {
  const id = agentsInWs().find(i => /^board$/i.test(agentOf(i).name));
  if (id) return [id];
  const p = freeSpot(), made = await spawnAgents([{ cli: 'claude', name: 'Board', x: p.x, y: p.y, w: 500, h: 320 }]);
  if (!made[0]) return [];
  const nid = made[0].node.id;
  await new Promise(res => { // attendre que Claude soit prêt (hook SessionStart), 20 s max
    const f = e => { if (e.detail.id === nid && e.detail.status === 'idle') done(); };
    const done = () => { document.removeEventListener("agent", f); clearTimeout(t); setTimeout(res, 4000); }; // SessionStart arrive avant que l invite accepte la saisie : sinon l Entrée se perd
    const t = setTimeout(done, 20e3);
    document.addEventListener('agent', f);
  });
  return [nid];
}
async function runCommand(raw) {
  const text = raw.trim(); if (!text) return;
  cmdIn.value = ''; $('#mentions')?.remove();
  if (!S.doc) return toast('Ouvre un repo d’abord', 1);
  threadPush({ who: 'me', text });
  const say = (t, acts) => threadPush({ who: 'bot', text: t, acts });
  const low = text.toLowerCase();
  const { targets, rest } = parseMentions(text);
  let m;
  if (targets.length) {
    if (!rest) return say('Que dois-je leur dire ? Écris le message après le @nom.');
    const ok = await sendTo(targets, rest);
    return say(`Plan · tell → **${ok.join(', ')}**\n“${rest}”`);
  }
  // To-do sans @ : « checklist », « ouvre-moi un board », « j'aimerais un calendrier » = tuile vide ; avec du contenu = un agent la remplit.
  if ((m = /(?:^|[^\w-])(check-?list|to-?do|kanban|board|calendrier|calendar|agenda)(?![\w-])/i.exec(low))
    && !(m[1] === 'board' && extraWords(low, m[1]).length && !low.split(/[\s,.!?'’:]+/).some(w => TODO_MAKE.has(w)))) { // « board » seul = l'appli : il faut un verbe de création
    const kind = /cal|agenda/.test(m[1]) ? 'calendar' : /kanban|board/.test(m[1]) ? 'kanban' : 'checklist';
    const extra = extraWords(low, m[1]);
    if (!extra.length) { const n = insertTodo(kind); frame([n], 1, true); return say(`${TODO_LABEL[kind]} ouvert.`); }
    const sel = [...S.sel].filter(id => agentOf(id)); // console sélectionnée : elle a le contexte (et la consigne To-do)
    const to = sel.length ? sel : await boardAgent();
    if (!to.length) return say('Impossible de lancer la console Board.');
    const ok = await sendTo(to, `${text} (à faire dans une tuile ${TODO_LABEL[kind]} du Board : fichier JSON dans data/todos, cf. consigne To-do)`);
    return say(`Plan · ${TODO_LABEL[kind]} → **${ok.join(', ')}**\n“${text}”`);
  }
  if ((m = /^(?:spawn|lance|crée|create|open)\s+(\d+|a|an|one|two|three|four|five|un|une|deux|trois|quatre|cinq)?\s*([\w-]+)?/i.exec(low))) {
    const W = { a: 1, an: 1, one: 1, un: 1, une: 1, two: 2, deux: 2, three: 3, trois: 3, four: 4, quatre: 4, five: 5, cinq: 5 };
    const n = Math.min(12, +m[1] || W[m[1]] || 1);
    const cli = S.catalog.find(c => m[2] && (m[2].startsWith(c.id) || c.label.toLowerCase().startsWith(m[2]))) || cliDef(S.settings.defaultCli);
    if (!cli.installed) return say(`${cli.label} n'est pas installé sur ce Mac.`);
    const o = freeSpot();
    const made = await spawnAgents(Array.from({ length: n }, (_, i) => ({ cli: cli.id, x: o.x + (i % 3) * 520, y: o.y + Math.floor(i / 3) * 340, w: 500, h: 320 })));
    if (made.length) frame(made.map(c => c.node), 1, true);
    return say(made.length ? `Plan · spawn **${made.length} ${cli.label}** → ${made.map(c => c.agent.name).join(', ')}` : 'Spawn refusé (plafond ou erreur).');
  }
  if (/^(pause all|pause tout|pause)$/.test(low)) { await signal(agentsInWs(), 'pause'); return say('Plan · pause all'); }
  if (/^(resume all|reprends tout|resume|reprendre)$/.test(low)) { await signal(agentsInWs(), 'resume'); return say('Plan · resume all'); }
  if (/^(kill all|ferme tout|close all)$/.test(low)) { const ids = agentsInWs(); return say(`Fermer ${ids.length} console(s) : ${ids.map(i => agentOf(i).name).join(', ')} ?`, [['Confirm · ' + ids.length, () => closeAgents(ids)]]); }
  if (/^(group|groupe|compose)/.test(low)) { openComposer($('#pills .pl:nth-child(3)')); return say('Composer ouvert.'); }
  if (/^(orchestrator|orchestrateur)/.test(low)) { const n = addOrchestrator(); frame([n], 1, true); return say('Orchestrator posé sur le tableau.'); }
  if (/^(fit|tout voir)/.test(low)) { fitAll(); return say('Vue ajustée.'); }
  if ((m = /^(?:pass|hand|give|passe)\s+(?:this\s+|the\s+|cette\s+)?(?:task\s+|tâche\s+)?(?:off\s+)?(?:to|à)\s+(@?[\w ]+)$/i.exec(text))) {
    const src = [...S.sel].find(id => agentOf(id)) || agentsInWs().find(id => rt(id).status === 'working') || agentsInWs()[0];
    if (!src) return say('Aucune console source : sélectionne celle qui doit passer la main.');
    return handoff(src, m[1]);
  }
  if (/what can you do|help|aide|\?$/.test(low)) return say(`Je comprends :\n• **@nom message** : taper dans une ou plusieurs consoles (@Nova @Leo …, @groupe, @all)\n• **spawn 3 claude** / **spawn codex**\n• **pause all**, **resume all**, **kill all**\n• **group**, **orchestrator**, **fit**\n• **pass this task to codex** (depuis la console sélectionnée)\n• **checklist**, **board**, **calendrier** : tuile vide ; avec une consigne (« checklist de ce qui reste », « calendrier : launch le 26 ») : la console sélectionnée la remplit, sinon la console **Board** (lancée au besoin)\n• **Nova, … Leo, …** (sans @) : un message à chacune\nSinon le message part aux consoles reliées à l'orchestrateur, à la console sélectionnée, ou à la console **Board**.`);
  const parts = splitByNames(text);
  if (parts.length) {
    const sent = [];
    for (const [id, msg] of parts) sent.push(...await sendTo([id], msg));
    return say(`Plan · tell → **${sent.join(', ')}** (un message chacun)`);
  }
  const orch = S.ws.nodes.find(n => n.kind === 'orch' && wiredAgents(n).length);
  let to = orch ? wiredAgents(orch) : [...S.sel].filter(id => agentOf(id));
  if (!to.length) to = await boardAgent(); // personne de visé : la console Board
  if (!to.length) return say('Impossible de lancer la console Board.');
  const ok = await sendTo(to, text);
  say(`Plan · tell → **${ok.join(', ')}**\n“${text}”`);
}
function threadPush(m) {
  S.doc.thread.push({ ...m, acts: undefined, at: Date.now() });
  if (m.acts) threadActs[S.doc.thread.length - 1] = m.acts;
  saveSoon();
  if ($('#thread').classList.contains('open')) renderThread(); else if (m.who === 'bot') { $('#bThread').classList.add('has'); $('#thread').classList.add('open'); renderThread(); }
}
const threadActs = {};
function renderThread() {
  const T = $('#thread'); if (!S.doc) return;
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  T.innerHTML = `<header><span class="caps">Thread</span><span class="chip">${icon('folder')}${esc(S.doc.name)}</span><span class="chip">${icon('globe')}FR</span><span class="sp"></span><button class="btn" id="tClear" style="height:26px">Clear</button><button class="btn" id="tClose" style="height:26px;width:26px;padding:0">${icon('x')}</button></header>
    <div class="msgs scroll">${S.doc.thread.map((m, i) => m.who === 'me' ? `<div class="me">${esc(m.text)}</div>` : `<div class="bot"><span class="orb"></span><div><div class="tx">${md(m.text)}</div>${threadActs[i] ? `<div class="acts">${threadActs[i].map((a, k) => `<button class="btn red" data-a="${i}:${k}" style="height:26px">${esc(a[0])}</button>`).join('')}<button class="btn" data-a="${i}:x" style="height:26px">Cancel</button></div>` : ''}</div></div>`).join('') || '<div style="color:var(--dim)">Tape une commande en bas. <b>help</b> pour la liste.</div>'}</div>
    <div class="quick">${['New console', 'Spawn 4', 'Group', 'Orchestrator', 'Pause all', 'Resume all'].map((q, i) => `<button data-q="${i}">${q}</button>`).join('')}<button data-q="git">Git</button><button data-q="usage">Usage</button><button data-q="kill" class="red">Kill all</button></div>`;
  const ms = T.querySelector('.msgs'); ms.scrollTop = ms.scrollHeight;
  T.onclick = e => {
    if (e.target.closest('#tClear')) { S.doc.thread = []; saveSoon(); return renderThread(); }
    if (e.target.closest('#tClose')) return T.classList.remove('open');
    const a = e.target.closest('[data-a]');
    if (a) { const [i, k] = a.dataset.a.split(':'); const acts = threadActs[i]; delete threadActs[i]; renderThread(); if (k !== 'x' && acts) acts[+k][1](); return; }
    const q = e.target.closest('[data-q]'); if (!q) return;
    if (q.dataset.q === 'kill') return runCommand('kill all');
    if (q.dataset.q === 'git') return toggleGit(true);
    if (q.dataset.q === 'usage') return $('#bUsage').click();
    PILLS[+q.dataset.q][1](q);
  };
}
document.addEventListener('docloaded', () => { $('#thread').classList.remove('open'); });

/* ---------- Fin de tâche : bip + pop-up (+ notification système si la fenêtre est cachée) ---------- */
const lastSt = {}; // id -> { st, since } vu par ce navigateur
let actx = null;
const muted = () => { try { return localStorage.boardMute === '1'; } catch { return false; } };
document.addEventListener('pointerdown', () => { // le son et les notifications demandent un premier geste
  try { actx ||= new AudioContext(); actx.resume(); } catch {}
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}, { once: true, capture: true });
function beep(needs) {
  if (muted() || !actx) return;
  (needs ? [660, 520] : [880, 1320]).forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.16;
    o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.15);
  });
}
function donePop(id, needs, detail) {
  const a = agentOf(id); if (!a) return;
  let box = $('#donepops'); if (!box) document.body.appendChild(box = h('<div id="donepops"></div>'));
  const p = h(`<div class="donepop ${needs ? 'needs' : ''}"><i></i><span><b>${esc(a.name)} ${needs ? 't’attend' : 'a fini'}</b><small>${esc(detail || '')}</small></span></div>`);
  p.onclick = () => { goTo(id); p.remove(); };
  box.appendChild(p); setTimeout(() => p.remove(), 9000);
  while (box.children.length > 4) box.firstChild.remove();
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    const nt = new Notification(`${a.name} ${needs ? 't’attend' : 'a fini'}`, { body: detail || '', silent: true });
    nt.onclick = () => { window.focus(); goTo(id); nt.close(); };
  }
}
document.addEventListener('agent', e => {
  const m = e.detail, prev = lastSt[m.id];
  lastSt[m.id] = { st: m.status, since: m.status === prev?.st ? prev.since : Date.now() };
  if (prev?.st !== 'working' || !['idle', 'needs'].includes(m.status)) return;
  if (Date.now() - prev.since < 5000) return; // petites pauses de sortie : pas de bip
  beep(m.status === 'needs'); donePop(m.id, m.status === 'needs', m.detail);
});
I.bell = '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>';
TOOLS_MENU.push(['bell', 'Son de fin de tâche', () => { try { localStorage.boardMute = muted() ? '0' : '1'; } catch {} toast(muted() ? 'Bip coupé (pop-up gardé)' : 'Bip activé'); }]);
