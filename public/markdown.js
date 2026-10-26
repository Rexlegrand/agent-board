/* Board : Markdown Studio (M22) + rail droit */
/* =========================================================
   M22 Markdown Studio : arbre, Reading / Source / Graph, Add to Board, Export PDF
   ========================================================= */
function mdRender(src) {
  src = String(src).replace(/^---\n[\s\S]*?\n---\n/, '');
  const inl = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (m, a, b, c) => `<a class="wl" data-l="${a}">${c || a}</a>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => /^https?:/.test(u) ? `<a href="${u}" target="_blank">${t}</a>` : `<a class="wl" data-l="${u}">${t}</a>`);
  const L = src.split('\n'), out = [];
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (/^```/.test(l)) { const b = []; while (++i < L.length && !/^```/.test(L[i])) b.push(L[i]); out.push(`<pre><code>${esc(b.join('\n'))}</code></pre>`); continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)/.exec(l))) { out.push(`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`); continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(l)) { out.push('<hr>'); continue; }
    if (/^\|.*\|\s*$/.test(l) && /^\|?\s*:?-{2,}/.test(L[i + 1] || '')) {
      const row = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const hd = row(l); i++; const rows = [];
      while (i + 1 < L.length && /^\|.*\|\s*$/.test(L[i + 1])) rows.push(row(L[++i]));
      out.push(`<table><tr>${hd.map(c => `<th>${inl(c)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${inl(c)}</td>`).join('')}</tr>`).join('')}</table>`); continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
      const ol = /^\s*\d+\./.test(l), items = [];
      while (i < L.length && /^\s*([-*+]|\d+\.)\s+/.test(L[i])) { const ind = /^\s*/.exec(L[i])[0].length; items.push(`<li${ind >= 2 ? ' class="sub"' : ''}>${inl(L[i].replace(/^\s*([-*+]|\d+\.)\s+(\[[ x]\]\s*)?/, ''))}</li>`); i++; }
      i--; out.push(`<${ol ? 'ol' : 'ul'}>${items.join('')}</${ol ? 'ol' : 'ul'}>`); continue;
    }
    if (/^>\s?/.test(l)) { const b = []; while (i < L.length && /^>\s?/.test(L[i])) b.push(L[i++].replace(/^>\s?/, '')); i--; out.push(`<blockquote>${inl(b.join(' '))}</blockquote>`); continue; }
    if (!l.trim()) continue;
    const p = [l]; while (i + 1 < L.length && L[i + 1].trim() && !/^(#|```|\s*[-*+]\s|\s*\d+\.\s|>|\|)/.test(L[i + 1])) p.push(L[++i]);
    out.push(`<p>${inl(p.join(' '))}</p>`);
  }
  return out.join('\n');
}
let MD = { root: null, files: [], file: null, text: '', tab: 'read', q: '', cache: {} };
async function openMarkdown(root) {
  MD.root = root || S.doc?.path;
  $('#mdStudio')?.remove();
  const E = h(`<div class="bigmodal" id="mdStudio"><header><span class="ico">${icon('doc')}</span><div><h2>Markdown</h2><small class="mono"></small></div>
    <span class="seg" style="margin-left:14px"><button data-root="repo">${esc(S.doc?.name || 'repo')}</button><button data-root="vault">Mémoire</button></span><span style="flex:1"></span><button class="close">${icon('x')}</button></header>
    <div class="mdwrap"><aside><input class="in" placeholder="Search files" id="mdQ"><div class="mdtree scroll"></div></aside><section class="mdmain"></section></div></div>`);
  document.body.appendChild(E);
  E.querySelector('.close').onclick = () => E.remove();
  E.querySelector('header .seg').onclick = e => { const b = e.target.closest('[data-root]'); if (b) openMarkdown(b.dataset.root === 'vault' ? 'vault' : S.doc.path); };
  E.querySelectorAll('header .seg button').forEach(b => b.classList.toggle('on', (b.dataset.root === 'vault') === (MD.root === 'vault')));
  $('#mdQ').oninput = e => { MD.q = e.target.value.toLowerCase(); paintTree(); };
  $('#mdQ').onkeydown = e => e.stopPropagation();
  E.querySelector('.mdtree').onclick = e => { const f = e.target.closest('[data-f]'); if (f) mdOpen(f.dataset.f); };
  const r = await api('GET', `/api/md/list?root=${encodeURIComponent(MD.root)}`).catch(e => ({ files: [], error: e.message }));
  MD.files = r.files; MD.cache = {};
  E.querySelector('header small').textContent = `${MD.files.length} notes · ${(r.root || MD.root).replace(S.home, '~')}`;
  paintTree();
  mdOpen(MD.files.find(f => /^readme\.md$/i.test(f)) || MD.files.find(f => /MEMORY\.md$/.test(f)) || MD.files[0]);
}
function paintTree() {
  const T = $('#mdStudio .mdtree'); if (!T) return;
  let last = '';
  T.innerHTML = MD.files.filter(f => !MD.q || f.toLowerCase().includes(MD.q)).map(f => {
    const i = f.lastIndexOf('/'), dir = i > 0 ? f.slice(0, i) : '';
    const hd = dir !== last ? `<div class="mddir">${icon('folder')}${esc(dir || '.')}</div>` : ''; last = dir;
    return hd + `<button class="mdf ${f === MD.file ? 'on' : ''}" data-f="${esc(f)}">${icon('md')}${esc(f.slice(i + 1))}</button>`;
  }).join('') || '<div class="dimr" style="padding:10px">Aucun fichier .md</div>';
}
async function mdText(f) {
  if (MD.cache[f] != null) return MD.cache[f];
  const r = await api('GET', `/api/md/file?root=${encodeURIComponent(MD.root)}&path=${encodeURIComponent(f)}`).catch(() => ({ text: '' }));
  return (MD.cache[f] = r.text || '');
}
async function mdOpen(f) {
  const M = $('#mdStudio .mdmain'); if (!M) return;
  if (!f) { M.innerHTML = '<div class="dimr" style="padding:30px">Aucun fichier Markdown ici.</div>'; return; }
  MD.file = f; MD.text = await mdText(f); paintTree();
  const words = (MD.text.match(/\S+/g) || []).length;
  M.innerHTML = `<div class="mdhead"><b>${esc(f.split('/').pop())}</b><span class="mono dimr">${words} words · ~${Math.max(1, Math.round(words / 230))} min</span><span class="sp"></span>
    <span class="seg">${[['read', 'Reading'], ['src', 'Source'], ['graph', 'Graph']].map(([k, l]) => `<button data-t="${k}" class="${MD.tab === k ? 'on' : ''}">${l}</button>`).join('')}</span>
    <button class="btn" id="mdAdd">${icon('grid4')}Add to Board</button><button class="btn pri" id="mdPdf">Export PDF</button></div><div class="mdbody scroll"></div>`;
  M.querySelector('.mdhead .seg').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { MD.tab = b.dataset.t; mdOpen(f); } };
  $('#mdAdd').onclick = () => { const p = centerSpot(560, 640); const n = { id: uid(), kind: 'md', x: p.x, y: p.y, w: 560, h: 640, root: MD.root, path: f }; $('#mdStudio').remove(); addNode(n); select(n.id); frame([n], 1, true); };
  $('#mdPdf').onclick = () => mdPrint(f, MD.text);
  const B = M.querySelector('.mdbody');
  if (MD.tab === 'read') { B.innerHTML = `<article class="doc">${mdRender(MD.text)}</article>`; B.onclick = e => { const a = e.target.closest('a.wl'); if (a) { const t = resolveLink(f, a.dataset.l); if (t) mdOpen(t); } }; }
  else if (MD.tab === 'src') B.innerHTML = `<pre class="src">${MD.text.split('\n').map((l, i) => `<span class="ln">${i + 1}</span>${esc(l)}`).join('\n')}</pre>`;
  else mdGraph(B);
}
function resolveLink(from, l) {
  l = decodeURIComponent(l.split('#')[0]); if (!l) return null;
  const base = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
  const norm = p => { const o = []; for (const s of p.split('/')) s === '..' ? o.pop() : s && s !== '.' && o.push(s); return o.join('/'); };
  const cands = [norm(base + l), norm(base + l + '.md'), norm(l), norm(l + '.md')];
  return MD.files.find(f => cands.includes(f)) || MD.files.find(f => f.split('/').pop().replace(/\.md$/i, '').toLowerCase() === l.toLowerCase().replace(/\.md$/i, ''));
}
async function mdGraph(B) {
  B.innerHTML = '<canvas class="graph"></canvas><div class="gcap mono dimr"></div>';
  const files = MD.files.slice(0, 400);
  const texts = await Promise.all(files.map(mdText));
  const idx = new Map(files.map((f, i) => [f, i])), edges = [];
  texts.forEach((t, i) => { for (const m of t.matchAll(/\[\[([^\]|#]+)|\]\(([^)\s#]+\.md)/g)) { const to = resolveLink(files[i], m[1] || m[2]); if (to && idx.has(to) && to !== files[i]) edges.push([i, idx.get(to)]); } });
  B.querySelector('.gcap').textContent = `Link graph · ${files.length} notes · ${edges.length} links`;
  const cv = B.querySelector('canvas'), W = cv.width = B.clientWidth * 2, H = cv.height = Math.max(400, B.clientHeight - 30) * 2;
  cv.style.height = H / 2 + 'px';
  const P = files.map((f, i) => ({ x: W / 2 + Math.cos(i) * W / 4 * Math.random(), y: H / 2 + Math.sin(i) * H / 4 * Math.random(), vx: 0, vy: 0, f, deg: 0 }));
  for (const [a, b] of edges) { P[a].deg++; P[b].deg++; }
  const ctx = cv.getContext('2d'), cur = idx.get(MD.file);
  let it = 0;
  // ponytail: graphe de forces O(n²), suffit jusqu'à ~400 notes ; au-delà, grille spatiale
  const tick = () => {
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01, f = 1800 / d2;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const [i, j] of edges) { const a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y; a.vx += dx * .004; a.vy += dy * .004; b.vx -= dx * .004; b.vy -= dy * .004; }
    for (const p of P) { p.vx += (W / 2 - p.x) * .002; p.vy += (H / 2 - p.y) * .002; p.x += p.vx *= .82; p.y += p.vy *= .82; }
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,245,225,.12)'; ctx.lineWidth = 1.5;
    for (const [i, j] of edges) { ctx.strokeStyle = i === cur || j === cur ? 'rgba(238,87,50,.8)' : 'rgba(255,245,225,.12)'; ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y); ctx.stroke(); }
    P.forEach((p, i) => { ctx.fillStyle = i === cur ? '#EE5732' : '#8E887C'; ctx.beginPath(); ctx.arc(p.x, p.y, 4 + Math.min(8, p.deg), 0, 7); ctx.fill();
      if (i === cur || p.deg > 3 || P.length <= 40) { ctx.fillStyle = i === cur ? '#F1ECE4' : '#8E887C'; ctx.font = '22px "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif'; ctx.fillText(p.f.split('/').pop().replace(/\.md$/, ''), p.x + 10, p.y + 6); } });
    if (++it < 260 && document.body.contains(cv)) requestAnimationFrame(tick);
  };
  tick();
  cv.onclick = e => { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * 2, y = (e.clientY - r.top) * 2; const p = P.find(p => Math.hypot(p.x - x, p.y - y) < 14); if (p) { MD.tab = 'read'; mdOpen(p.f); } };
}
function mdPrint(f, text) { // PDF : boîte d'impression de Chrome (« Enregistrer en PDF »)
  const w = window.open('', '_blank');
  if (!w) return toast('Fenêtre bloquée', 1);
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(f.split('/').pop().replace(/\.md$/i, ''))}</title><style>${PRINT_CSS}</style><article class="doc">${mdRender(text)}</article><script>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
}
const PRINT_CSS = `@page{size:A4;margin:18mm}body{font:12pt/1.55 -apple-system,Georgia,serif;color:#1a1a1a}h1,h2{border-bottom:2px solid #EE5732;padding-bottom:4px}code{color:#c0392b;background:#f6f0e7;padding:1px 4px;border-radius:3px}pre{background:#f6f0e7;padding:10px;border-radius:6px;white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px}blockquote{border-left:3px solid #EE5732;margin:0;padding-left:12px;color:#555}a{color:#c0392b}`;
TYPES.md = {
  minW: 300, minH: 200,
  render(x) {
    x.el.innerHTML = `<header class="nh" data-drag>${icon('md')}<b></b><span class="sp"></span><button class="kb mo" title="Ouvrir dans le studio">${icon('ext')}</button></header><div class="mdnode scroll"><article class="doc">…</article></div>`;
    x.el.querySelector('b').textContent = x.n.path.split('/').pop();
    x.el.querySelector('.mo').onclick = async () => { await openMarkdown(x.n.root); mdOpen(x.n.path); };
  },
  async mount(x) {
    const r = await api('GET', `/api/md/file?root=${encodeURIComponent(x.n.root)}&path=${encodeURIComponent(x.n.path)}`).catch(e => ({ text: '*' + e.message + '*' }));
    x.el.querySelector('.doc').innerHTML = mdRender(r.text || '');
  },
};

/* ---------- Rail droit ---------- */
const RIGHT = [['todo', 'To-do : checklist, board, calendrier', b => todoPop(b)], ['orbit', 'Orchestrator', () => { const n = addOrchestrator(); frame([n], 1, true); }], '|',
  ['folder', 'Markdown du repo', () => openMarkdown(S.doc.path)], ['doc', 'Mémoire (lecture seule)', () => openMarkdown('vault')], '|',
  ['globe', 'Tuile web localhost', () => { const n = addWeb(); frame([n], 1, true); }], ['play', 'Musique (YouTube)', () => { const n = addMusic(); frame([n], 1, true); }], ['chart', 'Usage & tokens', () => $('#bUsage').click()]];
BOOT.push(() => {
  $('#right').innerHTML = RIGHT.map((r, i) => r === '|' ? '<div class="sep"></div>' : `<button data-i="${i}" data-tip="${esc(r[1])}">${icon(r[0])}</button>`).join('');
  $('#right').onclick = e => { const b = e.target.closest('button'); if (b) RIGHT[+b.dataset.i][2](b); };
  setInterval(refreshPorts, 15000);
});
TOOLS_MENU.push(['md', 'Markdown', () => openMarkdown(S.doc.path)], ['todo', 'To-do', () => todoPop($('#right button'))], ['globe', 'Web tile', () => addWeb()], ['play', 'Musique', () => addMusic()]);
