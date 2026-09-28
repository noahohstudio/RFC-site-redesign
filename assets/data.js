// Data model for the prototype. Everything comes from data/rfc-index.json,
// which tools/build-data.py generates from https://www.rfc-editor.org/rfc-index.xml.

export const ERAS = [
  { key: 'present', name: 'Present', from: 2020, to: 9999, years: '2020–today',
    blurb: 'QUIC, HTTP/3 and a consolidated HTTP core — and the numbering passes 10,000.' },
  { key: 'encryption', name: 'Encryption', from: 2010, to: 2019, years: '2010–2019',
    blurb: 'Pervasive monitoring is declared an attack (RFC 7258); TLS 1.3 and HTTP/2 follow.' },
  { key: 'scale', name: 'Scale', from: 2000, to: 2009, years: '2000–2009',
    blurb: 'The internet becomes infrastructure: voice over SIP, a new URI syntax, DNSSEC and TLS 1.2.' },
  { key: 'web', name: 'The Web', from: 1991, to: 1999, years: '1991–1999',
    blurb: 'HTTP and URLs arrive, the internet goes commercial, and the standards process is written down.' },
  { key: 'internetworking', name: 'Internetworking', from: 1983, to: 1990, years: '1983–1990',
    blurb: 'TCP/IP becomes the standard on 1 January 1983; DNS arrives, and the IETF first meets in 1986.' },
  { key: 'arpanet', name: 'ARPANET', from: 0, to: 1982, years: '1969–1982',
    blurb: 'A research network writes its first protocols — from Host Software to IP and TCP.' },
];
export const ERA_BY_KEY = Object.fromEntries(ERAS.map((e) => [e.key, e]));
export const eraOf = (year) => ERAS.find((e) => year >= e.from && year <= e.to);

export const STATUS = {
  I: { label: 'Internet Standard', short: 'Internet Std', blurb: 'Mature and widely used; it gets an STD number.' },
  D: { label: 'Draft Standard', short: 'Draft Std', blurb: 'A middle step on the standards track, retired in 2011 (RFC 6410).' },
  P: { label: 'Proposed Standard', short: 'Proposed Std', blurb: 'The first step on the standards track.' },
  B: { label: 'Best Current Practice', short: 'BCP', blurb: 'How to run and operate things.' },
  N: { label: 'Informational', short: 'Informational', blurb: 'Shared for information; not a standard.' },
  E: { label: 'Experimental', short: 'Experimental', blurb: 'A trial, published to learn from.' },
  H: { label: 'Historic', short: 'Historic', blurb: 'No longer recommended for use.' },
  U: { label: 'Unknown', short: 'Unknown', blurb: 'Early RFCs, from before statuses were recorded.' },
};
export const KINDS = ['I', 'D', 'P', 'B', 'N', 'E', 'H', 'U'];

export const STREAMS = [
  { key: 'IETF', name: 'IETF', blurb: 'The Internet Engineering Task Force' },
  { key: 'Legacy', name: 'Legacy', blurb: 'Early RFCs, from before streams existed' },
  { key: 'Independent', name: 'Independent', blurb: 'Independent Submissions, edited by the ISE' },
  { key: 'IAB', name: 'IAB', blurb: 'The Internet Architecture Board' },
  { key: 'IRTF', name: 'IRTF', blurb: 'The Internet Research Task Force' },
  { key: 'Editorial', name: 'Editorial', blurb: 'The RFC Series’ own editorial stream' },
];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The build this page was loaded as (tools/stamp.py writes it into index.html). Data
// files carry it too, so a new deploy is never served from a stale cache.
export const BUILD = document.querySelector('meta[name="build"]')?.content || 'dev';
const versioned = (url) => (BUILD === 'dev' ? url : `${url}?v=${BUILD}`);
const FMT = [['TXT', 1, 'txt'], ['HTML', 2, 'html'], ['PDF', 4, 'pdf'], ['XML', 8, 'xml']];

