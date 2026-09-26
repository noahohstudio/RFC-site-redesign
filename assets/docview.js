// An RFC page. The canonical .txt is fetched from rfc-editor.org and shown
// byte-for-byte inside the sheet; everything the site adds lives around it.
import {
  db, ERA_BY_KEY, STATUS, esc, fmtInt, monthYear, authorsFull, statusLabel, glyphClass, prettyId, doi,
  rfcUrl, formats, hasTxt, lineage, currentVersions, primaryCurrent, replacementStory, related, relatedQuestion,
  citation, numList, plural, noteFor, factsLine,
} from './data.js';
import { $, $$, icon, mqPhone, navHeight, store, toast } from './ui.js';

const texts = new Map();
let cur = null; // { rec, heads, ctrl }
let headerIO = null;
let rafScroll = 0;
let viewEl;
let barEl;
let tocPanel;

export function init() {
  viewEl = $('#view-doc');
  barEl = $('#docbar');
  tocPanel = document.createElement('div');
  tocPanel.className = 'tocpanel';
  tocPanel.id = 'tocpanel';
  tocPanel.hidden = true;
  tocPanel.setAttribute('role', 'navigation');
  tocPanel.setAttribute('aria-label', 'Contents');
  document.body.append(tocPanel);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { measureHeads(); onScroll(); }, { passive: true });
  document.addEventListener('click', onClick);
  mqPhone.addEventListener('change', () => { if (cur) setFit(true); });
}

export const currentN = () => cur?.rec.n ?? null;

export function onHide() {
  cur?.ctrl?.abort();
  cur = null;
  headerIO?.disconnect();
  barEl.classList.remove('is-on');
  barEl.hidden = true;
  closeToc();
  viewEl.innerHTML = '';
}

export function show(n, section) {
  cur?.ctrl?.abort();
  headerIO?.disconnect();
  closeToc();
  const rec = db.byN.get(n);
  window.scrollTo(0, 0);
  if (!rec) {
    cur = null;
    viewEl.innerHTML = notFoundHTML(n);
    barEl.hidden = true;
    document.title = `RFC ${n} — RFC Editor (redesign concept)`;
    return;
  }
  cur = { rec, heads: [], ctrl: new AbortController(), pendingSection: section };
  document.title = `RFC ${rec.n}: ${rec.title} — RFC Editor (redesign concept)`;
  viewEl.innerHTML = pageHTML(rec);
  renderBar(rec);
  setFit(true);
  headerIO = new IntersectionObserver(([en]) => {
    const on = !en.isIntersecting && en.boundingClientRect.top < 0;
    barEl.classList.toggle('is-on', on);
    $('.doc-shell', viewEl)?.classList.toggle('has-bar', on);
    if (!on) closeToc();
  }, { rootMargin: `-${navHeight()}px 0px 0px 0px` });
  headerIO.observe($('#doc-head', viewEl));
  remember(rec.n);
  loadText(rec);
}

export function scrollToSection(id) {
  if (!cur) return;
  const h = cur.heads.find((x) => x.id === id);
  if (!h) { cur.pendingSection = id; return; }
  const offset = navHeight() + (mqPhone.matches ? 48 : 56) + 16;
  window.scrollTo(0, Math.max(0, h.top - offset));
  closeToc();
}

export function closeToc() {
  if (!tocPanel) return;
  tocPanel.hidden = true;
  $('.docbar-act', barEl)?.setAttribute('aria-expanded', 'false');
}

