#!/usr/bin/env python3
"""Generate the icon sprite and status-glyph CSS from the Figma vectors.

    python3 tools/build-assets.py

- Injects an inline <svg> sprite into index.html between the
  <!-- sprite:start --> and <!-- sprite:end --> markers (icons use currentColor).
- Writes assets/glyphs.css: one mask per status glyph, so index rows draw the
  glyph with a pseudo-element instead of an SVG node per row.

Vectors are copied verbatim from the Figma file (Icon/* components, 24px grid,
1.5px stroke; Status component glyphs, 12px).
"""
import os
import re
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")

# name: list of (d, mode) — mode "s" = 1.5px square-cap stroke, "r" = round stroke, "f" = fill
ICONS = {
    "arrow-down": [("M12 4V19M18 13L12 19L6 13", "s")],
    "arrow-up": [("M12 20V5M18 11L12 5L6 11", "s")],
    "arrow-right": [("M4 12H19M13 18L19 12L13 6", "s")],
    "arrow-left": [("M20 12H5M11 18L5 12L11 6", "s")],
    "arrow-up-right": [("M7 17L17 7M17 16V7H8", "s")],
    "chevron-down": [("M6 9L12 15L18 9", "s")],
    "chevron-up": [("M6 15L12 9L18 15", "s")],
    "chevron-right": [("M9 6L15 12L9 18", "s")],
    "menu": [("M4 7H20M4 12H20M4 17H20", "s")],
    "close": [("M6 6L18 18M18 6L6 18", "s")],
    "plus": [("M12 5V19M5 12H19", "s")],
    "minus": [("M5 12H19", "s")],
    "check": [("M5 12.5L10 17.5L19 7", "s")],
    "search": [("M15.5 15.5L20 20M17 11C17 14.3137 14.3137 17 11 17C7.68629 17 5 14.3137 5 11C5 7.68629 7.68629 5 11 5C14.3137 5 17 7.68629 17 11Z", "s")],
    "enter": [("M19 5V12C19 13.66 17.66 15 16 15H6M10 19L6 15L10 11", "s")],
    "copy": [("M5 16V5H16M8 8H19V19H8V8Z", "s")],
    "hash": [("M10 4L8 20M16 4L14 20M5 9H20M4 15H19", "s")],
    "document": [("M18 7L14 3H6V21H18V7ZM14 3V7H18M9 12H15M9 16H15", "s")],
    "list": [("M9 7H20M9 12H20M9 17H20M4 7H5M4 12H5M4 17H5", "s")],
    "filter": [("M4 7H13.75M13.75 7C13.75 8.24264 14.7574 9.25 16 9.25C17.2426 9.25 18.25 8.24264 18.25 7M13.75 7C13.75 5.75736 14.7574 4.75 16 4.75C17.2426 4.75 18.25 5.75736 18.25 7M18.25 7H20M4 17H5.75M5.75 17C5.75 18.2426 6.75736 19.25 8 19.25C9.24264 19.25 10.25 18.2426 10.25 17M5.75 17C5.75 15.7574 6.75736 14.75 8 14.75C9.24264 14.75 10.25 15.7574 10.25 17M10.25 17H20", "s")],
    "bookmark": [("M7 4H17V20L12 16L7 20V4Z", "s")],
    "download": [("M12 4V15M17 10L12 15L7 10M5 20H19", "s")],
    "history": [("M4 12C4.00146 13.8507 4.64457 15.6438 5.81976 17.0735C6.99496 18.5033 8.62953 19.4814 10.445 19.8411C12.2605 20.2009 14.1445 19.92 15.7761 19.0464C17.4077 18.1728 18.686 16.7606 19.3931 15.0502C20.1002 13.3398 20.1924 11.4372 19.654 9.6665C19.1156 7.89578 17.98 6.3665 16.4405 5.33921C14.901 4.31193 13.053 3.85019 11.2112 4.03268C9.36946 4.21516 7.64796 5.03057 6.34 6.33999L4 8.49999M8.5 8.49999L4 8.49999V3.99999M12 7.99999V12L15 14", "s")],
    "info": [("M12 11V16M12 7.75V8.25M20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12Z", "s")],
    "contrast": [("M12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20Z", "s"),
                 ("M12 4C14.1217 4 16.1566 4.84285 17.6569 6.34315C19.1571 7.84344 20 9.87827 20 12C20 14.1217 19.1571 16.1566 17.6569 17.6569C16.1566 19.1571 14.1217 20 12 20V4Z", "f")],
    "compass": [("M12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20Z", "s"),
                ("M14.8 9.2L13.2 13.2L9.2 14.8L10.8 10.8L14.8 9.2Z", "s")],
    "layers": [("M4 12.25L12 16.75L20 12.25M4 16L12 20.5L20 16M12 4L20 8.5L12 13L4 8.5L12 4Z", "s")],
    "book": [("M12 20C14 18.5 17 18 20 18.5V5C17 4.5 14 5 12 6.5C10 5 7 4.5 4 5V18.5C7 18 10 18.5 12 20ZM12 6.5V20", "s")],
    "lineage": [("M7.25 12C7.25 13.2426 6.24264 14.25 5 14.25C3.75736 14.25 2.75 13.2426 2.75 12C2.75 10.7574 3.75736 9.75 5 9.75C6.24264 9.75 7.25 10.7574 7.25 12ZM7.25 12H9.75M14.25 12C14.25 13.2426 13.2426 14.25 12 14.25C10.7574 14.25 9.75 13.2426 9.75 12M14.25 12C14.25 10.7574 13.2426 9.75 12 9.75C10.7574 9.75 9.75 10.7574 9.75 12M14.25 12H16.75M16.75 12C16.75 13.2426 17.7574 14.25 19 14.25C20.2426 14.25 21.25 13.2426 21.25 12C21.25 10.7574 20.2426 9.75 19 9.75C17.7574 9.75 16.75 10.7574 16.75 12Z", "s")],
    "pen": [("M13.5 7L17 10.5M4.5 19.5L5.5 15L15.5 5L19 8.5L9 18.5L4.5 19.5Z", "s")],
    "inbox": [("M20 13V19H4V13L6.5 5.5H17.5L20 13ZM4 13H8.5L10 15.5H14L15.5 13H20", "s")],
    "help": [("M9.75 9.75C9.75 8.5 10.8 7.5 12 7.5C13.2 7.5 14.25 8.4 14.25 9.6C14.25 11.2 12 11.5 12 13.25M12 16V16.5M20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12Z", "s")],
    "mail": [("M3.5 6.5L12 13L20.5 6.5M3.5 6H20.5V18H3.5V6Z", "s")],
    "lock": [("M8 11V8C8 5.8 9.8 4 12 4C14.2 4 16 5.8 16 8V11M5 11H19V20H5V11Z", "s")],
    "calendar": [("M4 10H20M8.5 3.5V7M15.5 3.5V7M4 5.5H20V20H4V5.5Z", "s")],
    "user": [("M5 20C5.8 16.5 8.6 14.5 12 14.5C15.4 14.5 18.2 16.5 19 20M15.5 8.5C15.5 10.433 13.933 12 12 12C10.067 12 8.5 10.433 8.5 8.5C8.5 6.567 10.067 5 12 5C13.933 5 15.5 6.567 15.5 8.5Z", "s")],
    "rss": [("M5 11C7.12173 11 9.15656 11.8429 10.6569 13.3431C12.1571 14.8434 13 16.8783 13 19M5 5C8.71303 5 12.274 6.475 14.8995 9.1005C17.525 11.726 19 15.287 19 19M7.25 18C7.25 18.6904 6.69036 19.25 6 19.25C5.30964 19.25 4.75 18.6904 4.75 18C4.75 17.3096 5.30964 16.75 6 16.75C6.69036 16.75 7.25 17.3096 7.25 18Z", "s")],
    "flag": [("M5 21V4H17L15 8L17 12H5", "s")],
    "sort": [("M8 5V19M11.5 15.5L8 19L4.5 15.5M16 19V5M19.5 8.5L16 5L12.5 8.5", "s")],
    "sparkle": [("M12 4C12.9 9 15 11.1 20 12C15 12.9 12.9 15 12 20C11.1 15 9 12.9 4 12C9 11.1 11.1 9 12 4Z", "r")],
}

