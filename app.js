// --- Stan w localStorage -----------------------------------------------------
const STORAGE_KEY = 'banki:v1';
const UI_KEY = 'banki:ui';

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; }
  catch { return {}; }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { alert('Nie udało się zapisać stanu w przeglądarce.'); }
}
let state = loadJSON(STORAGE_KEY);
// Stan widoku – tylko wygoda. Rozwinięte „Zrobione” są zapamiętywane; wybrana
// zakładka tylko do wyjścia z banku (przy kolejnym wejściu: etap do zrobienia).
const ui = { showDone: loadJSON(UI_KEY).showDone || {}, tab: {} };
function saveUI() {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ showDone: ui.showDone })); } catch {}
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

function bankState(bank) {
  if (bank.kind === 'plan') {
    return (state[bank.id] ||= { contract: Object.keys(bank.schedule)[0], variant: '', items: {} });
  }
  return (state[bank.id] ||= { start: '', once: {}, months: {} });
}

// --- Daty --------------------------------------------------------------------
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const todayISO = () => isoDate(new Date());
const currentKey = () => todayISO().slice(0, 7);
function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
function endOfMonth(iso) {
  const d = parseDate(iso);
  return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
const daysUntil = iso => Math.round((parseDate(iso) - parseDate(todayISO())) / 86400000);
const fmtDate = iso => iso.split('-').reverse().join('.');
const fmtDay = iso => parseDate(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }).replace('.', '');
function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function monthName(key, month = 'long') {
  const [y, m] = key.split('-').map(Number);
  const opts = month === 'long' ? { month: 'long', year: 'numeric' } : { month };
  return cap(new Date(y, m - 1, 1).toLocaleDateString('pl-PL', opts).replace('.', ''));
}
function relDay(iso) {
  const n = daysUntil(iso);
  if (n === 0) return 'dziś';
  if (n === 1) return 'jutro';
  if (n === -1) return 'wczoraj';
  return n < 0 ? `${-n} dni temu` : `za ${n} dni`;
}
const dueClass = iso => { const n = daysUntil(iso); return n < 0 ? 'late' : n <= 7 ? 'soon' : ''; };

// --- Logika warunków ---------------------------------------------------------
function itemDone(item, val, bs) {
  if (item.type === 'count' || item.type === 'amount') return (val || 0) >= item.target;
  if (item.type === 'variant') return !!(bs && bs.variant);
  return !!val;
}

// Promocje miesięczne
function promoMonths(bank) {
  const bs = bankState(bank);
  if (!bs.start) return [];
  return Array.from({ length: bank.months }, (_, i) => addMonths(bs.start, bank.startOffset + i));
}
function monthProgress(bank, key) {
  const vals = bankState(bank).months[key] || {};
  const done = bank.monthly.filter(it => itemDone(it, vals[it.id])).length;
  return { done, total: bank.monthly.length, complete: done === bank.monthly.length };
}
function monthStatus(bank, key) {
  const p = monthProgress(bank, key);
  const now = currentKey();
  if (p.complete) return { cls: 'ok', text: 'Spełnione', dot: 'var(--green)' };
  if (key < now) return { cls: 'bad', text: 'Niespełnione', dot: 'var(--red)' };
  if (key > now) return { cls: '', text: 'Wkrótce', dot: '' };
  return { cls: 'warn', text: `${p.done}/${p.total}`, dot: 'var(--orange)' };
}
function bonusInfo(bank) {
  const months = promoMonths(bank);
  const completed = months.filter(k => monthProgress(bank, k).complete).length;
  const max = bank.months * bank.monthlyBonus + (bank.finalBonus || 0);
  let earned = completed * bank.monthlyBonus;
  if (months.length && completed === months.length) earned += bank.finalBonus || 0;
  return { earned, max, completed };
}

// Plany krok po kroku
function planDates(bank) {
  const bs = bankState(bank);
  const d = { ...(bank.schedule[bs.contract] || Object.values(bank.schedule)[0]) };
  return Object.assign(d, bank.derived ? bank.derived(d) : {});
}
function fillText(text, dates) {
  if (!dates) return String(text);
  return String(text).replace(/\{(\w+)\}/g, (m, k) => {
    if (k === 'contract') return dates.label;
    return dates[k] ? fmtDate(dates[k]) : m;
  });
}
function resolveDeadline(item, dates) {
  if (!item.deadline) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(item.deadline)) return item.deadline;
  return (dates && dates[item.deadline]) || '';
}
const visibleFor = (variant, x) => !x.variant || !variant || x.variant === variant;
function planSections(bank) {
  const bs = bankState(bank);
  return bank.sections
    .filter(s => visibleFor(bs.variant, s))
    .map(s => ({ ...s, items: s.items.filter(it => visibleFor(bs.variant, it)) }))
    .filter(s => s.items.length);
}
function sectionProgress(bank, section) {
  const bs = bankState(bank);
  const done = section.items.filter(it => itemDone(it, bs.items[it.id], bs)).length;
  return { done, total: section.items.length, complete: done === section.items.length };
}
function planProgress(bank) {
  let done = 0, total = 0;
  for (const s of planSections(bank)) {
    if (s.optional) continue;
    const p = sectionProgress(bank, s);
    done += p.done; total += p.total;
  }
  return { done, total };
}
function planRewards(bank) {
  const bs = bankState(bank);
  const out = {};
  for (const r of bank.rewards || []) {
    const u = (out[r.unit] ||= { earned: 0, max: 0 });
    if (!r.optional) u.max += r.amount;
    if (bs.items[r.item]) u.earned += r.amount;
  }
  return out;
}