// ── Page ──────────────────────────────────────────────────────────────
function pageHTML(r) {
  const era = ERA_BY_KEY[r.era];
  const ids = r.also.map((id) => `<span class="docid">${prettyId(id)}</span>`).join('');
  return `
  <div class="shell doc-shell" data-era="${r.era}">
    <aside class="rail toc-rail" aria-label="On this page">
      <div class="toc"><p class="t-overline toc-label">On this page</p><div class="toc-list" id="toc-list"><p class="toc-empty">Reading the contents…</p></div></div>
    </aside>

    <article class="center doc-main" aria-labelledby="doc-title">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="#/">All RFCs</a><span class="sep" aria-hidden="true">/</span>
        <a class="era" href="#/era/${r.era}">${era.name}</a><span class="sep" aria-hidden="true">/</span>
        <a href="#/year/${r.year}">${r.year}</a><span class="sep" aria-hidden="true">/</span>
        <span class="here" aria-current="page">RFC ${r.n}</span>
      </nav>
      <header class="doc-head" id="doc-head">
        <div class="identity">
          <span class="era-tag">${era.name} <small>${era.years}</small></span>
          <span class="status ${glyphClass(r)}"><i class="glyph" aria-hidden="true"></i>${statusLabel(r)}</span>
          ${ids}
        </div>
        <h1 class="doc-title" id="doc-title">${esc(r.title)}</h1>
        <p class="byline">RFC ${r.n} · ${monthYear(r)}${r.authors.length ? ` · ${esc(authorsFull(r))}` : ''}</p>
      </header>
      ${noticesHTML(r)}
      ${noteHTML(r)}
      <section class="sheet" id="sheet" aria-label="RFC ${r.n}, exactly as published">
        <div class="sheet-bar">
          <div class="sheet-prov">${icon('lock')}<span class="sheet-file">rfc${r.n}.txt</span><span class="t-overline">Canonical · unmodified</span></div>
          <div class="sheet-tools">
            ${formats(r).map((f) => (f.ext === 'txt'
              ? `<span class="fmt" aria-current="true">TXT</span>`
              : `<a class="fmt" href="${rfcUrl(r, f.ext)}" target="_blank" rel="noopener" title="Open the ${f.label} edition on rfc-editor.org">${f.label}</a>`)).join('')}
            <a class="sheet-orig" href="${hasTxt(r) ? rfcUrl(r, 'txt') : rfcUrl(r, 'pdf')}" target="_blank" rel="noopener">Original${icon('arrow-up-right')}</a>
            <button class="text-btn sheet-fit" type="button" data-action="fit">Actual size</button>
          </div>
        </div>
        <div class="sheet-body" id="sheet-body">
          <div class="pt-skel" aria-hidden="true"><i style="width:62%"></i><i style="width:48%"></i><i style="width:55%"></i><i style="width:30%"></i><i style="width:74%"></i><i style="width:80%"></i><i style="width:70%"></i><i style="width:40%"></i></div>
          <p class="sr-only" role="status">Loading RFC ${r.n} from rfc-editor.org…</p>
        </div>
        <div class="sheet-foot"><span>Shown byte-for-byte as published by the RFC Editor</span><span class="t-mono-s" id="sheet-hash">sha-256 · …</span></div>
      </section>
      <p class="doc-caption">Everything outside this sheet is added by the site. Nothing inside it is.</p>
    </article>

    <aside class="rail about-rail" aria-label="About this RFC">${aboutHTML(r)}</aside>
  </div>`;
}

function noticesHTML(r) {
  const out = [];
  if (r.obsolete) {
    const primary = primaryCurrent(r) || currentVersions(r)[0];
    out.push(`<div class="callout">${icon('history')}<div class="callout-text"><p class="callout-title">This RFC has been replaced</p><p class="callout-body">${esc(replacementStory(r))} It’s kept here exactly as it was published.</p></div></div>`);
    if (primary) out.push(`<a class="btn btn-secondary" href="#/rfc/${primary.n}">Go to RFC ${primary.n} — the current version${icon('arrow-right')}</a>`);
  } else if (r.updatedBy.length) {
    const ups = r.updatedBy.map((n) => db.byN.get(n)).filter(Boolean);
    const links = ups.slice(0, 6).map((u) => `<a href="#/rfc/${u.n}">RFC ${u.n}</a> (${u.year})`).join(', ');
    out.push(`<div class="callout callout-info">${icon('info')}<div class="callout-text"><p class="callout-title">This RFC has been updated</p><p class="callout-body">Read it together with ${links}${ups.length > 6 ? ` and ${ups.length - 6} more` : ''}. The text below is unchanged.</p></div></div>`);
  }
  return out.length ? `<div class="doc-notices">${out.join('')}</div>` : '';
}

// Crock’s note: why the RFC was written and where it made a difference, in plain words.
// Only well-known RFCs have one; the rest get a line built from the index in the Crock panel.
function noteHTML(r) {
  const n = noteFor(r);
  if (!n) return '';
  return `
      <section class="note" aria-labelledby="note-h">
        <div class="note-label">${icon('compass')}<span class="t-overline">Crock’s note</span><span class="note-tag">Draft</span></div>
        <h2 class="note-q" id="note-h">Why RFC ${r.n} matters</h2>
        <p class="note-p">${esc(n.why)}</p>
        <p class="note-p">${esc(n.where)}</p>
        <p class="note-foot">A short draft written with AI help for this prototype. An editor still needs to review it.</p>
      </section>`;
}

