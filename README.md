# RFC Editor redesign — responsive prototype

An unofficial, hi-fi prototype of the RFC Editor redesign (Figma file `d4ODFIKoRq0pxCiRKuAPNm`, design system v0.3).
It runs on the real RFC index — all 9,842 RFCs as of 24 September 2026 — and shows every RFC exactly as published,
fetched live from rfc-editor.org. No build step, no framework, no AI model.

**Live:** https://noahohstudio.github.io/RFC-site-redesign/

## Put it on GitHub Pages

1. Create a new repository on GitHub (public).
2. Upload **the contents of this folder** (`index.html`, `assets/`, `data/`, `tools/`, `.nojekyll`, this README) to the repository root.
   The GitHub web uploader takes folders by drag and drop; the largest file is `data/abstracts.json` at 4 MB.
3. In the repository: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`** → Save.
   After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

It also works on any static host (Cloudflare Pages, Netlify drop, etc.): serve the folder as-is.
On Vercel, import the repository with the Framework Preset set to “Other”, no build command, and the root as the output directory.

## Deploying changes

Before each commit, stamp a build:

```bash
python3 tools/stamp.py
```

It puts a build stamp into `index.html` (shown in the footer) and into `data/version.json`. Every script, stylesheet
and data file is then requested with `?v=<build>`, so a deploy is never served from a stale cache. A tab left open on
an older build offers a reload when you come back to it.

To check smoothness in a real browser, add `?perf` to the address, before the `#`
(e.g. `…/RFC-site-redesign/?perf#/`). A small meter then shows frames per second, the slowest recent frame and how
many library rows exist.

## Run it locally

Opening `index.html` straight from disk won't work, because browsers block `fetch()` for local files. Serve the folder instead:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Refresh the data

```bash
python3 tools/build-data.py                # downloads https://www.rfc-editor.org/rfc-index.xml
python3 tools/build-assets.py              # only if icons or status glyphs change
```

`build-data.py` writes `data/rfc-index.json` (every RFC, compact, ~570 KB gzipped) and `data/abstracts.json`
(abstracts, loaded lazily for deeper search). `data/notes.json` (Crock’s notes) is edited directly; the build script leaves it alone.

## What’s real

| | |
|---|---|
| Index | All 9,842 RFCs from the official `rfc-index.xml`: titles, authors, dates, status, stream, working group, obsoletes / updates, STD / BCP / FYI, errata, formats |
| Documents | The canonical `.txt` is fetched from `rfc-editor.org/rfc/rfcNNNN.txt` and shown byte for byte. The SHA-256 in the sheet footer is computed from the fetched file |
| Search | Number jump (`9110`, `rfc 2616`), sub-series (`STD 97`, `BCP 14`), years (`1999`), and ranked text search over titles, keywords, authors, working groups and abstracts. It’s deterministic, with no model |
| Ask Crock | The archivist, named for Steve Crocker, who wrote RFC 1. Its pointers are built only from relations recorded in the index: what replaced an RFC, what updates it, what was published alongside it (same working group and month), and its STD/BCP siblings. It shows up on RFC pages, and in search as questions the index can answer (“What replaced RFC 2616?”) |
| Crock’s notes | For 62 well-known RFCs, a short plain-language note above the sheet: why it was written and where it made a difference (`data/notes.json`). The notes are drafts written with AI assistance for this prototype, labelled as such, and need an editor’s review. Every other RFC gets a friendly line built from the index in the Crock panel |
| Lineage | Obsoletes / obsoleted-by chains (e.g. 2068 → 2616 → 7231 → 9110) |
| Timeline | “Year by year”: a dot for every 20 RFCs, from real per-year counts (1968–2026, peak 459 in 2006); dots a filter hides go faint |

Links in the Learn, Contribute and About menus go to the real pages on rfc-editor.org and ietf.org, or to RFCs inside the prototype
(RFC 1, 2119, 7322, 9920).

## Breakpoints

| Width | Layout |
|---|---|
| ≥ 1200 | Three columns: margins 40 · rail 216 · gutter 64 · centre 800 · gutter 64 · rail 216 |
| 1024–1199 | Filters move into a drawer (the “Filters” chip), era chips appear, the timeline becomes a slim minimap |
| 768–1023 | One column with a timeline strip; Browse/Learn/Contribute/About move into the Menu sheet |
| < 768 | Search first, swipeable era chips, compact rows (number joins the meta line), filters in a bottom sheet, a horizontal era scrubber under the nav, full-screen search |

Document pages use the Figma document grid (rails 272 · centre 752). Below 1200px the contents list moves into the sticky
document bar’s “Contents” menu, and below 1024px the facts, lineage and Ask Crock move under the sheet. The RFC text is never
reflowed: its 72 columns scale to fit a narrow sheet, and on phones “Actual size” keeps 14px and scrolls sideways.

## Keyboard

`⌘K` / `Ctrl K` or `/` to search from anywhere · `↑ ↓` move · `↵` open · `Esc` close · arrow keys on the timeline walk year by year.

## Files

```
index.html          page shell, icon sprite (generated), sheets
assets/tokens.css   Figma variables as CSS custom properties (light + dark)
assets/glyphs.css   status glyphs as masks (generated)
assets/app.css      components and breakpoints
assets/app.js       boot + hash router (#/rfc/9110, #/year/1999, #/era/web, #/search/email, #/kind/B, #/stream/IRTF, #/errata)
assets/data.js      index model, formatting, lineage, related list, citations
assets/search.js    ranking
assets/searchui.js  dropdown (≥768) and full-screen search (phones)
assets/indexview.js the landing index, filters, timeline, era scrubber
assets/timeline.js  the right-rail timeline (dots, year by year)
assets/docview.js   RFC pages
assets/ui.js        theme, menus, sheets, toasts
tools/              data + asset build scripts
```
