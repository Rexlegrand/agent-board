/* Board : Git (M10) : pastille de branche, panneau changements, Commit & Push, RECENT, onglet GitHub (gh) */
let G = { st: null, checked: new Set(), tab: 'changes', file: null };
const gcwd = () => S.doc?.path;

async function gitPoll() {
  if (!gcwd()) return;
  const st = await api('GET', '/api/git/status?cwd=' + encodeURIComponent(gcwd())).catch(() => null);
  if (!st) return;
  const known = new Set((G.st?.files || []).map(f => f.file));
  G.st = st;
  if (st.repo) for (const f of st.files) if (!known.has(f.file)) G.checked.add(f.file); // nouveaux fichiers cochés d'office, comme Git GUI
  for (const f of [...G.checked]) if (!st.files?.find(x => x.file === f)) G.checked.delete(f);
  paintPill();
  if ($('#git').classList.contains('open')) paintGit();
}
function paintPill() {
  const st = G.st, P = $('#gitPill');
  if (!st || !st.repo) { P.innerHTML = `${icon('github')}<span class="dim">no git</span>`; return; }
  P.innerHTML = `${icon('github')}<span>${esc(st.branch)}</span>${st.files.length ? `<span class="n">${st.files.length}</span>` : ''}`;
}
function toggleGit(force) {
  const open = $('#git').classList.toggle('open', force);
  $('#gitPill').classList.toggle('on', open);
  if (open) { paintGit(); gitPoll(); }
}
function paintGit() {
  const st = G.st, E = $('#git');
  if (!st) { E.innerHTML = '<div style="padding:16px;color:var(--dim)">Lecture…</div>'; return; }
  if (!st.repo) { E.innerHTML = `<header><span class="gh">${icon('github')}</span><span class="ttl"><b>${esc(S.doc?.name)}</b><small>pas un dépôt git</small></span><button class="rbtn" id="gX">${icon('x')}</button></header><div style="padding:0 16px 16px;color:var(--dim)">Tape <code class="mono">git init</code> dans une console pour commencer.</div>`; $('#gX').onclick = () => toggleGit(false); return; }
  const r = st.remote, sync = st.upstream ? (st.ahead || st.behind ? `↑${st.ahead} ↓${st.behind}` : 'synced') : r ? 'no upstream' : 'local only';
  const files = st.files, n = [...G.checked].length;
  const add = files.filter(f => G.checked.has(f.file)).reduce((s, f) => s + f.add, 0), del = files.filter(f => G.checked.has(f.file)).reduce((s, f) => s + f.del, 0);
  const canPush = !!r;
  E.innerHTML = `<header><span class="gh">${icon('github')}</span><span class="ttl"><b>${esc(r?.owner ? `${r.owner}/${r.repo}` : st.root.split('/').pop())}</b><small>${icon('branch', 'i').replace('class="i"', 'class="i" style="width:12px;height:12px;vertical-align:-2px"')} ${esc(st.branch)} · ${sync}</small></span>
      ${r?.web ? `<a class="rbtn" href="${esc(r.web)}" target="_blank" title="Ouvrir sur GitHub">${icon('ext')}</a>` : ''}<button class="rbtn" id="gR" title="Rafraîchir">${icon('refresh')}</button><button class="rbtn" id="gX">${icon('x')}</button></header>
    <div class="gtabs"><button data-t="changes" class="${G.tab === 'changes' ? 'on' : ''}">Changes</button><button data-t="github" class="${G.tab === 'github' ? 'on' : ''}">GitHub</button></div>
    ${G.tab === 'github' ? '<div id="ghpane">Lecture de gh…</div>' : `
    <div class="chg"><span class="caps">Changes ${n}/${files.length}</span><span class="add">+${add}</span><span class="del">−${del}</span><a id="gAll">${n === files.length && n ? 'None' : 'All'}</a></div>
    <div id="gfiles">${files.map(f => { const i = f.file.lastIndexOf('/'), code = f.code.trim()[0] === '?' ? 'U' : f.code.trim()[0];
      return `<div class="gf ${G.file === f.file ? 'on' : ''}" data-f="${esc(f.file)}"><span class="cb ${G.checked.has(f.file) ? 'on' : ''}">${G.checked.has(f.file) ? icon('check') : ''}</span><span class="bdg ${code}">${code}</span><span class="fn"><b>${esc(f.file.slice(i + 1))}</b><small>${esc(i > 0 ? f.file.slice(0, i) : '')}</small></span><span class="ad">${f.add || f.del ? `+${f.add} −${f.del}` : ''}</span></div>`; }).join('') || '<div style="padding:14px 6px;color:var(--dim)">Working tree clean</div>'}</div>
    <pre id="gdiff"></pre>
    <div class="act"><input class="in" id="gMsg" placeholder="Update ${n} file${n === 1 ? '' : 's'}">
      <button class="btn pri" id="gGo" ${n ? '' : 'disabled'}>${icon('send')}${canPush ? `Commit & Push ${n} file${n === 1 ? '' : 's'}` : `Commit ${n} file${n === 1 ? '' : 's'}`}</button>
      <div id="gmsg"></div></div>
    <div class="recent"><div class="caps" style="padding-bottom:4px">Recent</div>${st.recent.map(c => `<div><span>${esc(c.subject)}</span><small>${esc(c.age)}</small></div>`).join('') || '<small style="color:var(--dim)">Aucun commit</small>'}</div>`}`;
  $('#gX').onclick = () => toggleGit(false);
  $('#gR').onclick = gitPoll;
  E.querySelector('.gtabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { G.tab = b.dataset.t; paintGit(); if (G.tab === 'github') loadGh(); } };
  if (G.tab === 'github') return loadGh();
  $('#gAll').onclick = () => { if (G.checked.size === files.length) G.checked.clear(); else files.forEach(f => G.checked.add(f.file)); paintGit(); };
  $('#gfiles').onclick = e => {
    const row = e.target.closest('.gf'); if (!row) return;
    const f = row.dataset.f;
    if (e.target.closest('.cb')) { G.checked.has(f) ? G.checked.delete(f) : G.checked.add(f); return paintGit(); }
    G.file = G.file === f ? null : f; paintGit(); if (G.file) showDiff(f);
  };
  $('#gMsg').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') $('#gGo').click(); };
  $('#gGo').onclick = commitPush;
}
async function showDiff(file) {
  const r = await api('GET', `/api/git/diff?cwd=${encodeURIComponent(gcwd())}&file=${encodeURIComponent(file)}`).catch(e => ({ out: e.message }));
  const pre = $('#gdiff'); if (!pre) return;
  pre.classList.add('open'); pre.innerHTML = '';
  for (const l of (r.out || r.err || '').split('\n').slice(0, 2000)) {
    const s = document.createElement('span');
    s.className = l.startsWith('+') && !l.startsWith('+++') ? 'a' : l.startsWith('-') && !l.startsWith('---') ? 'd' : l.startsWith('@@') ? 'h' : '';
    s.textContent = l + '\n'; pre.appendChild(s);
  }
}
async function commitPush() {
  const files = [...G.checked], n = files.length;
  const msg = $('#gMsg').value.trim() || `Update ${n} file${n === 1 ? '' : 's'}`;
  const push = !!G.st.remote;
  // Règle : demander avant ce qui est public (push).
  if (push && !(await ask(`Commit & Push ${n} fichier(s) ?`, `Le commit « ${msg} » sera poussé sur ${G.st.remote.owner ? G.st.remote.owner + '/' + G.st.remote.repo : 'le dépôt distant'}.`, 'Commit & Push'))) return;
  const out = $('#gmsg'), btn = $('#gGo');
  btn.disabled = true; btn.lastChild.textContent = push ? 'Committing…' : 'Committing…';
  const r = await api('POST', '/api/git/commit', { cwd: gcwd(), files, msg, push }).catch(e => ({ ok: false, err: e.message }));
  const keep = r.ok ? (r.pushed ? `Committed ${n} file${n === 1 ? '' : 's'} · pushed` : `Committed ${n} file${n === 1 ? '' : 's'}`) : (r.err || r.out || 'Échec');
  G.checked.clear(); G.file = null;
  await gitPoll();
  const o = $('#gmsg'); if (o) { o.textContent = keep; o.className = r.ok ? 'ok' : 'err'; }
}
async function loadGh() {
  const P = $('#ghpane'); if (!P) return;
  const r = await api('GET', '/api/gh?cwd=' + encodeURIComponent(gcwd())).catch(e => ({ auth: false, hint: e.message }));
  if (!$('#ghpane')) return;
  if (!r.auth) { P.innerHTML = `<div class="connect">${icon('github')} <b>Connecte GitHub</b> : tape <code>gh auth login</code> dans une console, puis rafraîchis.<br><small style="color:var(--dim)">Pull requests, issues et branches apparaîtront ici.</small></div>`; return; }
  const who = `<div style="margin:2px 0 8px;color:var(--dim)">Connecté : <b style="color:var(--fg,#eee)">${esc(r.user || '?')}</b></div>`;
  if (r.noRemote) {
    P.innerHTML = who + `<div class="connect">Ce dossier n'est pas encore relié à GitHub (dépôt local seulement).<br><button class="btn" id="ghPub" style="margin-top:8px">Publier sur GitHub (privé)</button><div id="ghPubMsg" class="mono" style="margin-top:6px;white-space:pre-wrap"></div></div>`;
    $('#ghPub').onclick = async () => {
      if (!confirm('Créer un dépôt GitHub PRIVÉ pour ce dossier et y envoyer le code ?')) return;
      const m = $('#ghPubMsg'); m.textContent = 'Publication…';
      const x = await api('POST', '/api/gh/publish?cwd=' + encodeURIComponent(gcwd())).catch(e => ({ ok: false, err: e.message }));
      m.textContent = x.ok ? 'Publié.' : (x.err || 'échec'); m.style.color = x.ok ? '#7bd88f' : '#ff8a65';
      if (x.ok) { await gitPoll(); loadGh(); }
    };
    return;
  }
  const sec = (t, list, f) => `<div class="caps" style="margin:10px 0 4px">${t} · ${list.length}</div>${list.map(f).join('') || '<small style="color:var(--dim)">rien</small>'}`;
  P.innerHTML = who + sec('Pull requests', r.prs, p => `<a href="${esc(p.url)}" target="_blank">#${p.number} ${esc(p.title)} <small style="color:var(--dim)">${esc(p.headRefName)}</small></a>`)
    + sec('Issues', r.issues, i => `<a href="${esc(i.url)}" target="_blank">#${i.number} ${esc(i.title)}</a>`)
    + sec('Branches', r.branches, b => `<div class="mono" style="padding:3px 0">${esc(b)}</div>`)
    + (r.err ? `<pre class="mono" style="color:#ff8a65;white-space:pre-wrap">${esc(r.err)}</pre>` : '');
}
BOOT.push(() => {
  $('#gitPill').onclick = () => toggleGit();
  setInterval(gitPoll, 8000);
});
document.addEventListener('docloaded', () => { G = { st: null, checked: new Set(), tab: 'changes', file: null }; gitPoll(); });
TOOLS_MENU.push(['github', 'GitHub', () => { G.tab = 'github'; toggleGit(true); }]);