function relLinks(nums) {
  return [...nums].sort((a, b) => a - b).map((n) => `<a href="#/rfc/${n}">${n}</a>`).join(', ');
}

function aboutHTML(r) {
  const also = r.also.map(prettyId);
  const status = `${STATUS[r.status].label}${also.length ? ` · ${also.join(', ')}` : ''}${r.obsolete ? ' · replaced' : ''}`;
  const pub = r.pubStatus !== r.status ? `<br><span class="muted">Published as ${STATUS[r.pubStatus].label}</span>` : '';
  const rows = [
    ['Status', `${status}${pub}`, false],
    ['Published', `${monthYear(r)} · ${r.stream}${r.wg ? ` (${esc(r.wg)})` : ''}${r.pages ? ` · ${r.pages} pages` : ''}`, false],
  ];
  if (r.obsoletedBy.length) rows.push(['Obsoleted by', relLinks(r.obsoletedBy), true]);
  if (r.obsoletes.length) rows.push(['Obsoletes', relLinks(r.obsoletes), true]);
  if (r.updatedBy.length) rows.push(['Updated by', relLinks(r.updatedBy), true]);
  if (r.updates.length) rows.push(['Updates', relLinks(r.updates), true]);
  rows.push(['DOI', doi(r), true]);

  const line = lineage(r);
  const lineageHTML = line.length > 1 ? `
    <section class="about-block" aria-labelledby="lin-h">
      <h2 class="t-overline" id="lin-h">Lineage</h2>
      <div class="lineage">${line.map((s, i) => lineageStep(s, s === r, i === line.length - 1)).join('')}</div>
    </section>` : '';

  const fmts = formats(r);
  const actions = `
    <section class="actions" aria-label="Around this RFC">
      ${r.errata
        ? `<a class="action-row" href="https://www.rfc-editor.org/errata/rfc${r.n}" target="_blank" rel="noopener">Errata${icon('flag')}</a>`
        : `<div class="action-row" aria-disabled="true">No errata reported${icon('flag')}</div>`}
      <button class="action-row" type="button" data-action="cite" data-n="${r.n}">Cite this RFC${icon('copy')}</button>
      <button class="action-row" type="button" data-action="download" aria-expanded="false" aria-controls="dl-${r.n}">Download · ${fmts.map((f) => f.label).slice(0, 3).join(' ')}${icon('download')}</button>
      <div class="action-drop" id="dl-${r.n}" hidden>${fmts.map((f) => `<a class="btn btn-outline btn-sm" href="${rfcUrl(r, f.ext)}" target="_blank" rel="noopener">${f.label}${icon('arrow-up-right')}</a>`).join('')}</div>
    </section>`;

  const rel = related(r);
  const count = rel.length ? `<span class="t-mono-s muted">· ${rel.length} ${rel.length === 1 ? 'pointer' : 'pointers'}</span>` : '';
  const relatedHTML = `
    <section class="related" aria-labelledby="rel-q">
      <div class="related-head">
        <div class="related-label">${icon('compass')}<span class="t-overline">Ask Crock</span>${count}</div>
        ${noteFor(r) ? '' : `<p class="related-lede">${esc(factsLine(r))}</p>`}
        <p class="related-q" id="rel-q">${relatedQuestion(r)}</p>
      </div>
      ${rel.length ? rel.map((p) => `
        <a class="pointer" href="#/rfc/${p.rec.n}" data-era="${p.rec.era}">
          <span class="pointer-body"><span class="pointer-id"><span class="n">${p.rec.n}</span><span class="t">${esc(p.rec.title)}</span></span><span class="pointer-why">${esc(p.why)}</span></span>
          <span class="pointer-trail ${glyphClass(p.rec)}"><i class="glyph" role="img" aria-label="${statusLabel(p.rec)}"></i>${icon('arrow-right')}</span>
        </a>`).join('') : '<p class="related-empty">Nothing in the index points to or from this RFC — it stands on its own.</p>'}
      <p class="related-foot">Pointers come only from what the index records — what replaced, updates or sits alongside this RFC. Named for Steve Crocker, who wrote <a href="#/rfc/1">RFC 1</a> in 1969.</p>
    </section>`;

  return `<div class="about">
    <section class="about-block" aria-labelledby="facts-h">
      <h2 class="t-overline" id="facts-h">About this RFC</h2>
      ${rows.map(([k, v, mono]) => `<div class="meta-row"><span class="t-overline">${k}</span><span class="v${mono ? ' mono' : ''}">${v}</span></div>`).join('')}
    </section>
    ${lineageHTML}
    ${actions}
    ${relatedHTML}
  </div>`;
}

