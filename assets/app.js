// Boot + hash router for the RFC Editor redesign prototype.
//   #/                 the index (landing)
//   #/year/1999        the index at 1999          #/era/web      at an era
//   #/search/email     index filtered to matches  #/kind/B       one kind (e.g. BCP)
//   #/stream/IRTF      one stream                 #/errata       RFCs with errata
//   #/rfc/9110         a document                 #/rfc/9110/s/3 a section of it
import { db, loadIndex, loadAbstracts, loadNotes, fmtInt, MONTHS } from './data.js';
import { attachAbstracts } from './search.js';
import * as ui from './ui.js';
import * as index from './indexview.js';
import * as doc from './docview.js';
import * as searchUI from './searchui.js';

const { $, $$ } = ui;
let view = null;
let lastIndexHash = '#/';
let lastIndexScroll = 0;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

boot();

async function boot() {
  ui.initTheme();
  ui.initDialogs();
  index.renderSkeleton();
  try {
    // Crock’s notes are small and optional: pages simply go without them if they fail to load.
    await Promise.all([loadIndex(), loadNotes().catch(() => null)]);
  } catch (err) {
    index.renderLoadError(err);
    return;
  }
  bindCounts();
  ui.initMenus();
  ui.renderMenuSheet();
  ui.renderLegendSheet();
  index.init();
  doc.init();
  searchUI.init();

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', route);
  route();

  // Abstracts make search deeper: fetch them once the page is settled, or as
  // soon as someone starts searching — whichever comes first.
  const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  later(ensureAbstracts, { timeout: 4000 });
  $('#search-input').addEventListener('focus', ensureAbstracts, { once: true });
  $('#msearch-input').addEventListener('focus', ensureAbstracts, { once: true });
}

let abstractsPromise = null;
function ensureAbstracts() {
  if (!abstractsPromise) {
    abstractsPromise = loadAbstracts()
      .then(() => { attachAbstracts(); searchUI.refresh(); index.refreshSearchView(); })
      .catch(() => { abstractsPromise = null; });
  }
  return abstractsPromise;
}

function bindCounts() {
  $$('[data-bind="total"]').forEach((el) => { el.textContent = fmtInt(db.list.length); });
  const [y, m, d] = (db.generated || '').split('-').map(Number);
  if (y) $$('[data-bind="generated"]').forEach((el) => { el.textContent = `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; });
}

function show(next) {
  if (view === next) return;
  if (view === 'index') { lastIndexScroll = window.scrollY; index.onHide(); }
  if (view === 'doc') doc.onHide();
  $('#view-index').hidden = next !== 'index';
  $('#view-doc').hidden = next !== 'doc';
  view = next;
  if (next === 'index') { document.title = 'RFC Editor — redesign concept'; index.onShow(); }
}

function route(e) {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').map((p) => decodeURIComponent(p));
  ui.closeMenus();
  searchUI.close();
  ui.closeAllDialogs();

  if (parts[0] === 'rfc' && parts[1]) {
    const n = parseInt(parts[1], 10);
    const section = parts[2] === 's' ? parts.slice(3).join('/') : null;
    if (view === 'doc' && doc.currentN() === n) { if (section) doc.scrollToSection(section); return; }
    if (view === 'index') lastIndexHash = e?.oldURL ? (new URL(e.oldURL).hash || '#/') : lastIndexHash;
    show('doc');
    doc.show(n, section);
    return;
  }

  const fromDoc = view === 'doc';
  show('index');
  if (fromDoc && hash === lastIndexHash) { index.restoreScroll(lastIndexScroll); return; }

  switch (parts[0]) {
    case 'year': index.jumpToYear(Number(parts[1])); break;
    case 'era': index.jumpToEra(parts[1]); break;
    case 'search': index.setView({ type: 'search', q: parts.slice(1).join('/') }); ensureAbstracts(); break;
    case 'kind': index.setView({ type: 'kind', kind: parts[1] }); break;
    case 'stream': index.setView({ type: 'stream', stream: parts[1] }); break;
    case 'errata': index.setView({ type: 'errata' }); break;
    default: index.setView({ type: 'all' }, { scroll: 'top' });
  }
}

function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (t) {
    const a = t.dataset.action;
    switch (a) {
      case 'theme': ui.toggleTheme(); break;
      case 'menu': ui.openDialog('dlg-menu'); break;
      case 'search': searchUI.openFromShortcut(); break;
      case 'legend': ui.openDialog('dlg-legend'); break;
      case 'glossary': ui.openDialog('dlg-glossary'); break;
      case 'jump-eras': index.openJump('eras'); break;
      case 'jump-years': index.openJump('years'); break;
      case 'jump-streams': index.openJump('streams'); break;
      case 'filters': index.openFilters(); break;
      case 'hide-legend': index.hideLegend(true); break;
      case 'reset-filters': index.resetFilters(); break;
      case 'close': ui.closeDialog(t.closest('dialog')); break;
      default: break;
    }
  }
  const link = e.target.closest('a[href^="#/"]');
  if (link) {
    const dlg = link.closest('dialog');
    if (dlg && !link.closest('#dlg-search')) ui.closeDialog(dlg);
    // clicking a link to the page you're on still re-runs it (e.g. jump to an era twice)
    if (link.getAttribute('href') === (location.hash || '#/')) { e.preventDefault(); route(); }
  }
}

function onKey(e) {
  const el = e.target;
  const typing = el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchUI.openFromShortcut();
  } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    searchUI.openFromShortcut();
  } else if (e.key === 'Escape') {
    ui.closeMenus();
    doc.closeToc();
  }
}
