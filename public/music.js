/* Board : tuile Musique façon FreeTube. Pas d'iframe YouTube (embeds refusés) : l'app native Board VPS lance yt-dlp
   SUR LE MAC (pont window.webkit.messageHandlers.music) et on lit le flux audio dans un <audio> détaché du DOM,
   donc le son continue quand on déplace/zoome le board ou change d'espace. Remplace l'ancienne tuile de web.js. */

// Lien YouTube → { id, list } (vidéo, playlist, youtu.be, shorts, music.youtube.com) ; null si autre site ou id invalide.
function ytParse(u) {
  let url; u = String(u || '').trim();
  try { url = new URL(/^https?:\/\//.test(u) ? u : 'https://' + u); } catch { return null; }
  const h = url.hostname.replace(/^(www|m|music)\./, ''), q = k => url.searchParams.get(k);
  if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(h)) return null;
  const id = (h === 'youtu.be' ? url.pathname.slice(1) : q('v') || (/^\/(embed|shorts|live)\/([^/?]+)/.exec(url.pathname) || [])[2]) || null;
  const list = q('list') || null;
  if (id && !/^[\w-]{11}$/.test(id) || list && !/^[\w-]{10,64}$/.test(list) || !id && !list) return null;
  return { id, list };
}
const fmtDur = s => !s || !isFinite(s) ? 'live' : (s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') : Math.floor(s / 60)) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const musicNative = () => !!window.webkit?.messageHandlers?.music;

/* ---------- pont natif (yt-dlp sur le Mac) ---------- */
let mcb = 0;
const mwait = new Map();
window.__musicCb = (cb, r) => { const f = mwait.get(cb); mwait.delete(cb); f && f(r); };
function ytCall(op, q) {
  return new Promise((res, rej) => {
    const cb = ++mcb;
    mwait.set(cb, r => r.error ? rej(new Error(r.error)) : res(r));
    window.webkit.messageHandlers.music.postMessage({ op, q, cb });
  });
}

/* ---------- état global (un seul lecteur, même si plusieurs tuiles) ---------- */
const MA = new Audio();
const M = { q: [], i: -1, vol: 0.8, results: [], tab: 'res', busy: '', tok: 0, retried: false, urls: {} };
try { Object.assign(M, JSON.parse(localStorage.getItem('board.music')) || {}); } catch {}
M.urls = {}; M.busy = ''; M.results ||= [];
MA.volume = M.vol;
const msave = () => { try { localStorage.setItem('board.music', JSON.stringify({ q: M.q, i: M.i, vol: M.vol, results: M.results, tab: M.tab })); } catch {} };
const mtiles = () => [...nodes.values()].filter(x => x.n.kind === 'music');
const mpaint = () => mtiles().forEach(x => TYPES.music.paint(x));

async function mplay(i, at = 0, retry = false) {
  const it = M.q[i]; if (!it) return;
  M.i = i; if (!retry) M.retried = false; msave();
  const tok = ++M.tok, c = M.urls[it.id];
  try {
    if (!c || Date.now() - c.t > 5 * 3600e3) { // les URL googlevideo expirent (~6 h) : on re-résout
      M.busy = 'Chargement…'; mpaint();
      const r = await ytCall('resolve', it.id);
      M.urls[it.id] = { url: r.url, t: Date.now() };
      Object.assign(it, { title: it.title && it.title !== it.id ? it.title : r.title, channel: it.channel || r.channel, duration: it.duration || r.duration });
    }
    if (tok !== M.tok) return; // un autre titre a été demandé entre-temps
    M.busy = '';
    MA.src = M.urls[it.id].url;
    if (at) MA.currentTime = at;
    await MA.play();
  } catch (e) { if (tok === M.tok) { M.busy = ''; toast('Musique : ' + e.message, 1); } }
  msave(); mpaint();
}
const mnext = d => { const j = M.i + d; if (j >= 0 && j < M.q.length) mplay(j); };
MA.addEventListener('ended', () => mnext(1));
MA.addEventListener('playing', () => { M.retried = false; mpaint(); });
MA.addEventListener('pause', mpaint);
MA.addEventListener('error', () => { // URL expirée ou refusée : une nouvelle résolution, puis on abandonne
  const it = M.q[M.i]; if (!it || !MA.src) return;
  if (M.retried) return toast('Musique : lecture impossible', 1);
  M.retried = true; delete M.urls[it.id]; mplay(M.i, MA.currentTime || 0, true);
});
MA.addEventListener('timeupdate', () => {
  for (const x of mtiles()) {
    const r = x.el.querySelector('.mprog'), t = x.el.querySelector('.mtime'); if (!r) continue;
    const d = isFinite(MA.duration) ? MA.duration : 0;
    r.max = d || 1; if (!r.matches(':active')) r.value = MA.currentTime;
    t.textContent = fmtDur(MA.currentTime || 0.001) + ' / ' + fmtDur(d);
  }
});

function menqueue(items, playFirst) {
  const at = M.q.length ? M.i + 1 : 0;
  M.q.splice(at, 0, ...items.map(({ id, title, channel, duration }) => ({ id, title, channel, duration })));
  if (playFirst) mplay(at); else { msave(); mpaint(); }
}
async function msubmit(v) {
  v = v.trim(); if (!v) return;
  const p = ytParse(v);
  try {
    if (p?.list) {
      M.busy = 'Playlist…'; mpaint();
      const r = await ytCall('list', p.list);
      M.results = r.items; M.tab = 'q'; M.busy = '';
      const k = Math.max(0, r.items.findIndex(e => e.id === p.id));
      menqueue([...r.items.slice(k), ...r.items.slice(0, k)], true);
      toast(`${r.items.length} titres ajoutés${r.title ? ' : ' + r.title : ''}`);
    } else if (p?.id) { M.tab = 'q'; menqueue([{ id: p.id, title: p.id }], true); }
    else {
      M.busy = 'Recherche…'; M.tab = 'res'; mpaint();
      M.results = (await ytCall('search', v)).items; M.busy = '';
    }
  } catch (e) { M.busy = ''; toast('Musique : ' + e.message, 1); }
  msave(); mpaint();
}

const mrow = (e, k, inQ) => `<div class="mrow${inQ && k === M.i ? ' on' : ''}" data-k="${k}"><img src="https://i.ytimg.com/vi/${esc(e.id)}/mqdefault.jpg" loading="lazy" alt="">
  <span class="t"><b>${esc(e.title)}</b><small>${esc(e.channel || '')}${e.channel ? ' · ' : ''}${fmtDur(e.duration)}</small></span>
  <button class="kb ${inQ ? 'mdel' : 'madd'}" title="${inQ ? 'Retirer' : 'Ajouter à la file'}">${inQ ? '×' : '+'}</button></div>`;

TYPES.music = {
  minW: 340, minH: 300,
  render(x) {
    x.el.innerHTML = `<header class="nh" data-drag>${icon('play')}<b>Musique</b><span class="sp"></span><a class="kb mft" title="Ouvrir dans FreeTube">${icon('ext')}</a></header>
      <div class="wbar"><div class="wurl">${icon('play')}<input spellcheck="false" placeholder="Rechercher, ou coller un lien YouTube / playlist"></div></div>
      <div class="mbody"></div>`;
    x.el.addEventListener('keydown', e => e.stopPropagation()); // les raccourcis du board ne volent pas les touches
    const inp = x.el.querySelector('.wurl input');
    inp.onkeydown = e => { if (e.key === 'Enter' && musicNative()) { msubmit(inp.value); inp.select(); } };
    x.el.querySelector('.mbody').onclick = e => {
      const t = e.target.closest('[data-t]'); if (t) { M.tab = t.dataset.t; msave(); return mpaint(); }
      const b = e.target.closest('button'), row = e.target.closest('.mrow'), k = row && +row.dataset.k;
      if (b?.classList.contains('mpp')) return MA.src && !MA.paused ? MA.pause() : MA.src ? MA.play() : mplay(Math.max(0, M.i));
      if (b?.classList.contains('mprev')) return mnext(-1);
      if (b?.classList.contains('mnxt')) return mnext(1);
      if (!row) return;
      if (b?.classList.contains('madd')) { M.q.push(M.results[k]); msave(); return mpaint(); }
      if (b?.classList.contains('mdel')) {
        M.q.splice(k, 1);
        if (k === M.i) { MA.pause(); MA.removeAttribute('src'); M.i = Math.min(k, M.q.length - 1); } else if (k < M.i) M.i--;
        msave(); return mpaint();
      }
      if (M.tab === 'q') mplay(k); else menqueue([M.results[k]], true);
    };
    x.el.querySelector('.mbody').oninput = e => {
      if (e.target.classList.contains('mprog')) MA.currentTime = +e.target.value;
      if (e.target.classList.contains('mvol')) { MA.volume = M.vol = +e.target.value; msave(); }
    };
    this.paint(x);
  },
  paint(x) {
    const B = x.el.querySelector('.mbody'), cur = M.q[M.i];
    x.el.querySelector('.mft').href = 'freetube://' + (cur ? 'https://www.youtube.com/watch?v=' + cur.id : '');
    if (!musicNative()) {
      B.innerHTML = `<p class="unote mnat">Ouvre le Board dans une app native qui fournit le pont yt-dlp (non incluse) pour la musique.<br>Le bouton ↗ ouvre FreeTube.</p>`;
      return;
    }
    const list = M.tab === 'q' ? M.q : M.results, sc = B.querySelector('.mlist')?.scrollTop || 0;
    B.innerHTML = `<div class="mtabs"><button data-t="res" class="${M.tab === 'res' ? 'on' : ''}">Résultats</button><button data-t="q" class="${M.tab === 'q' ? 'on' : ''}">File · ${M.q.length}</button><span class="sp"></span><span class="mono dimr">${esc(M.busy)}</span></div>
      <div class="mlist scroll">${list.map((e, k) => mrow(e, k, M.tab === 'q')).join('') || `<p class="unote">${M.tab === 'q' ? 'File vide : clique un résultat.' : 'Tape une recherche puis Entrée (ex. lofi hip hop).'}</p>`}</div>
      <div class="mplayer">
        ${cur ? `<img src="https://i.ytimg.com/vi/${esc(cur.id)}/mqdefault.jpg" alt="">` : '<i class="mimg"></i>'}
        <div class="mmid"><b class="mt">${esc(cur?.title || 'Rien en lecture')}</b>
          <div class="mctl"><button class="kb mprev" title="Précédent">${icon('left')}</button><button class="kb mpp" title="Lecture / pause">${icon(MA.src && !MA.paused ? 'pause' : 'play')}</button><button class="kb mnxt" title="Suivant">${icon('right')}</button>
            <input type="range" class="mprog" min="0" max="1" step="1" value="0"><span class="mtime mono">0:00 / ${fmtDur(cur?.duration)}</span>
            <input type="range" class="mvol" min="0" max="1" step="0.05" value="${M.vol}" title="Volume"></div></div>
      </div>`;
    B.querySelector('.mlist').scrollTop = sc;
    MA.dispatchEvent(new Event('timeupdate'));
  },
};
function addMusic(at) {
  const p = at || centerSpot(560, 460);
  const n = { id: uid(), kind: 'music', x: p.x, y: p.y, w: 560, h: 460 };
  addNode(n); select(n.id);
  return n;
}
