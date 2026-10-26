/* Board : cœur (API, canvas, nœuds, barre du haut, espaces, accueil, raccourcis) */
const TOKEN = location.hash.slice(1);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const uid = () => crypto.randomUUID();
const vp = $('#vp'), world = $('#world');

const I = {
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  chev: '<path d="M6 9l6 6 6-6"/>', up: '<path d="M6 15l6-6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>', left: '<path d="M15 6l-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/><circle cx="12" cy="12" r="6.5"/>',
  cursor: '<path d="M6 3.5l12.5 7.2-5.6 1.5-2.6 5.6z" fill="currentColor"/>',
  shapes: '<rect x="3.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M9 8.5V6.5A2.5 2.5 0 0 1 11.5 4h6A2.5 2.5 0 0 1 20 6.5v6a2.5 2.5 0 0 1-2.5 2.5h-3"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
  pen: '<path d="M12 4c-2.5 5-4.5 10-5.5 16M12 4c2.5 5 4.5 10 5.5 16"/>',
  eraser: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" transform="rotate(45 12 12)"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  layers: '<path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z"/><path d="M3.5 12.5l8.5 4.5 8.5-4.5"/><path d="M3.5 16.5l8.5 4.5 8.5-4.5"/>',
  todo: '<circle cx="5.5" cy="7" r="2"/><path d="M4.6 7l.7.7 1.2-1.4M10 7h10"/><circle cx="5.5" cy="16.5" r="2"/><path d="M10 16.5h10"/>',
  orbit: '<circle cx="12" cy="5" r="2"/><circle cx="18" cy="9" r="2"/><circle cx="18" cy="15.5" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="6" cy="15.5" r="2"/><circle cx="6" cy="9" r="2"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  loop: '<path d="M17 3l3 3-3 3"/><path d="M4 12V10a4 4 0 0 1 4-4h12M7 21l-3-3 3-3"/><path d="M20 12v2a4 4 0 0 1-4 4H4"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  focus: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M9 10h6M9 14h6"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9c0 5-6 4-12 8"/>',
  github: '<path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>', play: '<path d="M7 5l12 7-12 7z"/>',
  check: '<path d="M5 12l5 5 9-10"/>', plug: '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  grid4: '<rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><rect x="14" y="14" width="6" height="6" rx="1.2"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-7M21 20H3"/>', kbd: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9l3 3-3 3M12 15h5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  note: '<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/>', dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  md: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M6.5 15V9l2.5 3 2.5-3v6M15 9v6M13 13l2 2 2-2"/>',
};
const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24">${I[n] || ''}</svg>`;
const CLI_COLORS = ['#E9739A', '#4FC1C6', '#F0904A', '#A77BF0', '#6E9BF5', '#6FBF73', '#D9A53A'];
function cliIcon(id, s = 16) {
  const v = `width="${s}" height="${s}" viewBox="0 0 24 24" style="flex:none"`;
  if (id === 'claude') return `<svg ${v}><g stroke="#EE5732" stroke-width="2.3" stroke-linecap="round"><path d="M12 2.5v6.5M12 15v6.5M2.5 12H9M15 12h6.5M5.3 5.3l4.6 4.6M14.1 14.1l4.6 4.6M5.3 18.7l4.6-4.6M14.1 9.9l4.6-4.6"/></g></svg>`;
  if (id === 'codex') return `<svg ${v}><rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="#7376F0"/><path d="M8 9l3 3-3 3M12.5 15H16" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (id === 'gemini') return `<svg ${v}><path d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10z" fill="#5B8DEF"/></svg>`;
  if (id === 'shell') return `<svg ${v}><rect x="3" y="4" width="18" height="16" rx="3.5" fill="none" stroke="#B9B3A6" stroke-width="1.7"/><path d="M7.5 9.5l2.5 2.5-2.5 2.5M12.5 14.5h4" stroke="#B9B3A6" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>`;
  const c = CLI_COLORS[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % CLI_COLORS.length];
  const L = (cliDef(id)?.label || id || '?')[0].toUpperCase();
  return `<svg ${v}><rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="${c}" opacity=".9"/><text x="12" y="16.3" text-anchor="middle" font-size="12" font-weight="700" font-family="-apple-system,sans-serif" fill="#111">${L}</text></svg>`;
}