// Najbliższe terminy ze wszystkich banków
function agenda() {
  const rows = [];
  for (const bank of BANKS) {
    const bs = bankState(bank);
    if (bank.kind === 'plan') {
      const dates = planDates(bank);
      for (const s of planSections(bank)) {
        if (s.optional) continue;
        for (const it of s.items) {
          const date = resolveDeadline(it, dates);
          if (date && !itemDone(it, bs.items[it.id], bs)) {
            rows.push({ bank, date, soft: it.soft, title: fillText(it.label, dates), tab: s.id });
          }
        }
      }
    } else {
      for (const it of bank.once) {
        const date = resolveDeadline(it);
        if (date && !bs.once[it.id]) rows.push({ bank, date, title: it.label, tab: 'once' });
      }
      const now = currentKey();
      if (!bs.start) {
        rows.push({ bank, date: '', title: 'Ustaw miesiąc wniosku', tab: 'once' });
      } else if (promoMonths(bank).includes(now) && !monthProgress(bank, now).complete) {
        const p = monthProgress(bank, now);
        rows.push({ bank, date: endOfMonth(`${now}-01`), title: `Warunki za ${monthName(now, 'long').toLowerCase()} (${p.done}/${p.total})`, tab: now });
      }
    }
  }
  return rows.sort((a, b) => (a.date || '0').localeCompare(b.date || '0'));
}

// --- iPhone ------------------------------------------------------------------
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches;
const HINT_KEY = 'banki:hint-hidden';
function hintHidden() {
  try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
}

