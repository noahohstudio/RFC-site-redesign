#!/usr/bin/env python3
"""Build the prototype's data files from the official RFC index.

    python3 tools/build-data.py                 # downloads rfc-index.xml
    python3 tools/build-data.py path/to/rfc-index.xml

Writes:
    data/rfc-index.json   every published RFC, compact (loaded on start)
    data/abstracts.json   abstracts in the same order (loaded lazily, search only)

Source: https://www.rfc-editor.org/rfc-index.xml — nothing here is edited or
summarised; fields are only shortened so the browser loads them quickly.
"""
import datetime
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET

INDEX_URL = "https://www.rfc-editor.org/rfc-index.xml"
NS = {"r": "https://www.rfc-editor.org/rfc-index"}
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data")

STATUS = {
    "INTERNET STANDARD": "I",
    "DRAFT STANDARD": "D",
    "PROPOSED STANDARD": "P",
    "BEST CURRENT PRACTICE": "B",
    "INFORMATIONAL": "N",
    "EXPERIMENTAL": "E",
    "HISTORIC": "H",
    "UNKNOWN": "U",
}
STREAM = {"IETF": "IETF", "IAB": "IAB", "IRTF": "IRTF", "INDEPENDENT": "Independent",
          "Legacy": "Legacy", "Editorial": "Editorial"}
FORMAT_BITS = {"TXT": 1, "ASCII": 1, "HTML": 2, "PDF": 4, "XML": 8, "PS": 16}
MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def text(el, path):
    node = el.find(path, NS)
    return node.text.strip() if node is not None and node.text else ""


def ids(el, path):
    out = []
    for d in el.findall(path, NS):
        if d.text and d.text.startswith("RFC"):
            out.append(int(d.text[3:]))
    return out


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if src:
        root = ET.parse(src).getroot()
    else:
        print("Downloading", INDEX_URL)
        with urllib.request.urlopen(INDEX_URL) as r:
            root = ET.fromstring(r.read())

    rfcs, abstracts = [], []
    entries = sorted(root.findall("r:rfc-entry", NS), key=lambda e: int(text(e, "r:doc-id")[3:]))
    for e in entries:
        n = int(text(e, "r:doc-id")[3:])
        authors = []
        for a in e.findall("r:author", NS):
            name = text(a, "r:name")
            if not name:
                continue
            authors.append(name + ("*" if text(a, "r:title") == "Editor" else ""))
        month = MONTHS.index(text(e, "r:date/r:month")) + 1
        year = int(text(e, "r:date/r:year"))
        wg = text(e, "r:wg_acronym")
        if wg.upper() == "NON WORKING GROUP":
            wg = ""
        fmt = 0
        for f in e.findall("r:format/r:file-format", NS):
            fmt |= FORMAT_BITS.get(f.text, 0)
        pages = text(e, "r:page-count")
        rfcs.append([
            n,
            text(e, "r:title"),
            "|".join(authors),
            year * 100 + month,
            STATUS[text(e, "r:current-status")],
            STATUS[text(e, "r:publication-status")],
            STREAM.get(text(e, "r:stream"), text(e, "r:stream")),
            wg,
            1 if e.find("r:errata-url", NS) is not None else 0,
            ids(e, "r:obsoletes/r:doc-id"),
            ids(e, "r:obsoleted-by/r:doc-id"),
            ids(e, "r:updates/r:doc-id"),
            ids(e, "r:updated-by/r:doc-id"),
            [d.text for d in e.findall("r:is-also/r:doc-id", NS)],
            int(pages) if pages.isdigit() else 0,
            "|".join(k.text.strip() for k in e.findall("r:keywords/r:kw", NS) if k.text),
            fmt,
            text(e, "r:area"),
        ])
        abstracts.append(" ".join((p.text or "").strip() for p in e.findall("r:abstract/r:p", NS)).strip())

    not_issued = sorted(int(text(e, "r:doc-id")[3:]) for e in root.findall("r:rfc-not-issued-entry", NS))
    meta = {
        "v": 1,
        "generated": datetime.date.today().isoformat(),
        "source": INDEX_URL,
        "fields": ["n", "title", "authors", "ym", "status", "pubStatus", "stream", "wg", "errata",
                   "obsoletes", "obsoletedBy", "updates", "updatedBy", "also", "pages", "keywords",
                   "formats", "area"],
        "notIssued": not_issued,
        "rfcs": rfcs,
    }
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "rfc-index.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "abstracts.json"), "w", encoding="utf-8") as f:
        json.dump({"v": 1, "abstracts": abstracts}, f, ensure_ascii=False, separators=(",", ":"))
    newest = max(rfcs, key=lambda r: r[0])
    print(f"{len(rfcs)} RFCs, newest RFC {newest[0]} ({newest[1]}), {len(not_issued)} numbers never issued")


if __name__ == "__main__":
    main()
