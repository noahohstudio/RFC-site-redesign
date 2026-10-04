// Search UI: the header's own field with its dropdown (≥1024) and a full-screen
// overlay on tablets and phones. Keyboard-first: ⌘K or / from anywhere, ↑↓ to move, ↵ to open.
import { db, ERA_BY_KEY, STATUS, esc, fmtInt } from './data.js';
import { search } from './search.js';
import { $, $$, icon, mqPhone, mqTablet, store, openDialog, closeDialog, closeMenus, edgeFade } from './ui.js';

const START = [
  { n: 1, meta: 'The very first RFC · 1969' },
  { n: 2119, meta: 'What MUST and SHOULD mean · 1997' },
  { n: 9110, meta: 'How the web talks · 2022' },
];

let desk;
let mobile;
let optSeq = 0;

export function init() {
  // the dropdown's list scrolls inside it, so the edge fade leaves the dropdown's shadow alone
  desk = controller($('#search-input'), $('#search-pop .pop-scroll'), { phone: false });
  edgeFade(desk.container);
  mobile = controller($('#msearch-input'), $('#msearch-pop'), { phone: true });

  const root = $('#search');
  const input = $('#search-input');
  const clear = $('.search-clear', root);
  fitPrompt(input);
  input.addEventListener('focus', () => {
    if (mqTablet.matches) { input.blur(); openMobile(); return; } // smaller screens: the whole screen
    openDesk();
  });
  input.addEventListener('input', () => { clear.hidden = !input.value; openDesk(); desk.render(); });
  input.addEventListener('keydown', (e) => desk.key(e, closeDesk));
  clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; input.focus(); desk.render(); });
  root.addEventListener('click', (e) => {
    if (!mqTablet.matches || e.target.closest('button')) return;
    e.preventDefault(); // the label would focus the field
    openMobile();
  });
  root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) closeDesk(); });
  document.addEventListener('pointerdown', (e) => { if (!root.contains(e.target)) closeDesk(); });
  document.addEventListener('menu-open', closeDesk);
  document.addEventListener('scrim-click', closeDesk);

  const minput = $('#msearch-input');
  minput.addEventListener('input', () => mobile.render());
  minput.addEventListener('keydown', (e) => mobile.key(e, () => closeDialog($('#dlg-search'))));

  // following any result closes the search; an “Ask Crock” question runs its lookup instead
  for (const c of [desk, mobile]) {
    c.container.addEventListener('click', (e) => {
      const opt = e.target.closest('[role="option"]');
      if (!opt) return;
      if (opt.dataset.ask) {
        e.preventDefault();
        c.input.value = opt.dataset.ask;
        if (c === desk) clear.hidden = false;
        c.render();
        c.input.focus();
        return;
      }
      if (c === desk) { closeDesk(); input.value = ''; clear.hidden = true; input.blur(); }
      else { closeDialog($('#dlg-search')); minput.value = ''; }
    });
  }
  mqTablet.addEventListener('change', () => { closeDesk(); closeDialog($('#dlg-search')); });
}

// The prompt says as much as fits: the whole hint where there's room, just the count where there isn't.
function fitPrompt(input) {
  const full = input.placeholder;
  const short = full.split(':')[0];
  const ctx = document.createElement('canvas').getContext('2d');
  const fit = () => {
    ctx.font = getComputedStyle(input).font;
    const next = ctx.measureText(full).width <= input.clientWidth ? full : short;
    if (input.placeholder !== next) input.placeholder = next;
  };
  new ResizeObserver(fit).observe(input);
  document.fonts?.ready.then(fit);
}

// On desktop the header itself becomes the field, from Browse to About; on smaller screens search takes the whole screen.
export function openFromShortcut() {
  if (mqTablet.matches) { openMobile(); return; }
  $('#nav').classList.add('is-searching');
  const input = $('#search-input');
  input.focus();
  input.select();
  openDesk(); // the suggestions open with the field, whether or not a focus event follows
}

export function openMobile() {
  const d = openDialog('dlg-search');
  const input = $('#msearch-input');
  mobile.render();
  requestAnimationFrame(() => input.focus());
  return d;
}

export function close() { closeDesk(); closeDialog($('#dlg-search')); }

// Re-render open results (e.g. after the abstracts arrive).
export function refresh() {
  if (!$('#search-pop').hidden) desk.render();
  if ($('#dlg-search').open) mobile.render();
}