export const db = {
  list: [], // ascending by number
  byN: new Map(),
  years: [], // descending: [{ year, era, recs: [...] (number desc) }]
  yearCount: new Map(),
  eraCount: new Map(),
  kindCount: new Map(),
  streamCount: new Map(),
  replacedCount: 0,
  errataCount: 0,
  alsoIndex: new Map(), // 'STD97' -> [rec]
  notIssued: new Set(),
  maxYear: 0,
  minYear: 0,
  maxYearCount: 0,
  newest: null,
  generated: '',
  abstracts: null,
  notes: {}, // Crock’s notes, keyed by RFC number (data/notes.json)
};

export async function loadIndex() {
  const res = await fetch(versioned('data/rfc-index.json'));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  db.generated = json.generated;
  db.notIssued = new Set(json.notIssued || []);
  const byYear = new Map();
  json.rfcs.forEach((a, i) => {
    const r = normalize(a, i);
    db.list.push(r);
    db.byN.set(r.n, r);
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r);
    bump(db.yearCount, r.year);
    bump(db.eraCount, r.era);
    bump(db.kindCount, r.status);
    bump(db.streamCount, r.stream);
    if (r.obsolete) db.replacedCount++;
    if (r.errata) db.errataCount++;
    for (const id of r.also) {
      if (!db.alsoIndex.has(id)) db.alsoIndex.set(id, []);
      db.alsoIndex.get(id).push(r);
    }
  });
  const years = [...byYear.keys()].sort((a, b) => b - a);
  db.years = years.map((year) => ({ year, era: eraOf(year).key, recs: byYear.get(year).sort((a, b) => b.n - a.n) }));
  db.maxYear = years[0];
  db.minYear = years[years.length - 1];
  db.maxYearCount = Math.max(...db.yearCount.values());
  db.newest = db.list.reduce((a, b) => (b.n > a.n ? b : a));
  return db;
}

export async function loadAbstracts() {
  if (db.abstracts) return db.abstracts;
  const res = await fetch(versioned('data/abstracts.json'));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  db.abstracts = json.abstracts;
  return db.abstracts;
}

// Crock’s notes: short, plain-language overviews of well-known RFCs, drafted
// with AI help for the prototype (see the "about" line in data/notes.json).
export async function loadNotes() {
  const res = await fetch(versioned('data/notes.json'));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  db.notes = json.notes || {};
  return db.notes;
}

function bump(map, key) { map.set(key, (map.get(key) || 0) + 1); }

function normalize(a, idx) {
  const [n, title, authors, ym, status, pubStatus, stream, wg, errata, obsoletes, obsoletedBy, updates, updatedBy, also, pages, keywords, formats, area] = a;
  const year = Math.floor(ym / 100);
  return {
    idx, n, title, year, month: ym % 100, status, pubStatus, stream, wg, area,
    authors: authors ? authors.split('|').map((s) => ({ name: s.replace(/\*$/, ''), ed: s.endsWith('*') })) : [],
    errata: !!errata, obsoletes, obsoletedBy, updates, updatedBy, also, pages, formats,
    keywords: keywords ? keywords.split('|') : [],
    era: eraOf(year).key,
    obsolete: obsoletedBy.length > 0,
  };
}

// ── Formatting ─────────────────────────────────────────────────────────
export const fmtInt = (n) => n.toLocaleString('en-US');
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const monthYear = (r) => `${MONTHS[r.month - 1]} ${r.year}`;
export const monthYearShort = (r) => `${MONTHS[r.month - 1].slice(0, 3)} ${r.year}`;
export const prettyId = (id) => id.replace(/^([A-Z]+)0*(\d+)$/, '$1 $2');
export const doi = (r) => `10.17487/RFC${String(r.n).padStart(4, '0')}`;
export const statusLabel = (r) => STATUS[r.status].label + (r.obsolete ? ' · Obsoleted' : '');
export const glyphClass = (r) => `gl-${r.status}${r.obsolete ? 'o' : ''}`;
export const rfcUrl = (r, ext) => `https://www.rfc-editor.org/rfc/rfc${r.n}.${ext}`;
export const infoUrl = (r) => `https://www.rfc-editor.org/info/rfc${r.n}`;
export const formats = (r) => FMT.filter(([, bit]) => r.formats & bit).map(([label, , ext]) => ({ label, ext }));
export const hasTxt = (r) => (r.formats & 1) === 1;

