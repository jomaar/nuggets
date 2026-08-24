#!/usr/bin/env python3
"""Extract a PDF's text as structured Markdown (headings, lists, tables).

Invoked as a short-lived subprocess by lib/pdfToMarkdown.ts — never long-running,
never listening on a port. The contract with the caller is deliberately narrow:

  * argv:   <pdf-path> [--max-chars N]
  * stdout: exactly ONE JSON object, nothing else
  * stderr: free-form (MuPDF warns there); only ever surfaced in server logs
  * exit:   0 = handled (read `ok`), anything else = crashed, stdout unusable

Errors the user can act on (encrypted file, not a PDF) come back as
`{"ok": false, ...}` with exit 0, so the route can show a real message instead
of a generic 502.
"""

import argparse
import json
import re
import sys

# Same cap the other importers use (/api/extract, lib/googleDrive.ts): a nugget
# is a note, not a book, and the AI revision downstream pays per character.
DEFAULT_MAX_CHARS = 100_000

_LIST_ITEM = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s")


def clean_markdown(md: str) -> str:
    """Tidy the raw conversion into something a human wants to read.

    pymupdf4llm is faithful to the PAGE, which on a text level shows up as
    artefacts a reader never saw: runs of blank lines where a column ended,
    trailing spaces from justified text, and — because headings are set in a
    bold font — every heading additionally wrapped in `**`. Structure itself
    (heading levels, lists, tables) is never touched; that is the part we asked
    pymupdf4llm for.
    """
    md = md.replace("\r\n", "\n").replace("\r", "\n")
    # Trailing whitespace, but keep Markdown's two-space hard line break intact.
    md = re.sub(r"[ \t]+$", "", md, flags=re.MULTILINE)
    # `## **Titel**` → `## Titel` (only when the bold spans the whole heading —
    # a heading with one bolded word inside keeps it).
    md = re.sub(r"^(#{1,6} )\*\*(.+?)\*\*$", r"\1\2", md, flags=re.MULTILINE)
    # Collapse 3+ blank lines to one blank line.
    md = re.sub(r"\n{3,}", "\n\n", md)
    return tighten_lists(md.strip())


def tighten_lists(md: str) -> str:
    """Drop blank lines BETWEEN consecutive list items.

    pymupdf4llm separates every bullet by a blank line, which Markdown reads as
    a "loose" list and renders with a `<p>` inside each `<li>` — visibly airier
    than the same list typed by hand. Only blank lines with a list item on both
    sides go; a blank line before or after the list is structural and stays.
    """
    lines = md.split("\n")
    out: list[str] = []
    for i, line in enumerate(lines):
        if (
            line.strip() == ""
            and out
            and _LIST_ITEM.match(out[-1])
            and i + 1 < len(lines)
            and _LIST_ITEM.match(lines[i + 1])
        ):
            continue
        out.append(line)
    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description="PDF → structured Markdown")
    parser.add_argument("path", help="path to the PDF file")
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS)
    args = parser.parse_args()

    # Imported late so an --help / argv error does not pay the ~1 s import cost.
    import pymupdf
    import pymupdf4llm

    try:
        doc = pymupdf.open(args.path)
    except Exception as exc:  # noqa: BLE001 — any open failure means "not a usable PDF"
        print(json.dumps({"ok": False, "error": "not_a_pdf", "detail": str(exc)}))
        return 0

    try:
        # A password-protected file opens fine but yields empty pages, which
        # would look like "PDF without text" — name the real cause instead.
        if doc.needs_pass:
            print(json.dumps({"ok": False, "error": "encrypted"}))
            return 0

        page_count = doc.page_count
        title = (doc.metadata or {}).get("title") or ""

        markdown = pymupdf4llm.to_markdown(
            doc,
            # Nugget content is deliberately image-free (PLAN.md TODO 5), and
            # embedded images would arrive as base64 data: URIs — the exact
            # ballast cleanExportedMarkdown strips on the Google Docs path.
            ignore_images=True,
            write_images=False,
            embed_images=False,
            # Graphics stay ON: table borders ARE vector graphics, and dropping
            # them costs the table detection that makes this better than a
            # plain text dump.
            table_strategy="lines_strict",
            show_progress=False,
        )
    except Exception as exc:  # noqa: BLE001 — report, don't traceback into stdout
        print(json.dumps({"ok": False, "error": "conversion_failed", "detail": str(exc)}))
        return 0
    finally:
        doc.close()

    markdown = clean_markdown(markdown)
    truncated = len(markdown) > args.max_chars
    if truncated:
        markdown = markdown[: args.max_chars]

    print(json.dumps({
        "ok": True,
        "markdown": markdown,
        "pages": page_count,
        "chars": len(markdown),
        "truncated": truncated,
        "title": title.strip(),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
