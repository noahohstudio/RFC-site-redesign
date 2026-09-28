// The landing page is the index itself: every RFC, newest first, grouped by
// year, with era “rooms”, filters, and a timeline tied to the scroll position.
import {
  db, ERAS, ERA_BY_KEY, KINDS, STATUS, STREAMS, fmtInt, esc, monthYear, monthYearShort,
  authorsShort, statusLabel, glyphClass, relationLine,
} from './data.js';
import { $, $$, icon, mqPhone, navHeight, store, openDialog } from './ui.js';
import { search } from './search.js';

const KIND_PLURAL = {
  I: 'Internet Standards', D: 'Draft Standards', P: 'Proposed Standards', B: 'Best Current Practices',
  N: 'Informational RFCs', E: 'Experimental RFCs', H: 'Historic RFCs', U: 'RFCs of unknown status',
};

const state = {
  kinds: new Set(KINDS),
  replaced: true,
  view: { type: 'all' },
  mode: 'wide',
  sections: [],
  shown: 0,
  first: null,
  last: null,
  anchor: undefined,
  visible: false,
};

let listEl, railEl, chipsEl, bannerEl, endEl, tlEl, scrubEl, scrubTrack;
let rafScroll = 0;

// ── Public API ────────────────────────────────────────────────────────
export function renderSkeleton() {
  listEl = $('#list');
  const rows = Array.from({ length: 6 }, () => '<div class="row row-skel" aria-hidden="true"><span class="row-num"><i></i></span><span class="row-body"><i></i><i></i></span><span class="row-trail"><i></i></span></div>').join('');
  listEl.innerHTML = `<section class="yr" data-era="present"><h2 class="yr-head"><span class="yr-left"><span class="era-dot"></span><span class="yr-num">…</span></span><span class="yr-rule"></span></h2>${rows}</section>`;
  listEl.setAttribute('aria-busy', 'true');
}

export function renderLoadError(err) {
  $('#list').innerHTML = `<div class="list-error callout"><svg class="icon" aria-hidden="true"><use href="#i-info"/></svg><div class="callout-text"><p class="callout-title">The index didn’t load</p><p class="callout-body">We couldn’t read data/rfc-index.json (${esc(err.message)}). If you opened this file directly, serve the folder instead — see README.md. <a href="">Try again</a></p></div></div>`;
}

export function init() {
  listEl = $('#list');
  railEl = $('#rail-left');
  chipsEl = $('#chips');
  bannerEl = $('#banner');
  endEl = $('#list-end');
  tlEl = $('#timeline');
  scrubEl = $('#scrub');
  scrubTrack = $('#scrub-track');
  listEl.removeAttribute('aria-busy');

  if (store.get('rfc-legend') === 'hidden') document.body.classList.add('legend-hidden');

  state.mode = modeFor(listEl.clientWidth);

  renderRailAndFilters();
  wireRailFade();
  renderChips();
  renderTimeline();
  renderScrubber();
  renderJumpSheet();
  rebuild({ keep: false });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', checkLayout, { passive: true });
  new ResizeObserver(checkLayout).observe(listEl);
  new ResizeObserver(() => { layoutTimeline(); updateCurrent(true); }).observe(tlEl);

  document.addEventListener('change', onFilterChange);
  document.addEventListener('click', onClick);
  wireTimeline();
  wireScrubber();
}

export function onShow() { state.visible = true; requestAnimationFrame(checkLayout); }

// Row layout follows the list's own width (wide · medium · compact), like a container query.
function checkLayout() {
  if (!state.visible) return;
  const w = listEl.clientWidth;
  const m = modeFor(w);
  if (m !== state.mode) {
    state.mode = m;
    rebuild({ keep: true });
  } else if (w !== state.listW) {
    // same mode, new width: rows re-wrap, so their heights are re-estimated once resizing settles
    state.listW = w;
    clearTimeout(state.relayout);
    state.relayout = setTimeout(() => rebuild({ keep: true }), 150);
  }
  layoutTimeline();
  positionScrubWindow();
  updateCurrent(true);
}
export function onHide() { state.visible = false; scrubEl.classList.remove('is-on'); }

export function restoreScroll(y) {
  requestAnimationFrame(() => { window.scrollTo(0, y); updateCurrent(true); });
}

// Views: all · search · kind · stream · errata
export function setView(view, { scroll = 'list', keep = false } = {}) {
  const v = { ...view };
  if (v.type === 'all' && state.view.type === 'all' && !filtersActive()) {
    requestAnimationFrame(() => { if (scroll === 'top' || scroll === 'list') window.scrollTo(0, 0); updateCurrent(true); });
    return;
  }
  if (v.type === 'all') {
    state.kinds = new Set(KINDS);
    state.replaced = true;
  } else if (v.type === 'kind') {
    if (!STATUS[v.kind]) v.type = 'all';
    else { state.kinds = new Set([v.kind]); state.replaced = true; }
  } else if (v.type === 'search') {
    const res = search(v.q || '');
    const recs = [...res.numberRows, ...res.rfcs];
    v.set = new Set(recs.map((r) => r.n));
    state.kinds = new Set(KINDS);
    state.replaced = true;
  } else if (v.type === 'stream') {
    if (!STREAMS.some((s) => s.key === v.stream)) v.type = 'all';
  }
  state.view = v;
  syncFilterInputs();
  rebuild({ keep });
  if (v.type === 'all' && scroll === 'list') scroll = 'top';
  requestAnimationFrame(() => {
    if (scroll === 'top') window.scrollTo(0, 0);
    else if (scroll === 'list') scrollToListTop();
    updateCurrent(true);
  });
}

export function refreshSearchView() {
  if (state.view.type === 'search') setView({ type: 'search', q: state.view.q }, { scroll: 'none', keep: true });
}

