// Crock, the archivist. It answers three questions about the RFC in front of you, using only
// what the archive records: does it still hold, what does it stand on, where does it lead.
// “Still holds” comes from the index. “Stands on” is read from the RFC's own References
// section and matched against the index. Nothing here is generated, and nothing is written
// inside the sheet.
import { db, currentVersions, numList, plural } from './data.js';

// ── Does it still hold? ────────────────────────────────────────────────
// Returns the label and a sentence as HTML (its only markup is links to RFC pages).
const yearOf = (nums) => Math.min(...nums.map((n) => db.byN.get(n)?.year || 9999));
const link = (n) => `<a href="#/rfc/${n}">${n}</a>`;
const list = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  if (s.length === 1) return `RFC ${link(s[0])}`;
  return `RFCs ${s.slice(0, -1).map(link).join(', ')} and ${link(s[s.length - 1])}`;
};

export function verdict(r) {
  if (r.obsolete) {
    const now = currentVersions(r).map((s) => s.n);
    const direct = r.obsoletedBy.every((n) => !db.byN.get(n)?.obsolete);
    const read = now.length ? ` Read ${list(now)} instead.` : '';
    return {
      kind: 'replaced', label: 'Replaced',
      html: direct
        ? `${list(r.obsoletedBy)} replaced it in ${yearOf(r.obsoletedBy)}.${read}`
        : `Replaced in ${yearOf(r.obsoletedBy)}, and replaced again since.${read}`,
    };
  }
  if (r.status === 'H') return { kind: 'historic', label: 'Historic', html: 'Kept for the record, and no longer recommended.' };
  if (r.updatedBy.length) {
    return {
      kind: 'updated', label: 'Updated',
      html: `${r.updatedBy.length === 1 ? 'One later RFC updates' : `${r.updatedBy.length} later RFCs update`} it. Read ${plural(r.updatedBy, 'it', 'them')} alongside: ${list(r.updatedBy)}.`,
    };
  }
  return { kind: 'current', label: 'Current', html: 'Nothing has replaced or updated it.' };
}

// ── What does it stand on? ─────────────────────────────────────────────
// A few references nearly every modern RFC carries for its conventions (requirement keywords,
// boilerplate, IANA and security guidance). They count, but they never lead “Built on”.
const CONVENTIONS = new Set([2119, 8174, 7841, 5741, 8126, 5226, 3552, 7322]);

const REF_HEAD = /^(?:(?:\d{1,2}(?:\.\d{1,2})*\.?|[A-Z]\.)\s+)?(?:(Normative|Informative|Other|Additional)\s+)?References?\s*$/i;
const END_REFS = /^(Appendix\b|Acknowledg|Authors?'? Address|Author's Address|Editors?'? Address|Index\s*$|Contributors|Full Copyright|Intellectual Property)/i;
const ENTRY = /^\s{0,8}\[([^\]]{1,40})\]\s*(.*)$/;
const RFC_IN = /\bRFC\s?(\d{1,5})\b/;

// Read an RFC's References: which RFCs it cites, under what label, normative or not.
// Returns null when the text has no references section it can recognise (most RFCs
// from before the mid-1990s cite in passing instead).
export function readReferences(lines, self) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l || /\.\s?\.\s?\./.test(l) || /\s\d+\s*$/.test(l)) continue; // contents entries end in page numbers
    const flush = l[0] !== ' ';
    if (REF_HEAD.test(l.trim()) && (flush || l.trim() === l.trim().toUpperCase())) { start = i; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (lines[i] && lines[i][0] !== ' ' && END_REFS.test(lines[i])) { end = i; break; }

  const entries = [];
  let kind = 'other';
  for (let i = start; i < end; i++) {
    const l = lines[i] || '';
    if (l[0] !== ' ' && REF_HEAD.test(l.trim())) {
      const m = l.trim().match(REF_HEAD);
      if (m[1]) kind = /normative/i.test(m[1]) ? 'normative' : /informative/i.test(m[1]) ? 'informative' : 'other';
      continue;
    }
    const e = l.match(ENTRY);
    if (e) entries.push({ label: e[1], text: e[2], kind });
    else if (entries.length && l.trim()) entries[entries.length - 1].text += ` ${l.trim()}`;
  }
  const byLabel = new Map();
  const cites = new Map(); // n → { n, kind, labels }
  for (const e of entries) {
    const fromLabel = e.label.match(/^RFC\s?(\d{1,5})$/i);
    const m = fromLabel || e.text.match(RFC_IN);
    const n = m ? Number(m[1]) : null;
    if (!n || n === self || !db.byN.get(n)) continue;
    byLabel.set(e.label, n);
    const c = cites.get(n);
    if (c) { if (e.kind === 'normative') c.kind = 'normative'; }
    else cites.set(n, { n, kind: e.kind, uses: 0 });
  }
  return { start, end, byLabel, cites };
}