function lineageStep(s, here, last) {
  const status = s.obsolete
    ? `Replaced by ${plural(s.obsoletedBy, 'RFC', 'RFCs')} ${numList(s.obsoletedBy, 4)}`
    : `${STATUS[s.status].label} · current`;
  const inner = `
    <span class="lin-rail" aria-hidden="true"><span class="lin-node"></span>${last ? '' : '<span class="lin-conn"></span>'}</span>
    <span class="lin-text">
      <span class="lin-top"><span class="lin-label">RFC ${s.n} · ${s.year}</span>${here ? '<span class="lin-here">You are here</span>' : ''}</span>
      <span class="lin-title">${esc(s.title)}</span>
      <span class="lin-status">${status}</span>
    </span>`;
  const cls = `lin-step${s.obsolete ? '' : ' is-current'}`;
  return here
    ? `<div class="${cls}" data-era="${s.era}" aria-current="page">${inner}</div>`
    : `<a class="${cls}" href="#/rfc/${s.n}" data-era="${s.era}">${inner}</a>`;
}

function notFoundHTML(n) {
  let msg = `There’s no RFC ${fmtInt(n)} in the index.`;
  if (db.notIssued.has(n)) msg = `RFC ${n} was never issued — the number was set aside and never used.`;
  else if (n > db.newest.n) msg = `There’s no RFC ${n} yet — the newest is <a href="#/rfc/${db.newest.n}">RFC ${db.newest.n}</a>.`;
  return `<div class="shell doc-shell"><div></div><div class="center"><div class="list-empty"><p class="t-overline">RFC ${n}</p><p>${msg}</p><a class="btn btn-outline btn-sm" href="#/">Back to the archive</a></div></div></div>`;
}

// ── Sticky document bar + contents ────────────────────────────────────
function renderBar(r) {
  const also = r.also.map(prettyId);
  barEl.hidden = false;
  barEl.classList.remove('is-on');
  barEl.innerHTML = `
    <div class="docbar-cur" data-era="${r.era}">
      <span class="docbar-num">${r.n}</span>
      <span class="docbar-body"><span class="docbar-over">${STATUS[r.status].label}${also.length ? ` · ${also.join(' · ')}` : ''}${r.obsolete ? ' · Replaced' : ''} · ${ERA_BY_KEY[r.era].name} era</span><span class="docbar-title">${esc(r.title)}</span></span>
      <span class="${glyphClass(r)}"><i class="glyph" aria-hidden="true"></i></span>
    </div>
    <button class="docbar-act" type="button" aria-expanded="false" aria-controls="tocpanel" data-action="toc"><span>Contents</span>${icon('chevron-down')}</button>`;
}

function tocHTML(heads, currentId) {
  if (!heads.length) return '<p class="toc-empty">This RFC has no numbered sections to list — scroll the sheet.</p>';
  const cur1 = currentId ? currentId.split('.')[0] : null;
  const tops = new Set(heads.filter((h) => h.level === 1).map((h) => h.id));
  // Level 2 shows under the section you're reading — or always, when the RFC has no level-1 headings for it.
  return heads
    .filter((h) => h.level === 1 || (h.level === 2 && (h.id.split('.')[0] === cur1 || !tops.has(h.id.split('.')[0]))))
    .map((h) => `<a class="toc-item${h.level === 2 && tops.has(h.id.split('.')[0]) ? ' lvl2' : ''}" href="#/rfc/${cur.rec.n}/s/${h.id}" data-sec="${h.id}"${h.id === currentId ? ' aria-current="true"' : ''}><span class="n">${h.num}</span><span>${esc(tocTitle(h.title))}</span></a>`)
    .join('');
}

