// Shared interface pieces: icons, theme, dialogs (sheets), mega menus, the
// phone/tablet menu, the legend sheet and toasts.
import { MENUS } from './menus.js';
import { db, ERAS, KINDS, STATUS, fmtInt, esc } from './data.js';

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const icon = (name, cls = '') => `<svg class="icon ${cls}" data-i="${name}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
// Soft edge fades on anything that scrolls or clips: whichever edge has more behind it
// fades out, so it's clear there's more. A mask, not an overlay, so it suits any background.
export function edgeFade(el, axis = 'y') {
  if (!el || el.dataset.edgeFade) return;
  el.dataset.edgeFade = axis;
  el.classList.add('edge-fade', axis === 'x' ? 'edge-x' : 'edge-y');
  const update = () => {
    const pos = axis === 'x' ? el.scrollLeft : el.scrollTop;
    const more = axis === 'x' ? el.scrollWidth - el.clientWidth - pos : el.scrollHeight - el.clientHeight - pos;
    el.classList.toggle('fade-start', pos > 2);
    el.classList.toggle('fade-end', more > 2);
  };
  // the box resizing and what's inside it changing size (a list growing, text switching size) both count
  const ro = new ResizeObserver(update);
  const watch = () => { ro.observe(el); for (const c of el.children) ro.observe(c); };
  el.addEventListener('scroll', update, { passive: true });
  new MutationObserver(() => { watch(); update(); }).observe(el, { childList: true, subtree: true });
  watch();
  update();
}

export const mqPhone = matchMedia('(max-width: 767px)');
export const mqTablet = matchMedia('(max-width: 1023px)');
export const navHeight = () => (mqPhone.matches ? 56 : 64);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
export { store };

// ── Theme ─────────────────────────────────────────────────────────────
const root = document.documentElement;
export function initTheme() {
  syncThemeUI();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!store.get('rfc-theme')) setTheme(e.matches ? 'dark' : 'light', false);
  });
}
export function toggleTheme() { setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true); }
// A theme swap changes every colour at once. Rather than letting hundreds of hover
// fades run together, transitions pause for the swap and — where the browser can —
// the old and new pages crossfade as one image.
function setTheme(t, persist) {
  const swap = () => {
    root.dataset.theme = t;
    if (persist) store.set('rfc-theme', t);
    syncThemeUI();
  };
  root.classList.add('is-theming');
  // the new colours are already applied by now, so re-enabling transitions starts none
  const settle = () => root.classList.remove('is-theming');
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const vt = document.startViewTransition(swap);
    vt.ready.catch(() => {}); // skipped (e.g. in a background tab): the swap still happens, just without the fade
    vt.finished.then(settle, settle);
  } else {
    swap();
    getComputedStyle(root).color; // apply the new colours now, while transitions are paused
    settle();
  }
}
function syncThemeUI() {
  const dark = root.dataset.theme === 'dark';
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#12110e' : '#fbf7f0');
  $$('[data-action="theme"]').forEach((b) => {
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    const label = b.querySelector('[data-theme-label]');
    if (label) label.textContent = dark ? 'Dark' : 'Light';
  });
}

// ── Toast ─────────────────────────────────────────────────────────────
let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
}

// A newer build is live: a quiet note with a reload, shown once.
export function showUpdate() {
  if ($('.update-note')) return;
  const note = document.createElement('div');
  note.className = 'update-note';
  note.setAttribute('role', 'status');
  note.innerHTML = '<span>A newer version of this prototype is live.</span><button type="button" class="update-reload">Reload</button>';
  note.querySelector('button').addEventListener('click', () => location.reload());
  document.body.append(note);
}

// ── Dialogs ───────────────────────────────────────────────────────────
export function initDialogs() {
  $$('dialog.sheet-dlg').forEach((d) => {
    d.querySelectorAll('.dlg-body, .msearch-body').forEach((b) => edgeFade(b));
    d.addEventListener('close', () => {
      if (!$$('dialog[open]').length) root.classList.remove('is-locked');
      d.dispatchEvent(new CustomEvent('sheet-closed'));
    });
    // click on the backdrop closes (the dialog element itself is the backdrop hit target)
    d.addEventListener('click', (e) => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) d.close();
    });
  });
}
export function openDialog(id) {
  const d = document.getElementById(id);
  if (!d || d.open) return d;
  closeMenus();
  d.showModal();
  root.classList.add('is-locked');
  return d;
}
export function closeDialog(d) { if (d?.open) d.close(); }
export function closeAllDialogs() { $$('dialog[open]').forEach((d) => d.close()); }

// ── Mega menus (≥1024) ────────────────────────────────────────────────
let openKey = null;
let hoverTimer = 0;
let leaveTimer = 0;

export function initMenus() {
  $('#megas').innerHTML = MENUS.map(megaHTML).join('');
  $$('.mega-scroll').forEach((s) => edgeFade(s));
  const triggers = $$('.nav-trigger');
  const scrim = $('#scrim');
  triggers.forEach((t) => {
    t.addEventListener('click', () => (openKey === t.dataset.menu ? closeMenus() : openMenu(t.dataset.menu)));
    t.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(hoverTimer); clearTimeout(leaveTimer);
      hoverTimer = setTimeout(() => openMenu(t.dataset.menu), openKey ? 60 : 220);
    });
    t.addEventListener('pointerleave', () => { clearTimeout(hoverTimer); scheduleClose(); });
  });
  $$('.mega').forEach((m) => {
    m.addEventListener('pointerenter', () => clearTimeout(leaveTimer));
    m.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') scheduleClose(); });
    m.addEventListener('click', (e) => { if (e.target.closest('a, [data-action]')) closeMenus(); });
  });
  scrim.addEventListener('click', () => { closeMenus(); document.dispatchEvent(new CustomEvent('scrim-click')); });
  mqTablet.addEventListener('change', closeMenus);
}
function scheduleClose() {
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    if (!$('.mega:hover') && !$('.nav-trigger:hover')) closeMenus();
  }, 320);
}
export function openMenu(key) {
  if (openKey === key) return;
  document.dispatchEvent(new CustomEvent('menu-open'));
  openKey = key;
  $$('.nav-trigger').forEach((t) => t.setAttribute('aria-expanded', String(t.dataset.menu === key)));
  $$('.mega').forEach((m) => { m.hidden = m.id !== `mega-${key}`; });
  $('#scrim').hidden = false;
}
export function closeMenus() {
  clearTimeout(hoverTimer);
  if (!openKey) return;
  openKey = null;
  $$('.nav-trigger').forEach((t) => t.setAttribute('aria-expanded', 'false'));
  $$('.mega').forEach((m) => { m.hidden = true; });
  if (!document.body.classList.contains('search-open')) $('#scrim').hidden = true;
}
export const menuIsOpen = () => !!openKey;

function itemHTML(it, cls = 'nav-item') {
  const attrs = it.action
    ? `button type="button" data-action="${it.action}"`
    : `a href="${it.href}"${it.ext ? ' target="_blank" rel="noopener"' : ''}`;
  const tag = it.action ? 'button' : 'a';
  return `<${attrs} class="${cls}">
    <span class="nav-item-icon">${icon(it.icon)}</span>
    <span class="nav-item-text"><span class="nav-item-title">${esc(it.title)}${it.ext ? icon('arrow-up-right') : ''}</span><span class="nav-item-desc">${esc(it.desc)}</span></span>
  </${tag}>`;
}

function eraJumpHTML() {
  return `<div class="era-jump">${[...ERAS].reverse().map((e) => {
    const c = db.eraCount.get(e.key) || 0;
    return `<a href="#/era/${e.key}" data-era="${e.key}"><span class="era-dot" aria-hidden="true"></span><span class="era-tag">${e.name} <small>${e.years}</small></span><span class="num">${fmtInt(c)}</span></a>`;
  }).join('')}</div>`;
}

function asideHTML(a) {
  if (!a) return '';
  if (a.type === 'eras') {
    return `<aside class="mega-aside"><p class="t-overline">${esc(a.label)}</p>${eraJumpHTML()}<p class="t-caption">${esc(a.note)}</p></aside>`;
  }
  const link = a.link ? `<a class="mega-aside-link" href="${a.link.href}"${a.link.ext ? ' target="_blank" rel="noopener"' : ''}>${esc(a.link.text)}</a>` : '';
  return `<aside class="mega-aside"${a.era ? ` data-era="${a.era}"` : ''}>
    <p class="t-overline">${esc(a.label)}</p>
    ${a.title ? `<p class="mega-aside-title">${esc(a.title)}</p>` : ''}
    <p class="mega-aside-body">${esc(a.body)}</p>${link}</aside>`;
}

function megaHTML(m) {
  return `<div class="mega" id="mega-${m.key}" role="region" aria-label="${m.label}" hidden><div class="mega-scroll">
    <div class="mega-inner">
      <div class="mega-intro">
        <p class="t-overline">${esc(m.intro.overline)}</p>
        <h2 class="mega-title">${esc(m.intro.title)}</h2>
        <p class="mega-body">${esc(m.intro.body)}</p>
        <p class="mega-hint">Or press <kbd class="kbd">⌘K</kbd> and type anything.</p>
      </div>
      ${m.cols.map((col) => `<div class="mega-col">${col.map((g) => `<p class="t-overline">${esc(g.label)}</p>${g.items.map((it) => itemHTML(it)).join('')}`).join('')}</div>`).join('')}
      ${asideHTML(m.aside)}
    </div>
  </div></div>`;
}

// ── Menu sheet (tablet + phone) ───────────────────────────────────────
export function renderMenuSheet() {
  const body = $('#dlg-menu-body');
  body.innerHTML = `
    <p class="mmenu-greet">What are you looking for today?</p>
    <p class="mmenu-sub">Browse by time or kind, learn how RFCs work, or find a way to help.</p>
    <div class="mmenu-groups">
      ${MENUS.map((m, i) => `
        <div class="mmenu-group">
          <button type="button" aria-expanded="${i === 0}" aria-controls="mm-${m.key}" data-mm-toggle>${esc(m.label)}${icon('chevron-down')}</button>
          <div class="mmenu-items" id="mm-${m.key}"${i === 0 ? '' : ' hidden'}>
            ${m.cols.flat().flatMap((g) => g.items).map((it) => itemHTML(it)).join('')}
          </div>
        </div>`).join('')}
    </div>
    <div class="mmenu-eras">
      <p class="t-overline">Jump to an era</p>
      <div class="chips">${ERAS.map((e) => `<a class="chip" href="#/era/${e.key}" data-era="${e.key}"><span class="era-dot"></span>${e.name}<span class="count">${fmtInt(db.eraCount.get(e.key) || 0)}</span></a>`).join('')}</div>
    </div>
    <button class="mmenu-theme" type="button" data-action="theme"><span>Appearance · <span data-theme-label>Light</span></span>${icon('contrast')}</button>`;
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-mm-toggle]');
    if (!t) return;
    const open = t.getAttribute('aria-expanded') !== 'true';
    t.setAttribute('aria-expanded', String(open));
    document.getElementById(t.getAttribute('aria-controls')).hidden = !open;
  });
  syncThemeUI();
}

// ── Legend sheet ──────────────────────────────────────────────────────
export function renderLegendSheet() {
  $('#dlg-legend-body').innerHTML = `<div class="legend-sheet">
    <h3>Color is when</h3>
    <p>Every RFC takes the color of the era it was published in.</p>
    <div class="key-list">${ERAS.map((e) => `<div class="key-row" data-era="${e.key}"><span class="era-dot"></span><span><b>${e.name}</b><em>${e.years} · ${fmtInt(db.eraCount.get(e.key) || 0)}</em><br><span>${esc(e.blurb)}</span></span></div>`).join('')}</div>
    <h3>Shape is what</h3>
    <p>The shape shows its status. Circles are the standards track, filling up as a standard matures.</p>
    <div class="key-list">${KINDS.map((k) => `<div class="key-row"><i class="glyph gl-${k}" aria-hidden="true"></i><span><b>${STATUS[k].label}</b><em>${fmtInt(db.kindCount.get(k) || 0)}</em><br><span>${esc(STATUS[k].blurb)}</span></span></div>`).join('')}</div>
    <h3>Hollow means replaced</h3>
    <div class="key-list"><div class="key-row"><i class="glyph gl-Io" aria-hidden="true"></i><span><b>Obsoleted</b><em>${fmtInt(db.replacedCount)}</em><br><span>A newer RFC supersedes it. It stays in the archive, unchanged, and points to what replaced it.</span></span></div></div>
  </div>`;
}