export function jumpToYear(year, { flash = true } = {}) {
  let i = state.sections.findIndex((s) => s.year <= year);
  if (i === -1) i = state.sections.length - 1;
  const sec = state.sections[i];
  if (!sec) return;
  const target = () => sec.el.getBoundingClientRect().top - navHeight() - (mqPhone.matches ? 48 : 0);
  window.scrollTo(0, Math.max(0, window.scrollY + target()));
  if (flash) {
    sec.el.classList.remove('is-flash');
    void sec.el.offsetWidth;
    sec.el.classList.add('is-flash');
  }
  updateCurrent(true); // the rows here are built now, and fade in
  const d = target(); // measuring them may have nudged the year above; settle exactly
  if (Math.abs(d) > 0.5 && window.scrollY + d >= 0) { window.scrollBy(0, d); updateCurrent(true); }
}

export function jumpToEra(key) {
  const era = ERA_BY_KEY[key];
  if (!era) return;
  const div = $(`#era-${key}`, listEl);
  if (div) {
    const target = () => div.getBoundingClientRect().top - navHeight() - (mqPhone.matches ? 56 : 16);
    window.scrollTo(0, Math.max(0, window.scrollY + target()));
    updateCurrent(true);
    const d = target();
    if (Math.abs(d) > 0.5 && window.scrollY + d >= 0) { window.scrollBy(0, d); updateCurrent(true); }
    return;
  }
  const first = state.sections.find((s) => s.era === key) || state.sections.find((s) => s.year <= era.to);
  if (first === state.sections[0]) scrollToListTop();
  else if (first) jumpToYear(first.year);
}

export function openFilters() {
  $('#dlg-filters-body').innerHTML = railHTML(true);
  updateFiltersDone();
  openDialog('dlg-filters');
}

export function openJump(tab = 'eras') {
  selectJumpTab(tab);
  openDialog('dlg-jump');
}

export function hideLegend(hide = true) {
  document.body.classList.toggle('legend-hidden', hide);
  store.set('rfc-legend', hide ? 'hidden' : 'shown');
}

export function resetFilters() {
  if (state.view.type === 'kind') { location.hash = '#/'; return; }
  state.kinds = new Set(KINDS);
  state.replaced = true;
  syncFilterInputs();
  rebuild({ keep: true });
}

// ── Rendering: list ───────────────────────────────────────────────────
function modeFor(w) {
  if (!w) return 'wide';
  if (w < 520) return 'compact';
  if (w < 720) return 'medium';
  return 'wide';
}

function passes(r) {
  if (!state.kinds.has(r.status)) return false;
  if (!state.replaced && r.obsolete) return false;
  const v = state.view;
  if (v.type === 'search') return v.set.has(r.n);
  if (v.type === 'stream') return r.stream === v.stream;
  if (v.type === 'errata') return r.errata;
  return true;
}

const filtersActive = () => state.kinds.size !== KINDS.length || !state.replaced;
const viewActive = () => state.view.type !== 'all' || filtersActive();

// Remember the row at the top of the screen so a rebuild (filters, rotation) keeps your place.
// updateCurrent() refreshes state.anchor while scrolling, before any reflow happens.
const stickyTop = () => navHeight() + (mqPhone.matches ? 48 : 0);
// Row positions come from each year's running heights, so the row at the top is known
// whether or not it's currently built.
function topRow(s, top) {
  if (!s.recs.length) return null;
  const r = s.rowsEl.getBoundingClientRect();
  const k = Math.min(s.recs.length - 1, rowAt(s.off, top - r.top));
  return { year: s.year, n: s.recs[k].n, offset: r.top + s.off[k] - top };
}
function captureAnchor() {
  const top = stickyTop();
  if (listEl.getBoundingClientRect().top >= top) return null;
  for (const s of state.sections) {
    if (s.el.getBoundingClientRect().bottom <= top) continue;
    return topRow(s, top) || { year: s.year, n: null, offset: 0 };
  }
  return null;
}
function restoreAnchor(a) {
  if (!a) return;
  const s = a.n != null ? state.sections.find((x) => x.recs.some((r) => r.n === a.n)) : null;
  if (!s) { jumpToYear(a.year, { flash: false }); return; }
  const k = s.recs.findIndex((r) => r.n === a.n);
  const off = () => s.rowsEl.getBoundingClientRect().top + s.off[k] - (stickyTop() + a.offset);
  window.scrollBy(0, off());
  renderWindow();
  const d = off(); // rows measured on arrival may have nudged it; settle exactly
  if (Math.abs(d) > 0.5) { window.scrollBy(0, d); renderWindow(); }
}

function rebuild({ keep }) {
  const anchor = keep ? (state.anchor !== undefined ? state.anchor : captureAnchor()) : null;
  const firstBuild = !state.sections.length;
  clearTimeout(state.relayout);
  listEl.dataset.mode = state.mode;
  state.listW = listEl.clientWidth;
  const key = `${state.mode}|${state.listW}`;
  if (key !== heightKey) { heightKey = key; heightCache.clear(); geo = null; } // new layout: re-measure
  const frag = document.createDocumentFragment();
  state.sections = [];
  let prevEra = null;
  let shown = 0;
  for (const y of db.years) {
    const recs = y.recs.filter(passes);
    if (!recs.length) continue;
    if (prevEra && prevEra !== y.era) frag.append(eraDivider(y.era));
    const sec = makeSection(y, recs);
    state.sections.push(sec);
    frag.append(sec.el);
    prevEra = y.era;
    shown += recs.length;
  }
  state.shown = shown;
  listEl.replaceChildren(frag);
  listEl.dataset.mode = state.mode;
  if (!state.sections.length) {
    listEl.innerHTML = `<div class="list-empty"><p>${state.view.type === 'search' ? `No RFCs match “${esc(state.view.q)}” with these filters.` : 'Nothing here with these filters — tick a few more kinds.'}</p><a class="btn btn-outline btn-sm" href="#/">Show everything</a></div>`;
  }
  // the first real rows replace the skeleton with a gentle arrival
  if (firstBuild) state.sections.slice(0, 2).forEach((s) => s.el.classList.add('arrive'));
  watchEras();
  renderBanner();
  renderEnd();
  updateTimelineCounts();
  updateScrubberCounts();
  updateFilterBadges();
  if (state.visible) restoreAnchor(anchor);
  updateCurrent(true);
}