// --- Elementy wspólne --------------------------------------------------------
const app = document.getElementById('app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = n => Number(n || 0).toLocaleString('pl-PL', { maximumFractionDigits: 2 });

const ICON = {
  chev: '<svg width="8" height="14" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg width="12" height="20" viewBox="0 0 12 20"><path d="M10 2L2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.25" fill="currentColor"/></svg>',
  warn: '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 3.5L2.5 20h19L12 3.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 10v4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.1" fill="currentColor"/></svg>',
  external: '<svg width="15" height="15" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  export: '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  import: '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 3v12M7.5 10.5L12 15l4.5-4.5M5 15v4a2 2 0 002 2h10a2 2 0 002-2v-4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  party: '<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function ring(pct, { size = 44, stroke = 4.5, label = '', animate = false } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  const mid = size / 2;
  return `
    <span class="ring ${animate ? 'animate' : ''}" style="width:${size}px;height:${size}px;--c:${c.toFixed(1)}">
      <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle class="track" cx="${mid}" cy="${mid}" r="${r}" stroke-width="${stroke}"/>
        <circle class="prog" cx="${mid}" cy="${mid}" r="${r}" stroke-width="${stroke}"
          stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${mid} ${mid})"/>
      </svg>
      <span class="ring-label">${label}</span>
    </span>`;
}
const pctLabel = p => `${Math.round(p * 100)}%`;

function navbar(title, back) {
  return `
    <nav class="navbar">
      <div class="nav-inner">
        ${back ? `<button class="nav-back" data-action="home">${ICON.back}<span>Banki</span></button>` : '<span></span>'}
        <span class="nav-title">${esc(title)}</span>
        <span></span>
      </div>
    </nav>`;
}

// --- Strona główna -----------------------------------------------------------
function bankSummary(bank) {
  const bs = bankState(bank);
  if (bank.kind === 'plan') {
    const { done, total } = planProgress(bank);
    const next = agenda().find(r => r.bank === bank);
    return {
      pct: total ? done / total : 0,
      label: `${done}/${total}`,
      next: next ? { date: next.date, soft: next.soft, title: next.title } : null,
      doneText: done === total ? 'Wszystko zrobione' : '',
    };
  }
  const { earned, max } = bonusInfo(bank);
  const months = promoMonths(bank);
  const now = currentKey();
  let next = null, doneText = '';
  if (!bs.start) next = { date: '', title: 'Ustaw miesiąc wniosku' };
  else if (months.includes(now)) {
    const p = monthProgress(bank, now);
    next = p.complete ? null : { date: endOfMonth(`${now}-01`), title: `${monthName(now, 'long')}: ${p.done}/${p.total}` };
    if (p.complete) doneText = `${monthName(now, 'long')}: spełnione`;
  } else if (months.length && now < months[0]) doneText = `Start: ${monthName(months[0])}`;
  else if (months.length) doneText = 'Promocja zakończona';
  return { pct: max ? earned / max : 0, label: pctLabel(max ? earned / max : 0), next, doneText, money: `${earned} / ${max} zł` };
}

function renderHome(opts) {
  document.title = 'Banki';
  const rows = agenda();
  let zl = 0, mil = 0;
  for (const bank of BANKS) {
    if (bank.kind === 'plan') {
      const r = planRewards(bank);
      zl += (r['zł'] || {}).earned || 0;
      mil += (r.mil || {}).earned || 0;
    } else {
      zl += bonusInfo(bank).earned;
    }
  }
  const weekCount = rows.filter(r => !r.date || daysUntil(r.date) <= 7).length;
  const today = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });

  const agendaHtml = rows.length ? rows.slice(0, 6).map(r => {
    const cls = r.date ? dueClass(r.date) : 'soon';
    const date = r.date
      ? `<div class="date-block"><b>${parseDate(r.date).getDate()}</b><span>${esc(monthName(r.date.slice(0, 7), 'short'))}</span></div>`
      : '<div class="date-block none"><b>–</b></div>';
    return `
      <a class="agenda-row" href="#/${r.bank.id}/${encodeURIComponent(r.tab)}">
        ${date}
        <div class="agenda-text">
          <div class="t">${esc(r.title)}</div>
          <div class="s"><span class="dot" style="--c:${r.bank.color}"></span>${esc(r.bank.name)}</div>
        </div>
        <span class="rel ${cls}">${r.date ? `${r.soft ? 'ok. ' : ''}${esc(relDay(r.date))}` : 'do zrobienia'}<span class="chev">${ICON.chev}</span></span>
      </a>`;
  }).join('') : '<div class="empty">Brak zaplanowanych terminów 🎉</div>';

  const cards = BANKS.map(bank => {
    const s = bankSummary(bank);
    const foot = s.next
      ? `<span class="next">${s.next.date ? `<b>${s.next.soft ? 'ok. ' : ''}${esc(fmtDay(s.next.date))}</b> · ` : ''}${esc(s.next.title)}</span>
         ${s.next.date ? `<span class="rel ${dueClass(s.next.date)}">${esc(relDay(s.next.date))}</span>` : ''}`
      : `<span class="next">${esc(s.doneText)}</span>`;
    return `
      <a class="bank-card" href="#/${bank.id}" style="--brand:${bank.color}">
        <div class="bank-main">
          <div class="monogram">${esc(bank.name.charAt(0))}</div>
          <div>
            <div class="bank-name">${esc(bank.name)}</div>
            <div class="bank-promo">${esc(bank.promo)}</div>
          </div>
          ${ring(s.pct, { label: s.label, animate: opts.animate })}
        </div>
        <div class="bank-foot">${foot}</div>
      </a>`;
  }).join('');

  const hint = isIOS && !isStandalone && !hintHidden() ? `
    <div class="hint">
      <p><b>Dodaj do ekranu początkowego</b>: Udostępnij (kwadrat ze strzałką) → „Do ekranu początkowego”, i otwieraj stronę tylko z ikony.</p>
      <p class="muted">Safari kasuje dane stron nieotwieranych przez 7 dni. Aplikacja z ekranu początkowego ma osobne dane – to, co odhaczysz w Safari, nie przeniesie się do niej.</p>
      <button data-action="hide-hint">Rozumiem</button>
    </div>` : '';

  app.innerHTML = `
    ${navbar('Banki', false)}
    <main class="page">
      <h1 class="large-title" data-title-marker>Banki</h1>
      <p class="subtitle">${esc(cap(today))}</p>
      ${hint}
      <div class="summary">
        <div class="stat"><b class="num">${fmtNum(zl)} zł</b><span>premie</span></div>
        <div class="stat"><b class="num">${fmtNum(mil)}</b><span>mile</span></div>
        <div class="stat ${weekCount ? 'alert' : ''}"><b class="num">${weekCount}</b><span>na ten tydzień</span></div>
      </div>

      <h2 class="section-title">Najbliższe terminy</h2>
      <div class="group">${agendaHtml}</div>

      <h2 class="section-title">Promocje</h2>
      <div class="bank-list">${cards}</div>

      <div class="group-label">Kopia zapasowa</div>
      <div class="group">
        <div class="link-row" data-action="export" role="button" tabindex="0"><span class="label"><span class="icon">${ICON.export}</span>Eksportuj kopię</span></div>
        <div class="link-row" data-action="import" role="button" tabindex="0" style="--inset:50px"><span class="label"><span class="icon">${ICON.import}</span>Importuj kopię</span></div>
      </div>
      <p class="footnote">Dane są zapisane tylko na tym urządzeniu.</p>
    </main>`;
}

