/* Board : To-do : kanban, checklist, calendrier (M14) */
/* =========================================================
   M14 To-do : Kanban, Checklist, Calendrier
   ========================================================= */
const PRIO = { low: ['Low', 'var(--ok)'], med: ['Med', '#D9A53A'], high: ['High', '#E2614C'] };
TYPES.kanban = {
  minW: 520, minH: 260,
  render(x) {
    const n = x.n;
    n.columns ||= ['Backlog', 'To do', 'In progress', 'Done'].map(name => ({ id: uid(), name, cards: [] }));
    x.el.innerHTML = `<header class="nh" data-drag>${icon('todo')}<b>Board</b></header><div class="kcols scroll"></div>`;
    this.paint(x);
  },
  paint(x) {
    const n = x.n, C = x.el.querySelector('.kcols'), today = dayKey(new Date());
    const due = d => d === today ? 'Today' : d === dayKey(new Date(Date.now() + 864e5)) ? 'Tomorrow' : fmtDay(d);
    C.innerHTML = n.columns.map((c, ci) => `<div class="kcol" data-c="${ci}"><div class="kh"><i></i><b>${esc(c.name)}</b><span class="mono">${c.cards.length}</span><span class="sp"></span><button class="kb" data-menu="${ci}">${icon('dots')}</button></div>
      <div class="kcards" data-c="${ci}">${c.cards.map((k, i) => `<div class="kcard ${k.done ? 'done' : ''}" draggable="true" data-c="${ci}" data-i="${i}" style="--pc:${PRIO[k.priority]?.[1] || 'transparent'}"><button class="kchk" data-chk="${ci}:${i}">${k.done ? icon('check') : ''}</button><div class="kt"><b>${esc(k.title)}</b>${k.notes ? `<small>${esc(k.notes)}</small>` : ''}<div class="kchips">${k.due ? `<span>${icon('history')}${due(k.due)}</span>` : ''}${PRIO[k.priority] ? `<span><i style="background:${PRIO[k.priority][1]}"></i>${PRIO[k.priority][0]}</span>` : ''}</div></div><button class="kb kdel" data-del="${ci}:${i}">${icon('x')}</button></div>`).join('') || `<div class="kempty">${icon('grid4')}No cards</div>`}</div>
      <div class="kform" data-form="${ci}"></div><button class="kadd" data-add="${ci}">${icon('plus')}Add card</button></div>`).join('') + `<button class="kcol knew" data-newcol>${icon('plus')}<span>Column</span></button>`;
  },
  mount(x) {
    const n = x.n, C = x.el.querySelector('.kcols'), T = this;
    const redo = () => { T.paint(x); saveSoon(); };
    C.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.chk) { const [c, i] = b.dataset.chk.split(':'); const k = n.columns[c].cards[i]; k.done = !k.done; return redo(); }
      if (b.dataset.del) { const [c, i] = b.dataset.del.split(':'); n.columns[c].cards.splice(i, 1); return redo(); }
      if ('newcol' in b.dataset) { const v = await prompt2('Nom de la colonne', 'New column'); if (v) { n.columns.push({ id: uid(), name: v, cards: [] }); redo(); } return; }
      if (b.dataset.menu) {
        const ci = +b.dataset.menu;
        const p = openPop(b, `<button class="it" data-a="l">${icon('left')}<span class="t"><b>Move left</b></span></button><button class="it" data-a="r">${icon('right')}<span class="t"><b>Move right</b></span></button><button class="it" data-a="s"><span class="t"><b>Move to start</b></span></button><button class="it" data-a="e"><span class="t"><b>Move to end</b></span></button><div class="sepH"></div><button class="it" data-a="n">${icon('note')}<span class="t"><b>Rename</b></span></button><button class="it" data-a="d" style="color:#ff8a65">${icon('trash')}<span class="t"><b>Delete column</b></span></button>`);
        if (!p) return;
        p.onclick = async ev => {
          const it = ev.target.closest('.it'); if (!it) return; closePop();
          const cols = n.columns, [col] = cols.splice(ci, 1), a = it.dataset.a;
          if (a === 'l') cols.splice(Math.max(0, ci - 1), 0, col); else if (a === 'r') cols.splice(Math.min(cols.length, ci + 1), 0, col);
          else if (a === 's') cols.unshift(col); else if (a === 'e') cols.push(col);
          else if (a === 'n') { cols.splice(ci, 0, col); const v = await prompt2('Nom de la colonne', col.name); if (v) col.name = v; }
          else if (a === 'd') { if (col.cards.length && !(await ask(`Supprimer « ${col.name} » ?`, `${col.cards.length} carte(s) seront supprimées.`, 'Supprimer', true))) cols.splice(ci, 0, col); }
          redo();
        };
        return;
      }
      if (b.dataset.add) return cardForm(x, +b.dataset.add);
    };
    // Glisser-déposer natif entre colonnes
    C.addEventListener('dragstart', e => { const k = e.target.closest('.kcard'); if (k) { e.dataTransfer.setData('text/plain', `${k.dataset.c}:${k.dataset.i}`); k.classList.add('drag'); } });
    C.addEventListener('dragover', e => { if (e.target.closest('.kcol')) e.preventDefault(); });
    C.addEventListener('drop', e => {
      const col = e.target.closest('.kcol'); if (!col) return; e.preventDefault();
      const [c, i] = e.dataTransfer.getData('text/plain').split(':').map(Number);
      const [card] = n.columns[c].cards.splice(i, 1); if (!card) return;
      const to = n.columns[+col.dataset.c], over = e.target.closest('.kcard');
      to.cards.splice(over ? +over.dataset.i : to.cards.length, 0, card);
      if (/done/i.test(to.name)) card.done = true;
      redo();
    });
  },
};
function cardForm(x, ci) {
  const F = x.el.querySelector(`[data-form="${ci}"]`), today = new Date();
  const k = { title: '', notes: '', due: '', priority: '' };
  F.innerHTML = `<div class="caps" style="margin-bottom:6px">New card</div><input class="in kti" placeholder="Card title"><textarea class="in kno" rows="2" placeholder="Notes (optional)"></textarea>
    <div class="kq"><button data-d="0">Today</button><button data-d="1">Tomorrow</button><button data-d="7">Next week</button><input type="date" class="in kdt"></div>
    <div class="kq">${['', 'low', 'med', 'high'].map(p => `<button data-p="${p}" class="${p === '' ? 'on' : ''}">${p ? `<i style="background:${PRIO[p][1]}"></i>${PRIO[p][0]}` : 'None'}</button>`).join('')}</div>
    <div class="row" style="display:flex;gap:6px;justify-content:flex-end"><button class="btn kc">Cancel</button><button class="btn pri ka">Add card</button></div>`;
  x.el.querySelector(`[data-add="${ci}"]`).classList.add('hide');
  const ti = F.querySelector('.kti'); ti.focus();
  F.onclick = e => {
    const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
    if (b.dataset.d) { const d = new Date(today); d.setDate(d.getDate() + +b.dataset.d); k.due = dayKey(d); F.querySelector('.kdt').value = k.due; }
    if (b.dataset.p !== undefined) { k.priority = b.dataset.p; F.querySelectorAll('[data-p]').forEach(z => z.classList.toggle('on', z === b)); }
    if (b.classList.contains('kc')) TYPES.kanban.paint(x);
    if (b.classList.contains('ka')) add();
  };
  F.querySelector('.kdt').onchange = e => k.due = e.target.value;
  const add = () => { k.title = ti.value.trim(); k.notes = F.querySelector('.kno').value.trim(); if (!k.title) return ti.focus(); x.n.columns[ci].cards.push({ id: uid(), ...k, done: false }); TYPES.kanban.paint(x); saveSoon(); };
  ti.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') add(); if (e.key === 'Escape') TYPES.kanban.paint(x); };
}