// Era rooms settle in every time they come into view, and quietly reset once they're
// fully off screen, so walking back into one plays it again.
let eraIO = null;
function watchEras() {
  eraIO?.disconnect();
  if (!('IntersectionObserver' in window)) return;
  eraIO = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting && en.intersectionRatio >= 0.15) en.target.classList.add('is-in');
      else if (!en.isIntersecting) en.target.classList.remove('is-in');
    }
  }, { threshold: [0, 0.15] });
  $$('.era-div', listEl).forEach((d) => eraIO.observe(d));
  listEl.classList.add('eras-arrive');
}

function makeSection(y, recs) {
  const el = document.createElement('section');
  el.className = 'yr';
  el.dataset.year = y.year;
  el.dataset.era = y.era;
  el.id = `y${y.year}`;
  el.setAttribute('aria-labelledby', `yh${y.year}`);
  el.innerHTML = `<h2 class="yr-head" id="yh${y.year}"><span class="yr-left"><span class="era-dot" aria-hidden="true"></span><span class="yr-num">${y.year}</span><span class="yr-era">${ERA_BY_KEY[y.era].name}</span></span><span class="yr-rule" aria-hidden="true"></span><span class="yr-count">${countLabel(y, recs.length)}</span></h2><div class="yr-rows"></div>`;
  // h: each row's height (estimated until it has been on screen, then measured);
  // off: running totals, so off[k] is row k's top within the year; [from, to) is what's built
  const n = recs.length;
  const sec = { year: y.year, era: y.era, recs, el, rowsEl: el.lastElementChild, h: new Float64Array(n), off: new Float64Array(n + 1), from: 0, to: 0 };
  for (let i = 0; i < n; i++) {
    let hh = heightCache.get(recs[i].n);
    if (hh === undefined) { hh = rowEstimate(recs[i]); heightCache.set(recs[i].n, hh); }
    sec.h[i] = hh;
  }
  sumFrom(sec, 0);
  padRows(sec);
  el._sec = sec;
  return sec;
}

function countLabel(y, shown) {
  const total = y.recs.length;
  const noun = (n) => (n === 1 ? 'RFC' : 'RFCs');
  if (shown !== total) return `${fmtInt(shown)} of ${fmtInt(total)} ${noun(total)}`;
  if (y.year === db.maxYear) return `${fmtInt(total)} ${noun(total)} so far`;
  if (y.year < 1969) return `${total} ${noun(total)} · older than RFC 1`;
  return `${fmtInt(total)} ${noun(total)}`;
}

// ── Height estimates for years not built yet ──────────────────────────
// Measured from a hidden probe row in the current mode, so an unbuilt year takes up
// almost exactly the room it will need: the page doesn't grow or shift as years are built.
let geo = null;
// Row heights depend only on the layout (mode and width), never on filters, so they're
// kept across rebuilds: estimated once, and replaced by the real height once measured.
const heightCache = new Map(); // RFC number → row height
let heightKey = '';
const measureCtx = document.createElement('canvas').getContext('2d');
const labelWidths = new Map();
function textWidth(font, s) { measureCtx.font = font; return measureCtx.measureText(s).width; }
// Wrap text the way the browser does — greedily, breaking at spaces and after hyphens —
// so a row's line count is known exactly before the row exists. Word widths are cached.
const wordCaches = new Map(); // font → (word → width)
function widthsFor(font) {
  let cache = wordCaches.get(font);
  if (!cache) {
    measureCtx.font = font;
    cache = new Map();
    cache.space = measureCtx.measureText(' ').width;
    cache.widest = measureCtx.measureText('W').width;
    wordCaches.set(font, cache);
  }
  return cache;
}
function lineCount(text, font, max) {
  if (!text) return 0;
  const cache = widthsFor(font);
  if (text.length * cache.widest <= max) return 1; // couldn't wrap even if every letter were a W
  let lines = 1;
  let x = 0;
  for (const word of text.split(' ')) {
    if (!word) continue;
    const parts = word.includes('-') ? word.split(/(?<=-)/) : [word];
    for (let i = 0; i < parts.length; i++) {
      let w = cache.get(parts[i]);
      if (w === undefined) {
        if (measureCtx.font !== cache.font) { measureCtx.font = font; cache.font = measureCtx.font; }
        w = measureCtx.measureText(parts[i]).width;
        cache.set(parts[i], w);
      }
      const gap = i === 0 && x > 0 ? cache.space : 0;
      if (x > 0 && x + gap + w > max) { lines++; x = w; } else x += gap + w;
      while (x > max) { lines++; x -= max; } // a word longer than the line breaks anywhere
    }
  }
  return lines;
}
function measureGeometry() {
  const sample = db.list[db.list.length - 1];
  const plain = { ...sample, title: 'Mm', authors: [], obsoletes: [], obsoletedBy: [], updates: [], updatedBy: [], errata: false, obsolete: false };
  const probe = document.createElement('div');
  probe.className = 'yr-rows';
  probe.style.cssText = `position:absolute;top:0;width:${listEl.clientWidth || 800}px;visibility:hidden;pointer-events:none`;
  probe.innerHTML = `${rowHTML(plain)}<span class="row-rel">Updates 1</span>`;
  listEl.append(probe);
  const row = probe.firstElementChild;
  const title = $('.row-title', row);
  const meta = $('.row-meta', row);
  const trail = $('.row-trail', row);
  const cs = (el) => getComputedStyle(el);
  const fonts = { title: cs(title).font, meta: cs(meta).font, rel: cs(probe.lastElementChild).font, trail: cs(trail).font };
  const titleW = title.getBoundingClientRect().width;
  const wide = state.mode === 'wide';
  const ownLabel = wide ? textWidth(fonts.trail, statusLabel(plain)) : 0;
  const metaLH = parseFloat(cs(meta).lineHeight);
  const probeMetaLines = Math.max(1, Math.round(meta.getBoundingClientRect().height / metaLH));
  geo = {
    wide,
    base: row.getBoundingClientRect().height - (probeMetaLines - 1) * metaLH, // a row with one line each of title and meta
    // A wide row's title gets whatever its status label leaves: titleW + ownLabel − label(r).
    span: titleW + ownLabel,
    fonts,
    titleLH: parseFloat(cs(title).lineHeight),
    metaLH,
    relLH: parseFloat(cs(probe.lastElementChild).lineHeight),
    gap: parseFloat(cs($('.row-body', row)).rowGap) || 4,
  };
  probe.remove();
  labelWidths.clear();
}
function labelWidth(label) {
  if (!labelWidths.has(label)) labelWidths.set(label, textWidth(geo.fonts.trail, label));
  return labelWidths.get(label);
}
function rowEstimate(r) {
  if (!geo) measureGeometry();
  const g = geo;
  const w = Math.max(120, g.wide ? g.span - labelWidth(statusLabel(r)) : g.span);
  const lines = Math.max(1, lineCount(r.title, g.fonts.title, w));
  const metaLines = Math.max(1, lineCount(rowMeta(r), g.fonts.meta, w));
  const relLines = lineCount(relationLine(r), g.fonts.rel, w);
  return g.base + (lines - 1) * g.titleLH + (metaLines - 1) * g.metaLH + (relLines ? g.gap + relLines * g.relLH : 0);
}

