// Search over the RFC index — numbers jump straight to an RFC, words search
// titles, keywords, authors and working groups (and abstracts once loaded).
// Deterministic ranking; no model involved.
import { db, currentVersions, prettyId } from './data.js';

const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'or', 'in', 'on', 'to', 'with', 'by', 'via', 'is', 'are',
  'what', 'how', 'where', 'which', 'who', 'about', 'rfc', 'rfcs', 'from', 'that', 'this', 'into']);

// A few plain-language words people type that the index spells differently.
const SYNONYMS = {
  email: ['mail', 'smtp', 'imap', 'pop3', 'message'],
  mail: ['email', 'smtp'],
  web: ['http', 'www', 'html', 'uri'],
  www: ['http', 'web'],
  website: ['http', 'web'],
  url: ['uri', 'urls'],
  urls: ['uri'],
  dns: ['domain'],
  encryption: ['encrypted', 'encrypting', 'cryptographic', 'tls'],
  crypto: ['cryptographic', 'cryptography'],
  secure: ['security', 'tls'],
  vpn: ['ipsec', 'tunnel', 'tunneling'],
  wifi: ['wireless', '802'],
  time: ['ntp', 'clock', 'timestamp'],
  caching: ['cache', 'caches'],
  cache: ['caching'],
  login: ['authentication', 'auth'],
  password: ['passwords', 'authentication'],
  video: ['rtp', 'media'],
  voip: ['sip', 'rtp', 'voice'],
  chat: ['xmpp', 'irc', 'messaging'],
  json: ['jose', 'jwt'],
};

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
const compact = (s) => norm(s).replace(/[^a-z0-9]/g, '');

function lastName(name) {
  const parts = name.split(/\s+/).filter((p) => p && !/\.$/.test(p) && !/^(jr|sr|2nd|3rd|ii|iii|iv)\.?$/i.test(p));
  return parts.length ? norm(parts[parts.length - 1]) : norm(name);
}

let entries = null;

// How many generations of earlier versions an RFC has (822 → 2822 → 5322 is 2).
// Specifications revised again and again are the core of their area.
const depthMemo = new Map();
function revisionDepth(r, guard = 0) {
  if (depthMemo.has(r.n)) return depthMemo.get(r.n);
  let d = 0;
  if (guard < 12) {
    for (const n of r.obsoletes) {
      const p = db.byN.get(n);
      if (p) d = Math.max(d, 1 + revisionDepth(p, guard + 1));
    }
  }
  depthMemo.set(r.n, d);
  return d;
}

function build() {
  entries = db.list.map((r) => {
    const tw = words(r.title);
    return {
      r,
      t: norm(r.title),
      ini: tw.map((w) => w[0]).join(''), // “Simple Mail Transfer Protocol” → “smtp”
      depth: Math.min(4, revisionDepth(r)),
      tw,
      core: tw.filter((w) => !STOP.has(w) && w.length > 1).length,
      twSet: new Set(tw),
      tc: compact(r.title),
      kw: r.keywords.map(norm),
      kwSet: new Set(r.keywords.flatMap(words)),
      au: r.authors.map((a) => lastName(a.name)),
      wg: r.wg.toLowerCase(),
      ab: null,
    };
  });
}

export function attachAbstracts() {
  if (!entries || !db.abstracts) return;
  entries.forEach((e, i) => { e.ab = db.abstracts[i] ? ` ${norm(db.abstracts[i])} ` : null; });
}

function hasWordPrefix(text, t) {
  let i = text.indexOf(t);
  while (i !== -1) {
    const before = text.charCodeAt(i - 1);
    if (!(before >= 97 && before <= 122) && !(before >= 48 && before <= 57)) return true;
    i = text.indexOf(t, i + 1);
  }
  return false;
}