TYPES.checklist = {
  minW: 260, minH: 200,
  render(x) {
    x.n.items ||= [];
    x.el.innerHTML = `<header class="nh" data-drag>${icon('todo')}<b>Checklist</b><span class="sp"></span><svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" stroke="#25241B"/><circle class="rv" cx="18" cy="18" r="15" stroke="var(--accent)" stroke-dasharray="0 100" transform="rotate(-90 18 18)"/><text x="18" y="22" text-anchor="middle"></text></svg></header>
      <div class="cl scroll"></div><div class="cladd"><span>${icon('plus')}</span><input placeholder="Add an objective"></div>`;
    const inp = x.el.querySelector('.cladd input');
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && inp.value.trim()) { x.n.items.push({ text: inp.value.trim(), done: false }); inp.value = ''; this.paint(x); saveSoon(); } };
    x.el.querySelector('.cl').onclick = e => {
      const b = e.target.closest('[data-i]'); if (!b) return; const i = +b.dataset.i;
      if (e.target.closest('.cdel')) x.n.items.splice(i, 1); else x.n.items[i].done = !x.n.items[i].done;
      this.paint(x); saveSoon();
    };
    this.paint(x);
  },
  paint(x) {
    const it = x.n.items, done = it.filter(i => i.done).length, pc = it.length ? done / it.length * 94.2 : 0;
    x.el.querySelector('.rv').setAttribute('stroke-dasharray', `${pc} 100`);
    x.el.querySelector('.ring text').textContent = it.length ? `${done}/${it.length}` : '0';
    x.el.querySelector('.cl').innerHTML = it.map((t, i) => `<div class="ci ${t.done ? 'done' : ''}" data-i="${i}"><span class="kchk">${t.done ? icon('check') : ''}</span><span class="tx">${esc(t.text)}</span><button class="kb cdel">${icon('x')}</button></div>`).join('')
      || `<div class="clempty"><b>No objectives</b><small>Add one to begin</small>${'<i></i>'.repeat(3)}</div>`;
  },
};