// ── The window: only rows near the screen exist ───────────────────────
// Every year keeps its full height at all times. Rows outside the window are stood in
// for by the rows container's padding, sized from each row's height — estimated until
// the row has been on screen once, measured exactly after that. As the reader scrolls,
// rows about a screen ahead are built (and fade in) and rows a screen behind are
// dropped, so the page only ever holds a few dozen rows, whichever year you're in.
const windowMargin = () => Math.max(600, window.innerHeight);

function sumFrom(s, k) {
  for (let i = k; i < s.recs.length; i++) s.off[i + 1] = s.off[i] + s.h[i];
}
function padRows(s) {
  s.rowsEl.style.paddingTop = `${s.off[s.from]}px`;
  s.rowsEl.style.paddingBottom = `${s.off[s.recs.length] - s.off[s.to]}px`;
}
// The row covering y (px from the top of a year's rows): 0 before the first, n after the last.
function rowAt(off, y) {
  const n = off.length - 1;
  if (y < 0) return 0;
  if (y >= off[n]) return n;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (off[mid + 1] > y) hi = mid; else lo = mid + 1;
  }
  return lo;
}

function renderWindow() {
  if (!state.visible || !state.sections.length) return;
  const margin = windowMargin();
  const vTop = -margin;
  const vBot = window.innerHeight + margin;
  const st = stickyTop();
  // the row the reader is looking at stays exactly where it is while rows come and go
  let anchor = null;
  let anchorTop = 0;
  const plans = [];
  for (const s of state.sections) {
    const r = s.rowsEl.getBoundingClientRect();
    let i = 0;
    let j = 0;
    if (r.bottom > vTop && r.top < vBot) {
      i = rowAt(s.off, vTop - r.top);
      j = Math.min(s.recs.length, rowAt(s.off, vBot - r.top) + 1);
    }
    if (!anchor && s.to > s.from && r.bottom > st) {
      for (const row of s.rowsEl.children) {
        const b = row.getBoundingClientRect();
        if (b.bottom > st) { anchor = row; anchorTop = b.top; break; }
      }
    }
    if (i !== s.from || j !== s.to) plans.push([s, i, j]);
  }
  if (!plans.length) return;
  const fresh = [];
  for (const [s, i, j] of plans) setRange(s, i, j, fresh);
  // measure the rows that just arrived: from now on their heights are exact. Only rows
  // that arrive in view fade in (after a jump, or a very fast scroll); rows built a screen
  // ahead would finish fading unseen, so they skip it.
  const touched = new Map();
  const vh = window.innerHeight;
  for (const [s, k, el] of fresh) {
    const b = el.getBoundingClientRect();
    if (b.bottom > 0 && b.top < vh) el.classList.add('arrive');
    const hh = b.height;
    if (Math.abs(hh - s.h[k]) > 0.5) { s.h[k] = hh; heightCache.set(s.recs[k].n, hh); touched.set(s, Math.min(touched.get(s) ?? k, k)); }
  }
  for (const [s, k] of touched) { sumFrom(s, k); padRows(s); }
  if (anchor && anchor.isConnected) {
    const d = anchor.getBoundingClientRect().top - anchorTop;
    if (Math.abs(d) > 0.5) window.scrollBy(0, d);
  }
}

function setRange(s, i, j, fresh) {
  const rows = s.rowsEl;
  const html = (a, b) => s.recs.slice(a, b).map(rowHTML).join('');
  if (i >= j || j <= s.from || i >= s.to) {
    // nothing in common with what's built: start over
    rows.textContent = '';
    if (i < j) {
      rows.insertAdjacentHTML('beforeend', html(i, j));
      [...rows.children].forEach((el, x) => fresh.push([s, i + x, el]));
    }
  } else {
    const keepFrom = Math.max(s.from, i);
    const keepTo = Math.min(s.to, j);
    for (let k = s.from; k < keepFrom; k++) rows.firstElementChild.remove();
    for (let k = keepTo; k < s.to; k++) rows.lastElementChild.remove();
    if (i < keepFrom) {
      rows.insertAdjacentHTML('afterbegin', html(i, keepFrom));
      for (let x = 0; x < keepFrom - i; x++) fresh.push([s, i + x, rows.children[x]]);
    }
    if (keepTo < j) {
      rows.insertAdjacentHTML('beforeend', html(keepTo, j));
      const kids = rows.children;
      for (let x = 0; x < j - keepTo; x++) fresh.push([s, keepTo + x, kids[kids.length - (j - keepTo) + x]]);
    }
  }
  s.from = i < j ? i : 0;
  s.to = i < j ? j : 0;
  padRows(s);
}

// The meta line under a row's title, per mode (also used by the height estimate).
function rowMeta(r) {
  const authors = authorsShort(r);
  if (state.mode === 'compact') return `RFC ${r.n} · ${statusLabel(r)} · ${monthYearShort(r)}`;
  if (state.mode === 'medium') return `${statusLabel(r)} · ${r.stream} · ${monthYearShort(r)}${authors ? ` · ${authors}` : ''}`;
  return `${r.stream} · ${monthYear(r)}${authors ? ` · ${authors}` : ''}`;
}