/* ---------- État ---------- */
const S = { doc: null, ws: null, catalog: [], settings: {}, runtime: {}, sys: { ram: {}, live: 0, max: 10 }, repos: [], sel: new Set(), tool: 'select', toolArg: null };
const nodes = new Map(); // id -> { n, el, t }
const TYPES = {};
let view = { x: 0, y: 0, z: 1 };
const cliDef = id => S.catalog.find(c => c.id === id);

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'x-token': TOKEN, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}
function toast(t, err) { const e = $('#toast'); e.textContent = t; e.className = err ? 'err' : ''; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', err ? 6000 : 3200); }
function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('board.' + k)); localStorage.setItem('board.' + k, JSON.stringify(v)); } catch { return null; } }

// Modale de confirmation (jamais confirm() : cohérent et testable)
function ask(title, text, okLabel = 'OK', danger) {
  return new Promise(res => {
    const sc = $('#scrim');
    sc.innerHTML = `<div class="modal"><h3>${esc(title)}</h3><p>${esc(text)}</p><div class="row"><button class="btn" data-r="0">Cancel</button><button class="btn ${danger ? 'red' : 'pri'}" data-r="1">${esc(okLabel)}</button></div></div>`;
    sc.classList.add('open');
    const done = v => { sc.classList.remove('open'); sc.innerHTML = ''; removeEventListener('keydown', key, true); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); done(true); } };
    addEventListener('keydown', key, true);
    sc.onclick = e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); else if (e.target === sc) done(false); };
    setTimeout(() => sc.querySelector('[data-r="1"]')?.focus(), 0);
  });
}
function prompt2(title, value = '', placeholder = '') {
  return new Promise(res => {
    const sc = $('#scrim');
    sc.innerHTML = `<div class="modal"><h3>${esc(title)}</h3><p><input class="in" style="width:100%" placeholder="${esc(placeholder)}"></p><div class="row"><button class="btn" data-r="0">Cancel</button><button class="btn pri" data-r="1">OK</button></div></div>`;
    const inp = sc.querySelector('input'); inp.value = value;
    sc.classList.add('open');
    const done = v => { sc.classList.remove('open'); sc.innerHTML = ''; res(v); };
    inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(null); e.stopPropagation(); };
    sc.onclick = e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1' ? inp.value.trim() : null); };
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
  });
}

/* ---------- Popovers ---------- */
let popEl = null, popAnchor = null;
function closePop() { if (popEl) { popEl.remove(); popEl = null; popAnchor && popAnchor.classList.remove('on'); popAnchor = null; } }
function openPop(anchor, html, where = 'below', id) {
  if (popEl && popAnchor === anchor) { closePop(); return null; }
  closePop();
  popEl = h(`<div class="pop"${id ? ` id="${id}"` : ''}>${html}</div>`);
  document.body.appendChild(popEl);
  popAnchor = anchor; anchor && anchor.classList.add('on');
  placePop(where);
  return popEl;
}
function placePop(where) {
  if (!popEl || !popAnchor) return;
  const r = popAnchor.getBoundingClientRect(), p = popEl.getBoundingClientRect();
  let x, y;
  if (where === 'right') { x = r.right + 12; y = Math.min(r.top - 10, innerHeight - p.height - 12); }
  else if (where === 'left') { x = r.left - p.width - 12; y = Math.min(r.top - 10, innerHeight - p.height - 12); }
  else if (where === 'above') { x = r.left + r.width / 2 - p.width / 2; y = r.top - p.height - 10; }
  else { x = Math.min(r.right - p.width, innerWidth - p.width - 12); x = Math.max(12, Math.min(x, r.left)); y = r.bottom + 8; }
  popEl.style.left = Math.max(12, Math.min(x, innerWidth - p.width - 12)) + 'px';
  popEl.style.top = Math.max(12, y) + 'px';
}
addEventListener('mousedown', e => { if (popEl && !popEl.contains(e.target) && !(popAnchor && popAnchor.contains(e.target))) closePop(); }, true);