export function authorsShort(r) {
  const a = r.authors;
  if (!a.length) return '';
  if (a.length === 1) return a[0].name;
  if (a.length === 2) return `${a[0].name}, ${a[1].name}`;
  return `${a[0].name} et al.`;
}

export function authorsFull(r) {
  const a = r.authors;
  if (!a.length) return '';
  if (a.length > 4) return `${a[0].name} et al. (${a.length} authors)`;
  const allEd = a.every((x) => x.ed);
  if (allEd) return `${a.map((x) => x.name).join(', ')} (${a.length > 1 ? 'Eds.' : 'Ed.'})`;
  return a.map((x) => x.name + (x.ed ? ', Ed.' : '')).join(', ');
}

// Compress [7230,7231,…,7235] into "7230–7235"; keeps at most `max` pieces.
export function numList(nums, max = 99) {
  const s = [...nums].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j - i >= 2 ? `${s[i]}–${s[j]}` : j === i ? `${s[i]}` : `${s[i]}, ${s[j]}`);
    i = j;
  }
  const flat = parts.join(', ').split(', ');
  if (flat.length <= max) return flat.join(', ');
  return `${flat.slice(0, max).join(', ')} +${flat.length - max}`;
}
export const plural = (nums, one, many) => (nums.length === 1 ? one : many);

export function relationLine(r) {
  const bits = [];
  if (r.obsoletedBy.length) bits.push(`Replaced by ${numList(r.obsoletedBy, 3)}`);
  if (r.updatedBy.length) bits.push(`Updated by ${numList(r.updatedBy, 3)}`);
  if (r.obsoletes.length) bits.push(`Replaces ${numList(r.obsoletes, 3)}`);
  if (r.updates.length) bits.push(`Updates ${numList(r.updates, 3)}`);
  if (r.errata) bits.push('Errata');
  return bits.join(' · ');
}

// ── Lineage (obsoletes / obsoleted-by chains) ──────────────────────────
const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'in', 'on', 'to', 'with', 'by', 'via', 'using', 'rfc']);
const titleWords = (t) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));

function pickClosest(cands, ...refs) {
  const refWords = refs.map((r) => titleWords(r.title));
  let best = null;
  let bestScore = -1;
  for (const c of cands) {
    const w = titleWords(c.title);
    let score = 0;
    for (const rw of refWords) for (const x of w) if (rw.has(x)) score++;
    score += w.size ? 0.01 / w.size : 0;
    if (score > bestScore || (score === bestScore && c.n < best.n)) { best = c; bestScore = score; }
  }
  return best;
}

const shared = (a, b) => { const w = titleWords(b.title); let s = 0; for (const x of titleWords(a.title)) if (w.has(x)) s++; return s; };

export function lineage(rec) {
  const seen = new Set([rec.n]);
  const back = [];
  let cur = rec;
  while (cur.obsoletes.length && back.length < 8) {
    const cands = cur.obsoletes.map((n) => db.byN.get(n)).filter((r) => r && !seen.has(r.n));
    if (!cands.length) break;
    const pick = pickClosest(cands, rec, cur);
    seen.add(pick.n);
    back.unshift(pick);
    cur = pick;
  }
  // Forward: walk towards the primary current version, through the most similar titles.
  const target = rec.obsolete ? primaryCurrent(rec) : null;
  const fwd = target ? pathTo(rec, target) : [];
  return [...back, rec, ...fwd.slice(0, 8)];
}

function pathTo(rec, target) {
  const prev = new Map();
  const seen = new Set([rec.n]);
  const queue = [rec];
  while (queue.length) {
    const cur = queue.shift();
    if (cur.n === target.n) break;
    const next = cur.obsoletedBy.map((n) => db.byN.get(n)).filter((s) => s && !seen.has(s.n));
    next.sort((a, b) => shared(b, target) - shared(a, target) || a.n - b.n);
    for (const s of next) { seen.add(s.n); prev.set(s.n, cur); queue.push(s); }
  }
  if (!prev.has(target.n)) return [];
  const path = [];
  for (let x = target; x && x.n !== rec.n; x = prev.get(x.n)) path.unshift(x);
  return path;
}