// --- Widok banku -------------------------------------------------------------
function tabsFor(bank) {
  const bs = bankState(bank);
  if (bank.kind === 'plan') {
    const dates = planDates(bank);
    return [
      { id: 'dates', label: 'Terminy' },
      ...planSections(bank).map(s => {
        const p = sectionProgress(bank, s);
        const late = s.items.some(it => {
          const dl = resolveDeadline(it, dates);
          return dl && daysUntil(dl) < 0 && !itemDone(it, bs.items[it.id], bs);
        });
        const dot = p.complete ? 'var(--green)' : late && !s.optional ? 'var(--red)' : '';
        return { id: s.id, label: s.short || s.title, dot };
      }),
      { id: 'rules', label: 'Zasady' },
    ];
  }
  const onceDone = bank.once.every(it => bs.once[it.id]);
  return [
    { id: 'once', label: 'Start', dot: onceDone ? 'var(--green)' : '' },
    ...promoMonths(bank).map(k => ({ id: k, label: monthName(k, 'short'), dot: monthStatus(bank, k).dot })),
  ];
}

function defaultTab(bank) {
  const bs = bankState(bank);
  if (bank.kind === 'plan') {
    const s = planSections(bank).find(s => !s.optional && !sectionProgress(bank, s).complete);
    return s ? s.id : 'dates';
  }
  const months = promoMonths(bank);
  const now = currentKey();
  if (months.includes(now)) return now;
  if (!bank.once.every(it => bs.once[it.id]) || !months.length) return 'once';
  return months.find(k => !monthProgress(bank, k).complete) || months[months.length - 1];
}

function activeTab(bank) {
  const tabs = tabsFor(bank);
  const t = ui.tab[bank.id];
  return tabs.some(x => x.id === t) ? t : defaultTab(bank);
}

// Treść zakładki: { title, sub, pill, note, items: [{item, val}], scope, dates }
function tabContent(bank, tabId) {
  const bs = bankState(bank);
  if (bank.kind === 'plan') {
    const dates = planDates(bank);
    const s = planSections(bank).find(x => x.id === tabId);
    if (!s) return null;
    const p = sectionProgress(bank, s);
    return {
      title: fillText(s.title, dates),
      sub: fillText(s.sub || '', dates),
      tag: s.variant && !bs.variant ? `wariant ${s.variant}` : '',
      pill: p.complete ? { cls: 'ok', text: 'Gotowe' } : { cls: s.optional && !p.done ? '' : 'warn', text: s.optional && !p.done ? 'opcjonalnie' : `${p.done}/${p.total}` },
      note: s.note ? fillText(s.note, dates) : '',
      items: s.items.map(item => ({ item, val: bs.items[item.id] })),
      scope: 'plan', dates,
    };
  }
  if (tabId === 'once') {
    const done = bank.once.filter(it => bs.once[it.id]).length;
    return {
      title: 'Warunki jednorazowe', sub: '',
      pill: done === bank.once.length ? { cls: 'ok', text: 'Gotowe' } : { cls: 'warn', text: `${done}/${bank.once.length}` },
      items: bank.once.map(item => ({ item, val: bs.once[item.id] })),
      scope: 'once',
    };
  }
  const months = promoMonths(bank);
  const i = months.indexOf(tabId);
  if (i < 0) return null;
  const st = monthStatus(bank, tabId);
  const vals = bs.months[tabId] || {};
  return {
    title: monthName(tabId), sub: `Miesiąc ${i + 1} z ${bank.months} · premia ${bank.monthlyBonus} zł`,
    pill: { cls: st.cls, text: st.text },
    items: bank.monthly.map(item => ({ item, val: vals[item.id] })),
    scope: tabId,
  };
}

let justToggled = '';
// Właśnie odhaczony krok zostaje chwilę na liście (jak w Przypomnieniach), potem się zwija.
let lingering = '';
let lingerTimer;