/* ---------- Vue : pan / zoom ---------- */
function applyView() {
  world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`;
  const g = 26 * view.z;
  vp.style.backgroundSize = `${g}px ${g}px`;
  vp.style.backgroundPosition = `${view.x}px ${view.y}px`;
  $('#zLbl').textContent = Math.round(view.z * 100) + '%';
  if (S.ws) { S.ws.view = { ...view }; saveSoon(1500); }
}
function zoomAt(f, cx, cy) {
  const z = Math.min(2, Math.max(0.1, view.z * f));
  view.x = cx - (cx - view.x) * (z / view.z);
  view.y = cy - (cy - view.y) * (z / view.z);
  view.z = z; applyView();
}
const toWorld = (cx, cy) => ({ x: (cx - view.x) / view.z, y: (cy - view.y) / view.z });
function bbox(list) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const n of list) { a = Math.min(a, n.x); b = Math.min(b, n.y - (n.kind === 'group' ? 34 : 0)); c = Math.max(c, n.x + n.w); d = Math.max(d, n.y + n.h); }
  return { x: a, y: b, w: c - a, h: d - b };
}
function frame(list, maxZ = 1, anim) {
  if (!list.length) { view = { x: innerWidth / 2, y: innerHeight / 2, z: 1 }; return applyView(); }
  const r = bbox(list), W = innerWidth - 200, H = innerHeight - 260;
  const z = Math.max(0.1, Math.min(maxZ, W / r.w, H / r.h));
  const target = { z, x: 100 + (W - r.w * z) / 2 - r.x * z, y: 80 + (H - r.h * z) / 2 - r.y * z };
  const tok = ++frameTok;
  if (!anim) { view = target; return applyView(); }
  const from = { ...view }, t0 = performance.now();
  const step = t => { if (tok !== frameTok) return; const k = Math.min(1, (t - t0) / 320), e = 1 - Math.pow(1 - k, 3);
    view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e }; applyView(); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
let frameTok = 0; // une nouvelle vue annule l'animation en cours
// Place un rectangle sans chevaucher l'existant (décale vers la droite, puis ligne suivante)
function findFree(x, y, w, h) {
  const list = (S.ws?.nodes || []).filter(n => n.kind !== 'group');
  const hit = (a, b) => a.x < b.x + b.w + 20 && b.x < a.x + a.w + 20 && a.y < b.y + b.h + 20 && b.y < a.y + a.h + 20;
  for (let i = 0; i < 60; i++) { const r = { x, y, w, h }; if (!list.some(n => hit(r, n))) return { x, y }; x += Math.round(w / 2); if (i % 12 === 11) { x -= Math.round(w * 6); y += h + 30; } }
  return { x, y };
}
const fitAll = () => frame(S.ws ? S.ws.nodes : [], 1, true);
function goTo(id) { const x = nodes.get(id); if (!x) return; select(id); frame([x.n], 1, true); }

let space = false;
const isTyping = e => e.target.closest && e.target.closest('input, textarea, [contenteditable=true], .term');
addEventListener('keydown', e => { if (e.code === 'Space' && !isTyping(e)) { space = true; document.body.classList.add('space'); } });
addEventListener('keyup', e => { if (e.code === 'Space') { space = false; document.body.classList.remove('space'); } });

vp.addEventListener('mousedown', e => {
  const onBg = e.target === vp || e.target === world || e.target.id === 'wires';
  if (e.button === 1 || (space && !e.target.closest('.term'))) return pan(e);
  if (!onBg) return;
  closePop();
  const w = toWorld(e.clientX, e.clientY);
  if (S.tool !== 'select' && TOOL_DOWN[S.tool]) { e.preventDefault(); return TOOL_DOWN[S.tool](e, w); }
  if (e.shiftKey) return lasso(e);
  if (S.connecting) return;
  select(null);
  pan(e);
});
function pan(e) {
  e.preventDefault();
  const sx = e.clientX - view.x, sy = e.clientY - view.y;
  vp.classList.add('panning');
  const mv = ev => { view.x = ev.clientX - sx; view.y = ev.clientY - sy; applyView(); };
  const up = () => { vp.classList.remove('panning'); removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
function lasso(e) {
  e.preventDefault();
  const L = $('#lasso'), sx = e.clientX, sy = e.clientY;
  const mv = ev => { Object.assign(L.style, { display: 'block', left: Math.min(sx, ev.clientX) + 'px', top: Math.min(sy, ev.clientY) + 'px', width: Math.abs(ev.clientX - sx) + 'px', height: Math.abs(ev.clientY - sy) + 'px' }); };
  const up = ev => {
    L.style.display = 'none'; removeEventListener('mousemove', mv); removeEventListener('mouseup', up);
    const a = toWorld(Math.min(sx, ev.clientX), Math.min(sy, ev.clientY)), b = toWorld(Math.max(sx, ev.clientX), Math.max(sy, ev.clientY));
    select(null);
    for (const { n } of nodes.values()) if (n.kind !== 'group' && n.x >= a.x && n.y >= a.y && n.x + n.w <= b.x && n.y + n.h <= b.y) select(n.id, true);
  };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
vp.addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); return; }
  if (e.target.closest('.term, .scroll, iframe')) return; // la molette fait défiler le contenu
  e.preventDefault(); view.x -= e.deltaX; view.y -= e.deltaY; applyView();
}, { passive: false });
$('#zIn').onclick = () => zoomAt(1.2, innerWidth / 2, innerHeight / 2);
$('#zOut').onclick = () => zoomAt(1 / 1.2, innerWidth / 2, innerHeight / 2);
$('#zLbl').onclick = fitAll;

/* ---------- Nœuds ---------- */
let saveT;
function saveSoon(ms = 400) {
  clearTimeout(saveT);
  saveT = setTimeout(() => S.doc && api('PUT', '/api/doc', { path: S.doc.path, active: S.doc.active, workspaces: S.doc.workspaces, thread: S.doc.thread }).catch(e => toast('Sauvegarde : ' + e.message, 1)), ms);
}
function place(x) { const n = x.n, s = x.el.style; s.left = n.x + 'px'; s.top = n.y + 'px'; s.width = n.w + 'px'; s.height = n.h + 'px'; }
function mountNode(n) {
  const t = TYPES[n.kind];
  if (!t) return null;
  const el = document.createElement('div');
  el.className = `node k-${n.kind}`;
  el.dataset.id = n.id;
  const x = { n, el, t };
  nodes.set(n.id, x);
  t.render(x);
  if (!t.noHandles) for (const c of ['tl', 'tr', 'bl', 'br']) el.appendChild(h(`<span class="hd ${c}" data-c="${c}"></span>`));
  world.appendChild(el);
  place(x);
  el.addEventListener('mousedown', e => {
    if (S.connecting && canWire(n)) { e.preventDefault(); e.stopPropagation(); return toggleWire(n.id); }
    if (S.tool === 'eraser' && t.erasable) { e.stopPropagation(); return removeNode(n.id); }
    if (e.target.classList.contains('hd')) { e.stopPropagation(); return resizeDrag(e, x, e.target.dataset.c); }
    if (!S.sel.has(n.id)) select(n.id, e.shiftKey);
    const drag = t.dragAll ? !e.target.closest('input, textarea, button, [contenteditable=true], .nodrag, .scroll') : e.target.closest('[data-drag]') && !e.target.closest('button, input');
    if (drag && e.button === 0) moveDrag(e);
  });
  t.mount && t.mount(x);
  return x;
}
function rerender(x) {
  x.t.unmount && x.t.unmount(x);
  x.t.render(x);
  if (!x.t.noHandles) for (const c of ['tl', 'tr', 'bl', 'br']) x.el.appendChild(h(`<span class="hd ${c}" data-c="${c}"></span>`));
  x.t.mount && x.t.mount(x);
}
function addNode(n, opts = {}) {
  S.ws.nodes.push(n);
  const x = mountNode(n);
  if (!opts.silent) saveSoon();
  updateEmpty();
  return x;
}
function removeNode(id, keepData) {
  const x = nodes.get(id);
  if (!x) return;
  x.t.unmount && x.t.unmount(x);
  x.el.remove(); nodes.delete(id); S.sel.delete(id);
  if (!keepData && S.ws) { S.ws.nodes = S.ws.nodes.filter(n => n.id !== id); for (const n of S.ws.nodes) if (n.wired) n.wired = n.wired.filter(w => w !== id); saveSoon(); }
  drawWires(); updateEmpty();
}
function select(id, add) {
  if (!add) { for (const s of S.sel) nodes.get(s)?.el.classList.remove('sel'); S.sel.clear(); }
  if (id && nodes.has(id)) { S.sel.add(id); nodes.get(id).el.classList.add('sel'); }
  document.dispatchEvent(new CustomEvent('selection'));
}
function moveDrag(e) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  const moving = new Set(S.sel);
  for (const id of S.sel) { const x = nodes.get(id); if (x && x.n.kind === 'group') for (const m of groupMembers(id)) moving.add(m.id); }
  const start = [...moving].map(id => nodes.get(id)).filter(Boolean).map(x => ({ x, ox: x.n.x, oy: x.n.y }));
  let moved = false;
  const mv = ev => {
    const dx = (ev.clientX - sx) / view.z, dy = (ev.clientY - sy) / view.z;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    for (const s of start) { s.x.n.x = Math.round(s.ox + dx); s.x.n.y = Math.round(s.oy + dy); place(s.x); }
    refreshGroups(); drawWires();
  };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (moved) { saveSoon(); for (const s of start) s.x.t.moved && s.x.t.moved(s.x); } };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
function resizeDrag(e, x, c) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY, o = { ...x.n }, t = x.t;
  const minW = t.minW || 40, minH = t.minH || 24;
  const mv = ev => {
    const dx = (ev.clientX - sx) / view.z, dy = (ev.clientY - sy) / view.z, n = x.n;
    if (c.includes('r')) n.w = Math.max(minW, Math.round(o.w + dx));
    if (c.includes('l')) { n.w = Math.max(minW, Math.round(o.w - dx)); n.x = o.x + o.w - n.w; }
    if (c.includes('b')) n.h = Math.max(minH, Math.round(o.h + dy));
    if (c.includes('t')) { n.h = Math.max(minH, Math.round(o.h - dy)); n.y = o.y + o.h - n.h; }
    place(x); t.resized && t.resized(x); refreshGroups(); drawWires();
  };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); t.resized && t.resized(x, true); saveSoon(); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
function updateEmpty() { /* le canvas vide reste vide, volontairement */ }

/* ---------- Outils (barre gauche) ---------- */
const TOOL_DOWN = {}; // outil -> (event, pointMonde)
function setTool(t, arg) {
  S.tool = t; S.toolArg = arg ?? null;
  document.body.dataset.tool = t;
  $$('#left button[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  document.dispatchEvent(new CustomEvent('tool'));
}
const LEFT = [
  ['select', 'cursor', 'Sélection (V)'], ['agent', 'agent', 'Agent (A)'], ['shapes', 'shapes', 'Formes (R)'], '|',
  ['text', 'Aa', 'Texte (T)'], ['pen', 'pen', 'Encre (P)'], ['eraser', 'eraser', 'Gomme (E)'], '|',
  ['web', 'globe', 'Tuile web (W)'], ['image', 'image', 'Image (I)'], ['fit', 'expand', 'Tout voir (⌘0)'],
];
function buildLeft() {
  $('#left').innerHTML = LEFT.map(x => x === '|' ? '<div class="sep"></div>' :
    `<button data-tool="${x[0]}" class="${x[0] === 'agent' ? 'agent' : ''}" data-tip="${x[2]}">${x[1] === 'agent' ? cliIcon('claude', 21).replace('#EE5732', 'currentColor') : x[1] === 'Aa' ? '<span style="font:500 17px var(--sans)">Aa</span>' : icon(x[1])}</button>`).join('');
  $('#left').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const t = b.dataset.tool;
    if (t === 'fit') return fitAll();
    if (TOOL_CLICK[t]) return TOOL_CLICK[t](b);
    setTool(t);
  };
}
const TOOL_CLICK = {}; // outils qui ouvrent un popover (agent, formes…)

/* ---------- Barre du haut ---------- */
function renderTop() {
  $('#bHome').innerHTML = `${icon('back')}Back to home`;
  $('#bRepo').innerHTML = `${icon('folder')}<span>${esc(S.doc?.name || '—')}</span>${icon('chev', 'i chev')}`;
  $('#bAddWs').innerHTML = icon('plus');
  $('#bCloseRepo').innerHTML = `${icon('x')}Close`;
  $('#bTools').innerHTML = icon('brief');
  $('#bSettings').innerHTML = icon('gear');
  renderTabs();
}
function wsCount(ws) { return ws.nodes.filter(n => n.kind === 'agent').length; }
function renderTabs() {
  if (!S.doc) return;
  const multi = S.doc.workspaces.length > 1;
  $('#tabs').innerHTML = S.doc.workspaces.map(w => `<div class="tab ${w.id === S.doc.active ? 'on' : ''} ${multi ? 'multi' : ''}" data-id="${w.id}" title="Double-clic : renommer">
    <span class="tn">${esc(w.name)}</span>${wsCount(w) ? `<span class="bd">${wsCount(w)}</span>` : ''}<span class="cx" title="Fermer l'espace">×</span></div>`).join('');
}
$('#tabs').addEventListener('click', async e => {
  const tab = e.target.closest('.tab'); if (!tab) return;
  if (e.target.classList.contains('cx')) return closeWs(tab.dataset.id);
  if (tab.dataset.id !== S.doc.active) switchWs(tab.dataset.id);
});
$('#tabs').addEventListener('dblclick', e => {
  const tab = e.target.closest('.tab'); if (!tab) return;
  const w = S.doc.workspaces.find(x => x.id === tab.dataset.id);
  const sp = tab.querySelector('.tn'); sp.innerHTML = `<input value="${esc(w.name)}">`;
  const inp = sp.querySelector('input'); inp.focus(); inp.select();
  const fin = () => { w.name = inp.value.trim() || w.name; renderTabs(); saveSoon(); };
  inp.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = w.name; inp.blur(); } };
  inp.onblur = fin;
});
$('#bAddWs').onclick = () => {
  const n = S.doc.workspaces.length + 1;
  const w = { id: uid(), name: `Workspace ${n}`, view: { x: innerWidth / 2 - 300, y: innerHeight / 2 - 200, z: 1 }, nodes: [] };
  S.doc.workspaces.push(w); switchWs(w.id); saveSoon(0);
};
async function closeWs(id) {
  const w = S.doc.workspaces.find(x => x.id === id);
  const n = wsCount(w);
  if (!(await ask(`Fermer « ${w.name} » ?`, n ? `${n} console(s) seront arrêtées. Les notes et dessins de cet espace partent avec lui.` : 'Cet espace sera retiré.', 'Fermer', true))) return;
  S.doc.workspaces = S.doc.workspaces.filter(x => x.id !== id);
  if (S.doc.active === id) S.doc.active = S.doc.workspaces[0].id;
  await api('PUT', '/api/doc', { path: S.doc.path, active: S.doc.active, workspaces: S.doc.workspaces, thread: S.doc.thread });
  loadWs();
}
function switchWs(id) { S.doc.active = id; saveSoon(); loadWs(); }
function loadWs() {
  for (const id of [...nodes.keys()]) removeNode(id, true);
  S.sel.clear();
  S.ws = S.doc.workspaces.find(w => w.id === S.doc.active) || S.doc.workspaces[0];
  view = { ...(S.ws.view || { x: 0, y: 0, z: 1 }) }; frameTok++;
  for (const n of S.ws.nodes) mountNode(n);
  applyView(); renderTabs(); refreshGroups(); drawWires(); updateEmpty();
  document.dispatchEvent(new CustomEvent('wsloaded'));
}

/* Repo : menu déroulant, accueil, fermeture */
$('#bRepo').onclick = () => {
  const p = openPop($('#bRepo'), `<h4 class="caps">Repos</h4>${S.repos.map(r => `<button class="it ${r.path === S.doc?.path ? 'on' : ''}" data-p="${esc(r.path)}">${icon('folder')}<span class="t"><b>${esc(r.name)}</b><small class="mono">${esc(r.path.replace(S.home, '~'))}</small></span></button>`).join('')}
    <div class="sepH"></div><button class="it" data-open>${icon('plus')}<span class="t"><b>Open folder…</b></span></button>`);
  if (!p) return;
  p.onclick = e => { const b = e.target.closest('.it'); if (!b) return; closePop(); if ('open' in b.dataset) showHome(); else openRepo(b.dataset.p); };
};
$('#bHome').onclick = async () => { await api('POST', '/api/repo/home'); showHome(); };
$('#bCloseRepo').onclick = async () => {
  const n = Object.keys(S.doc.agents || {}).length;
  if (!(await ask(`Fermer ${S.doc.name} ?`, `Le tableau part dans les archives (data/archive), rien n'est effacé.${n ? ` ${n} console(s) seront arrêtées.` : ''}`, 'Close', true))) return;
  const st = await api('POST', '/api/repo/close', { path: S.doc.path });
  applyState(st);
};
async function openRepo(p) {
  try { applyState(await api('POST', '/api/repo/open', { path: p })); }
  catch (e) { const er = $('#home .err'); if (er) er.textContent = e.message; else toast(e.message, 1); }
}
function showHome() {
  const H = $('#home');
  H.innerHTML = `<div class="orb busy"></div><h1>Board</h1><p>Open a repo · spawn consoles · ship.</p>
    <div class="open"><input class="in" id="hPath" placeholder="~/Desktop/mon-projet" spellcheck="false"><button class="btn pri" id="hOpen">Open folder</button></div>
    <div class="err"></div>
    <div class="list">${S.repos.map(r => `<button data-p="${esc(r.path)}">${icon('folder')}<b>${esc(r.name)}</b><small>${esc(r.path.replace(S.home, '~'))}</small></button>`).join('') || '<p style="text-align:center">Aucun repo récent.</p>'}</div>`;
  H.classList.add('open');
  $('#hOpen').onclick = () => openRepo($('#hPath').value || '~');
  $('#hPath').onkeydown = e => e.key === 'Enter' && $('#hOpen').click();
  H.querySelector('.list').onclick = e => { const b = e.target.closest('button[data-p]'); if (b) openRepo(b.dataset.p); };
  setTimeout(() => $('#hPath').focus(), 0);
}