function rowHTML(r) {
  const rel = relationLine(r);
  const relHTML = rel ? `<span class="row-rel">${rel}</span>` : '';
  const title = esc(r.title);
  const meta = esc(rowMeta(r));
  const glyph = `<i class="glyph" aria-hidden="true"></i>`;
  if (state.mode === 'compact') {
    return `<a class="row" href="#/rfc/${r.n}"><span class="row-body"><span class="row-title">${title}</span><span class="row-meta">${meta}</span>${relHTML}</span><span class="row-trail ${glyphClass(r)}">${glyph}</span></a>`;
  }
  const trail = state.mode === 'medium' ? glyph : `${glyph}${statusLabel(r)}`;
  return `<a class="row" href="#/rfc/${r.n}"><span class="row-num">${r.n}</span><span class="row-body"><span class="row-title">${title}</span><span class="row-meta">${meta}</span>${relHTML}</span><span class="row-trail ${glyphClass(r)}">${trail}</span></a>`;
}

function eraDivider(key) {
  const e = ERA_BY_KEY[key];
  const years = db.years.filter((y) => y.era === key && y.year >= 1969).sort((a, b) => a.year - b.year);
  const count = db.eraCount.get(key) || 0;
  const span = years.length ? years[years.length - 1].year - years[0].year + 1 : 0;
  const el = document.createElement('section');
  el.className = 'era-div';
  el.id = `era-${key}`;
  el.dataset.era = key;
  el.setAttribute('aria-label', `Now entering ${e.name}, ${e.years}`);
  el.innerHTML = `<div class="era-div-body">
      <p class="era-div-over">Now entering · ${e.years}</p>
      <h2 class="era-div-name">${e.name}</h2>
      <p class="era-div-blurb">${esc(e.blurb)}</p>
      <p class="era-div-meta">${fmtInt(count)} RFCs · ${span} years</p>
    </div>
    <div class="era-div-chart" aria-hidden="true">
      <div class="era-div-bars">${years.map((y, i) => `<i style="height:${Math.max(1, Math.round((y.recs.length / db.maxYearCount) * 72))}px;--i:${i}" title="${y.year}: ${y.recs.length} RFCs"></i>`).join('')}</div>
      <div class="era-div-axis"><span>${years[0]?.year ?? ''}</span><span>${years[years.length - 1]?.year ?? ''}</span></div>
    </div>`;
  return el;
}

function renderBanner() {
  const v = state.view;
  let title = '';
  let sub = '';
  if (v.type === 'search') {
    title = `${fmtInt(state.shown)} ${state.shown === 1 ? 'RFC matches' : 'RFCs match'} “${esc(v.q)}”`;
    sub = 'Newest first, grouped by year — the timeline shows when they were written.';
  } else if (v.type === 'kind') {
    title = `${KIND_PLURAL[v.kind]} · ${fmtInt(state.shown)}`;
    sub = esc(STATUS[v.kind].blurb);
  } else if (v.type === 'stream') {
    const s = STREAMS.find((x) => x.key === v.stream);
    title = `${s.name} stream · ${fmtInt(state.shown)} RFCs`;
    sub = esc(s.blurb);
  } else if (v.type === 'errata') {
    title = `RFCs with reported errata · ${fmtInt(state.shown)}`;
    sub = 'Corrections are listed beside each RFC on rfc-editor.org — never written into it.';
  }
  bannerEl.innerHTML = title
    ? `<div class="banner" role="status"><div class="banner-text"><p class="banner-title">${title}</p><p class="banner-sub">${sub}</p></div><a class="btn btn-outline btn-sm" href="#/">Show everything</a></div>`
    : '';
}

function renderEnd() {
  if (!state.sections.length) { endEl.hidden = true; return; }
  endEl.hidden = false;
  if (!viewActive()) {
    endEl.innerHTML = `<b>You’ve reached the beginning.</b><p>The oldest memo in the index is <a href="#/rfc/31">RFC 31</a>, dated February 1968 — over a year before <a href="#/rfc/1">RFC 1</a> opened the series in April 1969.</p>`;
  } else {
    const newest = state.sections[0].year;
    const oldest = state.sections[state.sections.length - 1].year;
    endEl.innerHTML = `<b>That’s everything that matches.</b><p>${fmtInt(state.shown)} ${state.shown === 1 ? 'RFC' : 'RFCs'}${newest !== oldest ? `, from ${oldest} to ${newest}` : `, from ${newest}`}. <a href="#/">Show the whole archive</a></p>`;
  }
}

function scrollToListTop() {
  const anchor = bannerEl.firstElementChild || listEl;
  const top = anchor.getBoundingClientRect().top + window.scrollY - navHeight() - 16;
  window.scrollTo(0, Math.max(0, top));
}

// ── Left rail, filters, chips ─────────────────────────────────────────
function railHTML(inSheet = false) {
  const maxEra = Math.max(...ERAS.map((e) => db.eraCount.get(e.key) || 0));
  const eras = ERAS.map((e) => {
    const c = db.eraCount.get(e.key) || 0;
    return `<button class="era-item" type="button" data-era="${e.key}" data-jump-era="${e.key}" aria-current="${e.key === currentEra()}"><span class="strip" aria-hidden="true"></span><span class="name"><b>${e.name}</b><small>${e.years}</small></span><span class="vol"><span>${fmtInt(c)}</span><i style="width:${Math.max(3, Math.round((c / maxEra) * 56))}px" aria-hidden="true"></i></span></button>`;
  }).join('');
  const kinds = KINDS.map((k) => `<label class="filter"><input type="checkbox" data-kind="${k}"${state.kinds.has(k) ? ' checked' : ''}><i class="glyph gl-${k}" aria-hidden="true"></i><span class="label">${STATUS[k].label}</span><span class="count">${fmtInt(db.kindCount.get(k) || 0)}</span></label>`).join('');
  const walk = `
    <div class="panel-head"><h2>Walk through time</h2><p>Six eras of the internet, newest first.</p></div>
    <div class="era-list">${eras}</div>`;
  const filters = `
    <div class="panel-head"><h2>Filter by kind</h2><p>Untick anything you don’t need.</p><button class="text-btn" type="button" data-action="reset-filters" data-reset${filtersActive() ? '' : ' hidden'}>Show every kind</button></div>
    <div class="filters" role="group" aria-label="Kinds of RFC">
      ${kinds}
      <label class="filter"><input type="checkbox" data-replaced${state.replaced ? ' checked' : ''}><i class="glyph gl-Io" aria-hidden="true"></i><span class="label">Include replaced RFCs</span><span class="count">${fmtInt(db.replacedCount)}</span></label>
    </div>`;
  // The rail walks first (as in Figma); the Filters sheet leads with the filters.
  return inSheet ? `${filters}<div class="rail-divider"></div>${walk}` : `${walk}<div class="rail-divider"></div>${filters}`;
}

