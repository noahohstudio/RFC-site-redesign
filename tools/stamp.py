#!/usr/bin/env python3
"""Stamp a build before committing, so every deploy is fetched fresh.

GitHub Pages lets browsers reuse files for up to 10 minutes, and an open tab keeps
running the code it loaded. This script gives each build a stamp and puts it:

  - in index.html: <meta name="build">, ?v=STAMP on the stylesheets, the app script and
    the index preload, and an import map that adds ?v=STAMP to every module in assets/
  - in data/version.json, which open tabs check to offer a reload when a newer build is live

Run it from the prototype folder before each commit:  python3 tools/stamp.py
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')
html_path = root / 'index.html'
html = html_path.read_text(encoding='utf-8')

# 1. the build meta
meta = f'<meta name="build" content="{stamp}">'
if '<meta name="build"' in html:
    html = re.sub(r'<meta name="build" content="[^"]*">', meta, html)
else:
    html = html.replace('<meta name="theme-color"', f'{meta}\n  <meta name="theme-color"', 1)

# 2. versioned stylesheets, app script and the index preload
html = re.sub(r'(href="assets/[\w-]+\.css)(\?v=[^"]*)?"', rf'\1?v={stamp}"', html)
html = re.sub(r'(src="assets/app\.js)(\?v=[^"]*)?"', rf'\1?v={stamp}"', html)
html = re.sub(r'(href="data/rfc-index\.json)(\?v=[^"]*)?"', rf'\1?v={stamp}"', html)

# 3. an import map that versions every module
modules = sorted(p.name for p in (root / 'assets').glob('*.js'))
imports = {f'./assets/{m}': f'./assets/{m}?v={stamp}' for m in modules}
importmap = '<script type="importmap">' + json.dumps({'imports': imports}, separators=(',', ':')) + '</script>'
if '<script type="importmap">' in html:
    html = re.sub(r'<script type="importmap">.*?</script>', importmap, html, flags=re.S)
else:
    html = html.replace('<script type="module"', f'{importmap}\n  <script type="module"', 1)

html_path.write_text(html, encoding='utf-8')
(root / 'data' / 'version.json').write_text(json.dumps({'build': stamp}) + '\n', encoding='utf-8')
print(f'stamped build {stamp} ({len(modules)} modules)')
