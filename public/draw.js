/* Board : Dessin : formes, texte, notes, encre, gomme, images (M15) */
/* =========================================================
   M15 Dessin : formes, texte, notes collantes, encre, gomme, images
   ========================================================= */
const STROKES = ['#F1ECE4', '#1b1b1b', '#E2614C', '#79B05E', '#6E9BF5', '#EE5732', '#A77BF0'];
const FILLS = ['none', '#EE5732', '#79B05E', '#6E9BF5', '#D9A53A', '#E2614C', '#A77BF0'];
const PAPERS = ['#D9A53A', '#F0904A', '#E2614C', '#79B05E', '#4FC1C6', '#6E9BF5', '#A77BF0', '#3a382e'];
const INKS = ['#F1ECE4', '#EE5732', '#79B05E', '#D9A53A', '#E2614C', '#4FC1C6', '#6E9BF5', '#A77BF0', '#8C8A80'];
const SIZES = { S: 18, M: 26, L: 38, XL: 60 };
const FONTS = { hand: 'var(--hand)', sans: 'var(--sans)', mono: 'var(--mono)', serif: 'Georgia, serif' };
let style = store('drawStyle') || { stroke: '#F1ECE4', fill: 'none', sw: 2, dash: 'solid', round: true, opacity: 100, size: 'M', font: 'hand', align: 'left', paper: '#D9A53A', ink: '#F1ECE4', inkW: 3 };
const dashOf = (d, w) => d === 'dashed' ? `${w * 4} ${w * 3}` : d === 'dotted' ? `0.1 ${w * 2.5}` : '';
function shapeSvg(n) {
  const w = n.w, h = n.h, s = n.sw || 2, p = s / 2 + 1, da = dashOf(n.dash, s);
  const at = `stroke="${n.stroke}" stroke-width="${s}" fill="${n.fill === 'none' ? 'none' : n.fill}" fill-opacity="${n.fill === 'none' ? 0 : .35}" stroke-dasharray="${da}" stroke-linecap="round" stroke-linejoin="round"`;
  let body = '';
  if (n.shape === 'rect') body = `<rect x="${p}" y="${p}" width="${Math.max(1, w - 2 * p)}" height="${Math.max(1, h - 2 * p)}" rx="${n.round ? Math.min(14, w / 6, h / 6) : 0}" ${at}/>`;
  else if (n.shape === 'ellipse') body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(1, w / 2 - p)}" ry="${Math.max(1, h / 2 - p)}" ${at}/>`;
  else if (n.shape === 'diamond') body = `<path d="M${w / 2},${p} L${w - p},${h / 2} L${w / 2},${h - p} L${p},${h / 2} Z" ${at}/>`;
  else {
    const [x1, x2] = n.fx ? [w - p, p] : [p, w - p], [y1, y2] = n.fy ? [h - p, p] : [p, h - p];
    body = `<path d="M${x1},${y1} L${x2},${y2}" ${at} fill="none"/>`;
    if (n.shape === 'arrow') { const a = Math.atan2(y2 - y1, x2 - x1), L = 10 + s * 2; body += `<path d="M${x2 - L * Math.cos(a - .45)},${y2 - L * Math.sin(a - .45)} L${x2},${y2} L${x2 - L * Math.cos(a + .45)},${y2 - L * Math.sin(a + .45)}" ${at} fill="none"/>`; }
  }
  return `<svg width="${w}" height="${h}" style="overflow:visible;opacity:${(n.opacity ?? 100) / 100}">${body}</svg>`;
}
TYPES.shape = {
  dragAll: true, erasable: true, minW: 4, minH: 4,
  render(x) { x.el.innerHTML = shapeSvg(x.n) + `<div class="slabel" style="color:${x.n.stroke}"></div>`; x.el.querySelector('.slabel').textContent = x.n.label || ''; x.el.ondblclick = () => editText(x, x.el.querySelector('.slabel'), 'label'); },
  resized(x) { x.el.querySelector('svg').outerHTML = shapeSvg(x.n); },
};
function editText(x, el, key) {
  el.contentEditable = 'true'; el.focus(); document.getSelection().selectAllChildren(el);
  el.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') el.blur(); };
  el.onblur = () => {
    el.contentEditable = 'false'; x.n[key] = el.innerText.trim();
    if (x.n.kind === 'text') { if (!x.n.text) return removeNode(x.n.id); x.n.w = Math.max(40, el.scrollWidth + 6); x.n.h = Math.max(24, el.scrollHeight + 4); place(x); }
    saveSoon();
  };
}
TYPES.text = {
  dragAll: true, erasable: true,
  render(x) {
    const n = x.n;
    x.el.innerHTML = `<div class="ttext" style="color:${n.stroke};font-size:${SIZES[n.size] || 26}px;font-family:${FONTS[n.font] || FONTS.hand};text-align:${n.align || 'left'};opacity:${(n.opacity ?? 100) / 100}"></div>`;
    x.el.querySelector('.ttext').textContent = n.text || '';
    x.el.ondblclick = () => editText(x, x.el.querySelector('.ttext'), 'text');
  },
};
TYPES.note = {
  dragAll: true, erasable: true, minW: 120, minH: 100,
  render(x) {
    x.el.innerHTML = `<div class="paper" style="--p:${x.n.paper || '#D9A53A'}"><div class="ptext"></div></div>`;
    x.el.querySelector('.ptext').textContent = x.n.text || '';
    x.el.ondblclick = () => editText(x, x.el.querySelector('.ptext'), 'text');
  },
};
function inkPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]} l0.1,0` : '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += ` Q${pts[i][0]},${pts[i][1]} ${mx.toFixed(1)},${my.toFixed(1)}`; }
  const l = pts[pts.length - 1]; return d + ` L${l[0]},${l[1]}`;
}
TYPES.ink = {
  dragAll: true, erasable: true, minW: 4, minH: 4,
  render(x) { const n = x.n; x.el.innerHTML = `<svg width="100%" height="100%" viewBox="${-n.inkW} ${-n.inkW} ${n.vw + 2 * n.inkW} ${n.vh + 2 * n.inkW}" preserveAspectRatio="none" style="overflow:visible"><path d="${inkPath(n.pts)}" stroke="${n.ink}" stroke-width="${n.inkW}" fill="none" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`; },
};
TYPES.image = {
  dragAll: true, erasable: true, minW: 30, minH: 30,
  render(x) {
    x.n.wired ||= [];
    x.el.innerHTML = `<img src="${esc(x.n.src)}?t=${TOKEN}" draggable="false" style="width:100%;height:100%;object-fit:contain;display:block;border-radius:6px"><button class="imgplug" title="Relier à une console : son chemin s'écrit dans l'invite">${icon('plug')}<span></span></button>`;
    x.el.querySelector('.imgplug').onclick = () => S.connecting === x.n.id ? endConnect() : beginConnect(x.n.id);
    this.paintConn(x);
  },
  paintConn(x) {
    const b = x.el.querySelector('.imgplug'), on = S.connecting === x.n.id;
    b.classList.toggle('on', on); b.querySelector('span').textContent = on ? 'Done' : x.n.wired.length ? 'Connect · ' + x.n.wired.length : 'Connect';
  },
};
// Chemin de l'image sur le serveur (data/assets/…), pour le donner à une console.
let ASSETS_DIR = null;
async function imagePath(n) {
  ASSETS_DIR ||= (await api('GET', '/api/images')).dir.replace(/images$/, 'assets');
  return ASSETS_DIR + '/' + n.src.replace(/^\/assets\//, '');
}
// Création à la souris
function dragCreate(e, w, make) {
  const n = make(w), x = addNode(n, { silent: true });
  const mv = ev => {
    const p = toWorld(ev.clientX, ev.clientY);
    n.x = Math.round(Math.min(w.x, p.x)); n.y = Math.round(Math.min(w.y, p.y));
    n.w = Math.round(Math.max(4, Math.abs(p.x - w.x))); n.h = Math.round(Math.max(4, Math.abs(p.y - w.y)));
    if (ev.shiftKey && n.shape !== 'line' && n.shape !== 'arrow') n.w = n.h = Math.max(n.w, n.h);
    n.fx = p.x < w.x; n.fy = p.y < w.y;
    place(x); x.t.resized ? x.t.resized(x) : x.t.render(x);
  };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (n.w < 6 && n.h < 6) { n.w = 160; n.h = 100; place(x); x.t.resized(x); } select(n.id); saveSoon(); setTool('select'); stylePanel(); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
for (const s of ['rect', 'ellipse', 'diamond', 'line', 'arrow'])
  TOOL_DOWN[s] = (e, w) => dragCreate(e, w, p => ({ id: uid(), kind: 'shape', shape: s, x: p.x, y: p.y, w: 4, h: 4, stroke: style.stroke, fill: s === 'line' || s === 'arrow' ? 'none' : style.fill, sw: style.sw, dash: style.dash, round: style.round, opacity: style.opacity }));
TOOL_DOWN.text = (e, w) => {
  const n = { id: uid(), kind: 'text', x: Math.round(w.x), y: Math.round(w.y - 16), w: 200, h: 40, text: '', stroke: style.stroke, size: style.size, font: style.font, align: style.align, opacity: style.opacity };
  const x = addNode(n); setTool('select'); select(n.id);
  setTimeout(() => editText(x, x.el.querySelector('.ttext'), 'text'), 0);
};
TOOL_DOWN.note = (e, w) => {
  const n = { id: uid(), kind: 'note', x: Math.round(w.x - 110), y: Math.round(w.y - 90), w: 220, h: 200, text: '', paper: style.paper };
  const x = addNode(n); setTool('select'); select(n.id);
  setTimeout(() => editText(x, x.el.querySelector('.ptext'), 'text'), 0);
};
TOOL_DOWN.pen = (e, w) => {
  const pts = [[w.x, w.y]];
  const tmp = h(`<svg style="position:absolute;left:0;top:0;overflow:visible;width:1px;height:1px;z-index:6;pointer-events:none"><path stroke="${style.ink}" stroke-width="${style.inkW}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  world.appendChild(tmp);
  const mv = ev => { const p = toWorld(ev.clientX, ev.clientY); const l = pts[pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) > 1.5 / view.z) pts.push([p.x, p.y]); tmp.firstChild.setAttribute('d', inkPath(pts)); };
  const up = () => {
    removeEventListener('mousemove', mv); removeEventListener('mouseup', up); tmp.remove();
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
    const vw = Math.max(1, Math.max(...xs) - x0), vh = Math.max(1, Math.max(...ys) - y0);
    addNode({ id: uid(), kind: 'ink', x: Math.round(x0), y: Math.round(y0), w: Math.round(vw), h: Math.round(vh), vw, vh, pts: pts.map(p => [+(p[0] - x0).toFixed(1), +(p[1] - y0).toFixed(1)]), ink: style.ink, inkW: style.inkW });
  };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
};
TOOL_DOWN.eraser = () => {
  const mv = ev => { const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.node'); const x = t && nodes.get(t.dataset.id); if (x && x.t.erasable) removeNode(x.n.id); };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
};
TOOL_DOWN.web = (e, w) => { setTool('select'); addWeb({ x: Math.round(w.x - 400), y: Math.round(w.y - 40) }); };
TOOL_CLICK.shapes = btn => {
  const p = openPop(btn, `<h4 class="caps">Shapes</h4>${[['rect', 'Rectangle', 'R', '<rect x="4" y="6" width="16" height="12" rx="2"/>'], ['ellipse', 'Ellipse', 'O', '<ellipse cx="12" cy="12" rx="8" ry="6"/>'], ['diamond', 'Diamond', 'D', '<path d="M12 4l8 8-8 8-8-8z"/>'],
    ['line', 'Line', 'L', '<path d="M5 19L19 5"/>'], ['arrow', 'Arrow', 'X', '<path d="M5 19L19 5M11 5h8v8"/>'], ['note', 'Sticky note', 'N', I.note]].map(([k, l, key, svg]) => `<button class="it" data-s="${k}"><svg class="i" viewBox="0 0 24 24">${svg}</svg><span class="t"><b>${l}</b></span><kbd class="mono" style="color:var(--dim)">${key}</kbd></button>`).join('')}`, 'right');
  if (p) p.onclick = e => { const b = e.target.closest('[data-s]'); if (b) { closePop(); setTool(b.dataset.s); $('#left [data-tool=shapes]').classList.add('on'); } };
};
TOOL_CLICK.image = () => $('#filePick').click();
Object.assign(KEYS, { r: () => setTool('rect'), o: () => setTool('ellipse'), d: () => setTool('diamond'), l: () => setTool('line'), x: () => setTool('arrow'), t: () => setTool('text'), p: () => setTool('pen'), e: () => setTool('eraser'), n: () => setTool('note'), w: () => setTool('web'), i: () => $('#filePick').click() });
async function placeImage(file, at) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > 15e6) return toast('Image trop lourde (max 15 Mo)', 1);
  const data = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(file); });
  const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = data; });
  try {
    const { url } = await api('POST', '/api/upload', { data });
    const k = Math.min(1, 640 / img.width), w = Math.round(img.width * k), hh = Math.round(img.height * k);
    const p = at || centerSpot(w, hh);
    const n = { id: uid(), kind: 'image', src: url, x: Math.round(p.x), y: Math.round(p.y), w, h: hh };
    addNode(n); select(n.id);
  } catch (e) { toast(e.message, 1); }
}
BOOT.push(() => {
  $('#filePick').onchange = e => { placeImage(e.target.files[0]); e.target.value = ''; };
  vp.addEventListener('dragover', e => e.preventDefault());
  vp.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; const w = toWorld(e.clientX, e.clientY); placeImage(f, w); });
  addEventListener('paste', e => { if (isTyping(e)) return; const f = [...(e.clipboardData?.files || [])][0]; if (f) placeImage(f); });
});
KEYS.dupNode = x => { const n = JSON.parse(JSON.stringify(x.n)); n.id = uid(); n.x += 24; n.y += 24; addNode(n); select(n.id); };