function renderRailAndFilters() {
  railEl.innerHTML = railHTML();
}

// The rail scrolls on its own when it's taller than the screen. Fade whichever edge
// has more behind it, so it's clear the list goes on.
let fadeRail = () => {};
function wireRailFade() {
  const box = railEl.parentElement;
  fadeRail = () => {
    box.classList.toggle('fade-top', railEl.scrollTop > 4);
    box.classList.toggle('fade-bottom', railEl.scrollHeight - railEl.clientHeight - railEl.scrollTop > 4);
  };
  railEl.addEventListener('scroll', fadeRail, { passive: true });
  new ResizeObserver(fadeRail).observe(railEl);
  fadeRail();
}

// Update the checkboxes in place (rail + filters sheet) so keyboard focus survives.
function syncFilterInputs() {
  $$('input[data-kind]').forEach((i) => { i.checked = state.kinds.has(i.dataset.kind); });
  $$('input[data-replaced]').forEach((i) => { i.checked = state.replaced; });
  $$('[data-reset]').forEach((b) => { b.hidden = !filtersActive(); });
  fadeRail();
}

function onFilterChange(e) {
  const t = e.target;
  if (t.matches('input[data-kind]')) {
    const k = t.dataset.kind;
    if (t.checked) state.kinds.add(k); else state.kinds.delete(k);
  } else if (t.matches('input[data-replaced]')) {
    state.replaced = t.checked;
  } else return;
  if (state.view.type === 'kind') { state.view = { type: 'all' }; history.replaceState(null, '', '#/'); }
  syncFilterInputs();
  rebuild({ keep: true });
  updateFiltersDone();
}

function updateFiltersDone() {
  const b = $('#dlg-filters-done');
  if (b) b.textContent = `Show ${fmtInt(state.shown)} ${state.shown === 1 ? 'RFC' : 'RFCs'}`;
}

function offCount() { return KINDS.length - state.kinds.size + (state.replaced ? 0 : 1); }

function renderChips() {
  if (!chipsEl) return;
  const off = offCount();
  const cur = currentEra();
  chipsEl.innerHTML = `<div class="chips" role="group" aria-label="Filters and eras">
    <button class="chip chip-filter" type="button" data-action="filters">${icon('filter')}Filters<span class="badge">${off ? `· ${off} off` : ''}</span></button>
    ${ERAS.map((e) => `<button class="chip" type="button" data-era="${e.key}" data-jump-era="${e.key}"${e.key === cur ? ' aria-current="true"' : ''}><span class="era-dot" aria-hidden="true"></span>${e.name}<span class="count">${fmtInt(db.eraCount.get(e.key) || 0)}</span></button>`).join('')}
  </div>`;
}

function updateFilterBadges() {
  const b = $('.chip-filter .badge', chipsEl);
  const off = offCount();
  if (b) b.textContent = off ? `· ${off} off` : '';
}

function onClick(e) {
  const j = e.target.closest('[data-jump-era]');
  if (j) {
    e.preventDefault();
    const key = j.dataset.jumpEra;
    const dlg = j.closest('dialog');
    if (dlg) dlg.close();
    jumpToEra(key);
  }
}

// ── Current position (timeline window, era rail, chips, scrubber) ─────
let lastFirst = null;
let lastLast = null;
// While the page is moving, rows ignore the pointer: no hover fades start and stop under
// a still cursor. Hover comes back a moment after scrolling stops.
let scrollIdle = 0;
function onScroll() {
  if (!listEl.classList.contains('is-scrolling')) listEl.classList.add('is-scrolling');
  clearTimeout(scrollIdle);
  scrollIdle = setTimeout(() => listEl.classList.remove('is-scrolling'), 160);
  if (rafScroll) return;
  rafScroll = requestAnimationFrame(() => { rafScroll = 0; updateCurrent(false); });
}

let focusEra = 'present';
function currentEra() { return focusEra; }

