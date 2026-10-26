/* Board : tuile Diagramme (Mermaid) : un Claude écrit data/diagrams/<nom>.mmd, la tuile s'ouvre, on annote, on renvoie à Claude */
I.diagram = '<rect x="3" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="16" width="7" height="5" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/><path d="M6.5 8v8M6.5 12h11v4"/>';
let mmP = null, mmN = 0;
const mermaidReady = () => mmP ||= new Promise((res, rej) => { // chargé à la première tuile seulement (3,5 Mo, local)
  const s = document.createElement('script'); s.src = '/vendor/mermaid.js';
  s.onload = () => { mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict', suppressErrorRendering: true }); res(); };
  s.onerror = () => { mmP = null; rej(new Error('mermaid introuvable')); };
  document.head.appendChild(s);
});
// Message envoyé à l'agent : une ligne, annotations numérotées, libellé du nœud entre « ».
function composeDiagramMsg(file, pins) {
  const items = pins.filter(p => p.text.trim()).map((p, i) => `${i + 1}. ${p.label ? `[nœud « ${p.label} »] ` : ''}${p.text.trim().replace(/\s+/g, ' ')}`);
  return items.length ? `Modifie le diagramme ${file} : ${items.join(' ; ')}. Réécris ce fichier .mmd (Mermaid valide), la tuile du Board se met à jour seule.` : '';
}
TYPES.diagram = {
  minW: 360, minH: 260,
  render(x) {
    x.n.pins ||= [];
    x.el.innerHTML = `<header class="nh" data-drag>${icon('diagram')}<b>Diagramme</b><select class="in dsel" title="Diagrammes"></select><span class="sp"></span>
        <button class="btn dann" title="Clic sur le diagramme = pastille + commentaire">Annoter</button><button class="kb dexp" title="Exporter en SVG">${icon('ext')}</button></header>
      <div class="dbody scroll"><div class="dsvg"></div></div>
      <div class="dfoot"><div class="dpins"></div><div class="drow"><select class="in dto" title="Agent destinataire"></select><button class="btn pri dsend">${icon('send')}Envoyer à Claude</button></div></div>`;
    const E = x.el;
    E.querySelector('.dsel').onchange = e => { x.n.name = e.target.value; x.n.pins = []; this.load(x); saveSoon(); };
    E.querySelector('.dto').onchange = e => { x.n.to = e.target.value; saveSoon(); };
    E.querySelector('.dann').onclick = () => { x.annot = !x.annot; E.classList.toggle('annot', x.annot); E.querySelector('.dann').classList.toggle('pri', x.annot); };
    E.querySelector('.dexp').onclick = () => {
      const svg = E.querySelector('.dsvg svg'); if (!svg) return toast('Rien à exporter', 1);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([svg.outerHTML], { type: 'image/svg+xml' })); a.download = (x.n.name || 'diagramme').replace(/\.mmd$/, '') + '.svg'; a.click();
    };
    E.querySelector('.dsvg').onclick = e => {
      if (!x.annot || e.target.closest('.dpin')) return;
      const W = E.querySelector('.dsvg'), r = W.getBoundingClientRect();
      const g = e.target.closest('g.node, .actor, .task, .messageText, .edgeLabel, .label');
      x.n.pins.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, label: g ? g.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) : '', text: '' });
      this.paintPins(x); saveSoon();
      [...E.querySelectorAll('.dpins input')].at(-1)?.focus();
    };
    E.querySelector('.dpins').onclick = e => { const b = e.target.closest('[data-del]'); if (b) { x.n.pins.splice(+b.dataset.del, 1); this.paintPins(x); saveSoon(); } };
    E.querySelector('.dsend').onclick = () => this.send(x);
  },
  mount(x) { this.load(x); },
  async load(x) {
    const r = await api('GET', '/api/diagrams').catch(() => ({ list: [] }));
    x.dir = r.dir; x.list = r.list;
    if (!x.n.name && r.list[0]) x.n.name = r.list[0].name;
    const cur = r.list.find(d => d.name === x.n.name);
    if (cur?.owner && agentOf(cur.owner) && !agentOf(x.n.to)) x.n.to = cur.owner;
    x.el.querySelector('.dsel').innerHTML = r.list.map(d => `<option ${d.name === x.n.name ? 'selected' : ''}>${esc(d.name)}</option>`).join('') || '<option>aucun diagramme</option>';
    this.paintTo(x);
    const f = x.n.name && await api('GET', '/api/diagrams/file?name=' + encodeURIComponent(x.n.name)).catch(() => null);
    this.draw(x, f ? f.text : null);
  },
  paintTo(x) {
    const ids = Object.keys(S.doc?.agents || {});
    if (!x.n.to || !agentOf(x.n.to)) x.n.to = ids.find(id => agentOf(id).cli === 'claude') || ids[0] || '';
    x.el.querySelector('.dto').innerHTML = ids.map(id => `<option value="${id}" ${id === x.n.to ? 'selected' : ''}>→ ${esc(agentOf(id).name)} (${esc(agentOf(id).cli)})</option>`).join('') || '<option value="">aucune console</option>';
  },
  async draw(x, text) {
    const W = x.el.querySelector('.dsvg');
    if (text == null) { W.innerHTML = `<p class="unote" style="padding:14px">Demande un diagramme à Claude dans une console : il écrit un .mmd dans <span class="mono">${esc(x.dir || 'data/diagrams')}</span> et il s'affiche ici.</p>`; return this.paintPins(x); }
    try {
      await mermaidReady();
      const { svg } = await mermaid.render('dg' + (++mmN), text);
      W.innerHTML = svg;
      const s = W.querySelector('svg'); s.removeAttribute('height'); s.style.maxWidth = '100%';
    } catch (e) { W.innerHTML = `<div class="dgerr"><b>Erreur de syntaxe Mermaid</b><pre class="mono">${esc(String(e.message || e).slice(0, 1200))}</pre></div>`; }
    this.paintPins(x);
  },
  paintPins(x) {
    const W = x.el.querySelector('.dsvg'), P = x.n.pins;
    W.querySelectorAll('.dpin').forEach(p => p.remove());
    P.forEach((p, i) => W.appendChild(h(`<span class="dpin" style="left:${p.x * 100}%;top:${p.y * 100}%">${i + 1}</span>`)));
    const L = x.el.querySelector('.dpins');
    L.innerHTML = P.map((p, i) => `<div class="dpi"><span class="dpin s">${i + 1}</span>${p.label ? `<span class="dlab" title="Nœud visé">« ${esc(p.label)} »</span>` : ''}<input class="in" data-i="${i}" placeholder="Ton commentaire…"><button class="kb" data-del="${i}" title="Effacer la pastille">${icon('x')}</button></div>`).join('');
    L.querySelectorAll('input').forEach(inp => { inp.value = P[+inp.dataset.i].text; inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && e.metaKey) this.send(x); }; inp.oninput = () => { P[+inp.dataset.i].text = inp.value; x.el.querySelector('.dsend').disabled = !P.some(p => p.text.trim()); saveSoon(1500); }; });
    x.el.querySelector('.dsend').disabled = !P.some(p => p.text.trim());
  },
  async send(x) {
    const file = x.dir && x.n.name ? x.dir + '/' + x.n.name : x.n.name;
    const msg = composeDiagramMsg(file, x.n.pins);
    if (!msg) return toast('Écris au moins un commentaire', 1);
    if (!agentOf(x.n.to)) return toast('Choisis l’agent destinataire', 1);
    const ok = await sendTo([x.n.to], msg);
    if (!ok.length) return;
    x.lastSent = msg; x.n.pins = []; this.paintPins(x); saveSoon();
    toast(`Envoyé à ${ok[0]} : ${x.n.name}`);
  },
};
function addDiagram(name, at) {
  const p = at || centerSpot(640, 560);
  const n = { id: uid(), kind: 'diagram', x: p.x, y: p.y, w: 640, h: 560, name: name || '', pins: [] };
  addNode(n); select(n.id);
  return n;
}
// Push serveur : re-rendre les tuiles ouvertes sur ce fichier ; nouveau fichier → tuile ouverte à côté de l'agent qui l'a écrit.
document.addEventListener('diagram', e => {
  const m = e.detail; if (!S.ws) return;
  const open = [...nodes.values()].filter(x => x.n.kind === 'diagram');
  const same = open.filter(x => x.n.name === m.name);
  if (m.gone) return;
  if (same.length) return same.forEach(x => x.t.load(x));
  open.forEach(x => x.t.load(x)); // la liste déroulante gagne l'entrée
  const near = m.owner && nodes.get(m.owner)?.n;
  const n = addDiagram(m.name, near ? findFree(near.x + near.w + 30, near.y, 640, 560) : null);
  if (m.owner && agentOf(m.owner)) n.to = m.owner;
  frame([n], 1, true); toast(`Nouveau diagramme : ${m.name}`);
});
TOOLS_MENU.push(['diagram', 'Diagramme', () => { const n = addDiagram(); frame([n], 1, true); }]);
RIGHT.splice(RIGHT.length - 1, 0, ['diagram', 'Diagramme (Mermaid)', () => { const n = addDiagram(); frame([n], 1, true); }]);