function taskHtml(bank, { item, val }, ctx) {
  const bs = bankState(bank);
  const done = itemDone(item, val, bs);
  const deadline = resolveDeadline(item, ctx.dates);
  const note = item.note ? fillText(item.note, ctx.dates) : '';
  const key = `${ctx.scope}|${item.id}`;
  const attrs = `data-scope="${esc(ctx.scope)}" data-item="${esc(item.id)}"`;
  const tag = item.variant && !bs.variant ? ` <span class="tag">wariant ${esc(item.variant)}</span>` : '';
  const due = deadline
    ? `<span class="due ${done ? '' : dueClass(deadline)}">${item.soft ? 'ok. ' : ''}${esc(fmtDay(deadline))}${!done && dueClass(deadline) ? ' · ' + esc(relDay(deadline)) : ''}</span>`
    : '';
  const sub = due || note ? `<div class="s">${due}${note ? `<span class="n">${esc(note)}</span>` : ''}</div>` : '';
  // ⓘ tylko gdy notatka może się nie zmieścić w jednej linii.
  const info = note && (note.length > 40 || item.type === 'amount') ? `<button class="info-btn" data-action="info" ${attrs} aria-label="Szczegóły">${ICON.info}</button>` : '';
  const check = `<span class="check ${justToggled === key && done ? 'pop' : ''}">${ICON.check}</span>`;

  if (item.type === 'variant') {
    const v = bank.variants;
    return `
      <div class="task variant ${done ? 'done' : ''}">
        ${check}
        <div class="task-text">
          <div class="t">${esc(item.label)}</div>
          <div class="segmented" role="radiogroup">
            ${Object.entries(v).map(([k, o]) => `<button class="${bs.variant === k ? 'on' : ''}" data-action="variant" data-value="${k}" role="radio" aria-checked="${bs.variant === k}">${esc(o.label)}</button>`).join('')}
          </div>
          <div class="s">${esc(bs.variant ? v[bs.variant].note : 'Wybierz, żeby ukryć kroki drugiego wariantu.')}</div>
        </div>
      </div>`;
  }
  if (item.type === 'count') {
    return `
      <div class="task ${done ? 'done' : ''}">
        ${check}
        <div class="task-text" ${note ? `data-action="info" ${attrs}` : ''}><div class="t">${esc(item.label)}</div>${sub}</div>
        <div class="stepper">
          <output class="${done ? 'ok' : ''}">${val || 0}/${item.target}</output>
          <div class="stepper-btns">
            <button data-action="dec" ${attrs} aria-label="Mniej">−</button>
            <button data-action="inc" ${attrs} aria-label="Więcej">+</button>
          </div>
        </div>
      </div>`;
  }
  if (item.type === 'amount') {
    const pct = Math.min(100, ((val || 0) / item.target) * 100);
    return `
      <div class="task amount ${done ? 'done' : ''}">
        ${check}
        <div class="task-text"><div class="t">${esc(item.label)}${tag}</div>${due ? `<div class="s">${due}</div>` : ''}</div>
        <div class="amount-row">
          <input type="text" inputmode="decimal" enterkeyhint="done" placeholder="0" aria-label="Kwota"
            data-action="amount" ${attrs} value="${val ? esc(String(val).replace('.', ',')) : ''}">
          <span class="sum ${done ? 'ok' : ''}"><b>${fmtNum(val)}</b> / ${fmtNum(item.target)} ${esc(item.unit || '')}</span>
          ${info}
        </div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>`;
  }
  return `
    <div class="task ${done ? 'done' : ''}" role="checkbox" aria-checked="${done}" tabindex="0" data-action="toggle" ${attrs}>
      ${check}
      <div class="task-text"><div class="t">${esc(fillText(item.label, ctx.dates))}${tag}</div>${sub}</div>
      ${info}
    </div>`;
}

function tasksGroup(bank, tabId, c) {
  const bs = bankState(bank);
  const isDone = x => x.item.type !== 'variant' && itemDone(x.item, x.val, bs) &&
    lingering !== `${c.scope}|${x.item.id}`;
  const open = c.items.filter(x => !isDone(x));
  const done = c.items.filter(isDone);
  const key = `${bank.id}:${tabId}`;
  const showDone = !!ui.showDone[key];
  const ctx = { scope: c.scope, dates: c.dates };
  let html = open.map(x => taskHtml(bank, x, ctx)).join('');
  if (!open.length) html += `<div class="all-done">${ICON.party}Wszystko zrobione</div>`;
  if (done.length) {
    html += `<div class="done-toggle ${showDone ? 'open' : ''}" data-action="toggle-done" data-key="${esc(key)}" role="button" tabindex="0">
      <span>Zrobione (${done.length})</span><span class="chev">${ICON.chev}</span></div>`;
    if (showDone) html += done.map(x => taskHtml(bank, x, ctx)).join('');
  }
  return `<div class="group">${html}</div>`;
}

function datesTab(bank) {
  const bs = bankState(bank);
  const dates = planDates(bank);
  const today = todayISO();
  const list = bank.keyDates.filter(k => visibleFor(bs.variant, k));
  const nextIdx = list.findIndex(k => (k.to ? dates[k.to] : dates[k.date]) >= today);
  const rows = list.map((k, i) => {
    const from = dates[k.date], to = k.to ? dates[k.to] : '';
    const past = (to || from) < today;
    const when = `${k.soft ? 'ok. ' : ''}${fmtDay(from)}${to ? ' – ' + fmtDay(to) : ''}`;
    return `<div class="timeline-row ${past ? 'past' : ''} ${i === nextIdx ? 'next' : ''}">
      <span class="dot"></span><span>${esc(k.label)}</span><b>${esc(when)}</b></div>`;
  }).join('');
  return `
    <div class="tab-head"><div><h2>Kluczowe daty</h2><p>umowa: ${esc(dates.label)}</p></div></div>
    <div class="group">${rows}</div>
    <p class="footnote">„ok.” to terminy orientacyjne z planu, pozostałe pochodzą z regulaminu.</p>`;
}