// The RFC numbers a line of body text cites: [LABEL]s from the References, plus plain “RFC 793”.
export function citesIn(line, refs, self) {
  const out = [];
  let rest = line;
  if (line.includes('[')) {
    rest = line.replace(/\[([^\]\n]{1,40})\]/g, (all, label) => {
      const n = refs?.byLabel.get(label) ?? (/^RFC\s?(\d{1,5})$/i.test(label) ? Number(label.replace(/\D/g, '')) : null);
      if (n && n !== self && db.byN.get(n)) out.push(n);
      return ' ';
    });
  }
  if (rest.includes('RFC')) {
    for (const m of rest.matchAll(/\bRFC\s?(\d{1,5})\b/g)) {
      const n = Number(m[1]);
      if (n !== self && db.byN.get(n)) out.push(n);
    }
  }
  return out;
}

// What the RFC leans on most: normative references first, then how often the text cites them.
export function builtOn(stand) {
  return [...stand.cites.values()]
    .map((c) => ({ ...c, rec: db.byN.get(c.n) }))
    .sort((a, b) => score(b) - score(a) || a.n - b.n);
}
const score = (c) => (CONVENTIONS.has(c.n) ? -1e6 : 0) + (c.kind === 'normative' ? 1e4 : 0) + c.uses;

// Has a cited RFC been replaced since the citing RFC came out?
export function replacedSince(cited, citing) {
  if (!cited.obsolete) return false;
  const when = (r) => r.year * 12 + r.month;
  return cited.obsoletedBy.some((n) => { const s = db.byN.get(n); return s && when(s) > when(citing); });
}

// One line about a cited RFC: how often, and whether it has moved on.
export function citeNote(c, citing, uses, here) {
  const r = c.rec || db.byN.get(c.n);
  const times = uses === 1 ? 'once' : uses === 2 ? 'twice' : `${uses} times`;
  const bits = [uses ? `Cited ${times}${here ? ' here' : ''}` : 'In its references'];
  if (r.obsolete && r.obsoletedBy.includes(citing.n)) {
    bits.push('replaced by this RFC');
  } else if (r.obsolete) {
    const by = r.obsoletedBy;
    bits.push(`${replacedSince(r, citing) ? 'since replaced' : 'replaced'} by ${by.length === 1 ? `RFC ${by[0]}` : `RFCs ${numList(by, 3)}`} in ${yearOf(by)}`);
  } else if (c.kind === 'normative' && !here) {
    bits.push('normative');
  }
  return `${bits.join(' · ')}.`.replace(/^./, (s) => s.toUpperCase());
}

// ── In its own words ───────────────────────────────────────────────────
// The first sentences of the RFC's abstract: the authors' own summary of why it exists.
export function readAbstract(lines) {
  const at = lines.findIndex((l, i) => i < 120 && /^\s{0,3}Abstract\s*$/.test(l));
  if (at < 0) return '';
  const para = [];
  for (let i = at + 1; i < Math.min(lines.length, at + 60); i++) {
    const l = lines[i];
    if (l.includes('\f') || /\[Page \d+\]/.test(l) || /^RFC \d+ /.test(l)) continue; // page breaks
    if (!l.trim()) { if (para.length) break; continue; }
    if (l[0] !== ' ' && para.length) break; // the next heading
    para.push(l.trim());
  }
  // a word hyphenated across lines joins back up (“application-” + “level” → “application-level”)
  const text = para.reduce((s, l) => (s.endsWith('-') ? s + l : s ? `${s} ${l}` : l), '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // a sentence ends at . ! or ? followed by a space and a capital, so “e.g., people” stays whole
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/);
  let out = '';
  for (const s of sentences) {
    if (out && out.length + s.length + 1 > 300) break;
    out = out ? `${out} ${s}` : s;
  }
  out = out.trim();
  return out.length < text.length ? `${out.replace(/[.!?]$/, '')}…` : out;
}