function updateCurrent(force) {
  if (!state.visible || !state.sections.length) return;
  renderWindow();
  const phone = mqPhone.matches;
  const top = navHeight() + (phone ? 48 : 0) + 4;
  const bottom = window.innerHeight;
  // The era “you are in” follows a line 40% down the screen, so walking into
  // an era room switches the rail as soon as the room fills the view.
  const focusY = top + (bottom - top) * 0.4;
  let first = null;
  let last = null;
  let era = null;
  let topSec = null;
  for (const s of state.sections) {
    const r = s.el.getBoundingClientRect();
    if (era === null && r.bottom > focusY) era = s.era;
    if (r.bottom <= top) continue;
    if (r.top >= bottom) break;
    if (first === null) { first = s.year; topSec = s; }
    last = s.year;
  }
  const st = stickyTop();
  state.anchor = listEl.getBoundingClientRect().top < st && topSec
    ? (topRow(topSec, st) || { year: topSec.year, n: null, offset: 0 })
    : null;
  if (first === null) {
    const lastSec = state.sections[state.sections.length - 1];
    first = last = lastSec.el.getBoundingClientRect().bottom <= top ? lastSec.year : state.sections[0].year;
  }
  if (era === null) era = state.sections[state.sections.length - 1].era;
  // phone: show the era scrubber once the list reaches the top
  if (phone) {
    const on = listEl.getBoundingClientRect().top < navHeight() + 8;
    scrubEl.classList.toggle('is-on', on);
  }
  const eraChanged = era !== focusEra;
  if (!force && !eraChanged && first === lastFirst && last === lastLast) return;
  lastFirst = first;
  lastLast = last;
  state.first = first;
  state.last = last;
  focusEra = era;
  positionWindow();
  positionScrubWindow();
  if (eraChanged || force) {
    $$('.era-item', railEl).forEach((b) => b.setAttribute('aria-current', String(b.dataset.era === era)));
    $$('.chip[data-jump-era]', chipsEl).forEach((b) => { if (b.dataset.era === era) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  }
  // the phone scrubber names the year at the top of the screen, so it uses that year's era
  const topEra = state.sections.find((s) => s.year === first)?.era || era;
  if (scrubEl.dataset.era !== topEra) {
    scrubEl.dataset.era = topEra;
    $('.scrub-era', scrubEl).textContent = ERA_BY_KEY[topEra].name;
  }
  $('.scrub-year', scrubEl).textContent = first;
}

// ── Timeline (right rail) ─────────────────────────────────────────────
const TL_YEARS = () => { const out = []; for (let y = db.maxYear; y >= db.minYear; y--) out.push(y); return out; };

function renderTimeline() {
  const years = TL_YEARS();
  const early = years.filter((y) => y < 1983).reduce((a, y) => ((db.yearCount.get(y) || 0) > (db.yearCount.get(a) || 0) ? y : a), years[years.length - 1]);
  const peak = years.reduce((a, y) => ((db.yearCount.get(y) || 0) > (db.yearCount.get(a) || 0) ? y : a), years[0]);
  const ticks = [0, 100, 200, 300, 400];
  tlEl.innerHTML = `
    <div class="tl-head"><p class="t-overline">RFCs per year</p><p>${db.minYear} → ${db.maxYear} · ${fmtInt(db.list.length)}</p></div>
    <div class="tl-axis" aria-hidden="true">${ticks.map((v) => `<span style="left:calc(37px + ${v} * var(--scale))">${v}</span>`).join('')}</div>
    <p class="tl-now" aria-hidden="true"></p>
    <div class="tl-plot" style="--years:${years.length}">
      ${ticks.map((v) => `<i class="tl-grid${v === 0 ? ' is-zero' : ''}" style="left:calc(36px + ${v} * var(--scale))" aria-hidden="true"></i>`).join('')}
      ${years.map((y) => {
        const total = db.yearCount.get(y) || 0;
        const era = db.years.find((x) => x.year === y)?.era || 'arpanet';
        const note = y === peak || y === early ? `<span class="tl-note">${total}</span>` : '';
        return `<div class="tl-row" data-year="${y}" data-era="${era}" style="--total:${total};--shown:${total}">${y % 10 === 0 ? `<span class="tl-yl">${y}</span>` : ''}<span class="tl-bar"><i></i></span>${note}</div>`;
      }).join('')}
      <div class="tl-window"><span class="tl-here"></span></div>
      <div class="tl-tip" hidden></div>
    </div>
    <p class="tl-caption">Bar length = RFCs that year. Click or drag to travel.</p>`;
  tlEl.setAttribute('role', 'slider');
  tlEl.setAttribute('tabindex', '0');
  tlEl.setAttribute('aria-label', 'Timeline — RFCs per year. Use arrow keys to walk through time.');
  tlEl.setAttribute('aria-orientation', 'vertical');
  tlEl.setAttribute('aria-valuemin', String(db.minYear));
  tlEl.setAttribute('aria-valuemax', String(db.maxYear));
  layoutTimeline();
}

function layoutTimeline() {
  if (!tlEl || !tlEl.firstElementChild) return;
  const w = tlEl.clientWidth;
  const compact = w < 150;
  tlEl.classList.toggle('tl--compact', compact);
  const scale = compact ? (w - 8) / db.maxYearCount : (w - 37 - 36) / db.maxYearCount;
  tlEl.style.setProperty('--scale', `${Math.max(0.02, scale).toFixed(4)}px`);
  positionWindow();
}

function updateTimelineCounts() {
  const shown = new Map();
  for (const s of state.sections) shown.set(s.year, s.recs.length);
  $$('.tl-row', tlEl).forEach((row) => row.style.setProperty('--shown', shown.get(Number(row.dataset.year)) || 0));
}

function positionWindow() {
  if (!state.first || !tlEl.firstElementChild) return;
  const plot = $('.tl-plot', tlEl);
  const n = db.maxYear - db.minYear + 1;
  const rowH = plot.clientHeight / n;
  const i1 = db.maxYear - state.first;
  const i2 = db.maxYear - state.last;
  const win = $('.tl-window', tlEl);
  win.style.transform = `translateY(${(i1 * rowH - 3).toFixed(1)}px)`; // moved on the compositor, not by layout
  win.style.height = `${(i2 - i1 + 1) * rowH + 6}px`;
  const label = state.first === state.last ? `${state.first}` : `${state.first}–${state.last}`;
  $('.tl-here', tlEl).textContent = `Viewing ${label}`;
  $('.tl-now', tlEl).textContent = label;
  tlEl.setAttribute('aria-valuenow', String(state.first));
  tlEl.setAttribute('aria-valuetext', `Viewing ${label}`);
}

function yearFromY(plot, clientY) {
  const r = plot.getBoundingClientRect();
  const n = db.maxYear - db.minYear + 1;
  const i = Math.min(n - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * n)));
  return db.maxYear - i;
}