function rulesTab(bank) {
  return `
    <div class="tab-head"><div><h2>Zasady w skrócie</h2></div></div>
    <div class="group">${bank.rules.map(r => `<div class="rule">${esc(r)}</div>`).join('')}</div>
    <div class="group-label">Źródła</div>
    <div class="group">${bank.links.map(l => `
      <a class="link-row" href="${esc(l.url)}" target="_blank" rel="noopener"><span class="label">${esc(l.label)}</span>${ICON.external}</a>`).join('')}
    </div>`;
}

function renderBank(bank, opts) {
  const bs = bankState(bank);
  const tabs = tabsFor(bank);
  const tabId = activeTab(bank);
  let hero, settings;

  if (bank.kind === 'plan') {
    const { done, total } = planProgress(bank);
    const mil = planRewards(bank).mil || { earned: 0, max: 0 };
    const next = agenda().find(r => r.bank === bank);
    hero = {
      metric: `${fmtNum(mil.earned)} <small>/ ${fmtNum(mil.max)} mil</small>`,
      meta: `${done}/${total} kroków${next ? ` · następny: ${next.soft ? 'ok. ' : ''}${fmtDay(next.date)}` : ''}`,
      pct: total ? done / total : 0,
    };
    settings = `
      <div class="setting-row">
        <label for="contract">${esc(bank.contractLabel)}</label>
        <select class="control" id="contract" data-action="contract">
          ${Object.entries(bank.schedule).map(([k, v]) => `<option value="${k}" ${bs.contract === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
        </select>
      </div>`;
  } else {
    const { earned, max, completed } = bonusInfo(bank);
    hero = {
      metric: `${earned} zł <small>/ ${max} zł</small>`,
      meta: bs.start ? `Spełnione miesiące: ${completed}/${bank.months} · +${bank.finalBonus} zł za komplet` : 'Ustaw miesiąc wniosku poniżej',
      pct: max ? earned / max : 0,
    };
    settings = `
      <div class="setting-row">
        <label for="start">${esc(bank.startLabel)}</label>
        <input class="control" type="month" id="start" data-action="start" value="${esc(bs.start)}">
      </div>`;
  }

  let body;
  if (tabId === 'dates') body = datesTab(bank);
  else if (tabId === 'rules') body = rulesTab(bank);
  else {
    const c = tabContent(bank, tabId);
    body = `
      <div class="tab-head">
        <div><h2>${esc(c.title)}${c.tag ? ` <span class="tag">${esc(c.tag)}</span>` : ''}</h2>${c.sub ? `<p>${esc(c.sub)}</p>` : ''}</div>
        <span class="pill ${c.pill.cls}">${esc(c.pill.text)}</span>
      </div>
      ${c.note ? `<div class="callout">${ICON.warn}<span>${esc(c.note)}</span></div>` : ''}
      ${tasksGroup(bank, tabId, c)}`;
  }

  app.innerHTML = `
    ${navbar(bank.name, true)}
    <main class="page" style="--brand:${bank.color}">
      <section class="hero" data-title-marker>
        <div>
          <div class="eyebrow">${esc(bank.name)}</div>
          <div class="promo">${esc(bank.promo)}</div>
          <div class="metric num">${hero.metric}</div>
          <div class="meta">${esc(hero.meta)}</div>
        </div>
        ${ring(hero.pct, { size: 84, stroke: 8, label: pctLabel(hero.pct), animate: opts.animate })}
      </section>

      <div class="group-label">Ustawienia</div>
      <div class="group">
        ${settings}
        <a class="link-row" href="${esc(bank.url)}" target="_blank" rel="noopener"><span class="label">Strona promocji</span>${ICON.external}</a>
      </div>

      <div class="tabs" role="tablist">
        ${tabs.map(t => `<button class="chip ${t.id === tabId ? 'active' : ''}" role="tab" aria-selected="${t.id === tabId}" data-action="tab" data-tab="${esc(t.id)}">${t.dot ? `<span class="dot" style="--c:${t.dot}"></span>` : ''}${esc(t.label)}</button>`).join('')}
      </div>

      <div class="tab-body ${opts.tabChanged ? 'animate' : ''}">${body}</div>

      <div class="group" style="margin-top:32px">
        <div class="link-row danger" data-action="reset" role="button" tabindex="0">Wyczyść dane banku</div>
      </div>
    </main>`;

  // Wyśrodkuj aktywną zakładkę w poziomie (bez przewijania całej strony).
  const strip = app.querySelector('.tabs');
  const active = app.querySelector('.chip.active');
  if (strip && active) {
    const left = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: opts.tabChanged ? 'smooth' : 'auto' });
  }
}

// --- Routing i rysowanie -----------------------------------------------------
function route() {
  const [bankId, tab] = location.hash.replace(/^#\/?/, '').split('/');
  return { bank: BANKS.find(b => b.id === bankId), tab: tab ? decodeURIComponent(tab) : '' };
}
const currentBank = () => route().bank;

function render(opts = {}) {
  const { bank, tab } = route();
  if (!bank) {
    ui.tab = {};
    renderHome(opts);
  } else {
    if (tab) { ui.tab[bank.id] = tab; history.replaceState(null, '', `#/${bank.id}`); }
    document.title = `${bank.name} – Banki`;
    ui.tab[bank.id] = activeTab(bank);
    renderBank(bank, opts);
  }
  justToggled = '';
  updateNavbar();
}

// Przerysowanie bez gubienia przewinięcia (po odhaczeniu itp.).
function rerender(opts) {
  const y = window.scrollY;
  render(opts);
  window.scrollTo(0, y);
}

function updateNavbar() {
  const nav = app.querySelector('.navbar');
  const marker = app.querySelector('[data-title-marker]');
  if (!nav || !marker) return;
  nav.classList.toggle('solid', window.scrollY > 4);
  nav.classList.toggle('scrolled', marker.getBoundingClientRect().bottom < nav.offsetHeight + 4);
}
window.addEventListener('scroll', updateNavbar, { passive: true });

let lastBankId = route().bank ? route().bank.id : '';
window.addEventListener('hashchange', () => {
  const r = route();
  const newId = r.bank ? r.bank.id : '';
  if (newId === lastBankId) return rerender();
  const dir = newId && !lastBankId ? 'forward' : 'back';
  lastBankId = newId;
  const go = () => { render({ animate: true }); window.scrollTo(0, 0); };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !reduce) {
    document.documentElement.dataset.dir = dir;
    document.startViewTransition(go);
  } else go();
});

