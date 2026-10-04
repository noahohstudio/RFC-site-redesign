# RFC Editor redesign — responsive prototype

An unofficial, hi-fi prototype of the RFC Editor redesign (design system v1.0, “Ledger, warm”; Figma file `d4ODFIKoRq0pxCiRKuAPNm`).
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
| Minimap | Year by year from real per-year counts (1968–2026, peak 459 in 2006): equal dots in era colours, each worth the same number of RFCs (the key says how many); dots a filter hides go faint |

Links in the Learn, Contribute and About menus go to the real pages on rfc-editor.org and ietf.org, or to RFCs inside the prototype
(RFC 1, 2119, 7322, 9920).

## Breakpoints

One hairline frame, up to 1440 wide, is shared by the header, the page and the footer.

| Width | Layout |
|---|---|
| ≥ 1200 | Left rail 280 (where you are, eras, kinds of RFC) · the shelves · a 64px minimap. The header's search fills the span between the menus |
| 1024–1199 | The rail folds into a Filters drawer and era chips; the minimap stays |
| 768–1023 | Browse/Learn/Contribute/About move into the Menu sheet; the header's field opens a full-screen search |
| < 768 | A search bar under the header, compact rows (the number joins the detail line), filters in a bottom sheet, and an era scrubber under the nav with Back to top |

RFC pages use contents 280 · the document · an aside 320 (facts and Ask Crock); the header's Contribute, About and theme
cells span exactly that aside. Below 1200px the contents move into the sticky document bar's “Contents” menu, and below
1024px the facts, lineage and Ask Crock move under the sheet. The RFC text is never reflowed: its 72 columns scale to fit
a narrow sheet, and on phones “Actual size” keeps 14px and scrolls sideways.

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
assets/searchui.js  the header's search field and results (≥1024), full-screen search (tablets and phones)
assets/indexview.js the landing index: left rail, shelves, filters, era scrubber
assets/timeline.js  the minimap (equal dots, year by year)
assets/docview.js   RFC pages
assets/menus.js     what's inside the Browse, Learn, Contribute and About menus
assets/ui.js        theme, menus, sheets, edge fades
assets/perf.js      the ?perf frame meter
tools/              data + asset build scripts
```