function openDesk() {
  const pop = $('#search-pop');
  if (!pop.hidden) return;
  closeMenus();
  $('#nav').classList.add('is-searching'); // the menus fold away and the field runs Browse to About
  pop.hidden = false;
  $('#search').classList.add('is-open');
  document.body.classList.add('search-open');
  $('#search-input').setAttribute('aria-expanded', 'true');
  $('#scrim').hidden = false;
  desk.render();
}

function closeDesk() {
  const pop = $('#search-pop');
  if (pop.hidden) { $('#nav').classList.remove('is-searching'); return; }
  pop.hidden = true;
  $('#search').classList.remove('is-open');
  document.body.classList.remove('search-open');
  $('#search-input').setAttribute('aria-expanded', 'false');
  $('#search-input').removeAttribute('aria-activedescendant');
  if (!document.querySelector('.mega:not([hidden])')) $('#scrim').hidden = true;
  $('#nav').classList.remove('is-searching'); // the menus and the lens come back
}

// ── Controller shared by dropdown + overlay ───────────────────────────
function controller(input, container, { phone }) {
  let items = [];
  let active = -1;
  const listId = phone ? 'msearch-list' : 'search-list';

  function render() {
    const q = input.value;
    container.innerHTML = q.trim() ? resultsHTML(search(q), q, listId, phone) : suggestionsHTML(listId, phone);
    items = $$('[role="option"]', container);
    setActive(items.length ? 0 : -1, false);
  }
  function setActive(i, scroll = true) {
    items.forEach((el, k) => {
      el.classList.toggle('is-active', k === i);
      el.setAttribute('aria-selected', String(k === i));
    });
    active = i;
    if (i >= 0) { input.setAttribute('aria-activedescendant', items[i].id); if (scroll) items[i].scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }
  function key(e, onClose) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) setActive((active + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) setActive((active - 1 + items.length) % items.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const el = items[active];
      if (el) el.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      input.blur();
    }
  }
  return { render, key, container, input };
}