function tokenScore(e, t) {
  let s = 0;
  if (e.twSet.has(t)) s = 10;
  else if (t.length >= 2 && e.tw.some((w) => w.startsWith(t))) s = 7;
  else if (t.length >= 3 && e.tc.includes(t)) s = 6; // joined forms: “utf8” finds “UTF-8”, “http2” finds “HTTP/2”
  else if (t.length >= 3 && e.t.includes(t)) s = 4;
  if (s < 9) {
    if (e.kw.includes(t)) s = Math.max(s, 9); // a whole keyword, e.g. RFC 5322 is tagged “email”
    else if (e.kwSet.has(t)) s = Math.max(s, 6);
    else if (t.length >= 3 && e.kw.some((k) => k.includes(t))) s = Math.max(s, 3);
  }
  if (t.length >= 3 && e.au.includes(t)) s = Math.max(s, 7);
  if (e.wg && e.wg === t) s = Math.max(s, 6);
  if (s === 0 && e.ab && t.length >= 3 && hasWordPrefix(e.ab, t)) s = 1.5;
  return s;
}

function variants(t) {
  const v = [[t, 1]];
  if (t.length > 3 && t.endsWith('s')) v.push([t.slice(0, -1), 0.95]);
  else if (t.length > 2) v.push([`${t}s`, 0.95]);
  for (const s of SYNONYMS[t] || []) v.push([s, 0.85]);
  return v;
}

const PRIOR = { I: 4, D: 3, P: 2.5, B: 2.5, N: 0.5, E: 0, H: -1.5, U: -1 };

function textSearch(q) {
  if (!entries) build();
  const qn = norm(q).replace(/\be-mail\b/g, 'email').trim();
  const toks = words(qn).filter((t) => !STOP.has(t));
  if (!toks.length) return [];
  const qc = compact(qn);
  const tokVariants = toks.map(variants);
  const out = [];
  for (const e of entries) {
    let sum = 0;
    let inTitle = 0;
    let ok = true;
    for (const vs of tokVariants) {
      let best = 0;
      for (const [t, w] of vs) {
        const s = tokenScore(e, t) * w;
        if (s > best) best = s;
        if (best >= 10) break;
      }
      if (!best) { ok = false; break; }
      if (best >= 5 && vs.some(([t]) => e.twSet.has(t) || e.tc.includes(t))) inTitle++;
      sum += best;
    }
    if (!ok) continue;
    const r = e.r;
    if (e.t === qn) sum += 25;
    else if (toks.length > 1 && e.t.startsWith(qn)) sum += 10;
    else if (toks.length > 1 && e.t.includes(qn)) sum += 8;
    if (qc.length >= 3 && e.tc.includes(qc)) sum += 4;
    // The RFC that spells out or defines an acronym: “smtp” → Simple Mail Transfer Protocol,
    // “tcp” → “Transmission Control Protocol (TCP)”.
    if (toks.length === 1 && /^[a-z]{2,6}$/.test(toks[0])) {
      const a = toks[0];
      if (e.ini === a) sum += 10;
      else if (a.length >= 3 && e.ini.startsWith(a)) sum += 5;
      if (e.t.includes(`(${a})`)) sum += 6;
    }
    sum += 1.2 * e.depth;
    // How much of the title the query covers: “HTTP Caching” beats a long, narrow extension.
    sum += 4 * Math.min(1, inTitle / Math.max(1, e.core));
    // Length as a hint of a core specification (RFC 5322 runs 57 pages; most extensions are short).
    sum += Math.max(-1, Math.min(3, Math.log2(Math.max(1, r.pages) / 12)));
    sum += PRIOR[r.status];
    if (r.obsolete) sum -= 6;
    sum += ((r.year - 1968) / 58) * 2;
    out.push([sum, r]);
  }
  out.sort((a, b) => b[0] - a[0] || b[1].n - a[1].n);
  return out.map((x) => x[1]);
}

