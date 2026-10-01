// The right-rail timeline, year by year: a dot for every 20 RFCs in the era's colour, newest
// at the top like the list. The last dot in a row holds what's left over, so it's smaller.
// A soft band in the era's colour marks where you are.
import { db, ERAS } from './data.js';

const LABEL_W = 34; // the year column
const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
const nice = (v) => NICE.find((n) => n >= v) || Math.ceil(v / 100) * 100;
const f1 = (v) => Math.round(v * 10) / 10; // one decimal keeps the SVG small
const eraOf = (y) => (ERAS.find((e) => y >= e.from && y <= e.to) || ERAS[ERAS.length - 1]).key;

// a small seeded random, so each dot sits a touch off the grid, the same way every time
function rng(seed) {
  let s = (Math.imul(seed, 2654435761) >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function createTimeline(el) {
  const years = [];
  for (let y = db.maxYear; y >= db.minYear; y--) years.push({ year: y, total: db.yearCount.get(y) || 0, era: eraOf(y) });
  const index = new Map(years.map((yr, i) => [yr.year, i]));
  const extent = []; // where each year's dots end
  let shown = null;
  let at = null;
  let W = 0;
  let H = 0;

  el.innerHTML = `
    <div class="panel-head tl-head"><h2>Year by year</h2><p>How much was written each year.</p></div>
    <p class="tl-now" aria-hidden="true"></p>
    <div class="tl-plot">
      <div class="tl-hover" hidden></div>
      <div class="tl-band"></div>
      <svg class="tl-dots" aria-hidden="true"></svg>
      <span class="tl-here" aria-hidden="true"></span>
      <div class="tl-tip" hidden></div>
    </div>
    <p class="tl-key"></p>`;
  const plot = el.querySelector('.tl-plot');
  const svg = el.querySelector('.tl-dots');
  const band = el.querySelector('.tl-band');
  const here = el.querySelector('.tl-here');
  const hover = el.querySelector('.tl-hover');
  const key = el.querySelector('.tl-key');
  const rowH = () => H / years.length;

  function render() {
    W = plot.clientWidth;
    H = plot.clientHeight;
    if (!W || !H) return;
    const compact = W < 150;
    el.classList.toggle('tl--compact', compact);
    const rh = rowH();
    const x0 = compact ? 3 : LABEL_W;
    const r = Math.max(1.1, Math.min(2.5, rh * 0.25));
    const pitch = r * 2 + Math.max(1.4, Math.min(2.4, r * 0.9));
    const unit = nice(db.maxYearCount / Math.max(1, Math.floor((W - x0 - 2) / pitch)));
    let out = '';
    years.forEach((yr, i) => {
      const rand = rng(yr.year * 7 + 1);
      const s = shown ? (shown.get(yr.year) || 0) : yr.total;
      const full = Math.floor(yr.total / unit);
      const rem = yr.total % unit;
      const n = full + (rem ? 1 : 0);
      const cy = (i + 0.5) * rh;
      let g = '';
      for (let k = 0; k < n; k++) {
        const part = k < full ? 1 : Math.sqrt(rem / unit); // by area
        const rr = Math.max(0.6, r * part * (0.9 + rand() * 0.2));
        const x = x0 + r + k * pitch + (rand() - 0.5) * 0.8;
        const y = cy + (rand() - 0.5) * Math.min(1.2, rh * 0.12);
        g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}"${k * unit >= s ? ' class="is-off"' : ''}/>`;
      }
      out += `<g data-era="${yr.era}">${g}</g>`;
      if (!compact && yr.year % 10 === 0) out += `<text class="tl-yl" data-row="${i}" x="0" y="${f1(cy)}" dy="0.35em">${yr.year}</text>`;
      extent[i] = n ? x0 + 2 * r + (n - 1) * pitch : x0;
    });
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;
    key.innerHTML = `<svg class="tl-key-dot" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3"/></svg>${unit} RFCs; a smaller dot is part of ${unit}. Click or drag to travel.`;
    if (at) place(...at);
  }

  // where you are: the newest and oldest year on screen
  function place(first, last) {
    at = [first, last];
    const i1 = index.get(first);
    const i2 = index.get(last);
    if (!W || i1 == null || i2 == null) return;
    const rh = rowH();
    band.dataset.era = years[i1].era;
    band.style.transform = `translateY(${f1(i1 * rh)}px)`;
    band.style.height = `${f1((i2 - i1 + 1) * rh)}px`;
    here.textContent = first;
    here.style.transform = `translateY(${f1((i1 + 0.5) * rh)}px) translateY(-50%)`;
    // the decade labels next to it step aside
    svg.querySelectorAll('.tl-yl').forEach((t) => t.classList.toggle('is-near', Math.abs(Number(t.dataset.row) - i1) <= 1));
  }

  return {
    plot,
    render,
    place,
    counts(map) { shown = map; render(); },
    yearAt(clientY) {
      const r = plot.getBoundingClientRect();
      const i = Math.min(years.length - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * years.length)));
      return years[i].year;
    },
    // a light band under the year the pointer is on
    hoverYear(y) {
      const i = y == null ? null : index.get(y);
      hover.hidden = i == null;
      if (i == null) return;
      hover.style.transform = `translateY(${f1(i * rowH())}px)`;
      hover.style.height = `${f1(rowH())}px`;
    },
    tipX: (y) => Math.min((extent[index.get(y)] || LABEL_W) + 10, W - 90),
  };
}