// Of all current versions, the one that took over most of what replaced this RFC
// (RFC 2616 → 9110, which replaced five of 2616’s six successors).
export function primaryCurrent(rec) {
  const leaves = currentVersions(rec);
  if (leaves.length <= 1) return leaves[0] || null;
  const between = new Set([rec.n]);
  const stack = [rec];
  while (stack.length) {
    for (const n of stack.pop().obsoletedBy) {
      if (between.has(n)) continue;
      between.add(n);
      const s = db.byN.get(n);
      if (s) stack.push(s);
    }
  }
  let best = null;
  let bestScore = -1;
  for (const l of leaves) {
    const score = l.obsoletes.filter((n) => between.has(n)).length + shared(l, rec) * 0.01;
    if (score > bestScore) { best = l; bestScore = score; }
  }
  return best;
}

// Every current (not obsoleted) RFC reachable through obsoleted-by links.
export function currentVersions(rec) {
  const out = new Map();
  const seen = new Set([rec.n]);
  const walk = (r, depth) => {
    for (const n of r.obsoletedBy) {
      const s = db.byN.get(n);
      if (!s || seen.has(n) || depth > 12) continue;
      seen.add(n);
      if (s.obsolete) walk(s, depth + 1);
      else out.set(n, s);
    }
  };
  walk(rec, 0);
  return [...out.values()].sort((a, b) => a.n - b.n);
}

// “RFC 2616 was replaced by RFCs 7230–7235 in 2014, and those by RFCs 9110–9112 in 2022.”
export function replacementStory(rec) {
  const gens = [];
  let frontier = [rec];
  const seen = new Set([rec.n]);
  while (gens.length < 3) {
    const next = [];
    for (const r of frontier) for (const n of r.obsoletedBy) {
      const s = db.byN.get(n);
      if (s && !seen.has(n)) { seen.add(n); next.push(s); }
    }
    if (!next.length) break;
    gens.push(next);
    if (!next.some((s) => s.obsolete)) break;
    frontier = next.filter((s) => s.obsolete);
  }
  const phrase = (g) => {
    const nums = g.map((s) => s.n);
    const years = [...new Set(g.map((s) => s.year))].sort();
    const when = years.length === 1 ? `in ${years[0]}` : `between ${years[0]} and ${years[years.length - 1]}`;
    return `${plural(nums, 'RFC', 'RFCs')} ${numList(nums)} ${when}`;
  };
  if (!gens.length) return '';
  let s = `RFC ${rec.n} was replaced by ${phrase(gens[0])}`;
  if (gens[1]) s += `, and ${gens[0].length > 1 ? 'those' : 'that'} by ${phrase(gens[1])}`;
  if (gens[2]) s += `, then by ${phrase(gens[2])}`;
  return `${s}.`;
}

// Crock's pointers (“Ask Crock”, named for Steve Crocker, who wrote RFC 1):
// no model — only relations recorded in the index.
export function related(rec, limit = 5) {
  const out = [];
  const seen = new Set([rec.n]);
  const add = (r, why) => {
    if (!r || seen.has(r.n) || out.length >= limit) return;
    seen.add(r.n);
    out.push({ rec: r, why });
  };
  if (rec.obsolete) {
    const primary = primaryCurrent(rec);
    const leaves = currentVersions(rec).sort((a, b) => (b === primary) - (a === primary) || a.n - b.n);
    for (const c of leaves) {
      const ids = c.also.map(prettyId).join(', ');
      add(c, `Current version — ${STATUS[c.status].label}${ids ? `, ${ids}` : ''} (${c.year}).`);
    }
    for (const n of rec.obsoletedBy) {
      const s = db.byN.get(n);
      add(s, s?.obsolete ? `Replaced this RFC in ${s.year}; since replaced itself.` : `Replaced this RFC in ${s?.year}.`);
    }
  }
  for (const n of [...rec.updatedBy].sort((a, b) => b - a)) { const s = db.byN.get(n); add(s, `Updates this RFC (${s?.year}).`); }
  if (rec.wg) {
    const sibs = db.list.filter((r) => r.wg === rec.wg && r.year === rec.year && r.month === rec.month && r.n !== rec.n && !r.obsolete);
    for (const s of sibs.slice(0, 3)) add(s, `Published alongside it by ${rec.wg}, ${monthYear(s)}.`);
  }
  for (const id of rec.also) for (const s of db.alsoIndex.get(id) || []) add(s, `Also part of ${prettyId(id)}.`);
  for (const n of rec.updates) { const s = db.byN.get(n); add(s, `This RFC updates it.`); }
  for (const n of rec.obsoletes) { const s = db.byN.get(n); add(s, `Earlier version, replaced by this RFC.`); }
  return out;
}

