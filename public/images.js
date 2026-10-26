/* Board : tuile Images : un Claude enregistre images/vidéos dans data/images/<lot>/, la tuile s'ouvre en grille ;
   on la relie (fils) à des consoles / groupes / orchestrateur, on coche, on commente, on envoie ; glisser une vignette sur une console = référence. */
const imgUrl = (album, name) => '/images/' + (album ? encodeURIComponent(album) + '/' : '') + encodeURIComponent(name) + '?t=' + TOKEN;
const isVid = n => /\.(mp4|webm|mov|m4v)$/i.test(n);
const VID_MAX = 12; // vidéos affichées par lot (les plus récentes) : au-delà, bouton, sinon tuile illisible et réseau saturé
TYPES.images = {
  minW: 320, minH: 240,
  render(x) {
    x.n.sel ||= []; x.n.wired ||= [];
    x.el.innerHTML = `<header class="nh" data-drag>${icon('image')}<b>Images</b><select class="in isel" title="Lot (sous-dossier)"></select><span class="icount mono"></span><span class="sp"></span>
        <input class="isize" type="range" min="90" max="420" step="10" title="Taille des vignettes"><button class="btn iconn" title="Relier ce lot à des consoles, groupes ou orchestrateur">${icon('plug')}Connect</button></header>
      <div class="ibody scroll"><div class="igrid"></div><div class="imore"></div></div>
      <div class="iview" hidden></div>
      <div class="dfoot"><div class="drow"><input class="in imsg"></div>
        <div class="drow"><select class="in dto" title="Agent destinataire"></select><span class="iwto"></span><button class="btn pri isend">${icon('send')}Envoyer</button></div></div>`;
    const E = x.el, sz = E.querySelector('.isize');
    sz.value = x.n.size || 170; E.style.setProperty('--isz', sz.value + 'px');
    sz.oninput = () => { x.n.size = +sz.value; E.style.setProperty('--isz', sz.value + 'px'); saveSoon(1500); };
    E.querySelector('.isel').onchange = e => { x.n.album = e.target.value; x.n.sel = []; x.allVid = false; this.load(x); saveSoon(); };
    E.querySelector('.dto').onchange = e => { x.n.to = e.target.value; saveSoon(); };
    E.querySelector('.iconn').onclick = () => S.connecting === x.n.id ? endConnect() : beginConnect(x.n.id);
    E.querySelector('.imsg').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') this.send(x); };
    E.querySelector('.isend').onclick = () => this.send(x);
    E.querySelector('.imore').onclick = e => { if (e.target.closest('button')) { x.allVid = true; this.load(x); } };
    const G = E.querySelector('.igrid');
    // Clic = cocher, double-clic = plein cadre (flèches, Échap) ; survol d'une vidéo = lecture muette.
    G.onclick = e => {
      const c = e.target.closest('.icell'); if (!c) return;
      const i = x.n.sel.indexOf(c.dataset.n); i < 0 ? x.n.sel.push(c.dataset.n) : x.n.sel.splice(i, 1);
      this.paintSel(x); saveSoon();
    };
    G.ondblclick = e => { const c = e.target.closest('.icell'); if (c) this.view(x, x.shown.findIndex(i => i.name === c.dataset.n)); };
    G.onmouseover = e => { const v = e.target.closest('.icell')?.querySelector('video'); v && v.play().catch(() => {}); };
    G.onmouseout = e => { const v = e.target.closest('.icell')?.querySelector('video'); if (v && !v.parentNode.contains(e.relatedTarget)) v.pause(); };
    G.ondragstart = e => {
      const c = e.target.closest('.icell'); if (!c) return;
      const names = x.n.sel.includes(c.dataset.n) ? x.n.sel : [c.dataset.n]; // vignette cochée : on glisse toute la sélection
      e.dataTransfer.setData('text/x-board-media', JSON.stringify(names.map(n => this.path(x, n))));
      e.dataTransfer.effectAllowed = 'copy';
    };
    const V = E.querySelector('.iview');
    V.onclick = e => { if (e.target.tagName !== 'VIDEO') this.closeView(x); };
    E.tabIndex = -1;
    E.addEventListener('keydown', e => {
      if (x.vi == null) return;
      if (e.key === 'Escape') this.closeView(x);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') this.view(x, (x.vi + (e.key === 'ArrowRight' ? 1 : -1) + x.shown.length) % x.shown.length);
      else return;
      e.stopPropagation(); e.preventDefault();
    });
  },
  mount(x) { this.load(x); },
  path(x, name) { return x.dir + '/' + (x.n.album ? x.n.album + '/' : '') + name; },
  async load(x) {
    const a = x.n.album != null ? x.n.album : null;
    const r = await api('GET', '/api/images' + (a != null ? '?album=' + encodeURIComponent(a) : '')).catch(() => ({ albums: [], list: [] }));
    x.dir = r.dir;
    if (a == null || !r.albums.some(b => b.name === a)) { // lot disparu ou tuile neuve : le plus récent
      x.n.album = r.albums[0]?.name ?? ''; if (r.albums.length) return this.load(x);
    }
    x.list = r.list || [];
    const vids = x.list.filter(i => isVid(i.name)), hidden = x.allVid ? [] : vids.slice(0, Math.max(0, vids.length - VID_MAX));
    x.shown = x.list.filter(i => !hidden.includes(i));
    x.n.sel = x.n.sel.filter(n => x.list.some(i => i.name === n));
    x.el.querySelector('.isel').innerHTML = r.albums.map(b => `<option value="${esc(b.name)}" ${b.name === x.n.album ? 'selected' : ''}>${esc(b.name || '(racine)')} · ${b.count}</option>`).join('') || '<option>aucune image</option>';
    const ni = x.list.length - vids.length;
    x.el.querySelector('.icount').textContent = [ni && ni + ' img', vids.length && vids.length + ' vid'].filter(Boolean).join(' · ');
    const G = x.el.querySelector('.igrid');
    G.innerHTML = x.shown.length ? x.shown.map((im, i) => {
      const u = imgUrl(x.n.album, im.name) + '&v=' + Math.round(im.mtime);
      const media = isVid(im.name) ? `<video muted loop playsinline preload="metadata" src="${u}#t=0.1"></video><span class="ivid">${icon('play')}</span>` : `<img loading="lazy" draggable="false" src="${u}">`;
      return `<div class="icell" draggable="true" data-n="${esc(im.name)}" title="${esc(im.name)} — clic : cocher · double-clic : plein cadre · glisser sur une console : référence">${media}<span class="inum">${i + 1}</span></div>`;
    }).join('') : `<p class="unote" style="padding:14px">Demande des images ou vidéos à Claude dans une console : il les enregistre dans <span class="mono">${esc(x.dir || 'data/images')}/&lt;lot&gt;/</span> et elles s'affichent ici.</p>`;
    x.el.querySelector('.imore').innerHTML = hidden.length ? `<button class="btn">Afficher ${hidden.length} vidéo(s) plus ancienne(s)</button>` : '';
    this.paintConn(x); this.paintSel(x);
  },
  paintSel(x) {
    x.el.querySelectorAll('.icell').forEach(c => c.classList.toggle('on', x.n.sel.includes(c.dataset.n)));
    x.el.querySelector('.imsg').placeholder = x.n.sel.length ? `Consigne sur ${x.n.sel.length} fichier(s) coché(s)…` : 'Consigne sur tout le lot (clic sur une vignette = la cocher)…';
  },
  // Relié par fils : on envoie aux consoles reliées ; sinon menu déroulant d'un agent.
  paintConn(x) {
    const ids = wiredAgents(x.n), conn = S.connecting === x.n.id, b = x.el.querySelector('.iconn');
    b.className = 'btn iconn' + (conn ? ' pri' : ''); b.innerHTML = conn ? `${icon('check')}Done` : `${icon('plug')}${x.n.wired.length ? 'Connect · ' + x.n.wired.length : 'Connect'}`;
    x.el.querySelector('.dto').hidden = !!ids.length;
    x.el.querySelector('.iwto').textContent = ids.length ? '→ ' + ids.map(id => agentOf(id)?.name).join(', ') : '';
    if (!ids.length) TYPES.diagram.paintTo(x);
  },
  view(x, i) {
    const im = x.shown[i]; if (!im) return;
    x.vi = i;
    const V = x.el.querySelector('.iview'), u = imgUrl(x.n.album, im.name) + '&v=' + Math.round(im.mtime);
    V.innerHTML = (isVid(im.name) ? `<video controls autoplay playsinline src="${u}"></video>` : `<img src="${u}">`) + `<span class="ivn mono">${i + 1}/${x.shown.length} · ${esc(im.name)}</span>`;
    V.hidden = false; x.el.focus();
  },
  closeView(x) { const V = x.el.querySelector('.iview'); V.hidden = true; V.innerHTML = ''; x.vi = null; },
  async send(x) {
    const inp = x.el.querySelector('.imsg'), txt = inp.value.trim().replace(/\s+/g, ' ');
    if (!txt) return toast('Écris une consigne', 1);
    const to = wiredAgents(x.n).length ? wiredAgents(x.n) : agentOf(x.n.to) ? [x.n.to] : [];
    if (!to.length) return toast('Relie le lot (Connect) ou choisis une console', 1);
    const dir = x.dir + (x.n.album ? '/' + x.n.album : '');
    const picked = x.shown.map((im, i) => [i + 1, im.name]).filter(([, n]) => x.n.sel.includes(n));
    const msg = `Fichiers du lot ${dir} : ${picked.length ? 'choisis ' + picked.map(([i, n]) => `n°${i} (${n})`).join(', ') : 'tout le lot'}. ${txt}`;
    const ok = await sendTo(to, msg);
    if (!ok.length) return;
    inp.value = ''; x.n.sel = []; this.paintSel(x); saveSoon();
    toast(`Envoyé à ${ok.join(', ')}`);
  },
};
function addImages(album, at, wired = []) {
  const p = at || centerSpot(720, 600);
  const n = { id: uid(), kind: 'images', x: p.x, y: p.y, w: 720, h: 600, album: album ?? null, sel: [], wired };
  addNode(n); select(n.id); drawWires();
  return n;
}
// Push serveur : rafraîchir les tuiles de ce lot ; lot sans tuile → tuile ouverte et reliée à l'agent qui a écrit.
document.addEventListener('images', e => {
  const m = e.detail; if (!S.ws) return;
  const open = [...nodes.values()].filter(x => x.n.kind === 'images');
  open.forEach(x => x.t.load(x));
  if (open.some(x => x.n.album === m.album)) return;
  const near = m.owner && nodes.get(m.owner)?.n;
  const n = addImages(m.album, near ? findFree(near.x + near.w + 30, near.y, 720, 600) : null, near ? [m.owner] : []);
  frame([n], 1, true); toast(`Nouveau lot : ${m.album || '(racine)'}`);
});
// Vignette glissée sur une console (ou un groupe / orchestrateur) : chemins tapés dans son invite, sans Entrée, pour finir la consigne.
document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-board-media')) e.preventDefault(); }, true);
document.addEventListener('drop', async e => {
  const raw = e.dataTransfer.getData('text/x-board-media'); if (!raw) return;
  e.preventDefault(); e.stopPropagation();
  const el = e.target.closest('.node'), n = el && nodes.get(el.dataset.id)?.n;
  const ids = !n ? [] : n.kind === 'agent' ? [n.id] : n.kind === 'group' ? groupMembers(n.id).map(m => m.id) : n.kind === 'orch' ? wiredAgents(n) : [];
  if (!ids.length) return toast('Lâche la vignette sur une console, un groupe ou un orchestrateur', 1);
  const paths = JSON.parse(raw);
  const ok = await sendTo(ids, `${paths.length > 1 ? 'Références' : 'Référence'} : ${paths.join(' ')} `, false);
  if (ok.length) toast(`${paths.length} fichier(s) → ${ok.join(', ')} : finis la consigne dans la console`);
}, true);
TOOLS_MENU.push(['image', 'Images', () => { const n = addImages(); frame([n], 1, true); }]);
RIGHT.splice(RIGHT.length - 1, 0, ['image', 'Images (dossier)', () => { const n = addImages(); frame([n], 1, true); }]);