/* Barre du haut droite : live, RAM, réglages, outils */
function renderSys() {
  const { ram, live, max } = S.sys;
  $('#live b').textContent = live;
  $('#live').title = `${live} console(s) vivante(s) dont ${S.sys.agents ?? 0} agent(s) IA · plafond ${max} agents`;
  const free = ram.freeMB || 0;
  $('#ram b').textContent = free >= 1024 ? (free / 1024).toFixed(1) + ' Go' : free + ' Mo';
  $('#ram').className = 'tb' + (free < 600 ? ' crit' : free < 1200 ? ' low' : '');
  $('#ram').title = `Mémoire disponible : ${free} Mo sur ${ram.totalMB} Mo. Une console claude ≈ 200-300 Mo.`;
}
$('#bSettings').onclick = () => {
  const s = S.settings;
  const p = openPop($('#bSettings'), `<h4 class="caps">Settings</h4>
    <div class="row"><label style="flex:1">Agents simultanés max</label><div class="stepper"><button data-d="-1">−</button><span id="sMax">${s.maxAgents}</span><button data-d="1">+</button></div></div>
    <div class="row"><label style="flex:1">Console par défaut</label><select class="in" id="sCli">${S.catalog.filter(c => c.installed).map(c => `<option value="${c.id}" ${c.id === s.defaultCli ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
    <div class="row"><label style="flex:1">Statut en direct (hooks)</label><button class="sw ${s.hooks ? 'on' : ''}" data-k="hooks"></button></div>
    <div class="row"><label style="flex:1">YOLO par défaut (auto-approbation)</label><button class="sw ${s.yolo ? 'on' : ''}" data-k="yolo"></button></div>
    <div class="foot">Plafond conseillé sur ce Mac (8 Go) : 5 à 10. Les hooks passent par un fichier de réglages propre au Board, jamais par ~/.claude/settings.json.</div>`, 'below');
  if (!p) return;
  const upd = async b => { const r = await api('POST', '/api/settings', b); S.settings = r.settings; S.sys.max = r.settings.maxAgents; renderSys(); };
  p.onclick = async e => {
    const st = e.target.closest('[data-d]');
    if (st) { await upd({ maxAgents: S.settings.maxAgents + +st.dataset.d }); $('#sMax').textContent = S.settings.maxAgents; }
    const sw = e.target.closest('.sw');
    if (sw) { await upd({ [sw.dataset.k]: !S.settings[sw.dataset.k] }); sw.classList.toggle('on', S.settings[sw.dataset.k]); }
  };
  $('#sCli').onchange = e => upd({ defaultCli: e.target.value });
};
const TOOLS_MENU = []; // [icone, libellé, action] ajoutés par les modules
$('#bTools').onclick = () => {
  const p = openPop($('#bTools'), `<h4 class="caps">Tools</h4>${TOOLS_MENU.map((t, i) => `<button class="it" data-i="${i}">${icon(t[0])}<span class="t"><b>${t[1]}</b></span></button>`).join('')}
    <div class="sepH"></div><button class="it" data-i="settings">${icon('gear')}<span class="t"><b>Settings</b></span></button>`);
  if (!p) return;
  p.onclick = e => { const b = e.target.closest('.it'); if (!b) return; closePop(); if (b.dataset.i === 'settings') $('#bSettings').click(); else TOOLS_MENU[+b.dataset.i][2](); };
};

/* ---------- Événements serveur ---------- */
function connectEvents() {
  const ws = new WebSocket(`ws://${location.host}/ws/events?token=${TOKEN}`);
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'sys') { S.sys = m; renderSys(); }
    else if (m.t === 'catalog') S.catalog = m.catalog;
    else if (m.t === 'agent') { S.runtime[m.id] = { ...S.runtime[m.id], ...m }; document.dispatchEvent(new CustomEvent('agent', { detail: m })); }
    else if (m.t === 'diagram') document.dispatchEvent(new CustomEvent('diagram', { detail: m }));
    else if (m.t === 'images') document.dispatchEvent(new CustomEvent('images', { detail: m }));
    else if (m.t === 'todo') document.dispatchEvent(new CustomEvent('todo', { detail: m }));
  };
  ws.onclose = () => setTimeout(connectEvents, 1500);
}