export function relatedQuestion(rec) {
  if (rec.obsolete) return `What replaced RFC ${rec.n}?`;
  return `Read next from RFC ${rec.n}`;
}

export const noteFor = (rec) => db.notes[String(rec.n)] || null;

// For RFCs without a note: one friendly sentence or two, built only from the index.
// “A Best Current Practice from July 2007, from the avt working group (BCP 131).
//  Nothing has replaced or updated it — it still stands as written.”
const KIND_PHRASE = {
  I: 'An Internet Standard', D: 'A Draft Standard', P: 'A Proposed Standard', B: 'A Best Current Practice',
  N: 'An Informational RFC', E: 'An Experimental RFC', H: 'A Historic RFC',
};
const SOURCE_PHRASE = {
  IETF: ', from the IETF', IAB: ', from the Internet Architecture Board', IRTF: ', from the Internet Research Task Force',
  Independent: ', published as an independent submission', Editorial: ', from the RFC Series’ editorial stream',
};
export function factsLine(rec) {
  const when = monthYear(rec);
  const source = rec.wg ? `, from the ${rec.wg} working group` : SOURCE_PHRASE[rec.stream] || '';
  const series = rec.also.filter((id) => /^(STD|BCP|FYI)/.test(id)).map(prettyId);
  const head = rec.status === 'U'
    ? `One of the early RFCs, from ${when}, before statuses were recorded`
    : `${KIND_PHRASE[rec.status]} from ${when}${source}`;
  let s = `${head}${series.length ? ` (${series.join(', ')})` : ''}.`;
  if (rec.obsoletes.length) s += ` It replaced ${plural(rec.obsoletes, 'RFC', 'RFCs')} ${numList(rec.obsoletes, 3)}.`;
  if (rec.obsolete) {
    const first = Math.min(...rec.obsoletedBy.map((n) => db.byN.get(n)?.year || 9999));
    s += ` It was itself replaced in ${first}.`;
  } else if (rec.updatedBy.length) {
    s += rec.updatedBy.length === 1 ? ' One later RFC updates it, so read the two together.' : ` ${rec.updatedBy.length} later RFCs update it, so read them together.`;
  } else {
    s += ' Nothing has replaced or updated it — it still stands as written.';
  }
  return s;
}

// RFC Editor citation format, e.g.
// Fielding, R., Ed., Nottingham, M., Ed., and J. Reschke, Ed., "HTTP Semantics", STD 97, RFC 9110, DOI 10.17487/RFC9110, June 2022, <https://www.rfc-editor.org/info/rfc9110>.
export function citation(r) {
  const names = r.authors.map((a, i) => {
    const m = a.name.match(/^((?:[A-Z][a-z]*\.?[- ]?)+)\s+(.+)$/);
    const [initials, last] = m ? [m[1].trim(), m[2]] : ['', a.name];
    const ed = a.ed ? ', Ed.' : '';
    if (i > 0 && i === r.authors.length - 1) return `and ${initials ? `${initials} ` : ''}${last}${ed}`;
    return `${last}${initials ? `, ${initials}` : ''}${ed}`;
  });
  const who = names.length > 2 ? names.join(', ') : names.join(' ');
  const series = r.also.filter((id) => /^(STD|BCP|FYI)/.test(id)).map(prettyId);
  return `${who ? `${who}, ` : ''}"${r.title}", ${series.length ? `${series.join(', ')}, ` : ''}RFC ${r.n}, DOI ${doi(r)}, ${monthYear(r)}, <${infoUrl(r)}>.`;
}