# Status glyphs, 12px box. Codes: I Internet Standard, D Draft, P Proposed,
# B Best Current Practice, N Informational, E Experimental, H Historic, U Unknown.
# A trailing "o" = obsoleted (hollow).
CIRCLE = "M5.99998 10.4001C8.43003 10.4001 10.4 8.43015 10.4 6.0001C10.4 3.57004 8.43003 1.6001 5.99998 1.6001C3.56992 1.6001 1.59998 3.57004 1.59998 6.0001C1.59998 8.43015 3.56992 10.4001 5.99998 10.4001Z"
HOLLOW = f'<path d="{CIRCLE}" stroke="#000" stroke-width="1.2"/>'
GLYPHS = {
    "I": '<path d="M6 11C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6C1 8.76142 3.23858 11 6 11Z" fill="#000"/>',
    "Io": HOLLOW,
    "P": HOLLOW + '<path d="M5.99998 1.6001C4.83302 1.6001 3.71387 2.06367 2.88871 2.88883C2.06355 3.71399 1.59998 4.83315 1.59998 6.0001C1.59998 7.16705 2.06355 8.28621 2.88871 9.11137C3.71387 9.93653 4.83302 10.4001 5.99998 10.4001V1.6001Z" fill="#000"/>',
    "Po": HOLLOW,
    "D": HOLLOW + '<path d="M5.99998 6.0001V1.6001C5.12974 1.6001 4.27904 1.85815 3.55547 2.34163C2.83189 2.82511 2.26793 3.5123 1.93491 4.31629C1.60188 5.12029 1.51475 6.00498 1.68452 6.8585C1.8543 7.71201 2.27336 8.49602 2.88871 9.11137C3.50406 9.72672 4.28806 10.1458 5.14158 10.3156C5.9951 10.4853 6.87979 10.3982 7.68378 10.0652C8.48778 9.73214 9.17497 9.16818 9.65844 8.44461C10.1419 7.72103 10.4 6.87034 10.4 6.0001H5.99998Z" fill="#000"/>',
    "Do": HOLLOW,
    "B": '<path d="M10.5 1.5H1.5V10.5H10.5V1.5Z" fill="#000"/>',
    "Bo": '<path d="M10 2H2V10H10V2Z" stroke="#000" stroke-width="1.2"/>',
    "N": '<path d="M5.99998 0.600098L11.4 6.0001L5.99998 11.4001L0.599976 6.0001L5.99998 0.600098Z" fill="#000"/>',
    "No": '<path d="M5.99999 1.2998L10.7 5.9998L5.99999 10.6998L1.29999 5.9998L5.99999 1.2998Z" stroke="#000" stroke-width="1.2"/>',
    "E": '<path d="M6 1L11.5 10.6H0.5L6 1Z" fill="#000"/>',
    "Eo": '<path d="M6.00002 2L10.6 10H1.40002L6.00002 2Z" stroke="#000" stroke-width="1.2"/>',
    "H": '<path d="M2.20001 2.2002L9.80001 9.8002M9.80001 2.2002L2.20001 9.8002" stroke="#000" stroke-width="1.5"/>',
    "Ho": '<path d="M2.20001 2.2002L9.80001 9.8002M9.80001 2.2002L2.20001 9.8002" stroke="#000" stroke-width="1.5"/>',
    "U": f'<path d="{CIRCLE}" stroke="#000" stroke-width="1.5" stroke-dasharray="1.6 1.6"/>',
    "Uo": f'<path d="{CIRCLE}" stroke="#000" stroke-width="1.5" stroke-dasharray="1.6 1.6"/>',
}