// Panneau de style (façon Excalidraw) pour la sélection ou l'outil en cours
function stylePanel() {
  let P = $('#stylePanel');
  const sel = [...S.sel].map(id => nodes.get(id)).filter(Boolean);
  const kinds = new Set(sel.map(x => x.n.kind));
  const tool = S.tool;
  const mode = kinds.size === 1 ? [...kinds][0] : kinds.size ? null : ['rect', 'ellipse', 'diamond', 'line', 'arrow'].includes(tool) ? 'shape' : tool === 'text' ? 'text' : tool === 'pen' ? 'ink' : tool === 'note' ? 'note' : null;
  if (!mode || !['shape', 'text', 'ink', 'note'].includes(mode)) { P && P.remove(); return; }
  if (!P) { P = h('<div id="stylePanel" class="pop"></div>'); document.body.appendChild(P); }
  const cur = sel[0]?.n || {};
  const v = k => cur[k] ?? style[k];
  const sw = (key, list, val) => `<div class="swr">${list.map(c => `<button class="swc ${c === val ? 'on' : ''}" data-k="${key}" data-v="${c}" style="${c === 'none' ? '' : `background:${c}`}">${c === 'none' ? '<svg viewBox="0 0 10 10"><path d="M1 9L9 1" stroke="#E2614C" stroke-width="1.4"/></svg>' : ''}</button>`).join('')}</div>`;
  const seg = (key, opts, val) => `<div class="seg">${opts.map(([k, l]) => `<button data-k="${key}" data-v="${k}" class="${String(k) === String(val) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  let html = '';
  if (mode === 'shape') html = `<div class="caps">Stroke</div>${sw('stroke', STROKES, v('stroke'))}<div class="caps">Background</div>${sw('fill', FILLS, v('fill'))}
    <div class="caps">Stroke width</div>${seg('sw', [[1, 'Thin'], [2, 'Bold'], [4, 'Extra']], v('sw'))}<div class="caps">Stroke style</div>${seg('dash', [['solid', '—'], ['dashed', '- -'], ['dotted', '···']], v('dash'))}
    <div class="caps">Edges</div>${seg('round', [[false, 'Sharp'], [true, 'Round']], v('round'))}`;
  if (mode === 'text') html = `<div class="caps">Text color</div>${sw('stroke', STROKES, v('stroke'))}<div class="caps">Font</div>${seg('font', [['hand', '<span style="font-family:var(--hand)">Ag</span>'], ['sans', 'Ag'], ['mono', '<span class="mono">Ag</span>'], ['serif', '<span style="font-family:Georgia">Ag</span>']], v('font'))}
    <div class="caps">Font size</div>${seg('size', [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']], v('size'))}<div class="caps">Alignment</div>${seg('align', [['left', '⇤'], ['center', '↔'], ['right', '⇥']], v('align'))}`;
  if (mode === 'note') html = `<div class="caps">Paper</div>${sw('paper', PAPERS, v('paper'))}`;
  if (mode === 'ink') html = `<div class="caps">Color</div>${sw('ink', INKS, v('ink'))}<div class="caps">Width</div>${seg('inkW', [[1.5, '1'], [3, '2'], [5, '3'], [8, '4'], [12, '5']], v('inkW'))}`;
  if (mode === 'shape' || mode === 'text') html += `<div class="caps">Opacity</div><input type="range" min="10" max="100" step="5" value="${v('opacity')}" data-k="opacity" class="rng">`;
  if (sel.length) html += `<div class="caps">Actions</div><div class="seg"><button data-a="front" title="Avant-plan">↑</button><button data-a="back" title="Arrière-plan">↓</button><button data-a="dup" title="Dupliquer">${icon('copy')}</button><button data-a="del" title="Supprimer">${icon('trash')}</button></div>`;
  P.innerHTML = html;
  const apply = (k, val) => {
    if (k === 'sw' || k === 'inkW' || k === 'opacity') val = +val; if (k === 'round') val = val === 'true';
    style[k] = val; store('drawStyle', style);
    for (const x of sel) { x.n[k] = val; rerender(x); }
    if (sel.length) saveSoon();
  };
  P.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k) { apply(b.dataset.k, b.dataset.v); return stylePanel(); }
    const a = b.dataset.a;
    if (a === 'del') for (const x of sel) removeNode(x.n.id);
    if (a === 'dup') for (const x of sel) KEYS.dupNode(x);
    if (a === 'front' || a === 'back') for (const x of sel) { S.ws.nodes = S.ws.nodes.filter(n => n !== x.n); a === 'front' ? S.ws.nodes.push(x.n) : S.ws.nodes.unshift(x.n); x.el.style.zIndex = a === 'front' ? 4 : 1; saveSoon(); }
    stylePanel();
  };
  P.oninput = e => { if (e.target.dataset.k) apply(e.target.dataset.k, e.target.value); };
}
document.addEventListener('selection', stylePanel);
document.addEventListener('tool', stylePanel);