function wireTimeline() {
  const plot = $('.tl-plot', tlEl);
  const tip = $('.tl-tip', tlEl);
  let dragging = false;
  let pending = null;
  let raf = 0;
  const go = (y) => {
    pending = y;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; jumpToYear(pending, { flash: false }); });
  };
  const showTip = (e) => {
    const y = yearFromY(plot, e.clientY);
    const total = db.yearCount.get(y) || 0;
    const shown = state.sections.find((s) => s.year === y)?.recs.length || 0;
    tip.textContent = `${y} · ${shown !== total ? `${fmtInt(shown)} of ` : ''}${fmtInt(total)} RFC${total === 1 ? '' : 's'}`;
    const r = plot.getBoundingClientRect();
    const row = $(`.tl-row[data-year="${y}"]`, plot);
    const bar = row && $('.tl-bar', row);
    tip.style.top = `${e.clientY - r.top}px`;
    if (!tlEl.classList.contains('tl--compact') && bar) tip.style.left = `${Math.min(bar.offsetLeft + bar.offsetWidth + 10, plot.clientWidth - 90)}px`;
    else tip.style.left = '';
    tip.hidden = false;
  };
  plot.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    plot.setPointerCapture(e.pointerId);
    go(yearFromY(plot, e.clientY));
    showTip(e);
  });
  plot.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || dragging) showTip(e);
    if (dragging) go(yearFromY(plot, e.clientY));
  });
  const end = () => { dragging = false; };
  plot.addEventListener('pointerup', end);
  plot.addEventListener('pointercancel', end);
  plot.addEventListener('pointerleave', () => { if (!dragging) tip.hidden = true; });
  tlEl.addEventListener('keydown', (e) => {
    const cur = state.first || db.maxYear;
    const map = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
    let y = null;
    if (e.key in map) y = cur + map[e.key];
    else if (e.key === 'Home') y = db.maxYear;
    else if (e.key === 'End') y = db.minYear;
    if (y === null) return;
    e.preventDefault();
    y = Math.max(db.minYear, Math.min(db.maxYear, y));
    // skip years with nothing to show in this view
    const dir = y > cur ? 1 : -1;
    while (y >= db.minYear && y <= db.maxYear && !state.sections.some((s) => s.year === y)) y += dir;
    if (y >= db.minYear && y <= db.maxYear) jumpToYear(y, { flash: false });
  });
}

// ── Phone era scrubber (horizontal, newest on the left) ───────────────
function renderScrubber() {
  const years = TL_YEARS();
  scrubTrack.innerHTML = `${years.map((y) => {
    const era = db.years.find((x) => x.year === y)?.era || 'arpanet';
    return `<i data-year="${y}" data-era="${era}"></i>`;
  }).join('')}<span class="scrub-win"></span>`;
  scrubTrack.setAttribute('aria-valuemin', String(db.minYear));
  scrubTrack.setAttribute('aria-valuemax', String(db.maxYear));
  updateScrubberCounts();
}

function updateScrubberCounts() {
  const shown = new Map();
  for (const s of state.sections) shown.set(s.year, s.recs.length);
  $$('i', scrubTrack).forEach((b) => {
    const c = shown.get(Number(b.dataset.year)) || 0;
    b.style.height = `${c ? Math.max(2, Math.round((c / db.maxYearCount) * 28)) : 0}px`;
  });
}

function positionScrubWindow() {
  if (!state.first || !scrubTrack) return;
  const n = db.maxYear - db.minYear + 1;
  const w = scrubTrack.clientWidth / n;
  const i1 = db.maxYear - state.first;
  const i2 = db.maxYear - state.last;
  const win = $('.scrub-win', scrubTrack);
  win.style.left = `${i1 * w - 2}px`;
  win.style.width = `${(i2 - i1 + 1) * w + 4}px`;
  scrubTrack.setAttribute('aria-valuenow', String(state.first));
}

function wireScrubber() {
  let dragging = false;
  const yearAt = (x) => {
    const r = scrubTrack.getBoundingClientRect();
    const n = db.maxYear - db.minYear + 1;
    const i = Math.min(n - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * n)));
    return db.maxYear - i;
  };
  scrubTrack.addEventListener('pointerdown', (e) => {
    dragging = true;
    scrubTrack.setPointerCapture(e.pointerId);
    jumpToYear(yearAt(e.clientX), { flash: false });
  });
  scrubTrack.addEventListener('pointermove', (e) => { if (dragging) jumpToYear(yearAt(e.clientX), { flash: false }); });
  scrubTrack.addEventListener('pointerup', () => { dragging = false; });
  scrubTrack.addEventListener('pointercancel', () => { dragging = false; });
}

// ── Jump sheet: eras · years · streams ────────────────────────────────
function renderJumpSheet() {
  $('#jump-eras').innerHTML = `<div class="jump-eras">${ERAS.map((e) => `<a class="jump-era" href="#/era/${e.key}" data-era="${e.key}"><span class="jump-era-text"><b>${e.name}</b><small>${e.years} · ${fmtInt(db.eraCount.get(e.key) || 0)} RFCs</small><span>${esc(e.blurb)}</span></span></a>`).join('')}</div>`;
  const decades = new Map();
  for (const y of db.years) {
    const d = Math.floor(y.year / 10) * 10;
    if (!decades.has(d)) decades.set(d, []);
    decades.get(d).push(y);
  }
  $('#jump-years').innerHTML = [...decades.entries()].map(([d, ys]) => `<div class="jump-decade"><b>${d}s</b><div class="jump-years">${ys.map((y) => `<a class="jump-year" href="#/year/${y.year}" data-era="${y.era}"><b>${y.year}</b><small>${fmtInt(y.recs.length)}</small></a>`).join('')}</div></div>`).join('');
  $('#jump-streams').innerHTML = `<div class="jump-streams">${STREAMS.map((s) => `<a class="jump-stream" href="#/stream/${s.key}"><span><b>${s.name}</b><span>${esc(s.blurb)}</span></span><em>${fmtInt(db.streamCount.get(s.key) || 0)}</em></a>`).join('')}</div>`;
  $$('#dlg-jump [role="tab"]').forEach((t) => t.addEventListener('click', () => selectJumpTab(t.dataset.tab)));
}

function selectJumpTab(tab) {
  $$('#dlg-jump [role="tab"]').forEach((t) => {
    const on = t.dataset.tab === tab;
    t.setAttribute('aria-selected', String(on));
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
}