def icon_symbol(name, parts):
    paths = []
    for d, mode in parts:
        if mode == "f":
            paths.append(f'<path d="{d}" fill="currentColor"/>')
        elif mode == "r":
            paths.append(f'<path d="{d}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>')
        else:
            paths.append(f'<path d="{d}" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" fill="none"/>')
    return f'<symbol id="i-{name}" viewBox="0 0 24 24">{"".join(paths)}</symbol>'


def glyph_symbol(code, inner):
    inner = inner.replace('fill="#000"', 'fill="currentColor"').replace('stroke="#000"', 'stroke="currentColor"')
    return f'<symbol id="g-{code}" viewBox="0 0 12 12" fill="none">{inner}</symbol>'


def main():
    sprite = ['<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>']
    sprite += [icon_symbol(k, v) for k, v in ICONS.items()]
    sprite += [glyph_symbol(k, v) for k, v in GLYPHS.items()]
    sprite.append("</defs></svg>")
    sprite_markup = "\n".join(sprite)

    html_path = os.path.join(ROOT, "index.html")
    with open(html_path, encoding="utf-8") as f:
        html = f.read()
    html, count = re.subn(r"(<!-- sprite:start -->).*?(<!-- sprite:end -->)",
                          lambda m: m.group(1) + "\n" + sprite_markup + "\n" + m.group(2), html, flags=re.S)
    if count != 1:
        raise SystemExit("sprite markers not found in index.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)

    css = ["/* Generated by tools/build-assets.py — status glyphs as masks (Figma Status component). */"]
    for code, inner in GLYPHS.items():
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none">{inner}</svg>'
        uri = "data:image/svg+xml," + urllib.parse.quote(svg, safe="")
        css.append(f'.gl-{code}{{--glyph:url("{uri}")}}')
    with open(os.path.join(ROOT, "assets", "glyphs.css"), "w", encoding="utf-8") as f:
        f.write("\n".join(css) + "\n")
    print(f"sprite: {len(ICONS)} icons + {len(GLYPHS)} glyphs; glyphs.css written")


if __name__ == "__main__":
    main()