// --- Panel szczegółów i toast ------------------------------------------------
function findItem(bank, scope, id) {
  if (bank.kind === 'plan') {
    for (const s of bank.sections) {
      const it = s.items.find(x => x.id === id);
      if (it) return { item: it, section: s };
    }
    return null;
  }
  const list = scope === 'once' ? bank.once : bank.monthly;
  const it = list.find(x => x.id === id);
  return it ? { item: it, section: null } : null;
}

function openSheet(bank, scope, id) {
  const found = findItem(bank, scope, id);
  if (!found) return;
  const { item, section } = found;
  const bs = bankState(bank);
  const dates = bank.kind === 'plan' ? planDates(bank) : null;
  const vals = bank.kind === 'plan' ? bs.items : scope === 'once' ? bs.once : (bs.months[scope] || {});
  const done = itemDone(item, vals[id], bs);
  const deadline = resolveDeadline(item, dates);
  const where = section ? fillText(section.title, dates) : scope === 'once' ? 'Warunki jednorazowe' : monthName(scope);
  const sub = [where, deadline ? `termin: ${item.soft ? 'ok. ' : ''}${fmtDate(deadline)}` : ''].filter(Boolean).join(' · ');
  const canToggle = !item.type || item.type === 'check';

  const el = document.createElement('div');
  el.className = 'sheet-backdrop';
  el.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(item.label)}">
      <div class="handle"></div>
      <h3>${esc(fillText(item.label, dates))}</h3>
      <p class="sheet-sub">${esc(sub)}</p>
      ${item.note ? `<div class="sheet-note">${esc(cap(fillText(item.note, dates)))}</div>` : ''}
      ${canToggle ? `<button class="btn-primary ${done ? 'undo' : ''}" data-sheet="toggle">${done ? 'Oznacz jako niezrobione' : 'Oznacz jako zrobione'}</button>` : ''}
      <button class="btn-secondary" data-sheet="close">Zamknij</button>
    </div>`;
  document.body.appendChild(el);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));

  const close = () => {
    el.classList.remove('open');
    document.body.classList.remove('sheet-open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => el.remove(), 300);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-sheet]');
    if (e.target === el || (b && b.dataset.sheet === 'close')) return close();
    if (b && b.dataset.sheet === 'toggle') { close(); toggleItem(bank, scope, id); }
  });
}

let toastTimer;
function toast(text) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = text;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// --- Zmiany stanu ------------------------------------------------------------
function valuesFor(bs, scope) {
  if (scope === 'once') return bs.once;
  if (scope === 'plan') return bs.items;
  return (bs.months[scope] ||= {});
}
function tabComplete(bank, tabId) {
  const c = tabContent(bank, tabId);
  if (!c) return false;
  const bs = bankState(bank);
  return c.items.every(x => itemDone(x.item, x.val, bs));
}
// Wykonuje zmianę, zapisuje i przerysowuje; świętuje ukończenie zakładki.
function mutate(bank, fn) {
  const tabId = activeTab(bank);
  const before = tabComplete(bank, tabId);
  fn(bankState(bank));
  saveState();
  rerender();
  if (!before && tabComplete(bank, tabId)) {
    const c = tabContent(bank, tabId);
    toast(`🎉 ${c.title} – wszystko zrobione`);
  }
}
function toggleItem(bank, scope, id) {
  mutate(bank, bs => {
    const vals = valuesFor(bs, scope);
    vals[id] = !vals[id];
    if (vals[id]) justToggled = lingering = `${scope}|${id}`;
  });
  clearTimeout(lingerTimer);
  if (lingering) lingerTimer = setTimeout(() => { lingering = ''; rerender(); }, 900);
}
function parseAmount(s) {
  const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

app.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'home') { location.hash = ''; return; }
  if (action === 'export') return exportData();
  if (action === 'import') return document.getElementById('importFile').click();
  if (action === 'hide-hint') {
    try { localStorage.setItem(HINT_KEY, '1'); } catch {}
    return rerender();
  }

  const bank = currentBank();
  if (!bank) return;
  const { scope, item } = el.dataset;

  if (action === 'toggle') toggleItem(bank, scope, item);
  else if (action === 'info') openSheet(bank, scope, item);
  else if (action === 'inc' || action === 'dec') {
    mutate(bank, bs => {
      const vals = valuesFor(bs, scope);
      vals[item] = Math.max(0, (vals[item] || 0) + (action === 'inc' ? 1 : -1));
    });
  } else if (action === 'variant') {
    mutate(bank, bs => { bs.variant = bs.variant === el.dataset.value ? '' : el.dataset.value; });
  } else if (action === 'tab') {
    if (ui.tab[bank.id] === el.dataset.tab) return;
    ui.tab[bank.id] = el.dataset.tab;
    const navH = app.querySelector('.navbar').offsetHeight;
    const stuck = app.querySelector('.tabs').getBoundingClientRect().top <= navH + 1;
    rerender({ tabChanged: true });
    // Gdy pasek zakładek jest przyklejony, przewiń do początku nowej zakładki.
    if (stuck) {
      const body = app.querySelector('.tab-body');
      const tabsH = app.querySelector('.tabs').offsetHeight;
      window.scrollTo(0, body.getBoundingClientRect().top + window.scrollY - navH - tabsH);
    }
  } else if (action === 'toggle-done') {
    ui.showDone[el.dataset.key] = !ui.showDone[el.dataset.key]; saveUI();
    rerender();
  } else if (action === 'reset') {
    if (confirm(`Wyczyścić wszystkie dane dla ${bank.name}?`)) {
      delete state[bank.id]; delete ui.tab[bank.id]; saveState(); rerender();
    }
  }
});

app.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key === 'Enter' && el.dataset.action === 'amount') return el.blur();
  if ((e.key === 'Enter' || e.key === ' ') && el.matches('[role=checkbox], [role=button]')) {
    e.preventDefault(); el.click();
  }
});

app.addEventListener('change', e => {
  const el = e.target;
  const bank = currentBank();
  if (!bank) return;
  const action = el.dataset.action;
  if (action === 'amount') {
    mutate(bank, bs => { valuesFor(bs, el.dataset.scope)[el.dataset.item] = parseAmount(el.value); });
  } else if (action === 'start') {
    delete ui.tab[bank.id]; // pokaż bieżący miesiąc promocji
    mutate(bank, bs => { bs.start = el.value; });
  } else if (action === 'contract') {
    mutate(bank, bs => { bs.contract = el.value; });
  }
});

// --- Kopia zapasowa ----------------------------------------------------------
async function exportData() {
  const name = `banki-${todayISO()}.json`;
  const file = new File([JSON.stringify(state, null, 2)], name, { type: 'application/json' });
  // Na telefonie arkusz udostępniania („Zachowaj w Plikach”) – zwykłe pobieranie
  // w aplikacji z ekranu początkowego na iOS bywa zawodne.
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.getElementById('importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (typeof data !== 'object' || !data) throw new Error();
    if (!confirm('Zastąpić obecne dane danymi z pliku?')) return;
    state = data; saveState(); rerender();
    toast('Kopia wczytana');
  } catch {
    alert('Niepoprawny plik kopii.');
  }
});

// Odśwież po powrocie do aplikacji (np. gdy zmienił się dzień).
document.addEventListener('visibilitychange', () => { if (!document.hidden) rerender(); });
render({ animate: true });

// Działanie offline (np. słaby zasięg przy otwieraniu z ekranu początkowego).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
