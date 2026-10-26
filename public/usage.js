/* Board : Usage et tokens (M17) */
/* Aides communes aux modules P2 */
const fmtN = n => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n || 0);
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDay = k => { if (!k) return '—'; const [y, m, d] = k.split('-'); return `${MONTHS[+m - 1]} ${+d}${+y !== new Date().getFullYear() ? ', ' + y : ''}`; };
function centerSpot(w, h) { const c = toWorld(innerWidth / 2, innerHeight / 2 - 40); return { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2) }; }

/* =========================================================
   M17 Usage : pastille + panneau (activité, stats) + vue Tokens
   ========================================================= */
let U = { data: null, cli: 'claude', view: 'usage', range: '30', metric: 'all' };
// Limites du forfait (% session 5 h / semaine) : verdict immédiat « je tape / je ralentis / j'attends le reset ».
async function loadLimits(force) {
  try { U.lim = await api('GET', '/api/limits' + (force ? '?force=1' : '')); } catch (e) { U.lim = { error: e.message }; }
  paintUsagePill();
  if ($('#usagePop')) paintUsage();
}
const pctCol = p => p >= 90 ? '#f85149' : p >= 70 ? '#e8a33d' : '#3fb950';
function fmtReset(iso) {
  if (!iso) return '';
  const t = new Date(iso), m = Math.max(0, Math.round((t - Date.now()) / 60000)), d = Math.floor(m / 1440), hh = Math.floor(m % 1440 / 60), mm = m % 60;
  const at = t.toLocaleString('fr-FR', { weekday: m > 1440 ? 'short' : undefined, hour: '2-digit', minute: '2-digit' });
  return `reset ${at} · dans ${d ? d + ' j ' : ''}${d || hh ? hh + ' h' : ''}${d ? '' : ' ' + String(mm).padStart(2, '0') + ' min'}`.replace(/\s+/g, ' ');
}
function limitsBlock() {
  const L = U.lim;
  if (!L) return `<div class="unotice">${icon('info')}<span>Lecture des limites…</span></div>`;
  if (L.error) return `<div class="unotice">${icon('info')}<span>${esc(L.error)}</span></div>`;
  const bar = (label, w, win) => {
    if (!w) return '';
    const p = Math.round(w.pct), el = win && w.resetsAt ? Math.min(100, Math.max(0, 100 - (new Date(w.resetsAt) - Date.now()) / win * 100)) : null;
    return `<div class="lrow"><div class="ll"><b>${label}</b><span class="sp"></span><b class="mono" style="color:${pctCol(p)}">${p} %</b></div>
      <div class="ltrack"><i style="width:${Math.min(100, p)}%;background:${pctCol(p)}"></i>${el != null ? `<u style="left:${el}%" title="Temps écoulé de la fenêtre : ${Math.round(el)} %"></u>` : ''}</div>
      <small class="mono dimr">${fmtReset(w.resetsAt)}${el != null ? ` · ${Math.round(el)} % du temps écoulé` : ''}</small></div>`;
  };
  const s = L.session?.pct ?? 0, wk = L.week?.pct ?? 0, top = Math.max(s, wk);
  const elW = L.week?.resetsAt ? 100 - (new Date(L.week.resetsAt) - Date.now()) / (7 * 864e5) * 100 : 0;
  const verdict = top >= 90 ? ['stop', `Limite proche (${Math.round(top)} %) : attends le reset ${s >= wk ? 'de la session' : 'de la semaine'}.`]
    : top >= 70 ? ['warn', `${Math.round(top)} % : ralentis, garde le reste pour l'essentiel.`]
    : wk > elW + 10 ? ['warn', `Semaine en avance sur le rythme (${Math.round(wk)} % utilisé, ${Math.round(elW)} % du temps écoulé) : vas-y plus doucement.`]
    : ['ok', `Tu peux taper : session ${Math.round(s)} %, semaine ${Math.round(wk)} % pour ${Math.round(elW)} % du temps écoulé.`];
  return `<div class="limits"><div class="lverdict ${verdict[0]}"><i></i><span>${verdict[1]}</span></div>
    ${bar('Session (5 h)', L.session, 5 * 3600e3)}${bar('Semaine (tous modèles)', L.week, 7 * 864e5)}${bar('Semaine Opus', L.weekOpus, 7 * 864e5)}${bar('Semaine Sonnet', L.weekSonnet, 7 * 864e5)}
    <small class="mono dimr">${L.plan ? 'forfait ' + esc(L.plan) + ' · ' : ''}lu ${ago(L.fetchedAt)}${L.stale ? ' (ancienne valeur)' : ''}</small></div>`;
}
async function loadUsage(force) {
  try { U.data = await api('GET', '/api/usage' + (force ? '?force=1' : '')); } catch (e) { U.err = e.message; }
  paintUsagePill();
  if ($('#usagePop')) paintUsage();
}
function paintUsagePill() {
  const t = U.data?.today?.claude, c = U.data?.today?.codex;
  const tot = (t ? t.in + t.out + t.cache : 0) + (c ? c.in + c.out + c.cache : 0);
  const L = U.lim, lim = L && !L.error && L.session ? `<b class="mono" style="font-weight:600;color:${pctCol(L.session.pct)}" title="Session 5 h">${Math.round(L.session.pct)}%</b><span class="dim">·</span><b class="mono" style="font-weight:600;color:${pctCol(L.week?.pct || 0)}" title="Semaine">${Math.round(L.week?.pct || 0)}%</b><span class="dim">·</span>` : '';
  $('#bUsage').innerHTML = `${icon('info')}${cliIcon('claude', 15)}${lim}<span class="dim">today</span><b class="mono" style="font-weight:600">${U.data ? fmtN(tot) : '…'}</b>`;
}
function heatmap(cli) {
  const days = U.data.days, cells = [], end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - 7 * 52 - ((end.getDay() + 6) % 7));
  const vals = Object.values(days).map(d => d[cli] ? d[cli].in + d[cli].out + d[cli].cache : 0).filter(Boolean).sort((a, b) => a - b);
  const q = p => vals[Math.floor(p * (vals.length - 1))] || 1;
  const th = [q(.25), q(.5), q(.75)];
  const col = cli === 'codex' ? ['#25241B', '#2f3166', '#444ab0', '#5c62d8', '#7376F0'] : ['#25241B', '#5a2a18', '#8f3a1f', '#c44a27', '#EE5732'];
  let x = 0, months = '';
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const wd = (d.getDay() + 6) % 7, k = dayKey(d), e = days[k]?.[cli], v = e ? e.in + e.out + e.cache : 0;
    const lvl = !v ? 0 : v <= th[0] ? 1 : v <= th[1] ? 2 : v <= th[2] ? 3 : 4;
    cells.push(`<rect x="${x * 11 + 26}" y="${wd * 11 + 16}" width="9" height="9" rx="2" fill="${col[lvl]}"><title>${k} · ${fmtN(v)}</title></rect>`);
    if (d.getDate() === 1) months += `<text x="${x * 11 + 26}" y="10">${MONTHS[d.getMonth()]}</text>`;
    if (wd === 6) x++;
  }
  return `<svg class="heat" viewBox="0 0 ${x * 11 + 40} 96">${months}<text x="0" y="33">Mon</text><text x="0" y="55">Wed</text><text x="0" y="77">Fri</text>${cells.join('')}</svg>
    <div class="legend">Less ${col.map(c => `<i style="background:${c}"></i>`).join('')} More</div>`;
}
function paintUsage() {
  const P = $('#usagePop'); if (!P) return;
  const d = U.data;
  const head = `<div class="uhead">${U.view === 'tokens' ? `<button class="ub" data-v="usage">${icon('left')}</button><b class="mono">tokens</b>` : ['claude', 'codex'].map(c => `<button class="utab ${U.cli === c ? 'on' : ''}" data-cli="${c}">${cliIcon(c, 18)}</button>`).join('')}
    <span class="sp"></span><button class="ub ${U.view === 'tokens' ? 'on' : ''}" data-v="tokens" title="Vue Tokens">${icon('chart')}</button><button class="ub" data-r title="Relire les journaux">${icon('refresh')}</button><button class="ub" data-x>${icon('x')}</button></div>`;
  if (!d) { P.innerHTML = head + `<div class="uload"><span class="orb busy"></span><b>Reading local session logs</b><small>Counting tokens straight from each agent's own transcripts on this Mac — nothing leaves your machine.</small></div>`; return; }
  if (U.view === 'tokens') {
    const days = []; for (let i = 29; i >= 0; i--) { const t = new Date(); t.setDate(t.getDate() - i); days.push(dayKey(t)); }
    const val = (e, m) => !e ? 0 : m === 'out' ? e.out : m === 'io' ? e.in + e.out : e.in + e.out + e.cache;
    const max = Math.max(1, ...days.map(k => val(d.days[k]?.claude, U.metric) + val(d.days[k]?.codex, U.metric)));
    const bw = 13, H = 150;
    const bars = days.map((k, i) => { const a = val(d.days[k]?.claude, U.metric), b = val(d.days[k]?.codex, U.metric); const ha = a / max * H, hb = b / max * H;
      return `<g><title>${fmtDay(k)} · Claude ${fmtN(a)} · Codex ${fmtN(b)}</title><rect x="${i * (bw + 4)}" y="${H - ha}" width="${bw}" height="${ha}" rx="2" fill="#EE5732"/><rect x="${i * (bw + 4)}" y="${H - ha - hb}" width="${bw}" height="${hb}" rx="2" fill="#7376F0"/></g>`; }).join('');
    const src = U.range === '30' ? d.last30 : d.allTime, tot = Object.values(src).reduce((s, x) => s + x.total, 0) || 1;
    const top = Object.entries(d.last30).sort((a, b) => b[1].total - a[1].total)[0];
    P.innerHTML = head + `<div class="ubody scroll">
      <div class="ustats3"><div><small>Last 30 days</small><b>${fmtN(Object.values(d.last30).reduce((s, x) => s + x.total, 0))}</b></div><div><small>Busiest day</small><b>${fmtDay(d.busiestDay)}</b></div><div><small>Top agent</small><b>${top ? (top[0] === 'claude' ? 'Claude' : 'Codex') : '—'}</b></div></div>
      <div class="usec"><span class="caps">Last 30 days</span><span class="mono dimr">Tokens per day by agent</span></div>
      <div class="seg">${[['all', 'All tokens'], ['io', 'In + out'], ['out', 'Output']].map(([k, l]) => `<button data-m="${k}" class="${U.metric === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <svg class="bars" viewBox="-2 -4 ${30 * (bw + 4) + 60} ${H + 22}"><line x1="0" x2="${30 * (bw + 4)}" y1="${H}" y2="${H}" stroke="#25241B"/>${bars}
        <text x="${30 * (bw + 4) + 6}" y="${H}">0</text><text x="${30 * (bw + 4) + 6}" y="10">${fmtN(max)}</text>
        <text x="0" y="${H + 16}">${fmtDay(days[0])}</text><text x="${15 * (bw + 4)}" y="${H + 16}">${fmtDay(days[15])}</text><text x="${29 * (bw + 4) - 16}" y="${H + 16}">${fmtDay(days[29])}</text></svg>
      <p class="unote">Everything the model processed — cache reads and writes included.</p>
      <div class="usec"><span class="caps">By agent</span><span class="seg">${[['30', 'Last 30 days'], ['all', 'All time']].map(([k, l]) => `<button data-g="${k}" class="${U.range === k ? 'on' : ''}">${l}</button>`).join('')}</span></div>
      ${['claude', 'codex'].map(c => { const x = src[c] || { in: 0, out: 0, cache: 0, total: 0 }, pc = x.total / tot * 100;
        return `<div class="arow"><div class="al">${cliIcon(c, 18)}<b>${c === 'claude' ? 'Claude' : 'Codex'}</b><span class="sp"></span><b class="mono">${fmtN(x.total)}</b><span class="mono dimr">${pc < 1 && pc > 0 ? '<1' : Math.round(pc)}%</span></div>
          <div class="track"><i style="width:${pc}%;background:${c === 'codex' ? 'var(--codex)' : 'var(--accent)'}"></i></div><small class="mono dimr">in ${fmtN(x.in)} · out ${fmtN(x.out)} · cache ${fmtN(x.cache)}</small></div>`; }).join('')}
      <p class="unote">Claude and Codex record per-session token counts; Gemini, Grok and OpenCode don't, so they can't appear here.</p></div>
      <div class="ufoot mono">local session logs · scanned ${ago(d.scannedAt)}</div>`;
  } else {
    const c = U.cli, all = d.allTime[c] || { total: 0 };
    const st = c === 'claude' ? [['Favorite model', (d.favoriteModel || '—').replace('claude-', '')], ['Total tokens', fmtN(all.total)], ['Sessions', d.sessions.claude], ['Active days', d.activeDays],
      ['Most active day', fmtDay(d.busiestDay)], ['Longest streak', d.longestStreak + ' days'], ['Current streak', d.currentStreak + ' days'], ['Since', fmtDay(d.firstDay)]]
      : [['Lifetime', fmtN(all.total)], ['Sessions', d.sessions.codex], ['Output', fmtN(all.out || 0)], ['Cache', fmtN(all.cache || 0)]];
    P.innerHTML = head + `<div class="ubody scroll">
      ${c === 'claude' ? limitsBlock() : ''}
      <div class="usec"><span class="caps">Activity</span><span class="mono dimr">${c === 'codex' ? 'Last 12 months' : 'All time'}</span></div>${heatmap(c)}
      <div class="ugrid">${st.map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div></div>
      <div class="ufoot mono">${cliIcon(c, 12)} ${c === 'claude' ? 'claude › ~/.claude/projects' : 'codex › ~/.codex/sessions'} · scanned ${ago(d.scannedAt)}</div>`;
  }
}
const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'just now' : s < 60 ? s + 's ago' : Math.round(s / 60) + ' min ago'; };
BOOT.push(() => {
  paintUsagePill();
  $('#bUsage').onclick = () => {
    const p = openPop($('#bUsage'), '', 'below', 'usagePop'); if (!p) return;
    paintUsage(); placePop('below');
    if (!U.data) loadUsage();
    loadLimits();
    p.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.cli) U.cli = b.dataset.cli; if (b.dataset.v) U.view = b.dataset.v; if (b.dataset.m) U.metric = b.dataset.m; if (b.dataset.g) U.range = b.dataset.g;
      if ('x' in b.dataset) return closePop();
      if ('r' in b.dataset) { U.data = null; paintUsage(); loadLimits(true); return loadUsage(true); }
      paintUsage();
    };
  };
  loadUsage(); setInterval(loadUsage, 5 * 60e3);
  loadLimits(); setInterval(loadLimits, 2 * 60e3);
});
TOOLS_MENU.push(['chart', 'Usage & tokens', () => $('#bUsage').click()]);