function renderToc(currentId) {
  if (!cur) return;
  const list = $('#toc-list', viewEl);
  if (list) list.innerHTML = tocHTML(cur.heads, currentId);
  if (!tocPanel.hidden) tocPanel.innerHTML = `<div class="toc-list">${tocHTML(cur.heads, currentId)}</div>`;
  cur.currentId = currentId;
  // keep the section being read visible inside the (scrollable) contents rail
  const box = $('.toc', viewEl);
  const el = box && $('.toc-item[aria-current="true"]', box);
  if (el && box.scrollHeight > box.clientHeight) {
    const b = box.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    if (c.top < b.top + 32) box.scrollTop -= b.top + 32 - c.top;
    else if (c.bottom > b.bottom - 32) box.scrollTop += c.bottom - (b.bottom - 32);
  }
}

function toggleToc() {
  const btn = $('.docbar-act', barEl);
  if (!tocPanel.hidden) { closeToc(); return; }
  tocPanel.innerHTML = `<div class="toc-list">${cur ? tocHTML(cur.heads, cur.currentId) : ''}</div>`;
  tocPanel.hidden = false;
  btn?.setAttribute('aria-expanded', 'true');
  $('[aria-current="true"]', tocPanel)?.scrollIntoView({ block: 'center' });
}