const EVCOL = ['#D9A53A', '#79B05E', '#6E9BF5', '#A77BF0', '#E9739A', '#4FC1C6'];
TYPES.calendar = {
  minW: 420, minH: 340,
  render(x) {
    const n = x.n; n.events ||= []; n.month ||= dayKey(new Date()).slice(0, 7);
    x.el.innerHTML = `<header class="nh" data-drag>${icon('history')}<b>Calendar</b></header><div class="calh"><b class="mt"></b><span class="sp"></span><button class="btn pri cnew" style="height:26px">${icon('plus')}New</button><button class="btn ctd" style="height:26px">Today</button><button class="kb cp">${icon('up')}</button><button class="kb cn">${icon('chev')}</button></div><div class="calg"></div>`;
    const mv = d => { const [y, m] = n.month.split('-').map(Number); const t = new Date(y, m - 1 + d, 1); n.month = dayKey(t).slice(0, 7); this.paint(x); saveSoon(); };
    x.el.querySelector('.cp').onclick = () => mv(-1); x.el.querySelector('.cn').onclick = () => mv(1);
    x.el.querySelector('.ctd').onclick = () => { n.month = dayKey(new Date()).slice(0, 7); this.paint(x); saveSoon(); };
    x.el.querySelector('.cnew').onclick = e => eventForm(x, e.currentTarget, dayKey(new Date()));
    x.el.querySelector('.calg').onclick = e => {
      const ev = e.target.closest('[data-ev]'); if (ev) return eventForm(x, ev, null, n.events.find(v => v.id === ev.dataset.ev));
      const d = e.target.closest('[data-d]'); if (d) eventForm(x, d, d.dataset.d);
    };
    this.paint(x);
  },
  paint(x) {
    const n = x.n, [y, m] = n.month.split('-').map(Number), first = new Date(y, m - 1, 1), today = dayKey(new Date());
    x.el.querySelector('.mt').textContent = `${MONTHS_L[m - 1]} ${y}`;
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    let html = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cwd">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i); const k = dayKey(d);
      const evs = n.events.filter(v => v.date === k);
      html += `<div class="cday ${d.getMonth() !== m - 1 ? 'out' : ''}" data-d="${k}"><span class="${k === today ? 'today' : ''}">${d.getDate()}</span>${evs.map(v => `<div class="cev" data-ev="${v.id}" style="--c:${v.color}">${esc(v.title)}</div>`).join('')}</div>`;
    }
    x.el.querySelector('.calg').innerHTML = html;
  },
};
function eventForm(x, anchor, date, ev) {
  const e0 = ev || { id: uid(), title: '', date, allDay: true, color: EVCOL[0], notes: '' };
  const p = openPop(anchor, `<div style="width:270px;display:flex;flex-direction:column;gap:8px">
    <input class="in" id="evT" placeholder="Event title" value="${esc(e0.title)}"><input type="date" class="in" id="evD" value="${e0.date}">
    <div class="row" style="padding:0"><label style="flex:1">All day</label><button class="sw ${e0.allDay ? 'on' : ''}" id="evA"></button></div>
    <div class="evc">${EVCOL.map(c => `<button data-c="${c}" style="background:${c}" class="${c === e0.color ? 'on' : ''}"></button>`).join('')}</div>
    <textarea class="in" id="evN" rows="2" placeholder="Add notes…">${esc(e0.notes)}</textarea>
    <div style="display:flex;gap:6px;justify-content:flex-end">${ev ? `<button class="btn red" id="evDel">${icon('trash')}</button>` : ''}<button class="btn" id="evC">Cancel</button><button class="btn pri" id="evOk">${ev ? 'Save' : 'Add event'}</button></div></div>`, 'below');
  if (!p) return;
  let color = e0.color, allDay = e0.allDay;
  p.onclick = e => {
    const c = e.target.closest('[data-c]'); if (c) { color = c.dataset.c; p.querySelectorAll('[data-c]').forEach(z => z.classList.toggle('on', z === c)); }
    if (e.target.closest('#evA')) { allDay = !allDay; $('#evA').classList.toggle('on', allDay); }
    if (e.target.closest('#evC')) closePop();
    if (e.target.closest('#evDel')) { x.n.events = x.n.events.filter(v => v.id !== e0.id); closePop(); TYPES.calendar.paint(x); saveSoon(); }
    if (e.target.closest('#evOk')) {
      const t = $('#evT').value.trim(); if (!t) return $('#evT').focus();
      Object.assign(e0, { title: t, date: $('#evD').value || date, allDay, color, notes: $('#evN').value.trim() });
      if (!ev) x.n.events.push(e0);
      closePop(); TYPES.calendar.paint(x); saveSoon();
    }
  };
  p.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && e.target.id === 'evT') $('#evOk').click(); });
  setTimeout(() => $('#evT')?.focus(), 0);
}
const TODO_SIZE = { kanban: [1160, 520], checklist: [320, 360], calendar: [620, 520] };
const TODO_LABEL = { kanban: 'Board', checklist: 'Checklist', calendar: 'Calendar' };
// Chaque tuile to-do est liée à data/todos/<file>.json : les agents l'écrivent, la tuile le redessine et réécrit le fichier quand l'utilisateur coche.
function insertTodo(kind, at, file) {
  const size = TODO_SIZE[kind], p = at || centerSpot(...size);
  const n = { id: uid(), kind, x: p.x, y: p.y, w: size[0], h: size[1], file: file || `${kind}-${uid().slice(0, 6)}.json` };
  const x = addNode(n); select(n.id);
  if (!file && x) { x.lastJSON = ''; x.t.paint(x); } // tuile manuelle : crée le fichier pour que les agents la voient
  return n;
}
function todoData(n) {
  const d = { kind: n.kind, title: n.title || '' };
  if (n.kind === 'checklist') d.items = n.items; else if (n.kind === 'kanban') d.columns = n.columns; else { d.month = n.month; d.events = n.events; }
  return d;
}
function todoApply(x, d) { // tolère les raccourcis d'agent : items en texte, sans id, sans couleur
  const n = x.n, str = v => String(v ?? '');
  n.title = str(d.title);
  if (n.kind === 'checklist' && Array.isArray(d.items)) n.items = d.items.map(i => typeof i === 'string' ? { text: i, done: false } : { text: str(i.text ?? i.title), done: !!i.done });
  if (n.kind === 'kanban' && Array.isArray(d.columns)) n.columns = d.columns.map(c => ({ id: c.id || uid(), name: str(c.name), cards: (c.cards || []).map(k => typeof k === 'string' ? { id: uid(), title: k, notes: '', due: '', priority: '', done: false }
    : { id: k.id || uid(), title: str(k.title ?? k.text), notes: str(k.notes), due: str(k.due).slice(0, 10), priority: PRIO[k.priority] ? k.priority : '', done: !!k.done }) }));
  if (n.kind === 'calendar' && Array.isArray(d.events)) {
    n.events = d.events.filter(e => e && e.date).map((e, i) => ({ id: e.id || uid(), title: str(e.title ?? e.text), date: str(e.date).slice(0, 10), allDay: e.allDay !== false, color: e.color || EVCOL[i % EVCOL.length], notes: str(e.notes) }));
    n.month = /^\d{4}-\d{2}$/.test(d.month || '') ? d.month : n.events[0]?.date.slice(0, 7) || n.month;
  }
  x.lastJSON = JSON.stringify(todoData(n));
  x.applying = true; x.t.paint(x); x.applying = false; saveSoon();
}
async function todoLoad(x) {
  const r = await api('GET', '/api/todos/file?name=' + encodeURIComponent(x.n.file)).catch(() => null);
  if (r) todoApply(x, r.data); else x.lastJSON = ''; // fichier absent : la prochaine modif le recrée
}
for (const k of ['checklist', 'kanban', 'calendar']) {
  const T = TYPES[k], render = T.render, paint = T.paint;
  T.render = function (x) { render.call(this, x); if (x.n.file) todoLoad(x); };
  T.paint = function (x) {
    paint.call(this, x);
    const b = x.el.querySelector('.nh b'); if (b) b.textContent = x.n.title || TODO_LABEL[k];
    if (!x.n.file || x.applying || x.lastJSON == null) return; // pas encore chargé : ne jamais écraser le fichier
    const s = JSON.stringify(todoData(x.n)); if (s === x.lastJSON) return;
    x.lastJSON = s; clearTimeout(x.pushT);
    x.pushT = setTimeout(() => api('POST', '/api/todos/file', { name: x.n.file, data: JSON.parse(s) }).catch(e => toast(e.message, 1)), 300);
  };
}
// Push serveur : tuile ouverte sur ce fichier, sinon nouvelle tuile à côté de l'agent qui l'a écrit.
document.addEventListener('todo', e => {
  const m = e.detail; if (!S.ws || !m.data) return;
  const same = [...nodes.values()].filter(x => x.n.file === m.name);
  if (same.length) return same.forEach(x => x.lastJSON !== JSON.stringify(m.data) && todoApply(x, m.data)); // notre propre écriture revient à l'identique : ignorée
  const d = m.data, kind = /kanban|board/i.test(d.kind) ? 'kanban' : /cal/i.test(d.kind) ? 'calendar' : d.kind === 'checklist' ? 'checklist' : d.columns ? 'kanban' : d.events ? 'calendar' : 'checklist';
  const near = m.owner && nodes.get(m.owner)?.n, sz = TODO_SIZE[kind];
  const n = insertTodo(kind, near ? findFree(near.x + near.w + 30, near.y, ...sz) : null, m.name);
  frame([n], 1, true); toast(`${TODO_LABEL[kind]} : ${d.title || m.name}`);
});