/* ---------- Raccourcis (M27) ---------- */
const KEYS = {}; // touche -> action (outils, ajoutés par les modules)
const KEYHELP = [['⌘ Entrée', 'Nouvelle console (CLI par défaut)'], ['⌘ ⇧ Entrée', 'Nouveau terminal'], ['⌘ G', 'Panneau Git'], ['⌘ 0', 'Tout voir'],
  ['⌘ K', 'Barre de commande'], ['⌘ D', 'Dupliquer la sélection'], ['Suppr', 'Effacer la sélection (console : confirmation)'], ['Échap', 'Annuler l’outil / fermer'],
  ['V A R T P E W I N', 'Sélection, Agent, Rectangle, Texte, Encre, Gomme, Web, Image, Note'], ['O D L X', 'Ellipse, Losange, Ligne, Flèche'],
  ['Espace + glisser', 'Déplacer le tableau'], ['⌘ + molette / pincer', 'Zoom'], ['⇧ + glisser', 'Sélection au lasso'], ['@nom', 'Viser une console dans la barre de commande'], ['?', 'Cette aide']];
function showKeys() {
  const sc = $('#scrim');
  sc.innerHTML = `<div class="modal" id="keys" style="width:min(560px,92vw)"><h3>Raccourcis</h3><table>${KEYHELP.map(k => `<tr><td><kbd>${k[0]}</kbd></td><td>${k[1]}</td></tr>`).join('')}</table><div class="row" style="margin-top:14px"><button class="btn pri" data-r="1">OK</button></div></div>`;
  sc.classList.add('open'); sc.onclick = e => { if (e.target === sc || e.target.closest('[data-r]')) { sc.classList.remove('open'); sc.innerHTML = ''; } };
}
TOOLS_MENU.push(['kbd', 'Shortcuts', showKeys]);
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (e.metaKey && k === 'enter') { e.preventDefault(); return KEYS.newConsole && KEYS.newConsole(e.shiftKey ? 'shell' : S.settings.defaultCli); }
  if (e.metaKey && k === 'g') { e.preventDefault(); return KEYS.git && KEYS.git(); }
  if (e.metaKey && k === '0') { e.preventDefault(); return fitAll(); }
  if (e.metaKey && k === 'k') { e.preventDefault(); return $('#cmdIn').focus(); }
  if (e.key === 'Escape') { if ($('#scrim').classList.contains('open')) return; closePop(); if (S.connecting) KEYS.endConnect && KEYS.endConnect(); setTool('select'); return; }
  if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) {
    if (e.metaKey && k === 'd' && !isTyping(e)) { e.preventDefault(); KEYS.duplicate && KEYS.duplicate(); }
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel.size) { e.preventDefault(); return KEYS.deleteSel && KEYS.deleteSel(); }
  if (e.key === '?') return showKeys();
  if (KEYS[k]) { e.preventDefault(); KEYS[k](); }
}, true);
KEYS.v = () => setTool('select');
KEYS.deleteSel = async () => {
  const ids = [...S.sel];
  const agents = ids.filter(id => nodes.get(id)?.n.kind === 'agent');
  if (agents.length && KEYS.closeAgents) { if (!(await KEYS.closeAgents(agents))) return; }
  for (const id of ids) if (nodes.has(id) && nodes.get(id).n.kind !== 'agent') {
    if (nodes.get(id).n.kind === 'group' && KEYS.dissolve) KEYS.dissolve(id); else removeNode(id);
  }
};