const LEARN = [
  { title: 'Status, explained', meta: 'What the shapes mean', action: 'legend', icon: 'info',
    keys: ['status', 'standard', 'standards', 'proposed', 'draft', 'historic', 'experimental', 'informational', 'obsolete', 'obsoleted', 'replaced', 'shape', 'glyph', 'legend', 'color', 'colour', 'era', 'eras'] },
  { title: 'Glossary', meta: 'BCP, STD, errata and more', action: 'glossary', icon: 'hash',
    keys: ['glossary', 'bcp', 'std', 'fyi', 'errata', 'erratum', 'updates', 'updated', 'internet-draft', 'abnf', 'must', 'should', 'stream', 'streams', 'meaning', 'define', 'definition'] },
  { title: 'What is an RFC?', meta: 'rfc-editor.org', href: 'https://www.rfc-editor.org/series/rfc/', icon: 'book', ext: true,
    keys: ['what', 'about', 'series', 'request', 'comments', 'history'] },
  { title: 'Style guide', meta: 'RFC 7322', href: '#/rfc/7322', icon: 'book', keys: ['style', 'guide', 'format', 'formatting', 'writing', 'author', 'authors'] },
  { title: 'FAQ', meta: 'rfc-editor.org', href: 'https://www.rfc-editor.org/series/rfc-faq/', icon: 'help', ext: true, keys: ['faq', 'question', 'questions', 'help'] },
  { title: 'Report an erratum', meta: 'errata.rfc-editor.org', href: 'https://errata.rfc-editor.org/', icon: 'flag', ext: true, keys: ['erratum', 'errata', 'mistake', 'error', 'typo', 'report', 'correction'] },
];

function learnMatches(q) {
  const toks = words(q).filter((t) => t.length >= 3);
  if (!toks.length) return [];
  return LEARN.filter((l) => toks.some((t) => l.keys.some((k) => k === t || (t.length >= 4 && k.startsWith(t))))).slice(0, 2);
}

// Returns grouped results for the dropdown / overlay / full index view.
export function search(raw) {
  const q = raw.trim();
  const res = { q, exact: null, numberRows: [], rfcs: [], total: 0, related: [], years: [], series: null, learn: [], message: null };
  if (!q) return res;

  const num = q.match(/^(?:rfc\s*-?\s*)?0*(\d{1,5})$/i);
  const ser = q.match(/^(std|bcp|fyi)\s*-?\s*0*(\d{1,4})$/i);

  if (ser) {
    const id = `${ser[1].toUpperCase()}${Number(ser[2])}`;
    const members = (db.alsoIndex.get(id) || []).slice().sort((a, b) => b.n - a.n);
    res.series = { id, label: prettyId(id), members };
    res.rfcs = members;
    res.total = members.length;
    if (!members.length) res.message = `${prettyId(id)} isn’t in the index.`;
    return res;
  }

  if (num) {
    const n = Number(num[1]);
    const digits = String(n);
    res.exact = db.byN.get(n) || null;
    if (!res.exact) {
      if (db.notIssued.has(n)) res.message = `RFC ${n} was never issued — the number was set aside.`;
      else if (n > db.newest.n) res.message = `There’s no RFC ${n} yet — the newest is RFC ${db.newest.n}.`;
      else res.message = `There’s no RFC ${n} in the index.`;
    }
    const prefix = [];
    for (const r of db.list) {
      if (r.n !== n && String(r.n).startsWith(digits)) prefix.push(r);
      if (prefix.length >= 40) break;
    }
    prefix.sort((a, b) => a.n - b.n);
    res.numberRows = [res.exact, ...prefix.slice(0, 5)].filter(Boolean);
    if (res.exact) {
      if (res.exact.obsolete) res.related = currentVersions(res.exact).map((r) => ({ rec: r, why: `Current version · ${r.year}` }));
      else if (res.exact.updatedBy.length) res.related = res.exact.updatedBy.map((x) => db.byN.get(x)).filter(Boolean).map((r) => ({ rec: r, why: `Updates it · ${r.year}` }));
    }
    const y = n;
    if (y >= db.minYear && y <= db.maxYear && digits.length === 4) res.years.push({ year: y, count: db.yearCount.get(y) || 0 });
    // A number can also be a word in titles (e.g. "802"); keep text matches as a fallback.
    const text = textSearch(q).filter((r) => !res.numberRows.includes(r));
    res.rfcs = text;
    res.total = text.length;
    return res;
  }

  const found = textSearch(q);
  res.rfcs = found;
  res.total = found.length;
  res.learn = learnMatches(q);
  const top = found[0];
  if (top && top.obsolete) {
    res.related = currentVersions(top).slice(0, 3).map((r) => ({ rec: r, why: `Replaces ${top.n} · ${r.year}` }));
  }
  if (!found.length) res.message = 'Nothing in titles, keywords or authors matches that yet.';
  return res;
}

export function highlight(title, q) {
  const toks = words(q).filter((t) => t.length >= 2 && !STOP.has(t));
  if (!toks.length) return null;
  return toks;
}
