/* Board : Tuiles web localhost (M16) */
/* =========================================================
   M16 Tuiles web (localhost) : iframe, ports vivants, tailles d'écran
   ========================================================= */
const DEVICES = [['fit', 'Fit tile', 0, 0], ['DISPLAYS'], ['m24', '24 in monitor', 1920, 1080], ['m27', '27 in monitor', 2560, 1440], ['m32', '32 in 4K', 3840, 2160],
  ['PHONES'], ['se', 'iPhone SE', 375, 667], ['i14', 'iPhone 14 Pro', 393, 852], ['i14m', 'iPhone 14 Pro Max', 430, 932], ['px7', 'Pixel 7', 412, 915], ['s8', 'Galaxy S8+', 360, 740]];
const DEV_PORTS = [3000, 3001, 4200, 5173, 8000, 8080];
let livePorts = [];
async function refreshPorts() { try { livePorts = (await api('GET', '/api/ports')).ports; } catch {} for (const x of nodes.values()) if (x.n.kind === 'web' && !x.n.url) x.t.paint(x); }
const normUrl = u => { u = String(u || '').trim(); if (/^\d+$/.test(u)) u = 'localhost:' + u; if (!/^https?:\/\//.test(u)) u = 'http://' + u; return u; };
TYPES.web = {
  minW: 360, minH: 260,
  render(x) {
    x.el.innerHTML = `<header class="nh" data-drag>${icon('globe')}<b>Web</b><span class="sp"></span><span class="wdev mono"></span>${icon('monitor')}</header>
      <div class="wtabs"><span class="wtab">${icon('globe')}<span class="wtt">Web</span></span><span class="sp"></span></div>
      <div class="wbar"><button class="kb wb" title="Précédent">${icon('left')}</button><button class="kb wf" title="Suivant">${icon('right')}</button><button class="kb wr" title="Recharger">${icon('refresh')}</button>
        <div class="wurl">${icon('globe')}<input spellcheck="false" placeholder="localhost:3000 · url"></div><button class="kb wo" title="Ouvrir dans Chrome">${icon('ext')}</button><button class="kb wm" title="Taille d'écran">${icon('dots')}</button></div>
      <div class="wbody"></div>`;
    const n = x.n; n.hist ||= []; n.hi ??= -1;
    const inp = x.el.querySelector('.wurl input');
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && inp.value.trim()) webGo(x, inp.value); };
    x.el.querySelector('.wb').onclick = () => { if (n.hi > 0) { n.hi--; n.url = n.hist[n.hi]; this.paint(x); } };
    x.el.querySelector('.wf').onclick = () => { if (n.hi < n.hist.length - 1) { n.hi++; n.url = n.hist[n.hi]; this.paint(x); } };
    x.el.querySelector('.wr').onclick = () => { const f = x.el.querySelector('iframe'); if (f) f.src = f.src; else refreshPorts(); };
    x.el.querySelector('.wo').onclick = () => n.url && window.open(n.url, '_blank');
    x.el.querySelector('.wm').onclick = e => {
      const p = openPop(e.currentTarget, DEVICES.map(d => d.length === 1 ? `<h4 class="caps" style="margin-top:8px">${d[0]}</h4>` : `<button class="it ${n.device === d[0] || (!n.device && d[0] === 'fit') ? 'on' : ''}" data-dev="${d[0]}"><span class="t"><b>${d[1]}</b>${d[2] ? `<small class="mono">${d[2]} × ${d[3]}</small>` : ''}</span></button>`).join(''), 'below');
      if (p) p.onclick = ev => { const b = ev.target.closest('[data-dev]'); if (b) { n.device = b.dataset.dev; closePop(); this.paint(x); saveSoon(); } };
    };
    this.paint(x);
  },
  paint(x) {
    const n = x.n, B = x.el.querySelector('.wbody'), dev = DEVICES.find(d => d[0] === n.device && d[2]);
    x.el.querySelector('.wurl input').value = n.url ? n.url.replace(/^https?:\/\//, '') : '';
    x.el.querySelector('.wtt').textContent = n.url ? n.url.replace(/^https?:\/\//, '').slice(0, 24) : 'Web';
    x.el.querySelector('.wdev').textContent = dev ? `${dev[1]} · ${dev[2]} × ${dev[3]}` : '';
    if (!n.url) {
      const ports = [...new Set([...DEV_PORTS, ...livePorts])].sort((a, b) => a - b);
      B.innerHTML = `<div class="wstart"><div class="wsh">${icon('globe')}<b>Open a page</b><span class="sp"></span><span class="mono dimr">● idle</span></div>
        <div class="usec"><span class="caps">Localhost</span><span class="mono" style="color:var(--ok);font-size:11.5px">● ${livePorts.length} live</span></div>
        <div class="wgo"><span class="mono dimr">http://</span><input class="mono" value="localhost:${livePorts.find(p => DEV_PORTS.includes(p)) || 3000}" spellcheck="false"><button class="wgob">${icon('right')}</button></div>
        <div class="wports">${ports.map(p => `<button data-p="${p}" class="${livePorts.includes(p) ? 'live' : ''}"><i></i>:${p}</button>`).join('')}</div>
        <p class="unote">Les ports en vert répondent sur ce Mac. Seul localhost s'ouvre ici (aucun site externe chargé par le Board).</p></div>`;
      const gi = B.querySelector('.wgo input');
      gi.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') webGo(x, gi.value); };
      B.querySelector('.wgob').onclick = () => webGo(x, gi.value);
      B.querySelector('.wports').onclick = e => { const b = e.target.closest('[data-p]'); if (b) webGo(x, 'localhost:' + b.dataset.p); };
      return;
    }
    if (!dev) { B.innerHTML = `<iframe src="${esc(n.url)}" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"></iframe>`; return; }
    B.innerHTML = `<div class="wscale"><iframe src="${esc(n.url)}" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals" style="width:${dev[2]}px;height:${dev[3]}px"></iframe></div>`;
    this.resized(x);
  },
  resized(x) {
    const dev = DEVICES.find(d => d[0] === x.n.device && d[2]), f = x.el.querySelector('.wscale iframe'); if (!dev || !f) return;
    const B = x.el.querySelector('.wbody'), k = Math.min(B.clientWidth / dev[2], B.clientHeight / dev[3]);
    f.style.transform = `scale(${k})`; f.style.left = Math.max(0, (B.clientWidth - dev[2] * k) / 2) + 'px';
  },
};
function webGo(x, u) {
  const n = x.n, url = normUrl(u);
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)) return toast('Tuile web : localhost seulement (pas de réseau sortant)', 1);
  n.hist = n.hist.slice(0, n.hi + 1); n.hist.push(url); n.hi = n.hist.length - 1; n.url = url;
  x.t.paint(x); saveSoon();
}
function addWeb(at, url) {
  const p = at || centerSpot(820, 560);
  const n = { id: uid(), kind: 'web', x: p.x, y: p.y, w: 820, h: 560, url: url ? normUrl(url) : '' };
  addNode(n); select(n.id); refreshPorts();
  return n;
}

// Tuile Musique : voir music.js (lecteur façon FreeTube via yt-dlp local).