/* ---------- Démarrage ---------- */
const BOOT = []; // modules : fonctions appelées après chargement de l'état
function applyState(st) {
  S.repos = st.repos; S.catalog = st.catalog; S.settings = st.settings; S.sys = st.sys; S.home = st.home; S.vault = st.vault;
  Object.assign(S.runtime, st.runtime || {});
  S.doc = st.doc;
  renderSys();
  if (!S.doc) { for (const id of [...nodes.keys()]) removeNode(id, true); S.ws = null; showHome(); document.body.classList.add('at-home'); return; }
  $('#home').classList.remove('open'); document.body.classList.remove('at-home');
  S.doc.thread ||= [];
  renderTop(); loadWs();
  if (!S.ws.nodes.length && !S.ws.view?.touched) { view = { x: innerWidth / 2, y: innerHeight / 2 - 60, z: 1 }; applyView(); }
  document.dispatchEvent(new CustomEvent('docloaded'));
}
async function boot() {
  if (!TOKEN) { document.body.innerHTML = '<p style="padding:40px;font-family:monospace;color:#eee">Jeton manquant : ouvre le Board via start.sh / Board.app.</p>'; return; }
  let st;
  try { st = await api('GET', '/api/state'); }
  catch { document.body.innerHTML = '<p style="padding:40px;font-family:monospace;color:#eee">Jeton périmé (le serveur a redémarré) : relance Board.app.</p>'; return; }
  buildLeft();
  for (const f of BOOT) f();
  connectEvents();
  applyState(st);
  addEventListener('resize', () => document.dispatchEvent(new CustomEvent('resized')));
  window.__ready = true;
}