// ── Markup ────────────────────────────────────────────────────────────
function marked(title, q) {
  const toks = q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  if (!toks.length) return esc(title);
  const re = new RegExp(`\\b(${toks.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  let out = '';
  let last = 0;
  title.replace(re, (m, _g, i) => { out += `${esc(title.slice(last, i))}<mark>${esc(m)}</mark>`; last = i + m.length; return m; });
  return out + esc(title.slice(last));
}

function metaFor(r) {
  if (r.obsolete) return `Replaced by ${r.obsoletedBy[0]}${r.obsoletedBy.length > 1 ? '…' : ''} · ${r.year}`;
  return `${STATUS[r.status].label} · ${r.year}`;
}

function rfcRow(r, { q = '', meta = metaFor(r), listId }) {
  const id = `${listId}-o${++optSeq}`;
  return `<a class="res-row" role="option" id="${id}" href="#/rfc/${r.n}" data-era="${r.era}" aria-selected="false">
    <span class="era-dot" aria-hidden="true"></span><span class="res-num">${r.n}</span>
    <span class="res-stack"><span class="res-title">${marked(r.title, q)}</span><span class="res-sub">${esc(meta)}</span></span>
    <span class="res-meta">${esc(meta)}</span><kbd class="kbd" aria-hidden="true">↵</kbd></a>`;
}

function iconRow({ icon: ic, title, meta, href, action, ext }, listId) {
  const id = `${listId}-o${++optSeq}`;
  const tag = action ? 'button' : 'a';
  const attrs = action ? `type="button" data-action="${action}"` : `href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}`;
  return `<${tag} class="res-row" role="option" id="${id}" ${attrs} aria-selected="false">${icon(ic)}
    <span class="res-stack"><span class="res-title">${esc(title)}</span><span class="res-sub">${esc(meta)}</span></span>
    <span class="res-meta">${esc(meta)}</span><kbd class="kbd" aria-hidden="true">↵</kbd></${tag}>`;
}

// “Ask Crock” (named for Steve Crocker, who wrote RFC 1): a question the index
// can answer. Choosing it runs the lookup — it fills the search with the number.
function askRow(question, query, listId) {
  const id = `${listId}-o${++optSeq}`;
  return `<button class="res-row" role="option" id="${id}" type="button" data-ask="${esc(query)}" aria-selected="false">${icon('compass')}
    <span class="res-stack"><span class="res-title">${esc(question)}</span><span class="res-sub">Points to RFCs</span></span>
    <span class="res-meta">Points to RFCs</span><kbd class="kbd" aria-hidden="true">↵</kbd></button>`;
}

function group(label, rows) {
  if (!rows.length) return '';
  const gid = `g${++optSeq}`;
  return `<div class="res-group" role="group" aria-labelledby="${gid}"><p class="res-label t-overline" id="${gid}">${label}</p>${rows.join('')}</div>`;
}

const hints = (phone) => (phone ? '' : '<div class="res-hints" aria-hidden="true"><span>↑↓ move</span><span>↵ open</span><span>Esc close</span><span>⌘K from anywhere</span></div>');

function suggestionsHTML(listId, phone) {
  const start = START.map((s) => db.byN.get(s.n) && rfcRow(db.byN.get(s.n), { meta: s.meta, listId })).filter(Boolean);
  const recent = (store.get('rfc-recent') || '').split(',').map(Number).filter((n) => n && db.byN.has(n) && !START.some((s) => s.n === n)).slice(0, 3);
  const crock = group('Ask Crock', [
    askRow('What replaced RFC 2616?', '2616', listId),
    askRow('What updates RFC 2119?', '2119', listId),
  ]);
  const recentGroup = recent.length ? group('Recently viewed', recent.map((n) => rfcRow(db.byN.get(n), { listId }))) : '';
  return `<div role="listbox" id="${listId}" aria-label="Suggestions">
    <div class="res-tip">Tip: type a number like <kbd class="kbd">9110</kbd> to open that RFC straight away.</div>
    ${group('Start here', start)}${crock}${recentGroup}
  </div>${hints(phone)}`;
}

function resultsHTML(res, q, listId, phone) {
  const parts = [];
  const shownNums = new Set();
  if (res.numberRows.length) {
    parts.push(group(res.exact ? 'RFC' : 'Numbers', res.numberRows.map((r) => { shownNums.add(r.n); return rfcRow(r, { listId }); })));
  }
  if (res.series) {
    parts.push(group(res.series.label, res.series.members.slice(0, 6).map((r) => { shownNums.add(r.n); return rfcRow(r, { q: '', listId }); })));
  }
  if (res.years.length) {
    parts.push(group('Years', res.years.map((y) => iconRow({ icon: 'calendar', title: `Jump to ${y.year}`, meta: `${fmtInt(y.count)} RFCs · ${ERA_BY_KEY[db.years.find((x) => x.year === y.year)?.era || 'present'].name}`, href: `#/year/${y.year}` }, listId))));
  }
  let replacedShown = null;
  if (!res.series) {
    const limit = res.numberRows.length ? 3 : 6;
    const rows = res.rfcs.filter((r) => !shownNums.has(r.n)).slice(0, limit);
    replacedShown = rows.find((r) => r.obsolete) || null;
    const moreRow = `<a class="res-row res-more" role="option" id="${listId}-o${++optSeq}" href="#/search/${encodeURIComponent(q.trim())}" aria-selected="false">${icon('list')}<span class="res-stack"><span class="res-title">See all ${fmtInt(res.total)} matches in the index</span><span class="res-sub">Newest first, by year</span></span><span class="res-meta">Newest first</span>${icon('arrow-right', 'icon-20')}</a>`;
    if (rows.length) parts.push(group(res.numberRows.length ? 'Also in titles' : 'RFCs', rows.map((r) => rfcRow(r, { q, listId })).concat(res.total > rows.length ? [moreRow] : [])));
  }
  if (res.related.length) {
    // Crock's answer: current versions of a replaced RFC, or what updates it
    parts.push(group('Ask Crock', res.related.map((p) => rfcRow(p.rec, { meta: p.why, listId }))));
  } else if (replacedShown && !res.numberRows.length) {
    // a replaced RFC is in the results — offer Crock's question about it
    parts.push(group('Ask Crock', [askRow(`What replaced RFC ${replacedShown.n}?`, String(replacedShown.n), listId)]));
  }
  if (res.learn.length) {
    parts.push(group('Learn', res.learn.map((l) => iconRow(l, listId))));
  }
  const msg = res.message ? `<div class="res-empty">${esc(res.message)}${!parts.length ? ' <b>Try a number, a title word or an author’s surname.</b>' : ''}</div>` : '';
  return `<div role="listbox" id="${listId}" aria-label="Results for ${esc(q)}">${msg}${parts.join('')}</div>${hints(phone)}`;
}