// ── Text ──────────────────────────────────────────────────────────────
async function loadText(rec) {
  const body = $('#sheet-body', viewEl);
  if (!hasTxt(rec)) {
    body.innerHTML = `<div class="pt-msg"><p><b>RFC ${rec.n} was never typed up as plain text.</b> It survives as a scanned PDF, kept as it was.</p><a class="btn btn-outline btn-sm" href="${rfcUrl(rec, 'pdf')}" target="_blank" rel="noopener">Open the PDF${icon('arrow-up-right')}</a></div>`;
    $('#sheet-hash', viewEl).textContent = 'pdf only';
    $('.sheet-file', viewEl).textContent = `rfc${rec.n}.pdf`;
    renderToc(null);
    return;
  }
  const mine = cur;
  try {
    let t = texts.get(rec.n);
    if (!t) {
      const res = await fetch(rfcUrl(rec, 'txt'), { signal: mine.ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      t = { text: new TextDecoder('utf-8').decode(buf), hash: await sha256(buf) };
      texts.set(rec.n, t);
    }
    if (cur !== mine) return;
    renderText(rec, t);
  } catch (err) {
    if (err.name === 'AbortError' || cur !== mine) return;
    body.innerHTML = `<div class="pt-msg"><p><b>We couldn’t load rfc${rec.n}.txt from rfc-editor.org.</b> Check your connection — or read it on the RFC Editor’s own site.</p><a class="btn btn-outline btn-sm" href="${rfcUrl(rec, 'txt')}" target="_blank" rel="noopener">Open the original${icon('arrow-up-right')}</a></div>`;
    renderToc(null);
  }
}

async function sha256(buf) {
  try {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

const H_RE = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s{1,5}(\S.{0,78})$/;
const APX_RE = /^Appendix\s+([A-Z])\.?\s{1,5}(\S.{0,70})$/;
// Early RFCs (e.g. RFC 791) centre their top-level headings in capitals: “   1.  INTRODUCTION”
const CENTRED_RE = /^\s{8,}(\d{1,2})\.\s{1,4}([A-Z][A-Z0-9 ,&'/()-]{2,60})\s*$/;
const blank = (s) => s === undefined || s.trim() === '' || s.includes('\f');
// A heading’s title for the contents list: text before any wide gap (“MUST   This word…” → “MUST”)
const tocTitle = (t) => t.split(/\s{2,}/)[0].replace(/\.$/, '');

function headingOf(line, prev, next, lastTop) {
  if (!line || line.length > 80) return null;
  if (/\.\s?\.\s?\./.test(line) || /\s{2,}\d+\s*$/.test(line) || /\[Page \d+\]/.test(line)) return null;
  if (!blank(prev) && !blank(next)) return null;
  if (line[0] === ' ') {
    const c = line.match(CENTRED_RE);
    if (!c) return null;
    const top = Number(c[1]);
    if (top < lastTop || top > lastTop + 3) return null;
    return { id: c[1], num: c[1], title: c[2].trim(), level: 1 };
  }
  let m = line.match(H_RE);
  if (m) {
    const num = m[1];
    const title = m[2].trim();
    if (!/[A-Za-z]{2}/.test(title)) return null;
    const top = Number(num.split('.')[0]);
    if (top < lastTop || top > lastTop + 3) return null;
    return { id: num, num, title, level: num.split('.').length };
  }
  m = line.match(APX_RE);
  if (m) return { id: `A-${m[1]}`, num: m[1], title: m[2].trim(), level: 1, appendix: true };
  return null;
}

function renderText(rec, { text, hash }) {
  const body = $('#sheet-body', viewEl);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const heads = [];
  const seen = new Set();
  let lastTop = 0;
  let inAppendix = false;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let pb = '';
    if (line.includes('\f')) { pb = '<span class="pt-pb" aria-hidden="true"></span>'; line = line.replace(/\f/g, ''); }
    const h = !inAppendix || /^Appendix/.test(line) ? headingOf(line, lines[i - 1], lines[i + 1], lastTop) : null;
    if (h && !seen.has(h.id)) {
      seen.add(h.id);
      if (h.appendix) inAppendix = true; else lastTop = Number(h.id.split('.')[0]);
      heads.push(h);
      out.push(`${pb}<span class="pt-h" id="s-${h.id}">${esc(line)}</span>`);
    } else {
      out.push(pb + esc(line));
    }
  }
  body.innerHTML = `<pre class="pt">${out.join('\n')}</pre>`;
  const hashEl = $('#sheet-hash', viewEl);
  if (hash) { hashEl.textContent = `sha-256 · ${hash.slice(0, 8)}…${hash.slice(-4)}`; hashEl.title = `SHA-256 of rfc${rec.n}.txt as fetched from rfc-editor.org: ${hash}`; }
  else hashEl.textContent = 'as fetched from rfc-editor.org';
  cur.heads = heads;
  measureHeads();
  renderToc(heads[0]?.id ?? null);
  if (cur.pendingSection) { const s = cur.pendingSection; cur.pendingSection = null; requestAnimationFrame(() => scrollToSection(s)); }
  onScroll();
}

function measureHeads() {
  if (!cur?.heads.length) return;
  for (const h of cur.heads) {
    const el = document.getElementById(`s-${h.id}`);
    h.top = el ? el.getBoundingClientRect().top + window.scrollY : 0;
  }
}

function onScroll() {
  if (rafScroll || !cur?.heads.length) return;
  rafScroll = requestAnimationFrame(() => {
    rafScroll = 0;
    if (!cur) return;
    const y = window.scrollY + navHeight() + 56 + 40;
    let current = cur.heads[0];
    for (const h of cur.heads) { if (h.top <= y) current = h; else break; }
    if (current && current.id !== cur.currentId) renderToc(current.id);
  });
}

// The sheet always fits its 72 columns to the width available; on phones the
// reader can switch to “Actual size” (14px) and scroll the sheet sideways.
function setFit(fit) {
  const sheet = $('#sheet', viewEl);
  if (!sheet) return;
  sheet.classList.toggle('is-actual', !fit);
  const b = $('.sheet-fit', sheet);
  if (b) b.textContent = fit ? 'Actual size' : 'Fit width';
  requestAnimationFrame(measureHeads);
}

// ── Actions ───────────────────────────────────────────────────────────
function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (t && cur) {
    const a = t.dataset.action;
    if (a === 'toc') { e.preventDefault(); toggleToc(); return; }
    if (a === 'fit') { setFit($('#sheet', viewEl).classList.contains('is-actual')); return; }
    if (a === 'cite') { copyCitation(cur.rec); return; }
    if (a === 'download') {
      const drop = document.getElementById(t.getAttribute('aria-controls'));
      const open = drop.hidden;
      drop.hidden = !open;
      t.setAttribute('aria-expanded', String(open));
      return;
    }
  }
  const sec = e.target.closest('a[data-sec]');
  if (sec && cur) {
    e.preventDefault();
    history.replaceState(null, '', sec.getAttribute('href'));
    scrollToSection(sec.dataset.sec);
    return;
  }
  if (!tocPanel.hidden && !e.target.closest('#tocpanel, .docbar-act')) closeToc();
}

async function copyCitation(r) {
  const text = citation(r);
  try {
    await navigator.clipboard.writeText(text);
    toast('Citation copied');
  } catch {
    window.prompt('Copy this citation:', text);
  }
}

function remember(n) {
  const list = (store.get('rfc-recent') || '').split(',').map(Number).filter((x) => x && x !== n);
  list.unshift(n);
  store.set('rfc-recent', list.slice(0, 6).join(','));
}
